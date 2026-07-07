"use client";

import { TeamBadge, BaseDiamond, OutDots } from "./primitives";
import type { GameSummary, TeamRecord } from "@/lib/mlb/types";
import { formatLocalTime } from "@/lib/date";

export function ScoreCard({
  game,
  onClick,
}: {
  game: GameSummary;
  onClick: () => void;
}) {
  const isLive = game.status === "LIVE";
  const isFinal = game.status === "FINAL";
  const isPostponed = game.status === "POSTPONED";
  const awayWon = isFinal && (game.awayScore ?? 0) > (game.homeScore ?? 0);
  const homeWon = isFinal && (game.homeScore ?? 0) > (game.awayScore ?? 0);

  // Completed games credit the winning/losing pitcher; upcoming/live games
  // list the probable starters. A final game whose decisions haven't posted
  // yet (rare — suspended/rescored) simply shows neither.
  const decisions = isFinal ? game.decisions : undefined;
  const hasDecisions = !!(decisions && (decisions.winner || decisions.loser));
  const hasProbables =
    !isFinal && !!(game.pitchers && (game.pitchers.away || game.pitchers.home));

  const teamRow = (abbr: string, score: number | null, won: boolean, rec?: TeamRecord) => (
    <div
      className={`flex items-center gap-3 py-2 ${isFinal && !won ? "opacity-55" : ""}`}
    >
      <TeamBadge abbr={abbr} size={26} />
      <div className="flex-1 flex flex-col leading-none">
        <div className="font-head font-bold text-[18px] text-ink tracking-[-0.3px]">{abbr}</div>
        {rec && (
          <div data-cy="team-record" className="mt-0.5 font-mono text-[10px] text-ink-3 tracking-[0.4px]">
            {rec.w} - {rec.l}
          </div>
        )}
      </div>
      {(isLive || isFinal) && (
        <div className="font-mono text-[22px] font-semibold text-ink tracking-[-0.5px]">{score ?? 0}</div>
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
            <span className="w-[7px] h-[7px] rounded-[4px] bg-live dl-live-pulse" />
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
        ) : isPostponed ? (
          <span
            data-cy="score-card-status"
            className="text-[11px] font-bold text-ink-3 tracking-widest uppercase"
          >
            Postponed
          </span>
        ) : (
          <span
            data-cy="score-card-status"
            className="text-xs font-semibold text-ink-2 font-mono"
          >
            {formatLocalTime(game.time) ?? game.statusDetail}
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
      {teamRow(game.away, game.awayScore, awayWon, game.awayRecord)}
      <div className="h-px bg-line-2" />
      {teamRow(game.home, game.homeScore, homeWon, game.homeRecord)}
      {(hasDecisions || hasProbables || game.broadcast) && (
        <div className="mt-2.5 pt-2.5 border-t border-line-2 flex items-center gap-2 text-[11px] text-ink-3 font-mono">
          {hasDecisions ? (
            <span data-cy="score-card-decisions">
              {decisions!.winner && `W: ${decisions!.winner.fullName}`}
              {decisions!.winner && decisions!.loser && " · "}
              {decisions!.loser && `L: ${decisions!.loser.fullName}`}
            </span>
          ) : hasProbables ? (
            <span data-cy="score-card-probables">
              P: {game.pitchers!.away ?? "TBD"} vs. {game.pitchers!.home ?? "TBD"}
            </span>
          ) : null}
          {(hasDecisions || hasProbables) && game.broadcast && (
            <span className="text-line">│</span>
          )}
          {game.broadcast && (
            <span className="overflow-hidden text-ellipsis whitespace-nowrap">{game.broadcast}</span>
          )}
        </div>
      )}
    </button>
  );
}
