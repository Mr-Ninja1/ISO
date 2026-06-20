"use client";

import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";
import { PLATFORM_API_BASE_URL } from "@/lib/platform";

function trimTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function isLocalDevHost(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "10.0.2.2"
  );
}

export function getApiBaseUrl() {
  if (typeof window !== "undefined") {
    const { hostname, origin } = window.location;
    // npm run dev on localhost must always call the local Next server, even when
    // NEXT_PUBLIC_CAPACITOR_APP=1 and NEXT_PUBLIC_API_BASE_URL point at Azure.
    if (isLocalDevHost(hostname)) return origin;
    if (!isCapacitorNativeApp()) return origin;
  }

  const configured = process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || PLATFORM_API_BASE_URL;
  if (configured) return trimTrailingSlash(configured);
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

export function apiUrl(pathname: string) {
  const base = getApiBaseUrl();
  if (!base) return pathname;
  return new URL(pathname, base).toString();
}