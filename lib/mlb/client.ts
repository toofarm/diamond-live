"use client";

import { useEffect, useRef, useState } from "react";

export interface UseApiState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refresh: () => void;
}

export interface UseApiOptions {
  /** Poll the URL every N ms while mounted. Polling bypasses the cache. */
  pollMs?: number;
  /**
   * Serve a previous response for this URL synchronously if its age is within `cacheMs`.
   * `0` (default) disables the cache — every mount triggers a network fetch.
   */
  cacheMs?: number;
}

/**
 * Process-wide cache keyed by URL. Survives client-side navigation, resets on
 * hard refresh. Strict fresh-or-fetch: a hit within `cacheMs` returns instantly
 * with no background refetch; anything older goes back to the network.
 *
 * The browser HTTP cache (with stale-while-revalidate on each route handler)
 * handles the soft-revalidation tier, so we keep this layer dumb on purpose.
 */
type CacheEntry = { data: unknown; fetchedAt: number };
const cache = new Map<string, CacheEntry>();

function readFresh<T>(url: string, cacheMs: number): T | null {
  if (cacheMs <= 0) return null;
  const hit = cache.get(url);
  if (!hit) return null;
  if (Date.now() - hit.fetchedAt > cacheMs) return null;
  return hit.data as T;
}

type S<T> = { data: T | null; error: string | null; loading: boolean };

function seedFromCache<T>(url: string | null, cacheMs: number): S<T> {
  if (!url) return { data: null, error: null, loading: false };
  const fresh = readFresh<T>(url, cacheMs);
  if (fresh != null) return { data: fresh, error: null, loading: false };
  return { data: null, error: null, loading: true };
}

/**
 * Minimal fetch hook with an optional in-memory cache.
 *
 * - `cacheMs > 0` and a fresh entry exists → returns the cached value synchronously,
 *   skips the network. No spinner flash on back-nav.
 * - `cacheMs > 0` and the entry is stale or missing → fetches as usual, then writes
 *   the response to the cache.
 * - `pollMs` set → refetches on that interval regardless of the cache.
 * - `refresh()` → invalidates the entry for this URL and refetches.
 */
export function useApi<T>(url: string | null, opts: UseApiOptions = {}): UseApiState<T> {
  const { pollMs, cacheMs = 0 } = opts;

  const [state, setState] = useState<S<T>>(() => seedFromCache<T>(url, cacheMs));
  // React "adjust state when props change" pattern — reseed from cache on URL change
  // without scheduling a cascading setState inside an effect.
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [prevUrl, setPrevUrl] = useState(url);
  if (url !== prevUrl) {
    setPrevUrl(url);
    setState(seedFromCache<T>(url, cacheMs));
  }

  const [tick, setTick] = useState(0);
  const aborter = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!url) return;
    // Cache short-circuit: the lazy-init / URL-change adjustment already seeded
    // the state from the cache, so we just need to avoid issuing a redundant fetch.
    // `tick > 0` means refresh() was called — bypass the cache.
    if (tick === 0 && readFresh<T>(url, cacheMs) != null) return;

    aborter.current?.abort();
    const ac = new AbortController();
    aborter.current = ac;

    fetch(url, { signal: ac.signal })
      .then(async (res): Promise<S<T>> => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const data = (await res.json()) as T;
        if (cacheMs > 0) cache.set(url, { data, fetchedAt: Date.now() });
        return { data, error: null, loading: false };
      })
      .catch((e: Error): S<T> | null => {
        if (ac.signal.aborted) return null;
        return { data: null, error: e.message, loading: false };
      })
      .then((next) => {
        if (next && !ac.signal.aborted) setState(next);
      });

    return () => ac.abort();
  }, [url, tick, cacheMs]);

  useEffect(() => {
    if (!pollMs || !url) return;
    const id = setInterval(() => setTick((t) => t + 1), pollMs);
    return () => clearInterval(id);
  }, [pollMs, url]);

  const refresh = () => {
    if (url) cache.delete(url);
    setTick((t) => t + 1);
  };

  return { ...state, refresh };
}
