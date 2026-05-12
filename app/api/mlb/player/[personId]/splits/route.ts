import type { NextRequest } from "next/server";
import { mlb } from "@/lib/mlb/upstream";
import { mapPlayerSplits, SPLIT_ORDER_HITTING, SPLIT_ORDER_PITCHING } from "@/lib/mlb/transform";
import { CACHE_HEADERS } from "@/lib/mlb/cacheHeaders";
import { currentSeason } from "@/lib/date";
import type { StatMode } from "@/lib/mlb/types";

/** GET /api/mlb/player/[personId]/splits?group=hitting|pitching */
export async function GET(req: NextRequest, { params }: { params: Promise<{ personId: string }> }) {
  const { personId } = await params;
  const id = Number(personId);
  if (!Number.isFinite(id) || id <= 0) {
    return Response.json({ error: "Invalid personId" }, { status: 400 });
  }
  const group: StatMode = req.nextUrl.searchParams.get("group") === "pitching" ? "pitching" : "hitting";
  const season = currentSeason();
  const sitCodes = (group === "pitching" ? SPLIT_ORDER_PITCHING : SPLIT_ORDER_HITTING).join(",");

  try {
    const json = await mlb<unknown>(
      `/people/${id}/stats?stats=statSplits&sitCodes=${sitCodes}&group=${group}&season=${season}&sportId=1`,
      { revalidate: 300 },
    );
    return Response.json({ season, mode: group, splits: mapPlayerSplits(json, group) }, { headers: CACHE_HEADERS.STATIC_5M });
  } catch (err) {
    return Response.json(
      { season, mode: group, splits: [], error: (err as Error).message },
      { status: 502 },
    );
  }
}
