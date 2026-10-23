import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Anytimer Tab",
    short_name: "Anytimers",
    description: "Track bets with your friends and who owes whom a 12 oz.",
    start_url: "/",
    display: "standalone",
    background_color: "#EEE8DD",
    theme_color: "#24190F",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
