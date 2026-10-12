import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
};

/** Serve the packaged release manifest through the API CORS middleware for native WebViews. */
export async function GET() {
  try {
    const manifestPath = path.join(process.cwd(), "public", "ota", "production", "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
    const bundleId = typeof manifest.bundleId === "string" ? manifest.bundleId.trim() : "";
    const bundleUrl = typeof manifest.bundleUrl === "string" ? manifest.bundleUrl.trim() : "";

    if (!bundleId || !/^https:\/\//i.test(bundleUrl)) {
      return NextResponse.json(
        { error: "The deployed OTA manifest is invalid." },
        { status: 503, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(manifest, { headers: NO_STORE_HEADERS });
  } catch {
    return NextResponse.json(
      { error: "No deployed OTA manifest is available." },
      { status: 404, headers: NO_STORE_HEADERS }
    );
  }
}
