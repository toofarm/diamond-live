"use client";

import { useEffect } from "react";
import { BaseballMark } from "@/components/ui/primitives";
import { sendToDataLayer, events } from "@/lib/analytics";

/**
 * A lazily loaded script from a build that's no longer deployed. The classic
 * cause is version skew: a tab left open across a deploy asks for the old
 * build's chunk hashes, which 404 against the new one. Webpack names these
 * `ChunkLoadError`; native dynamic `import()` failures only carry a message,
 * whose wording differs per engine (the last one is WebKit's).
 */
function isChunkLoadError(error: Error): boolean {
  if (error.name === "ChunkLoadError") return true;
  return /Loading chunk|Loading CSS chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(
    error.message,
  );
}

/** sessionStorage key recording the last chunk-error auto-reload, so a chunk
 *  that is genuinely missing (not just skewed) can't trap the tab in a reload
 *  loop. */
const RELOAD_KEY = "dl_chunk_reload_at";
const RELOAD_COOLDOWN_MS = 30_000;

/** Reloads the page once for a chunk error. Returns true if it did. */
function reloadForChunkError(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // Storage blocked (private mode quota, etc.) — without the loop guard it
    // isn't safe to reload automatically, so leave it to the button.
    return false;
  }
  window.location.reload();
  return true;
}

/**
 * Shared fallback for `app/(shell)/error.tsx` and `app/global-error.tsx`.
 *
 * Reports the error to the dataLayer so it shows up in GTM, auto-reloads once
 * for a stale-deploy chunk error (a retry would just request the same missing
 * chunk), and otherwise offers both a soft retry and a hard reload.
 */
export function ErrorFallback({
  error,
  retry,
  scope,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  /** Which boundary caught it, for the analytics event. */
  scope: "shell" | "global";
}) {
  const chunk = isChunkLoadError(error);

  useEffect(() => {
    console.error(error);
    sendToDataLayer({
      event: events.APP_ERROR,
      target: scope,
      meta: {
        name: error.name,
        message: error.message.slice(0, 200),
        digest: error.digest ?? "",
        path: window.location.pathname,
        visibility: document.visibilityState,
      },
    });
    if (chunk) reloadForChunkError();
  }, [error, scope, chunk]);

  return (
    <div
      data-cy="error-fallback"
      role="alert"
      className="flex flex-col items-center justify-center gap-4 min-h-[70dvh] px-6 py-12 text-center"
    >
      <BaseballMark size={44} />
      <div>
        <h2 className="font-head text-lg font-semibold text-ink">Something went wrong</h2>
        <p className="mt-1 text-sm text-ink-2">
          {chunk
            ? "A newer version of Game State is available."
            : "This screen hit an unexpected error."}
        </p>
      </div>
      <div className="flex gap-2">
        {!chunk && (
          <button
            type="button"
            data-cy="error-retry"
            onClick={retry}
            className="px-4 py-2 rounded-full bg-chip text-ink text-sm font-semibold cursor-pointer border-none"
          >
            Try again
          </button>
        )}
        <button
          type="button"
          data-cy="error-reload"
          onClick={() => window.location.reload()}
          className="px-4 py-2 rounded-full bg-accent text-white text-sm font-semibold cursor-pointer border-none"
        >
          Reload
        </button>
      </div>
    </div>
  );
}
