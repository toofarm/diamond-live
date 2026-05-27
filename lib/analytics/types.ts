/**
 * Row shapes for the `analytics.*` tables in the Game State Supabase project.
 *
 * Field names mirror the underlying Postgres columns one-for-one (snake_case,
 * no remapping in the fetchers) so the type and the row a `SELECT *` returns
 * are interchangeable. Visualization code that prefers camelCase should map
 * at the component boundary, not here.
 *
 * Numeric Postgres columns are returned as JavaScript `number` by the
 * supabase-js driver — none of these aggregates exceed safe-integer range.
 */

/** One row per (season, pitch_type) — the league-wide baseline a single
 *  pitcher's arsenal can be compared against. */
export interface LeaguePitchSummaryRow {
  season: number;
  pitch_type_code: string;
  pitch_type_name: string;
  pitch_family: string;
  n_pitches: number;
  n_pitchers: number;
  pct_of_league_mix: number;
  avg_start_speed: number;
  avg_spin_rate: number;
  avg_break_vertical_induced: number;
  avg_break_horizontal: number;
  pct_swinging_strike: number;
  pct_called_strike: number;
  pct_in_play: number;
  pct_home_run: number;
}

/** One row per (pitcher, season, pitch_type). `usage_pct` is share-of-arsenal,
 *  not share-of-league — compare against `LeaguePitchSummaryRow.pct_of_league_mix`
 *  for "this pitcher throws X more than average". */
export interface PitcherArsenalRow {
  pitcher_id: number;
  pitcher_name: string;
  season: number;
  pitch_type_code: string;
  pitch_type_name: string;
  pitch_family: string;
  n_pitches: number;
  usage_pct: number;
  avg_start_speed: number;
  avg_spin_rate: number;
  avg_break_vertical_induced: number;
  avg_break_horizontal: number;
  pct_swinging_strike: number;
  pct_called_strike: number;
  pct_in_play: number;
  pct_home_run: number;
}

/** Trailing-window rollups for a player as of a given date. Keyed on
 *  (player_id, as_of_date, window_days), so a single player_id can have
 *  multiple rows per date (one per window length, e.g. 7/15/30). */
export interface PlayerRollingStatsRow {
  player_id: number;
  player_name: string;
  as_of_date: string; // ISO date — Postgres `date` serializes as 'YYYY-MM-DD'
  window_days: number;

  // Batting
  bat_games_played: number;
  bat_plate_appearances: number;
  bat_at_bats: number;
  bat_runs: number;
  bat_hits: number;
  bat_doubles: number;
  bat_triples: number;
  bat_home_runs: number;
  bat_rbi: number;
  bat_strike_outs: number;
  bat_base_on_balls: number;
  bat_stolen_bases: number;
  bat_caught_stealing: number;
  bat_avg: number;
  bat_ops: number;
  bat_woba: number;
  bat_wrc_plus: number;

  // Pitching
  pit_games_played: number;
  pit_innings_pitched: number;
  pit_wins: number;
  pit_losses: number;
  pit_saves: number;
  pit_hits: number;
  pit_earned_runs: number;
  pit_strike_outs: number;
  pit_base_on_balls: number;
  pit_era: number;
  pit_fip: number;
  pit_whip: number;

  // Fielding
  fld_assists: number;
  fld_put_outs: number;
  fld_errors: number;
  fld_chances: number;
}
