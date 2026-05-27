"use client";

/**
 * Circle-packed arsenal chart for a single pitcher.
 *
 * Each bubble is one pitch type the pitcher has thrown this season; the
 * bubble's area scales with the user-selected metric. Colors come from the
 * shared `pitchColor` map so this chart and PitchUsageCard always agree on
 * which hue means which pitch.
 *
 * Data path: `/api/analytics/pitcher-arsenal/[personId]` (auth-gated; see
 * the route handler). Parent (`PitchesTab`) gates rendering on auth state,
 * so by the time this mounts we expect a valid session — a 401 here would
 * indicate a session expired mid-view, which we surface as an error.
 *
 * Sizing strategy: per the design call, each metric is normalized within
 * the pitcher's own arsenal — smallest pitch maps to a floor, largest to
 * the ceiling — so the chart is always visually informative even for
 * metrics with narrow ranges (velocity, spin). Bubble sizes therefore mean
 * "relative within this pitcher," not absolute. Cross-pitcher comparison
 * is a future addition.
 */

import { useMemo, useState } from "react";
import { hierarchy, pack } from "d3";
import type { HierarchyCircularNode } from "d3";
import { useApi } from "@/lib/mlb/client";
import type { PitcherArsenalRow } from "@/lib/analytics/types";
import {
  METRICS,
  getMetric,
  formatValue,
  type MetricKey,
} from "@/lib/analytics/pitchMetrics";
import { pitchColor, pitchName } from "@/lib/mlb/pitchTypes";
import { Loader } from "@/components/ui/primitives";
import { PitcherVsLeagueBars } from "@/components/charts/PitcherVsLeagueBars";
import { sendToDataLayer, events } from "@/lib/analytics";

/* ── Layout constants ─────────────────────────────────────────── */

// SVG viewBox dimensions. The element scales to container width via CSS;
// the actual pixel size doesn't matter — only the aspect ratio + the
// relative bubble sizes that d3.pack computes.
const VIEW_W = 320;
const VIEW_H = 280;

// Normalization floor: the smallest pitch's normalized magnitude. Keeps
// the smallest bubble visible (without it, a pitch at the metric min
// would render as a zero-radius circle).
const MIN_NORMALIZED = 0.15;

/* ── Component ────────────────────────────────────────────────── */

interface PitchArsenalChartProps {
  personId: number;
}

interface ArsenalResponse {
  season: number;
  rows: PitcherArsenalRow[];
}

export function PitchArsenalChart({ personId }: PitchArsenalChartProps) {
  const { data, loading, error } = useApi<ArsenalResponse>(
    `/api/analytics/pitcher-arsenal/${personId}`,
    { cacheMs: 300_000 },
  );
  const [metricKey, setMetricKey] = useState<MetricKey>("usage_pct");

  if (loading && !data) {
    return (
      <div className="px-3.5 md:px-6 pt-3.5 pb-20">
        <Loader />
      </div>
    );
  }
  if (error) {
    return (
      <div className="px-3.5 md:px-6 pt-3.5 pb-20">
        <div className="p-6 text-neg">Failed to load pitch arsenal.</div>
      </div>
    );
  }
  if (!data || data.rows.length === 0) {
    return (
      <div className="px-3.5 md:px-6 pt-3.5 pb-20">
        <div className="p-6 text-center text-ink-3 bg-surface border border-line rounded-[14px]">
          No pitch data available for this pitcher yet.
        </div>
      </div>
    );
  }

  return (
    <div className="px-3.5 md:px-6 pt-3.5 pb-20 flex flex-col gap-4">
      <MetricPills
        active={metricKey}
        onChange={(next) => {
          if (next === metricKey) return;
          sendToDataLayer({ event: events.TAB_NAVIGATION, target: `pitch-metric:${next}` });
          setMetricKey(next);
        }}
      />
      <ArsenalCircles rows={data.rows} metricKey={metricKey} />
      <LegendTable rows={data.rows} metricKey={metricKey} season={data.season} />
      <PitcherVsLeagueBars
        pitcherRows={data.rows}
        metricKey={metricKey}
        season={data.season}
      />
    </div>
  );
}

/* ── Metric pills ─────────────────────────────────────────────── */

function MetricPills({
  active,
  onChange,
}: {
  active: MetricKey;
  onChange: (next: MetricKey) => void;
}) {
  return (
    <div
      data-cy="pitch-metric-pills"
      className="flex flex-row overflow-scroll gap-2"
      role="tablist"
      aria-label="Pitch metric"
    >
      {METRICS.map((m) => {
        const on = m.key === active;
        return (
          <button
            key={m.key}
            role="tab"
            aria-selected={on}
            data-cy="pitch-metric-pill"
            data-cy-metric={m.key}
            onClick={() => onChange(m.key)}
            className={`px-3.5 py-1.5 rounded-full cursor-pointer font-mono text-[12px] font-bold tracking-[0.3px] transition-colors ${on
              ? "bg-ink text-surface border border-ink"
              : "bg-transparent text-ink-2 border border-line"
              }`}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── Circle pack ──────────────────────────────────────────────── */

interface PackedNode {
  row: PitcherArsenalRow;
  x: number;
  y: number;
  r: number;
}

function ArsenalCircles({
  rows,
  metricKey,
}: {
  rows: PitcherArsenalRow[];
  metricKey: MetricKey;
}) {
  const metric = getMetric(metricKey);

  const packed: PackedNode[] = useMemo(() => {
    const magnitudes = rows.map((r) => metric.toMagnitude(metric.pitcherValue(r)));
    const min = Math.min(...magnitudes);
    const max = Math.max(...magnitudes);
    const span = max - min;

    // Per-arsenal min-max normalize. If every pitch has the same value
    // (degenerate but possible for single-pitch arsenals or zero-variance
    // metrics like pct_home_run = 0 across the board), default each bubble
    // to the ceiling so the layout is still visible.
    type Node = { value: number; row: PitcherArsenalRow };
    type Tree = { children: Node[] };

    const children: Node[] = rows.map((r) => {
      const m = metric.toMagnitude(metric.pitcherValue(r));
      const value = span <= 0 ? 1 : MIN_NORMALIZED + ((m - min) / span) * (1 - MIN_NORMALIZED);
      return { value, row: r };
    });

    const root = hierarchy<Tree | Node>({ children } as Tree)
      .sum((d) => ("value" in d ? d.value : 0));

    const layout = pack<Tree | Node>().size([VIEW_W, VIEW_H]).padding(3);
    const packedRoot = layout(root) as HierarchyCircularNode<Tree | Node>;

    return packedRoot.leaves().map((leaf) => ({
      row: (leaf.data as Node).row,
      x: leaf.x,
      y: leaf.y,
      r: leaf.r,
    }));
  }, [rows, metric]);

  return (
    <div
      data-cy="pitch-arsenal-chart"
      className="bg-surface border border-line rounded-[14px] p-3"
    >
      <div
        data-cy="pitch-arsenal-heading"
        className="px-1 pt-1 pb-2 font-ui text-[11px] font-bold tracking-[1.4px] uppercase text-ink-2"
      >
        {metric.description}
      </div>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-auto"
        role="img"
        aria-label={`Pitch arsenal bubble chart — ${metric.description}`}
      >
        {packed.map((n) => (
          <PackedBubble key={n.row.pitch_type_code} node={n} />
        ))}
      </svg>
    </div>
  );
}

/** Single packed bubble. CSS transitions on `r`/`cx`/`cy` animate between
 *  metrics smoothly — re-running d3.pack on metric change yields new
 *  coordinates, and the browser interpolates the change without us
 *  managing transitions explicitly. */
function PackedBubble({ node }: { node: PackedNode }) {
  const color = pitchColor(node.row.pitch_type_code);
  // Show the code label only when the bubble is large enough to read it
  // without clipping. Threshold tuned empirically against the viewBox; at
  // r < 11 the two-letter code overflows. Smaller bubbles still get the
  // color cue and the legend table picks up the slack.
  const showLabel = node.r >= 11;
  return (
    <g style={{ transition: "transform 300ms ease-out" }} transform={`translate(${node.x}, ${node.y})`}>
      <circle
        r={node.r}
        fill={color}
        style={{ transition: "r 300ms ease-out" }}
      />
      {showLabel && (
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fill="white"
          fontWeight={700}
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          fontSize={Math.min(node.r * 0.7, 16)}
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          {node.row.pitch_type_code}
        </text>
      )}
    </g>
  );
}

/* ── Legend table ─────────────────────────────────────────────── */

function LegendTable({
  rows,
  metricKey,
  season,
}: {
  rows: PitcherArsenalRow[];
  metricKey: MetricKey;
  season: number;
}) {
  const metric = getMetric(metricKey);
  // Sort rows by the active metric's magnitude, descending — so the
  // viewer can read top-to-bottom in the same visual order as biggest-
  // to-smallest bubble.
  const sorted = useMemo(() => {
    return [...rows].sort(
      (a, b) =>
        metric.toMagnitude(metric.pitcherValue(b)) -
        metric.toMagnitude(metric.pitcherValue(a)),
    );
  }, [rows, metric]);

  return (
    <div className="bg-surface border border-line rounded-[14px] overflow-hidden">
      <div className="flex items-baseline gap-2 px-3.5 md:px-4 py-3 border-b border-line-2">
        <div className="font-ui text-[11px] font-bold tracking-[1.4px] uppercase text-ink-2">
          Arsenal
        </div>
        <div className="flex-1" />
        <div className="font-mono text-[11px] text-ink-3">{season}</div>
      </div>
      {sorted.map((r, i) => (
        <div
          key={r.pitch_type_code}
          data-cy="pitch-arsenal-row"
          className={`grid items-center gap-3 px-3.5 md:px-4 py-2.5 ${i === sorted.length - 1 ? "" : "border-b border-line-2"
            }`}
          style={{ gridTemplateColumns: "20px 36px 1fr auto" }}
        >
          <span
            className="w-3 h-3 rounded-full inline-block"
            style={{ background: pitchColor(r.pitch_type_code) }}
            aria-hidden
          />
          <span className="font-mono text-[12px] font-bold text-ink-2 tracking-[0.4px]">
            {r.pitch_type_code}
          </span>
          <span className="font-head text-[13px] text-ink">
            {pitchName(r.pitch_type_code)}
          </span>
          <span className="font-mono text-[13px] font-semibold text-ink tracking-[-0.2px]">
            {formatValue(metric, metric.pitcherValue(r))}
          </span>
        </div>
      ))}
    </div>
  );
}
