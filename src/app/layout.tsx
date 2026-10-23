import type { Metadata, Viewport } from "next";
// Fonts are bundled with the app (no request to Google at runtime).
import "@fontsource/alfa-slab-one/latin-400.css";
import "@fontsource/archivo/latin-400.css";
import "@fontsource/archivo/latin-500.css";
import "@fontsource/archivo/latin-600.css";
import "@fontsource/archivo/latin-700.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/ibm-plex-mono/latin-600.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Anytimer Tab",
  description: "Track bets with your friends and who owes whom a 12 oz.",
  appleWebApp: { capable: true, title: "Anytimers", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#EEE8DD" },
    { media: "(prefers-color-scheme: dark)", color: "#15100B" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
