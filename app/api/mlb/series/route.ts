import type { NextRequest } from "next/server";
import { mlb } from "@/lib/mlb/upstream";
import { mapSeasonSeries } from "@/lib/mlb/transform";
import { CACHE_HEADERS } from "@/lib/mlb/cacheHeaders";
import { TEAMS } from "@/lib/mlb/teams";
import type { SeasonSeriesData } from "@/lib/mlb/types";

/**
 * GET /api/mlb/series?teams=NYM,PHI&season=2026
 *
 * Every regular-season meeting between two teams in one season, all statuses,
 * oldest first. Backs GameDetail's season-series card.
 *
 * Keyed by the team pair rather than by gamePk so every game of the series —
 * home or away — collapses onto one cached response. Callers sort the pair so
 * NYM,PHI and PHI,NYM don't split the cache.
 *
 * `season` comes from the game being viewed, not `currentSeason()`: a 2025
 * game opened from a player's history must show the 2025 series.
 *
 * The series only moves when a game ends, so this sits on the 5-minute tier.
 * GameDetail overlays the live game's own row client-side to cover the gap.
 */
export async function GET(req: NextRequest) {
  const [a, b] = (req.nextUrl.searchParams.get("teams") ?? "").split(",");
  const season = Number(req.nextUrl.searchParams.get("season"));
  const teamA = TEAMS[a];
  const teamB = TEAMS[b];
  if (!teamA || !teamB || teamA === teamB) {
    return Response.json({ error: "Expected ?teams=AAA,BBB" }, { status: 400 });
  }
  if (!Number.isInteger(season) || season < 1900) {
    return Response.json({ error: "Invalid season" }, { status: 400 });
  }

  let games: SeasonSeriesData["games"] = [];
  try {
    const json = await mlb<unknown>(
      `/schedule?sportId=1&teamId=${teamA.mlbId}&opponentId=${teamB.mlbId}&season=${season}&gameType=R`,
      { revalidate: 300 },
    );
    games = mapSeasonSeries(json);
  } catch {
    // Same posture as the team /games route: an upstream hiccup degrades to an
    // empty list, and the card hides itself rather than erroring the Summary tab.
  }

  const body: SeasonSeriesData = { season, games };
  return Response.json(body, { headers: CACHE_HEADERS.STATIC_5M });
}
