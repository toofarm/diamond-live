"use client";

import { useMemo, useState } from "react";
import { useApi } from "@/lib/mlb/client";
import type {
  PersonnelData,
  PersonnelRow,
  RosterRow,
  TeamDetailData,
  TeamLastGame,
  TeamSeasonData,
  TeamSeasonStats,
} from "@/lib/mlb/types";
import { TEAMS } from "@/lib/mlb/teams";
import { BackChevron, Loader, TeamBadge } from "@/components/ui/primitives";
import { ComparePicker, type CompareItem } from "@/components/ui/ComparePicker";
import { currentSeason, formatDateLabel } from "@/lib/date";
import { useTitle } from "@/lib/title";
import { useCompareParam } from "@/lib/mlb/useCompareParam";
import { pickWinner } from "@/lib/mlb/statDirection";
import { sendToDataLayer, events } from "@/lib/analytics";

type SubTab = "season" | "roster" | "injuries" | "personnel";

const GROUP_LABEL: Record<string, string> = {
  pitchers: "Pitchers",
  catchers: "Catchers",
  infielders: "Infielders",
  outfielders: "Outfielders",
  designated_hitter: "Designated Hitter",
};

const GROUP_ORDER: (keyof typeof GROUP_LABEL)[] = [
  "pitchers",
  "catchers",
  "infielders",
  "outfielders",
  "designated_hitter",
];

interface TeamDetailProps {
  teamAbbr: string;
  onBack: () => void;
  onPlayer: (id: number) => void;
  onGame: (id: number) => void;
}

export function TeamDetail({ teamAbbr, onBack, onPlayer, onGame }: TeamDetailProps) {
  const t = TEAMS[teamAbbr];
  useTitle(t ? `${t.city} ${t.name}` : teamAbbr);
  const [tab, setTab] = useState<SubTab>("season");
  // User-initiated tab change → TAB_NAVIGATION with the destination id. The
  // tab id is more stable for analytics than the rendered label (which
  // includes the live season number for the season tab).
  const handleTabChange = (next: SubTab) => {
    if (next === tab) return;
    sendToDataLayer({ event: events.TAB_NAVIGATION, target: next });
    setTab(next);
  };

  const TABS: { id: SubTab; label: string }[] = [
    { id: "season",    label: `${currentSeason()} Season` },
    { id: "roster",    label: "Roster" },
    { id: "injuries",  label: "Injuries" },
    { id: "personnel", label: "Personnel" },
  ];

  return (
    <div data-cy="team-detail" className="absolute inset-0 bg-canvas flex flex-col z-10 overflow-hidden">
      <div className="px-3.5 md:px-6 pb-3 bg-surface border-b border-line-2 pt-4">
        <BackChevron onClick={onBack} label="Back" />
        <div className="mt-3.5 flex items-center gap-3.5">
          <TeamBadge abbr={teamAbbr} size={56} />
          <div>
            <div className="text-xs text-ink-3 tracking-[0.6px]">{t?.city}</div>
            <div className="font-head text-[26px] font-bold text-ink tracking-[-0.6px] leading-tight">
              {t?.name ?? teamAbbr}
            </div>
            <div className="text-[11px] text-ink-3 font-mono mt-1">
              {t?.div} · {t?.league}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-surface border-b border-line-2">
        <div className="w-full max-w-[900px] mx-auto flex overflow-x-auto">
          {TABS.map((tt) => {
            const on = tab === tt.id;
            return (
              <button
                key={tt.id}
                data-cy="sub-tab"
                data-cy-tab={tt.id}
                onClick={() => handleTabChange(tt.id)}
                className={`px-3.5 md:px-4 py-3 bg-transparent cursor-pointer shrink-0 font-ui text-[13px] transition-colors ${
                  on
                    ? "text-ink font-bold border-b-2 border-accent"
                    : "text-ink-2 font-medium border-b-2 border-transparent hover:text-ink"
                }`}
              >
                {tt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3.5 md:px-6 pt-3.5 pb-20 w-full max-w-[900px] mx-auto">
        {tab === "season"    && <SeasonTab    abbr={teamAbbr} onGame={onGame} />}
        {tab === "roster"    && <RosterTab    abbr={teamAbbr} onPlayer={onPlayer} />}
        {tab === "injuries"  && <InjuriesTab  abbr={teamAbbr} onPlayer={onPlayer} />}
        {tab === "personnel" && <PersonnelTab abbr={teamAbbr} />}
      </div>
    </div>
  );
}

/* ── Season tab ──────────────────────────────────────────────── */

interface StatGroupDef {
  title: string;
  rows: [string, string][]; // [statKey, displayLabel]
}

const TEAM_BATTING_GROUPS: StatGroupDef[] = [
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

const TEAM_PITCHING_GROUPS: StatGroupDef[] = [
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

function SeasonTab({
  abbr,
  onGame,
}: {
  abbr: string;
  onGame: (id: number) => void;
}) {
  const { data, loading, error } = useApi<TeamSeasonData>(
    `/api/mlb/team/${abbr}/season`,
    { cacheMs: 300_000 },
  );

  // Comparison state. Treat self-compare as "no comparison" — don't fire a
  // duplicate season fetch and don't render the third column.
  const { compareId, setCompare, clearCompare } = useCompareParam();
  const compareAbbr = compareId && compareId !== abbr ? compareId : null;
  const [query, setQuery] = useState("");

  const { data: compareData, fetching: compareFetching } = useApi<TeamSeasonData>(
    compareAbbr ? `/api/mlb/team/${compareAbbr}/season` : null,
    { cacheMs: 300_000 },
  );

  const items: CompareItem[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.values(TEAMS)
      .filter((t) => t.abbr !== abbr)
      .filter(
        (t) =>
          !q ||
          `${t.city} ${t.name}`.toLowerCase().includes(q) ||
          t.abbr.toLowerCase().includes(q),
      )
      .map((t) => ({
        id: t.abbr,
        label: `${t.city} ${t.name}`,
        sublabel: t.div,
        badge: <TeamBadge abbr={t.abbr} size={20} />,
      }));
  }, [abbr, query]);

  const selectedTeam = compareAbbr ? TEAMS[compareAbbr] : undefined;
  const selectedLabel = selectedTeam
    ? `${selectedTeam.city} ${selectedTeam.name}`
    : compareAbbr ?? undefined;
  const compareLabel = compareAbbr ?? undefined;
  const compareLoading = !!compareAbbr && compareFetching && !compareData;

  if (loading && !data) return <Loader />;
  if (error) return <div className="p-6 text-neg">Failed to load season data.</div>;
  if (!data) return null;

  return (
    <div data-cy="season-tab" className="flex flex-col gap-3.5">
      <RecordCard record={data.record} />
      <LastGamesTable games={data.lastGames} onGame={onGame} />
      <ComparePicker
        items={items}
        query={query}
        onQueryChange={setQuery}
        selectedId={compareAbbr}
        selectedLabel={selectedLabel}
        onSelect={(id) => {
          // Use abbrs for both basis and comparison — they're the canonical
          // identifier for teams in this app and unambiguous in dashboards.
          sendToDataLayer({
            event: events.TEAM_COMPARISON,
            meta: { basis: abbr, comparison: id },
          });
          setCompare(id);
          setQuery("");
        }}
        onClear={() => {
          clearCompare();
          setQuery("");
        }}
        placeholder="Compare to another team…"
      />
      <StatSection title="Team Batting" subtitle={`${currentSeason()} Season`}>
        {TEAM_BATTING_GROUPS.map((g) => (
          <StatGroupBlock
            key={g.title}
            group={g}
            stats={data.stats.batting}
            compareStats={compareData?.stats.batting}
            primaryLabel={abbr}
            compareLabel={compareLabel}
            compareLoading={compareLoading}
            mode="batting"
          />
        ))}
      </StatSection>
      <StatSection title="Team Pitching" subtitle={`${currentSeason()} Season`}>
        {TEAM_PITCHING_GROUPS.map((g) => (
          <StatGroupBlock
            key={g.title}
            group={g}
            stats={data.stats.pitching}
            compareStats={compareData?.stats.pitching}
            primaryLabel={abbr}
            compareLabel={compareLabel}
            compareLoading={compareLoading}
            mode="pitching"
          />
        ))}
      </StatSection>
    </div>
  );
}

function RecordCard({ record }: { record: TeamSeasonData["record"] }) {
  return (
    <div data-cy="record-card" className="bg-surface border border-line rounded-[14px] p-4 flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-bold tracking-[1.2px] uppercase text-ink-3">Record</div>
        <div className="mt-0.5 font-head text-[32px] font-bold text-ink tracking-[-1px] leading-none">
          <span data-cy="record-wins">{record.w}</span>
          <span className="text-ink-3 mx-1.5">–</span>
          <span data-cy="record-losses">{record.l}</span>
        </div>
        <div className="mt-1 font-mono text-[11px] text-ink-2">
          <StatValue value={record.pct} /> PCT
          {record.streak && <span className="text-ink-3"> · {record.streak}</span>}
        </div>
      </div>
      {(record.divRank || record.divName) && (
        <div className="text-right">
          <div className="text-[10px] font-bold tracking-[1.2px] uppercase text-ink-3">Division</div>
          <div className="mt-0.5 font-head text-[20px] font-bold text-ink tracking-[-0.4px] leading-none">
            {record.divRank ? `#${record.divRank}` : "—"}
          </div>
          {record.divName && (
            <div className="mt-1 font-mono text-[11px] text-ink-3">{record.divName}</div>
          )}
        </div>
      )}
    </div>
  );
}

function LastGamesTable({
  games,
  onGame,
}: {
  games: TeamLastGame[];
  onGame: (id: number) => void;
}) {
  const cols = "60px 32px 1fr 60px";
  return (
    <div className="bg-surface border border-line rounded-[14px] overflow-hidden">
      <div className="px-3.5 md:px-4 py-3 border-b border-line-2">
        <div className="font-ui text-[11px] font-bold tracking-[1.4px] uppercase text-ink">
          Last 5 Games
        </div>
      </div>
      {games.length === 0 ? (
        <div className="p-6 text-center text-ink-3 text-[13px]">No recent games.</div>
      ) : (
        <>
          <div
            className="grid items-center gap-2 px-3.5 md:px-4 py-1.5 font-mono text-[10px] font-bold tracking-[1.2px] uppercase text-ink-3 border-b border-line-2"
            style={{ gridTemplateColumns: cols }}
          >
            <div>Date</div>
            <div className="text-center">Res</div>
            <div>Opp</div>
            <div className="text-right">Score</div>
          </div>
          {games.map((g, i) => {
            const { mo, dom } = formatDateLabel(g.dateISO);
            return (
              <button
                key={g.id}
                data-cy="last-game-row"
                data-cy-game-id={g.id}
                onClick={() => onGame(g.id)}
                className={`w-full grid items-center gap-2 px-3.5 md:px-4 py-2.5 bg-transparent border-none cursor-pointer text-left ${
                  i === games.length - 1 ? "" : "border-b border-line-2"
                }`}
                style={{ gridTemplateColumns: cols }}
              >
                <span className="font-mono text-[12px] text-ink-2">
                  {mo} {dom}
                </span>
                <span
                  className={`inline-flex justify-center items-center font-mono text-[11px] font-bold tracking-[0.4px] px-1 rounded-[4px] ${
                    g.result === "W" ? "text-pos" : "text-neg"
                  }`}
                  style={{
                    background: `color-mix(in srgb, var(--color-${g.result === "W" ? "pos" : "neg"}) 10%, transparent)`,
                  }}
                >
                  {g.result}
                </span>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-[11px] text-ink-3">{g.home ? "vs" : "@"}</span>
                  <TeamBadge abbr={g.opp} size={20} />
                  <span className="font-head text-[13px] font-semibold text-ink tracking-[-0.2px]">
                    {g.opp}
                  </span>
                </div>
                <span className="font-mono text-[13px] font-semibold text-ink text-right tracking-[-0.2px]">
                  {g.score.us}–{g.score.them}
                </span>
              </button>
            );
          })}
        </>
      )}
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
    <div className="bg-surface border border-line rounded-[14px] overflow-hidden">
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
  group: StatGroupDef;
  stats: TeamSeasonStats;
  compareStats?: TeamSeasonStats;
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
            <div className="font-mono text-[10px] font-bold tracking-[0.8px] uppercase text-ink-3 text-right">
              {primaryLabel}
            </div>
            <div className="font-mono text-[10px] font-bold tracking-[0.8px] uppercase text-ink-3 text-right">
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
        const primaryCls = `font-mono text-[14px] tracking-[-0.2px] text-right ${
          winner === "a" ? "font-bold text-accent" : "font-semibold text-ink"
        }`;
        const compareCls = `font-mono text-[14px] tracking-[-0.2px] text-right ${
          winner === "b" ? "font-bold text-accent" : "font-semibold text-ink"
        }`;
        return (
          <div
            key={key}
            className={`grid items-center px-3.5 md:px-4 py-2.5 ${
              i === rows.length - 1 ? "" : "border-b border-line-2"
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

/** Stat value with the leading "." accented in red (matches PlayerDetail's StatValue). */
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

/* ── Roster tab ──────────────────────────────────────────────── */

function RosterTab({ abbr, onPlayer }: { abbr: string; onPlayer: (id: number) => void }) {
  const { data, loading, error } = useApi<TeamDetailData>(
    `/api/mlb/team/${abbr}`,
    { cacheMs: 600_000 },
  );

  if (loading && !data) return <Loader />;
  if (error) return <div className="p-6 text-neg">Failed to load roster.</div>;

  const roster = data?.roster ?? [];
  // Active for the roster tab: filter out injured players to match prior behavior
  // pre-IL hydration. Injured players show up exclusively in the Injuries tab.
  const active = roster.filter((r) => !r.injuryStatus);
  const byGroup = active.reduce<Record<string, RosterRow[]>>((acc, r) => {
    (acc[r.group] ||= []).push(r);
    return acc;
  }, {});

  return (
    <div data-cy="roster-tab">
      {GROUP_ORDER.map((g) => {
        const rows = byGroup[g];
        if (!rows?.length) return null;
        return (
          <div key={g} className="mb-4">
            <div className="font-head text-[11px] font-bold tracking-[1.4px] uppercase text-ink-3 px-1 mb-2">
              {GROUP_LABEL[g]}
            </div>
            <div className="bg-surface border border-line rounded-[14px] overflow-hidden">
              {rows.map((r, i) => (
                <button
                  key={r.id}
                  data-cy="roster-row"
                  data-cy-player-id={r.id}
                  onClick={() => onPlayer(r.id)}
                  className={`w-full grid items-center gap-2.5 px-3.5 py-2.5 bg-transparent border-none cursor-pointer text-left font-ui ${
                    i === rows.length - 1 ? "" : "border-b border-line-2"
                  }`}
                  style={{ gridTemplateColumns: "36px 1fr 40px" }}
                >
                  <span className="font-mono text-[11px] font-bold text-ink-3 text-center">
                    {r.num || "—"}
                  </span>
                  <span className="font-head text-sm font-semibold text-ink tracking-[-0.2px]">
                    {r.name}
                  </span>
                  <span className="font-mono text-[11px] text-ink-2 text-right">{r.pos}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Injuries tab ──────────────────────────────────────────── */

function InjuriesTab({ abbr, onPlayer }: { abbr: string; onPlayer: (id: number) => void }) {
  // Intentionally the same URL as RosterTab so opening Roster first warms this
  // tab's cache (and vice versa). useApi serves the cached value synchronously.
  const { data, loading, error } = useApi<TeamDetailData>(
    `/api/mlb/team/${abbr}`,
    { cacheMs: 600_000 },
  );

  if (loading && !data) return <Loader />;
  if (error) return <div className="p-6 text-neg">Failed to load roster.</div>;

  const injured = (data?.roster ?? []).filter((r) => r.injuryStatus);

  if (injured.length === 0) {
    return (
      <div
        data-cy="injuries-empty"
        className="p-6 text-center text-ink-3 bg-surface border border-line rounded-[14px]"
      >
        No reported injuries.
      </div>
    );
  }

  return (
    <div data-cy="injuries-tab" className="bg-surface border border-line rounded-[14px] overflow-hidden">
      <div
        className="grid items-center gap-2 px-3.5 md:px-4 py-1.5 font-mono text-[10px] font-bold tracking-[1.2px] uppercase text-ink-3 border-b border-line-2"
        style={{ gridTemplateColumns: "1.6fr 40px 80px 1.4fr" }}
      >
        <div>Player</div>
        <div className="text-right">Pos</div>
        <div className="text-right">Status</div>
        <div className="text-right">Description</div>
      </div>
      {injured.map((r, i) => {
        const detail = r.injuryStatus?.notes || r.injuryStatus?.description || "";
        return (
          <button
            key={r.id}
            data-cy="injury-row"
            data-cy-player-id={r.id}
            onClick={() => onPlayer(r.id)}
            className={`w-full grid items-center gap-2 px-3.5 md:px-4 py-2.5 bg-transparent border-none cursor-pointer text-left ${
              i === injured.length - 1 ? "" : "border-b border-line-2"
            }`}
            style={{ gridTemplateColumns: "1.6fr 40px 80px 1.4fr" }}
          >
            <span className="font-head text-[13px] font-semibold text-ink tracking-[-0.2px] overflow-hidden text-ellipsis whitespace-nowrap">
              {r.name}
            </span>
            <span className="font-mono text-[11px] text-ink-2 text-right">{r.pos}</span>
            <span className="font-mono text-[10px] font-bold text-neg text-right tracking-[0.4px] uppercase">
              {r.injuryStatus?.code}
            </span>
            <span
              className="font-ui text-[12px] text-ink-2 text-right overflow-hidden text-ellipsis whitespace-nowrap"
              title={detail}
            >
              {detail}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ── Personnel tab ─────────────────────────────────────────── */

function PersonnelTab({ abbr }: { abbr: string }) {
  const { data, loading, error } = useApi<PersonnelData>(
    `/api/mlb/team/${abbr}/personnel`,
    { cacheMs: 3_600_000 },
  );

  if (loading && !data) return <Loader />;
  if (error) return <div className="p-6 text-neg">Failed to load personnel.</div>;
  if (!data) return null;

  return (
    <div data-cy="personnel-tab" className="flex flex-col gap-3.5">
      <PersonnelTable title="Coaching Staff" testId="coaches-table" rows={data.coaches} />
      {data.frontOffice.length > 0 && (
        <PersonnelTable title="Front Office" testId="front-office-table" rows={data.frontOffice} />
      )}
    </div>
  );
}

function PersonnelTable({
  title,
  testId,
  rows,
}: {
  title: string;
  testId: string;
  rows: PersonnelRow[];
}) {
  return (
    <div data-cy={testId} className="bg-surface border border-line rounded-[14px] overflow-hidden">
      <div className="px-3.5 md:px-4 py-3 border-b border-line-2">
        <div className="font-ui text-[11px] font-bold tracking-[1.4px] uppercase text-ink">
          {title}
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="p-6 text-center text-ink-3 text-[13px]">No staff listed.</div>
      ) : (
        rows.map((r, i) => (
          <div
            key={`${r.id ?? r.name}-${i}`}
            data-cy="personnel-row"
            className={`grid items-center gap-2 px-3.5 md:px-4 py-2.5 ${
              i === rows.length - 1 ? "" : "border-b border-line-2"
            }`}
            style={{ gridTemplateColumns: "1.4fr 1fr" }}
          >
            <span className="font-ui text-[11px] text-ink-3 uppercase tracking-[0.4px]">
              {r.title || "—"}
            </span>
            <span className="font-head text-[13px] font-semibold text-ink tracking-[-0.2px] text-right">
              {r.name}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
