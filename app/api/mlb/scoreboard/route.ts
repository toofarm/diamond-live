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
  // Hydrate probable pitchers, linescore (for live state), broadcasts.
  const path = `/schedule?sportId=1&date=${date}&hydrate=probablePitcher,linescore,broadcasts,team`;

  try {
    const json = await mlb<{ dates: { date: string; games: unknown[] }[] }>(path, {
      revalidate: 15,
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
