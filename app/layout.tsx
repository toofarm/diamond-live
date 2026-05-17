import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { GoogleTagManager } from '@next/third-parties/google'
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

// SSR default — every client screen overrides this via the `useTitle` hook
// (lib/title.ts), but this is what shows during the brief window between
// first paint and the screen's first effect, and on any future server-rendered
// page that doesn't set its own title.
export const metadata: Metadata = {
  title: "Game State",
  description: "Live MLB scores, standings, and stats.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#F1ECE3",
};

/**
 * Pre-hydration boot script: reads the saved user theme out of localStorage
 * and applies `data-theme="twilight"` to <html> before the page paints. Without
 * this, returning twilight users would see a flash of the light theme between
 * SSR and the first client effect.
 *
 * Two sources, in order of precedence:
 *  1. `dl_theme` — a small standalone cache written whenever an authenticated
 *     user's profile is observed (see `cacheThemePref` in lib/storage.ts).
 *     Authenticated users don't have a `dl_user` entry to read from, since
 *     their profile lives in Supabase, so this dedicated key is what lets us
 *     paint their theme synchronously instead of waiting for the round-trip.
 *  2. `dl_user` — the guest profile blob, which contains a `prefs.theme`.
 *     Guests have no Supabase profile, so this is their only source.
 *
 * The DB value remains authoritative: once Supabase returns the profile, the
 * (shell) layout's theme effect re-applies `data-theme`, and the same code
 * path rewrites `dl_theme` for next paint.
 */
const THEME_BOOT_SCRIPT = `
try {
  var theme = localStorage.getItem('dl_theme');
  if (!theme) {
    var raw = localStorage.getItem('dl_user');
    if (raw) {
      var p = JSON.parse(raw);
      theme = p && p.prefs && p.prefs.theme;
    }
  }
  if (theme === 'twilight') {
    document.documentElement.setAttribute('data-theme', 'twilight');
  }
} catch (e) {}
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: the boot <script> below sets data-theme on
    // <html> before React hydrates, which would otherwise trip the attribute
    // mismatch check on the root element.
    <html
      lang="en"
      className={`${head.variable} ${ui.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <GoogleTagManager gtmId="GTM-PB5VZSRL" />
      <body>
        {/* Inline boot script — top of body runs synchronously before any of
            the React tree paints, and avoids the App Router hydration mismatch
            that occurs when arbitrary <script> children are placed inside a
            JSX <head>. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
