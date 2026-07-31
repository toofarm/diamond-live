/**
 * Playoff-picture math derived from the division standings we already fetch.
 *
 * `/api/mlb/standings` returns wins/losses per division, which is everything
 * needed to reconstruct a league's seeding, so this stays a pure client-side
 * transform rather than a second upstream call. (MLB's own
 * `standingsTypes=wildCard` response reports games back from the *wild-card
 * leader*, not from the cut line, so it wouldn't give us the column we want
 * anyway.)
 */

import type { StandingsByDivision, StandingsRow } from "./types";
import type { League } from "./teams";

/** Wild-card berths per league, on top of the division winners. */
const WILD_CARDS = 3;

/** Presentation order of the division groups within a league. */
const DIVISION_ORDER = ["East", "Central", "West"];

/** Why a team is (or isn't) in the field — drives the row's background color. */
export type PlayoffStatus = "division-leader" | "wild-card" | "out";

export interface PlayoffRow {
  abbr: string;
  w: number;
  l: number;
  pct: string; // ".615"
  /**
   * Games ahead of (+) or behind (−) the playoff cut line, one decimal.
   * Teams holding a playoff spot are measured against the first team out, so
   * every team in the field reads positive; teams outside are measured
   * against the last team in and read negative. "—" if the league has too
   * few teams to establish a cut line.
   */
  gb: string;
  /** League-wide playoff seed: 1–3 division winners by record, then the rest by record. */
  seed: number;
  status: PlayoffStatus;
}

/** One division's slice of a league's playoff picture. */
export interface PlayoffDivision {
  /** "AL East" etc. */
  div: string;
  /** In division-standings order — first row is the division leader. */
  rows: PlayoffRow[];
}

function winPct(r: StandingsRow): number {
  const g = r.w + r.l;
  return g > 0 ? r.w / g : 0;
}

/** Sort best record first. MLB's real tiebreakers are head-to-head records we
 *  don't have upstream, so ties fall back to raw wins. */
function byRecord(a: StandingsRow, b: StandingsRow): number {
  return winPct(b) - winPct(a) || b.w - a.w;
}

/** Games `a` sits ahead of `b` — half the sum of the win gap and the loss gap. */
function gamesAhead(a: StandingsRow, b: StandingsRow): number {
  return (a.w - b.w + (b.l - a.l)) / 2;
}

function formatGamesAhead(n: number): string {
  if (n === 0) return "0.0";
  return `${n > 0 ? "+" : "-"}${Math.abs(n).toFixed(1)}`;
}

/**
 * Build one league's playoff picture, grouped by division. Every team in the
 * league appears exactly once, tagged with its league-wide seed, why it is or
 * isn't in the field, and its distance from the cut line.
 */
export function derivePlayoffStandings(
  divisions: StandingsByDivision,
  league: League,
): PlayoffDivision[] {
  const groups: { div: string; teams: StandingsRow[] }[] = [];
  const leaders: StandingsRow[] = [];
  const rest: StandingsRow[] = [];

  for (const [div, rows] of Object.entries(divisions)) {
    if (!div.startsWith(league)) continue;
    groups.push({ div, teams: rows });
    // Upstream orders each division by divisionRank, so index 0 is the
    // leader — that ordering already applies MLB's head-to-head tiebreakers,
    // which `byRecord` can't reproduce.
    rows.forEach((row, i) => (i === 0 ? leaders : rest).push(row));
  }

  // Seeds 1–3 are the division winners ranked among themselves; everyone else
  // falls in line by record, and the first three of those are the wild cards.
  const seeded = [...leaders.sort(byRecord), ...rest.sort(byRecord)];
  const spots = leaders.length + WILD_CARDS;
  const lastIn = seeded[spots - 1];
  const firstOut = seeded[spots];

  const bySeed = new Map<string, PlayoffRow>();
  seeded.forEach((row, i) => {
    const status: PlayoffStatus =
      i < leaders.length ? "division-leader" : i < spots ? "wild-card" : "out";
    const ref = status === "out" ? lastIn : firstOut;
    bySeed.set(row.abbr, {
      abbr: row.abbr,
      w: row.w,
      l: row.l,
      pct: row.pct,
      gb: ref ? formatGamesAhead(gamesAhead(row, ref)) : "—",
      seed: i + 1,
      status,
    });
  });

  return groups
    .sort(
      (a, b) =>
        DIVISION_ORDER.findIndex((d) => a.div.endsWith(d)) -
        DIVISION_ORDER.findIndex((d) => b.div.endsWith(d)),
    )
    .map(({ div, teams }) => ({
      div,
      rows: teams.map((t) => bySeed.get(t.abbr)!).filter(Boolean),
    }));
}
