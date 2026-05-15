/**
 * Per-stat "which direction is better" for the Season-tab comparison column.
 *
 * Most stats are "higher is better" (defaults), but rate-stat negatives (ERA,
 * WHIP, BB/9) and outcome negatives (losses, strikeouts-for-a-hitter) flip.
 * Volume stats like games played and innings pitched are neutral — the
 * compared player having more games doesn't make them "better."
 *
 * `strikeOuts` is the headline collision: a hitter's K is bad, a pitcher's K
 * is good. Keyed by mode to disambiguate cleanly.
 */

export type Direction = "higher" | "lower" | "neutral";

export const STAT_DIRECTION_BY_MODE: Record<
  "batting" | "pitching",
  Record<string, Direction>
> = {
  batting: {
    gamesPlayed: "neutral",
    atBats: "neutral",
    strikeOuts: "lower",
  },
  pitching: {
    era: "lower",
    whip: "lower",
    walksPer9Inn: "lower",
    losses: "lower",
    gamesPlayed: "neutral",
    gamesStarted: "neutral",
    inningsPitched: "neutral",
    holds: "neutral",
  },
};

/** Decide which side wins for a single stat row. Returns null when one side is
 *  missing, when the stat is neutral, or when values tie after normalisation.
 *  Slash-line strings like ".289" are normalised to "0.289" so parseFloat
 *  doesn't choke. */
export function pickWinner(
  key: string,
  a: string | number | undefined,
  b: string | number | undefined,
  mode: "batting" | "pitching",
): "a" | "b" | null {
  if (a == null || a === "" || b == null || b === "") return null;
  const dir = STAT_DIRECTION_BY_MODE[mode][key] ?? "higher";
  if (dir === "neutral") return null;
  const na = parseFloat(String(a).replace(/^\./, "0."));
  const nb = parseFloat(String(b).replace(/^\./, "0."));
  if (!Number.isFinite(na) || !Number.isFinite(nb) || na === nb) return null;
  const aWins = dir === "higher" ? na > nb : na < nb;
  return aWins ? "a" : "b";
}
