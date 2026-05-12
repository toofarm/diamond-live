import type { NextRequest } from "next/server";
import { mlb } from "@/lib/mlb/upstream";
import { mapPlayerHistory } from "@/lib/mlb/transform";
import { CACHE_HEADERS } from "@/lib/mlb/cacheHeaders";
import type { StatMode } from "@/lib/mlb/types";

/** GET /api/mlb/player/[personId]/history?group=hitting|pitching */
export async function GET(req: NextRequest, { params }: { params: Promise<{ personId: string }> }) {
  const { personId } = await params;
  const id = Number(personId);
  if (!Number.isFinite(id) || id <= 0) {
    return Response.json({ error: "Invalid personId" }, { status: 400 });
  }
  const group: StatMode = req.nextUrl.searchParams.get("group") === "pitching" ? "pitching" : "hitting";

  try {
    const [yearByYearJson, careerJson, awardsJson] = await Promise.all([
      mlb<unknown>(`/people/${id}/stats?stats=yearByYear&group=${group}&sportId=1`, { revalidate: 600 }),
      mlb<unknown>(`/people/${id}/stats?stats=career&group=${group}&sportId=1`,    { revalidate: 600 }),
      mlb<unknown>(`/people/${id}/awards`,                                          { revalidate: 3600 }),
    ]);
    return Response.json(mapPlayerHistory(yearByYearJson, careerJson, awardsJson, group), { headers: CACHE_HEADERS.STATIC_5M });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
