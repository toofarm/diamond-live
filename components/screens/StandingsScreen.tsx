"use client";

import { useState } from "react";
import { useApi } from "@/lib/mlb/client";
import type { StandingsByDivision } from "@/lib/mlb/types";
import { TEAMS } from "@/lib/mlb/teams";
import { AppBar, Loader, TeamBadge } from "@/components/ui/primitives";

interface Resp {
  season: number;
  divisions: StandingsByDivision;
}

export function StandingsScreen({ onTeam }: { onTeam: (abbr: string) => void }) {
  const { data, loading, error } = useApi<Resp>("/api/mlb/standings", { cacheMs: 300_000 });
  const [league, setLeague] = useState<"AL" | "NL">("AL");

  const divs = Object.entries(data?.divisions ?? {}).filter(([div]) => div.startsWith(league));

  return (
    <>
      <AppBar
        title="Standings"
        trailing={
          <div className="flex bg-chip rounded-full p-[2px]">
            {(["AL", "NL"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLeague(l)}
                className={`px-3 py-[5px] rounded-full border-none cursor-pointer font-ui text-xs font-bold ${
                  league === l ? "bg-accent text-white" : "bg-transparent text-ink-2"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        }
      />
      <div className="bg-canvas px-[14px] md:px-6 pt-2 pb-[100px] max-w-[900px] w-full mx-auto">
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
            <div className="px-3.5 py-2.5 flex items-center border-b border-line-2">
              <div className="font-head text-sm font-bold text-ink flex-1 tracking-[-0.2px]">
                {divName}
              </div>
              <span className="font-mono text-[10px] text-ink-3 tracking-[0.5px]">
                W&nbsp;&nbsp;L&nbsp;&nbsp;&nbsp;PCT&nbsp;&nbsp;GB
              </span>
            </div>
            {rows.map((row, i) => (
              <button
                key={row.abbr}
                onClick={() => onTeam(row.abbr)}
                className={`w-full grid items-center gap-2 px-3.5 py-2.5 border-none text-left cursor-pointer ${
                  i === 0
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
