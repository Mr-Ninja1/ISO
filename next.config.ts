import type { NextConfig } from "next";
import nextPWA from "next-pwa";
import defaultCache from "next-pwa/cache";

const isCapacitorBuild = process.env.CAPACITOR_BUILD === "1";

/** APK URL must never be served from the service-worker API cache (stale 404 links). */
const runtimeCaching = defaultCache.map((entry) => {
  if (entry.options?.cacheName !== "apis") return entry;
  const prev = entry.urlPattern;
  return {
    ...entry,
    urlPattern: ({ url }: { url: URL }) => {
      if (url.pathname === "/api/platform/client-config") return false;
      return typeof prev === "function" ? prev({ url }) : Boolean(prev.test(url.href));
    },
  };
});

runtimeCaching.unshift({
  urlPattern: /\/api\/platform\/client-config/i,
  handler: "NetworkOnly",
  method: "GET",
});

const withPWA = nextPWA({
  dest: "public",
  disable: process.env.NODE_ENV === "development" || isCapacitorBuild,
  reloadOnOnline: true,
  runtimeCaching,
  fallbacks: {
    document: "/offline",
  },
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: isCapacitorBuild ? "export" : "standalone",
  trailingSlash: isCapacitorBuild ? true : undefined,
  images: isCapacitorBuild ? { unoptimized: true } : undefined,
  /** Android emulator uses http://10.0.2.2:3000 — allow dev/HMR without silent webpack failures in embedded WebViews. */
  allowedDevOrigins: ["10.0.2.2"],
};

export default isCapacitorBuild ? nextConfig : withPWA(nextConfig);
