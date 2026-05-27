/**
 * Server-side fetchers for the `analytics.*` tables. Call these from Server
 * Components or Route Handlers — they instantiate a per-request Supabase
 * client via `lib/supabase/server.ts` and select through the `analytics`
 * schema directly (no public-schema view wrappers).
 *
 * Prerequisite: the project must expose the `analytics` schema to PostgREST.
 * Dashboard → Project Settings → API → "Exposed schemas" must include
 * `analytics`. Without it the `.schema('analytics')` call returns a 404 from
 * PostgREST and these functions throw.
 *
 * RLS is currently OFF on these tables; rows are returned to anyone with the
 * anon key. The data is already-public MLB stats, but if any user-scoped
 * tables get added under `analytics/` the schema-exposure decision should be
 * revisited.
 */

import { createClient } from "@/lib/supabase/server";
import type {
  LeaguePitchSummaryRow,
  PitcherArsenalRow,
  PlayerRollingStatsRow,
} from "@/lib/analytics/types";

/** League-wide pitch-mix baseline. Most viz code wants a single season at a
 *  time; pass `season` to scope. `minPitches` drops rare pitches that would
 *  otherwise add noise to a chart's tail. */
export async function getLeaguePitchSummary(opts: {
  season?: number;
  minPitches?: number;
} = {}): Promise<LeaguePitchSummaryRow[]> {
  const supabase = await createClient();
  let q = supabase
    .schema("analytics")
    .from("league_pitch_summary")
    .select("*");
  if (opts.season !== undefined) q = q.eq("season", opts.season);
  if (opts.minPitches !== undefined) q = q.gte("n_pitches", opts.minPitches);
  const { data, error } = await q.order("n_pitches", { ascending: false });
  if (error) throw new Error(`league_pitch_summary: ${error.message}`);
  return (data ?? []) as LeaguePitchSummaryRow[];
}

/** Per-pitcher arsenal. Pass a single `pitcherId` for one pitcher, or
 *  `pitcherIds` for a comparison cohort. Season filter is optional but
 *  almost always wanted — the table accumulates across years. */
export async function getPitcherArsenal(opts: {
  pitcherId?: number;
  pitcherIds?: number[];
  season?: number;
} = {}): Promise<PitcherArsenalRow[]> {
  const supabase = await createClient();
  let q = supabase
    .schema("analytics")
    .from("pitcher_arsenal")
    .select("*");
  if (opts.pitcherId !== undefined) q = q.eq("pitcher_id", opts.pitcherId);
  if (opts.pitcherIds?.length) q = q.in("pitcher_id", opts.pitcherIds);
  if (opts.season !== undefined) q = q.eq("season", opts.season);
  const { data, error } = await q.order("usage_pct", { ascending: false });
  if (error) throw new Error(`pitcher_arsenal: ${error.message}`);
  return (data ?? []) as PitcherArsenalRow[];
}

/** Rolling-window trend rows for a single player. `playerId` is required —
 *  the unfiltered table is huge and no viz wants a cross-player dump. Pass
 *  `windowDays` to pin to one rollup length; omit it to retrieve every
 *  window the ETL writes (useful for "7 vs 15 vs 30" comparisons).
 *
 *  Date range bounds are inclusive on both ends. Ordered ascending by date
 *  so chart code can render without a re-sort. */
export async function getPlayerRollingStats(opts: {
  playerId: number;
  windowDays?: number;
  from?: string;  // 'YYYY-MM-DD'
  to?: string;    // 'YYYY-MM-DD'
}): Promise<PlayerRollingStatsRow[]> {
  const supabase = await createClient();
  let q = supabase
    .schema("analytics")
    .from("player_rolling_stats")
    .select("*")
    .eq("player_id", opts.playerId);
  if (opts.windowDays !== undefined) q = q.eq("window_days", opts.windowDays);
  if (opts.from) q = q.gte("as_of_date", opts.from);
  if (opts.to) q = q.lte("as_of_date", opts.to);
  const { data, error } = await q.order("as_of_date", { ascending: true });
  if (error) throw new Error(`player_rolling_stats: ${error.message}`);
  return (data ?? []) as PlayerRollingStatsRow[];
}
