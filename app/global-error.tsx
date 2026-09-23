"use client";

import { ErrorFallback } from "@/components/ui/ErrorFallback";
import "./globals.css";

/**
 * Last-resort boundary for errors thrown by the root layout or the shell
 * layout itself (which `(shell)/error.tsx` can't catch, since an error file
 * never wraps the layout in its own segment). Replaces the root layout while
 * active, so it brings its own <html>/<body> and styles. The theme boot script
 * doesn't run here, so twilight users see the light palette. Acceptable for a
 * screen that should essentially never appear.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <title>Game State</title>
        <ErrorFallback error={error} retry={unstable_retry} scope="global" />
      </body>
    </html>
  );
}
