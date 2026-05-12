"use client";

import { useMemo, useState } from "react";
import { useApi } from "@/lib/mlb/client";
import type { ScheduleGame } from "@/lib/mlb/types";
import { TEAMS } from "@/lib/mlb/teams";
import { formatDateLabel } from "@/lib/date";
import { AppBar, Loader, TeamBadge } from "@/components/ui/primitives";
import { IconChevron, IconClose, IconCheck, IconSearch } from "@/components/ui/icons";

interface Resp {
  start: string;
  end: string;
  today: string;
  games: ScheduleGame[];
}

type Scope = "league" | "follow" | "team";
type HomeAway = "all" | "home" | "away";

export function ScheduleScreen({
  follows,
  onGame,
  onTeam,
}: {
  follows: string[];
  onGame: (id: number) => void;
  onTeam: (abbr: string) => void;
}) {
  const { data, loading, error } = useApi<Resp>("/api/mlb/schedule", { cacheMs: 60_000 });

  const [showPast, setShowPast] = useState(false);
  const [scope, setScope] = useState<Scope>("league");
  const [teamFilter, setTeamFilter] = useState<string | null>(null);
  const [homeAway, setHomeAway] = useState<HomeAway>("all");
  const [opponent, setOpponent] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState<null | "team" | "opp">(null);

  const today = data?.today ?? "";
  const allGames = useMemo<ScheduleGame[]>(() => data?.games ?? [], [data]);

  const filtered = useMemo(() => {
    let g = allGames;
    if (!showPast) g = g.filter((x) => x.dateISO >= today);
    if (scope === "follow") {
      g = g.filter((x) => follows.includes(x.away) || follows.includes(x.home));
    } else if (scope === "team" && teamFilter) {
      g = g.filter((x) => x.away === teamFilter || x.home === teamFilter);
      if (homeAway === "home") g = g.filter((x) => x.home === teamFilter);
      if (homeAway === "away") g = g.filter((x) => x.away === teamFilter);
      if (opponent) g = g.filter((x) => x.away === opponent || x.home === opponent);
    }
    return g;
  }, [allGames, showPast, today, scope, teamFilter, homeAway, opponent, follows]);

  const byDate = useMemo(() => {
    const m: Record<string, ScheduleGame[]> = {};
    for (const g of filtered) {
      (m[g.dateISO] ||= []).push(g);
    }
    return m;
  }, [filtered]);
  const dateKeys = Object.keys(byDate).sort();

  const h2h = useMemo(() => {
    if (!(scope === "team" && teamFilter && opponent)) return null;
    const played = filtered.filter((g) => g.status === "FINAL");
    let teamW = 0,
      oppW = 0;
    for (const g of played) {
      const ts = g.away === teamFilter ? g.away_score : g.home_score;
      const os = g.away === teamFilter ? g.home_score : g.away_score;
      if (typeof ts === "number" && typeof os === "number") {
        if (ts > os) teamW++;
        else oppW++;
      }
    }
    return { teamW, oppW, played: played.length, total: filtered.length };
  }, [filtered, scope, teamFilter, opponent]);

  return (
    <>
      <AppBar title="Schedule" />
      <div data-cy="schedule-screen" className="bg-canvas px-3.5 md:px-6 pt-2 pb-[100px] max-w-[900px] w-full mx-auto">
        <FilterToolbar
          scope={scope}
          setScope={setScope}
          teamFilter={teamFilter}
          homeAway={homeAway}
          setHomeAway={setHomeAway}
          opponent={opponent}
          setOpponent={setOpponent}
          follows={follows}
          openPicker={setPickerOpen}
        />

        {h2h && teamFilter && opponent && (
          <div className="mt-3 bg-surface border border-line rounded-[14px] px-3.5 py-3 flex items-center gap-3">
            <TeamBadge abbr={teamFilter} size={28} />
            <div className="flex-1">
              <div className="text-[10px] tracking-widest text-ink-3 uppercase font-ui font-bold">
                Season series
              </div>
              <div className="font-head text-[15px] text-ink font-bold tracking-[-0.2px]">
                {teamFilter} vs {opponent}
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-lg text-ink font-bold tracking-[-0.3px]">
                {h2h.teamW}
                <span className="text-ink-3">–</span>
                {h2h.oppW}
              </div>
              <div className="font-mono text-[10px] text-ink-3">
                {h2h.played} played · {h2h.total - h2h.played} left
              </div>
            </div>
            <TeamBadge abbr={opponent} size={28} />
          </div>
        )}

        <button
          data-cy="show-past-toggle"
          onClick={() => setShowPast(!showPast)}
          className={`mt-3 w-full px-3 py-2.5 rounded-[12px] cursor-pointer flex items-center justify-center gap-2 font-ui text-xs font-semibold text-ink-2 tracking-[0.2px] border ${
            showPast ? "bg-chip border-line" : "bg-transparent border-dashed border-line"
          }`}
        >
          <span className="font-mono text-ink-3 text-[11px]">{showPast ? "↓" : "↑"}</span>
          {showPast ? "Hide past games" : "Show past games"}
        </button>

        {loading ? (
          <Loader />
        ) : error ? (
          <div className="p-6 text-neg">Failed to load schedule.</div>
        ) : (
        <div className="mt-3 flex flex-col gap-3">
          {dateKeys.length === 0 && (
            <div className="py-7 text-center text-ink-3 font-ui text-[13px]">
              No games match these filters.
            </div>
          )}
          {dateKeys.map((iso) => {
            const { wd, mo, dom } = formatDateLabel(iso);
            const isToday = iso === today;
            const dayGames = byDate[iso];
            return (
              <div key={iso}>
                <div className="flex items-baseline gap-2 px-0.5 pb-1.5">
                  <div
                    className={`font-head text-lg font-bold tracking-[-0.3px] ${
                      isToday ? "text-accent" : "text-ink"
                    }`}
                  >
                    {wd}, {mo} {dom}
                  </div>
                  {isToday && (
                    <span className="font-mono text-[9px] text-white bg-accent px-1.5 py-0.5 rounded-[4px] tracking-widest font-bold">
                      TODAY
                    </span>
                  )}
                  <div className="flex-1 h-px bg-line-2 -translate-y-1" />
                  <span className="font-mono text-[10px] text-ink-3 tracking-[0.5px]">
                    {dayGames.length} {dayGames.length === 1 ? "game" : "games"}
                  </span>
                </div>
                <div className="bg-surface border border-line rounded-[14px] overflow-hidden">
                  {dayGames.map((g, i) => (
                    <ScheduleGameRow
                      key={g.id}
                      game={g}
                      isLast={i === dayGames.length - 1}
                      onGame={onGame}
                      onTeam={onTeam}
                      teamFilter={teamFilter}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        )}
      </div>

      {pickerOpen && (
        <TeamPicker
          title={pickerOpen === "team" ? "Choose primary team" : "Choose opponent"}
          exclude={pickerOpen === "opp" ? teamFilter : null}
          follows={follows}
          onClose={() => setPickerOpen(null)}
          onPick={(abbr) => {
            if (pickerOpen === "team") {
              setTeamFilter(abbr);
              setOpponent(null);
              setScope("team");
            } else {
              setOpponent(abbr);
            }
            setPickerOpen(null);
          }}
        />
      )}
    </>
  );
}

function FilterToolbar({
  scope,
  setScope,
  teamFilter,
  homeAway,
  setHomeAway,
  opponent,
  setOpponent,
  follows,
  openPicker,
}: {
  scope: Scope;
  setScope: (s: Scope) => void;
  teamFilter: string | null;
  homeAway: HomeAway;
  setHomeAway: (v: HomeAway) => void;
  opponent: string | null;
  setOpponent: (v: string | null) => void;
  follows: string[];
  openPicker: (v: null | "team" | "opp") => void;
}) {
  return (
    <div className="flex flex-col gap-2 pt-1.5">
      <div className="flex bg-chip rounded-full p-[3px] gap-0.5">
        {(
          [
            { id: "league" as Scope, label: "League" },
            { id: "follow" as Scope, label: `Following${follows.length ? ` · ${follows.length}` : ""}` },
            { id: "team" as Scope, label: teamFilter ? teamFilter : "By team" },
          ] satisfies { id: Scope; label: string }[]
        ).map((s) => {
          const on = scope === s.id;
          return (
            <button
              key={s.id}
              data-cy="scope-tab"
              data-cy-scope={s.id}
              onClick={() => {
                if (s.id === "team" && !teamFilter) {
                  openPicker("team");
                } else {
                  setScope(s.id);
                }
              }}
              className={`flex-1 px-2.5 py-1.5 rounded-full border-none font-ui text-xs font-bold cursor-pointer ${
                on
                  ? "bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                  : "bg-transparent text-ink-2"
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {scope === "team" && teamFilter && (
        <>
          <div className="flex items-center gap-2">
            <button
              onClick={() => openPicker("team")}
              className="px-2.5 py-1.5 rounded-full bg-surface border border-line cursor-pointer flex items-center gap-1.5 font-ui text-xs text-ink"
            >
              <TeamBadge abbr={teamFilter} size={18} />
              {teamFilter}
              <IconChevron size={12} stroke="var(--color-ink-3)" />
            </button>
            <div className="flex bg-chip rounded-full p-0.5">
              {(["all", "home", "away"] as HomeAway[]).map((m) => {
                const on = homeAway === m;
                return (
                  <button
                    key={m}
                    onClick={() => setHomeAway(m)}
                    className={`px-2.5 py-[5px] rounded-full border-none cursor-pointer font-ui text-[11px] font-bold uppercase tracking-[0.4px] ${
                      on ? "bg-surface text-ink" : "bg-transparent text-ink-2"
                    }`}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => openPicker("opp")}
              className={`px-2.5 py-1.5 rounded-full bg-surface border border-line cursor-pointer flex items-center gap-1.5 font-ui text-xs ${
                opponent ? "text-ink" : "text-ink-3"
              }`}
            >
              {opponent ? <TeamBadge abbr={opponent} size={18} /> : null}
              vs {opponent ?? "any opponent"}
              <IconChevron size={12} stroke="var(--color-ink-3)" />
            </button>
            {opponent && (
              <button
                onClick={() => setOpponent(null)}
                aria-label="Clear opponent"
                className="p-1.5 bg-transparent border-none cursor-pointer text-ink-3"
              >
                <IconClose size={14} />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ScheduleGameRow({
  game,
  isLast,
  onGame,
  onTeam,
  teamFilter,
}: {
  game: ScheduleGame;
  isLast: boolean;
  onGame: (id: number) => void;
  onTeam: (abbr: string) => void;
  teamFilter?: string | null;
}) {
  const isFinal = game.status === "FINAL";
  const isLive = game.status === "LIVE";

  const winningAway = isFinal && (game.away_score ?? 0) > (game.home_score ?? 0);
  const winningHome = isFinal && (game.home_score ?? 0) > (game.away_score ?? 0);

  return (
    <button
      data-cy="schedule-game-row"
      data-cy-game-id={game.id}
      onClick={() => onGame(game.id)}
      className={`w-full grid items-center gap-2 px-3.5 py-3 bg-transparent border-none cursor-pointer text-left ${
        isLast ? "" : "border-b border-line-2"
      }`}
      style={{ gridTemplateColumns: "1fr 60px 1fr" }}
    >
      <Side
        abbr={game.away}
        score={game.away_score}
        dim={isFinal && !winningAway}
        isTeamFilter={teamFilter === game.away}
        onTeam={onTeam}
        align="left"
      />
      <div className="text-center">
        {isLive ? (
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[9px] font-bold text-live tracking-widest uppercase">● LIVE</span>
            <span className="font-mono text-[10px] text-ink-3">{game.statusDetail}</span>
          </div>
        ) : isFinal ? (
          <span className="text-[10px] font-bold text-ink-2 tracking-[0.8px] uppercase">FINAL</span>
        ) : (
          <span className="font-mono text-xs text-ink-2 font-semibold">{game.time ?? "TBD"}</span>
        )}
      </div>
      <Side
        abbr={game.home}
        score={game.home_score}
        dim={isFinal && !winningHome}
        isTeamFilter={teamFilter === game.home}
        onTeam={onTeam}
        align="right"
      />
    </button>
  );
}

function Side({
  abbr,
  score,
  dim,
  isTeamFilter,
  onTeam,
  align,
}: {
  abbr: string;
  score?: number;
  dim: boolean;
  isTeamFilter: boolean;
  onTeam: (abbr: string) => void;
  align: "left" | "right";
}) {
  const t = TEAMS[abbr];
  return (
    <div
      className={`flex items-center gap-2.5 ${dim ? "opacity-55" : ""} ${
        align === "right" ? "flex-row-reverse" : ""
      }`}
    >
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          onTeam(abbr);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.stopPropagation();
            onTeam(abbr);
          }
        }}
        className="cursor-pointer inline-flex"
      >
        <TeamBadge abbr={abbr} size={26} />
      </span>
      <div className={`min-w-0 ${align === "right" ? "text-right" : "text-left"}`}>
        <div
          className={`font-head text-sm font-bold text-ink tracking-[-0.2px] whitespace-nowrap overflow-hidden text-ellipsis ${
            isTeamFilter ? "underline underline-offset-4" : ""
          }`}
        >
          {t?.name ?? abbr}
        </div>
        {typeof score === "number" && (
          <div className="font-mono text-base text-ink font-bold tracking-[-0.3px]">{score}</div>
        )}
      </div>
    </div>
  );
}

function TeamPicker({
  title,
  exclude,
  follows,
  onClose,
  onPick,
}: {
  title: string;
  exclude?: string | null;
  follows: string[];
  onClose: () => void;
  onPick: (abbr: string) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return Object.values(TEAMS)
      .filter((t) => t.abbr !== exclude)
      .filter((t) => !ql || `${t.city} ${t.name} ${t.abbr}`.toLowerCase().includes(ql))
      .sort((a, b) => {
        const af = follows.includes(a.abbr) ? -1 : 0;
        const bf = follows.includes(b.abbr) ? -1 : 0;
        if (af !== bf) return af - bf;
        return a.city.localeCompare(b.city);
      });
  }, [q, exclude, follows]);

  return (
    <div data-cy="team-picker" className="absolute inset-0 bg-canvas z-30 flex flex-col">
      <div className="px-4 pb-3 bg-surface border-b border-line-2 flex items-center gap-2.5 pt-[calc(env(safe-area-inset-top,0)+18px)]">
        <button
          onClick={onClose}
          aria-label="Close picker"
          className="bg-transparent border-none cursor-pointer p-1.5 text-ink"
        >
          <IconClose size={20} />
        </button>
        <div className="flex-1 font-head text-[17px] font-bold text-ink">{title}</div>
      </div>
      <div className="px-4 py-2.5 bg-surface">
        <div className="flex items-center gap-2 bg-canvas border border-line rounded-[10px] px-2.5 py-2">
          <IconSearch size={16} stroke="var(--color-ink-3)" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search teams"
            autoFocus
            className="flex-1 border-none bg-transparent outline-none text-ink text-sm font-ui"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pt-2 pb-6">
        {filtered.map((t) => {
          const followed = follows.includes(t.abbr);
          return (
            <button
              key={t.abbr}
              onClick={() => onPick(t.abbr)}
              className="w-full flex items-center gap-3 p-2.5 bg-transparent border-none border-b border-line-2 cursor-pointer text-left"
            >
              <TeamBadge abbr={t.abbr} size={28} />
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-ink-3">{t.city}</div>
                <div className="font-head text-sm font-semibold text-ink tracking-[-0.2px]">
                  {t.name}
                </div>
              </div>
              {followed && <IconCheck size={16} stroke="var(--color-accent)" sw={2.4} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
