import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Origins used by Capacitor / embedded WebViews when the UI is bundled locally. */
const CAPACITOR_ORIGIN_PREFIXES = [
  "https://localhost",
  "http://localhost",
  "capacitor://localhost",
  "ionic://localhost",
];

function isCapacitorOrigin(origin: string) {
  if (!origin) return false;
  return CAPACITOR_ORIGIN_PREFIXES.some((prefix) => origin === prefix || origin.startsWith(`${prefix}:`));
}

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Requested-With",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const origin = request.headers.get("origin") || "";
  if (!isCapacitorOrigin(origin)) {
    return NextResponse.next();
  }

  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
  }

  const response = NextResponse.next();
  for (const [key, value] of Object.entries(corsHeaders(origin))) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
