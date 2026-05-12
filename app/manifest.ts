import type { MetadataRoute } from "next";

/**
 * Web App Manifest. Next.js auto-routes this to /manifest.webmanifest and
 * emits the corresponding <link rel="manifest"> in <head>.
 *
 * `start_url` skips the root redirect (/ → /scores) so PWAs launched from a
 * home-screen icon land directly on the scoreboard.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Game·State",
    short_name: "Game·State",
    description: "Live MLB scores, standings, and stats.",
    start_url: "/scores",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F1ECE3",
    theme_color: "#F1ECE3",
    lang: "en",
    categories: ["sports", "news"],
    icons: [
      {
        src: "/icon",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
