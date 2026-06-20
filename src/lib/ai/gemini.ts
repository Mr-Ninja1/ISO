type GeminiPart = { text?: string; inline_data?: { mime_type: string; data: string } };

type GenerateContentOptions = {
  parts: GeminiPart[];
  json?: boolean;
  temperature?: number;
};

function getGeminiConfig() {
  const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || "").trim();
  const model = (process.env.GEMINI_MODEL || "gemini-2.0-flash").trim();
  return { apiKey, model };
}

export function isGeminiConfigured() {
  return Boolean(getGeminiConfig().apiKey);
}

export function getGeminiModelName() {
  return getGeminiConfig().model;
}

/** Google AI Studio keys use model id in the URL — there is no model picker on the key page. */
export async function geminiGenerateContent(options: GenerateContentOptions): Promise<string> {
  const { apiKey, model } = getGeminiConfig();
  if (!apiKey) {
    throw new Error(
      "Gemini is not configured. Set GEMINI_API_KEY in .env.local (from Google AI Studio).",
    );
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: options.parts }],
      generationConfig: {
        temperature: options.temperature ?? 0.2,
        ...(options.json ? { responseMimeType: "application/json" } : {}),
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = text || `Gemini request failed (${res.status})`;
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } };
      if (parsed.error?.message) message = parsed.error.message;
    } catch {
      // keep raw text
    }
    throw new Error(message);
  }

  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    error?: { message?: string };
  };

  if (json.error?.message) throw new Error(json.error.message);

  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  if (!text.trim()) throw new Error("Gemini returned an empty response.");
  return text.trim();
}

export async function fileToBase64(file: File | Blob): Promise<{ mimeType: string; data: string }> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  const data = typeof Buffer !== "undefined" ? Buffer.from(bytes).toString("base64") : btoa(binary);
  return { mimeType: file.type || "application/octet-stream", data };
}
