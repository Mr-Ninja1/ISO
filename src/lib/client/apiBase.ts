"use client";

function trimTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function getApiBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (configured) return trimTrailingSlash(configured);
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

export function apiUrl(pathname: string) {
  const base = getApiBaseUrl();
  if (!base) return pathname;
  return new URL(pathname, base).toString();
}