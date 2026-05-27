"use client";

import { useApi } from "@/lib/mlb/client";
import type { StandingsByDivision } from "@/lib/mlb/types";
import { TEAMS } from "@/lib/mlb/teams";
import { AppBar, Loader, TeamBadge } from "@/components/ui/primitives";
import { useTitle } from "@/lib/title";
import { useSlidingPill } from "@/lib/slidingPill";
import { useTabParam } from "@/lib/mlb/queryParams";

type League = "AL" | "NL";
const LEAGUES: readonly League[] = ["AL", "NL"];

interface Resp {
  season: number;
  divisions: StandingsByDivision;
}

export function StandingsScreen({ onTeam }: { onTeam: (abbr: string) => void }) {
  useTitle("Standings");
  const { data, loading, error } = useApi<Resp>("/api/mlb/standings", { cacheMs: 300_000 });
  const [league, setLeague] = useTabParam<League>("league", "AL", LEAGUES);

  // Slide the indicator between AL/NL rather than toggling each pill's own
  // background color. The track lives in the AppBar's trailing slot below.
  const { containerRef: leagueTrackRef, pos: leaguePillPos } = useSlidingPill(league, 2);

  const divs = Object.entries(data?.divisions ?? {}).filter(([div]) => div.startsWith(league));

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
            {LEAGUES.map((l) => (
              <button
                key={l}
                data-cy="league-toggle"
                data-cy-league={l}
                data-sliding-key={l}
                onClick={() => setLeague(l)}
                className={`relative px-3 py-1.25 rounded-full border-none bg-transparent cursor-pointer font-ui text-xs font-bold transition-colors duration-200 ${league === l ? "text-white" : "text-ink-2"
                  }`}
              >
                {l}
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
        ) : (
          divs.map(([divName, rows]) => (
            <div
              key={divName}
              className="mt-3.5 bg-surface border border-line rounded-[14px] overflow-hidden"
            >
              <div
                data-cy="standings-header"
                className="grid items-center gap-2 px-3.5 py-2.5 border-b border-line-2"
                style={{ gridTemplateColumns: "24px 1fr 30px 30px 50px 40px" }}
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
                  style={{ gridTemplateColumns: "24px 1fr 30px 30px 50px 40px" }}
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
