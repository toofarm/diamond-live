import { mapGameDetail } from "@/lib/mlb/transform";
import { CACHE_HEADERS } from "@/lib/mlb/cacheHeaders";

/**
 * GET /api/mlb/game/[gamePk]
 * Returns reshaped live-feed for a single game: summary, linescore, lineups,
 * plays, and (when live) the current at-bat.
 *
 * Note: the live feed lives on a different host (`statsapi.mlb.com/api/v1.1`),
 * so we hit it directly here rather than via the v1 wrapper.
 */
export async function GET(_: Request, { params }: { params: Promise<{ gamePk: string }> }) {
  const { gamePk } = await params;
  const id = Number(gamePk);
  if (!Number.isFinite(id) || id <= 0) {
    return Response.json({ error: "Invalid gamePk" }, { status: 400 });
  }

  const url = `https://statsapi.mlb.com/api/v1.1/game/${id}/feed/live`;
  try {
    const res = await fetch(url, { next: { revalidate: 10 } });
    if (!res.ok) {
      return Response.json({ error: `MLB ${res.status}` }, { status: 502 });
    }
    const feed = await res.json();
    const data = mapGameDetail(feed);
    return Response.json(data, { headers: CACHE_HEADERS.LIVE });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
