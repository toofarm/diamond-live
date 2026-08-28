/**
 * GET /api/analytics/player-batting-percentiles/[personId]?season=YYYY
 *
 * Returns the single percentile-rank row for the given batter in the
 * requested season, or `null` when the player has no row (they fell below
 * the ETL's plate-appearance cutoff). Used by the v. League tab on
 * `PlayerDetail` to draw a cool→warm slider per rate category.
 *
 * Shape note: `player_batting_percentiles` is keyed on (player_id, season),
 * so the query returns at most one row. The response wraps it as
 * `{ season, row }` (null when absent) rather than `{ rows: [] }`, mirroring
 * the league-summary route's single-row contract.
 *
 * Auth: gated at the handler. Anonymous callers get a 401 even though RLS on
 * `analytics.player_batting_percentiles` would also reject them — we want the
 * client to see a clear `401` rather than an empty result (which RLS would
 * produce silently) so the UI can route the user to /login.
 */

import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPlayerBattingPercentiles } from "@/lib/analytics/queries";
import type { PlayerBattingPercentilesRow } from "@/lib/analytics/types";
import { currentSeason } from "@/lib/date";

/** Postgres `numeric` columns may arrive from supabase-js as either JS
 *  numbers or strings depending on driver version + precision. Coerce every
 *  numeric field once at the boundary so client code can trust the declared
 *  types without per-call defensive checks. */
function coerceRow(r: PlayerBattingPercentilesRow): PlayerBattingPercentilesRow {
  const n = (v: unknown) => (typeof v === "number" ? v : Number(v));
  // wRC+ value is still null pending the ETL's adjustment; preserve null
  // rather than coerce it to NaN.
  const nOrNull = (v: unknown) => (v === null || v === undefined ? null : n(v));
  return {
    ...r,
    bat_plate_appearances: n(r.bat_plate_appearances),
    bat_avg: n(r.bat_avg),
    bat_avg_pctl: n(r.bat_avg_pctl),
    bat_obp: n(r.bat_obp),
    bat_obp_pctl: n(r.bat_obp_pctl),
    bat_slg: n(r.bat_slg),
    bat_slg_pctl: n(r.bat_slg_pctl),
    bat_ops: n(r.bat_ops),
    bat_ops_pctl: n(r.bat_ops_pctl),
    bat_k_pct: n(r.bat_k_pct),
    bat_k_pct_pctl: n(r.bat_k_pct_pctl),
    bat_bb_pct: n(r.bat_bb_pct),
    bat_bb_pct_pctl: n(r.bat_bb_pct_pctl),
    bat_babip: n(r.bat_babip),
    bat_babip_pctl: n(r.bat_babip_pctl),
    bat_wrc_plus: nOrNull(r.bat_wrc_plus) as number | null,
    bat_wrc_plus_pctl: n(r.bat_wrc_plus_pctl),
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ personId: string }> },
) {
  const { personId } = await params;
  const id = Number(personId);
  if (!Number.isFinite(id) || id <= 0) {
    return Response.json({ error: "Invalid personId" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const seasonParam = req.nextUrl.searchParams.get("season");
  const season = seasonParam && /^\d{4}$/.test(seasonParam)
    ? Number(seasonParam)
    : currentSeason();

  try {
    const rows = await getPlayerBattingPercentiles({ playerId: id, season });
    const row = rows.length > 0 ? coerceRow(rows[0]) : null;
    return Response.json({ season, row });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
