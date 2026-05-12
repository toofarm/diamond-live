import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const head = Bricolage_Grotesque({
  variable: "--ff-head",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

const ui = IBM_Plex_Sans({
  variable: "--ff-ui",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const mono = IBM_Plex_Mono({
  variable: "--ff-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Diamond·Live",
  description: "Live MLB scores, standings, and stats.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#F1ECE3",
};

/**
 * Pre-hydration boot script: reads the saved user profile out of localStorage
 * and applies `data-theme="twilight"` to <html> before the page paints. Without
 * this, returning twilight users would see a flash of the light theme between
 * SSR and the first client effect.
 */
const THEME_BOOT_SCRIPT = `
try {
  var raw = localStorage.getItem('dl_user');
  if (raw) {
    var p = JSON.parse(raw);
    if (p && p.prefs && p.prefs.theme === 'twilight') {
      document.documentElement.setAttribute('data-theme', 'twilight');
    }
  }
} catch (e) {}
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${head.variable} ${ui.variable} ${mono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
