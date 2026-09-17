import { resolveSourceMimeType } from "@/lib/ai/sourceDocument";

type GeminiPart = { text?: string; inline_data?: { mime_type: string; data: string } };

type GenerateContentOptions = {
  parts: GeminiPart[];
  json?: boolean;
  temperature?: number;
  systemInstruction?: string;
};

function getGeminiApiKeys() {
  const primary = (process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || "").trim();
  const secondary = (process.env.GEMINI_API_KEYS || "").trim();
  const all = [primary, ...secondary.split(",")]
    .map((key) => key.trim())
    .filter(Boolean);
  return [...new Set(all)];
}

function getGeminiModels() {
  const configured = (process.env.GEMINI_MODELS || process.env.GEMINI_MODEL || "gemini-2.0-flash").trim();
  return configured
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean)
    .length
    ? configured
        .split(",")
        .map((model) => model.trim())
        .filter(Boolean)
    : ["gemini-2.0-flash"];
}

function getGeminiConfig() {
  const keys = getGeminiApiKeys();
  const models = getGeminiModels();
  return { apiKeys: keys, model: models[0] || "gemini-2.0-flash", models };
}

export function isGeminiConfigured() {
  return getGeminiApiKeys().length > 0;
}

export function getGeminiModelName() {
  return getGeminiConfig().model;
}

function isTransientGeminiError(message: string) {
  return /429|resource exhausted|too many requests|temporar|high demand|try again later|overloaded|503|service unavailable|rate limit/i.test(message);
}

/** Google AI Studio keys use model id in the URL — there is no model picker on the key page. */
export async function geminiGenerateContent(options: GenerateContentOptions): Promise<string> {
  const { apiKeys, models } = getGeminiConfig();
  if (!apiKeys.length) {
    throw new Error(
      "Gemini is not configured. Set GEMINI_API_KEY or GEMINI_API_KEYS in .env.local (from Google AI Studio), and optionally configure GEMINI_MODELS for fallback model rotation.",
    );
  }

  let lastError: Error | null = null;

  for (const model of models) {
    for (const apiKey of apiKeys) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(options.systemInstruction
              ? { systemInstruction: { parts: [{ text: options.systemInstruction }] } }
              : {}),
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

          const err = new Error(message);
          lastError = err;
          if (isTransientGeminiError(message) || res.status === 429 || res.status === 503) {
            continue;
          }
          throw err;
        }

        const json = (await res.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
          error?: { message?: string };
        };

        if (json.error?.message) {
          const err = new Error(json.error.message);
          lastError = err;
          if (isTransientGeminiError(json.error.message)) continue;
          throw err;
        }

        const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
        if (!text.trim()) {
          const err = new Error("Gemini returned an empty response.");
          lastError = err;
          continue;
        }

        return text.trim();
      } catch (error) {
        const err = error instanceof Error ? error : new Error("Gemini request failed");
        lastError = err;
        if (isTransientGeminiError(err.message)) {
          continue;
        }
        throw err;
      }
    }
  }

  throw lastError ?? new Error("Gemini request failed");
}

export async function fileToBase64(file: File | Blob): Promise<{ mimeType: string; data: string }> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  const data = typeof Buffer !== "undefined" ? Buffer.from(bytes).toString("base64") : btoa(binary);
  const name = "name" in file && typeof file.name === "string" ? file.name : undefined;
  const resolved =
    resolveSourceMimeType({ name, type: file.type }) ||
    file.type ||
    "application/octet-stream";
  return { mimeType: resolved, data };
}
