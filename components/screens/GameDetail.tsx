"use client";

import {
  Suspense,
  use,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { area as d3Area, curveMonotoneX, line as d3Line, scaleLinear } from "d3";
import { useApiResource, useIsClient, type ApiResource } from "@/lib/mlb/client";
import type {
  AtBat,
  BatterSpray,
  BoxLineupRow,
  BoxPitchingRow,
  GameDecisions,
  GameDetailData,
  Pitch,
  PitchLocation,
  PitcherRef,
  Play,
  ProbableStarters,
  SprayOutcome,
  SprayPoint,
  TeamRecord,
  WinProbability,
  WinProbabilityPlay,
} from "@/lib/mlb/types";
import { TEAMS } from "@/lib/mlb/teams";
import { BackChevron, TeamBadge, BaseDiamond, Loader, OutDots } from "@/components/ui/primitives";
import { IconRefresh } from "@/components/ui/icons";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { DEFAULT_PREFS, useUser, type BoxScoreUnits } from "@/lib/storage";
import { formatLocalTime } from "@/lib/date";
import { useTitle } from "@/lib/title";
import { useTabParam } from "@/lib/mlb/queryParams";
import { sendToDataLayer, events } from "@/lib/analytics";
import { useSlidingPill } from "@/lib/slidingPill";
import { PITCH_TYPE_NAMES, pitchColor } from "@/lib/mlb/pitchTypes";

/** Format pitch velocity in the user's preferred units. Returns the value + label. */
function formatVelo(mph: number, units: BoxScoreUnits): { value: string; label: string } {
  if (units === "metric") {
    const kph = mph * 1.609344;
    return { value: kph > 0 ? kph.toFixed(1) : "—", label: "KM/H" };
  }
  return { value: mph > 0 ? mph.toFixed(1) : "—", label: "MPH" };
}

type SubTab = "summary" | "box" | "plays" | "pitches" | "spray";

const SUB_TABS: readonly SubTab[] = ["summary", "box", "plays", "pitches", "spray"];

/** Poll cadence for the live feed. Kept in sync with the Data Cache TTLs on
 *  /api/mlb/game/[gamePk], which must stay strictly under it — see the comment
 *  in that route. */
const POLL_MS = 10_000;

/**
 * Whether this game is still capable of changing, and so still worth polling.
 *
 *   LIVE       — obviously.
 *   SCHEDULED  — the whole point is to catch first pitch, so keep watching.
 *   POSTPONED  — done changing. A reschedule moves the game to another date,
 *                which is a different board and a different URL.
 *   FINAL      — done changing, with one exception: W/L/SV decisions post a
 *                moment *after* a game goes final, so a game that ends while
 *                you're watching would otherwise freeze without them. Keep
 *                polling until they land, then stop for good. Opening a game
 *                that finished hours ago therefore issues zero polls, which is
 *                the case that actually matters for bandwidth.
 *
 * Module-level for a stable identity — `pollWhile` is an effect dependency.
 */
function gameCanStillChange(data: GameDetailData | null): boolean {
  const summary = data?.summary;
  if (!summary) return true; // nothing has landed yet; let the first fetch decide
  if (summary.status === "POSTPONED") return false;
  if (summary.status !== "FINAL") return true;
  return !(summary.decisions?.winner || summary.decisions?.loser);
}

const SPRAY_COLORS: Record<SprayOutcome, string> = {
  HR: "#C73E1D",
  "3B": "#D97C2A",
  "2B": "#2E9D5B",
  "1B": "#4A4137",
  OUT: "#B8AFA1",
};

const PITCH_RESULT_COLORS: Record<Pitch["result"], { fill: string; ink: string; label: string }> = {
  ball: { fill: "#1F8F4F", ink: "#fff", label: "Ball" },
  strike: { fill: "#C73E1D", ink: "#fff", label: "Strike" },
  "foul-2k": { fill: "#8A8077", ink: "#fff", label: "Foul" },
  inplay: { fill: "#2F6BD9", ink: "#fff", label: "In play" },
};

function ord(n?: number) {
  if (!n) return "";
  return n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th";
}

export function GameDetail({
  gameId,
  onBack,
  onPlayer,
  onTeam,
}: {
  gameId: number;
  onBack: () => void;
  onPlayer: (id: number) => void;
  onTeam: (abbr: string) => void;
}) {
  // The live feed is fetched on the client only — see `useIsClient`. The server
  // pass renders the same header-plus-spinner the boundary falls back to, so
  // there's no visible handoff at hydration.
  const isClient = useIsClient();

  return (
    <div data-cy="game-detail" className="absolute inset-0 bg-canvas flex flex-col z-10 overflow-hidden">
      {isClient ? (
        <GameDetailLoader
          gameId={gameId}
          onBack={onBack}
          onPlayer={onPlayer}
          onTeam={onTeam}
        />
      ) : (
        <GameDetailPending onBack={onBack} />
      )}
    </div>
  );
}

/**
 * Owns the request and the boundary. Split from `GameDetailBody` because the
 * component that creates the promise must not be the one that suspends — see
 * the note on `useApiResource`.
 */
function GameDetailLoader({
  gameId,
  onBack,
  onPlayer,
  onTeam,
}: {
  gameId: number;
  onBack: () => void;
  onPlayer: (id: number) => void;
  onTeam: (abbr: string) => void;
}) {
  // Freshness over everything: `useApiResource` has no cache tier at all, so
  // this mount goes to the network and so does every poll. `refreshOnVisible`
  // covers the returning-from-a-background-tab case, where the poll timer has
  // been throttled or paused outright; the body adds a `focus` listener for the
  // same reason.
  //
  // `pollWhile` retires the interval once the game can no longer change, so a
  // completed game costs exactly one request. The visibility and focus refetches
  // deliberately survive that, as the cheap recovery path for a late correction.
  const { resource, refresh, refreshing, generation } = useApiResource<GameDetailData>(
    `/api/mlb/game/${gameId}`,
    { pollMs: POLL_MS, refreshOnVisible: true, pollWhile: gameCanStillChange },
  );

  // Keyed per game, so arriving at a different game suspends into the spinner
  // rather than showing the previous game's box score. Polls replace the
  // resource inside a transition and leave the key alone, so a live game's
  // numbers swap in place without the view ever blinking back to the fallback.
  return (
    <Suspense key={gameId} fallback={<GameDetailPending onBack={onBack} />}>
      <GameDetailBody
        resource={resource}
        refresh={refresh}
        refreshing={refreshing}
        generation={generation}
        onPlayer={onPlayer}
        onTeam={onTeam}
        onBack={onBack}
      />
    </Suspense>
  );
}

/** Header bar plus spinner. Shown for the server pass and until the first
 *  request settles. The back affordance is deliberately live here so a slow
 *  feed can't trap the user on a blank screen. */
function GameDetailPending({ onBack }: { onBack: () => void }) {
  return (
    <div
      data-cy="game-detail-pending"
      className="px-3.5 md:px-6 pb-2.5 bg-surface border-b border-line-2 pt-4"
    >
      <div className="flex items-center gap-2">
        <BackChevron onClick={onBack} label="Scores" />
        <div className="flex-1" />
      </div>
      <Loader />
    </div>
  );
}

function GameDetailBody({
  resource,
  refresh,
  refreshing,
  generation,
  onBack,
  onPlayer,
  onTeam,
}: {
  resource: ApiResource<GameDetailData>;
  refresh: () => void;
  refreshing: boolean;
  generation: number;
  onBack: () => void;
  onPlayer: (id: number) => void;
  onTeam: (abbr: string) => void;
}) {
  // Suspends until the request settles. A failed request resolves to the last
  // good payload plus an `error`, so a dropped poll leaves the box score up
  // instead of tearing it down.
  const { data, error } = use(resource);
  const [tab, setTab] = useTabParam<SubTab>("tab", "summary", SUB_TABS);
  // User-initiated tab change. Fires TAB_NAVIGATION with the destination tab
  // in `target` so GTM can attribute engagement per sub-view. Re-clicks of the
  // active tab are filtered out — those aren't navigations. Programmatic
  // fallbacks below (e.g., dropping out of "pitches" when pitch-by-pitch is
  // disabled) intentionally bypass this and call `setTab` directly.
  const handleTabChange = (next: SubTab) => {
    if (next === tab) return;
    sendToDataLayer({ event: events.TAB_NAVIGATION, target: next });
    setTab(next);
  };

  // Local debounce for the manual-refresh button. The button is disabled
  // whenever a refresh is in flight (`refreshing`) AND for a short cooldown
  // after each manual click — so rapid taps can't queue back-to-back
  // requests against the MLB API. The cooldown is short enough (1.5s) to
  // not feel sticky if the user genuinely wants a second fetch.
  const REFRESH_COOLDOWN_MS = 1500;
  const [refreshCooldown, setRefreshCooldown] = useState(false);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    };
  }, []);
  const refreshDisabled = refreshing || refreshCooldown;
  const handleManualRefresh = () => {
    if (refreshDisabled) return;
    refresh();
    setRefreshCooldown(true);
    cooldownTimerRef.current = setTimeout(
      () => setRefreshCooldown(false),
      REFRESH_COOLDOWN_MS,
    );
  };

  // `refreshOnVisible` on the hook covers `visibilitychange`. Window `focus`
  // is a separate signal it doesn't watch — a tab can be visible the whole time
  // while the browser itself sits in the background, where timers are throttled
  // just the same — so cover that here. `refresh` is a stable useCallback, so
  // this binds once per mount.
  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const user = useUser();
  const prefs = user?.prefs ?? DEFAULT_PREFS;
  const subTabs = ([
    "summary",
    "box",
    "plays",
    ...(prefs.pitchByPitch ? ["pitches"] : []),
    "spray",
  ] as SubTab[]);

  const game = data?.summary;
  const isLive = game?.status === "LIVE";

  // Live score in the browser-tab title — updates with each poll/refresh so a
  // user with multiple tabs open can glance at the tab strip and see the
  // current state without focusing the window. Example: "1 (PHI) - 0 (DET)".
  useTitle(
    game
      ? `${game.awayScore ?? 0} (${game.away}) - ${game.homeScore ?? 0} (${game.home})`
      : null,
  );

  // If the user disables pitch-by-pitch while viewing it — or arrives via a
  // stale ?tab=pitches URL — fall back to summary. Must be an effect now that
  // setTab writes to the router; calling that during render warns.
  useEffect(() => {
    if (!prefs.pitchByPitch && tab === "pitches") setTab("summary");
  }, [prefs.pitchByPitch, tab, setTab]);

  // Collapse the hero (team columns + big score) once the user starts scrolling
  // and fold the team scores into the bases/outs strip below. Only meaningful
  // for live games — non-live games don't render the bases/outs strip, so we
  // keep the hero pinned.
  const [scrolled, setScrolled] = useState(false);
  const condensed = scrolled && isLive;
  const [headlineH, setHeadlineH] = useState(0);
  // Callback ref so the ResizeObserver attaches the moment the hero element
  // mounts (the `{game && (...)}` block renders only after the API resolves,
  // so a useEffect with [] deps would fire before the ref is populated).
  const observerRef = useRef<ResizeObserver | null>(null);
  const headlineRef = useCallback((el: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!el) return;
    const measure = () => setHeadlineH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    observerRef.current = ro;
  }, []);
  const onScrollContent = (e: React.UIEvent<HTMLDivElement>) => {
    setScrolled(e.currentTarget.scrollTop > 15);
  };

  return (
    <>
      <div className="px-3.5 md:px-6 pb-2.5 bg-surface border-b border-line-2 pt-4">
        <div className="flex items-center gap-2">
          <BackChevron onClick={onBack} label="Scores" />
          <div className="flex-1" />
          {isLive && (
            <RefreshCountdown key={generation} intervalMs={POLL_MS} />
          )}
          {isLive && (
            <button
              data-cy="manual-refresh"
              type="button"
              onClick={handleManualRefresh}
              disabled={refreshDisabled}
              aria-label={refreshing ? "Refreshing game data…" : "Refresh game data"}
              aria-busy={refreshing}
              className={`p-1.5 rounded-full bg-transparent border-none flex items-center justify-center transition-opacity ${refreshDisabled ? "cursor-default opacity-40" : "cursor-pointer hover:bg-chip"
                }`}
            >
              <IconRefresh
                size={16}
                stroke="var(--color-live)"
                className={refreshDisabled ? "animate-spin" : ""}
              />
            </button>
          )}
          {isLive && (
            <span
              data-cy="live-pill"
              className="inline-flex items-center gap-1.5 text-[10px] font-bold text-live tracking-widest px-2 py-0.5 rounded-full"
              style={{
                background: "color-mix(in srgb, var(--color-live) 12%, transparent)",
                border: "1px solid color-mix(in srgb, var(--color-live) 40%, transparent)",
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-live dl-live-pulse" />
              LIVE
            </span>
          )}
        </div>

        {error && <div className="p-6 text-neg">Failed to load game.</div>}

        {game && (
          <div className="mt-3 px-1">
            <div
              data-cy="hero-headline"
              aria-hidden={condensed}
              className="overflow-hidden transition-[height,opacity] duration-200 ease-out"
              style={{
                height: headlineH ? (condensed ? 0 : headlineH) : undefined,
                opacity: condensed ? 0 : 1,
              }}
            >
              <div ref={headlineRef}>
                <div className="flex items-center gap-3.5">
                  <TeamColumn abbr={game.away} record={game.awayRecord} onTeam={onTeam} />
                  <div className="flex-[1.2] text-center">
                    <div className="font-head text-[42px] font-bold text-ink tracking-[-1.5px] leading-none">
                      <span>{game.awayScore ?? 0}</span>
                      <span className="text-ink-3 mx-2">–</span>
                      <span>{game.homeScore ?? 0}</span>
                    </div>
                    <div
                      className={`mt-2 text-[11px] font-bold tracking-[1.2px] font-ui uppercase ${isLive ? "text-live" : "text-ink-2"
                        }`}
                    >
                      {isLive
                        ? `${game.inningHalf ?? ""} ${game.inning ?? ""}${ord(game.inning)}`
                        : game.status === "FINAL"
                          ? "FINAL"
                          : formatLocalTime(game.time) ?? game.statusDetail}
                    </div>
                  </div>
                  <TeamColumn abbr={game.home} record={game.homeRecord} onTeam={onTeam} />
                </div>
              </div>
            </div>

            {isLive && (
              <div className="mt-3.5 flex items-center py-2 border-t border-line-2">
                <ScoreChip
                  side="away"
                  abbr={game.away}
                  score={game.awayScore ?? 0}
                  visible={condensed}
                />

                <div className="flex-1 flex items-center justify-center gap-4.5">
                  <BaseDiamond bases={game.bases ?? [false, false, false]} size={32} />
                  <div className="font-mono text-[13px] text-ink">
                    <span className="font-semibold">
                      {game.balls ?? 0}-{game.strikes ?? 0}
                    </span>
                    <span className="text-ink-3 text-[9px] ml-1">B-K</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <OutDots outs={game.outs ?? 0} />
                    <span className="text-[10px] text-ink-3 font-mono">OUTS</span>
                  </div>
                </div>

                <ScoreChip
                  side="home"
                  abbr={game.home}
                  score={game.homeScore ?? 0}
                  visible={condensed}
                />
              </div>
            )}

          </div>
        )}

        {data && (
          <div className="mt-2.5 flex overflow-x-auto">
            {subTabs.map((t) => {
              const on = tab === t;
              return (
                <button
                  key={t}
                  data-cy="sub-tab"
                  data-cy-tab={t}
                  onClick={() => handleTabChange(t)}
                  className={`px-3.5 py-2 bg-transparent cursor-pointer shrink-0 capitalize font-ui text-[13px] border-b-2 ${on ? "text-ink font-bold border-accent" : "text-ink-2 font-medium border-transparent"
                    }`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {data && (
        <div
          data-cy="game-detail-scroll"
          onScroll={onScrollContent}
          className="flex-1 overflow-y-auto px-3.5 md:px-6 pt-3.5 pb-20 w-full max-w-275 mx-auto"
        >
          {tab === "summary" && (
            <SummaryTab
              data={data}
              onPlayer={onPlayer}
              units={prefs.boxScoreUnits}
              showWinProbability={prefs.winProbability}
            />
          )}
          {tab === "box" && <BoxTab data={data} onPlayer={onPlayer} />}
          {tab === "plays" && <PlaysTab plays={data.plays} />}
          {tab === "pitches" && (
            <PitchesTab data={data} units={prefs.boxScoreUnits} onPlayer={onPlayer} />
          )}
          {tab === "spray" && (
            <SprayTab spray={data.spray} currentBatterId={data.atBat?.batter.id} />
          )}
        </div>
      )}
    </>
  );
}

/**
 * Seconds until the next automatic refresh of the live feed.
 *
 * Two deliberate choices. It is its own component because it re-renders once a
 * second and `GameDetailBody` renders d3 charts that must not — keeping the
 * interval and the state down here means only this `<span>` re-renders. And it
 * carries no reset logic at all: the parent gives it `key={generation}`, so each
 * refresh remounts it and the countdown restarts from a fresh `useState`.
 *
 * The count restarts when a refresh *lands*, not when it is issued, so it can
 * sit on 0 for the fraction of a second between the poll firing and its response
 * committing. It parks on 0 for longer in two honest cases: a backgrounded tab,
 * where the browser has throttled the poll timer, and a request that is hanging
 * or has failed — `generation` only reaches this component once a replacement
 * actually commits. In both, a refresh really is overdue. No separate in-flight
 * glyph: the refresh button beside this already spins while one is running.
 */
function RefreshCountdown({ intervalMs }: { intervalMs: number }) {
  const [remaining, setRemaining] = useState(() => Math.round(intervalMs / 1000));

  useEffect(() => {
    const id = setInterval(() => {
      setRemaining((r) => (r > 0 ? r - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <span
      data-cy="refresh-countdown"
      data-cy-remaining={remaining}
      // A per-second live region would be punishing to hear; the refresh button
      // beside this already carries an accessible label and `aria-busy`.
      aria-hidden="true"
      title="Time to next refresh"
      className="font-mono text-[10px] text-ink-3 tracking-[0.4px] tabular-nums"
    >
      {remaining}s
    </span>
  );
}

/**
 * Compact team + score that lives in the game-state strip when the hero is
 * collapsed. Animates in/out via `max-width` + `opacity` so it never affects
 * the centered bases/B-K/outs cluster when invisible.
 */
function ScoreChip({
  side,
  abbr,
  score,
  visible,
}: {
  side: "away" | "home";
  abbr: string;
  score: number;
  visible: boolean;
}) {
  const order = side === "away" ? "" : "flex-row-reverse";
  return (
    <div
      data-cy="score-chip"
      data-cy-side={side}
      aria-hidden={!visible}
      className={`flex items-center gap-2 overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-200 ease-out ${order} ${visible ? "max-w-30 opacity-100" : "max-w-0 opacity-0"
        }`}
    >
      <TeamBadge abbr={abbr} size={22} />
      <span className="font-head text-[18px] font-bold text-ink tracking-[-0.4px] leading-none">
        {score}
      </span>
    </div>
  );
}

function TeamColumn({
  abbr,
  record,
  onTeam,
}: {
  abbr: string;
  record?: TeamRecord;
  onTeam: (abbr: string) => void;
}) {
  const t = TEAMS[abbr];
  return (
    <div className="flex-1 flex flex-col items-center gap-1">
      <button
        onClick={() => onTeam(abbr)}>
        <TeamBadge abbr={abbr} size={42} />
      </button>
      <button
        onClick={() => onTeam(abbr)}
        className="bg-transparent border-none cursor-pointer font-head text-[15px] font-bold text-ink tracking-[-0.2px]"
      >
        {t?.city ?? abbr}
      </button>
      {record && (
        <div data-cy="team-record" className="font-mono text-[11px] text-ink-3 tracking-[0.4px]">
          {record.w} - {record.l}
        </div>
      )}
    </div>
  );
}

/** "Kodai Senga" → "K. Senga". Falls back to the input when the name isn't
 *  obviously a "First Last" pair (single-token mononyms, suffixes, etc.). */
function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2 || !parts[0]) return fullName;
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
}

/** Strip shown beneath the box-score cards on FINAL games crediting W / L / SV.
 *  Each role is its own button so tapping a name jumps to that pitcher's
 *  detail page. Roles that don't apply (e.g. no save) are omitted. */
function DecisionsStrip({
  decisions,
  onPlayer,
}: {
  decisions: GameDecisions;
  onPlayer: (id: number) => void;
}) {
  const entries: Array<{ key: string; label: string; p: PitcherRef | undefined }> = [
    { key: "w", label: "W", p: decisions.winner },
    { key: "l", label: "L", p: decisions.loser },
    { key: "sv", label: "SV", p: decisions.save },
  ];
  const visible = entries.filter((e) => e.p);
  if (visible.length === 0) return null;
  return (
    <div
      data-cy="decisions-strip"
      className="px-1 flex items-baseline gap-x-4 gap-y-1 flex-wrap"
    >
      {visible.map(({ key, label, p }) => (
        <button
          key={key}
          data-cy="decision"
          data-cy-decision={key}
          onClick={() => onPlayer(p!.id)}
          className="bg-transparent border-none cursor-pointer p-0 flex items-baseline gap-1"
        >
          <span className="font-mono text-[9px] tracking-[1.2px] text-ink-3 font-bold uppercase">
            {label}
          </span>
          <span className="font-head text-[11px] font-bold text-ink tracking-[-0.2px]">
            {shortName(p!.fullName)}
          </span>
        </button>
      ))}
    </div>
  );
}

/** Strip shown beneath the (empty) box-score cards on SCHEDULED games listing
 *  each team's probable starter. Either slot may be empty if a team hasn't
 *  named their starter — those render as "TBD". */
function ProbablesStrip({
  away,
  home,
  starters,
  onPlayer,
}: {
  away: string;
  home: string;
  starters: ProbableStarters;
  onPlayer: (id: number) => void;
}) {
  return (
    <div
      data-cy="probables-strip"
      className="px-1 flex items-baseline gap-2 flex-wrap"
    >
      <ProbablePitcher abbr={away} pitcher={starters.away} onPlayer={onPlayer} />
      <span className="font-mono text-[9px] tracking-[1.2px] text-ink-3 font-bold uppercase">
        vs
      </span>
      <ProbablePitcher abbr={home} pitcher={starters.home} onPlayer={onPlayer} />
    </div>
  );
}

function ProbablePitcher({
  abbr,
  pitcher,
  onPlayer,
}: {
  abbr: string;
  pitcher: PitcherRef | undefined;
  onPlayer: (id: number) => void;
}) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="font-mono text-[9px] tracking-[1.2px] text-ink-3 font-bold uppercase">
        {abbr}
      </span>
      {pitcher ? (
        <button
          data-cy="probable-pitcher"
          onClick={() => onPlayer(pitcher.id)}
          className="bg-transparent border-none cursor-pointer p-0 font-head text-[11px] font-bold text-ink tracking-[-0.2px]"
        >
          {shortName(pitcher.fullName)}
        </button>
      ) : (
        <span className="font-head text-[11px] text-ink-3 tracking-[-0.2px]">TBD</span>
      )}
    </span>
  );
}

/* ── Summary tab ──────────────────────────────────────────────── */

function SummaryTab({
  data,
  onPlayer,
  units,
  showWinProbability,
}: {
  data: GameDetailData;
  onPlayer: (id: number) => void;
  units: BoxScoreUnits;
  showWinProbability: boolean;
}) {
  const { summary, linescore, plays, atBat, winProbability, decisions, probableStarters } = data;

  // The server now hands us the freshest available at-bat: either the live one
  // (isComplete=false) or, between at-bats, the just-finished one with its
  // terminal pitch included (isComplete=true). That second case is what drives
  // the result banner above the strike zone.
  const showAtBatCard = summary.status === "LIVE" && !!atBat;
  const priorOutcome = atBat?.isComplete ? plays[0] ?? null : null;

  return (
    <div className="flex flex-col gap-3.5">
      {showAtBatCard && atBat && (
        <AtBatCard ab={atBat} onPlayer={onPlayer} units={units} priorOutcome={priorOutcome} />
      )}

      {linescore && (
        <div className="bg-surface border border-line rounded-[14px] px-1 py-3 overflow-x-auto">
          <div
            className="grid items-center font-mono text-xs pb-1.5 border-b border-line-2 text-ink-3"
            style={{
              gridTemplateColumns: `40px repeat(${linescore.innings.length}, 1fr) 26px 26px 26px`,
            }}
          >
            <div />
            {linescore.innings.map((_, i) => (
              <div key={i} className="text-center">{i + 1}</div>
            ))}
            <div className="text-center text-ink-2 font-bold">R</div>
            <div className="text-center text-ink-2 font-bold">H</div>
            <div className="text-center text-ink-2 font-bold">E</div>
          </div>
          {(["away", "home"] as const).map((side, idx) => {
            const abbr = side === "away" ? summary.away : summary.home;
            const tot = linescore.totals[side];
            return (
              <div
                key={side}
                className={`grid items-center py-2 ${idx === 1 ? "border-t border-line-2" : ""}`}
                style={{
                  gridTemplateColumns: `40px repeat(${linescore.innings.length}, 1fr) 26px 26px 26px`,
                }}
              >
                <div className="pl-2 flex items-center gap-1.5">
                  <TeamBadge abbr={abbr} size={22} />
                </div>
                {linescore.innings.map((inn, i) => (
                  <div
                    key={i}
                    className={`text-center font-mono text-[13px] font-semibold ${inn[side] == null ? "text-ink-3" : "text-ink"
                      }`}
                  >
                    {inn[side] == null ? "·" : inn[side]}
                  </div>
                ))}
                <div className="text-center font-mono text-[13px] font-bold text-accent">{tot.r}</div>
                <div className="text-center font-mono text-[13px] text-ink">{tot.h}</div>
                <div className="text-center font-mono text-[13px] text-ink">{tot.e}</div>
              </div>
            );
          })}
        </div>
      )}

      {summary.status === "FINAL" && decisions && (
        <DecisionsStrip decisions={decisions} onPlayer={onPlayer} />
      )}
      {summary.status === "SCHEDULED" && probableStarters && (
        <ProbablesStrip
          away={summary.away}
          home={summary.home}
          starters={probableStarters}
          onPlayer={onPlayer}
        />
      )}

      {showWinProbability && winProbability && (
        <WinProbabilityCard
          away={summary.away}
          home={summary.home}
          probs={winProbability}
        />
      )}

      <div className="bg-surface border border-line rounded-[14px] p-3.5">
        <div className="text-[10px] tracking-[1.2px] uppercase text-ink-3 font-bold mb-2.5">
          Recent
        </div>
        {plays.length === 0 && <div className="text-ink-3 text-[13px]">No plays yet.</div>}
        <div className="flex flex-col gap-2">
          {plays.slice(0, 4).map((p, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span className="font-mono text-[10px] text-ink-3 w-11.5 shrink-0 pt-0.75">
                {p.half}
              </span>
              {p.tag && (
                <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-sm bg-accent text-white shrink-0 mt-0.5">
                  {p.tag}
                </span>
              )}
              <div className="flex-1 text-[13px] text-ink leading-snug">{p.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {(summary.venue || summary.weather) && (
        <div className="bg-surface border border-line rounded-[14px] p-3.5 text-xs text-ink-2 font-ui leading-relaxed">
          {summary.venue && (
            <div>
              <strong className="text-ink">Venue.</strong> {summary.venue}
            </div>
          )}
          {summary.weather && (
            <div>
              <strong className="text-ink">Weather.</strong> {summary.weather}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Win Probability card ─────────────────────────────────────── */

function WinProbabilityCard({
  away,
  home,
  probs,
}: {
  away: string;
  home: string;
  probs: WinProbability;
}) {
  const awayPct = Math.round(probs.away);
  const homePct = 100 - awayPct;
  const awayColor = TEAMS[away]?.primary ?? "var(--color-accent)";
  const homeColor = TEAMS[home]?.primary ?? "var(--color-ink-2)";

  return (
    <div className="bg-surface border border-line rounded-[14px] p-3.5">
      <div className="text-[10px] tracking-[1.2px] uppercase text-ink-3 font-bold mb-3">
        Win Probability
      </div>

      {/* Current-state strip: team badges flanking the current %. The chart's
          rightmost point shows the same info implicitly, but a numeric readout
          stays useful as a quick glance before the eye finds the line's right
          edge — and unambiguous when probabilities cluster near 50%. */}
      <div className="flex items-center mb-3">
        <div className="flex items-center gap-1.5">
          <TeamBadge abbr={away} size={22} />
          <span className="font-mono text-[15px] font-bold text-ink tracking-[-0.3px]">
            {awayPct}%
          </span>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-1.5 flex-row-reverse">
          <TeamBadge abbr={home} size={22} />
          <span className="font-mono text-[15px] font-bold text-ink tracking-[-0.3px]">
            {homePct}%
          </span>
        </div>
      </div>

      {probs.plays.length >= 2 ? (
        <WinProbabilityChart
          plays={probs.plays}
          away={away}
          home={home}
          awayColor={awayColor}
          homeColor={homeColor}
        />
      ) : (
        <div className="text-[11px] text-ink-3 font-mono py-3 text-center">
          Chart populates once plays begin.
        </div>
      )}
    </div>
  );
}

/** Win-probability line chart drawn over the per-play series. The line is the
 *  home team's win probability; the area between the line and the 50% midline
 *  is shaded in the home color when home is favored and the away color when
 *  away is favored, giving an at-a-glance sense of which team has held the
 *  edge over the course of the game.
 *
 *  Rendering pattern: React owns the DOM, d3 owns the math. We use d3-scale
 *  for axis mapping and d3-shape for the line/area path-`d` strings, then
 *  render the SVG with plain JSX — no refs, no useEffect, no .selectAll().
 *  Re-renders flow naturally when `plays` changes; d3 work is memoized so
 *  hover state changes don't re-run it.
 *
 *  Interaction: pointer-move tracks the nearest play and surfaces its detail
 *  in the panel beneath the chart. `touch-action: pan-y` lets the page still
 *  scroll vertically on mobile while horizontal moves drive the cursor. */
function WinProbabilityChart({
  plays,
  away,
  home,
  awayColor,
  homeColor,
}: {
  plays: WinProbabilityPlay[];
  away: string;
  home: string;
  awayColor: string;
  homeColor: string;
}) {
  // `useId` colons are valid in HTML5 ids but trip some URL parsers when used
  // in `url(#…)` references — sanitize defensively.
  const rawId = useId();
  const safeId = rawId.replace(/[^A-Za-z0-9_-]/g, "-");
  const aboveClipId = `wpc-above-${safeId}`;
  const belowClipId = `wpc-below-${safeId}`;

  const W = 320;
  const H = 130;
  const padL = 8;
  const padR = 8;
  const padT = 8;
  const padB = 18; // room for inning labels along the bottom
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // All d3 work is pure functions of `plays`. Memoize so hover-driven
  // re-renders don't recompute scales, generators, and inning ticks.
  const { x, y, midY, areaPath, linePath, inningTicks } = useMemo(() => {
    const xScale = scaleLinear()
      .domain([0, Math.max(1, plays.length - 1)])
      .range([padL, padL + innerW]);
    const yScale = scaleLinear().domain([0, 100]).range([padT + innerH, padT]);
    const mid = yScale(50);

    // One area generator from the 50% baseline up/down to the home line. The
    // same path string gets drawn twice with two different clipPaths — clipped
    // to the upper half it stains home-color, clipped to the lower half it
    // stains away-color. One generator, two visual effects.
    const areaGen = d3Area<WinProbabilityPlay>()
      .x((_, i) => xScale(i))
      .y0(mid)
      .y1((d) => yScale(d.home))
      .curve(curveMonotoneX);
    const lineGen = d3Line<WinProbabilityPlay>()
      .x((_, i) => xScale(i))
      .y((d) => yScale(d.home))
      .curve(curveMonotoneX);

    const ticks: Array<{ x: number; inning: number }> = [];
    const seen = new Set<number>();
    plays.forEach((p, i) => {
      if (p.inning != null && !seen.has(p.inning)) {
        seen.add(p.inning);
        ticks.push({ x: xScale(i), inning: p.inning });
      }
    });

    return {
      x: xScale,
      y: yScale,
      midY: mid,
      areaPath: areaGen(plays) ?? "",
      linePath: lineGen(plays) ?? "",
      inningTicks: ticks,
    };
  }, [plays, innerW, innerH]);

  /** Convert a client-space pointer event to the nearest play index. The
   *  viewBox lets us proportionally map the bounding-rect-relative x straight
   *  to chart space without going through `createSVGPoint`/`getScreenCTM`. */
  const idxFromPointer = (e: React.PointerEvent<SVGSVGElement>): number | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return null;
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    const dataIdx = Math.round(x.invert(svgX));
    if (dataIdx < 0 || dataIdx >= plays.length) return null;
    return dataIdx;
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const idx = idxFromPointer(e);
    setHoverIdx(idx);
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    // On touch, capturing the pointer lets us keep tracking even if the
    // finger drifts slightly outside the SVG before lifting.
    if (e.pointerType !== "mouse") {
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    const idx = idxFromPointer(e);
    setHoverIdx(idx);
  };

  const handlePointerLeave = () => setHoverIdx(null);

  // The play surfaced in the info panel — hovered if active, latest otherwise.
  // Always showing something keeps the card a stable height and gives readers
  // useful context at rest (description + score for the most recent play).
  const activeIdx = hoverIdx ?? plays.length - 1;
  const activePlay = plays[activeIdx];
  // Probability swing from the previous play. Null at the very first play
  // since there's no prior state to diff against.
  const swing =
    activeIdx > 0 ? activePlay.home - plays[activeIdx - 1].home : null;
  const swingFavored: "home" | "away" | null =
    swing == null || Math.abs(swing) < 0.05 ? null : swing > 0 ? "home" : "away";

  return (
    <div data-cy="win-probability-chart">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto block cursor-crosshair"
        style={{ touchAction: "pan-y" }}
        role="img"
        aria-label="Win probability over the course of the game"
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerDown}
        onPointerLeave={handlePointerLeave}
        onPointerCancel={handlePointerLeave}
      >
        <defs>
          <clipPath id={aboveClipId}>
            <rect x={padL} y={padT} width={innerW} height={Math.max(0, midY - padT)} />
          </clipPath>
          <clipPath id={belowClipId}>
            <rect x={padL} y={midY} width={innerW} height={Math.max(0, padT + innerH - midY)} />
          </clipPath>
        </defs>

        <rect
          x={padL}
          y={padT}
          width={innerW}
          height={innerH}
          fill="var(--color-chip)"
          opacity={0.4}
          rx={3}
        />

        {inningTicks.map((t) => (
          <line
            key={`tick-${t.inning}`}
            x1={t.x}
            y1={padT}
            x2={t.x}
            y2={padT + innerH}
            stroke="var(--color-line-2)"
            strokeWidth={0.5}
          />
        ))}

        <line
          x1={padL}
          y1={midY}
          x2={padL + innerW}
          y2={midY}
          stroke="var(--color-line)"
          strokeWidth={0.75}
          strokeDasharray="3 3"
        />

        <path
          d={areaPath}
          fill={homeColor}
          fillOpacity={0.45}
          clipPath={`url(#${aboveClipId})`}
        />
        <path
          d={areaPath}
          fill={awayColor}
          fillOpacity={0.45}
          clipPath={`url(#${belowClipId})`}
        />

        <path d={linePath} fill="none" stroke="var(--color-ink)" strokeWidth={1.5} />

        {inningTicks.map((t) => (
          <text
            key={`lbl-${t.inning}`}
            x={t.x}
            y={padT + innerH + 11}
            fontSize={9}
            fill="var(--color-ink-3)"
            textAnchor="middle"
            fontFamily="var(--font-mono)"
          >
            {t.inning}
          </text>
        ))}

        {hoverIdx != null && (
          <>
            <line
              x1={x(hoverIdx)}
              y1={padT}
              x2={x(hoverIdx)}
              y2={padT + innerH}
              stroke="var(--color-ink-2)"
              strokeWidth={1}
              pointerEvents="none"
            />
            <circle
              cx={x(hoverIdx)}
              cy={y(plays[hoverIdx].home)}
              r={3.5}
              fill="var(--color-ink)"
              stroke="var(--color-surface)"
              strokeWidth={1.25}
              pointerEvents="none"
            />
          </>
        )}
      </svg>

      <div
        data-cy="wp-play-info"
        data-cy-hovering={hoverIdx != null ? "true" : "false"}
        className="mt-2 px-1"
      >
        <div className="flex items-baseline gap-2 font-mono text-[10px] text-ink-3 tracking-[0.4px]">
          <span className="font-bold text-ink-2 uppercase">
            {activePlay.half ?? ""} {activePlay.inning ?? "—"}
          </span>
          {activePlay.awayScore != null && activePlay.homeScore != null && (
            <span>
              {away} {activePlay.awayScore}
              <span className="text-ink-3"> – </span>
              {activePlay.homeScore} {home}
            </span>
          )}
          <div className="flex-1" />
          <span style={{ color: awayColor }} className="font-bold">
            {Math.round(activePlay.away)}%
          </span>
          {swing != null && swingFavored && (
            <span
              className="font-bold"
              style={{
                color: swingFavored === "home" ? homeColor : awayColor,
              }}
              aria-label={`${swingFavored === "home" ? home : away} gained ${Math.abs(swing).toFixed(1)} percent`}
            >
              {swingFavored === "home" ? "▲" : "▼"}
              {Math.abs(swing).toFixed(1)}
            </span>
          )}
          <span style={{ color: homeColor }} className="font-bold">
            {Math.round(activePlay.home)}%
          </span>
        </div>
        {activePlay.desc && (
          <div className="mt-1 text-[12px] text-ink leading-snug line-clamp-2">
            {activePlay.desc}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── At-Bat card ──────────────────────────────────────────────── */

function AtBatCard({
  ab,
  onPlayer,
  units,
  priorOutcome,
}: {
  ab: AtBat;
  onPlayer: (id: number) => void;
  units: BoxScoreUnits;
  priorOutcome?: Play | null;
}) {
  const isPrior = !!priorOutcome;
  return (
    <div className="bg-surface border border-line rounded-[14px] overflow-hidden">
      <div className="px-3.5 py-2.5 flex items-center gap-2 border-b border-line-2">
        {!isPrior && <span className="w-1.5 h-1.5 rounded-[3px] bg-live" />}
        <span className="text-[10px] tracking-[1.2px] text-ink font-extrabold uppercase">
          {isPrior ? "Last At Bat" : "At Bat"}
        </span>
        <span className="font-mono text-[11px] text-ink-3 ml-1.5">{ab.inningLabel}</span>
        <div className="flex-1" />
        <span className="font-mono text-[11px] text-ink-3">
          <span className="text-ink font-bold">{ab.pitcher.pitchCountGame}</span> pitches
        </span>
      </div>

      <div
        className="grid items-center gap-2 p-3.5 border-b border-line-2"
        style={{ gridTemplateColumns: "1fr 76px 1fr" }}
      >
        <button
          onClick={() => onPlayer(ab.pitcher.id)}
          className="text-left bg-transparent border-none cursor-pointer p-0 flex flex-col gap-0.5"
        >
          <div className="text-[9px] tracking-widest text-ink-3 font-bold uppercase font-ui">
            P · {ab.pitcher.hand}HP
          </div>
          <div className="font-head text-[17px] font-bold text-ink tracking-[-0.4px] leading-[1.1]">
            {ab.pitcher.lastName}
          </div>
          <div className="font-mono text-[11px] text-ink-2 mt-0.5">
            <span className="text-ink font-bold">{ab.pitcher.today.ip} IP</span>
            <span className="text-ink-3"> · </span>
            <span className="tracking-[0.4px]">
              {ab.pitcher.today.k}K {ab.pitcher.today.bb}BB {ab.pitcher.today.er}ER
            </span>
          </div>
        </button>

        <div className="flex flex-col items-center gap-0.5">
          <div className="font-head text-2xl font-bold text-ink tracking-[-1px] leading-none">
            {ab.count.b}–{ab.count.s}
          </div>
          <div className="text-[8px] tracking-widest text-ink-3 font-bold uppercase">B / K</div>
          <div className="mt-1 flex items-center gap-1">
            <OutDots outs={ab.outs} />
            <span className="text-[8px] text-ink-3 font-mono tracking-[0.4px]">OUT</span>
          </div>
        </div>

        <button
          onClick={() => onPlayer(ab.batter.id)}
          className="text-right bg-transparent border-none cursor-pointer p-0 flex flex-col gap-0.5 items-end"
        >
          <div className="text-[9px] tracking-widest text-ink-3 font-bold uppercase font-ui">
            AB · {ab.batter.hand}HB
          </div>
          <div className="font-head text-[17px] font-bold text-ink tracking-[-0.4px] leading-[1.1]">
            {ab.batter.lastName}
          </div>
          <div className="font-mono text-[11px] text-ink-2 mt-0.5">
            <span className="text-ink font-bold">{ab.batter.today.line}</span>
            {ab.batter.seasonAvg && (
              <>
                <span className="text-ink-3"> · </span>
                <span>{ab.batter.seasonAvg}</span>
              </>
            )}
          </div>
        </button>
      </div>

      <div className="p-3.5">
        {priorOutcome && (
          <div className="mb-3 flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-chip">
            <span className="text-[9px] tracking-[1.4px] text-ink-3 font-extrabold uppercase shrink-0">
              Result
            </span>
            {priorOutcome.tag && (
              <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-sm bg-accent text-white shrink-0">
                {priorOutcome.tag}
              </span>
            )}
            <div className="flex-1 text-[12px] text-ink leading-tight">{priorOutcome.desc}</div>
          </div>
        )}
        <StrikeZoneViz pitches={ab.pitches} hand={ab.batter.hand} units={units} />
      </div>

      {ab.pitches.length > 0 && (
        <div className="border-t border-line-2">
          <div className="px-3.5 pt-2 pb-1.5 flex items-center gap-2.5">
            <span className="text-[9px] tracking-[1.4px] text-ink-3 font-extrabold uppercase">
              Pitch Log
            </span>
            <div className="flex-1 h-px bg-line-2" />
            <span className="font-mono text-[10px] text-ink-3">{ab.pitches.length} pitches</span>
          </div>
          <PitchTicker pitches={ab.pitches} units={units} />
        </div>
      )}
    </div>
  );
}

/* ── Strike zone ──────────────────────────────────────────────── */

/** Zone geometry, shared by every plot that draws into it so the at-bat view
 *  and the pitcher sheet's location plot stay dimensionally identical. */
const ZONE = { w: 280, h: 280, cx: 140, cy: 130, zw: 120, zh: 140 } as const;
const ZONE_L = ZONE.cx - ZONE.zw / 2;
const ZONE_R = ZONE.cx + ZONE.zw / 2;
const ZONE_T = ZONE.cy - ZONE.zh / 2;
const ZONE_B = ZONE.cy + ZONE.zh / 2;

/** Zone coordinates (interior -1..1) → SVG user units. */
const zoneX = (x: number) => ZONE.cx + x * (ZONE.zw / 2);
const zoneY = (y: number) => ZONE.cy - y * (ZONE.zh / 2);

/**
 * The zone itself: backing panel, rule-of-thirds grid, home plate, and the
 * batter-side markers — everything except the pitches. Callers draw their own
 * marks as children using `zoneX`/`zoneY`.
 *
 * The zone is drawn from the catcher's perspective: looking out at the
 * pitcher, third base is on the left and first base on the right. A
 * right-handed batter stands in the third-base box, so the RHB marker belongs
 * on the LEFT and a lefty on the RIGHT.
 */
function StrikeZoneFrame({
  hands,
  handTestId,
  redrawKey,
  children,
}: {
  /** Batter-side markers to label. Dimmed ones read as context rather than a
   *  statement about who's hitting — used when a plot spans both sides. */
  hands: Array<{ hand: "L" | "R"; dim?: boolean }>;
  handTestId?: string;
  /** Changing this re-runs the zone's draw-on animation. */
  redrawKey?: string | number;
  children?: React.ReactNode;
}) {
  const plateY = ZONE.cy + ZONE.zh / 2 + 50;
  const plateW = 80;
  const plate = [
    [ZONE.cx - plateW / 2, plateY],
    [ZONE.cx + plateW / 2, plateY],
    [ZONE.cx + plateW / 2, plateY + 14],
    [ZONE.cx, plateY + 28],
    [ZONE.cx - plateW / 2, plateY + 14],
  ]
    .map((p) => p.join(","))
    .join(" ");

  return (
    <div className="relative flex justify-center">
      <svg viewBox={`0 0 ${ZONE.w} ${ZONE.h}`} className="w-full max-w-[320px] h-auto block">
        <rect x={ZONE_L - 18} y={ZONE_T - 18} width={ZONE.zw + 36} height={ZONE.zh + 36} fill="var(--color-chip)" opacity={0.5} rx="3" />
        <rect x={ZONE_L} y={ZONE_T} width={ZONE.zw} height={ZONE.zh} fill="var(--color-surface)" />
        <g key={redrawKey} fill="none">
          <rect x={ZONE_L} y={ZONE_T} width={ZONE.zw} height={ZONE.zh} pathLength="1" stroke="var(--color-ink-2)" strokeWidth="1.5" className="dl-zone-demarc" />
          <line x1={ZONE_L + ZONE.zw / 3} y1={ZONE_T} x2={ZONE_L + ZONE.zw / 3} y2={ZONE_B} pathLength="1" stroke="var(--color-line)" strokeWidth="0.75" className="dl-zone-demarc" style={{ animationDelay: "120ms" }} />
          <line x1={ZONE_L + (2 * ZONE.zw) / 3} y1={ZONE_T} x2={ZONE_L + (2 * ZONE.zw) / 3} y2={ZONE_B} pathLength="1" stroke="var(--color-line)" strokeWidth="0.75" className="dl-zone-demarc" style={{ animationDelay: "180ms" }} />
          <line x1={ZONE_L} y1={ZONE_T + ZONE.zh / 3} x2={ZONE_R} y2={ZONE_T + ZONE.zh / 3} pathLength="1" stroke="var(--color-line)" strokeWidth="0.75" className="dl-zone-demarc" style={{ animationDelay: "240ms" }} />
          <line x1={ZONE_L} y1={ZONE_T + (2 * ZONE.zh) / 3} x2={ZONE_R} y2={ZONE_T + (2 * ZONE.zh) / 3} pathLength="1" stroke="var(--color-line)" strokeWidth="0.75" className="dl-zone-demarc" style={{ animationDelay: "300ms" }} />
        </g>

        <text x={ZONE_L - 6} y={ZONE_T - 6} fontSize="8" fill="var(--color-ink-3)" fontFamily="var(--font-mono)" letterSpacing="0.5" textAnchor="end">
          HIGH
        </text>
        <text x={ZONE_L - 6} y={ZONE_B + 14} fontSize="8" fill="var(--color-ink-3)" fontFamily="var(--font-mono)" letterSpacing="0.5" textAnchor="end">
          LOW
        </text>
        {hands.map(({ hand, dim }) => (
          <text
            key={hand}
            data-cy={handTestId}
            data-cy-hand={hand}
            x={hand === "R" ? ZONE_L - 8 : ZONE_R + 8}
            y={ZONE.cy + 4}
            fontSize="9"
            fontFamily="var(--font-mono)"
            fill={dim ? "var(--color-ink-3)" : "var(--color-ink-2)"}
            opacity={dim ? 0.55 : 1}
            letterSpacing="0.5"
            textAnchor={hand === "R" ? "end" : "start"}
          >
            {hand}HB
          </text>
        ))}

        <polygon points={plate} fill="var(--color-surface-2)" stroke="var(--color-ink-2)" strokeWidth="1" />
        <text x={ZONE.cx} y={plateY + 46} fontSize="8" fill="var(--color-ink-3)" fontFamily="var(--font-mono)" letterSpacing="0.6" textAnchor="middle">
          CATCHER VIEW
        </text>

        {children}
      </svg>
    </div>
  );
}

/** The live at-bat's zone: every pitch of the plate appearance, each bubble
 *  carrying its velocity and sequence number. */
function StrikeZoneViz({ pitches, hand, units }: { pitches: Pitch[]; hand: "L" | "R"; units: BoxScoreUnits }) {
  return (
    <StrikeZoneFrame
      hands={[{ hand }]}
      handTestId="batter-hand-indicator"
      redrawKey={pitches.length}
    >
      {pitches.map((p) => {
        const px = zoneX(p.x);
        const py = zoneY(p.y);
        const c = PITCH_RESULT_COLORS[p.result];
        return (
          <g key={p.n}>
            <circle cx={px} cy={py} r="10" fill={c.fill} stroke="var(--color-surface)" strokeWidth="1.5" />
            <text x={px} y={py + 3} textAnchor="middle" fontSize="9" fontWeight="700" fontFamily="var(--font-mono)" fill={c.ink} letterSpacing="-0.3">
              {Math.round(units === "metric" ? p.velo * 1.609344 : p.velo)}
            </text>
            <circle cx={px + 8.5} cy={py - 8.5} r="5.5" fill="var(--color-ink)" stroke="var(--color-surface)" strokeWidth="1.25" />
            <text x={px + 8.5} y={py - 6.5} textAnchor="middle" fontSize="7" fontWeight="700" fontFamily="var(--font-mono)" fill="var(--color-surface)">
              {p.n}
            </text>
          </g>
        );
      })}
    </StrikeZoneFrame>
  );
}

function PitchTicker({ pitches, units }: { pitches: Pitch[]; units: BoxScoreUnits }) {
  return (
    <div className="flex flex-col">
      {[...pitches].reverse().map((p, i) => {
        const c = PITCH_RESULT_COLORS[p.result];
        const typeName = PITCH_TYPE_NAMES[p.type] || p.type || "—";
        return (
          <div
            key={p.n}
            className={`grid items-center gap-2.5 px-3.5 py-2 ${i === 0 ? "" : "border-t border-line-2"}`}
            style={{ gridTemplateColumns: "24px 36px 1fr auto auto" }}
          >
            <div className="w-[22px] h-[22px] rounded-[5px] bg-chip text-ink-2 flex items-center justify-center font-mono text-[11px] font-bold">
              {p.n}
            </div>
            <div className="flex items-center gap-1">
              <span
                className="w-3.5 h-3.5 rounded-[7px] inline-block"
                style={{ background: c.fill }}
              />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-head text-[13px] font-bold text-ink tracking-[-0.2px]">
                {typeName}
              </span>
              <span className="font-mono text-[11px] text-ink-3">{p.type}</span>
            </div>
            <div className="font-mono text-[13px] font-bold text-ink tracking-[-0.3px] min-w-12.5 text-right">
              {(() => { const v = formatVelo(p.velo, units); return <>{v.value}<span className="text-[9px] text-ink-3 font-medium ml-0.5">{v.label}</span></>; })()}
            </div>
            <div className="font-ui text-xs text-ink-2 min-w-23 text-right">{p.label}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Box tab ──────────────────────────────────────────────────── */

function BoxTab({ data, onPlayer }: { data: GameDetailData; onPlayer: (id: number) => void }) {
  const { summary, awayLineup, homeLineup, awayPitching, homePitching } = data;
  return (
    <div className="flex flex-col gap-3.5">
      <BoxSection abbr={summary.away} lineup={awayLineup} pitching={awayPitching} onPlayer={onPlayer} />
      <BoxSection abbr={summary.home} lineup={homeLineup} pitching={homePitching} onPlayer={onPlayer} />
    </div>
  );
}

function BoxSection({
  abbr,
  lineup,
  pitching,
  onPlayer,
}: {
  abbr: string;
  lineup: BoxLineupRow[];
  pitching: BoxPitchingRow[];
  onPlayer: (id: number) => void;
}) {
  const t = TEAMS[abbr];
  return (
    <div className="bg-surface border border-line rounded-[14px] relative">
      <div className="px-3.5 py-3 flex items-center gap-2.5 border-b border-line-2">
        <TeamBadge abbr={abbr} size={26} />
        <div className="font-head text-[15px] font-bold text-ink tracking-[-0.2px]">
          {t?.name ?? abbr}
        </div>
      </div>
      <div className="py-2">
        <div
          className="grid px-3.5 py-1.5 font-mono text-[10px] text-ink-3 tracking-[0.4px] border-b border-line-2
          md:relative sticky -top-4 bg-surface z-5000"
          style={{ gridTemplateColumns: "1.6fr 24px 24px 24px 24px 24px 24px 40px" }}
        >
          <span className="text-left bg-surface">BATTING</span>
          <span className="text-right bg-surface">AB</span>
          <span className="text-right bg-surface">R</span>
          <span className="text-right bg-surface">H</span>
          <span className="text-right bg-surface">RBI</span>
          <span className="text-right bg-surface">BB</span>
          <span className="text-right bg-surface">K</span>
          <span className="text-right bg-surface">AVG</span>
        </div>
        {lineup.length === 0 && (
          <div className="p-3.5 text-xs text-ink-3">Lineup not posted yet.</div>
        )}
        {lineup.map((r) => (
          <button
            key={r.id}
            data-cy="box-player-row"
            data-cy-player-id={r.id}
            data-cy-sub={r.isSub ? "true" : undefined}
            onClick={() => onPlayer(r.id)}
            className="w-full grid items-center px-3.5 py-2 bg-transparent border-none cursor-pointer text-left border-b border-line-2"
            style={{ gridTemplateColumns: "1.6fr 24px 24px 24px 24px 24px 24px 40px" }}
          >
            <span
              className={`font-ui text-[13px] text-ink overflow-hidden text-ellipsis whitespace-nowrap ${r.isSub ? "pl-4 text-ink-2" : ""}`}
            >
              {r.name} <span className="text-ink-3 text-[10px]">{r.pos}</span>
            </span>
            {(["ab", "r", "h", "rbi", "bb", "k"] as const).map((k) => (
              <span key={k} className="font-mono text-xs text-ink text-right">
                {r[k]}
              </span>
            ))}
            <span className="font-mono text-xs text-ink-2 text-right">{r.avg ?? ""}</span>
          </button>
        ))}
      </div>
      <div className="py-2 border-t border-line">
        <div
          className="grid px-3.5 py-1.5 font-mono text-[10px] text-ink-3 tracking-[0.4px] border-b border-line-2
          md:relative sticky -top-4 bg-surface z-5000"
          style={{ gridTemplateColumns: "1.6fr 32px 24px 24px 24px 24px 24px" }}
        >
          <span className="text-left bg-surface">PITCHING</span>
          <span className="text-right bg-surface">IP</span>
          <span className="text-right bg-surface">H</span>
          <span className="text-right bg-surface">R</span>
          <span className="text-right bg-surface">ER</span>
          <span className="text-right bg-surface">BB</span>
          <span className="text-right bg-surface">K</span>
        </div>
        {pitching.length === 0 && (
          <div className="p-3.5 text-xs text-ink-3">No pitching data yet.</div>
        )}
        {pitching.map((r) => (
          <button
            key={r.id}
            data-cy="box-player-row"
            data-cy-player-id={r.id}
            onClick={() => onPlayer(r.id)}
            className="w-full grid items-center px-3.5 py-2 bg-transparent border-none cursor-pointer text-left border-b border-line-2"
            style={{ gridTemplateColumns: "1.6fr 32px 24px 24px 24px 24px 24px" }}
          >
            <span className="font-ui text-[13px] text-ink overflow-hidden text-ellipsis whitespace-nowrap">
              {r.name}
            </span>
            <span className="font-mono text-xs text-ink text-right">{r.ip}</span>
            <span className="font-mono text-xs text-ink text-right">{r.h}</span>
            <span className="font-mono text-xs text-ink text-right">{r.r}</span>
            <span className="font-mono text-xs text-ink text-right">{r.er}</span>
            <span className="font-mono text-xs text-ink text-right">{r.bb}</span>
            <span className="font-mono text-xs text-ink text-right">{r.k}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Plays tab ────────────────────────────────────────────────── */

function PlaysTab({ plays }: { plays: Play[] }) {
  const [scoringOnly, setScoringOnly] = useState(false);
  // Slide the indicator between All/Scoring rather than toggling each pill's
  // own background. The key matches the `data-sliding-key` on each button;
  // paddingOffset (3) matches the `p-1` track — same value Leaders uses.
  const { containerRef: filterTrackRef, pos: filterPillPos } = useSlidingPill(
    scoringOnly ? "scoring" : "all",
    3,
  );
  if (plays.length === 0) {
    return <div className="p-6 text-ink-3 text-center">No plays yet.</div>;
  }
  const visible = scoringOnly ? plays.filter((p) => p.score) : plays;
  return (
    <div className="flex flex-col gap-3">
      <div
        ref={filterTrackRef}
        data-cy="plays-filter"
        className="relative flex items-center gap-1 bg-surface border border-line rounded-full p-1 self-end"
      >
        <span
          aria-hidden
          className="absolute inset-y-1 rounded-full bg-accent pointer-events-none transition-[transform,width] duration-200 ease-out"
          style={{
            transform: `translateX(${filterPillPos?.left ?? 0}px)`,
            width: filterPillPos?.width ?? 0,
            opacity: filterPillPos ? 1 : 0,
          }}
        />
        {([
          ["all", "All", false],
          ["scoring", "Scoring", true],
        ] as const).map(([key, label, value]) => {
          const on = scoringOnly === value;
          return (
            <button
              key={key}
              type="button"
              data-cy="plays-filter-option"
              data-cy-filter={key}
              data-sliding-key={key}
              aria-pressed={on}
              onClick={() => setScoringOnly(value)}
              className={`relative px-3 py-1 rounded-full border-none bg-transparent cursor-pointer font-ui text-[11px] font-bold uppercase tracking-[0.8px] transition-colors duration-200 ${on ? "text-white" : "text-ink-2"
                }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      {visible.length === 0 ? (
        <div className="p-6 text-ink-3 text-center">No scoring plays yet.</div>
      ) : (
        <div data-cy="plays-list" className="bg-surface border border-line rounded-[14px] overflow-hidden">
          {visible.map((p, i) => (
            <div
              key={i}
              data-cy="play-row"
              className={`grid items-center gap-2 px-3.5 py-3 ${i === visible.length - 1 ? "" : "border-b border-line-2"}`}
              style={{ gridTemplateColumns: "60px 40px 1fr 60px" }}
            >
              <span className="font-mono text-[10px] text-ink-3 tracking-[0.5px]">{p.half}</span>
              {p.tag ? (
                <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-sm bg-accent text-white w-fit">
                  {p.tag}
                </span>
              ) : (
                <span />
              )}
              <div className="text-[13px] text-ink leading-snug">{p.desc}</div>
              {p.score && (
                <span className="font-mono text-xs text-ink-2 text-right font-semibold">{p.score}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Pitches tab ──────────────────────────────────────────────── */

function PitchesTab({
  data,
  units,
  onPlayer,
}: {
  data: GameDetailData;
  units: BoxScoreUnits;
  onPlayer: (id: number) => void;
}) {
  const { summary, awayPitching, homePitching } = data;

  // `open` is tracked alongside the id rather than by nulling the selection, so
  // the sheet keeps its subject through the close animation. The row itself is
  // re-resolved from `data` on every render — the feed polls every 10s, and a
  // sheet left open on a live arm should tick up with it, not freeze on the
  // snapshot that was current when it was tapped.
  const [sheet, setSheet] = useState<{ id: number; open: boolean } | null>(null);
  const openPitcher = useCallback((id: number) => setSheet({ id, open: true }), []);
  const closePitcher = useCallback(
    () => setSheet((s) => (s ? { ...s, open: false } : s)),
    [],
  );
  const selected = useMemo(() => {
    if (!sheet) return null;
    const away = awayPitching.find((p) => p.id === sheet.id);
    if (away) return { pitcher: away, abbr: summary.away };
    const home = homePitching.find((p) => p.id === sheet.id);
    if (home) return { pitcher: home, abbr: summary.home };
    return null;
  }, [sheet, awayPitching, homePitching, summary.away, summary.home]);

  const playsWithPitches = data.plays.filter((p) => p.pitchSeq && p.pitchSeq.length > 0);
  const hasUsage = [...awayPitching, ...homePitching].some(
    (p) => p.pitchUsage && p.pitchUsage.length > 0,
  );

  if (!hasUsage && playsWithPitches.length === 0) {
    return <div className="p-6 text-ink-3 text-center">No pitch data yet.</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      <PitchUsageCard abbr={summary.away} pitchers={awayPitching} onPitcher={openPitcher} />
      <PitchUsageCard abbr={summary.home} pitchers={homePitching} onPitcher={openPitcher} />

      <h3>Recent At-Bats</h3>

      {playsWithPitches.map((p, i) => (
        <div key={i} className="bg-surface border border-line rounded-[14px] overflow-hidden">
          <div className="px-3.5 py-2.5 border-b border-line-2">
            <div className="font-mono text-[10px] text-ink-3">{p.half}</div>
            <div className="text-[13px] text-ink mt-0.5">{p.desc}</div>
          </div>
          <div>
            {p.pitchSeq!.map((s, j) => (
              <div
                key={j}
                className={`grid items-center gap-2.5 px-3.5 py-2 ${j === 0 ? "" : "border-t border-line-2"}`}
                style={{ gridTemplateColumns: "32px 60px 60px 1fr" }}
              >
                <span className="font-mono text-[11px] text-ink-3">P{s.n}</span>
                <span className="font-head font-bold text-[13px] text-ink">
                  {PITCH_TYPE_NAMES[s.type] || s.type || "—"}
                </span>
                <span className="font-mono text-xs text-ink">
                  {formatVelo(s.velo, units).value}
                  <span className="text-[9px] text-ink-3 font-medium ml-0.5">{formatVelo(s.velo, units).label}</span>
                </span>
                <span className="font-ui text-xs text-ink-2 text-right">{s.result}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {selected && (
        <PitcherGameSheet
          open={sheet?.open ?? false}
          onClose={closePitcher}
          abbr={selected.abbr}
          pitcher={selected.pitcher}
          units={units}
          onPlayer={onPlayer}
        />
      )}
    </div>
  );
}

/* ── Pitch usage ──────────────────────────────────────────────── */

/** Per-team card listing each pitcher's pitch-type breakdown for this game. */
function PitchUsageCard({
  abbr,
  pitchers,
  onPitcher,
}: {
  abbr: string;
  pitchers: BoxPitchingRow[];
  onPitcher: (id: number) => void;
}) {
  const withUsage = pitchers.filter((p) => p.pitchUsage && p.pitchUsage.length > 0);
  if (withUsage.length === 0) return null;
  return (
    <div className="bg-surface border border-line rounded-[14px] p-3.5">
      <div className="text-[10px] tracking-[1.2px] uppercase text-ink-3 font-bold mb-3">
        {abbr} · Pitching
      </div>
      <div className="flex flex-col gap-5">
        {withUsage.map((p) => (
          <PitcherUsage key={p.id} pitcher={p} onPitcher={onPitcher} />
        ))}
      </div>
    </div>
  );
}

interface MixEntry {
  type: string;
  count: number;
  pct: number;
}

/** Pitch-type counts as ordered shares of a population — most-used first.
 *  The sheet tallies a filtered subset of pitches; the usage card passes the
 *  whole game. Both land here so they can't disagree on how a split is read. */
function mixEntries(counts: Record<string, number>): { entries: MixEntry[]; total: number } {
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  if (total === 0) return { entries: [], total: 0 };
  const entries = Object.entries(counts)
    .map(([type, count]) => ({ type, count, pct: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
  return { entries, total };
}

/** The whole game's mix for one pitcher, drawn from the boxscore tally. */
function pitchMix(pitcher: BoxPitchingRow) {
  const counts: Record<string, number> = {};
  for (const u of pitcher.pitchUsage ?? []) counts[u.type] = (counts[u.type] ?? 0) + u.count;
  return mixEntries(counts);
}

function PitcherUsage({
  pitcher,
  onPitcher,
}: {
  pitcher: BoxPitchingRow;
  onPitcher: (id: number) => void;
}) {
  const { entries, total } = pitchMix(pitcher);
  if (total === 0) return null;

  return (
    <div>
      <div className="mb-2.5">
        <div className="flex items-baseline gap-2">
          <button
            data-cy="pitcher-usage-name"
            data-cy-player-id={pitcher.id}
            aria-haspopup="dialog"
            onClick={() => onPitcher(pitcher.id)}
            className="font-head text-[20px] font-bold text-ink tracking-[-0.5px] leading-none bg-transparent border-none cursor-pointer p-0 text-left"
          >
            {pitcher.name}
          </button>
          {pitcher.live && (
            <span className="inline-flex items-center gap-1 text-[10px] font-extrabold tracking-[1.2px] text-live">
              <span className="w-1.5 h-1.5 rounded-full bg-live" />
              LIVE
            </span>
          )}
        </div>
        <div className="mt-1 font-mono text-[12px] flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          <span className="font-bold text-ink">{pitcher.pitches ?? total}P</span>
          <span className="text-ink-3">·</span>
          <span className="text-ink-2">{pitcher.ip} IP</span>
          <span className="text-ink-3">·</span>
          <span className="text-ink-2">
            <span className="text-ink font-bold">{pitcher.k}</span>K
          </span>
          <span className="text-ink-2">
            <span className="text-ink font-bold">{pitcher.bb}</span>BB
          </span>
          <span className="text-ink-2">
            <span className="text-ink font-bold">{pitcher.h}</span>H
          </span>
          <span className="text-ink-2">
            <span className="text-ink font-bold">{pitcher.er}</span>ER
          </span>
        </div>
      </div>

      <div className="h-2.5 rounded-sm overflow-hidden flex bg-chip mb-3">
        {entries.map((e) => (
          <div key={e.type} style={{ width: `${e.pct}%`, background: pitchColor(e.type) }} />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-x-5 gap-y-2">
        {entries.map((e) => (
          <div key={e.type} className="flex items-center gap-2.5">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: pitchColor(e.type) }}
            />
            <span className="font-mono text-[12px] font-bold text-ink-2 w-6">{e.type}</span>
            <span className="font-ui text-[13px] text-ink flex-1">
              {PITCH_TYPE_NAMES[e.type] ?? e.type}
            </span>
            <span className="font-mono text-[13px] font-bold text-ink">{e.pct}%</span>
            <span className="font-mono text-[12px] text-ink-3 w-7 text-right">({e.count})</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Pitcher game sheet ───────────────────────────────────────── */

/** Section heading inside the sheet — matches the usage card's rubric. */
function SheetSection({
  label,
  aside,
  children,
}: {
  label: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between gap-2 mb-2.5">
        <div className="text-[10px] tracking-[1.2px] uppercase text-ink-3 font-bold">{label}</div>
        {aside && <div className="font-mono text-[11px] text-ink-3">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

/** One label/value pair in the sheet's game line. Borrows the player-detail
 *  table's rubric — grey uppercase key over a bold mono value — so the two
 *  screens read as the same stat vocabulary. */
function SheetStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div data-cy="pitcher-sheet-stat" data-cy-stat={label} className="flex gap-1 items-center">
      <div className="font-ui text-[10px] font-bold tracking-[1.2px] uppercase text-ink-3">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-[12px] font-semibold text-ink">{value}</div>
    </div>
  );
}

/** Which batters to count: both sides, or one of them. */
type BatterHand = "all" | "L" | "R";

const HAND_OPTIONS: ReadonlyArray<{ key: BatterHand; label: string }> = [
  { key: "all", label: "All" },
  { key: "L", label: "LHB" },
  { key: "R", label: "RHB" },
];

/** Segmented control for batter handedness. Same sliding-pill track the Plays
 *  tab's filter uses, so it reads as a native part of the app. */
function BatterHandFilter({
  value,
  onChange,
}: {
  value: BatterHand;
  onChange: (next: BatterHand) => void;
}) {
  const { containerRef, pos } = useSlidingPill(value, 3);
  return (
    <div
      ref={containerRef}
      data-cy="pitcher-sheet-hand-filter"
      role="group"
      aria-label="Batter handedness"
      className="relative flex items-center gap-1 bg-surface border border-line rounded-full p-1"
    >
      <span
        aria-hidden
        className="absolute inset-y-1 rounded-full bg-accent pointer-events-none transition-[transform,width] duration-200 ease-out"
        style={{
          transform: `translateX(${pos?.left ?? 0}px)`,
          width: pos?.width ?? 0,
          opacity: pos ? 1 : 0,
        }}
      />
      {HAND_OPTIONS.map(({ key, label }) => {
        const on = value === key;
        return (
          <button
            key={key}
            type="button"
            data-cy="pitcher-sheet-hand-option"
            data-cy-hand={key}
            data-cy-selected={on ? "true" : "false"}
            data-sliding-key={key}
            aria-pressed={on}
            onClick={() => onChange(key)}
            className={`relative px-2.5 py-0.5 rounded-full border-none bg-transparent cursor-pointer font-ui text-[10px] font-bold uppercase tracking-[0.8px] transition-colors duration-200 ${on ? "text-white" : "text-ink-2"
              }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The pitch mix as a wrapping row of chips. With `onSelect` they're a
 * single-select group driving the zone plot; without it they're a plain
 * readout (the fallback when the feed carries no plate coordinates).
 */
function PitchMixChips({
  entries,
  selected,
  onSelect,
}: {
  entries: MixEntry[];
  selected: string | null;
  onSelect?: (type: string) => void;
}) {
  return (
    <div
      data-cy="pitcher-sheet-mix"
      role={onSelect ? "radiogroup" : undefined}
      aria-label={onSelect ? "Pitch type" : undefined}
      className="flex flex-wrap gap-1.5"
    >
      {entries.map((e) => {
        const on = onSelect ? e.type === selected : false;
        const name = PITCH_TYPE_NAMES[e.type] ?? e.type;
        const body = (
          <>
            <span
              className="w-2 h-2 rounded-full shrink-0 self-center"
              style={{ background: pitchColor(e.type) }}
            />
            <span className="font-mono text-[12px] font-bold text-ink">{e.type}</span>
            <span className="font-mono text-[12px] text-ink-2">{e.pct}%</span>
            <span className="font-mono text-[11px] text-ink-3">({e.count})</span>
          </>
        );
        const shell = "inline-flex items-baseline gap-1.5 pl-2 pr-2.5 py-1 rounded-full border";
        if (!onSelect) {
          return (
            <span
              key={e.type}
              data-cy="pitcher-sheet-mix-chip"
              data-cy-type={e.type}
              title={name}
              className={`${shell} bg-chip border-transparent`}
            >
              {body}
            </span>
          );
        }
        return (
          <button
            key={e.type}
            type="button"
            data-cy="pitcher-sheet-mix-chip"
            data-cy-type={e.type}
            data-cy-selected={on ? "true" : "false"}
            role="radio"
            aria-checked={on}
            aria-label={`${name}, ${e.count} pitches`}
            title={name}
            onClick={() => onSelect(e.type)}
            className={`${shell} cursor-pointer transition-colors ${on ? "bg-active border-accent" : "bg-chip border-transparent hover:border-line"
              }`}
          >
            {body}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Where one pitch type landed across the whole game. Unlike the at-bat zone
 * these are plain dots — a starter's fastball is 40 pitches, and velo bubbles
 * at that density would be unreadable — colored by outcome so the plot carries
 * a second dimension beyond location.
 */
function PitchLocationPlot({
  pitches,
  hand,
  units,
}: {
  pitches: PitchLocation[];
  hand: BatterHand;
  units: BoxScoreUnits;
}) {
  return (
    <StrikeZoneFrame
      // Both sides are labeled when nothing is filtered out, with the active
      // side solid — the markers orient the view rather than claiming a batter.
      hands={
        hand === "all"
          ? [
            { hand: "R", dim: true },
            { hand: "L", dim: true },
          ]
          : [{ hand }]
      }
      handTestId="pitch-plot-hand-marker"
    // Deliberately no redrawKey: the zone is a fixed backdrop here, and
    // re-running its draw-on animation every time a chip is toggled would
    // pull the eye to the chrome instead of the dots that actually changed.
    >
      <g data-cy="pitcher-sheet-zone">
        {pitches.map((p, i) => (
          <circle
            key={i}
            data-cy="pitch-location-dot"
            data-cy-result={p.result}
            cx={zoneX(p.x)}
            cy={zoneY(p.y)}
            r="5"
            fill={PITCH_RESULT_COLORS[p.result].fill}
            fillOpacity={0.85}
            stroke="var(--color-surface)"
            strokeWidth="1.25"
          >
            <title>
              {`${formatVelo(p.velo, units).value} ${formatVelo(p.velo, units).label} · ${PITCH_RESULT_COLORS[p.result].label} · vs ${p.batterHand}HB`}
            </title>
          </circle>
        ))}
      </g>
    </StrikeZoneFrame>
  );
}

/**
 * Richer read on one pitcher's outing, launched from their name in the Pitches
 * tab. Everything here is this-game-only except the season ERA in the subtitle;
 * the player's career/season page is one tap away via the profile link.
 */
function PitcherGameSheet({
  open,
  onClose,
  abbr,
  pitcher,
  units,
  onPlayer,
}: {
  open: boolean;
  onClose: () => void;
  abbr: string;
  pitcher: BoxPitchingRow;
  units: BoxScoreUnits;
  onPlayer: (id: number) => void;
}) {
  const gameMix = pitchMix(pitcher);
  const total = gameMix.total;

  // Locations are what make the zone plot possible; without them the section
  // degrades to the static readout it was before.
  const locations = useMemo(() => pitcher.pitchLocations ?? [], [pitcher.pitchLocations]);
  const [handFilter, setHandFilter] = useState<BatterHand>("all");
  const [pickedType, setPickedType] = useState<string | null>(null);

  const inHand = useMemo(
    () =>
      handFilter === "all"
        ? locations
        : locations.filter((l) => l.batterHand === handFilter),
    [locations, handFilter],
  );

  // With locations in hand the mix is tallied from the *filtered* population,
  // so the chips and the plot always describe the same set of pitches. A type
  // he never threw to this side simply isn't offered.
  const mix = useMemo(() => {
    if (locations.length === 0) return gameMix;
    const counts: Record<string, number> = {};
    for (const l of inHand) counts[l.type] = (counts[l.type] ?? 0) + 1;
    return mixEntries(counts);
    // gameMix is recomputed each render from `pitcher`; depending on it here
    // would defeat the memo, and it's only read on the no-locations path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations.length, inHand, pitcher.pitchUsage]);

  // Resolved at render rather than synced in an effect: when the hand filter
  // drops the selected type, selection falls back to the most-used remaining
  // one instead of blanking the plot for a frame.
  const activeType =
    pickedType && mix.entries.some((e) => e.type === pickedType)
      ? pickedType
      : (mix.entries[0]?.type ?? null);

  const plotted = useMemo(
    () => (activeType ? inHand.filter((l) => l.type === activeType) : []),
    [inHand, activeType],
  );

  // Velo rides along on every location row, so the caption can average the
  // exact set being plotted. A zeroed velo means the feed didn't report one
  // (same convention formatVelo reads), so those are left out rather than
  // dragging the average toward zero.
  const avgVelo = useMemo(() => {
    const known = plotted.filter((l) => l.velo > 0);
    if (known.length === 0) return null;
    return known.reduce((sum, l) => sum + l.velo, 0) / known.length;
  }, [plotted]);

  const hasMix = locations.length > 0 || gameMix.entries.length > 0;

  // The transform backfills `balls` whenever `strikes` is present, so one guard
  // covers both columns and the rate derived from them.
  const strikes = pitcher.strikes;
  const balls = pitcher.balls;
  const hasSplit =
    typeof strikes === "number" && typeof balls === "number" && strikes + balls > 0;

  // Box-score reading order first, then the count work. Anything the feed
  // hasn't populated drops out rather than showing a placeholder dash.
  const topLine: Array<{ label: string; value: string | number }> = [
    { label: "IP", value: pitcher.ip },
    { label: "K", value: pitcher.k },
    { label: "BB", value: pitcher.bb },
    { label: "H", value: pitcher.h },
    { label: "R", value: pitcher.r },
    { label: "Pitches", value: pitcher.pitches ?? total },
  ]

  const line: Array<{ label: string; value: string | number }> = [
    { label: "ER", value: pitcher.er },
    { label: "HR", value: pitcher.hr },
    ...(hasSplit
      ? [
        { label: "STR", value: strikes! },
        { label: "BALL", value: balls! },
        { label: "STR%", value: `${Math.round((strikes! / (strikes! + balls!)) * 100)}%` },
      ]
      : []),
    ...(typeof pitcher.bf === "number" ? [{ label: "BF", value: pitcher.bf }] : []),
  ];

  const subtitle = [
    `${abbr} · Pitching`,
    `${pitcher.ip} IP`,
    pitcher.era ? `${pitcher.era} ERA` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={pitcher.name}
      subtitle={subtitle}
      testId="pitcher-game-sheet"
    >
      <div className="px-3.5 md:px-5 py-4 flex flex-col gap-5">
        <button
          type="button"
          data-cy="pitcher-sheet-profile"
          data-cy-player-id={pitcher.id}
          onClick={() => {
            onClose();
            onPlayer(pitcher.id);
          }}
          className="self-start bg-transparent border-none p-0 cursor-pointer font-ui text-[12px] text-ink-2 underline underline-offset-2 decoration-line hover:text-accent transition-colors"
        >
          View full player page
        </button>

        <SheetSection label="This Game">
          <ul data-cy="pitcher-top-line-sheet" className="flex gap-4 items-center mb-2
          py-1 border-b border-accent">
            {topLine.map((s) => (
              <li
                key={s.label}
                data-cy="pitcher-top-line-stat"
                data-cy-stat={s.label}
                className="flex gap-1 items-center"
              >
                <div className="font-ui text-[12px] font-bold tracking-[1.2px] uppercase text-ink-3">
                  {s.label}
                </div>
                <div className="font-mono text-[16px] font-semibold text-ink">
                  {s.value}
                </div>
              </li>
            ))}
          </ul>
          <div data-cy="pitcher-sheet-line" className="flex gap-4">
            {line.map((s) => (
              <SheetStat key={s.label} label={s.label} value={s.value} />
            ))}
          </div>
        </SheetSection>

        {hasMix && (
          <SheetSection
            label="Pitch Mix"
            aside={
              locations.length > 0 ? (
                <BatterHandFilter value={handFilter} onChange={setHandFilter} />
              ) : (
                `${mix.entries.length} types`
              )
            }
          >
            {/* Compact counterpart to the card that opened this sheet: one
                wrapping row of chips instead of a stacked bar over a
                two-column legend. With locations to plot the chips double as
                the plot's type selector; without them they stay a readout. */}
            <PitchMixChips
              entries={mix.entries}
              selected={activeType}
              onSelect={locations.length > 0 ? setPickedType : undefined}
            />

            {locations.length > 0 && activeType && (
              <div className="mt-3.5">
                <div data-cy="pitcher-sheet-zone-caption" className="text-center mb-1">
                  <span className="font-head text-[13px] font-bold text-ink tracking-[-0.2px]">
                    {PITCH_TYPE_NAMES[activeType] ?? activeType}
                  </span>
                  {/* Velo sits between the name and the count so the count
                      keeps its "N pitches vs LHB" reading intact. */}
                  {avgVelo !== null && (
                    <span data-cy="pitcher-sheet-zone-velo" className="font-mono text-[11px] text-ink-3">
                      {" · "}
                      {formatVelo(avgVelo, units).value} {formatVelo(avgVelo, units).label}
                    </span>
                  )}
                  <span className="font-mono text-[11px] text-ink-3">
                    {" · "}
                    {plotted.length} {plotted.length === 1 ? "pitch" : "pitches"}
                    {handFilter === "all" ? "" : ` vs ${handFilter}HB`}
                  </span>
                </div>
                <PitchLocationPlot pitches={plotted} hand={handFilter} units={units} />
                {/* Dots are colored by outcome, so the zone answers "where did
                    it land, and what happened" in one pass. */}
                <div className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-1">
                  {(["strike", "ball", "foul-2k", "inplay"] as const).map((r) => (
                    <span key={r} className="inline-flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: PITCH_RESULT_COLORS[r].fill }}
                      />
                      <span className="font-mono text-[10px] text-ink-3 tracking-[0.4px]">
                        {PITCH_RESULT_COLORS[r].label}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {locations.length > 0 && !activeType && (
              <div
                data-cy="pitcher-sheet-zone-empty"
                className="mt-3 p-6 text-center text-ink-3 text-[13px]"
              >
                No pitches to {handFilter === "L" ? "left" : "right"}-handed batters.
              </div>
            )}
          </SheetSection>
        )}
      </div>
    </BottomSheet>
  );
}

/* ── Spray tab ────────────────────────────────────────────────── */

function SprayTab({
  spray,
  currentBatterId,
}: {
  spray: BatterSpray[];
  currentBatterId?: number;
}) {
  const populated = spray.filter((s) => s.points.length > 0);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  if (populated.length === 0) {
    return <div className="p-6 text-ink-3 text-center">No batted-ball data yet.</div>;
  }

  // Resolve the visible batter: explicit user pick → current batter (if they
  // have spray data this game) → most-recent batter (spray[0], because the
  // transform sorts by recency desc).
  const inSpray = (id: number | undefined) => id != null && populated.some((s) => s.batterId === id);
  const effectiveId =
    (selectedId != null && inSpray(selectedId) ? selectedId : null) ??
    (inSpray(currentBatterId) ? (currentBatterId as number) : null) ??
    populated[0].batterId;

  const selected = populated.find((s) => s.batterId === effectiveId) ?? populated[0];

  return (
    <div className="flex flex-col gap-3">
      <BatterPicker
        batters={populated}
        selectedId={effectiveId}
        currentBatterId={currentBatterId}
        onSelect={setSelectedId}
      />
      <SprayCard spray={selected} />
    </div>
  );
}

function BatterPicker({
  batters,
  selectedId,
  currentBatterId,
  onSelect,
}: {
  batters: BatterSpray[];
  selectedId: number;
  currentBatterId?: number;
  onSelect: (id: number) => void;
}) {
  // Group by team abbr, preserving the (recency-sorted) order within each group.
  const byTeam = new Map<string, BatterSpray[]>();
  for (const b of batters) {
    const list = byTeam.get(b.team) ?? [];
    list.push(b);
    byTeam.set(b.team, list);
  }

  return (
    <label className="relative block w-full">
      <span className="sr-only">Choose batter</span>
      <select
        data-cy="batter-picker"
        value={String(selectedId)}
        onChange={(e) => onSelect(Number(e.target.value))}
        className="w-full appearance-none cursor-pointer bg-surface border border-line rounded-xl pl-3.5 pr-9 py-2.5 font-head text-[14px] font-semibold text-ink tracking-[-0.2px] focus:outline-none focus:border-accent"
      >
        {[...byTeam.entries()].map(([team, list]) => (
          <optgroup key={team} label={team}>
            {list.map((b) => (
              <option key={b.batterId} value={String(b.batterId)}>
                {b.batterId === currentBatterId ? "● " : ""}
                {b.lastName} ({b.points.length})
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <span
        aria-hidden="true"
        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-3 text-[11px] pointer-events-none font-mono"
      >
        ▾
      </span>
    </label>
  );
}

function SprayCard({ spray }: { spray: BatterSpray }) {
  const n = spray.points.length;
  return (
    <div className="bg-surface border border-line rounded-[14px] p-3.5">
      <div className="mb-2.5">
        <div className="font-head text-[18px] font-bold text-ink tracking-[-0.3px]">
          {spray.lastName} · Spray Chart
        </div>
        <div className="text-[12px] text-ink-2 mt-0.5">
          {n === 1 ? "1 batted ball" : `${n} batted balls`} · all outcomes
        </div>
      </div>
      <SprayField points={spray.points} />
      <SprayLegend />
    </div>
  );
}

/** Diamond + outfield wall + batted-ball dots, drawn in MLB's 0–250 hitData
 *  coordinate space (home plate ≈ (125, 205), y decreases toward the outfield). */
function SprayField({ points }: { points: SprayPoint[] }) {
  const HOME_X = 125;
  const HOME_Y = 205;
  const wallR = 175;
  const innerR = 110;
  const k = Math.SQRT1_2; // sin/cos of 45°

  const wallLF = { x: HOME_X - wallR * k, y: HOME_Y - wallR * k };
  const wallRF = { x: HOME_X + wallR * k, y: HOME_Y - wallR * k };
  const innerLF = { x: HOME_X - innerR * k, y: HOME_Y - innerR * k };
  const innerRF = { x: HOME_X + innerR * k, y: HOME_Y - innerR * k };

  // Infield diamond (home → 1B → 2B → 3B), 30-unit edge.
  const diamond = `${HOME_X},${HOME_Y} ${HOME_X + 30},${HOME_Y - 30} ${HOME_X},${HOME_Y - 60} ${HOME_X - 30},${HOME_Y - 30}`;

  return (
    <svg viewBox="0 0 250 240" className="w-full h-auto block mb-2.5 lg:max-w-[420px] lg:mx-auto">
      {/* Foul lines */}
      <line x1={HOME_X} y1={HOME_Y} x2={wallLF.x} y2={wallLF.y} stroke="var(--color-ink-3)" strokeWidth="1" />
      <line x1={HOME_X} y1={HOME_Y} x2={wallRF.x} y2={wallRF.y} stroke="var(--color-ink-3)" strokeWidth="1" />

      {/* Outfield wall arc */}
      <path
        d={`M ${wallLF.x} ${wallLF.y} A ${wallR} ${wallR} 0 0 1 ${wallRF.x} ${wallRF.y}`}
        fill="none"
        stroke="var(--color-line)"
        strokeWidth="0.75"
      />

      {/* Mid-outfield arc */}
      <path
        d={`M ${innerLF.x} ${innerLF.y} A ${innerR} ${innerR} 0 0 1 ${innerRF.x} ${innerRF.y}`}
        fill="none"
        stroke="var(--color-line-2)"
        strokeWidth="0.5"
      />

      {/* Infield diamond */}
      <polygon
        points={diamond}
        fill="var(--color-chip)"
        stroke="var(--color-line)"
        strokeWidth="0.75"
      />

      {/* Home plate marker */}
      <circle cx={HOME_X} cy={HOME_Y} r="2" fill="var(--color-ink-2)" />

      {/* Field labels */}
      <text x="38" y="180" fontSize="9" fill="var(--color-ink-3)" fontFamily="var(--font-mono)" letterSpacing="0.5">LF</text>
      <text x={HOME_X} y="125" fontSize="9" fill="var(--color-ink-3)" textAnchor="middle" fontFamily="var(--font-mono)" letterSpacing="0.5">CF</text>
      <text x="212" y="180" fontSize="9" fill="var(--color-ink-3)" fontFamily="var(--font-mono)" letterSpacing="0.5">RF</text>

      {/* Batted-ball points */}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r="4.5"
          fill={SPRAY_COLORS[p.outcome]}
          stroke="var(--color-surface)"
          strokeWidth="1"
        />
      ))}
    </svg>
  );
}

function SprayLegend() {
  const entries: SprayOutcome[] = ["HR", "2B", "1B", "OUT"];
  return (
    <div className="flex items-center gap-4 pt-0.5">
      {entries.map((o) => (
        <div key={o} className="flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: SPRAY_COLORS[o] }}
          />
          <span className="font-mono text-[11px] font-bold text-ink-2 tracking-[0.5px]">{o}</span>
        </div>
      ))}
    </div>
  );
}
