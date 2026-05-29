import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ISO Grid",
    short_name: "ISO Grid",
    description: "Offline-capable compliance platform for ISO-led operations.",
    id: "/workspace",
    start_url: "/workspace",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#f5efe6",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}

