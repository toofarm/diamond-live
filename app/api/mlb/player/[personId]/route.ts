import { mlb } from "@/lib/mlb/upstream";
import { mapPlayer } from "@/lib/mlb/transform";
import { CACHE_HEADERS } from "@/lib/mlb/cacheHeaders";
import { currentSeason } from "@/lib/date";

/**
 * GET /api/mlb/player/[personId]
 * Returns the player's bio + this season's hitting/pitching splits.
 */
export async function GET(_: Request, { params }: { params: Promise<{ personId: string }> }) {
  const { personId } = await params;
  const id = Number(personId);
  if (!Number.isFinite(id) || id <= 0) {
    return Response.json({ error: "Invalid personId" }, { status: 400 });
  }
  const season = currentSeason();

  try {
    const [personJson, statsJson] = await Promise.all([
      mlb<{ people?: unknown[] }>(`/people/${id}?hydrate=currentTeam`, { revalidate: 600 }),
      mlb<unknown>(`/people/${id}/stats?stats=season&group=hitting,pitching&season=${season}&sportId=1`, {
        revalidate: 300,
      }),
    ]);
    const person = (personJson?.people as Array<Record<string, unknown>> | undefined)?.[0] ?? {};
    return Response.json(mapPlayer(person, statsJson), { headers: CACHE_HEADERS.STATIC_5M });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
