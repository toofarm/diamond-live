/**
 * Shared metric configuration for the pitch-arsenal visualizations.
 *
 * Lives outside the chart components because the Pitches tab renders two
 * sibling charts (arsenal bubbles + pitcher-vs-league bars) that share a
 * single metric pill switcher. Both need the same field extractors,
 * units, and precision rules to stay coherent when the pill flips.
 *
 * Naming note: the pitcher-arsenal table calls the share-of-arsenal column
 * `usage_pct`; the league-summary table calls the analogous share-of-league
 * column `pct_of_league_mix`. The "Usage" metric below bridges that
 * rename via the two extractor functions.
 */

import type { PitcherArsenalRow } from "@/lib/analytics/types";
import type { LeaguePitchSummaryRow } from "@/lib/analytics/types";

export type MetricKey =
  | "usage_pct"
  | "avg_start_speed"
  | "avg_spin_rate"
  | "avg_break_vertical_induced"
  | "pct_swinging_strike"
  | "pct_in_play"
  | "pct_home_run";

export interface MetricConfig {
  key: MetricKey;
  /** Short copy for the pill switcher. */
  label: string;
  /** Long-form heading shown above each chart. */
  description: string;
  /** Unit suffix appended to formatted values (e.g., " mph", "%"). */
  unit: string;
  /** Decimal precision passed to `toFixed`. */
  precision: number;
  /** Pull the raw value off a pitcher's arsenal row. */
  pitcherValue: (row: PitcherArsenalRow) => number;
  /** Pull the corresponding league-baseline value off a league row. */
  leagueValue: (row: LeaguePitchSummaryRow) => number;
  /** Magnitude for sizing operations (e.g., the bubble chart). Strips the
   *  sign on `avg_break_vertical_induced` since direction (rise vs. sink)
   *  is semantic, not a magnitude. Other metrics pass through unchanged. */
  toMagnitude: (value: number) => number;
}

export const METRICS: MetricConfig[] = [
  {
    key: "usage_pct",
    label: "Usage",
    description: "Pitch Usage",
    unit: "%",
    precision: 1,
    pitcherValue: (r) => r.usage_pct,
    leagueValue: (r) => r.pct_of_league_mix,
    toMagnitude: (v) => v,
  },
  {
    key: "avg_start_speed",
    label: "Velo",
    description: "Average Velocity",
    unit: " mph",
    precision: 1,
    pitcherValue: (r) => r.avg_start_speed,
    leagueValue: (r) => r.avg_start_speed,
    toMagnitude: (v) => v,
  },
  {
    key: "avg_spin_rate",
    label: "Spin",
    description: "Average Spin Rate",
    unit: " rpm",
    precision: 0,
    pitcherValue: (r) => r.avg_spin_rate,
    leagueValue: (r) => r.avg_spin_rate,
    toMagnitude: (v) => v,
  },
  {
    key: "avg_break_vertical_induced",
    label: "iVB",
    description: "Induced Vertical Break",
    unit: " in",
    precision: 1,
    pitcherValue: (r) => r.avg_break_vertical_induced,
    leagueValue: (r) => r.avg_break_vertical_induced,
    toMagnitude: (v) => Math.abs(v),
  },
  {
    key: "pct_swinging_strike",
    label: "SwStr%",
    description: "Swinging Strike Percentage",
    unit: "%",
    precision: 1,
    pitcherValue: (r) => r.pct_swinging_strike,
    leagueValue: (r) => r.pct_swinging_strike,
    toMagnitude: (v) => v,
  },
  {
    key: "pct_in_play",
    label: "InPlay%",
    description: "In-Play Percentage",
    unit: "%",
    precision: 1,
    pitcherValue: (r) => r.pct_in_play,
    leagueValue: (r) => r.pct_in_play,
    toMagnitude: (v) => v,
  },
  {
    key: "pct_home_run",
    label: "HR%",
    description: "Home Run Percentage",
    unit: "%",
    // HR rate is sub-1% for most pitch types — extra precision so the
    // contrast between (say) 0.45% and 2.17% reads cleanly.
    precision: 2,
    pitcherValue: (r) => r.pct_home_run,
    leagueValue: (r) => r.pct_home_run,
    toMagnitude: (v) => v,
  },
];

export function getMetric(key: MetricKey): MetricConfig {
  // METRICS is a closed enum-driven list; .find never returns undefined for
  // a valid key. Non-null assertion is the simplest way to convey that
  // invariant to the type system.
  return METRICS.find((m) => m.key === key)!;
}

/** Format a single value with the metric's unit and precision. */
export function formatValue(cfg: MetricConfig, value: number): string {
  return `${value.toFixed(cfg.precision)}${cfg.unit}`;
}

/** Format a signed delta (pitcher − league). Uses a real Unicode minus
 *  sign for negatives and an explicit `+` for positives so the sign is
 *  unambiguous in the bar-chart labels. */
export function formatDelta(cfg: MetricConfig, delta: number): string {
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  return `${sign}${Math.abs(delta).toFixed(cfg.precision)}${cfg.unit}`;
}
