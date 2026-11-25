import type { NextConfig } from "next";
import nextPWA from "next-pwa";
import defaultCache from "next-pwa/cache";

const isCapacitorBuild = process.env.CAPACITOR_BUILD === "1";

/** API responses can include user or brand data and must not enter the shared SW cache. */
const runtimeCaching = defaultCache.map((entry) => {
  if (entry.options?.cacheName !== "apis") return entry;
  const prev = entry.urlPattern;
  return {
    ...entry,
    urlPattern: ({ url }: { url: URL }) => {
      if (url.pathname.startsWith("/api/")) return false;
      return typeof prev === "function" ? prev({ url }) : Boolean(prev.test(url.href));
    },
  };
});

runtimeCaching.unshift({
  urlPattern: /\/api\//i,
  handler: "NetworkOnly",
  method: "GET",
  // next-pwa assumes every runtimeCaching entry has options when injecting fallbacks
  options: {},
});

const withPWA = nextPWA({
  dest: "public",
  disable: process.env.NODE_ENV === "development" || isCapacitorBuild,
  // Reconnection should resume background sync without reloading the active form.
  reloadOnOnline: false,
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
