import type { GameSummary, SeriesGame } from "./types";

/** A pair of numbers oriented to the viewed game's away/home sides — so the
 *  card reads "NYM 5 · PHI 3" the same way the hero does, even for meetings
 *  where the two teams had swapped sides. */
export interface SidePair {
  away: number;
  home: number;
}

export interface SeriesRow {
  game: SeriesGame;
  /** The game currently open in GameDetail. */
  isCurrent: boolean;
  /** Series tally once this game went final. Absent for unplayed games. */
  tally?: SidePair;
}

export interface SeriesSummary {
  rows: SeriesRow[];
  wins: SidePair;
  runs: SidePair;
  played: number;
  /** LIVE + SCHEDULED. Postponed games without a makeup date aren't counted —
   *  there's no guarantee they'll be played. */
  remaining: number;
  /** Abbr of the team ahead, or null when level. */
  leader: string | null;
}

/**
 * Fold the head-to-head list into a tally from `current`'s perspective.
 *
 * `current` is the live game payload, which is polled every 10s; the series
 * list is cached for five minutes. So the current game's row is swapped for
 * `current` before counting — otherwise a game that just ended would sit
 * unscored in the tally while the hero above it already reads FINAL. A
 * `current` that isn't in the list (a postseason game, the dev fixture) is
 * left out rather than appended: it's not a regular-season meeting.
 */
export function summarizeSeries(games: SeriesGame[], current: GameSummary): SeriesSummary {
  const wins: SidePair = { away: 0, home: 0 };
  const runs: SidePair = { away: 0, home: 0 };
  let played = 0;
  let remaining = 0;

  const rows: SeriesRow[] = games.map((listed) => {
    const isCurrent = listed.id === current.id;
    const game: SeriesGame = isCurrent
      ? {
          ...listed,
          status: current.status,
          awayScore: current.awayScore ?? undefined,
          homeScore: current.homeScore ?? undefined,
        }
      : listed;

    if (game.status === "LIVE" || game.status === "SCHEDULED") remaining++;
    if (game.status !== "FINAL" || game.awayScore == null || game.homeScore == null) {
      return { game, isCurrent };
    }

    played++;
    // Credit runs and wins to the viewed game's sides, whichever side each
    // team was on for this particular meeting.
    const flipped = game.away !== current.away;
    const [ourAwayRuns, ourHomeRuns] = flipped
      ? [game.homeScore, game.awayScore]
      : [game.awayScore, game.homeScore];
    runs.away += ourAwayRuns;
    runs.home += ourHomeRuns;
    if (ourAwayRuns > ourHomeRuns) wins.away++;
    else if (ourHomeRuns > ourAwayRuns) wins.home++;
    return { game, isCurrent, tally: { ...wins } };
  });

  const leader =
    wins.away > wins.home ? current.away : wins.home > wins.away ? current.home : null;
  return { rows, wins, runs, played, remaining, leader };
}

/** "NYM lead 5–3", "Series tied 4–4", "PHI won the series 8–5", … */
export function seriesHeadline(s: SeriesSummary): string {
  const hi = Math.max(s.wins.away, s.wins.home);
  const lo = Math.min(s.wins.away, s.wins.home);
  if (s.played === 0) return "No games played yet";
  if (s.remaining === 0) {
    return s.leader ? `${s.leader} won the series ${hi}–${lo}` : `Series split ${hi}–${lo}`;
  }
  return s.leader ? `${s.leader} lead ${hi}–${lo}` : `Series tied ${hi}–${lo}`;
}
