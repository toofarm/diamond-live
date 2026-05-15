import { mlb } from "@/lib/mlb/upstream";
import {
  mapTeamLastGames,
  mapTeamLeaders,
  mapTeamRecord,
  mapTeamSeasonStats,
} from "@/lib/mlb/transform";
import { CACHE_HEADERS } from "@/lib/mlb/cacheHeaders";
import { TEAMS } from "@/lib/mlb/teams";
import { addDays, currentSeason, toISO } from "@/lib/date";
import type {
  LeaderRow,
  TeamBattingLeaderCategory,
  TeamPitchingLeaderCategory,
  TeamSeasonData,
} from "@/lib/mlb/types";

// We tell `/stats/leaders` which MLB category strings map to our display labels.
// Order matters only for cache predictability; mapTeamLeaders looks up by name.
const BATTING_LEADER_CATS = [
  "battingAverage",
  "homeRuns",
  "rbi",
  "onBasePlusSlugging",
] as const;
const PITCHING_LEADER_CATS = [
  "earnedRunAverage",
  "wins",
  "strikeouts",
  "saves",
] as const;

/**
 * GET /api/mlb/team/[teamAbbr]/season
 *
 * Consolidates the four upstream calls the SeasonTab needs into one
 * client→server roundtrip. All four MLB fetches are fired in parallel via
 * `Promise.all`; per-call failures don't take the whole route down — we
 * default to safe-empty values for any sub-payload that fails or comes back
 * malformed.
 */
export async function GET(
  _: Request,
  { params }: { params: Promise<{ teamAbbr: string }> },
) {
  const { teamAbbr } = await params;
  const team = TEAMS[teamAbbr];
  if (!team) {
    return Response.json(
      { error: `Unknown team ${teamAbbr}` },
      { status: 404 },
    );
  }

  const season = currentSeason();
  const today = new Date();
  const start = toISO(addDays(today, -30));
  const end = toISO(today);
  const leaderCats = [...BATTING_LEADER_CATS, ...PITCHING_LEADER_CATS].join(
    ",",
  );

  // Parallel fan-out. `Promise.allSettled` so a single upstream hiccup leaves
  // the rest of the tab usable rather than turning the whole page red.
  //
  // The record comes from `/standings` (not `/teams/{id}?hydrate=record`) —
  // the team-endpoint hydrate path returns an empty record block, which is
  // why the original implementation silently rendered 0–0 / .000.
  const [recordRes, scheduleRes, statsRes, leadersRes] =
    await Promise.allSettled([
      mlb<unknown>(
        `/standings?leagueId=103,104&season=${season}&standingsTypes=regularSeason`,
        { revalidate: 300 },
      ),
      mlb<unknown>(
        `/schedule?sportId=1&teamId=${team.mlbId}&startDate=${start}&endDate=${end}`,
        { revalidate: 300 },
      ),
      mlb<unknown>(
        `/teams/${team.mlbId}/stats?sportId=1&group=hitting,pitching&stats=season&season=${season}`,
        { revalidate: 300 },
      ),
      mlb<unknown>(
        `/teams/${team.mlbId}/leaders?leaderCategories=${leaderCats}&season=${season}&leaderGameTypes=R&limit=10`,
        { revalidate: 300 },
      ),
    ]);

  const recordJson = recordRes.status === "fulfilled" ? recordRes.value : {};
  const scheduleJson =
    scheduleRes.status === "fulfilled" ? scheduleRes.value : {};
  const statsJson = statsRes.status === "fulfilled" ? statsRes.value : {};
  const leadersJson = leadersRes.status === "fulfilled" ? leadersRes.value : {};

  const leadersByLabel = mapTeamLeaders(leadersJson, 3);
  const empty: LeaderRow[] = [];
  const battingCats: TeamBattingLeaderCategory[] = ["AVG", "HR", "RBI", "OPS"];
  const pitchingCats: TeamPitchingLeaderCategory[] = ["ERA", "W", "K", "SV"];
  const battingLeaders = Object.fromEntries(
    battingCats.map((c) => [c, leadersByLabel[c] ?? empty]),
  ) as Record<TeamBattingLeaderCategory, LeaderRow[]>;
  const pitchingLeaders = Object.fromEntries(
    pitchingCats.map((c) => [c, leadersByLabel[c] ?? empty]),
  ) as Record<TeamPitchingLeaderCategory, LeaderRow[]>;

  const body: TeamSeasonData = {
    record: mapTeamRecord(recordJson, team.mlbId),
    lastGames: mapTeamLastGames(scheduleJson, teamAbbr),
    leaders: { batting: battingLeaders, pitching: pitchingLeaders },
    stats: {
      batting: mapTeamSeasonStats(statsJson, "hitting"),
      pitching: mapTeamSeasonStats(statsJson, "pitching"),
    },
  };

  return Response.json(body, { headers: CACHE_HEADERS.LIVE });
}
