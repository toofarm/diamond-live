"use client";

import { TeamBadge, BaseDiamond, OutDots } from "./primitives";
import type { GameSummary } from "@/lib/mlb/types";

export function ScoreCard({
  game,
  onClick,
  record,
}: {
  game: GameSummary;
  onClick: () => void;
  /** Optional pre-computed records for the away/home teams to show on SCHEDULED games. */
  record?: { away?: string; home?: string };
}) {
  const isLive = game.status === "LIVE";
  const isFinal = game.status === "FINAL";
  const awayWon = isFinal && (game.awayScore ?? 0) > (game.homeScore ?? 0);
  const homeWon = isFinal && (game.homeScore ?? 0) > (game.awayScore ?? 0);

  const teamRow = (abbr: string, score: number | null, won: boolean, rec?: string) => (
    <div
      className={`flex items-center gap-3 py-2 ${isFinal && !won ? "opacity-55" : ""}`}
    >
      <TeamBadge abbr={abbr} size={26} />
      <div className="font-head font-bold text-[18px] text-ink tracking-[-0.3px] flex-1">{abbr}</div>
      {isLive || isFinal ? (
        <div className="font-mono text-[22px] font-semibold text-ink tracking-[-0.5px]">{score ?? 0}</div>
      ) : (
        <div className="font-mono text-xs text-ink-3">{rec ?? ""}</div>
      )}
    </div>
  );

  return (
    <button
      data-cy="score-card"
      data-cy-game-id={game.id}
      onClick={onClick}
      className="block w-full text-left bg-surface border border-line rounded-[14px] px-4 pt-[14px] pb-3 cursor-pointer font-ui"
    >
      <div className="flex items-center gap-2 mb-1">
        {isLive ? (
          <>
            <span
              className="w-[7px] h-[7px] rounded-[4px] bg-live"
              style={{ boxShadow: "0 0 0 3px color-mix(in srgb, var(--color-live) 25%, transparent)" }}
            />
            <span
              data-cy="score-card-status"
              className="text-[11px] font-bold text-live tracking-widest uppercase"
            >
              LIVE · {game.inningHalf} {game.inning}
            </span>
          </>
        ) : isFinal ? (
          <span
            data-cy="score-card-status"
            className="text-[11px] font-bold text-ink-2 tracking-widest uppercase"
          >
            FINAL{game.inning && game.inning !== 9 ? ` / ${game.inning}` : ""}
          </span>
        ) : (
          <span
            data-cy="score-card-status"
            className="text-xs font-semibold text-ink-2 font-mono"
          >
            {game.time ?? game.statusDetail}
          </span>
        )}
        <div className="flex-1" />
        {isLive && (
          <div className="flex items-center gap-2">
            <BaseDiamond bases={game.bases ?? [false, false, false]} size={20} />
            <OutDots outs={game.outs ?? 0} />
          </div>
        )}
      </div>
      {teamRow(game.away, game.awayScore, awayWon, record?.away)}
      <div className="h-px bg-line-2" />
      {teamRow(game.home, game.homeScore, homeWon, record?.home)}
      {(game.pitchers || game.broadcast) && (
        <div className="mt-2.5 pt-2.5 border-t border-line-2 flex items-center gap-2 text-[11px] text-ink-3 font-mono">
          {game.pitchers && (game.pitchers.away || game.pitchers.home) && (
            <span>
              P: {game.pitchers.away ?? "TBD"} vs. {game.pitchers.home ?? "TBD"}
            </span>
          )}
          {game.pitchers && game.broadcast && <span className="text-line">│</span>}
          {game.broadcast && (
            <span className="overflow-hidden text-ellipsis whitespace-nowrap">{game.broadcast}</span>
          )}
        </div>
      )}
    </button>
  );
}
