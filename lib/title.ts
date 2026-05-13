"use client";

import { useEffect } from "react";

/** Brand suffix appended to every page-specific title. Single source of truth
 *  so a future rename only requires editing this constant. */
export const TITLE_SUFFIX = "Game State";

/**
 * Set `document.title` to `<prefix> | Game State` for the lifetime of the
 * mounted component. Re-runs whenever `prefix` changes, so screens with
 * polling/refresh data (e.g. GameDetail's live score) get a title that tracks
 * the freshest state.
 *
 * Pass `null` or `undefined` to skip the update — useful when the data
 * driving the title hasn't loaded yet, so the SSR default ("Game State")
 * stays visible until we have something meaningful to show.
 */
export function useTitle(prefix: string | null | undefined): void {
  useEffect(() => {
    if (!prefix) return;
    document.title = `${prefix} | ${TITLE_SUFFIX}`;
  }, [prefix]);
}
