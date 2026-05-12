import type { NextRequest } from "next/server";
import { mlb } from "@/lib/mlb/upstream";
import { mapScheduleListGame } from "@/lib/mlb/transform";
import { CACHE_HEADERS } from "@/lib/mlb/cacheHeaders";
import type { ScheduleGame } from "@/lib/mlb/types";
import { addDays, toISO, todayISO } from "@/lib/date";

/**
 * GET /api/mlb/schedule?start=YYYY-MM-DD&end=YYYY-MM-DD
 * Defaults to a 6-week window (-7 days .. +35 days).
 */
export async function GET(req: NextRequest) {
  const start = req.nextUrl.searchParams.get("start") ?? toISO(addDays(new Date(), -7));
  const end = req.nextUrl.searchParams.get("end") ?? toISO(addDays(new Date(), 35));

  const path = `/schedule?sportId=1&startDate=${start}&endDate=${end}`;
  try {
    const json = await mlb<{ dates: { date: string; games: unknown[] }[] }>(path, {
      revalidate: 60,
    });
    const games: ScheduleGame[] = [];
    for (const day of json?.dates ?? []) {
      for (const g of day?.games ?? []) {
        const m = mapScheduleListGame(g, day.date);
        if (m) games.push(m);
      }
    }
    return Response.json({ start, end, today: todayISO(), games }, { headers: CACHE_HEADERS.SCHEDULE });
  } catch (err) {
    return Response.json(
      { start, end, today: todayISO(), games: [], error: (err as Error).message },
      { status: 502 },
    );
  }
}
