"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { searchEntities, type SearchEntity } from "@/lib/mlb/search";
import { useQueryUpdater } from "@/lib/mlb/queryParams";
import { useTitle } from "@/lib/title";
import { TeamBadge } from "@/components/ui/primitives";
import { IconSearch, IconClose } from "@/components/ui/icons";

/** DOM id of the search box. Exported so the shell nav can pull focus into it
 *  when "Search" is tapped while already on /search (see (shell)/layout.tsx). */
export const SEARCH_INPUT_ID = "dl-search-input";

/** How long to wait after the last keystroke before hitting the API. */
const DEBOUNCE_MS = 220;

/** Max hits to request per query. */
const RESULT_LIMIT = 25;

export function SearchScreen({
  onPlayer,
  onTeam,
}: {
  onPlayer: (id: number) => void;
  onTeam: (abbr: string) => void;
}) {
  useTitle("Search");

  // One browser client for the screen's lifetime; createClient is a singleton
  // under the hood but memoizing keeps the fetch effect's deps stable.
  const supabase = useMemo(() => createClient(), []);

  // Seed from ?q= so shared/bookmarked search links open pre-populated.
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";

  // The URL writer's identity changes whenever the query string changes, which
  // would re-fire the debounce effect; hold it in a ref so that effect can
  // depend only on the input value.
  const updateQuery = useQueryUpdater();
  const updateQueryRef = useRef(updateQuery);
  // Keep the ref pointing at the latest writer without reading/writing it during
  // render (the debounce effect below depends only on `input`, not on this).
  useEffect(() => {
    updateQueryRef.current = updateQuery;
  });

  const [input, setInput] = useState(initialQ);
  const [debounced, setDebounced] = useState(initialQ);
  const [results, setResults] = useState<SearchEntity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // Focus on mount — covers navigating into /search from another route.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounce keystrokes into `debounced`, and mirror the trimmed query into the
  // URL (replace, not push, so typing doesn't flood history — matches the
  // app-wide useQueryUpdater convention). The default-strip keeps a blank
  // /search URL clean.
  useEffect(() => {
    const t = setTimeout(() => {
      const q = input.trim();
      setDebounced(input);
      updateQueryRef.current({ q: q.length ? q : null });
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [input]);

  // Run the query whenever the debounced value settles. `cancelled` guards
  // against out-of-order responses when the user types faster than the network.
  // Previous results stay on screen during a refetch to avoid flicker. An empty
  // query is a no-op here — the render guards on `trimmed` and shows the hint,
  // so stale results/loading never surface.
  useEffect(() => {
    const q = debounced.trim();
    if (q.length === 0) return;
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(false);
      try {
        const rows = await searchEntities(supabase, q, { limit: RESULT_LIMIT });
        if (!cancelled) setResults(rows);
      } catch {
        if (!cancelled) {
          setError(true);
          setResults([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [debounced, supabase]);

  const clearInput = () => {
    setInput("");
    inputRef.current?.focus();
  };

  const handleSelect = (e: SearchEntity) => {
    if (e.entityType === "team") {
      if (e.teamAbbreviation) onTeam(e.teamAbbreviation);
    } else {
      onPlayer(e.uid);
    }
  };

  const trimmed = debounced.trim();
  const showHint = trimmed.length === 0;
  const showEmpty = !showHint && !loading && !error && results.length === 0;

  return (
    <>
      {/* No AppBar heading — the search field itself is the screen's header,
          which keeps mobile real estate for results. The browser/tab title is
          still set via useTitle above. */}
      <div
        data-cy="search-screen"
        className="bg-canvas px-3.5 md:px-6 pt-3 pb-25 max-w-225 w-full mx-auto"
      >
        {/* Search field — single source of truth for the query; no submit. */}
        <div className="relative flex items-center">
          <span className="absolute left-3.5 pointer-events-none flex">
            {IconSearch({ size: 18, stroke: "var(--color-ink-3)" })}
          </span>
          <input
            ref={inputRef}
            id={SEARCH_INPUT_ID}
            data-cy="search-input"
            type="search"
            inputMode="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            placeholder="Search players and teams"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            // Suppress WebKit's native search clear (✕) — we render our own
            // `search-clear` button below, so the native one would duplicate it.
            className="w-full pl-10.5 pr-10 py-3 rounded-full bg-surface-2 border border-line text-ink font-ui text-[15px] outline-none focus:border-accent transition-colors placeholder:text-ink-3 [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
          />
          {input.length > 0 && (
            <button
              type="button"
              data-cy="search-clear"
              aria-label="Clear search"
              onClick={clearInput}
              className="absolute right-2.5 flex items-center justify-center w-7 h-7 rounded-full bg-transparent border-none cursor-pointer text-ink-3 hover:bg-chip transition-colors"
            >
              {IconClose({ size: 16, stroke: "currentColor" })}
            </button>
          )}
        </div>

        {/* Results / states */}
        <div className="mt-3.5">
          {showHint ? (
            <p
              data-cy="search-hint"
              className="px-1 pt-6 text-center text-ink-3 font-ui text-[14px]"
            >
              Find any player or team by name, city, or abbreviation.
            </p>
          ) : error ? (
            <p data-cy="search-error" className="px-1 pt-6 text-center text-neg font-ui text-[14px]">
              Search failed. Check your connection and try again.
            </p>
          ) : showEmpty ? (
            <p
              data-cy="search-empty"
              className="px-1 pt-6 text-center text-ink-3 font-ui text-[14px]"
            >
              No matches for “{trimmed}”.
            </p>
          ) : results.length > 0 ? (
            <ul
              data-cy="search-results"
              className="bg-surface border border-line rounded-[14px] overflow-hidden"
            >
              {results.map((e) => (
                <li key={`${e.entityType}-${e.uid}`}>
                  <button
                    data-cy="search-result"
                    data-cy-entity-type={e.entityType}
                    data-cy-uid={e.uid}
                    onClick={() => handleSelect(e)}
                    className="w-full flex items-center gap-3 px-3 md:px-4 py-3 bg-transparent border-0 border-t border-line-2 first:border-t-0 cursor-pointer text-left hover:bg-canvas transition-colors"
                  >
                    <TeamBadge abbr={e.teamAbbreviation ?? ""} size={34} />
                    <div className="min-w-0 flex-1">
                      <div className="font-head text-[15px] md:text-[16px] font-semibold text-ink tracking-[-0.2px] truncate">
                        {e.displayName}
                      </div>
                      <div className="font-ui text-[12px] text-ink-3 truncate">
                        {e.entityType === "team"
                          ? "Team"
                          : [e.positionName, e.teamAbbreviation].filter(Boolean).join(" · ") ||
                            "Player"}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : loading ? (
            <p
              data-cy="search-loading"
              className="px-1 pt-6 text-center text-ink-3 font-ui text-[14px]"
            >
              Searching…
            </p>
          ) : null}
        </div>
      </div>
    </>
  );
}
