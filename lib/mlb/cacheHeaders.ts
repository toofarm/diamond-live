/**
 * Cache-Control presets for our MLB route handlers.
 *
 * Each handler picks the tier matching its data's tolerance for staleness.
 * The browser HTTP cache uses these to short-circuit duplicate same-URL
 * requests across back/forward nav, working alongside the per-call in-memory
 * cache layer in lib/mlb/client.ts.
 *
 * Directive cheatsheet:
 *   max-age=N              — serve from cache for N seconds, no revalidation needed
 *   stale-while-revalidate — between max-age and max-age+SWR, serve stale AND
 *                            kick off a background refresh
 *   stale-if-error         — if the origin returns an error, the browser may
 *                            serve the cached response for this window (graceful
 *                            degradation on flaky networks or upstream outages)
 */
export const CACHE_HEADERS = {
  LIVE:       { "Cache-Control": "no-store" },
  SCHEDULE:   { "Cache-Control": "public, max-age=60,  stale-while-revalidate=120,  stale-if-error=600"  },
  STATIC_5M:  { "Cache-Control": "public, max-age=300, stale-while-revalidate=600,  stale-if-error=1800" },
  STATIC_10M: { "Cache-Control": "public, max-age=600, stale-while-revalidate=1200, stale-if-error=3600" },
} as const;
