import { mapGameDetail } from "@/lib/mlb/transform";
import { CACHE_HEADERS } from "@/lib/mlb/cacheHeaders";
import { FIXTURE_LIVE_GAME } from "@/lib/mlb/fixtures";

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

  // Dev fixture: /game/1 serves a hand-built live game so the UI can be
  // exercised when no real games are in progress.
  if (id === 1) {
    return Response.json(FIXTURE_LIVE_GAME, { headers: CACHE_HEADERS.LIVE });
  }

  // Win probability lives on a separate v1 endpoint (`/winProbability`) — the
  // live feed does not include per-play win-probability fields, so we fetch both
  // in parallel and merge them at the transform layer.
  const liveUrl = `https://statsapi.mlb.com/api/v1.1/game/${id}/feed/live`;
  const wpUrl = `https://statsapi.mlb.com/api/v1/game/${id}/winProbability`;
  try {
    const [liveRes, wpRes] = await Promise.all([
      fetch(liveUrl, { next: { revalidate: 10 } }),
      fetch(wpUrl, { next: { revalidate: 10 } }),
    ]);
    if (!liveRes.ok) {
      return Response.json({ error: `MLB ${liveRes.status}` }, { status: 502 });
    }
    const feed = await liveRes.json();
    const wp = wpRes.ok ? await wpRes.json() : null;
    const data = mapGameDetail(feed, undefined, wp);
    return Response.json(data, { headers: CACHE_HEADERS.LIVE });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
