import type { NextRequest } from "next/server";
import { mlb } from "@/lib/mlb/upstream";
import { mapScheduleGame } from "@/lib/mlb/transform";
import { todayISO } from "@/lib/date";
import { CACHE_HEADERS } from "@/lib/mlb/cacheHeaders";
import type { GameSummary } from "@/lib/mlb/types";

/**
 * GET /api/mlb/scoreboard?date=YYYY-MM-DD
 * Returns the list of MLB games for the given date.
 */
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") || todayISO();
  // Hydrate probable pitchers, linescore (for live state), broadcasts, and
  // W/L/SV decisions (populated once a game goes final).
  const path = `/schedule?sportId=1&date=${date}&hydrate=probablePitcher,linescore,broadcasts,team,decisions`;

  try {
    // The scoreboard is the app's live surface, so the Data Cache TTL has to
    // sit *under* the client's poll interval (10s in ScoresScreen). At the
    // previous 15s it sat above it: a poll could never outrun the cache, and
    // because the Data Cache serves stale-while-revalidating, the first request
    // past the TTL got the expired payload while the refresh ran behind it —
    // pushing worst-case age to a TTL plus a poll interval. 5s guarantees every
    // poll crosses a boundary and still coalesces concurrent viewers into
    // roughly one upstream request per 5s.
    const json = await mlb<{ dates: { date: string; games: unknown[] }[] }>(path, {
      revalidate: 5,
    });
    const day = json?.dates?.[0];
    const games: GameSummary[] = ((day?.games ?? []) as unknown[])
      .map((g) => mapScheduleGame(g, day?.date ?? date))
      .filter((g): g is GameSummary => g !== null);
    return Response.json({ date, games }, { headers: CACHE_HEADERS.LIVE });
  } catch (err) {
    return Response.json(
      { date, games: [], error: (err as Error).message },
      { status: 502 },
    );
  }
}
