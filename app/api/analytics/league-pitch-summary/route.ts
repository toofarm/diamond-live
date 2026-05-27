/**
 * GET /api/analytics/league-pitch-summary?season=YYYY
 *
 * Returns one row per pitch type for the league-wide aggregate that
 * season. Used by `PitcherVsLeagueBars` as the baseline against which
 * an individual pitcher's arsenal is compared.
 *
 * Auth + numeric-coercion notes match the sibling pitcher-arsenal route
 * — see that file for full rationale.
 */

import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLeaguePitchSummary } from "@/lib/analytics/queries";
import type { LeaguePitchSummaryRow } from "@/lib/analytics/types";
import { currentSeason } from "@/lib/date";

function coerceRow(r: LeaguePitchSummaryRow): LeaguePitchSummaryRow {
  const n = (v: unknown) => (typeof v === "number" ? v : Number(v));
  return {
    ...r,
    n_pitches: n(r.n_pitches),
    n_pitchers: n(r.n_pitchers),
    pct_of_league_mix: n(r.pct_of_league_mix),
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

export async function GET(req: NextRequest) {
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
    const rows = await getLeaguePitchSummary({ season });
    return Response.json({ season, rows: rows.map(coerceRow) });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
