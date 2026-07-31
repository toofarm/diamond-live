"use client";

import { Fragment } from "react";
import { useApi } from "@/lib/mlb/client";
import type { StandingsByDivision } from "@/lib/mlb/types";
import { TEAMS } from "@/lib/mlb/teams";
import {
  derivePlayoffStandings,
  type PlayoffDivision,
  type PlayoffStatus,
} from "@/lib/mlb/playoffs";
import { AppBar, Loader, TeamBadge } from "@/components/ui/primitives";
import { useTitle } from "@/lib/title";
import { useSlidingPill } from "@/lib/slidingPill";
import { useTabParam } from "@/lib/mlb/queryParams";

type League = "AL" | "NL";
const LEAGUES: readonly League[] = ["AL", "NL"];

/** The league toggle doubles as a view switcher: the two leagues show division
 *  standings, "playoffs" shows the seeding picture for both leagues at once. */
type View = League | "playoffs";
const VIEWS: readonly View[] = ["AL", "NL", "playoffs"];
const VIEW_LABEL: Record<View, string> = { AL: "AL", NL: "NL", playoffs: "Playoffs" };
const LEAGUE_NAME: Record<League, string> = {
  AL: "American League",
  NL: "National League",
};

/** Shared by the division and playoff tables so their columns line up. */
const COLS = "24px 1fr 30px 30px 50px 46px";

/** Row background + seed color per playoff status. Division leaders take the
 *  accent the division tables already use for a first-place team; wild cards
 *  take the positive green so the two kinds of berth read apart at a glance. */
const STATUS_STYLE: Record<PlayoffStatus, { row: string; seed: string }> = {
  "division-leader": {
    row: "bg-[color-mix(in_srgb,var(--color-accent)_9%,transparent)]",
    seed: "text-accent",
  },
  "wild-card": {
    row: "bg-[color-mix(in_srgb,var(--color-pos)_11%,transparent)]",
    seed: "text-pos",
  },
  out: { row: "bg-transparent", seed: "text-ink-3" },
};

interface Resp {
  season: number;
  divisions: StandingsByDivision;
}

export function StandingsScreen({ onTeam }: { onTeam: (abbr: string) => void }) {
  useTitle("Standings");
  const { data, loading, error } = useApi<Resp>("/api/mlb/standings", { cacheMs: 300_000 });
  // Param stays named `league` so existing ?league=NL links keep working.
  const [view, setView] = useTabParam<View>("league", "AL", VIEWS);

  // Slide the indicator between the options rather than toggling each pill's
  // own background color. The track lives in the AppBar's trailing slot below.
  const { containerRef: leagueTrackRef, pos: leaguePillPos } = useSlidingPill(view, 2);

  const divs = Object.entries(data?.divisions ?? {}).filter(([div]) => div.startsWith(view));

  return (
    <>
      <AppBar
        title="Standings"
        trailing={
          <div ref={leagueTrackRef} className="relative flex bg-chip rounded-full p-0.5">
            <span
              aria-hidden
              className="absolute top-0.5 bottom-0.5 rounded-full bg-accent pointer-events-none transition-[transform,width] duration-200 ease-out"
              style={{
                transform: `translateX(${leaguePillPos?.left ?? 0}px)`,
                width: leaguePillPos?.width ?? 0,
                opacity: leaguePillPos ? 1 : 0,
              }}
            />
            {VIEWS.map((v) => (
              <button
                key={v}
                data-cy="league-toggle"
                data-cy-league={v}
                data-sliding-key={v}
                onClick={() => setView(v)}
                className={`relative px-3 py-1.25 rounded-full border-none bg-transparent cursor-pointer font-ui text-xs font-bold whitespace-nowrap transition-colors duration-200 ${view === v ? "text-white" : "text-ink-2"
                  }`}
              >
                {VIEW_LABEL[v]}
              </button>
            ))}
          </div>
        }
      />
      <div data-cy="standings-screen" className="bg-canvas px-3.5 md:px-6 pt-2 pb-25 max-w-225 w-full mx-auto">
        {loading ? (
          <Loader />
        ) : error ? (
          <div className="p-6 text-neg">Failed to load standings.</div>
        ) : view === "playoffs" ? (
          <>
            {LEAGUES.map((l) => (
              <PlayoffTable
                key={l}
                league={l}
                groups={derivePlayoffStandings(data?.divisions ?? {}, l)}
                onTeam={onTeam}
              />
            ))}
            <div
              data-cy="playoff-legend"
              className="mt-3 px-1 font-ui text-[11px] leading-4 text-ink-3"
            >
              <div className="flex items-center gap-3.5">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-[3px] bg-[color-mix(in_srgb,var(--color-accent)_45%,transparent)]" />
                  Division leader
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-[3px] bg-[color-mix(in_srgb,var(--color-pos)_45%,transparent)]" />
                  Wild card
                </span>
              </div>
              <p className="mt-1.5">
                Leading numbers are playoff seeds. GB is games ahead of (+) or behind (−)
                the final wild-card spot.
              </p>
            </div>
          </>
        ) : (
          divs.map(([divName, rows]) => (
            <div
              key={divName}
              className="mt-3.5 bg-surface border border-line rounded-[14px] overflow-hidden"
            >
              <div
                data-cy="standings-header"
                className="grid items-center gap-2 px-3.5 py-2.5 border-b border-line-2"
                style={{ gridTemplateColumns: COLS }}
              >
                <span />
                <div className="font-head text-sm font-bold text-ink tracking-[-0.2px]">
                  {divName}
                </div>
                <span className="text-right font-mono text-[10px] text-ink-3 tracking-[0.5px]">W</span>
                <span className="text-right font-mono text-[10px] text-ink-3 tracking-[0.5px]">L</span>
                <span className="text-right font-mono text-[10px] text-ink-3 tracking-[0.5px]">PCT</span>
                <span className="text-right font-mono text-[10px] text-ink-3 tracking-[0.5px]">GB</span>
              </div>
              {rows.map((row, i) => (
                <button
                  key={row.abbr}
                  data-cy="standings-row"
                  data-cy-team={row.abbr}
                  onClick={() => onTeam(row.abbr)}
                  className={`w-full grid items-center gap-2 px-3.5 py-2.5 border-none text-left cursor-pointer ${i === 0
                    ? "bg-[color-mix(in_srgb,var(--color-accent)_6%,transparent)]"
                    : "bg-transparent"
                    } ${i === rows.length - 1 ? "" : "border-b border-line-2"}`}
                  style={{ gridTemplateColumns: COLS }}
                >
                  <span className="font-mono text-[11px] text-ink-3 font-bold">{i + 1}</span>
                  <div className="flex items-center gap-2 min-w-0">
                    <TeamBadge abbr={row.abbr} size={22} />
                    <span className="font-head text-sm font-semibold text-ink tracking-[-0.2px] whitespace-nowrap overflow-hidden text-ellipsis">
                      {TEAMS[row.abbr]?.name ?? row.abbr}
                    </span>
                  </div>
                  <span className="text-right font-mono text-[13px] text-ink font-semibold">{row.w}</span>
                  <span className="text-right font-mono text-[13px] text-ink-2">{row.l}</span>
                  <span className="text-right font-mono text-xs text-ink-2">{row.pct}</span>
                  <span className="text-right font-mono text-xs text-ink-3">{row.gb}</span>
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </>
  );
}

/** One league's playoff picture, split into its three divisions. Row color
 *  carries the berth: accent for a division leader, green for a wild card,
 *  untinted for a team currently on the outside. */
function PlayoffTable({
  league,
  groups,
  onTeam,
}: {
  league: League;
  groups: PlayoffDivision[];
  onTeam: (abbr: string) => void;
}) {
  return (
    <div
      data-cy="playoff-table"
      data-cy-league={league}
      className="mt-3.5 bg-surface border border-line rounded-[14px] overflow-hidden"
    >
      <div
        data-cy="playoff-header"
        className="grid items-center gap-2 px-3.5 py-2.5 border-b border-line-2"
        style={{ gridTemplateColumns: COLS }}
      >
        <span />
        <div className="font-head text-sm font-bold text-ink tracking-[-0.2px]">
          {LEAGUE_NAME[league]}
        </div>
        <span className="text-right font-mono text-[10px] text-ink-3 tracking-[0.5px]">W</span>
        <span className="text-right font-mono text-[10px] text-ink-3 tracking-[0.5px]">L</span>
        <span className="text-right font-mono text-[10px] text-ink-3 tracking-[0.5px]">PCT</span>
        <span className="text-right font-mono text-[10px] text-ink-3 tracking-[0.5px]">GB</span>
      </div>
      {groups.map(({ div, rows }) => (
        <Fragment key={div}>
          <div
            data-cy="playoff-division"
            data-cy-division={div}
            className="px-3.5 py-1.5 bg-chip border-b border-line-2 font-ui text-[10px] font-bold uppercase tracking-[0.6px] text-ink-2"
          >
            {div}
          </div>
          {rows.map((row, i) => (
            <button
              key={row.abbr}
              data-cy="playoff-row"
              data-cy-team={row.abbr}
              data-cy-seed={row.seed}
              data-cy-status={row.status}
              onClick={() => onTeam(row.abbr)}
              className={`w-full grid items-center gap-2 px-3.5 py-2.5 border-none text-left cursor-pointer ${STATUS_STYLE[row.status].row
                } ${i === rows.length - 1 ? "" : "border-b border-line-2"}`}
              style={{ gridTemplateColumns: COLS }}
            >
              <span
                className={`font-mono text-[11px] font-bold ${STATUS_STYLE[row.status].seed}`}
              >
                {row.seed}
              </span>
              <div className="flex items-center gap-2 min-w-0">
                <TeamBadge abbr={row.abbr} size={22} />
                <span className="font-head text-sm font-semibold text-ink tracking-[-0.2px] whitespace-nowrap overflow-hidden text-ellipsis">
                  {TEAMS[row.abbr]?.name ?? row.abbr}
                </span>
              </div>
              <span className="text-right font-mono text-[13px] text-ink font-semibold">{row.w}</span>
              <span className="text-right font-mono text-[13px] text-ink-2">{row.l}</span>
              <span className="text-right font-mono text-xs text-ink-2">{row.pct}</span>
              <span
                data-cy="playoff-gb"
                className={`text-right font-mono text-xs ${row.status === "out" ? "text-ink-3" : "text-ink font-semibold"
                  }`}
              >
                {row.gb}
              </span>
            </button>
          ))}
        </Fragment>
      ))}
    </div>
  );
}
