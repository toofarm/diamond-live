import type { BoxPitchingRow, PitchLocation } from "./types";
import type { GameDetailData } from "./types";

/* ── Synthetic pitch locations ────────────────────────────────────
 *
 * A starter throws ~100 pitches, so spelling out every plotted location as a
 * literal would triple this file for no added fidelity. Instead they're
 * derived from the row that's already here: the counts come from `pitchUsage`
 * and the ball/strike split from `balls`/`strikes`, so the fixture can't drift
 * out of agreement with itself the way two hand-maintained lists would.
 *
 * Everything below is seeded off the pitcher's MLB id — same input, same
 * scatter on every run, which is what Cypress needs.
 */

/** Mulberry32. Small, seedable, and good enough for scattering dots. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Where each pitch type tends to live, in zone coordinates. Fastballs work
 *  up, breaking and offspeed stuff works down — so toggling between types
 *  actually moves the cloud, which is the whole point of the plot. */
const PITCH_TENDENCY: Record<string, { x: number; y: number }> = {
  FF: { x: 0.0, y: 0.55 },
  SI: { x: -0.45, y: -0.1 },
  CT: { x: 0.35, y: 0.15 },
  SL: { x: 0.55, y: -0.5 },
  CB: { x: 0.15, y: -0.8 },
  CH: { x: -0.4, y: -0.6 },
  FS: { x: -0.1, y: -0.75 },
};

/**
 * Expand a pitcher's `pitchUsage` into individual located pitches.
 *
 * Results are dealt to match the row's own ball/strike split exactly — note
 * that a boxscore "strike" is any pitch that isn't a ball, so fouls and balls
 * in play come out of the strike allotment, not on top of it. Balls are then
 * placed outside the zone and strikes inside, so the picture agrees with the
 * numbers printed above it.
 */
function locationsFor(row: BoxPitchingRow): PitchLocation[] {
  const usage = row.pitchUsage ?? [];
  if (usage.length === 0) return [];
  const rand = seeded(row.id);

  // One entry per pitch, most-used type first, then shuffled so the results
  // dealt below don't land in type-ordered blocks.
  const types: string[] = [];
  for (const u of usage) for (let i = 0; i < u.count; i++) types.push(u.type);
  for (let i = types.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [types[i], types[j]] = [types[j], types[i]];
  }

  const ballBudget = row.balls ?? Math.round(types.length * 0.36);
  return types.map((type, i): PitchLocation => {
    const isBall = i < ballBudget;
    // Of the non-balls: mostly called/swinging strikes, a healthy share of
    // fouls, and the occasional ball in play.
    const roll = rand();
    const result: PitchLocation["result"] = isBall
      ? "ball"
      : roll < 0.55
        ? "strike"
        : roll < 0.85
          ? "foul-2k"
          : "inplay";

    const tend = PITCH_TENDENCY[type] ?? { x: 0, y: 0 };
    // Gaussian-ish jitter from two uniforms, centered on the type's tendency.
    const jitter = () => (rand() + rand() - 1) * 0.6;
    let x = tend.x + jitter();
    let y = tend.y + jitter();
    if (isBall) {
      // Push it clear of the zone on whichever axis it's already closer to
      // leaving, so misses read as misses rather than borderline calls.
      if (Math.abs(x) > Math.abs(y)) x = Math.sign(x || 1) * (1.08 + rand() * 0.55);
      else y = Math.sign(y || -1) * (1.08 + rand() * 0.55);
    } else {
      // Keep it honest: a called strike belongs in the zone.
      x = Math.max(-0.95, Math.min(0.95, x));
      y = Math.max(-0.95, Math.min(0.95, y));
    }

    const veloBase = type === "FF" || type === "SI" ? 94 : type === "CT" ? 90 : 85;
    return {
      x: Number(Math.max(-1.8, Math.min(1.8, x)).toFixed(2)),
      y: Number(Math.max(-1.8, Math.min(1.8, y)).toFixed(2)),
      type,
      velo: Number((veloBase + rand() * 3 - 1.5).toFixed(1)),
      // Roughly a 55/45 split of right- and left-handed batters faced.
      batterHand: rand() < 0.55 ? "R" : "L",
      result,
    };
  });
}

/** Attach synthetic locations to each pitching row that has a usage breakdown. */
function withLocations(rows: BoxPitchingRow[]): BoxPitchingRow[] {
  return rows.map((row) => ({ ...row, pitchLocations: locationsFor(row) }));
}

/**
 * Hand-built live-game fixture so the UI can be exercised when no real games
 * are in progress. Served from /api/mlb/game/[gamePk] when gamePk === 1.
 */
export const FIXTURE_LIVE_GAME: GameDetailData = {
  summary: {
    id: 1,
    away: "NYM",
    home: "PHI",
    awayScore: 4,
    homeScore: 2,
    status: "LIVE",
    statusDetail: "In Progress",
    dateISO: "2026-05-12",
    inning: 7,
    inningHalf: "TOP",
    bases: [true, false, true],
    outs: 1,
    balls: 2,
    strikes: 1,
    venue: "Citizens Bank Park",
    weather: "Clear, 71°F, Wind 6 mph Out To CF",
    awayRecord: { w: 22, l: 17 },
    homeRecord: { w: 20, l: 19 },
  },
  linescore: {
    innings: [
      { away: 0, home: 0 },
      { away: 2, home: 0 },
      { away: 0, home: 0 },
      { away: 0, home: 2 },
      { away: 1, home: 0 },
      { away: 1, home: 0 },
      { away: null, home: null },
      { away: null, home: null },
      { away: null, home: null },
    ],
    totals: {
      away: { r: 4, h: 8, e: 0 },
      home: { r: 2, h: 7, e: 1 },
    },
  },
  awayLineup: [
    { id: 624413, name: "B. Nimmo",    pos: "LF", ab: 3, r: 1, h: 2, rbi: 1, bb: 1, k: 0, avg: ".278" },
    { id: 596019, name: "F. Lindor",   pos: "SS", ab: 4, r: 1, h: 1, rbi: 0, bb: 0, k: 1, avg: ".261" },
    { id: 624415, name: "J. McNeil",   pos: "2B", ab: 4, r: 0, h: 1, rbi: 0, bb: 0, k: 1, avg: ".253" },
    { id: 660271, name: "P. Alonso",   pos: "1B", ab: 3, r: 1, h: 1, rbi: 2, bb: 1, k: 1, avg: ".242" },
    { id: 645277, name: "M. Vientos",  pos: "3B", ab: 3, r: 0, h: 1, rbi: 1, bb: 0, k: 0, avg: ".265" },
    { id: 670541, name: "S. Marte",    pos: "RF", ab: 4, r: 1, h: 1, rbi: 0, bb: 0, k: 2, avg: ".248" },
    { id: 663630, name: "B. Baty",     pos: "DH", ab: 3, r: 0, h: 1, rbi: 0, bb: 0, k: 1, avg: ".231" },
    { id: 668939, name: "L. Acuña",    pos: "CF", ab: 3, r: 0, h: 0, rbi: 0, bb: 0, k: 1, avg: ".221" },
    { id: 642708, name: "F. Alvarez",  pos: "C",  ab: 3, r: 0, h: 0, rbi: 0, bb: 0, k: 1, avg: ".236" },
  ],
  homeLineup: [
    { id: 547180, name: "B. Harper",    pos: "1B", ab: 3, r: 1, h: 1, rbi: 0, bb: 1, k: 1, avg: ".291" },
    { id: 656941, name: "T. Turner",    pos: "SS", ab: 4, r: 0, h: 2, rbi: 1, bb: 0, k: 0, avg: ".286" },
    { id: 624641, name: "K. Schwarber", pos: "DH", ab: 3, r: 1, h: 1, rbi: 1, bb: 1, k: 1, avg: ".226" },
    { id: 605204, name: "N. Castellanos", pos: "RF", ab: 4, r: 0, h: 1, rbi: 0, bb: 0, k: 2, avg: ".252" },
    { id: 547989, name: "J. T. Realmuto", pos: "C",  ab: 4, r: 0, h: 1, rbi: 0, bb: 0, k: 1, avg: ".248" },
    { id: 595777, name: "A. Bohm",      pos: "3B", ab: 3, r: 0, h: 1, rbi: 0, bb: 0, k: 0, avg: ".268" },
    { id: 670042, name: "B. Marsh",     pos: "LF", ab: 3, r: 0, h: 0, rbi: 0, bb: 0, k: 1, avg: ".239" },
    { id: 502671, name: "B. Stott",     pos: "2B", ab: 3, r: 0, h: 0, rbi: 0, bb: 0, k: 0, avg: ".245" },
    { id: 656555, name: "J. Rojas",     pos: "CF", ab: 3, r: 0, h: 0, rbi: 0, bb: 0, k: 1, avg: ".208" },
  ],
  awayPitching: withLocations([
    {
      id: 605135,
      name: "Kodai Senga",
      ip: "5.2", h: 5, r: 2, er: 2, bb: 2, k: 7, hr: 0,
      era: "3.18", pitches: 92, strikes: 59, balls: 33, bf: 24, live: true,
      pitchUsage: [
        { type: "FS", count: 26 },
        { type: "FF", count: 24 },
        { type: "CT", count: 16 },
        { type: "SL", count: 13 },
        { type: "CB", count: 8 },
        { type: "SI", count: 5 },
      ],
    },
  ]),
  homePitching: withLocations([
    {
      id: 554430,
      name: "Zack Wheeler",
      ip: "6.0", h: 6, r: 3, er: 3, bb: 2, k: 6, hr: 0,
      era: "3.45", pitches: 101, strikes: 66, balls: 35, bf: 25,
      pitchUsage: [
        { type: "FF", count: 41 },
        { type: "SI", count: 19 },
        { type: "SL", count: 18 },
        { type: "CT", count: 13 },
        { type: "CB", count: 6 },
        { type: "CH", count: 4 },
      ],
    },
    {
      id: 669373,
      name: "Matt Strahm",
      ip: "0.1", h: 2, r: 1, er: 1, bb: 0, k: 1, hr: 0,
      era: "2.81", pitches: 13, strikes: 8, balls: 5, bf: 4, live: true,
      pitchUsage: [
        { type: "FF", count: 6 },
        { type: "SL", count: 4 },
        { type: "CB", count: 2 },
        { type: "CH", count: 1 },
      ],
    },
  ]),
  plays: [
    {
      half: "TOP 7",
      desc: "Pete Alonso doubles (12) on a sharp ground ball to left field. Brandon Nimmo scores. Francisco Lindor to 3rd.",
      score: "4-2",
      tag: "2B",
      pitchSeq: [
        { n: 1, type: "FF", velo: 93.4, result: "Ball" },
        { n: 2, type: "SL", velo: 84.1, result: "Strike" },
        { n: 3, type: "FF", velo: 94.0, result: "Foul" },
        { n: 4, type: "CH", velo: 86.7, result: "In play, run(s)" },
      ],
    },
    {
      half: "TOP 7",
      desc: "Francisco Lindor singles on a line drive to right field.",
      tag: "1B",
      pitchSeq: [
        { n: 1, type: "SI", velo: 92.8, result: "Ball" },
        { n: 2, type: "FF", velo: 93.6, result: "In play, no out" },
      ],
    },
    {
      half: "BOT 6",
      desc: "Bryce Harper grounds out, second baseman Jeff McNeil to first baseman Pete Alonso.",
    },
    {
      half: "BOT 6",
      desc: "Trea Turner strikes out swinging.",
      tag: "K",
    },
    {
      half: "TOP 6",
      desc: "Brandon Nimmo homers (8) on a fly ball to right-center field.",
      score: "3-2",
      tag: "HR",
      pitchSeq: [
        { n: 1, type: "FF", velo: 94.3, result: "Strike" },
        { n: 2, type: "CB", velo: 78.2, result: "Ball" },
        { n: 3, type: "FF", velo: 94.6, result: "In play, run(s)" },
      ],
    },
    {
      half: "BOT 4",
      desc: "Kyle Schwarber homers (11) on a fly ball to right field. Bryce Harper scores.",
      score: "2-2",
      tag: "HR",
    },
  ],
  atBat: {
    inningLabel: "TOP 7 · 1 OUT",
    pitcher: {
      id: 669373,
      name: "Matt Strahm",
      firstName: "Matt",
      lastName: "Strahm",
      team: "PHI",
      hand: "L",
      pitchCountGame: 14,
      today: { ip: "0.1", h: 1, r: 1, er: 1, bb: 1, k: 0 },
    },
    batter: {
      id: 645277,
      name: "Mark Vientos",
      firstName: "Mark",
      lastName: "Vientos",
      team: "NYM",
      hand: "R",
      today: { line: "1-3, RBI", events: ["RBI Single", "Groundout", "Strikeout"] },
      seasonAvg: ".265",
      seasonHr: 9,
    },
    count: { b: 2, s: 1 },
    outs: 1,
    bases: [true, false, true],
    pitches: [
      { n: 1, type: "FF", velo: 98.4, x: -0.6, y:  0.5, result: "ball",   label: "Ball, outside" },
      { n: 2, type: "SI", velo: 97.9, x:  0.2, y: -0.2, result: "strike", label: "Called strike" },
      { n: 3, type: "FF", velo: 98.7, x:  0.9, y:  0.8, result: "ball",   label: "Ball, high" },
    ],
    isComplete: false,
  },
  winProbability: {
    // Synthetic per-play series for the fixture: a back-and-forth game that
    // currently favors the away team (68/32). atBatIndex increments by 1 per
    // play. Inning labels mostly align with how a real WP series progresses.
    plays: [
      { atBatIndex: 0, home: 50, away: 50, inning: 1, half: "TOP", desc: "Top 1: leadoff out", awayScore: 0, homeScore: 0 },
      { atBatIndex: 1, home: 52, away: 48, inning: 1, half: "TOP", desc: "Strikeout", awayScore: 0, homeScore: 0 },
      { atBatIndex: 2, home: 54, away: 46, inning: 1, half: "TOP", desc: "Inning over", awayScore: 0, homeScore: 0 },
      { atBatIndex: 3, home: 56, away: 44, inning: 1, half: "BOT", desc: "Walk", awayScore: 0, homeScore: 0 },
      { atBatIndex: 4, home: 62, away: 38, inning: 1, half: "BOT", desc: "Double", awayScore: 0, homeScore: 0 },
      { atBatIndex: 5, home: 71, away: 29, inning: 1, half: "BOT", desc: "Schwarber HR (2)", awayScore: 0, homeScore: 2 },
      { atBatIndex: 6, home: 70, away: 30, inning: 2, half: "TOP", desc: "Groundout", awayScore: 0, homeScore: 2 },
      { atBatIndex: 7, home: 68, away: 32, inning: 2, half: "TOP", desc: "Lindor single", awayScore: 0, homeScore: 2 },
      { atBatIndex: 8, home: 60, away: 40, inning: 2, half: "TOP", desc: "Alonso 2B, run scores", awayScore: 1, homeScore: 2 },
      { atBatIndex: 9, home: 58, away: 42, inning: 2, half: "BOT", desc: "Strikeout", awayScore: 1, homeScore: 2 },
      { atBatIndex: 10, home: 55, away: 45, inning: 3, half: "TOP", desc: "Vientos walk", awayScore: 1, homeScore: 2 },
      { atBatIndex: 11, home: 45, away: 55, inning: 3, half: "TOP", desc: "Marte 2-run HR", awayScore: 3, homeScore: 2 },
      { atBatIndex: 12, home: 48, away: 52, inning: 3, half: "BOT", desc: "Harper walk", awayScore: 3, homeScore: 2 },
      { atBatIndex: 13, home: 52, away: 48, inning: 3, half: "BOT", desc: "Turner double", awayScore: 3, homeScore: 2 },
      { atBatIndex: 14, home: 50, away: 50, inning: 4, half: "TOP", desc: "Flyout", awayScore: 3, homeScore: 2 },
      { atBatIndex: 15, home: 42, away: 58, inning: 4, half: "TOP", desc: "RBI single", awayScore: 4, homeScore: 2 },
      { atBatIndex: 16, home: 40, away: 60, inning: 4, half: "BOT", desc: "K", awayScore: 4, homeScore: 2 },
      { atBatIndex: 17, home: 38, away: 62, inning: 5, half: "TOP", desc: "Walk", awayScore: 4, homeScore: 2 },
      { atBatIndex: 18, home: 36, away: 64, inning: 5, half: "TOP", desc: "Hit by pitch", awayScore: 4, homeScore: 2 },
      { atBatIndex: 19, home: 34, away: 66, inning: 5, half: "BOT", desc: "Groundout", awayScore: 4, homeScore: 2 },
      { atBatIndex: 20, home: 32, away: 68, inning: 6, half: "TOP", desc: "Senga K, runner on", awayScore: 4, homeScore: 2 },
    ],
    home: 32,
    away: 68,
  },
  spray: [
    {
      batterId: 596019,
      fullName: "Francisco Lindor",
      lastName: "Lindor",
      team: "NYM",
      points: [
        { x: 95,  y: 55,  outcome: "HR",  inning: 5, half: "TOP", event: "Home Run" },
        { x: 65,  y: 110, outcome: "2B",  inning: 3, half: "TOP", event: "Double" },
        { x: 145, y: 130, outcome: "1B",  inning: 7, half: "TOP", event: "Single" },
        { x: 105, y: 175, outcome: "OUT", inning: 1, half: "TOP", event: "Groundout" },
      ],
    },
    {
      batterId: 660271,
      fullName: "Pete Alonso",
      lastName: "Alonso",
      team: "NYM",
      points: [
        { x: 175, y: 80,  outcome: "HR",  inning: 2, half: "TOP", event: "Home Run" },
        { x: 55,  y: 125, outcome: "2B",  inning: 7, half: "TOP", event: "Double" },
        { x: 130, y: 160, outcome: "OUT", inning: 5, half: "TOP", event: "Lineout" },
      ],
    },
    {
      batterId: 624413,
      fullName: "Brandon Nimmo",
      lastName: "Nimmo",
      team: "NYM",
      points: [
        { x: 195, y: 65,  outcome: "HR",  inning: 6, half: "TOP", event: "Home Run" },
        { x: 80,  y: 145, outcome: "1B",  inning: 4, half: "TOP", event: "Single" },
        { x: 165, y: 175, outcome: "OUT", inning: 2, half: "TOP", event: "Flyout" },
      ],
    },
    {
      batterId: 624641,
      fullName: "Kyle Schwarber",
      lastName: "Schwarber",
      team: "PHI",
      points: [
        { x: 200, y: 80,  outcome: "HR",  inning: 4, half: "BOT", event: "Home Run" },
        { x: 110, y: 150, outcome: "OUT", inning: 1, half: "BOT", event: "Flyout" },
      ],
    },
    {
      batterId: 656941,
      fullName: "Trea Turner",
      lastName: "Turner",
      team: "PHI",
      points: [
        { x: 70,  y: 135, outcome: "1B",  inning: 3, half: "BOT", event: "Single" },
        { x: 155, y: 160, outcome: "1B",  inning: 5, half: "BOT", event: "Single" },
      ],
    },
    {
      batterId: 547180,
      fullName: "Bryce Harper",
      lastName: "Harper",
      team: "PHI",
      points: [
        { x: 175, y: 130, outcome: "2B",  inning: 2, half: "BOT", event: "Double" },
        { x: 95,  y: 180, outcome: "OUT", inning: 6, half: "BOT", event: "Groundout" },
      ],
    },
  ],
};
