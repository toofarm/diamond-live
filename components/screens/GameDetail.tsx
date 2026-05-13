"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useApi } from "@/lib/mlb/client";
import type {
  AtBat,
  BatterSpray,
  BoxLineupRow,
  BoxPitchingRow,
  GameDetailData,
  Pitch,
  Play,
  SprayOutcome,
  SprayPoint,
  TeamRecord,
  WinProbability,
} from "@/lib/mlb/types";
import { TEAMS } from "@/lib/mlb/teams";
import { BackChevron, TeamBadge, BaseDiamond, Loader, OutDots } from "@/components/ui/primitives";
import { DEFAULT_PREFS, useUser, type BoxScoreUnits } from "@/lib/storage";
import { formatLocalTime } from "@/lib/date";
import { useTitle } from "@/lib/title";

/** Format pitch velocity in the user's preferred units. Returns the value + label. */
function formatVelo(mph: number, units: BoxScoreUnits): { value: string; label: string } {
  if (units === "metric") {
    const kph = mph * 1.609344;
    return { value: kph > 0 ? kph.toFixed(1) : "—", label: "KM/H" };
  }
  return { value: mph > 0 ? mph.toFixed(1) : "—", label: "MPH" };
}

type SubTab = "summary" | "box" | "plays" | "pitches" | "spray";

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

const PITCH_TYPE_NAMES: Record<string, string> = {
  FF: "4-Seam", FT: "2-Seam", SI: "Sinker", SL: "Slider",
  CB: "Curve", CU: "Curve", CH: "Changeup",
  CT: "Cutter", FC: "Cutter", FS: "Splitter",
  KC: "Knuckle", EP: "Eephus", FO: "Forkball",
};

/** Color per pitch type, used in the pitch-usage card on the Pitches tab. */
const PITCH_USAGE_COLORS: Record<string, string> = {
  FF: "#B83A2A", // 4-Seam — rust red
  FT: "#B83A2A", // 2-Seam
  SI: "#D97C2A", // Sinker — orange
  SL: "#2F6BD9", // Slider — cobalt
  FS: "#5DA3DA", // Splitter — sky blue
  CT: "#B95A92", // Cutter — magenta
  FC: "#B95A92",
  CB: "#5B3DAA", // Curve — purple
  CU: "#5B3DAA",
  KC: "#5B3DAA",
  CH: "#2E9D5B", // Changeup — green
  EP: "#8A8077",
  FO: "#8A8077",
};

function pitchColor(code: string): string {
  return PITCH_USAGE_COLORS[code] ?? "#8A8077";
}

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
  const { data, loading, error, refresh } = useApi<GameDetailData>(`/api/mlb/game/${gameId}`, { pollMs: 15_000 });
  const [tab, setTab] = useState<SubTab>("summary");

  // The 15s poll above keeps a foregrounded tab fresh, but browsers throttle
  // background-tab timers heavily (often paused entirely), so a user returning
  // to this view after switching away can see up-to-15s-stale data. Fire an
  // immediate refresh when the tab becomes visible or the window regains focus
  // so they're greeted with current game state. `refresh`'s identity changes
  // each useApi render, but registering/unregistering two listeners on each
  // change is negligible and the cleanup ensures we never double-bind.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const onFocus = () => refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
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

  // If the user disables pitch-by-pitch while viewing it, fall back to summary.
  if (!prefs.pitchByPitch && tab === "pitches") {
    setTab("summary");
  }

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
    <div data-cy="game-detail" className="absolute inset-0 bg-canvas flex flex-col z-10 overflow-hidden">
      <div className="px-3.5 md:px-6 pb-2.5 bg-surface border-b border-line-2 pt-4">
        <div className="flex items-center">
          <BackChevron onClick={onBack} label="Scores" />
          <div className="flex-1" />
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

        {loading && !game && <Loader />}
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

                <div className="flex-1 flex items-center justify-center gap-[18px]">
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
                  onClick={() => setTab(t)}
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
          {tab === "pitches" && <PitchesTab data={data} units={prefs.boxScoreUnits} />}
          {tab === "spray" && (
            <SprayTab spray={data.spray} currentBatterId={data.atBat?.batter.id} />
          )}
        </div>
      )}
    </div>
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
      className={`flex items-center gap-2 overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-200 ease-out ${order} ${visible ? "max-w-[120px] opacity-100" : "max-w-0 opacity-0"
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
  const { summary, linescore, plays, atBat, winProbability } = data;

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
      <div className="flex items-center gap-2.5">
        <TeamBadge abbr={away} size={28} />
        <div className="flex-1 h-3.5 rounded-full overflow-hidden flex bg-chip">
          <div style={{ width: `${awayPct}%`, background: awayColor }} />
          <div style={{ width: `${homePct}%`, background: homeColor }} />
        </div>
        <TeamBadge abbr={home} size={28} />
      </div>
      <div className="mt-2 flex items-center font-mono text-[15px] font-bold text-ink tracking-[-0.3px]">
        <span>{awayPct}%</span>
        <div className="flex-1" />
        <span>{homePct}%</span>
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

function StrikeZoneViz({ pitches, hand, units }: { pitches: Pitch[]; hand: "L" | "R"; units: BoxScoreUnits }) {
  const W = 280;
  const H = 280;
  const cx = W / 2;
  const cy = 130;
  const zw = 120;
  const zh = 140;
  const sx = (x: number) => cx + x * (zw / 2);
  const sy = (y: number) => cy - y * (zh / 2);
  const zoneL = cx - zw / 2;
  const zoneR = cx + zw / 2;
  const zoneT = cy - zh / 2;
  const zoneB = cy + zh / 2;

  const plateY = cy + zh / 2 + 50;
  const plateW = 80;
  const plate = [
    [cx - plateW / 2, plateY],
    [cx + plateW / 2, plateY],
    [cx + plateW / 2, plateY + 14],
    [cx, plateY + 28],
    [cx - plateW / 2, plateY + 14],
  ]
    .map((p) => p.join(","))
    .join(" ");

  return (
    <div className="relative flex justify-center">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[320px] h-auto block">
        <rect x={zoneL - 18} y={zoneT - 18} width={zw + 36} height={zh + 36} fill="var(--color-chip)" opacity={0.5} rx="3" />
        <rect x={zoneL} y={zoneT} width={zw} height={zh} fill="var(--color-surface)" />
        <g key={pitches.length} fill="none">
          <rect x={zoneL} y={zoneT} width={zw} height={zh} pathLength="1" stroke="var(--color-ink-2)" strokeWidth="1.5" className="dl-zone-demarc" />
          <line x1={zoneL + zw / 3} y1={zoneT} x2={zoneL + zw / 3} y2={zoneB} pathLength="1" stroke="var(--color-line)" strokeWidth="0.75" className="dl-zone-demarc" style={{ animationDelay: "120ms" }} />
          <line x1={zoneL + (2 * zw) / 3} y1={zoneT} x2={zoneL + (2 * zw) / 3} y2={zoneB} pathLength="1" stroke="var(--color-line)" strokeWidth="0.75" className="dl-zone-demarc" style={{ animationDelay: "180ms" }} />
          <line x1={zoneL} y1={zoneT + zh / 3} x2={zoneR} y2={zoneT + zh / 3} pathLength="1" stroke="var(--color-line)" strokeWidth="0.75" className="dl-zone-demarc" style={{ animationDelay: "240ms" }} />
          <line x1={zoneL} y1={zoneT + (2 * zh) / 3} x2={zoneR} y2={zoneT + (2 * zh) / 3} pathLength="1" stroke="var(--color-line)" strokeWidth="0.75" className="dl-zone-demarc" style={{ animationDelay: "300ms" }} />
        </g>

        <text x={zoneL - 6} y={zoneT - 6} fontSize="8" fill="var(--color-ink-3)" fontFamily="var(--font-mono)" letterSpacing="0.5" textAnchor="end">
          HIGH
        </text>
        <text x={zoneL - 6} y={zoneB + 14} fontSize="8" fill="var(--color-ink-3)" fontFamily="var(--font-mono)" letterSpacing="0.5" textAnchor="end">
          LOW
        </text>
        <text
          x={hand === "R" ? zoneR + 8 : zoneL - 8}
          y={cy + 4}
          fontSize="9"
          fontFamily="var(--font-mono)"
          fill="var(--color-ink-2)"
          letterSpacing="0.5"
          textAnchor={hand === "R" ? "start" : "end"}
        >
          {hand}HB
        </text>

        <polygon points={plate} fill="var(--color-surface-2)" stroke="var(--color-ink-2)" strokeWidth="1" />
        <text x={cx} y={plateY + 46} fontSize="8" fill="var(--color-ink-3)" fontFamily="var(--font-mono)" letterSpacing="0.6" textAnchor="middle">
          CATCHER VIEW
        </text>

        {pitches.map((p) => {
          const px = sx(p.x);
          const py = sy(p.y);
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
      </svg>
    </div>
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
    <div className="bg-surface border border-line rounded-[14px] overflow-hidden">
      <div className="px-3.5 py-3 flex items-center gap-2.5 border-b border-line-2">
        <TeamBadge abbr={abbr} size={26} />
        <div className="font-head text-[15px] font-bold text-ink tracking-[-0.2px]">
          {t?.name ?? abbr}
        </div>
      </div>
      <div className="py-2">
        <div
          className="grid px-3.5 py-1.5 font-mono text-[10px] text-ink-3 tracking-[0.4px] border-b border-line-2"
          style={{ gridTemplateColumns: "1.6fr 24px 24px 24px 24px 24px 24px 40px" }}
        >
          <span className="text-left">BATTING</span>
          <span className="text-right">AB</span>
          <span className="text-right">R</span>
          <span className="text-right">H</span>
          <span className="text-right">RBI</span>
          <span className="text-right">BB</span>
          <span className="text-right">K</span>
          <span className="text-right">AVG</span>
        </div>
        {lineup.length === 0 && (
          <div className="p-3.5 text-xs text-ink-3">Lineup not posted yet.</div>
        )}
        {lineup.map((r) => (
          <button
            key={r.id}
            data-cy="box-player-row"
            data-cy-player-id={r.id}
            onClick={() => onPlayer(r.id)}
            className="w-full grid items-center px-3.5 py-2 bg-transparent border-none cursor-pointer text-left border-b border-line-2"
            style={{ gridTemplateColumns: "1.6fr 24px 24px 24px 24px 24px 24px 40px" }}
          >
            <span className="font-ui text-[13px] text-ink overflow-hidden text-ellipsis whitespace-nowrap">
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
          className="grid px-3.5 py-1.5 font-mono text-[10px] text-ink-3 tracking-[0.4px] border-b border-line-2"
          style={{ gridTemplateColumns: "1.6fr 32px 24px 24px 24px 24px 24px" }}
        >
          <span className="text-left">PITCHING</span>
          <span className="text-right">IP</span>
          <span className="text-right">H</span>
          <span className="text-right">R</span>
          <span className="text-right">ER</span>
          <span className="text-right">BB</span>
          <span className="text-right">K</span>
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
  if (plays.length === 0) {
    return <div className="p-6 text-ink-3 text-center">No plays yet.</div>;
  }
  return (
    <div className="bg-surface border border-line rounded-[14px] overflow-hidden">
      {plays.map((p, i) => (
        <div
          key={i}
          className={`grid items-center gap-2 px-3.5 py-3 ${i === plays.length - 1 ? "" : "border-b border-line-2"}`}
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
  );
}

/* ── Pitches tab ──────────────────────────────────────────────── */

function PitchesTab({ data, units }: { data: GameDetailData; units: BoxScoreUnits }) {
  const { summary, awayPitching, homePitching } = data;
  const playsWithPitches = data.plays.filter((p) => p.pitchSeq && p.pitchSeq.length > 0);
  const hasUsage = [...awayPitching, ...homePitching].some(
    (p) => p.pitchUsage && p.pitchUsage.length > 0,
  );

  if (!hasUsage && playsWithPitches.length === 0) {
    return <div className="p-6 text-ink-3 text-center">No pitch data yet.</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      <PitchUsageCard abbr={summary.away} pitchers={awayPitching} />
      <PitchUsageCard abbr={summary.home} pitchers={homePitching} />

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
    </div>
  );
}

/* ── Pitch usage ──────────────────────────────────────────────── */

/** Per-team card listing each pitcher's pitch-type breakdown for this game. */
function PitchUsageCard({ abbr, pitchers }: { abbr: string; pitchers: BoxPitchingRow[] }) {
  const withUsage = pitchers.filter((p) => p.pitchUsage && p.pitchUsage.length > 0);
  if (withUsage.length === 0) return null;
  return (
    <div className="bg-surface border border-line rounded-[14px] p-3.5">
      <div className="text-[10px] tracking-[1.2px] uppercase text-ink-3 font-bold mb-3">
        {abbr} · Pitching
      </div>
      <div className="flex flex-col gap-5">
        {withUsage.map((p) => (
          <PitcherUsage key={p.id} pitcher={p} />
        ))}
      </div>
    </div>
  );
}

function PitcherUsage({ pitcher }: { pitcher: BoxPitchingRow }) {
  const usage = (pitcher.pitchUsage ?? []).slice().sort((a, b) => b.count - a.count);
  const total = usage.reduce((s, e) => s + e.count, 0);
  if (total === 0) return null;
  const entries = usage.map((e) => ({ ...e, pct: Math.round((e.count / total) * 100) }));

  return (
    <div>
      <div className="flex items-baseline gap-2 mb-2.5">
        <span className="font-head text-[20px] font-bold text-ink tracking-[-0.5px] leading-none">
          {pitcher.name}
        </span>
        {pitcher.live && (
          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold tracking-[1.2px] text-live">
            <span className="w-1.5 h-1.5 rounded-full bg-live" />
            LIVE
          </span>
        )}
        <div className="flex-1" />
        <span className="font-mono text-[13px]">
          <span className="font-bold text-ink">{pitcher.pitches ?? total}P</span>
          <span className="text-ink-3"> · </span>
          <span className="text-ink-2">{pitcher.ip} IP</span>
        </span>
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
