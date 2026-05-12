"use client";

import { useEffect, useState } from "react";
import { useApi } from "@/lib/mlb/client";
import type { LeaderCategory, LeaderGroup, LeaderRow } from "@/lib/mlb/types";
import { AppBar, Loader, TeamBadge } from "@/components/ui/primitives";

interface CatMeta {
  id: LeaderCategory;
  label: string;       // long form, e.g. "Batting Avg"
  sub: string;         // short abbreviation, e.g. "AVG"
  blurb: string;       // one-liner under the heading
  group: LeaderGroup;
}

const CATS: CatMeta[] = [
  { id: "AVG",  label: "Batting Avg",         sub: "AVG",  blurb: "Hits per at-bat",                       group: "hitting"  },
  { id: "HR",   label: "Home Runs",           sub: "HR",   blurb: "Balls hit out of the park",             group: "hitting"  },
  { id: "RBI",  label: "Runs Batted In",      sub: "RBI",  blurb: "Runs driven in by the batter",          group: "hitting"  },
  { id: "OPS",  label: "On-base + Slugging",  sub: "OPS",  blurb: "OBP combined with slugging",            group: "hitting"  },
  { id: "OBP",  label: "On-base Pct",         sub: "OBP",  blurb: "How often a batter reaches base",       group: "hitting"  },
  { id: "SLG",  label: "Slugging Pct",        sub: "SLG",  blurb: "Total bases per at-bat",                group: "hitting"  },
  { id: "H",    label: "Hits",                sub: "H",    blurb: "Total hits",                            group: "hitting"  },
  { id: "R",    label: "Runs",                sub: "R",    blurb: "Runs scored",                           group: "hitting"  },
  { id: "ERA",  label: "Earned Run Avg",      sub: "ERA",  blurb: "Earned runs allowed per 9 innings",     group: "pitching" },
  { id: "K",    label: "Strikeouts",          sub: "K",    blurb: "Batters retired on three strikes",      group: "pitching" },
  { id: "WHIP", label: "WHIP",                sub: "WHIP", blurb: "Walks + hits per inning pitched",       group: "pitching" },
  { id: "W",    label: "Wins",                sub: "W",    blurb: "Pitching wins",                         group: "pitching" },
  { id: "SV",   label: "Saves",               sub: "SV",   blurb: "Closer saves",                          group: "pitching" },
  { id: "FPCT", label: "Fielding Pct",        sub: "FPCT", blurb: "Successful fielding per chance",        group: "fielding" },
  { id: "PO",   label: "Putouts",             sub: "PO",   blurb: "Outs credited to a fielder",            group: "fielding" },
  { id: "A",    label: "Assists",             sub: "A",    blurb: "Throws on outs made by another",        group: "fielding" },
  { id: "E",    label: "Errors",              sub: "E",    blurb: "Misplays charged to a fielder",         group: "fielding" },
];

const GROUPS: { id: LeaderGroup; label: string }[] = [
  { id: "hitting",  label: "Batting" },
  { id: "pitching", label: "Pitching" },
  { id: "fielding", label: "Fielding" },
];

const DEFAULT_CAT: Record<LeaderGroup, LeaderCategory> = {
  hitting:  "AVG",
  pitching: "ERA",
  fielding: "FPCT",
};

/** Splits a numeric leader value at its leading decimal point so the dot can be tinted. */
function splitValue(v: string): { dot: string; rest: string } {
  if (v.startsWith(".")) return { dot: ".", rest: v.slice(1) };
  if (v.startsWith("0.")) return { dot: ".", rest: v.slice(2) };
  return { dot: "", rest: v };
}

export function LeadersScreen({ onPlayer }: { onPlayer: (id: number) => void }) {
  const { data, loading, error } = useApi<{
    season: number;
    leaders: Partial<Record<LeaderCategory, LeaderRow[]>>;
  }>("/api/mlb/leaders", { cacheMs: 300_000 });

  const [group, setGroup] = useState<LeaderGroup>("hitting");
  const [catId, setCatId] = useState<LeaderCategory>("AVG");

  const catsForGroup = CATS.filter((c) => c.group === group);
  const activeCat = catsForGroup.find((c) => c.id === catId) ?? catsForGroup[0];

  function selectGroup(g: LeaderGroup) {
    setGroup(g);
    setCatId(DEFAULT_CAT[g]);
  }

  return (
    <>
      <AppBar title="Leaders" />
      <div className="bg-canvas px-[14px] md:px-6 pt-3 pb-[100px] max-w-[900px] w-full mx-auto">
        {/* Group toggle — pill segmented control on a tan track */}
        <div
          className="relative inline-flex w-full p-1 rounded-full"
          style={{ background: "color-mix(in srgb, var(--color-ink) 8%, transparent)" }}
          role="tablist"
          aria-label="Leader group"
        >
          {GROUPS.map((g) => {
            const on = group === g.id;
            return (
              <button
                key={g.id}
                role="tab"
                aria-selected={on}
                onClick={() => selectGroup(g.id)}
                className={`flex-1 py-2.5 rounded-full border-none cursor-pointer font-head text-[15px] font-semibold tracking-[-0.2px] transition-colors ${
                  on ? "bg-accent text-white" : "bg-transparent text-ink-2"
                }`}
              >
                {g.label}
              </button>
            );
          })}
        </div>

        {/* Metric banner — horizontal pill chooser */}
        <div className="flex gap-2.5 overflow-x-auto py-3.5 -mx-[14px] px-[14px] md:-mx-6 md:px-6">
          {catsForGroup.map((c) => {
            const on = c.id === activeCat?.id;
            return (
              <button
                key={c.id}
                onClick={() => setCatId(c.id)}
                className={`shrink-0 min-w-[64px] px-4 py-2 rounded-full cursor-pointer font-mono text-[14px] font-bold tracking-[0.3px] transition-colors ${
                  on
                    ? "bg-ink text-surface border border-ink"
                    : "bg-transparent text-ink border border-line"
                }`}
              >
                {c.sub}
              </button>
            );
          })}
        </div>

        {/* Content: loader replaces everything below the controls until data arrives */}
        {loading && !data ? (
          <Loader />
        ) : error ? (
          <div className="p-6 text-neg">Failed to load.</div>
        ) : data && activeCat ? (
          <LeaderList
            cat={activeCat}
            rows={data.leaders[activeCat.id] ?? []}
            onPlayer={onPlayer}
          />
        ) : null}
      </div>
    </>
  );
}

/* ── List ─────────────────────────────────────────────────────── */

const PAGE_SIZE = 10;

function LeaderList({
  cat,
  rows,
  onPlayer,
}: {
  cat: CatMeta;
  rows: LeaderRow[];
  onPlayer: (id: number) => void;
}) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Reset paging when the user switches metrics.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [cat.id]);

  const visibleRows = rows.slice(0, visibleCount);
  const canLoadMore = visibleCount < rows.length;
  const groupLabel = cat.group === "hitting" ? "Batting" : cat.group === "pitching" ? "Pitching" : "Fielding";

  // Single grid template shared by the header row and every data row.
  const gridCols = "36px 32px minmax(0,1fr) 44px minmax(72px,auto)";

  return (
    <div>
      {/* Eyebrow */}
      <div className="font-mono text-[11px] tracking-[1.4px] uppercase text-ink-3 pt-1">
        MLB · {groupLabel}
      </div>
      <h2 className="font-head text-[34px] md:text-[40px] font-bold text-ink tracking-[-1px] leading-[1.02] mt-1">
        {cat.label}
      </h2>
      <div className="text-ink-3 font-ui text-[14px] mt-1">{cat.blurb}</div>

      {/* Table */}
      <div className="mt-4 bg-surface border border-line rounded-[14px] overflow-hidden">
        {/* Column header */}
        <div
          className="grid items-center gap-3 px-3 md:px-4 py-2.5 border-b border-line bg-surface-2 font-mono text-[10px] tracking-[1.2px] uppercase text-ink-3"
          style={{ gridTemplateColumns: gridCols }}
          role="row"
        >
          <span>#</span>
          <span />
          <span>Player</span>
          <span className="text-center">Pos</span>
          <span className="text-right">{cat.sub}</span>
        </div>

        {rows.length === 0 ? (
          <div className="px-4 py-10 text-ink-3 font-ui text-[13px] text-center">
            No data available for this category.
          </div>
        ) : (
          <>
            {visibleRows.map((r, i) => {
              const leader = i === 0;
              const { dot, rest } = splitValue(r.value);
              return (
                <button
                  key={r.personId}
                  onClick={() => onPlayer(r.personId)}
                  className={`w-full grid items-center gap-3 px-3 md:px-4 py-3 border-t border-line-2 bg-transparent border-l-0 border-r-0 border-b-0 cursor-pointer text-left transition-colors ${
                    leader ? "" : "hover:bg-canvas"
                  }`}
                  style={{
                    gridTemplateColumns: gridCols,
                    background: leader
                      ? "color-mix(in srgb, var(--color-accent) 8%, transparent)"
                      : undefined,
                  }}
                  aria-label={`${cat.label} rank ${i + 1}: ${r.fullName}, ${r.value}`}
                >
                  <span
                    className={`shrink-0 w-7 h-7 rounded-[8px] inline-flex items-center justify-center font-mono text-[13px] font-bold ${
                      leader ? "bg-accent text-white" : "bg-chip text-ink"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <TeamBadge abbr={r.team} size={28} />
                  <span className="min-w-0 font-head text-[15px] md:text-[16px] font-semibold text-ink tracking-[-0.2px] truncate">
                    {r.fullName}
                  </span>
                  <span className="text-center font-mono text-[11px] tracking-[0.4px] text-ink-2">
                    {r.position ?? "—"}
                  </span>
                  <span className="font-mono text-[20px] md:text-[22px] font-bold tracking-[-0.5px] text-ink text-right tabular-nums whitespace-nowrap">
                    {dot && <span className="text-accent">{dot}</span>}
                    {rest}
                  </span>
                </button>
              );
            })}

            {canLoadMore && (
              <button
                onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                className="w-full px-4 py-3.5 border-t border-line bg-transparent border-l-0 border-r-0 border-b-0 cursor-pointer font-ui text-[12px] font-bold tracking-[1.2px] uppercase text-accent hover:bg-canvas transition-colors"
              >
                Load more
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
