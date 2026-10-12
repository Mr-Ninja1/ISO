const OTA_REQUEST_TIMEOUT_MS = 15_000;

/** Bound remote manifest/config requests so an offline socket cannot hang OTA checks. */
export async function fetchOta(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), OTA_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("The update server did not respond in time. Check your connection and try again.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}
