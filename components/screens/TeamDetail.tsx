"use client";

import { useApi } from "@/lib/mlb/client";
import type { TeamDetailData } from "@/lib/mlb/types";
import { TEAMS } from "@/lib/mlb/teams";
import { BackChevron, Loader, TeamBadge } from "@/components/ui/primitives";

const GROUP_LABEL: Record<string, string> = {
  pitchers: "Pitchers",
  catchers: "Catchers",
  infielders: "Infielders",
  outfielders: "Outfielders",
  designated_hitter: "Designated Hitter",
};

const GROUP_ORDER: (keyof typeof GROUP_LABEL)[] = [
  "pitchers",
  "catchers",
  "infielders",
  "outfielders",
  "designated_hitter",
];

export function TeamDetail({
  teamAbbr,
  onBack,
  onPlayer,
}: {
  teamAbbr: string;
  onBack: () => void;
  onPlayer: (id: number) => void;
}) {
  const t = TEAMS[teamAbbr];
  const { data, loading, error } = useApi<TeamDetailData>(`/api/mlb/team/${teamAbbr}`, { cacheMs: 600_000 });

  const byGroup = (data?.roster ?? []).reduce<Record<string, TeamDetailData["roster"]>>((acc, r) => {
    (acc[r.group] ||= []).push(r);
    return acc;
  }, {});

  return (
    <div className="absolute inset-0 bg-canvas flex flex-col z-10">
      <div className="px-3.5 md:px-6 pb-3 bg-surface border-b border-line-2 pt-4">
        <BackChevron onClick={onBack} label="Back" />
        <div className="mt-3.5 flex items-center gap-3.5">
          <TeamBadge abbr={teamAbbr} size={56} />
          <div>
            <div className="text-xs text-ink-3 tracking-[0.6px]">{t?.city}</div>
            <div className="font-head text-[26px] font-bold text-ink tracking-[-0.6px] leading-tight">
              {t?.name ?? teamAbbr}
            </div>
            <div className="text-[11px] text-ink-3 font-mono mt-1">
              {t?.div} · {t?.league}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3.5 md:px-6 pt-3.5 pb-20 w-full max-w-[800px] mx-auto">
        {loading ? (
          <Loader />
        ) : error ? (
          <div className="p-6 text-neg">Failed to load roster.</div>
        ) : (
          GROUP_ORDER.map((g) => {
            const rows = byGroup[g];
            if (!rows?.length) return null;
            return (
              <div key={g} className="mb-4">
                <div className="font-head text-[11px] font-bold tracking-[1.4px] uppercase text-ink-3 px-1 mb-2">
                  {GROUP_LABEL[g]}
                </div>
                <div className="bg-surface border border-line rounded-[14px] overflow-hidden">
                  {rows.map((r, i) => (
                    <button
                      key={r.id}
                      onClick={() => onPlayer(r.id)}
                      className={`w-full grid items-center gap-2.5 px-3.5 py-2.5 bg-transparent border-none cursor-pointer text-left font-ui ${
                        i === rows.length - 1 ? "" : "border-b border-line-2"
                      }`}
                      style={{ gridTemplateColumns: "36px 1fr 40px" }}
                    >
                      <span className="font-mono text-[11px] font-bold text-ink-3 text-center">
                        {r.num || "—"}
                      </span>
                      <span className="font-head text-sm font-semibold text-ink tracking-[-0.2px]">
                        {r.name}
                      </span>
                      <span className="font-mono text-[11px] text-ink-2 text-right">{r.pos}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
