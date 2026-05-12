import { mlb } from "@/lib/mlb/upstream";
import { mapStandings } from "@/lib/mlb/transform";
import { CACHE_HEADERS } from "@/lib/mlb/cacheHeaders";
import { currentSeason } from "@/lib/date";

/** GET /api/mlb/standings — AL+NL standings by division for the current season. */
export async function GET() {
  const season = currentSeason();
  try {
    const json = await mlb<unknown>(
      `/standings?leagueId=103,104&season=${season}&standingsTypes=regularSeason`,
      { revalidate: 300 },
    );
    return Response.json({ season, divisions: mapStandings(json) }, { headers: CACHE_HEADERS.STATIC_5M });
  } catch (err) {
    return Response.json(
      { season, divisions: {}, error: (err as Error).message },
      { status: 502 },
    );
  }
}
