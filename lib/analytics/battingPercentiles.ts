/**
 * Presentation helpers for the v. League tab's percentile sliders, backed by
 * `analytics.player_batting_percentiles` (see `PlayerBattingPercentilesRow`).
 *
 * Each category pairs a raw rate stat with its 0–100 percentile rank. The ETL
 * already orients every percentile so higher = better (strikeout rate is
 * pre-inverted), which lets the slider colour every category the same way:
 * a single cool→warm ramp keyed on the percentile, no per-stat direction
 * handling.
 */

import type { PlayerBattingPercentilesRow } from "@/lib/analytics/types";

/* ── Category configuration ────────────────────────────────────── */

export interface PercentileCategory {
  /** Stable id used for the row's `data-cy-stat` and React key. */
  key: string;
  /** Column holding the raw rate value. */
  valueKey: keyof PlayerBattingPercentilesRow;
  /** Column holding the 0–100 percentile rank. */
  pctlKey: keyof PlayerBattingPercentilesRow;
  /** Short column label shown in the row. */
  label: string;
  /** Format the raw value into a display string. Slash-line categories strip
   *  the leading "0" so `StatValue` renders the dot-accent treatment. */
  format: (value: number) => string;
}

/** A slash-line value (.000–.999, occasionally ≥1 for OPS/SLG): three
 *  decimals, leading "0" stripped so ".347" renders with the accent dot. */
function slash(value: number): string {
  const fixed = value.toFixed(3);
  return fixed.startsWith("0.") ? fixed.slice(1) : fixed;
}

/** A rate stored as a whole-number percentage (10.48 → "10.5%"). */
function pct(value: number): string {
  return `${value.toFixed(1)}%`;
}

/** Slash line first, then the discipline rates (BB%, K%), then BABIP.
 *  wRC+ is intentionally absent — its value is still null pending the ETL. */
export const PERCENTILE_CATEGORIES: PercentileCategory[] = [
  { key: "avg", valueKey: "bat_avg", pctlKey: "bat_avg_pctl", label: "AVG", format: slash },
  { key: "obp", valueKey: "bat_obp", pctlKey: "bat_obp_pctl", label: "OBP", format: slash },
  { key: "slg", valueKey: "bat_slg", pctlKey: "bat_slg_pctl", label: "SLG", format: slash },
  { key: "ops", valueKey: "bat_ops", pctlKey: "bat_ops_pctl", label: "OPS", format: slash },
  { key: "bb_pct", valueKey: "bat_bb_pct", pctlKey: "bat_bb_pct_pctl", label: "BB%", format: pct },
  { key: "k_pct", valueKey: "bat_k_pct", pctlKey: "bat_k_pct_pctl", label: "K%", format: pct },
  { key: "babip", valueKey: "bat_babip", pctlKey: "bat_babip_pctl", label: "BABIP", format: slash },
];

/* ── Cool→warm colour ramp ─────────────────────────────────────── */

/** Map a 0–100 percentile to a CSS colour that progresses cool→warm as the
 *  rank approaches 100. The hue sweeps blue (220°) → cyan → green → yellow →
 *  red (0°) linearly with the percentile, so a 50th-percentile bar reads
 *  green and a 99th reads hot red. Saturation/lightness are held fixed so the
 *  ramp stays vivid and legible on both the light and twilight surfaces.
 *
 *  Out-of-range inputs are clamped rather than rejected — a stray 100.4 from
 *  rounding still resolves to the warm end instead of wrapping past red. */
export function percentileColor(pctl: number): string {
  const clamped = Math.max(0, Math.min(100, pctl));
  const hue = 220 * (1 - clamped / 100);
  return `hsl(${hue.toFixed(0)}, 72%, 48%)`;
}

/* ── Rank label ────────────────────────────────────────────────── */

/** Render a percentile as an ordinal rank label, e.g. 98.8 → "99th",
 *  1 → "1st", 100 → "100th". Rounds to the nearest whole percentile since
 *  sub-integer precision isn't meaningful to a reader. */
export function formatPercentileRank(pctl: number): string {
  const n = Math.round(Math.max(0, Math.min(100, pctl)));
  const mod100 = n % 100;
  const mod10 = n % 10;
  // 11–13 always take "th" regardless of last digit (11th, 112th, 213th).
  const suffix =
    mod100 >= 11 && mod100 <= 13 ? "th"
    : mod10 === 1 ? "st"
    : mod10 === 2 ? "nd"
    : mod10 === 3 ? "rd"
    : "th";
  return `${n}${suffix}`;
}
