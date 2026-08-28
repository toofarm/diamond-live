"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";

export interface UseApiState<T> {
  data: T | null;
  error: string | null;
  /** True only when the FIRST fetch for this URL hasn't completed yet —
   *  used for "show a spinner while we have no data to render." Stays false
   *  during background polls and refreshes once we have data in hand. */
  loading: boolean;
  /** True whenever a fetch is currently in flight — including the initial
   *  load, polls, and manual `refresh()` calls. Use this for "disable the
   *  manual-refresh button" and similar in-flight-aware UI. */
  fetching: boolean;
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
  /**
   * Refetch the moment the tab returns to the foreground, and restart any poll
   * interval from that point. Opt-in, for screens where the data on display is
   * expected to be current the instant the user looks at it. Bypasses the cache
   * like `refresh()` does.
   */
  refreshOnVisible?: boolean;
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
 * - `refreshOnVisible` set → refetches when the tab is foregrounded again.
 * - `refresh()` → invalidates the entry for this URL and refetches.
 *
 * Known constraints. None is reachable by the current callers — every one of them
 * passes `cacheMs` alone — but each is a live trap for the next one, so check
 * this list before reaching for an option nothing uses yet:
 *
 * - `refresh` is a fresh function identity on every render, not a `useCallback`.
 *   Putting it in a dependency array re-runs that effect on every render.
 * - The synchronous cache short-circuit is gated on `tick === 0`, so the first
 *   `refresh()` / poll / visibility refetch disables it for the rest of that
 *   hook instance's life. Later URL changes still seed from the cache, but then
 *   refetch anyway.
 * - No in-flight coalescing: two components mounting the same URL at the same
 *   moment both go to the network, because neither has populated the cache yet.
 *   `useApiResource` below does coalesce; this hook does not.
 * - The cache never evicts, so a long session accumulates one payload per
 *   distinct URL visited.
 *
 * For a live surface, prefer `useApiResource`: no cache tier at all, and a
 * `pollWhile` predicate that retires the interval once the data can't change.
 */
export function useApi<T>(url: string | null, opts: UseApiOptions = {}): UseApiState<T> {
  const { pollMs, cacheMs = 0, refreshOnVisible = false } = opts;

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
  const [fetching, setFetching] = useState(false);
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
    setFetching(true);

    fetch(url, { signal: ac.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const data = (await res.json()) as T;
        if (cacheMs > 0) cache.set(url, { data, fetchedAt: Date.now() });
        return { ok: true as const, data };
      })
      .catch((e: Error) => ({ ok: false as const, message: e.message }))
      .then((result) => {
        if (ac.signal.aborted) return;
        if (result.ok) {
          setState({ data: result.data, error: null, loading: false });
        } else {
          // Report the failure but keep whatever is already on screen. Tearing a
          // populated view down to a blank error state is the worse outcome, and
          // a refetch that fails says nothing about the data it was replacing.
          // `prev.data` is already null when the URL just changed (the reseed
          // above clears it), so this can never pair one URL's data with
          // another's error.
          setState((prev) => ({ data: prev.data, error: result.message, loading: false }));
        }
        setFetching(false);
      });

    return () => ac.abort();
  }, [url, tick, cacheMs]);

  // Poll on an interval and, when `refreshOnVisible` is set, refetch as soon as
  // the tab comes back to the foreground.
  //
  // A poll interval is not a reliable clock in a hidden tab: browsers clamp
  // background timers to roughly once a minute, and after a few minutes of no
  // activity budget-based throttling can stretch that out further. So a screen
  // polling every 20s can be minutes stale by the time the user looks at it
  // again, and the interval's next tick lands at an arbitrary offset from that
  // moment. Firing on `visibilitychange` closes that gap, and restarting the
  // interval off the same moment keeps the following poll a full period out
  // instead of landing right on top of the refetch we just triggered.
  //
  // `setTick` is a stable setState, so this effect only re-subscribes when the
  // URL or the options actually change.
  useEffect(() => {
    if (!url) return;
    if (!pollMs && !refreshOnVisible) return;

    let id: ReturnType<typeof setInterval> | null = null;
    const stopPolling = () => {
      if (id !== null) clearInterval(id);
      id = null;
    };
    const startPolling = () => {
      stopPolling();
      if (pollMs) id = setInterval(() => setTick((t) => t + 1), pollMs);
    };

    startPolling();
    if (!refreshOnVisible) return stopPolling;

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      setTick((t) => t + 1);
      startPolling();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [pollMs, url, refreshOnVisible]);

  const refresh = () => {
    if (url) cache.delete(url);
    setTick((t) => t + 1);
  };

  return { ...state, refresh, fetching };
}

// ---------------------------------------------------------------------------
// Freshness-first variant: suspending reads
// ---------------------------------------------------------------------------

export interface ApiSnapshot<T> {
  data: T | null;
  error: string | null;
}

/** A single in-flight (or settled) request. Hand it to `use()` inside a
 *  `<Suspense>` boundary — see `useApiResource` for why the two halves are
 *  split across two components. */
export type ApiResource<T> = Promise<ApiSnapshot<T>>;

export interface UseApiResourceState<T> {
  resource: ApiResource<T>;
  /** True while a poll or manual `refresh()` is in flight. The payload on
   *  screen is the previous one — no fallback is shown — so this is for subtle
   *  "refreshing" affordances only, never a full-screen spinner. */
  refreshing: boolean;
  /** Increments every time `resource` is replaced, and restarts at 0 on a URL
   *  change. Handy as a React `key` for anything that should reset itself once
   *  per refresh — a countdown to the next poll, say — since remounting on a
   *  changed key avoids a reset effect entirely. */
  generation: number;
  refresh: () => void;
}

export interface UseApiResourceOptions<T = unknown> {
  /** Poll the URL every N ms while mounted. */
  pollMs?: number;
  /** Also refetch the moment the tab returns to the foreground, restarting the
   *  poll interval from that point. See the note in `useApi` for why. */
  refreshOnVisible?: boolean;
  /**
   * Consulted after each response to decide whether polling should continue.
   * Return false once the payload can no longer change — a completed game, say
   * — and the interval is torn down for good rather than burning bandwidth on a
   * request whose answer is already known. Receives `null` before the first
   * response settles, where returning true is usually right.
   *
   * `refreshOnVisible` is intentionally NOT gated by this: one request per
   * foreground return is cheap, and it is the recovery path for a payload that
   * turned out to still have a late change in it.
   *
   * MUST be referentially stable (a module-level function, or wrapped in
   * `useCallback`) — it is an effect dependency.
   */
  pollWhile?: (data: T | null) => boolean;
}

/**
 * Freshness-first sibling of `useApi`, for screens where a stale render is
 * worse than a fallback. There is no cache tier of any kind — not the
 * in-memory map above, not the browser HTTP cache (`cache: "no-store"`) — so
 * every mount and every poll goes to the network.
 *
 * Call this in a component that does NOT itself suspend, and pass `resource`
 * down to a child inside a `<Suspense>` boundary that reads it with `use()`.
 * The split is not stylistic. A component that suspends on its initial mount
 * never commits, so React discards the in-progress render — hook state and refs
 * included — and retries from scratch; a promise owned by the suspending
 * component would therefore be recreated on every retry and suspend forever.
 * Owning it one level up, where the render always commits, makes it a stable
 * state value. That also gets the lifetime right for free: a remount (navigate
 * into a game and back) builds fresh state and so refetches, rather than
 * resolving instantly against a payload from the previous visit.
 *
 * How it interacts with the boundary:
 *   - First load of a URL, and any URL change, replaces `resource` in a plain
 *     render. The child suspends with nothing to fall back to, so the boundary
 *     shows its fallback.
 *   - Polls, visibility refetches, and `refresh()` replace it inside
 *     `startTransition`. React resolves the new promise while keeping the
 *     committed content mounted, so a live board never blinks.
 *
 * A failed request resolves to `{ data: <last good payload>, error }` rather
 * than rejecting: one bad poll must not blank a board that is already on
 * screen, and must not escalate to an error boundary.
 */
/** `useSyncExternalStore` needs a subscribe function; hydration state never
 *  changes after the first commit, so this one never notifies. */
const subscribeNever = () => () => {};

/**
 * False on the server pass and during hydration, true from the first
 * post-hydration render on. Same `useSyncExternalStore` + server-snapshot
 * idiom as `useUser` in lib/storage.ts, which keeps it lint-clean and free of
 * hydration mismatches (a `setState` in an effect would do neither).
 *
 * Gate `useApiResource` behind this. Its request starts from a `useState`
 * initializer, which also runs during SSR — where a relative URL has no origin
 * to resolve against, and where suspending at prerender time would flip an
 * otherwise-static route to dynamic. Render a fallback until this returns true.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
}

/**
 * In-flight request coalescing, keyed by URL. Entries are removed the instant a
 * request settles, so this is emphatically NOT a response cache: it only ever
 * hands back a request that is still on the wire, which is always as fresh as
 * issuing a second one would be.
 *
 * It exists because `useApiResource` starts its first request from a `useState`
 * initializer, and React double-invokes those under StrictMode to surface
 * impurity — without coalescing, every mount in development would hit the
 * network twice. It also collapses concurrent mounts of the same URL into one
 * request. Because settled entries are dropped, a later mount still refetches.
 */
const inflight = new Map<string, Promise<unknown>>();

function sharedRequest<T>(url: string): Promise<T> {
  const hit = inflight.get(url);
  if (hit) return hit as Promise<T>;

  const p = fetch(url, { cache: "no-store" })
    .then(async (res) => {
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return (await res.json()) as T;
    })
    .finally(() => {
      inflight.delete(url);
    });

  inflight.set(url, p);
  return p;
}

export function useApiResource<T>(
  url: string,
  opts: UseApiResourceOptions<T> = {},
): UseApiResourceState<T> {
  const { pollMs, refreshOnVisible = false, pollWhile } = opts;

  // Last good payload per URL, for the failed-request path below. Mount-scoped
  // (it dies with the component) and keyed by URL so a failed fetch can never
  // re-serve a different date's games.
  const [lastGood] = useState<Map<string, T>>(() => new Map());

  // Each hook attaches its own bookkeeping to the shared request, so a
  // coalesced request still records last-good into this mount's own map.
  const request = useCallback(
    (target: string): ApiResource<T> =>
      sharedRequest<T>(target)
        .then((data): ApiSnapshot<T> => {
          lastGood.set(target, data);
          return { data, error: null };
        })
        .catch((e: Error): ApiSnapshot<T> => ({
          // Keep whatever is already on screen. A single failed poll blanking
          // the board is worse than a board with an error line on it.
          data: lastGood.get(target) ?? null,
          error: e.message,
        })),
    [lastGood],
  );

  // `resource` and `generation` move together, so one state object keeps them
  // from ever disagreeing about which request is current.
  const [current, setCurrent] = useState<{
    resource: ApiResource<T>;
    generation: number;
  }>(() => ({ resource: request(url), generation: 0 }));

  // URL change (a new date): swap in a fresh request during render, using the
  // same "adjust state when props change" pattern as `useApi`, so the child
  // suspends on the new URL immediately instead of committing one frame of the
  // previous URL's data.
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [prevUrl, setPrevUrl] = useState(url);
  if (url !== prevUrl) {
    setPrevUrl(url);
    // A plain value, not an updater, for the same purity reason as `refresh`
    // below. This component never suspends, so its own render commits and this
    // branch runs once per URL change; a StrictMode double-render is absorbed by
    // the in-flight coalescing above.
    setCurrent({ resource: request(url), generation: 0 });
  }

  const [refreshing, startRefresh] = useTransition();

  // Inside a transition: React keeps the committed content on screen while the
  // replacement resolves, so the Suspense fallback stays out of the way.
  //
  // The request is started HERE, before the updater, and the updater only stores
  // the value. That ordering is load-bearing. A state updater must be pure,
  // because React re-invokes it whenever it has to redo the render — and this
  // update always makes a child suspend, which is exactly such a case. Starting
  // the fetch inside the updater therefore minted a brand-new promise on every
  // retry, which suspended again and triggered another retry: a self-sustaining
  // loop that hammered the endpoint for as long as the screen stayed open.
  // Hoisting it out means a replayed updater re-stores the same promise and the
  // render settles.
  const refresh = useCallback(() => {
    const next = request(url);
    startRefresh(() => {
      setCurrent((prev) => ({ resource: next, generation: prev.generation + 1 }));
    });
  }, [request, url]);

  // Whether polling is still worthwhile, per `pollWhile`. Watching the resource
  // settle from an effect — rather than reading it with `use()` — is what keeps
  // this component out of the suspending path: it owns the promise, so it must
  // never suspend on it. Storing the derived boolean rather than the payload
  // means state only changes on the single render where the answer flips, so
  // subscribing here costs no extra renders of the tree below.
  const [pollable, setPollable] = useState(true);
  useEffect(() => {
    if (!pollWhile) return;
    let alive = true;
    current.resource.then((snap) => {
      if (alive) setPollable(pollWhile(snap.data));
    });
    return () => {
      alive = false;
    };
  }, [current.resource, pollWhile]);

  const activePollMs = pollable ? pollMs : undefined;

  useEffect(() => {
    if (!activePollMs && !refreshOnVisible) return;

    let id: ReturnType<typeof setInterval> | null = null;
    const stopPolling = () => {
      if (id !== null) clearInterval(id);
      id = null;
    };
    const startPolling = () => {
      stopPolling();
      if (activePollMs) id = setInterval(refresh, activePollMs);
    };

    startPolling();
    if (!refreshOnVisible) return stopPolling;

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      refresh();
      startPolling();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [activePollMs, refreshOnVisible, refresh]);

  return {
    resource: current.resource,
    generation: current.generation,
    refreshing,
    refresh,
  };
}
