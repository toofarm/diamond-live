"use client";

import { useMemo, useState } from "react";
import { useApi } from "@/lib/mlb/client";
import type { GameSummary } from "@/lib/mlb/types";
import { dateStrip, formatTodayHeader } from "@/lib/date";
import { ScoreCard } from "@/components/ui/ScoreCard";
import { DateStrip, SectionHead } from "@/components/ui/primitives";
import { IconStar, IconChevron } from "@/components/ui/icons";

interface ScoresResp {
  date: string;
  games: GameSummary[];
}

export function ScoresScreen({
  follows,
  onGame,
}: {
  follows: string[];
  onGame: (id: number) => void;
}) {
  const strip = useMemo(() => dateStrip(0, 7, 7), []);
  const todayIdx = strip.findIndex((d) => d.today);
  const [dateIdx, setDateIdx] = useState(todayIdx >= 0 ? todayIdx : 7);
  const [mlbCollapsed, setMlbCollapsed] = useState(false);

  const date = strip[dateIdx]?.iso ?? "";
  const isToday = strip[dateIdx]?.today === true;
  const { data, loading, error } = useApi<ScoresResp>(
    date ? `/api/mlb/scoreboard?date=${date}` : null,
    { pollMs: isToday ? 20_000 : undefined },
  );

  const games = useMemo<GameSummary[]>(() => data?.games ?? [], [data]);
  const isFollowing = (g: GameSummary) => follows.includes(g.home) || follows.includes(g.away);
  const followGames = games.filter(isFollowing);
  const restGames = games.filter((g) => !isFollowing(g));

  const counts = useMemo(() => {
    const live = games.filter((g) => g.status === "LIVE").length;
    const final = games.filter((g) => g.status === "FINAL").length;
    return { live, final, total: games.length };
  }, [games]);

  return (
    <>
      <div className="bg-surface border-b border-line">
        <DateStrip entries={strip} selectedIdx={dateIdx} onSelect={setDateIdx} />
      </div>

      <div
        data-cy="scores-screen"
        className="bg-canvas px-[14px] md:px-6 pt-1 pb-6 max-w-[1200px] w-full mx-auto"
      >
        <div className="mt-3 bg-surface border border-line rounded-[14px] px-3.5 py-2.5 flex items-center gap-2.5">
          <span
            className={`w-2 h-2 rounded-[4px] ${counts.live > 0 ? "bg-live dl-live-pulse" : "bg-ink-3"}`}
          />
          <div className="flex-1 text-xs text-ink-2 font-ui">
            {games.length === 0 && loading ? (
              <span data-cy="loading">Loading games…</span>
            ) : games.length === 0 ? (
              <span data-cy="empty-state">No games today.</span>
            ) : (
              <>
                <span className="font-bold text-ink text-[13px]">{counts.live} live</span>
                <span>
                  {" "}· {counts.final} final · {counts.total - counts.live - counts.final} upcoming
                </span>
              </>
            )}
          </div>
          <span className="text-[11px] text-ink-3 font-mono tracking-[0.4px]">
            {isToday ? formatTodayHeader() : `${strip[dateIdx]?.wd} · ${strip[dateIdx]?.m} ${strip[dateIdx]?.d}`}
          </span>
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
                onClick={() => setMlbCollapsed((c) => !c)}
                className="bg-transparent border-none cursor-pointer flex items-center gap-1 text-ink-3 font-mono text-xs"
              >
                {restGames.length}
                <span
                  className={`inline-block transition-transform duration-200 ${
                    mlbCollapsed ? "-rotate-90" : "rotate-90"
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
    </>
  );
}
