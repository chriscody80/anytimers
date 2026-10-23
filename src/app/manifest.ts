import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Anytimer Tab",
    short_name: "Anytimers",
    description: "Track bets with your friends and who owes whom a 12 oz.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#EEE8DD",
    theme_color: "#24190F",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
