import type { NextConfig } from "next";
import nextPWA from "next-pwa";

const isCapacitorBuild = process.env.CAPACITOR_BUILD === "1";

const withPWA = nextPWA({
  dest: "public",
  disable: process.env.NODE_ENV === "development" || isCapacitorBuild,
  reloadOnOnline: true,
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
