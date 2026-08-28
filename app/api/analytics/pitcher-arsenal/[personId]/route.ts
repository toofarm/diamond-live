/**
 * GET /api/analytics/pitcher-arsenal/[personId]?season=YYYY
 *
 * Returns one row per pitch type the given pitcher has thrown in the
 * requested season. Used by `PitchArsenalChart` on the player detail
 * Pitches tab.
 *
 * Auth: gated at the handler. Anonymous callers get a 401 even though
 * RLS on `analytics.pitcher_arsenal` would also reject them — we want
 * the client to see a clear `401` rather than an empty `[]` (which RLS
 * would produce silently) so the UI can route the user to /login.
 */

import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPitcherArsenal } from "@/lib/analytics/queries";
import type { PitcherArsenalRow } from "@/lib/analytics/types";
import { currentSeason } from "@/lib/date";

/** Postgres `numeric` columns may arrive from supabase-js as either JS
 *  numbers or strings depending on driver version + precision. Coerce
 *  every numeric field once at the boundary so client code can trust the
 *  declared types without per-call defensive checks. */
function coerceRow(r: PitcherArsenalRow): PitcherArsenalRow {
  const n = (v: unknown) => (typeof v === "number" ? v : Number(v));
  return {
    ...r,
    n_pitches: n(r.n_pitches),
    usage_pct: n(r.usage_pct),
    avg_start_speed: n(r.avg_start_speed),
    avg_spin_rate: n(r.avg_spin_rate),
    avg_break_vertical_induced: n(r.avg_break_vertical_induced),
    avg_break_horizontal: n(r.avg_break_horizontal),
    pct_swinging_strike: n(r.pct_swinging_strike),
    pct_called_strike: n(r.pct_called_strike),
    pct_in_play: n(r.pct_in_play),
    pct_home_run: n(r.pct_home_run),
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
    const rows = await getPitcherArsenal({ pitcherId: id, season });
    return Response.json({ season, rows: rows.map(coerceRow) });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
