import { mlb } from "@/lib/mlb/upstream";
import { mapActivePlayers } from "@/lib/mlb/transform";
import { CACHE_HEADERS } from "@/lib/mlb/cacheHeaders";
import { currentSeason } from "@/lib/date";
import type { ActivePlayersData } from "@/lib/mlb/types";

/**
 * GET /api/mlb/players
 *
 * League-wide directory of active MLB players, used by the Season-tab
 * comparison picker on PlayerDetail. The list is large (~2000 rows) but stable
 * across a session; we cache aggressively (1h) and the client keeps it in
 * memory via `useApi`'s in-process cache so subsequent picker opens are
 * instantaneous.
 *
 * Upstream failures degrade to an empty list rather than a 5xx — the picker
 * will simply show "No matches" instead of breaking the page.
 */
export async function GET() {
  const season = currentSeason();
  try {
    const json = await mlb<unknown>(
      `/sports/1/players?season=${season}&activeStatus=Y`,
      { revalidate: 3600 },
    );
    const body: ActivePlayersData = {
      season,
      players: mapActivePlayers(json),
    };
    return Response.json(body, { headers: CACHE_HEADERS.STATIC_1H });
  } catch {
    const body: ActivePlayersData = { season, players: [] };
    return Response.json(body, { headers: CACHE_HEADERS.STATIC_1H });
  }
}
