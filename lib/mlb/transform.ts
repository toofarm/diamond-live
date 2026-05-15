/**
 * Mappers from MLB statsapi shapes to our UI-friendly shapes (lib/mlb/types.ts).
 * MLB shapes change occasionally — every accessor is null-safe and falls back
 * to sensible defaults rather than throwing.
 */

import { abbrByMlbId, TEAMS } from "./teams";
import type {
  AtBat,
  BoxLineupRow,
  BoxPitchingRow,
  GameDetailData,
  GameSummary,
  LeaderRow,
  Linescore,
  PersonnelRow,
  Pitch,
  Play,
  PlayerCareerTotals,
  PlayerDetailData,
  PlayerGameLogRow,
  PlayerHighlight,
  PlayerHistoryData,
  PlayerHistoryYear,
  PlayerSplitRow,
  RosterRow,
  ScheduleGame,
  StandingsByDivision,
  StandingsRow,
  StatMode,
  TeamLastGame,
  TeamSeasonRecord,
  TeamSeasonStats,
} from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Pass an ISO timestamp through if valid; the UI formats it in the user's
   local timezone via lib/date.ts:formatLocalTime. Formatting server-side would
   silently use the server's timezone instead of the viewer's. */
function passThroughISO(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(+d)) return undefined;
  return iso;
}

function dateISOFromGameDate(iso: string | undefined): string {
  if (!iso) return "";
  // statsapi `gameDate` is ISO timestamp like "2026-05-11T23:05:00Z" — but the schedule
  // endpoint also provides date.dates[i].date in YYYY-MM-DD which is preferable.
  return iso.slice(0, 10);
}

/** Generational suffixes that should travel with the surname when we shorten a
 *  player's name (e.g. "Vladimir Guerrero Jr." → "Guerrero Jr.", not "Jr.").
 *  Stored lowercase + dot-stripped for case/punctuation-insensitive matching. */
const NAME_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

/** Derive a display "last name" from a full name. Handles the common corner
 *  case where the final token is a generational suffix — in that case we
 *  return "<surname> <suffix>" so the UI doesn't render just "Jr." or "II".
 *  Falls back to the trailing token (or the whole string) for everything else. */
function lastNameFromFull(full: string | undefined): string {
  if (!full) return "";
  const parts = full.trim().split(/\s+/);
  if (parts.length <= 1) return parts[0] ?? "";
  const last = parts[parts.length - 1];
  const lastKey = last.toLowerCase().replace(/\./g, "");
  if (NAME_SUFFIXES.has(lastKey)) {
    return `${parts[parts.length - 2]} ${last}`;
  }
  return last;
}

function mapStatus(
  abstract?: string,
  detailed?: string,
): GameSummary["status"] {
  if (abstract === "Live") return "LIVE";
  if (abstract === "Final") return "FINAL";
  if (detailed && /postponed/i.test(detailed)) return "POSTPONED";
  return "SCHEDULED";
}

function readBases(linescore: any): [boolean, boolean, boolean] {
  const off = linescore?.offense ?? {};
  return [Boolean(off.first), Boolean(off.second), Boolean(off.third)];
}

function readPitcher(p: any): string | undefined {
  if (!p) return undefined;
  // schedule hydrate shape: { fullName }
  return p.fullName ?? p.lastName ?? undefined;
}

/** Pull the per-game team W-L from a team-side object. Two upstream shapes:
 *  - Schedule feed:  `teams.{side}.leagueRecord = { wins, losses, pct }`
 *  - Live feed:      `teams.{side}.record.leagueRecord = { wins, losses, pct }`
 *  We probe both. Returns undefined when neither has wins/losses populated. */
function readRecord(side: any): { w: number; l: number } | undefined {
  const rec = side?.leagueRecord ?? side?.record?.leagueRecord ?? side?.record;
  if (!rec) return undefined;
  const w = typeof rec.wins === "number" ? rec.wins : null;
  const l = typeof rec.losses === "number" ? rec.losses : null;
  if (w == null || l == null) return undefined;
  return { w, l };
}

/** Map one game from `schedule?hydrate=probablePitcher,linescore,broadcasts` */
export function mapScheduleGame(g: any, dateISO?: string): GameSummary | null {
  const awayId = g?.teams?.away?.team?.id;
  const homeId = g?.teams?.home?.team?.id;
  const away = awayId != null ? abbrByMlbId(awayId) : undefined;
  const home = homeId != null ? abbrByMlbId(homeId) : undefined;
  if (!away || !home) return null; // skip non-MLB games (e.g. spring training opponents)

  const linescore = g?.linescore;
  const status = mapStatus(
    g?.status?.abstractGameState,
    g?.status?.detailedState,
  );
  const isLive = status === "LIVE";

  const broadcasts = Array.isArray(g?.broadcasts)
    ? g.broadcasts
        .filter((b: any) => b?.type === "TV" && b?.isNational !== true)
        .map((b: any) => b?.name)
        .filter(Boolean)
    : [];

  const summary: GameSummary = {
    id: g.gamePk,
    away,
    home,
    awayScore:
      typeof g?.teams?.away?.score === "number" ? g.teams.away.score : null,
    homeScore:
      typeof g?.teams?.home?.score === "number" ? g.teams.home.score : null,
    status,
    statusDetail: g?.status?.detailedState,
    dateISO: dateISO ?? dateISOFromGameDate(g?.gameDate),
    time: passThroughISO(g?.gameDate),
    pitchers: {
      away: readPitcher(g?.teams?.away?.probablePitcher),
      home: readPitcher(g?.teams?.home?.probablePitcher),
    },
    broadcast: broadcasts.slice(0, 2).join(", ") || undefined,
    venue: g?.venue?.name,
    awayRecord: readRecord(g?.teams?.away),
    homeRecord: readRecord(g?.teams?.home),
  };

  if (isLive && linescore) {
    summary.inning = linescore.currentInning ?? undefined;
    const halfRaw = String(linescore.inningHalf ?? "").toUpperCase();
    summary.inningHalf =
      halfRaw === "BOTTOM" ? "BOT" : halfRaw === "TOP" ? "TOP" : undefined;
    summary.bases = readBases(linescore);
    summary.outs = linescore.outs ?? 0;
    summary.balls = linescore.balls ?? 0;
    summary.strikes = linescore.strikes ?? 0;
  }

  return summary;
}

/** Map one game from /schedule into our schedule-screen shape (simpler). */
export function mapScheduleListGame(
  g: any,
  dateISO: string,
): ScheduleGame | null {
  const awayId = g?.teams?.away?.team?.id;
  const homeId = g?.teams?.home?.team?.id;
  const away = awayId != null ? abbrByMlbId(awayId) : undefined;
  const home = homeId != null ? abbrByMlbId(homeId) : undefined;
  if (!away || !home) return null;
  const status = mapStatus(
    g?.status?.abstractGameState,
    g?.status?.detailedState,
  );

  return {
    id: g.gamePk,
    dateISO,
    away,
    home,
    away_score:
      typeof g?.teams?.away?.score === "number"
        ? g.teams.away.score
        : undefined,
    home_score:
      typeof g?.teams?.home?.score === "number"
        ? g.teams.home.score
        : undefined,
    status,
    time: passThroughISO(g?.gameDate),
    statusDetail: g?.status?.detailedState,
    series:
      g?.seriesGameNumber && g?.gamesInSeries
        ? { idx: g.seriesGameNumber, len: g.gamesInSeries }
        : undefined,
    awayRecord: readRecord(g?.teams?.away),
    homeRecord: readRecord(g?.teams?.home),
  };
}

const DIVISION_LABEL: Record<number, string> = {
  200: "AL West",
  201: "AL East",
  202: "AL Central",
  203: "NL West",
  204: "NL East",
  205: "NL Central",
};

export function mapStandings(json: any): StandingsByDivision {
  const out: StandingsByDivision = {};
  for (const rec of json?.records ?? []) {
    const divId = rec?.division?.id;
    const label = DIVISION_LABEL[divId];
    if (!label) continue;
    const rows: StandingsRow[] = [];
    for (const tr of rec?.teamRecords ?? []) {
      const abbr = abbrByMlbId(tr?.team?.id);
      if (!abbr) continue;
      const w = tr?.wins ?? 0;
      const l = tr?.losses ?? 0;
      const pct =
        w + l > 0 ? (w / (w + l)).toFixed(3).replace(/^0/, "") : ".000";
      const gb = tr?.gamesBack ?? "—";
      rows.push({ abbr, w, l, pct, gb: gb === "-" ? "—" : String(gb) });
    }
    out[label] = rows;
  }
  return out;
}

/* ── Game detail ─────────────────────────────────────────────────────────── */

function mapLinescore(json: any): Linescore | null {
  const ls = json?.liveData?.linescore;
  if (!ls) return null;
  const innings = (ls.innings ?? []).map((inn: any) => ({
    away: typeof inn?.away?.runs === "number" ? inn.away.runs : null,
    home: typeof inn?.home?.runs === "number" ? inn.home.runs : null,
  }));
  // Pad to 9 innings min for display
  while (innings.length < 9) innings.push({ away: null, home: null });
  return {
    innings,
    totals: {
      away: {
        r: ls?.teams?.away?.runs ?? 0,
        h: ls?.teams?.away?.hits ?? 0,
        e: ls?.teams?.away?.errors ?? 0,
      },
      home: {
        r: ls?.teams?.home?.runs ?? 0,
        h: ls?.teams?.home?.hits ?? 0,
        e: ls?.teams?.home?.errors ?? 0,
      },
    },
  };
}

const PLAY_TAG: Record<string, string> = {
  "Home Run": "HR",
  Triple: "3B",
  Double: "2B",
  Single: "1B",
  Walk: "BB",
  Strikeout: "K",
};

function mapPlay(p: any): Play {
  const halfRaw = String(p?.about?.halfInning ?? "").toLowerCase();
  const half =
    `${halfRaw === "top" ? "TOP" : "BOT"} ${p?.about?.inning ?? ""}`.trim();
  const event = p?.result?.event;
  const tag = event ? PLAY_TAG[event] : undefined;

  // Pitch sequence — last pitchEvents in play
  const pitchSeq = (p?.playEvents ?? [])
    .filter((e: any) => e?.isPitch)
    .map((e: any, idx: number) => ({
      n: idx + 1,
      type: e?.details?.type?.code ?? "",
      velo:
        typeof e?.pitchData?.startSpeed === "number"
          ? Number(e.pitchData.startSpeed.toFixed(1))
          : 0,
      result: e?.details?.description ?? e?.details?.call?.description ?? "",
    }));

  return {
    half,
    desc: p?.result?.description ?? p?.result?.event ?? "",
    score:
      typeof p?.result?.awayScore === "number" &&
      typeof p?.result?.homeScore === "number"
        ? `${p.result.awayScore}-${p.result.homeScore}`
        : undefined,
    outs: p?.count?.outs,
    tag,
    pitchSeq: pitchSeq.length ? pitchSeq : undefined,
  };
}

function emptyStats() {
  return { ab: 0, r: 0, h: 0, rbi: 0, bb: 0, k: 0, avg: "" };
}

function mapBoxLineup(side: any): BoxLineupRow[] {
  const players = side?.players ?? {};
  const battingOrder: Array<number | string> = side?.battingOrder ?? [];
  const rows: BoxLineupRow[] = [];
  for (const raw of battingOrder) {
    const id = typeof raw === "string" ? raw.replace(/^ID/, "") : String(raw);
    const p = players[`ID${id}`];
    if (!p) continue;
    const stats = p?.stats?.batting ?? emptyStats();
    rows.push({
      id: p?.person?.id ?? Number(id) ?? 0,
      name: p?.person?.fullName ?? "—",
      pos: p?.position?.abbreviation ?? "",
      ab: stats.atBats ?? 0,
      r: stats.runs ?? 0,
      h: stats.hits ?? 0,
      rbi: stats.rbi ?? 0,
      bb: stats.baseOnBalls ?? 0,
      k: stats.strikeOuts ?? 0,
      avg: p?.seasonStats?.batting?.avg ?? "",
    });
    if (rows.length >= 9) break; // starting 9
  }
  return rows;
}

function mapBoxPitching(side: any): BoxPitchingRow[] {
  const players = side?.players ?? {};
  const pitchers: Array<number | string> = side?.pitchers ?? [];
  const rows: BoxPitchingRow[] = [];
  for (const raw of pitchers) {
    const id = typeof raw === "string" ? raw.replace(/^ID/, "") : String(raw);
    const p = players[`ID${id}`];
    if (!p) continue;
    const stats = p?.stats?.pitching ?? {};
    rows.push({
      id: p?.person?.id ?? 0,
      name: p?.person?.fullName ?? "—",
      ip: String(stats.inningsPitched ?? "0.0"),
      h: stats.hits ?? 0,
      r: stats.runs ?? 0,
      er: stats.earnedRuns ?? 0,
      bb: stats.baseOnBalls ?? 0,
      k: stats.strikeOuts ?? 0,
      hr: stats.homeRuns ?? 0,
      era: p?.seasonStats?.pitching?.era ?? "",
      pitches: stats.numberOfPitches ?? undefined,
    });
  }
  return rows;
}

/** Build an AtBat snapshot from the current plate-appearance play (if game is live).
   When currentPlay has no pitch events yet (between at-bats / between innings),
   fall back to the most recently completed play in allPlays so the just-finished
   at-bat — including its terminal pitch — stays on screen until the next batter
   sees a pitch. The fallback emits isComplete=true so the client can banner it. */
function mapAtBat(feed: any): AtBat | null {
  const live = feed?.liveData;
  const currentPlay = live?.plays?.currentPlay;
  const currentPitches = (currentPlay?.playEvents ?? []).filter(
    (e: any) => e?.isPitch,
  );

  let cur = currentPlay;
  let pitchEvents = currentPitches;
  let isComplete = Boolean(currentPlay?.about?.isComplete);

  if (!cur || pitchEvents.length === 0) {
    const allPlays = (live?.plays?.allPlays ?? []) as any[];
    const fallback = [...allPlays].reverse().find((p: any) => {
      if (!p?.result?.event) return false;
      return (p?.playEvents ?? []).some((e: any) => e?.isPitch);
    });
    if (!fallback) return null;
    cur = fallback;
    pitchEvents = (cur?.playEvents ?? []).filter((e: any) => e?.isPitch);
    isComplete = true;
  }
  if (pitchEvents.length === 0) return null;

  const pitches: Pitch[] = pitchEvents.map((e: any, i: number): Pitch => {
    const coords = e?.pitchData?.coordinates ?? {};
    // statsapi pX is in feet, roughly -1.5..1.5 (zone half-width ~0.83 ft).
    // pZ ranges from ~1.5 (low strike) to ~3.5 (high strike). We map to UI's
    // [-1, 1] zone interior and [-1.8, 1.8] outer canvas.
    const px =
      typeof coords.pX === "number"
        ? Math.max(-1.8, Math.min(1.8, coords.pX / 0.85))
        : 0;
    // Center zone vertically at midpoint of szTop/szBot if provided; else default mid ~2.5 ft.
    const szTop =
      typeof e?.pitchData?.strikeZoneTop === "number"
        ? e.pitchData.strikeZoneTop
        : 3.4;
    const szBot =
      typeof e?.pitchData?.strikeZoneBottom === "number"
        ? e.pitchData.strikeZoneBottom
        : 1.6;
    const mid = (szTop + szBot) / 2;
    const half = (szTop - szBot) / 2 || 1;
    const py =
      typeof coords.pZ === "number"
        ? Math.max(-1.8, Math.min(1.8, (coords.pZ - mid) / half))
        : 0;

    const callCode = e?.details?.code ?? "";
    const desc: string = e?.details?.description ?? "";
    let result: Pitch["result"] = "ball";
    if (e?.details?.isStrike) result = "strike";
    if (e?.details?.isInPlay) result = "inplay";
    if (callCode === "F" || callCode === "FT" || /foul/i.test(desc))
      result = "foul-2k";

    return {
      n: i + 1,
      type: e?.details?.type?.code ?? "",
      velo:
        typeof e?.pitchData?.startSpeed === "number"
          ? Number(e.pitchData.startSpeed.toFixed(1))
          : 0,
      x: px,
      y: py,
      result,
      label: desc || "Pitch",
    };
  });

  const matchup = cur?.matchup ?? {};
  const pId = matchup?.pitcher?.id;
  const bId = matchup?.batter?.id;
  const players = (live?.boxscore?.teams?.away?.players ?? {}) as Record<
    string,
    any
  >;
  const homePlayers = (live?.boxscore?.teams?.home?.players ?? {}) as Record<
    string,
    any
  >;
  const findPlayer = (id: number) =>
    players[`ID${id}`] ?? homePlayers[`ID${id}`];

  const pPlayer = pId ? findPlayer(pId) : null;
  const bPlayer = bId ? findPlayer(bId) : null;
  const pTeam = pPlayer ? (players[`ID${pId}`] ? "away" : "home") : null;
  const bTeam = bPlayer ? (players[`ID${bId}`] ? "away" : "home") : null;

  const awayAbbr = abbrByMlbId(feed?.gameData?.teams?.away?.id);
  const homeAbbr = abbrByMlbId(feed?.gameData?.teams?.home?.id);

  const pitcherSeason = pPlayer?.seasonStats?.pitching ?? {};
  const pitcherToday = pPlayer?.stats?.pitching ?? {};
  const batterToday = bPlayer?.stats?.batting ?? {};

  const ab: AtBat = {
    inningLabel: `${String(cur?.about?.halfInning ?? "").toUpperCase() === "BOTTOM" ? "BOT" : "TOP"} ${cur?.about?.inning ?? ""}`,
    pitcher: {
      id: pId ?? 0,
      name: matchup?.pitcher?.fullName ?? "",
      firstName: matchup?.pitcher?.fullName?.split(" ")?.[0] ?? "",
      lastName: lastNameFromFull(matchup?.pitcher?.fullName),
      team: (pTeam === "away" ? awayAbbr : homeAbbr) ?? "",
      hand: (matchup?.pitchHand?.code as "L" | "R") ?? "R",
      pitchCountGame: pitcherToday?.numberOfPitches ?? pitchEvents.length,
      today: {
        ip: String(pitcherToday?.inningsPitched ?? "0.0"),
        h: pitcherToday?.hits ?? 0,
        r: pitcherToday?.runs ?? 0,
        er: pitcherToday?.earnedRuns ?? 0,
        bb: pitcherToday?.baseOnBalls ?? 0,
        k: pitcherToday?.strikeOuts ?? 0,
      },
    },
    batter: {
      id: bId ?? 0,
      name: matchup?.batter?.fullName ?? "",
      firstName: matchup?.batter?.fullName?.split(" ")?.[0] ?? "",
      lastName: lastNameFromFull(matchup?.batter?.fullName),
      team: (bTeam === "away" ? awayAbbr : homeAbbr) ?? "",
      hand: (matchup?.batSide?.code as "L" | "R") ?? "R",
      today: {
        line: `${batterToday?.hits ?? 0}-${batterToday?.atBats ?? 0}`,
        events: [],
      },
      seasonAvg: bPlayer?.seasonStats?.batting?.avg,
      seasonHr: bPlayer?.seasonStats?.batting?.homeRuns,
    },
    count: {
      b: cur?.count?.balls ?? 0,
      s: cur?.count?.strikes ?? 0,
    },
    outs: cur?.count?.outs ?? 0,
    bases: [
      Boolean(matchup?.postOnFirst),
      Boolean(matchup?.postOnSecond),
      Boolean(matchup?.postOnThird),
    ],
    pitches,
    isComplete,
  };

  // suppress unused warning for the dest variable
  void pitcherSeason;
  return ab;
}

export function mapGameDetail(
  feed: any,
  dateISO?: string,
  winProbabilityFeed?: any,
): GameDetailData {
  const game = feed?.gameData;
  const live = feed?.liveData;
  const awayId = game?.teams?.away?.id;
  const homeId = game?.teams?.home?.id;
  const awayAbbr = abbrByMlbId(awayId) ?? "";
  const homeAbbr = abbrByMlbId(homeId) ?? "";

  const status = mapStatus(
    game?.status?.abstractGameState,
    game?.status?.detailedState,
  );
  const ls = live?.linescore;

  const summary: GameSummary = {
    id: feed?.gamePk ?? 0,
    away: awayAbbr,
    home: homeAbbr,
    awayScore: ls?.teams?.away?.runs ?? null,
    homeScore: ls?.teams?.home?.runs ?? null,
    status,
    statusDetail: game?.status?.detailedState,
    dateISO: dateISO ?? dateISOFromGameDate(game?.datetime?.dateTime),
    time: passThroughISO(game?.datetime?.dateTime),
    venue: game?.venue?.name,
    weather: game?.weather?.condition,
    awayRecord: readRecord(game?.teams?.away),
    homeRecord: readRecord(game?.teams?.home),
  };
  if (status === "LIVE" && ls) {
    summary.inning = ls.currentInning ?? undefined;
    const halfRaw = String(ls.inningHalf ?? "").toUpperCase();
    summary.inningHalf =
      halfRaw === "BOTTOM" ? "BOT" : halfRaw === "TOP" ? "TOP" : undefined;
    summary.bases = readBases(ls);
    summary.outs = ls.outs ?? 0;
    summary.balls = ls.balls ?? 0;
    summary.strikes = ls.strikes ?? 0;
  }

  const plays = ((live?.plays?.allPlays ?? []) as any[])
    .filter((p) => p?.result?.event) // only completed plate appearances
    .reverse() // most recent first
    .slice(0, 20)
    .map(mapPlay);

  const linescore = mapLinescore(feed);
  const box = live?.boxscore ?? {};
  const awayLineup = mapBoxLineup(box?.teams?.away);
  const homeLineup = mapBoxLineup(box?.teams?.home);
  const allPlays = (live?.plays?.allPlays ?? []) as any[];
  const usageByPitcher = computePitchUsageByPitcher(allPlays);
  const gameIsLive = status === "LIVE";
  const awayPitching = decoratePitching(
    mapBoxPitching(box?.teams?.away),
    usageByPitcher,
    gameIsLive,
  );
  const homePitching = decoratePitching(
    mapBoxPitching(box?.teams?.home),
    usageByPitcher,
    gameIsLive,
  );

  const atBat = status === "LIVE" ? mapAtBat(feed) : null;
  const winProbability = readWinProbability(winProbabilityFeed);
  const spray = computeBatterSprays(
    allPlays,
    awayAbbr,
    homeAbbr,
    awayId,
    homeId,
  );

  return {
    summary,
    linescore,
    awayLineup,
    homeLineup,
    awayPitching,
    homePitching,
    plays,
    atBat,
    winProbability,
    spray,
  };
}

/**
 * Bucket an MLB result.event string into our four spray outcome categories.
 * Anything that left the bat but didn't land for a hit (groundouts, flyouts,
 * fielder's choice, reach-on-error, sac flies, etc.) lumps into OUT — color
 * fidelity over taxonomic purity.
 */
function classifySprayOutcome(
  event: string | undefined,
): import("./types").SprayOutcome | null {
  if (!event) return null;
  const e = event.toLowerCase();
  if (e.includes("home run")) return "HR";
  if (e.includes("triple")) return "3B";
  if (e.includes("double") && !e.includes("double play")) return "2B";
  if (e.includes("single")) return "1B";
  // Catch-all for in-play results that aren't hits.
  if (
    e.includes("out") ||
    e.includes("groundout") ||
    e.includes("flyout") ||
    e.includes("lineout") ||
    e.includes("popout") ||
    e.includes("forceout") ||
    e.includes("pop out") ||
    e.includes("ground out") ||
    e.includes("fly out") ||
    e.includes("line out") ||
    e.includes("fielders choice") ||
    e.includes("fielder's choice") ||
    e.includes("sac fly") ||
    e.includes("sacrifice") ||
    e.includes("error") ||
    e.includes("double play") ||
    e.includes("triple play")
  ) {
    return "OUT";
  }
  return null;
}

/**
 * Walk allPlays for completed at-bats with a landed ball, group by batter id,
 * and emit per-batter spray points. The coordinate field on a hitData event
 * lives in MLB's 0–250 image-coordinate space (home plate ≈ (125, 205)), so
 * the UI can plot the dots directly against a matching viewBox.
 */
function computeBatterSprays(
  allPlays: any[],
  awayAbbr: string,
  homeAbbr: string,
  awayTeamId: number | undefined,
  homeTeamId: number | undefined,
): import("./types").BatterSpray[] {
  const byBatter = new Map<number, import("./types").BatterSpray>();
  // Most-recent batter ordering: allPlays is in chronological order, so each
  // time we touch a batter we bump their order index. Sorting by this index
  // desc puts the latest hitter at the front of the picker.
  const lastOrder = new Map<number, number>();
  let order = 0;
  for (const p of allPlays) {
    const event = p?.result?.event as string | undefined;
    const outcome = classifySprayOutcome(event);
    if (!outcome) continue;
    const batterId = p?.matchup?.batter?.id;
    if (typeof batterId !== "number") continue;
    // Find the play event carrying the hit-coordinate payload — typically the
    // final pitch of the AB.
    const events = (p?.playEvents ?? []) as any[];
    const hitEv = [...events].reverse().find((ev) => ev?.hitData?.coordinates);
    const coords = hitEv?.hitData?.coordinates;
    const x = coords?.coordX;
    const y = coords?.coordY;
    if (typeof x !== "number" || typeof y !== "number") continue;

    const battingTeamId =
      p?.matchup?.batter?.parentTeamId ?? p?.matchup?.batSide?.teamId;
    const team =
      battingTeamId === awayTeamId
        ? awayAbbr
        : battingTeamId === homeTeamId
          ? homeAbbr
          : p?.about?.halfInning === "top"
            ? awayAbbr
            : homeAbbr;

    let entry = byBatter.get(batterId);
    if (!entry) {
      const fullName = p?.matchup?.batter?.fullName ?? "";
      const lastName = lastNameFromFull(fullName) || fullName;
      entry = {
        batterId,
        fullName,
        lastName,
        team,
        points: [],
      };
      byBatter.set(batterId, entry);
    }
    entry.points.push({
      x,
      y,
      outcome,
      inning: p?.about?.inning ?? undefined,
      half:
        p?.about?.halfInning === "bottom"
          ? "BOT"
          : p?.about?.halfInning === "top"
            ? "TOP"
            : undefined,
      event,
    });
    order++;
    lastOrder.set(batterId, order);
  }
  // Most-recent batter first; lastName breaks ties (e.g. same play index).
  return [...byBatter.values()].sort((a, b) => {
    const ao = lastOrder.get(a.batterId) ?? 0;
    const bo = lastOrder.get(b.batterId) ?? 0;
    return bo - ao || a.lastName.localeCompare(b.lastName);
  });
}

/**
 * Walk every plate appearance and tally pitch-type counts per pitcher. Returns
 * a map keyed by pitcher player id → { typeCode: count }. Pitches without a
 * recognizable type code are skipped (intentional pitches, pickoffs, etc.).
 */
function computePitchUsageByPitcher(
  allPlays: any[],
): Map<number, Record<string, number>> {
  const out = new Map<number, Record<string, number>>();
  for (const p of allPlays) {
    const pitcherId = p?.matchup?.pitcher?.id;
    if (typeof pitcherId !== "number") continue;
    const events = (p?.playEvents ?? []) as any[];
    for (const ev of events) {
      if (!ev?.isPitch) continue;
      const code = ev?.details?.type?.code;
      if (typeof code !== "string" || code.length === 0) continue;
      const counts = out.get(pitcherId) ?? {};
      counts[code] = (counts[code] ?? 0) + 1;
      out.set(pitcherId, counts);
    }
  }
  return out;
}

/**
 * Attach `pitchUsage` (from the play-events tally) and — for in-progress games
 * only — flag the team's most recent pitcher as `live`. Final/scheduled games
 * leave `live` undefined so the UI doesn't pin a "LIVE" tag on a closer who
 * recorded the last out hours ago.
 */
function decoratePitching(
  rows: import("./types").BoxPitchingRow[],
  usageByPitcher: Map<number, Record<string, number>>,
  gameIsLive: boolean,
): import("./types").BoxPitchingRow[] {
  if (rows.length === 0) return rows;
  return rows.map((row, i) => {
    const counts = usageByPitcher.get(row.id);
    const pitchUsage = counts
      ? Object.entries(counts).map(([type, count]) => ({ type, count }))
      : undefined;
    const live = gameIsLive && i === rows.length - 1 ? true : undefined;
    return { ...row, pitchUsage, live };
  });
}

/**
 * Pull the most recent home/away win probability from the dedicated
 * `/api/v1/game/{gamePk}/winProbability` endpoint, which returns an array of
 * play entries each with `homeTeamWinProbability` and `awayTeamWinProbability`
 * (0–100). We scan from the end for the latest entry that has those set.
 * Returns null if unavailable (pregame, missing endpoint payload, etc.) — the
 * live feed itself does NOT carry per-play win-probability fields, so we rely
 * on this auxiliary endpoint instead.
 */
function readWinProbability(
  wpFeed: any,
): { home: number; away: number } | null {
  const entries = Array.isArray(wpFeed) ? wpFeed : [];
  for (let i = entries.length - 1; i >= 0; i--) {
    const p = entries[i];
    const home = p?.homeTeamWinProbability;
    const away = p?.awayTeamWinProbability;
    if (typeof home === "number" && Number.isFinite(home)) {
      const h = Math.max(0, Math.min(100, home));
      const a =
        typeof away === "number" && Number.isFinite(away)
          ? Math.max(0, Math.min(100, away))
          : 100 - h;
      return { home: h, away: a };
    }
  }
  return null;
}

/* ── Leaders ─────────────────────────────────────────────────────────────── */

export function mapLeaders(json: any): LeaderRow[] {
  const list = json?.leagueLeaders?.[0]?.leaders ?? [];
  return list.map((row: any) => ({
    personId: row?.person?.id ?? 0,
    fullName: row?.person?.fullName ?? "",
    team: abbrByMlbId(row?.team?.id) ?? "",
    position: row?.position?.abbreviation ?? undefined,
    value: String(row?.value ?? ""),
  }));
}

/* ── Roster ──────────────────────────────────────────────────────────────── */

function groupForPosition(posType?: string): RosterRow["group"] {
  switch ((posType ?? "").toLowerCase()) {
    case "pitcher":
      return "pitchers";
    case "catcher":
      return "catchers";
    case "infielder":
      return "infielders";
    case "outfielder":
      return "outfielders";
    case "hitter":
      return "designated_hitter";
    default:
      return "infielders";
  }
}

/** A roster entry's `status.description` is what tells us the player's roster
 *  state — "Active", "10-Day Injured List", "60-Day Injured List", "Suspended",
 *  etc. Anything other than "Active" surfaces in the Injuries tab. The injury
 *  free-text (e.g. "Right oblique strain") lives at the roster-item's `notes`
 *  field when MLB has populated it.
 *
 *  Note: we read from the roster entry itself (`r.status` / `r.notes`), NOT
 *  from `r.person.status`. The person-level status is the player's overall
 *  MLB-wide status (almost always "Active" for anyone alive and rostered),
 *  not their current roster-spot state — using it returns no injuries. */
function readInjuryStatus(rosterItem: any): RosterRow["injuryStatus"] {
  const description = rosterItem?.status?.description;
  if (!description) return undefined;
  const desc = String(description).trim().toLowerCase();
  if (desc === "active") return undefined;
  // Reassignments are roster moves, not injuries. MLB flags these with
  // status.code "RM" and description "Reassigned to Minors" — filter both
  // so the Injuries tab stays scoped to actual ailments.
  const code = rosterItem?.status?.code;
  const codeStr = String(code ?? "").toUpperCase();
  if (codeStr === "RM" || desc.startsWith("reassigned")) return undefined;
  const notes = rosterItem?.notes;
  const out: NonNullable<RosterRow["injuryStatus"]> = {
    code: String(code ?? ""),
    description: String(description),
  };
  if (notes) out.notes = String(notes);
  return out;
}

export function mapRoster(json: any): RosterRow[] {
  const roster = json?.roster ?? [];
  return roster.map((r: any) => {
    const injuryStatus = readInjuryStatus(r);
    const row: RosterRow = {
      id: r?.person?.id ?? 0,
      num: r?.jerseyNumber ?? "",
      pos: r?.position?.abbreviation ?? "",
      name: r?.person?.fullName ?? "",
      group: groupForPosition(r?.position?.type),
    };
    if (injuryStatus) row.injuryStatus = injuryStatus;
    return row;
  });
}

/* ── Team season ─────────────────────────────────────────────────────────── */

/** Extract a team's record from a `/standings?leagueId=103,104` payload. We
 *  use the standings endpoint (not `/teams/{id}?hydrate=record`) because that
 *  hydrate path doesn't populate `team.record` reliably — every team's record
 *  comes back as an empty object, which is how this transform used to silently
 *  return `0-0 / .000`. The standings shape mirrors what `mapStandings` reads. */
export function mapTeamRecord(json: any, teamMlbId: number): TeamSeasonRecord {
  for (const div of json?.records ?? []) {
    for (const tr of div?.teamRecords ?? []) {
      if (tr?.team?.id !== teamMlbId) continue;
      const w = typeof tr.wins === "number" ? tr.wins : 0;
      const l = typeof tr.losses === "number" ? tr.losses : 0;
      const pct =
        w + l > 0 ? (w / (w + l)).toFixed(3).replace(/^0/, "") : ".000";
      const divRankRaw = tr?.divisionRank;
      const divRank = divRankRaw ? Number(divRankRaw) : undefined;
      const divId = div?.division?.id;
      return {
        w,
        l,
        pct,
        streak: tr?.streak?.streakCode
          ? String(tr.streak.streakCode)
          : undefined,
        divRank: Number.isFinite(divRank) ? divRank : undefined,
        divName: typeof divId === "number" ? DIVISION_LABEL[divId] : undefined,
      };
    }
  }
  return { w: 0, l: 0, pct: ".000" };
}

/** Map a `/schedule?teamId={id}` response into our last-5 games shape. Walks
 *  every game in every date, keeps FINAL games where our team played, sorts
 *  by date descending, slices to the most recent 5. */
export function mapTeamLastGames(json: any, ourAbbr: string): TeamLastGame[] {
  const dates = json?.dates ?? [];
  const finals: TeamLastGame[] = [];
  for (const d of dates) {
    const dateISO: string = d?.date ?? "";
    for (const g of d?.games ?? []) {
      const status = mapStatus(
        g?.status?.abstractGameState,
        g?.status?.detailedState,
      );
      if (status !== "FINAL") continue;
      const awayId = g?.teams?.away?.team?.id;
      const homeId = g?.teams?.home?.team?.id;
      const away = awayId != null ? abbrByMlbId(awayId) : undefined;
      const home = homeId != null ? abbrByMlbId(homeId) : undefined;
      if (!away || !home) continue;
      const isHome = home === ourAbbr;
      const isAway = away === ourAbbr;
      if (!isHome && !isAway) continue;
      const us = isHome ? g?.teams?.home?.score : g?.teams?.away?.score;
      const them = isHome ? g?.teams?.away?.score : g?.teams?.home?.score;
      if (typeof us !== "number" || typeof them !== "number") continue;
      finals.push({
        id: g.gamePk,
        dateISO,
        opp: isHome ? away : home,
        home: isHome,
        result: us > them ? "W" : "L",
        score: { us, them },
      });
    }
  }
  finals.sort((a, b) => (a.dateISO < b.dateISO ? 1 : -1));
  return finals.slice(0, 5);
}

/** Pull the season totals stat object for a hitting/pitching group from
 *  `/teams/{id}/stats?sportId=1&group=hitting,pitching&stats=season`.
 *  MLB returns one `stats[]` entry per group, each with a single split row. */
export function mapTeamSeasonStats(
  json: any,
  group: "hitting" | "pitching",
): TeamSeasonStats {
  const groups = json?.stats ?? [];
  const g = groups.find(
    (x: any) => x?.group?.displayName?.toLowerCase() === group,
  );
  const split = g?.splits?.[0];
  const stat = split?.stat ?? {};
  // console.log("******************************");
  // console.log(stat);
  return { ...stat };
}

/** MLB `/teams/{id}/leaders` returns `teamLeaders[]` — one entry per
 *  leaderCategory. Each contains the same per-row shape `mapLeaders` already
 *  handles. We bundle them by our display label (AVG/HR/RBI/...) and slice
 *  each to the top-N. */
const LEADER_CATEGORY_MAP: Record<string, string> = {
  battingAverage: "AVG",
  avg: "AVG",
  homeRuns: "HR",
  rbi: "RBI",
  onBasePlusSlugging: "OPS",
  ops: "OPS",
  earnedRunAverage: "ERA",
  era: "ERA",
  wins: "W",
  strikeOuts: "K",
  strikeouts: "K",
  saves: "SV",
};

export function mapTeamLeaders(
  json: any,
  topN = 3,
): Record<string, LeaderRow[]> {
  const out: Record<string, LeaderRow[]> = {};
  const groups = json?.teamLeaders ?? [];
  for (const g of groups) {
    const rawCat = String(g?.leaderCategory ?? "");
    const label = LEADER_CATEGORY_MAP[rawCat];
    if (!label) continue;
    const list = (g?.leaders ?? []).slice(0, topN).map((row: any) => ({
      personId: row?.person?.id ?? 0,
      fullName: row?.person?.fullName ?? "",
      team: abbrByMlbId(row?.team?.id) ?? "",
      position: row?.position?.abbreviation ?? undefined,
      value: String(row?.value ?? ""),
    }));
    out[label] = list;
  }
  return out;
}

/* ── Personnel (coaches + front office) ──────────────────────────────────── */

/** `/teams/{id}/coaches` returns `{ roster: [{person, job, jobId}, ...] }`. */
export function mapCoaches(json: any): PersonnelRow[] {
  const list = json?.roster ?? [];
  return list
    .map((r: any) => {
      const id = r?.person?.id;
      const name = r?.person?.fullName ?? "";
      const title = r?.job ?? r?.jobTitle ?? "";
      if (!name) return null;
      const row: PersonnelRow = { name, title: String(title) };
      if (typeof id === "number") row.id = id;
      return row;
    })
    .filter((r: PersonnelRow | null): r is PersonnelRow => r !== null);
}

/** `/teams/{id}/personnel` shape: `{ roster: [{person, jobTitle, ...}, ...] }`.
 *  Endpoint is undocumented and may 404 or return an empty roster — caller
 *  passes us `{}` in that case, and we just return `[]`. */
export function mapFrontOffice(json: any): PersonnelRow[] {
  const list = json?.roster ?? json?.personnel ?? [];
  return list
    .map((r: any) => {
      const id = r?.person?.id;
      const name = r?.person?.fullName ?? r?.name ?? "";
      const title = r?.jobTitle ?? r?.title ?? r?.job ?? "";
      if (!name) return null;
      const row: PersonnelRow = { name: String(name), title: String(title) };
      if (typeof id === "number") row.id = id;
      return row;
    })
    .filter((r: PersonnelRow | null): r is PersonnelRow => r !== null);
}

/* ── Player ──────────────────────────────────────────────────────────────── */

function pickStatRow(
  splits: any[] | undefined,
): Record<string, string | number> | undefined {
  if (!splits || splits.length === 0) return undefined;
  // Prefer the row without team/team.sport context (the season totals across teams)
  // Otherwise the first split.
  const totals = splits.find((s: any) => !s?.team) ?? splits[0];
  return totals?.stat ?? undefined;
}

export function mapPlayer(person: any, statsJson: any): PlayerDetailData {
  const groups = statsJson?.stats ?? [];
  const hittingGroup = groups.find(
    (g: any) => g?.group?.displayName?.toLowerCase() === "hitting",
  );
  const pitchingGroup = groups.find(
    (g: any) => g?.group?.displayName?.toLowerCase() === "pitching",
  );

  const teamAbbr = person?.currentTeam?.id
    ? abbrByMlbId(person.currentTeam.id)
    : null;

  return {
    id: person?.id ?? 0,
    fullName: person?.fullName ?? "",
    team: teamAbbr ?? null,
    position: person?.primaryPosition?.abbreviation ?? "",
    bats: person?.batSide?.code ?? "",
    throws: person?.pitchHand?.code ?? "",
    num: person?.primaryNumber ?? undefined,
    age: person?.currentAge ?? undefined,
    height: person?.height ?? undefined,
    weight: person?.weight ?? undefined,
    birthCity: person?.birthCity ?? undefined,
    birthCountry: person?.birthCountry ?? undefined,
    hitting: pickStatRow(hittingGroup?.splits),
    pitching: pickStatRow(pitchingGroup?.splits),
  };
}

/* ── Player splits ───────────────────────────────────────────────────────── */

const SPLIT_LABELS: Record<string, string> = {
  vr: "vs RHP",
  vl: "vs LHP",
  h: "Home",
  a: "Away",
  d: "Day",
  n: "Night",
  risp: "RISP",
};
// For pitchers we drop RISP (pitcher RISP splits aren't surfaced cleanly by the API).
export const SPLIT_ORDER_HITTING: string[] = [
  "vr",
  "vl",
  "h",
  "a",
  "d",
  "n",
  "risp",
];
export const SPLIT_ORDER_PITCHING: string[] = ["vr", "vl", "h", "a", "d", "n"];
/** Legacy export retained for back-compat; defaults to hitting order. */
export const SPLIT_ORDER = SPLIT_ORDER_HITTING;

export function mapPlayerSplits(
  json: any,
  mode: StatMode = "hitting",
): PlayerSplitRow[] {
  const splits = (json?.stats?.[0]?.splits ?? []) as any[];
  const byCode: Record<string, PlayerSplitRow> = {};
  for (const s of splits) {
    const code = s?.split?.code;
    if (!code || !SPLIT_LABELS[code]) continue;
    const stat = s?.stat ?? {};
    const row: PlayerSplitRow = { code, label: SPLIT_LABELS[code] };
    if (mode === "pitching") {
      row.era = stat.era != null ? String(stat.era) : "";
      row.whip = stat.whip != null ? String(stat.whip) : "";
    } else {
      row.avg = String(stat.avg ?? "");
      row.ops = String(stat.ops ?? "");
    }
    byCode[code] = row;
  }
  const order =
    mode === "pitching" ? SPLIT_ORDER_PITCHING : SPLIT_ORDER_HITTING;
  return order.map((c) => byCode[c]).filter((r): r is PlayerSplitRow => !!r);
}

/* ── Player game log ─────────────────────────────────────────────────────── */

export function mapPlayerGameLog(
  json: any,
  mode: StatMode = "hitting",
): PlayerGameLogRow[] {
  const splits = (json?.stats?.[0]?.splits ?? []) as any[];
  const out: PlayerGameLogRow[] = [];
  for (const s of splits) {
    const date = s?.date;
    if (!date) continue;
    const stat = s?.stat ?? {};
    const row: PlayerGameLogRow = {
      date,
      opp: abbrByMlbId(s?.opponent?.id) ?? null,
      isHome: Boolean(s?.isHome),
    };
    if (mode === "pitching") {
      row.ip = String(stat.inningsPitched ?? "0.0");
      row.h = stat.hits ?? 0;
      row.er = stat.earnedRuns ?? 0;
      row.k = stat.strikeOuts ?? 0;
      row.bb = stat.baseOnBalls ?? 0;
    } else {
      row.ab = stat.atBats ?? 0;
      row.h = stat.hits ?? 0;
      row.hr = stat.homeRuns ?? 0;
      row.rbi = stat.rbi ?? 0;
    }
    out.push(row);
  }
  // Newest first.
  out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return out;
}

/* ── Player history (year-by-year + career totals + awards) ──────────────── */

/** Award names that should always be ignored for "career highlights" — minor-league
    honors, weekly/monthly recognitions, partner-organization awards, etc. */
const EXCLUDED_AWARD_PATTERNS: RegExp[] = [
  /minor league/i,
  /\bmilb\b/i,
  /\bfutures\b/i,
  /heart and hustle/i,
  /play of the (week|month)/i,
  /player of the (week|month)/i,
  /pitcher of the (week|month)/i,
  /rookie of the month/i,
  /post-season/i,
  /all-rookie/i,
  /clemente/i,
  // Common minor-league prefixes (International, Texas, Pacific Coast, etc.)
  /^(?:INT|TEX|AAA|AA|PCL|EAS|SOU|FSL|NOR|CAL|MID|SAL|CAR|APP|GCL|DSL)\s/,
];

/** Patterns for major MLB awards we want to surface as "career highlights".
    Note: World Series MVP is matched first so it doesn't fall through to the generic MVP rule. */
const AWARD_PATTERNS: { re: RegExp; display: string }[] = [
  { re: /World Series MVP/i, display: "World Series MVP" },
  // MLB MVP: API returns either "AL MVP"/"NL MVP" or "Most Valuable Player"
  { re: /^(?:AL|NL)\s+MVP\b/i, display: "MVP" },
  { re: /\bMost Valuable Player\b/i, display: "MVP" },
  { re: /Cy Young/i, display: "Cy Young" },
  { re: /Rookie of the Year/i, display: "Rookie of the Year" },
  // Major-league All-Star only: prefixed with AL/NL/MLB, or a plain "All-Star Game"
  { re: /^(?:AL|NL|MLB)\s+All[- ]Star/i, display: "All-Star" },
  { re: /^All[- ]Star Game/i, display: "All-Star" },
  { re: /Platinum Glove/i, display: "Platinum Glove" },
  { re: /Gold Glove/i, display: "Gold Glove" },
  { re: /Silver Slugger/i, display: "Silver Slugger" },
  { re: /All-MLB First Team/i, display: "All-MLB First Team" },
  { re: /All-MLB Second Team/i, display: "All-MLB Second Team" },
];

function matchAward(name: string): string | null {
  if (EXCLUDED_AWARD_PATTERNS.some((re) => re.test(name))) return null;
  for (const { re, display } of AWARD_PATTERNS)
    if (re.test(name)) return display;
  return null;
}

function mapYears(json: any, mode: StatMode): PlayerHistoryYear[] {
  const splits = (json?.stats?.[0]?.splits ?? []) as any[];
  const years: PlayerHistoryYear[] = [];
  for (const s of splits) {
    const season = Number(s?.season);
    if (!Number.isFinite(season)) continue;
    const stat = s?.stat ?? {};
    const base: PlayerHistoryYear = {
      year: season,
      team: abbrByMlbId(s?.team?.id) ?? null,
      g: stat.gamesPlayed ?? 0,
    };
    if (mode === "pitching") {
      base.w = stat.wins ?? 0;
      base.l = stat.losses ?? 0;
      base.era = String(stat.era ?? "");
      base.ip = String(stat.inningsPitched ?? "0.0");
      base.k = stat.strikeOuts ?? 0;
      base.whip = String(stat.whip ?? "");
    } else {
      base.ab = stat.atBats ?? 0;
      base.hr = stat.homeRuns ?? 0;
      base.rbi = stat.rbi ?? 0;
      base.avg = String(stat.avg ?? "");
      base.ops = String(stat.ops ?? "");
    }
    years.push(base);
  }
  years.sort((a, b) => a.year - b.year);
  return years;
}

function mapCareer(
  json: any,
  years: PlayerHistoryYear[],
  mode: StatMode,
): PlayerCareerTotals {
  const stat = (json?.stats?.[0]?.splits ?? [])[0]?.stat ?? {};
  const seasons = new Set(years.map((y) => y.year)).size;
  const yearRange = years.length
    ? `${years[0].year}–${years[years.length - 1].year}`
    : undefined;
  const totals: PlayerCareerTotals = {
    g: stat.gamesPlayed ?? 0,
    seasons,
    yearRange,
  };
  if (mode === "pitching") {
    totals.w = stat.wins ?? 0;
    totals.l = stat.losses ?? 0;
    totals.era = String(stat.era ?? "");
    totals.ip = String(stat.inningsPitched ?? "0.0");
    totals.k = stat.strikeOuts ?? 0;
    totals.whip = String(stat.whip ?? "");
  } else {
    totals.ab = stat.atBats ?? 0;
    totals.hr = stat.homeRuns ?? 0;
    totals.rbi = stat.rbi ?? 0;
    totals.avg = String(stat.avg ?? "");
    totals.ops = String(stat.ops ?? "");
  }
  return totals;
}

function mapHighlights(awardsJson: any): PlayerHighlight[] {
  const awards = (awardsJson?.awards ?? []) as any[];
  // Group by canonical display name, collect distinct seasons.
  const seasonsByName: Record<string, Set<number>> = {};
  for (const a of awards) {
    const display = matchAward(String(a?.name ?? ""));
    if (!display) continue;
    const season = Number(a?.season);
    if (!Number.isFinite(season)) continue;
    (seasonsByName[display] ||= new Set()).add(season);
  }
  const out: PlayerHighlight[] = Object.entries(seasonsByName).map(
    ([name, seasons]) => ({
      name,
      count: seasons.size,
      mostRecentYear: Math.max(...seasons),
    }),
  );
  // Show most prestigious / most recent first.
  const priority: Record<string, number> = {
    MVP: 1,
    "Cy Young": 2,
    "World Series MVP": 3,
    "Rookie of the Year": 4,
    "All-MLB First Team": 5,
    "All-Star": 6,
    "Gold Glove": 7,
    "Platinum Glove": 8,
    "Silver Slugger": 9,
    "All-MLB Second Team": 10,
  };
  out.sort((a, b) => {
    const ap = priority[a.name] ?? 99;
    const bp = priority[b.name] ?? 99;
    if (ap !== bp) return ap - bp;
    return b.mostRecentYear - a.mostRecentYear;
  });
  return out;
}

export function mapPlayerHistory(
  yearByYearJson: any,
  careerJson: any,
  awardsJson: any,
  mode: StatMode = "hitting",
): PlayerHistoryData {
  const years = mapYears(yearByYearJson, mode);
  const career = mapCareer(careerJson, years, mode);
  const highlights = mapHighlights(awardsJson);
  return { mode, years, career, highlights };
}

/* ── Team helpers ────────────────────────────────────────────────────────── */

export function teamLookup(abbr: string) {
  return TEAMS[abbr];
}
