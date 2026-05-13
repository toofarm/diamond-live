/** Reshaped, UI-friendly types returned from /api/mlb/*. */

export type GameStatus = "LIVE" | "FINAL" | "SCHEDULED" | "POSTPONED";
export type HalfInning = "TOP" | "BOT";

export interface GameSummary {
  id: number;                 // gamePk
  away: string;               // team abbr
  home: string;
  awayScore: number | null;
  homeScore: number | null;
  status: GameStatus;
  statusDetail?: string;      // raw MLB detailed state
  time?: string;              // ISO 8601 game-start timestamp (formatted client-side via lib/date.ts:formatLocalTime)
  dateISO: string;            // YYYY-MM-DD (game's official date)

  // LIVE-only
  inning?: number;
  inningHalf?: HalfInning;
  bases?: [boolean, boolean, boolean]; // 1B, 2B, 3B
  outs?: number;
  balls?: number;
  strikes?: number;

  pitchers?: { away?: string; home?: string };
  broadcast?: string;
  venue?: string;
  weather?: string;

  awayRecord?: TeamRecord;
  homeRecord?: TeamRecord;
}

export interface TeamRecord {
  w: number;
  l: number;
}

export interface LinescoreInning { away: number | null; home: number | null }
export interface LinescoreTotals  { r: number; h: number; e: number }
export interface Linescore {
  innings: LinescoreInning[];
  totals: { away: LinescoreTotals; home: LinescoreTotals };
}

export interface Pitch {
  n: number;
  type: string;        // FF, SL, etc.
  velo: number;        // mph
  x: number;           // -1.8..1.8 (zone interior is -1..1)
  y: number;           // -1.8..1.8 (positive = high)
  result: "ball" | "strike" | "foul-2k" | "inplay";
  label: string;
}

export interface Play {
  half: string;        // "TOP 6" / "BOT 4"
  desc: string;
  score?: string;
  outs?: number;
  tag?: string;        // "HR", "2B" etc.
  pitchSeq?: { n: number; type: string; velo: number; result: string }[];
}

export interface BoxLineupRow {
  id: number;          // MLB person id
  name: string;
  pos: string;
  ab: number; r: number; h: number; rbi: number; bb: number; k: number;
  avg?: string;
}

export interface PitchUsageEntry {
  /** Pitch type code, e.g. 'FF', 'SL', 'CH'. */
  type: string;
  count: number;
}

export interface BoxPitchingRow {
  id: number;
  name: string;
  ip: string;
  h: number; r: number; er: number; bb: number; k: number; hr: number;
  era?: string;
  pitches?: number;
  /** Counts by pitch type for this pitcher in the current game. */
  pitchUsage?: PitchUsageEntry[];
  /** True when this pitcher is the most recent / currently-active arm for the team. */
  live?: boolean;
}

export interface WinProbability {
  /** 0–100, sums to 100 with home. */
  away: number;
  home: number;
}

export type SprayOutcome = "HR" | "3B" | "2B" | "1B" | "OUT";

export interface SprayPoint {
  /** MLB Stats API hitData coords (0–250 image space, home plate near y≈205). */
  x: number;
  y: number;
  outcome: SprayOutcome;
  inning?: number;
  half?: HalfInning;
  /** e.g. "Single", "Groundout", short result label. */
  event?: string;
}

export interface BatterSpray {
  batterId: number;
  /** Full name as it appears in the feed, e.g. "Francisco Lindor". */
  fullName: string;
  lastName: string;
  /** Team abbreviation. */
  team: string;
  points: SprayPoint[];
}

export interface GameDetailData {
  summary: GameSummary;
  linescore: Linescore | null;
  awayLineup: BoxLineupRow[];
  homeLineup: BoxLineupRow[];
  awayPitching: BoxPitchingRow[];
  homePitching: BoxPitchingRow[];
  plays: Play[];
  atBat: AtBat | null;
  winProbability: WinProbability | null;
  /** Per-batter batted-ball spray points for the current game. */
  spray: BatterSpray[];
}

export interface AtBat {
  inningLabel: string;
  pitcher: {
    id: number;
    name: string;
    firstName: string;
    lastName: string;
    team: string;
    hand: "L" | "R";
    pitchCountGame: number;
    today: { ip: string; h: number; r: number; er: number; bb: number; k: number };
  };
  batter: {
    id: number;
    name: string;
    firstName: string;
    lastName: string;
    team: string;
    hand: "L" | "R";
    today: { line: string; events: string[] };
    seasonAvg?: string;
    seasonHr?: number;
  };
  count: { b: number; s: number };
  outs: number;
  bases: [boolean, boolean, boolean];
  pitches: Pitch[];
  /** True when this snapshot is the just-finished plate appearance (terminal
     pitch included), false while the at-bat is in progress. The client uses
     this to decide whether to render the result banner above the strike zone. */
  isComplete: boolean;
}

export interface StandingsRow {
  abbr: string;
  w: number; l: number;
  pct: string;       // ".615"
  gb: string;        // "—" or "1.5"
}
export type StandingsByDivision = Record<string, StandingsRow[]>;

export interface ScheduleGame {
  id: number;
  dateISO: string;
  away: string;
  home: string;
  away_score?: number;
  home_score?: number;
  status: GameStatus;
  time?: string;             // ISO 8601 game-start timestamp (formatted client-side via lib/date.ts:formatLocalTime)
  statusDetail?: string;
  series?: { idx: number; len: number };
  awayRecord?: TeamRecord;
  homeRecord?: TeamRecord;
}

export interface LeaderRow {
  personId: number;
  fullName: string;
  team: string;
  position?: string;
  value: string;
}

export type LeaderGroup = "hitting" | "pitching" | "fielding";

export type LeaderCategory =
  | "AVG" | "HR" | "RBI" | "OPS" | "OBP" | "SLG" | "H" | "R"
  | "ERA" | "K" | "WHIP" | "W" | "SV"
  | "FPCT" | "PO" | "A" | "E";

export interface RosterRow {
  id: number;
  num: number | string;
  pos: string;
  name: string;
  hand?: string;
  group: "pitchers" | "catchers" | "infielders" | "outfielders" | "designated_hitter";
  /** Populated when MLB's roster entry has a non-"Active" status (IL stint,
   *  suspended, restricted, etc.). `description` is the official roster-status
   *  label (e.g. "60-Day Injured List"); `notes`, when present, is the actual
   *  injury free-text (e.g. "Right oblique strain"). */
  injuryStatus?: { code: string; description: string; notes?: string };
}

export interface TeamDetailData {
  abbr: string;
  roster: RosterRow[];
}

export interface TeamSeasonRecord {
  w: number;
  l: number;
  pct: string;
  streak?: string;
  divRank?: number;
  divName?: string;
}

/** One past game from the team's perspective, used in the SeasonTab "last 5" pill row. */
export interface TeamLastGame {
  id: number;
  dateISO: string;
  opp: string;
  home: boolean;
  result: "W" | "L";
  score: { us: number; them: number };
}

/** Flat key→value bag of season totals (avg, era, ops, etc.). Shape mirrors MLB's
 *  `stats[].splits[0].stat` so the UI can pick known keys without TS gymnastics. */
export type TeamSeasonStats = Record<string, string | number | undefined>;

export type TeamBattingLeaderCategory = "AVG" | "HR" | "RBI" | "OPS";
export type TeamPitchingLeaderCategory = "ERA" | "W" | "K" | "SV";

export interface TeamSeasonData {
  record: TeamSeasonRecord;
  lastGames: TeamLastGame[];
  leaders: {
    batting: Record<TeamBattingLeaderCategory, LeaderRow[]>;
    pitching: Record<TeamPitchingLeaderCategory, LeaderRow[]>;
  };
  stats: {
    batting: TeamSeasonStats;
    pitching: TeamSeasonStats;
  };
}

export interface PersonnelRow {
  id?: number;
  name: string;
  title: string;
}

export interface PersonnelData {
  coaches: PersonnelRow[];
  frontOffice: PersonnelRow[];
}

export interface PlayerDetailData {
  id: number;
  fullName: string;
  team: string | null;
  position: string;
  bats: string;
  throws: string;
  num?: string | number;
  age?: number;
  height?: string;
  weight?: number;
  birthCity?: string;
  birthCountry?: string;
  hitting?: Record<string, string | number>;
  pitching?: Record<string, string | number>;
}

/** Hitter or pitcher — drives which fields the API populates and which columns the UI renders. */
export type StatMode = "hitting" | "pitching";

export interface PlayerSplitRow {
  code: string;        // 'vr', 'vl', 'h', 'a', 'd', 'n', 'risp'
  label: string;       // 'vs RHP', 'Home', etc.
  // hitting mode
  avg?: string;
  ops?: string;
  // pitching mode
  era?: string;
  whip?: string;
}

export interface PlayerGameLogRow {
  date: string;        // YYYY-MM-DD
  opp: string | null;  // team abbr of opponent
  isHome: boolean;
  // hitting mode
  ab?: number;
  h?: number;          // for pitchers this is hits ALLOWED; for hitters it's hits
  hr?: number;
  rbi?: number;
  // pitching mode
  ip?: string;
  er?: number;
  k?: number;
  bb?: number;
}

export interface PlayerHistoryYear {
  year: number;
  team: string | null;
  g: number;
  // hitting mode
  ab?: number;
  hr?: number;
  rbi?: number;
  avg?: string;
  ops?: string;
  // pitching mode
  w?: number;
  l?: number;
  era?: string;
  ip?: string;
  k?: number;
  whip?: string;
}

export interface PlayerCareerTotals {
  g: number;
  seasons: number;          // count of distinct seasons
  yearRange?: string;       // e.g. "2018–2026"
  // hitting mode
  ab?: number;
  hr?: number;
  rbi?: number;
  avg?: string;
  ops?: string;
  // pitching mode
  w?: number;
  l?: number;
  era?: string;
  ip?: string;
  k?: number;
  whip?: string;
}

export interface PlayerHighlight {
  name: string;             // e.g. "All-Star", "Gold Glove"
  count: number;            // number of distinct seasons earned
  mostRecentYear: number;
}

export interface PlayerHistoryData {
  mode: StatMode;
  years: PlayerHistoryYear[];
  career: PlayerCareerTotals;
  highlights: PlayerHighlight[];
}
