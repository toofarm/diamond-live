"use client";

import { Suspense, use, useMemo, useState } from "react";
import { useApiResource, useIsClient, type ApiResource } from "@/lib/mlb/client";
import type { GameSummary } from "@/lib/mlb/types";
import { dateStrip, formatTodayHeader } from "@/lib/date";
import { ScoreCard } from "@/components/ui/ScoreCard";
import { DateStrip, SectionHead } from "@/components/ui/primitives";
import { IconStar, IconChevron } from "@/components/ui/icons";
import { useTitle } from "@/lib/title";
import { sendToDataLayer, events } from "@/lib/analytics";

interface ScoresResp {
  date: string;
  games: GameSummary[];
}

/** Poll cadence for today's board. Kept in sync with the Data Cache TTL on
 *  /api/mlb/scoreboard, which must stay strictly under it — see the comment in
 *  app/api/mlb/scoreboard/route.ts. */
const POLL_MS = 10_000;

/**
 * Whether anything on this board can still change, and so whether it is still
 * worth polling. Once every game has finished or been postponed — the state the
 * board sits in from the last out until the next day's slate — there is nothing
 * left to fetch.
 *
 * `null` means no response has landed yet (or the last one failed), where
 * polling should continue. An empty slate is genuinely terminal: an off-day
 * gains no games. A failing upstream can't be mistaken for one, because the
 * route answers errors with a 502, which lands on the hook's error path and
 * leaves `data` null rather than reporting zero games.
 *
 * Note this stops on FINAL without waiting for W/L/SV decisions, unlike
 * GameDetail's equivalent. On a whole board, one suspended or re-scored game
 * that never posts decisions would otherwise keep every card polling all night
 * — a worse trade than a just-finished card waiting for its pitcher credits,
 * which the visibility refetch picks up on the user's next return anyway.
 *
 * Module-level for a stable identity — `pollWhile` is an effect dependency.
 */
function boardCanStillChange(data: ScoresResp | null): boolean {
  if (!data) return true;
  return data.games.some((g) => g.status !== "FINAL" && g.status !== "POSTPONED");
}

export function ScoresScreen({
  follows,
  onGame,
}: {
  follows: string[];
  onGame: (id: number) => void;
}) {
  useTitle("Scores");

  const strip = useMemo(() => dateStrip(0, 7, 7), []);
  const todayIdx = strip.findIndex((d) => d.today);
  const [dateIdx, setDateIdx] = useState(todayIdx >= 0 ? todayIdx : 7);
  // Lives up here, not in ScoresBoard: the board remounts on every date change
  // (see the keyed boundary below) and the user's collapse choice should not.
  const [mlbCollapsed, setMlbCollapsed] = useState(false);

  // User-initiated calendar move. Fires CALENDAR_NAVIGATION with the
  // destination's ISO date in `target`. DateStrip calls onSelect on every
  // click (including the currently-selected pill), so guard against
  // same-day re-clicks here.
  const handleDateSelect = (i: number) => {
    if (i === dateIdx) return;
    const iso = strip[i]?.iso;
    if (iso) {
      sendToDataLayer({ event: events.CALENDAR_NAVIGATION, target: iso });
    }
    setDateIdx(i);
  };

  const entry = strip[dateIdx];
  const date = entry?.iso ?? strip[0]?.iso ?? "";
  const isToday = entry?.today === true;
  const dateLabel = isToday
    ? formatTodayHeader()
    : entry
      ? `${entry.wd} · ${entry.m} ${entry.d}`
      : "";

  // The board fetches on the client only — see `useIsClient`. The server pass
  // and hydration render the skeleton, which is also what the boundary shows,
  // so there is no visible handoff.
  const isClient = useIsClient();

  return (
    <>
      <div className="bg-surface border-b border-line">
        <DateStrip entries={strip} selectedIdx={dateIdx} onSelect={handleDateSelect} />
      </div>

      {/* The DateStrip above stays outside the boundary, so it remains mounted
          and clickable while a date loads. */}
      {isClient ? (
        <ScoresBoardLoader
          date={date}
          isToday={isToday}
          dateLabel={dateLabel}
          follows={follows}
          onGame={onGame}
          mlbCollapsed={mlbCollapsed}
          onToggleMlb={() => setMlbCollapsed((c) => !c)}
        />
      ) : (
        <ScoresSkeleton dateLabel={dateLabel} />
      )}
    </>
  );
}

/**
 * Owns the request and the boundary. Split from `ScoresBoard` because the
 * component that creates the promise must not be the one that suspends — see
 * the note on `useApiResource`.
 */
function ScoresBoardLoader({
  date,
  isToday,
  dateLabel,
  follows,
  onGame,
  mlbCollapsed,
  onToggleMlb,
}: {
  date: string;
  isToday: boolean;
  dateLabel: string;
  follows: string[];
  onGame: (id: number) => void;
  mlbCollapsed: boolean;
  onToggleMlb: () => void;
}) {
  // Freshness over everything: `useApiResource` has no cache tier at all, so
  // this mount goes to the network and so does every poll. The poll only runs
  // for today (past/future dates aren't live), but the visibility refetch is
  // unconditional: a backgrounded tab's poll gets throttled to a crawl, and
  // even a non-today board moves (postponements, probables), so one request per
  // foreground return is worth the freshness.
  //
  // `pollWhile` retires the interval once every game on the board is done, so a
  // finished slate stops costing requests. The visibility refetch deliberately
  // survives that, as the recovery path for anything that lands late.
  const { resource } = useApiResource<ScoresResp>(
    `/api/mlb/scoreboard?date=${date}`,
    {
      pollMs: isToday ? POLL_MS : undefined,
      refreshOnVisible: true,
      pollWhile: boardCanStillChange,
    },
  );

  // One boundary per date, so the two kinds of fetch get the two different
  // treatments they deserve:
  //   - Changing dates swaps `date`, and with it the boundary's key, so the new
  //     date's first request suspends into the skeleton. There is no previous
  //     day's board worth staring at while it loads.
  //   - The 10s poll replaces the resource inside a transition, leaving the key
  //     alone. React resolves the replacement while the committed board stays
  //     on screen, so scores swap in place and a live game never blinks.
  return (
    <Suspense key={date} fallback={<ScoresSkeleton dateLabel={dateLabel} />}>
      <ScoresBoard
        resource={resource}
        dateLabel={dateLabel}
        follows={follows}
        onGame={onGame}
        mlbCollapsed={mlbCollapsed}
        onToggleMlb={onToggleMlb}
      />
    </Suspense>
  );
}

function ScoresBoard({
  resource,
  dateLabel,
  follows,
  onGame,
  mlbCollapsed,
  onToggleMlb,
}: {
  resource: ApiResource<ScoresResp>;
  dateLabel: string;
  follows: string[];
  onGame: (id: number) => void;
  mlbCollapsed: boolean;
  onToggleMlb: () => void;
}) {
  // Suspends until the request settles. On a poll the parent swaps `resource`
  // inside a transition, so React resolves the replacement while this board
  // stays committed and on screen.
  const { data, error } = use(resource);

  // Deliberately not memoized. Every one of these is derived from `data`, which
  // is a new object on every poll, so a memo would recompute each time anyway —
  // it would buy referential stability we don't consume, at the cost of hiding
  // the fact that this screen is meant to recompute from scratch on each fetch.
  const games: GameSummary[] = data?.games ?? [];
  const isFollowing = (g: GameSummary) => follows.includes(g.home) || follows.includes(g.away);
  const followGames = games.filter(isFollowing);
  const restGames = games.filter((g) => !isFollowing(g));
  const counts = {
    live: games.filter((g) => g.status === "LIVE").length,
    final: games.filter((g) => g.status === "FINAL").length,
    postponed: games.filter((g) => g.status === "POSTPONED").length,
    total: games.length,
  };

  return (
    <div
      data-cy="scores-screen"
      className="bg-canvas px-[14px] md:px-6 pt-1 pb-6 max-w-[1200px] w-full mx-auto"
    >
      <div className="mt-3 bg-surface border border-line rounded-[14px] px-3.5 py-2.5 flex items-center gap-2.5">
        <span
          className={`w-2 h-2 rounded-[4px] ${counts.live > 0 ? "bg-live dl-live-pulse" : "bg-ink-3"}`}
        />
        <div className="flex-1 text-xs text-ink-2 font-ui">
          {games.length === 0 ? (
            <span data-cy="empty-state">No games today.</span>
          ) : (
            <>
              <span className="font-bold text-ink text-[13px]">{counts.live} live</span>
              <span>
                {" "}· {counts.final} final ·{" "}
                {counts.total - counts.live - counts.final - counts.postponed} upcoming
                {counts.postponed > 0 ? ` · ${counts.postponed} postponed` : ""}
              </span>
            </>
          )}
        </div>
        <span className="text-[11px] text-ink-3 font-mono tracking-[0.4px]">{dateLabel}</span>
      </div>

      {followGames.length > 0 && (
        <section data-cy="following-section">
          <SectionHead
            icon={<IconStar size={15} stroke="var(--color-accent)" fill="var(--color-accent)" />}
            title="Following"
            right={<span className="font-mono text-xs text-ink-3">{followGames.length}</span>}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {followGames.map((g) => (
              <ScoreCard key={g.id} game={g} onClick={() => onGame(g.id)} />
            ))}
          </div>
        </section>
      )}

      <section data-cy="mlb-section">
        <SectionHead
          icon={
            <div className="w-[15px] h-[15px] rounded-[4px] bg-accent text-white flex items-center justify-center text-[8px] font-bold font-mono">
              MLB
            </div>
          }
          title="MLB"
          right={
            <button
              data-cy="mlb-collapse-toggle"
              onClick={onToggleMlb}
              className="bg-transparent border-none cursor-pointer flex items-center gap-1 text-ink-3 font-mono text-xs"
            >
              {restGames.length}
              <span
                className={`inline-block transition-transform duration-200 ${mlbCollapsed ? "-rotate-90" : "rotate-90"
                  }`}
              >
                <IconChevron size={14} stroke="var(--color-ink-3)" />
              </span>
            </button>
          }
        />
        {!mlbCollapsed && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {restGames.map((g) => (
              <ScoreCard key={g.id} game={g} onClick={() => onGame(g.id)} />
            ))}
          </div>
        )}
      </section>

      {error && (
        <div className="mt-3 text-neg text-xs font-mono">Failed to load: {error}</div>
      )}

      <div className="h-[60px]" />
    </div>
  );
}

/** Suspense fallback for a date's first load. Mirrors the board's container and
 *  grid so the layout doesn't jump when the real cards land. */
function ScoresSkeleton({ dateLabel }: { dateLabel: string }) {
  return (
    <div className="bg-canvas px-[14px] md:px-6 pt-1 pb-6 max-w-[1200px] w-full mx-auto">
      <div className="mt-3 bg-surface border border-line rounded-[14px] px-3.5 py-2.5 flex items-center gap-2.5">
        <span className="w-2 h-2 rounded-[4px] bg-ink-3" />
        <div className="flex-1 text-xs text-ink-2 font-ui">
          <span data-cy="loading">Loading games…</span>
        </div>
        <span className="text-[11px] text-ink-3 font-mono tracking-[0.4px]">{dateLabel}</span>
      </div>

      <div
        data-cy="scores-skeleton"
        aria-hidden
        className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5"
      >
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="h-[104px] bg-surface border border-line rounded-[14px] animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}
