import type { NextConfig } from "next";
import nextPWA from "next-pwa";

const withPWA = nextPWA({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  reloadOnOnline: true,
  fallbacks: {
    document: "/offline",
  },
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  /** Android emulator uses http://10.0.2.2:3000 — allow dev/HMR without silent webpack failures in embedded WebViews. */
  allowedDevOrigins: ["10.0.2.2"],
};

export default withPWA(nextConfig);
