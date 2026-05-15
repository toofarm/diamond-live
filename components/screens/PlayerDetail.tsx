"use client";

import { useMemo, useState } from "react";
import { useApi } from "@/lib/mlb/client";
import type {
  ActivePlayersData,
  PlayerDetailData,
  PlayerGameLogRow,
  PlayerHistoryData,
  PlayerSplitRow,
  StatMode,
} from "@/lib/mlb/types";
import { TEAMS, type Team } from "@/lib/mlb/teams";
import { BackChevron, Loader, TeamBadge } from "@/components/ui/primitives";
import { ComparePicker, type CompareItem } from "@/components/ui/ComparePicker";
import { currentSeason } from "@/lib/date";
import { useTitle } from "@/lib/title";
import { useCompareParam } from "@/lib/mlb/useCompareParam";
import { pickWinner } from "@/lib/mlb/statDirection";

type SubTab = "season" | "splits" | "gamelog" | "history";

const TABS: { id: SubTab; label: string }[] = [
  { id: "season", label: `${currentSeason()} Season` },
  { id: "splits", label: "Splits" },
  { id: "gamelog", label: "Gamelog" },
  { id: "history", label: "History" },
];

/** Headline stat tiles shown above the detailed tables. */
const HITTING_HEADLINE: [string, string][] = [
  ["avg", "AVG"],
  ["homeRuns", "HR"],
  ["rbi", "RBI"],
  ["ops", "OPS"],
];

const PITCHING_HEADLINE: [string, string][] = [
  ["era", "ERA"],
  ["wins", "W"],
  ["saves", "SV"],
  ["strikeOuts", "K"],
];

interface StatGroup {
  title: string;
  rows: [string, string][]; // [key, label]
}

const HITTING_GROUPS: StatGroup[] = [
  {
    title: "Slash Line",
    rows: [
      ["avg", "Average"],
      ["obp", "On-base %"],
      ["slg", "Slugging"],
      ["ops", "OPS"],
    ],
  },
  {
    title: "Production",
    rows: [
      ["gamesPlayed", "Games"],
      ["atBats", "At bats"],
      ["hits", "Hits"],
      ["doubles", "Doubles"],
      ["triples", "Triples"],
      ["homeRuns", "Home runs"],
      ["runs", "Runs"],
      ["rbi", "RBI"],
    ],
  },
  {
    title: "Discipline",
    rows: [
      ["baseOnBalls", "Walks"],
      ["strikeOuts", "Strikeouts"],
      ["stolenBases", "Stolen bases"],
    ],
  },
];

const PITCHING_GROUPS: StatGroup[] = [
  {
    title: "Rates",
    rows: [
      ["era", "ERA"],
      ["whip", "WHIP"],
      ["strikeoutsPer9Inn", "K/9"],
      ["walksPer9Inn", "BB/9"],
    ],
  },
  {
    title: "Decisions",
    rows: [
      ["wins", "Wins"],
      ["losses", "Losses"],
      ["saves", "Saves"],
      ["holds", "Holds"],
    ],
  },
  {
    title: "Workload",
    rows: [
      ["gamesPlayed", "Games"],
      ["gamesStarted", "Starts"],
      ["inningsPitched", "Innings"],
      ["strikeOuts", "Strikeouts"],
    ],
  },
];

/** Determine whether a player's sub-tabs should render in pitching mode.
    We prefer their primary position; fall back to whichever stats group is populated. */
function detectMode(data: PlayerDetailData): StatMode {
  const pos = (data.position || "").toUpperCase();
  if (pos === "P" || pos === "SP" || pos === "RP" || pos === "CP") return "pitching";
  // TWP (two-way) defaults to hitting since that's the more visible role for most fans.
  if (pos === "TWP") return "hitting";
  // No position info — infer from data
  if (data.pitching && !data.hitting) return "pitching";
  return "hitting";
}

export function PlayerDetail({
  personId,
  onBack,
  onTeam,
}: {
  personId: number;
  onBack: () => void;
  onTeam: (abbr: string) => void;
}) {
  const { data, loading, error } = useApi<PlayerDetailData>(`/api/mlb/player/${personId}`, { cacheMs: 300_000 });
  const [tab, setTab] = useState<SubTab>("season");
  const team = data?.team ? TEAMS[data.team] : undefined;
  const mode: StatMode = data ? detectMode(data) : "hitting";
  useTitle(data?.fullName);

  return (
    <div data-cy="player-detail" className="absolute inset-0 bg-canvas flex flex-col z-10 overflow-hidden">
      <PlayerHero data={data} team={team} onBack={onBack} onTeam={onTeam} loading={loading} />

      {data && <TabNav tab={tab} setTab={setTab} />}

      <div className="flex-1 overflow-y-auto w-full max-w-200 mx-auto">
        {error && <div className="p-6 text-neg">Failed to load player.</div>}
        {data && tab === "season" && <SeasonTab data={data} />}
        {data && tab === "splits" && <SplitsTab personId={personId} mode={mode} />}
        {data && tab === "gamelog" && <GamelogTab personId={personId} mode={mode} />}
        {data && tab === "history" && <HistoryTab personId={personId} mode={mode} />}
      </div>
    </div>
  );
}

/* ── Hero ─────────────────────────────────────────────────────── */

function PlayerHero({
  data,
  team,
  onBack,
  onTeam,
  loading,
}: {
  data: PlayerDetailData | null;
  team: Team | undefined;
  onBack: () => void;
  onTeam: (abbr: string) => void;
  loading: boolean;
}) {
  const primary = team?.primary ?? "#5C544A";
  const secondary = team?.secondary ?? "#928879";

  // Soft diagonal blend of team primary → secondary → canvas.
  // Hex suffixes are alpha bytes: 40≈25%, 1A≈10%, 0D≈5%.
  const bg = `linear-gradient(160deg, ${primary}40 0%, ${secondary}1A 55%, ${primary}0D 100%)`;

  return (
    <div className="relative overflow-hidden border-b border-line-2" style={{ background: bg }}>
      <div className="relative z-1 px-3.5 md:px-6 pb-4 pt-4">
        <BackChevron onClick={onBack} label="Back" />

        {loading && !data && <Loader />}

        {data && (
          <>
            {data.team && team && (
              <button
                data-cy="player-team-chip"
                onClick={() => onTeam(data.team!)}
                className="mt-2 inline-flex items-center gap-1.5 bg-transparent rounded-full px-3 py-1 cursor-pointer font-ui text-[11px] font-semibold uppercase tracking-[0.4px] text-ink"
                style={{
                  border: `1px solid ${primary}66`,
                  background: `${primary}14`,
                }}
              >
                {team.city} {team.name}
              </button>
            )}

            <h1 className="mt-2 font-head text-[34px] md:text-[40px] font-bold text-ink tracking-[-1px] leading-[1.02]">
              {data.fullName}
            </h1>

            <div className="mt-1.5 font-mono text-[12px] text-ink-2 flex flex-wrap items-center gap-x-2">
              {data.num != null && <span>#{data.num}</span>}
              {data.num != null && <span className="text-ink-3">·</span>}
              {data.position && <span>{data.position}</span>}
              {(data.bats || data.throws) && <span className="text-ink-3">·</span>}
              {(data.bats || data.throws) && (
                <span>{data.bats || "—"}/{data.throws || "—"}</span>
              )}
              {data.age != null && <span className="text-ink-3">·</span>}
              {data.age != null && <span>Age {data.age}</span>}
            </div>
          </>
        )}
      </div>

      {/* Jersey-number watermark on the right */}
      {data?.num != null && (
        <div
          aria-hidden
          className="pointer-events-none absolute right-2 md:right-6 -bottom-2 font-head font-bold leading-none select-none"
          style={{
            fontSize: "clamp(90px, 22vw, 160px)",
            color: primary,
            opacity: 0.30,
            letterSpacing: "-0.06em",
          }}
        >
          {data.num}
        </div>
      )}
    </div>
  );
}

/* ── Tabs ─────────────────────────────────────────────────────── */

function TabNav({ tab, setTab }: { tab: SubTab; setTab: (t: SubTab) => void }) {
  return (
    <div className="bg-surface border-b border-line-2">
      <div className="w-full max-w-200 mx-auto flex overflow-x-auto">
        {TABS.map((t) => {
          const on = tab === t.id;
          return (
            <button
              key={t.id}
              data-cy="sub-tab"
              data-cy-tab={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3.5 md:px-4 py-3 bg-transparent cursor-pointer shrink-0 font-ui text-[13px] transition-colors ${on ? "text-ink font-bold border-b-2 border-accent" : "text-ink-2 font-medium border-b-2 border-transparent hover:text-ink"
                }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Season tab ───────────────────────────────────────────────── */

function SeasonTab({ data }: { data: PlayerDetailData }) {
  const hasHitting = !!data.hitting && Object.keys(data.hitting).length > 0;
  const hasPitching = !!data.pitching && Object.keys(data.pitching).length > 0;

  const headline: [string, string][] = hasPitching && !hasHitting
    ? PITCHING_HEADLINE
    : HITTING_HEADLINE;
  const headlineStats = hasPitching && !hasHitting ? data.pitching : data.hitting;

  // Comparison state. Self-compare collapses to "no comparison."
  const { compareId, setCompare, clearCompare } = useCompareParam();
  const compareOtherId =
    compareId && compareId !== String(data.id) ? compareId : null;
  const [query, setQuery] = useState("");
  const mode: StatMode = detectMode(data);

  const { data: directory, loading: directoryLoading } = useApi<ActivePlayersData>(
    "/api/mlb/players",
    { cacheMs: 3_600_000 },
  );
  const { data: compareData, fetching: compareFetching } = useApi<PlayerDetailData>(
    compareOtherId ? `/api/mlb/player/${compareOtherId}` : null,
    { cacheMs: 300_000 },
  );

  const items: CompareItem[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = directory?.players ?? [];
    return all
      .filter((p) => p.mode === mode && p.id !== data.id)
      .filter((p) => !q || p.fullName.toLowerCase().includes(q))
      .slice(0, 50)
      .map((p) => ({
        id: String(p.id),
        label: p.fullName,
        sublabel: `${p.team ?? "FA"} · ${p.position}`,
      }));
  }, [directory, query, mode, data.id]);

  const selectedPlayer = compareOtherId
    ? directory?.players.find((p) => String(p.id) === compareOtherId)
    : undefined;
  const selectedLabel = selectedPlayer?.fullName
    ?? compareData?.fullName
    ?? (compareOtherId ? "Loading…" : undefined);
  // Short compare-column header — use last word of name to fit a narrow column.
  const compareLabel = compareOtherId
    ? (compareData?.fullName ?? selectedPlayer?.fullName ?? "Compare")
        .trim()
        .split(/\s+/)
        .slice(-1)[0]
    : undefined;
  const compareLoading = !!compareOtherId && compareFetching && !compareData;

  return (
    <div className="px-3.5 md:px-6 pt-3.5 pb-20">
      {/* Headline tile row */}
      {headlineStats && (
        <div className="grid grid-cols-4 gap-2">
          {headline.map(([key, label]) => (
            <HeadlineTile key={key} label={label} value={headlineStats[key]} />
          ))}
        </div>
      )}

      <div className="mt-3.5">
        <ComparePicker
          items={items}
          query={query}
          onQueryChange={setQuery}
          selectedId={compareOtherId}
          selectedLabel={selectedLabel}
          onSelect={(id) => {
            setCompare(id);
            setQuery("");
          }}
          onClear={() => {
            clearCompare();
            setQuery("");
          }}
          placeholder={`Compare to another ${mode === "pitching" ? "pitcher" : "hitter"}…`}
          loading={directoryLoading && !directory}
        />
      </div>

      {hasHitting && data.hitting && (
        <StatSection title="Batting" subtitle={`${currentSeason()} Season`}>
          {HITTING_GROUPS.map((g) => (
            <StatGroupBlock
              key={g.title}
              group={g}
              stats={data.hitting!}
              compareStats={compareData?.hitting}
              primaryLabel={data.fullName.trim().split(/\s+/).slice(-1)[0]}
              compareLabel={compareLabel}
              compareLoading={compareLoading}
              mode="batting"
            />
          ))}
        </StatSection>
      )}

      {hasPitching && data.pitching && (
        <StatSection title="Pitching" subtitle={`${currentSeason()} Season`}>
          {PITCHING_GROUPS.map((g) => (
            <StatGroupBlock
              key={g.title}
              group={g}
              stats={data.pitching!}
              compareStats={compareData?.pitching}
              primaryLabel={data.fullName.trim().split(/\s+/).slice(-1)[0]}
              compareLabel={compareLabel}
              compareLoading={compareLoading}
              mode="pitching"
            />
          ))}
        </StatSection>
      )}

      {!hasHitting && !hasPitching && (
        <div className="mt-6 p-6 text-center text-ink-3 bg-surface border border-line rounded-[14px]">
          No season stats available for this player yet.
        </div>
      )}
    </div>
  );
}

function HeadlineTile({ label, value }: { label: string; value: string | number | undefined }) {
  return (
    <div data-cy="headline-tile" className="bg-surface border border-line rounded-[10px] px-2 pt-2 pb-2.5 text-center">
      <div className="text-[10px] font-bold tracking-[1.2px] uppercase text-accent">{label}</div>
      <div className="mt-1 font-head text-[22px] md:text-[24px] font-bold text-ink tracking-[-0.5px]">
        <StatValue value={value} />
      </div>
    </div>
  );
}

function StatSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5 bg-surface border border-line rounded-[14px] overflow-hidden">
      <div className="flex items-baseline gap-2 px-3.5 md:px-4 py-3 border-b border-line-2">
        <div className="font-ui text-[11px] font-bold tracking-[1.4px] uppercase text-ink">{title}</div>
        <div className="flex-1" />
        <div className="font-mono text-[11px] text-ink-3 tracking-[0.4px]">{subtitle}</div>
      </div>
      {children}
    </div>
  );
}

function StatGroupBlock({
  group,
  stats,
  compareStats,
  primaryLabel,
  compareLabel,
  compareLoading,
  mode,
}: {
  group: StatGroup;
  stats: Record<string, string | number>;
  compareStats?: Record<string, string | number>;
  primaryLabel?: string;
  compareLabel?: string;
  compareLoading?: boolean;
  mode: "batting" | "pitching";
}) {
  const rows = group.rows.filter(
    ([k]) => stats[k] !== undefined && stats[k] !== "" && stats[k] !== null,
  );
  if (rows.length === 0) return null;
  const comparing = !!compareLabel;
  const cols = comparing ? "1fr 72px 72px" : "1fr auto";
  return (
    <div className="border-b border-line-2 last:border-b-0">
      <div className="px-3.5 md:px-4 pt-3 pb-1.5">
        {comparing ? (
          <div
            className="grid items-baseline"
            style={{ gridTemplateColumns: cols }}
          >
            <div className="font-ui text-[10px] font-bold tracking-[1.2px] uppercase text-ink-3">
              {group.title}
            </div>
            <div className="font-mono text-[10px] font-bold tracking-[0.8px] uppercase text-ink-3 text-right truncate">
              {primaryLabel}
            </div>
            <div className="font-mono text-[10px] font-bold tracking-[0.8px] uppercase text-ink-3 text-right truncate">
              {compareLabel}
            </div>
          </div>
        ) : (
          <div className="font-ui text-[10px] font-bold tracking-[1.2px] uppercase text-ink-3">
            {group.title}
          </div>
        )}
      </div>
      {rows.map(([key, label], i) => {
        const compareVal = compareStats?.[key];
        const winner = comparing ? pickWinner(key, stats[key], compareVal, mode) : null;
        const primaryCls = `font-mono text-[14px] tracking-[-0.2px] text-right ${winner === "a" ? "font-bold text-accent" : "font-semibold text-ink"
          }`;
        const compareCls = `font-mono text-[14px] tracking-[-0.2px] text-right ${winner === "b" ? "font-bold text-accent" : "font-semibold text-ink"
          }`;
        return (
          <div
            key={key}
            className={`grid items-center px-3.5 md:px-4 py-2.5 ${i === rows.length - 1 ? "" : "border-b border-line-2"
              }`}
            style={{ gridTemplateColumns: cols }}
          >
            <div className="font-ui text-[13px] text-ink">{label}</div>
            <div data-cy={comparing ? "stat-primary-value" : undefined} className={primaryCls}>
              <StatValue value={stats[key]} />
            </div>
            {comparing && (
              <div data-cy="stat-compare-value" className={compareCls}>
                {compareLoading ? <>—</> : <StatValue value={compareVal} />}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Stat value with the leading "." accented in red — matches the design's
    typographic treatment for sub-1.000 stats (AVG/OBP/SLG/OPS/ERA, etc.). */
function StatValue({ value }: { value: string | number | undefined }) {
  if (value === undefined || value === null || value === "") return <>—</>;
  const s = String(value);
  if (s.startsWith(".")) {
    return (
      <>
        <span className="text-accent">.</span>
        {s.slice(1)}
      </>
    );
  }
  return <>{s}</>;
}

/* ── Splits tab ───────────────────────────────────────────────── */

function SplitsTab({ personId, mode }: { personId: number; mode: StatMode }) {
  const { data, loading, error } = useApi<{ season: number; mode: StatMode; splits: PlayerSplitRow[] }>(
    `/api/mlb/player/${personId}/splits?group=${mode}`,
    { cacheMs: 300_000 },
  );
  const rows = data?.splits ?? [];
  const colA = mode === "pitching" ? "ERA" : "AVG";
  const colB = mode === "pitching" ? "WHIP" : "OPS";
  const valA = (r: PlayerSplitRow) => (mode === "pitching" ? r.era : r.avg);
  const valB = (r: PlayerSplitRow) => (mode === "pitching" ? r.whip : r.ops);

  return (
    <div className="px-3.5 md:px-6 pt-3.5 pb-20">
      {loading && <Loader />}
      {error && <div className="p-6 text-neg">Failed to load splits.</div>}
      {!loading && rows.length === 0 && !error && (
        <div className="p-6 text-center text-ink-3 bg-surface border border-line rounded-[14px]">
          No splits available for this season yet.
        </div>
      )}
      {rows.length > 0 && (
        <div className="bg-surface border border-line rounded-[14px] relative">
          <div
            className="grid items-center px-3.5 md:px-4 py-3 font-ui text-[10px] font-bold tracking-[1.2px] uppercase text-ink-3 border-b border-line-2
            md:relative sticky top-0 bg-surface z-5000"
            style={{ gridTemplateColumns: "1fr 60px 60px" }}
          >
            <div className="bg-surface">Split</div>
            <div className="text-right bg-surface">{colA}</div>
            <div className="text-right bg-surface">{colB}</div>
          </div>
          {rows.map((r, i) => (
            <div
              key={r.code}
              data-cy="splits-row"
              className={`grid items-center px-3.5 md:px-4 py-3 ${i === rows.length - 1 ? "" : "border-b border-line-2"
                }`}
              style={{ gridTemplateColumns: "1fr 60px 60px" }}
            >
              <div className="font-ui text-[13px] text-ink">{r.label}</div>
              <div className="font-mono text-[14px] font-semibold text-ink text-right">
                <StatValue value={valA(r)} />
              </div>
              <div className="font-mono text-[14px] font-semibold text-ink text-right">
                <StatValue value={valB(r)} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Gamelog tab ──────────────────────────────────────────────── */

function GamelogTab({ personId, mode }: { personId: number; mode: StatMode }) {
  const { data, loading, error } = useApi<{ season: number; mode: StatMode; games: PlayerGameLogRow[] }>(
    `/api/mlb/player/${personId}/gamelog?group=${mode}`,
    { cacheMs: 300_000 },
  );
  const rows = data?.games ?? [];

  const fmtDate = (iso: string) => {
    const [, m, d] = iso.split("-").map(Number);
    return `${m}/${d}`;
  };

  // Hitter: DATE | OPP | H/AB | H | HR | RBI
  // Pitcher: DATE | OPP | IP | H | ER | K | BB
  const hitterCols = "48px 48px 1fr 36px 36px 36px";
  const pitcherCols = "48px 48px 56px 36px 36px 36px 36px";

  return (
    <div className="px-3.5 md:px-6 pt-3.5 pb-20">
      {loading && <Loader />}
      {error && <div className="p-6 text-neg">Failed to load gamelog.</div>}
      {!loading && rows.length === 0 && !error && (
        <div className="p-6 text-center text-ink-3 bg-surface border border-line rounded-[14px]">
          No games yet for this season.
        </div>
      )}
      {rows.length > 0 && (
        <div className="bg-surface border border-line rounded-[14px] relative">
          {mode === "pitching" ? (
            <>
              <div
                className="grid items-center px-3.5 md:px-4 py-3 font-ui text-[10px] font-bold tracking-[1.2px] uppercase text-ink-3 border-b border-line-2
                md:relative sticky top-0 bg-surface z-5000"
                style={{ gridTemplateColumns: pitcherCols }}
              >
                <div className="bg-surface">Date</div>
                <div className="bg-surface">Opp</div>
                <div className="bg-surface">IP</div>
                <div className="text-right bg-surface">H</div>
                <div className="text-right bg-surface">ER</div>
                <div className="text-right bg-surface">K</div>
                <div className="text-right bg-surface">BB</div>
              </div>
              {rows.map((g, i) => (
                <div
                  key={g.date}
                  data-cy="gamelog-row"
                  className={`grid items-center px-3.5 md:px-4 py-3 ${i === rows.length - 1 ? "" : "border-b border-line-2"
                    }`}
                  style={{ gridTemplateColumns: pitcherCols }}
                >
                  <div className="font-mono text-[12px] text-ink">{fmtDate(g.date)}</div>
                  <div>{g.opp ? <TeamBadge abbr={g.opp} size={22} /> : <span className="text-ink-3 text-xs">—</span>}</div>
                  <div className="font-mono text-[13px] text-ink font-semibold">{g.ip ?? "—"}</div>
                  <div className={`font-mono text-[13px] text-right ${(g.h ?? 0) > 0 ? "text-ink" : "text-ink-3"}`}>{g.h ?? 0}</div>
                  <div className={`font-mono text-[13px] text-right ${(g.er ?? 0) > 0 ? "text-neg font-semibold" : "text-ink-3"}`}>{g.er ?? 0}</div>
                  <div className={`font-mono text-[13px] text-right ${(g.k ?? 0) > 0 ? "text-ink font-semibold" : "text-ink-3"}`}>{g.k ?? 0}</div>
                  <div className={`font-mono text-[13px] text-right ${(g.bb ?? 0) > 0 ? "text-ink" : "text-ink-3"}`}>{g.bb ?? 0}</div>
                </div>
              ))}
            </>
          ) : (
            <>
              <div
                className="grid items-center px-3.5 md:px-4 py-3 font-ui text-[10px] font-bold tracking-[1.2px] uppercase text-ink-3 border-b border-line-2
                md:relative sticky top-0 bg-surface z-5000"
                style={{ gridTemplateColumns: hitterCols }}
              >
                <div className="bg-surface">Date</div>
                <div className="bg-surface">Opp</div>
                <div className="bg-surface">H/AB</div>
                <div className="text-right bg-surface">H</div>
                <div className="text-right bg-surface">HR</div>
                <div className="text-right bg-surface">RBI</div>
              </div>
              {rows.map((g, i) => (
                <div
                  key={g.date}
                  data-cy="gamelog-row"
                  className={`grid items-center px-3.5 md:px-4 py-3 ${i === rows.length - 1 ? "" : "border-b border-line-2"
                    }`}
                  style={{ gridTemplateColumns: hitterCols }}
                >
                  <div className="font-mono text-[12px] text-ink">{fmtDate(g.date)}</div>
                  <div>{g.opp ? <TeamBadge abbr={g.opp} size={22} /> : <span className="text-ink-3 text-xs">—</span>}</div>
                  <div className="font-mono text-[13px] text-ink">{g.h ?? 0}-{g.ab ?? 0}</div>
                  <div className={`font-mono text-[13px] text-right ${(g.h ?? 0) > 0 ? "text-ink font-semibold" : "text-ink-3"}`}>{g.h ?? 0}</div>
                  <div className={`font-mono text-[13px] text-right ${(g.hr ?? 0) > 0 ? "text-accent font-bold" : "text-ink-3"}`}>{g.hr ?? 0}</div>
                  <div className={`font-mono text-[13px] text-right ${(g.rbi ?? 0) > 0 ? "text-ink font-semibold" : "text-ink-3"}`}>{g.rbi ?? 0}</div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── History tab ──────────────────────────────────────────────── */

function HistoryTab({ personId, mode }: { personId: number; mode: StatMode }) {
  const { data, loading, error } = useApi<PlayerHistoryData>(
    `/api/mlb/player/${personId}/history?group=${mode}`,
    { cacheMs: 300_000 },
  );

  if (loading) return <Loader />;
  if (error) return <div className="p-6 text-neg">Failed to load history.</div>;
  if (!data) return null;

  const { years, career, highlights } = data;

  // Headline career tiles
  const tiles = mode === "pitching"
    ? [
      { label: "W", value: career.w },
      { label: "ERA", value: career.era },
      { label: "K", value: career.k },
      { label: "WHIP", value: career.whip },
    ]
    : [
      { label: "HR", value: career.hr },
      { label: "RBI", value: career.rbi },
      { label: "AVG", value: career.avg },
      { label: "OPS", value: career.ops },
    ];

  // Hitter layout: all six stat columns share evenly. Pitcher layout: W is
  // a single-digit value most of the time, so we fix it at 40px (matching the
  // Tm column) — that frees the remaining five 1fr columns to widen, giving
  // ERA, IP, K, and WHIP enough room to not visually collide with neighbors.
  const hitterCols = "48px 40px 1fr 1fr 1fr 1fr 1fr 1fr";
  const pitcherCols = "48px 25px 25px 25px 1fr 1fr 1fr 1fr";

  return (
    <div className="px-3.5 md:px-6 pt-3.5 pb-20 flex flex-col gap-3.5">
      {/* Career header + summary tiles */}
      <div className="bg-surface border border-line rounded-[14px] overflow-hidden">
        <div className="flex items-baseline gap-2 px-3.5 md:px-4 py-3 border-b border-line-2">
          <div className="font-ui text-[11px] font-bold tracking-[1.4px] uppercase text-ink">
            Career · {career.seasons} season{career.seasons === 1 ? "" : "s"}
          </div>
          <div className="flex-1" />
          <div className="font-mono text-[11px] text-ink-3">{career.yearRange ?? "—"}</div>
        </div>
        <div className="grid grid-cols-4 gap-px bg-line-2">
          {tiles.map((t) => <CareerTile key={t.label} label={t.label} value={t.value} />)}
        </div>
      </div>

      {/* Year-by-year + career totals row */}
      {years.length > 0 && (
        <div className="bg-surface border border-line rounded-[14px] relative">
          {mode === "pitching" ? (
            <>
              <div
                className="grid items-center px-3.5 md:px-4 py-2.5 font-ui text-[10px] font-bold tracking-[1.2px] uppercase text-ink-3 border-b border-line-2 gap-2
                md:relative sticky top-0 bg-surface z-5000"
                style={{ gridTemplateColumns: pitcherCols }}
              >
                <div className="bg-surface">Year</div>
                <div className="bg-surface">Tm</div>
                <div className="text-right bg-surface">W</div>
                <div className="text-right bg-surface">L</div>
                <div className="text-right bg-surface">ERA</div>
                <div className="text-right bg-surface">IP</div>
                <div className="text-right bg-surface">K</div>
                <div className="text-right bg-surface">WHIP</div>
              </div>
              {years.map((y) => (
                <div
                  key={`${y.year}-${y.team}`}
                  data-cy="history-year"
                  className="grid items-center px-3.5 md:px-4 py-2.5 border-b border-line-2 gap-2"
                  style={{ gridTemplateColumns: pitcherCols }}
                >
                  <div className="font-mono text-[13px] text-ink">{y.year}</div>
                  <div>{y.team ? <TeamBadge abbr={y.team} size={22} /> : <span className="text-ink-3 text-xs">—</span>}</div>
                  <div className="font-mono text-[13px] text-ink text-right">{y.w ?? 0}</div>
                  <div className="font-mono text-[13px] text-ink text-right">{y.l ?? 0}</div>
                  <div className="font-mono text-[13px] text-ink text-right"><StatValue value={y.era} /></div>
                  <div className="font-mono text-[13px] text-ink text-right">{y.ip ?? "—"}</div>
                  <div className="font-mono text-[13px] text-ink text-right">{y.k ?? 0}</div>
                  <div className="font-mono text-[13px] text-ink text-right"><StatValue value={y.whip} /></div>
                </div>
              ))}
              <div
                className="grid items-center px-3.5 md:px-4 py-3 bg-chip gap-2 rounded-b-[14px]"
                style={{ gridTemplateColumns: pitcherCols }}
              >
                <div className="font-ui text-[11px] font-bold tracking-[1px] uppercase text-ink">Career</div>
                <div />
                <div className="font-mono text-[13px] font-bold text-ink text-right">{career.w ?? 0}</div>
                <div className="font-mono text-[13px] font-bold text-ink text-right">{career.l ?? 0}</div>
                <div className="font-mono text-[13px] font-bold text-ink text-right"><StatValue value={career.era} /></div>
                <div className="font-mono text-[13px] font-bold text-ink text-right">{career.ip ?? "—"}</div>
                <div className="font-mono text-[13px] font-bold text-ink text-right">{career.k ?? 0}</div>
                <div className="font-mono text-[13px] font-bold text-ink text-right"><StatValue value={career.whip} /></div>
              </div>
            </>
          ) : (
            <>
              <div
                className="grid items-center px-3.5 md:px-4 py-2.5 font-ui text-[10px] font-bold tracking-[1.2px] uppercase text-ink-3 border-b border-line-2
                md:relative sticky top-0 bg-surface z-5000"
                style={{ gridTemplateColumns: hitterCols }}
              >
                <div className="bg-surface">Year</div>
                <div className="bg-surface">Tm</div>
                <div className="text-right bg-surface">G</div>
                <div className="text-right bg-surface">AB</div>
                <div className="text-right bg-surface">HR</div>
                <div className="text-right bg-surface">RBI</div>
                <div className="text-right bg-surface">AVG</div>
                <div className="text-right bg-surface">OPS</div>
              </div>
              {years.map((y) => (
                <div
                  key={`${y.year}-${y.team}`}
                  data-cy="history-year"
                  className="grid items-center px-3.5 md:px-4 py-2.5 border-b border-line-2"
                  style={{ gridTemplateColumns: hitterCols }}
                >
                  <div className="font-mono text-[13px] text-ink">{y.year}</div>
                  <div>{y.team ? <TeamBadge abbr={y.team} size={22} /> : <span className="text-ink-3 text-xs">—</span>}</div>
                  <div className="font-mono text-[13px] text-ink text-right">{y.g}</div>
                  <div className="font-mono text-[13px] text-ink text-right">{y.ab ?? 0}</div>
                  <div className="font-mono text-[13px] text-ink text-right">{y.hr ?? 0}</div>
                  <div className="font-mono text-[13px] text-ink text-right">{y.rbi ?? 0}</div>
                  <div className="font-mono text-[13px] text-ink text-right"><StatValue value={y.avg} /></div>
                  <div className="font-mono text-[13px] text-ink text-right"><StatValue value={y.ops} /></div>
                </div>
              ))}
              <div
                className="grid items-center px-3.5 md:px-4 py-3 bg-chip rounded-b-[14px]"
                style={{ gridTemplateColumns: hitterCols }}
              >
                <div className="font-ui text-[11px] font-bold tracking-[1px] uppercase text-ink">Career</div>
                <div />
                <div className="font-mono text-[13px] font-bold text-ink text-right">{career.g}</div>
                <div className="font-mono text-[13px] font-bold text-ink text-right">{career.ab ?? 0}</div>
                <div className="font-mono text-[13px] font-bold text-ink text-right">{career.hr ?? 0}</div>
                <div className="font-mono text-[13px] font-bold text-ink text-right">{career.rbi ?? 0}</div>
                <div className="font-mono text-[13px] font-bold text-ink text-right"><StatValue value={career.avg} /></div>
                <div className="font-mono text-[13px] font-bold text-ink text-right"><StatValue value={career.ops} /></div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Career highlights */}
      {highlights.length > 0 && (
        <div className="bg-surface border border-line rounded-[14px] overflow-hidden">
          <div className="px-3.5 md:px-4 py-3 border-b border-line-2">
            <div className="font-ui text-[11px] font-bold tracking-[1.4px] uppercase text-ink">Career Highlights</div>
          </div>
          {highlights.map((h, i) => (
            <div
              key={h.name}
              className={`flex items-center gap-3 px-3.5 md:px-4 py-3 ${i === highlights.length - 1 ? "" : "border-b border-line-2"
                }`}
            >
              <div className="w-11 h-11 rounded-full bg-chip flex items-center justify-center font-mono text-[13px] font-bold text-accent shrink-0">
                {h.count}×
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-head text-[15px] font-bold text-ink tracking-[-0.2px]">{h.name}</div>
                <div className="font-mono text-[11px] text-ink-3 mt-0.5">Most recent: {h.mostRecentYear}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CareerTile({ label, value }: { label: string; value: string | number | undefined }) {
  return (
    <div className="bg-surface px-3 py-3 text-center">
      <div className="text-[10px] font-bold tracking-[1.2px] uppercase text-ink-3">{label}</div>
      <div className="mt-1 font-head text-[20px] font-bold text-ink tracking-[-0.4px]">
        <StatValue value={value} />
      </div>
    </div>
  );
}
