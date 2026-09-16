/** Shared validation for AI form document import (PDF / JPG / PNG). */

export const MAX_SOURCE_DOCUMENT_BYTES = 10 * 1024 * 1024;

export const SUPPORTED_SOURCE_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;

export type SupportedSourceMimeType = (typeof SUPPORTED_SOURCE_MIME_TYPES)[number];

const EXTENSION_TO_MIME: Record<string, SupportedSourceMimeType> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

const MIME_ALIASES: Record<string, SupportedSourceMimeType> = {
  "application/pdf": "application/pdf",
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/png": "image/png",
};

export const SOURCE_DOCUMENT_ACCEPT = "application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png";

export type SourceDocumentValidation =
  | { ok: true; mimeType: SupportedSourceMimeType }
  | { ok: false; error: string };

function extensionOf(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  if (idx < 0) return "";
  return fileName.slice(idx).toLowerCase();
}

export function resolveSourceMimeType(file: {
  name?: string;
  type?: string;
}): SupportedSourceMimeType | null {
  const rawType = String(file.type || "")
    .trim()
    .toLowerCase();
  if (rawType && MIME_ALIASES[rawType]) return MIME_ALIASES[rawType];

  const ext = extensionOf(String(file.name || ""));
  if (ext && EXTENSION_TO_MIME[ext]) return EXTENSION_TO_MIME[ext];

  return null;
}

export function isSupportedSourceDocument(file: {
  name?: string;
  type?: string;
}): boolean {
  return resolveSourceMimeType(file) !== null;
}

export function validateSourceDocument(file: {
  name?: string;
  type?: string;
  size?: number;
}): SourceDocumentValidation {
  const size = typeof file.size === "number" ? file.size : 0;
  if (size <= 0) {
    return { ok: false, error: "The uploaded file is empty. Choose a PDF, JPG, or PNG and try again." };
  }
  if (size > MAX_SOURCE_DOCUMENT_BYTES) {
    return {
      ok: false,
      error: "Document must be 10 MB or smaller. Compress the file or use a smaller PDF/image.",
    };
  }

  const mimeType = resolveSourceMimeType(file);
  if (!mimeType) {
    return {
      ok: false,
      error: "Unsupported file type. Upload a PDF, JPG, or PNG document.",
    };
  }

  return { ok: true, mimeType };
}
