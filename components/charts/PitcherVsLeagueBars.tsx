"use client";

/**
 * Diverging horizontal bars comparing one pitcher's per-pitch values to
 * the league average for the same pitch type.
 *
 * Layout per row:
 *   [color dot] [code] [name]  [─── bar centered on league avg ───]  [delta]
 *
 * The bar area is a single relative box with a vertical baseline at 50%.
 * Each bar is absolutely positioned and extends rightward when the
 * pitcher is above league or leftward when below; widths are normalized
 * against the largest |delta| in the current arsenal so the most
 * extreme bar always reaches the edge of its half.
 *
 * Animation: pure CSS transitions on `width` and `left`. When the user
 * flips the metric pill upstream, both attributes interpolate smoothly
 * without us managing per-frame state.
 *
 * Data path: this component fetches the league baseline itself via the
 * `/api/analytics/league-pitch-summary` route so the chart is
 * self-contained — the parent doesn't need to coordinate a second
 * request. Pitcher rows come in as a prop (already fetched by the
 * parent for the arsenal bubble chart).
 */

import { useMemo } from "react";
import { useApi } from "@/lib/mlb/client";
import type {
  LeaguePitchSummaryRow,
  PitcherArsenalRow,
} from "@/lib/analytics/types";
import {
  getMetric,
  formatValue,
  formatDelta,
  type MetricKey,
} from "@/lib/analytics/pitchMetrics";
import { pitchColor, pitchName } from "@/lib/mlb/pitchTypes";
import { Loader } from "@/components/ui/primitives";

interface LeagueResponse {
  season: number;
  rows: LeaguePitchSummaryRow[];
}

interface PitcherVsLeagueBarsProps {
  pitcherRows: PitcherArsenalRow[];
  metricKey: MetricKey;
  season: number;
}

export function PitcherVsLeagueBars({
  pitcherRows,
  metricKey,
  season,
}: PitcherVsLeagueBarsProps) {
  const { data, loading, error } = useApi<LeagueResponse>(
    `/api/analytics/league-pitch-summary?season=${season}`,
    { cacheMs: 600_000 }, // 10 min — league baseline doesn't move quickly
  );

  const metric = getMetric(metricKey);

  // Build one diverging row per pitch in the pitcher's arsenal that also
  // has a matching league row. Pitches missing from the league summary
  // (extremely rare, would be brand-new codes) are skipped.
  const rows = useMemo(() => {
    if (!data) return [];
    const leagueByCode = new Map(data.rows.map((r) => [r.pitch_type_code, r]));
    return pitcherRows
      .map((p) => {
        const lg = leagueByCode.get(p.pitch_type_code);
        if (!lg) return null;
        const pitcherV = metric.pitcherValue(p);
        const leagueV = metric.leagueValue(lg);
        return {
          code: p.pitch_type_code,
          pitcherValue: pitcherV,
          leagueValue: leagueV,
          delta: pitcherV - leagueV,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
  }, [data, pitcherRows, metric]);

  // Normalize bar widths against the largest absolute delta in the
  // current metric so the most extreme pitch always fills its half-bar.
  // Sort by absolute delta desc — biggest divergences read first.
  const { sorted, maxAbsDelta } = useMemo(() => {
    const maxAbs = rows.reduce((m, r) => Math.max(m, Math.abs(r.delta)), 0);
    const sortedRows = [...rows].sort(
      (a, b) => Math.abs(b.delta) - Math.abs(a.delta),
    );
    return { sorted: sortedRows, maxAbsDelta: maxAbs };
  }, [rows]);

  if (loading && !data) {
    return (
      <div className="bg-surface border border-line rounded-[14px] p-3">
        <Loader />
      </div>
    );
  }
  if (error) {
    return (
      <div className="bg-surface border border-line rounded-[14px] p-3">
        <div className="p-3 text-neg text-[13px]">
          Failed to load league baseline.
        </div>
      </div>
    );
  }
  if (sorted.length === 0) {
    return null;
  }

  return (
    <div
      data-cy="pitcher-vs-league-chart"
      className="bg-surface border border-line rounded-[14px] p-3"
    >
      <div
        data-cy="pitcher-vs-league-heading"
        className="px-1 pt-1 pb-3 font-ui text-[11px] font-bold tracking-[1.4px] uppercase text-ink-2"
      >
        {metric.description} vs League Average
      </div>

      <div className="flex flex-col gap-2.5">
        {sorted.map((r) => (
          <DivergingRow
            key={r.code}
            code={r.code}
            delta={r.delta}
            maxAbsDelta={maxAbsDelta}
            pitcherValue={r.pitcherValue}
            leagueValue={r.leagueValue}
            metric={metric}
          />
        ))}
      </div>

      {/* Footer micro-legend so the bar direction is unambiguous. */}
      <div className="mt-3 pt-2 border-t border-line-2 flex items-center justify-between font-mono text-[10px] text-ink-3 tracking-[0.4px] uppercase">
        <span>← Below league</span>
        <span>Above league →</span>
      </div>
    </div>
  );
}

/* ── Row ──────────────────────────────────────────────────────── */

interface DivergingRowProps {
  code: string;
  delta: number;
  maxAbsDelta: number;
  pitcherValue: number;
  leagueValue: number;
  metric: ReturnType<typeof getMetric>;
}

function DivergingRow({
  code,
  delta,
  maxAbsDelta,
  pitcherValue,
  leagueValue,
  metric,
}: DivergingRowProps) {
  const color = pitchColor(code);
  // Half-width fraction the bar should occupy: |delta| relative to the
  // largest |delta| in this metric. Guard against the degenerate case
  // where every pitch matches league exactly (maxAbsDelta = 0).
  const pct = maxAbsDelta > 0 ? Math.abs(delta) / maxAbsDelta : 0;
  const halfWidth = `${pct * 50}%`;
  const positive = delta > 0;
  const negative = delta < 0;

  return (
    <div
      data-cy="vs-league-row"
      title={`This pitcher: ${formatValue(metric, pitcherValue)} · League: ${formatValue(metric, leagueValue)}`}
      className="grid items-center gap-2.5"
      style={{ gridTemplateColumns: "12px 28px 1fr 64px" }}
    >
      <span
        className="w-2.5 h-2.5 rounded-full inline-block"
        style={{ background: color }}
        aria-hidden
      />
      <span className="font-mono text-[12px] font-bold text-ink-2 tracking-[0.4px]">
        {code}
      </span>

      {/* Bar area with the league-avg axis pinned at 50%. */}
      <div className="relative h-4 bg-chip rounded-[4px] overflow-hidden">
        {/* Center axis line. */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-ink-3 opacity-50" />
        {/* The bar — anchored at the centerline, growing in the right
            direction. Transitioning both `left` and `width` lets the bar
            slide and stretch in one motion when the metric flips. */}
        <div
          className="absolute top-0 bottom-0 rounded-[3px]"
          style={{
            background: color,
            left: positive ? "50%" : `calc(50% - ${halfWidth})`,
            width: positive || negative ? halfWidth : "0%",
            transition: "left 300ms ease-out, width 300ms ease-out",
          }}
          aria-label={`${pitchName(code)}: ${formatDelta(metric, delta)} vs league`}
        />
      </div>

      <span
        className={`font-mono text-[12px] font-semibold tracking-[-0.2px] text-right ${positive ? "text-ink" : negative ? "text-ink" : "text-ink-3"
          }`}
      >
        {formatDelta(metric, delta)}
      </span>
    </div>
  );
}
