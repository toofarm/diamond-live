import { mlb } from "@/lib/mlb/upstream";
import { mapTeamGames } from "@/lib/mlb/transform";
import { CACHE_HEADERS } from "@/lib/mlb/cacheHeaders";
import { TEAMS } from "@/lib/mlb/teams";
import { currentSeason } from "@/lib/date";
import type { TeamGamesData } from "@/lib/mlb/types";

/**
 * GET /api/mlb/team/[teamAbbr]/games
 *
 * Every completed regular-season game for the team, most recent first. The
 * Season tab's "Last 5 Games" card gets its rows from `/season` (a 30-day
 * schedule window); this route is the full-season counterpart behind the
 * "View full record" sheet, fetched only when the user opens it.
 *
 * `gameType=R` keeps spring training and postseason out of the running
 * W–L tally so it reconciles with the record card above the table.
 */
export async function GET(
  _: Request,
  { params }: { params: Promise<{ teamAbbr: string }> },
) {
  const { teamAbbr } = await params;
  const team = TEAMS[teamAbbr];
  if (!team) {
    return Response.json({ error: `Unknown team ${teamAbbr}` }, { status: 404 });
  }

  const season = currentSeason();

  let games: TeamGamesData["games"] = [];
  try {
    const json = await mlb<unknown>(
      `/schedule?sportId=1&teamId=${team.mlbId}&season=${season}&gameType=R`,
      { revalidate: 300 },
    );
    games = mapTeamGames(json, teamAbbr);
  } catch {
    // Same posture as the /season route: an upstream hiccup degrades to an
    // empty table rather than a red error screen behind the sheet.
  }

  const body: TeamGamesData = { season, games };
  return Response.json(body, { headers: CACHE_HEADERS.STATIC_5M });
}
