"use client";

import type { ReactNode, RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { TEAMS } from "@/lib/mlb/teams";
import type { DateStripEntry } from "@/lib/date";

/* ─── MLB Logo URL ──────────────────────────────────────────────── */

/** MLB's static spot endpoint. Common spot sizes: 32, 64, 96, 128, 240. */
export function mlbLogoUrl(teamId: number, size = 64): string {
  return `https://midfield.mlbstatic.com/v1/team/${teamId}/spots/${size}`;
}

/** Picks the smallest available spot size that renders crisply at `rendered` px on a 2x display. */
function spotSizeFor(rendered: number): number {
  if (rendered <= 32) return 64;
  if (rendered <= 64) return 128;
  return 240;
}

/* ─── useInView ─────────────────────────────────────────────────── */

/**
 * One-shot IntersectionObserver — flips to `true` the first time the element enters
 * (or nears) the viewport and stays true forever after. Falls back to `true` when IO
 * is unavailable so SSR/older browsers still render content.
 */
function useInView(ref: RefObject<Element | null>, rootMargin = "200px"): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setInView(true);
          obs.disconnect();
        }
      },
      { rootMargin },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref, rootMargin]);
  return inView;
}

/* ─── TeamBadge ───────────────────────────────────────────────── */

/**
 * Renders the MLB team logo, lazy-loaded once the badge nears the viewport.
 * The colored-abbreviation chip is always rendered underneath as a placeholder
 * and a permanent fallback if the image fails (e.g., MLB asset endpoint changes).
 */
export function TeamBadge({ abbr, size = 28 }: { abbr: string; size?: number }) {
  const t = TEAMS[abbr];
  const fs = size <= 22 ? 9 : size <= 30 ? 10 : 12;
  const bg = t?.primary ?? "#888";
  const alt = t ? `${t.city} ${t.name}` : abbr;

  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const [status, setStatus] = useState<"idle" | "loaded" | "error">("idle");
  const showImage = !!t?.mlbId && inView && status !== "error";

  return (
    <div
      ref={ref}
      className="relative flex items-center justify-center font-mono font-bold text-white shrink-0 tracking-[0.2px] overflow-hidden"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        fontSize: fs,
        background: showImage ? 'transparent' : bg,
      }}
      aria-label={alt}
      role="img"
    >
      <span aria-hidden="true">{abbr}</span>
      {showImage && t && (
        <img
          src={mlbLogoUrl(t.mlbId, spotSizeFor(size))}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
          className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-200 ${status === "loaded" ? "opacity-100" : "opacity-0"
            }`}
        />
      )}
    </div>
  );
}

/* ─── Chip ────────────────────────────────────────────────────── */

type ChipTone = "default" | "live" | "accent" | "flat";

export function Chip({
  children,
  tone = "default",
  className = "",
}: {
  children: ReactNode;
  tone?: ChipTone;
  className?: string;
}) {
  const toneClasses =
    tone === "live"
      ? "bg-live text-white border-none"
      : tone === "accent"
        ? "bg-accent text-white border-none"
        : tone === "flat"
          ? "bg-transparent text-ink border border-line"
          : "bg-chip text-ink border-none";
  return (
    <span
      className={`inline-flex items-center gap-1 px-[9px] py-1 rounded-full text-[11px] font-semibold tracking-wider uppercase font-ui ${toneClasses} ${className}`}
    >
      {children}
    </span>
  );
}

/* ─── SectionHead ─────────────────────────────────────────────── */

export function SectionHead({
  icon,
  title,
  right,
}: {
  icon?: ReactNode;
  title: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 px-1 pt-3.5 pb-2">
      {icon}
      <div className="font-head font-semibold text-[13px] tracking-[1.4px] uppercase text-ink-2 flex-1">
        {title}
      </div>
      {right}
    </div>
  );
}

/* ─── BaseDiamond ─────────────────────────────────────────────── */

export function BaseDiamond({
  bases = [false, false, false],
  size = 28,
}: {
  bases?: [boolean, boolean, boolean];
  size?: number;
}) {
  const fill = (on: boolean) => (on ? "var(--color-accent)" : "transparent");
  const stroke = "var(--color-ink-2)";
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className="block">
      <rect x={15} y={6} width={10} height={10} fill={fill(bases[1])} stroke={stroke} strokeWidth={1.4} transform="rotate(45 20 11)" />
      <rect x={6} y={15} width={10} height={10} fill={fill(bases[2])} stroke={stroke} strokeWidth={1.4} transform="rotate(45 11 20)" />
      <rect x={24} y={15} width={10} height={10} fill={fill(bases[0])} stroke={stroke} strokeWidth={1.4} transform="rotate(45 29 20)" />
    </svg>
  );
}

/* ─── OutDots ─────────────────────────────────────────────────── */

export function OutDots({ outs = 0 }: { outs?: number }) {
  return (
    <div className="inline-flex gap-1">
      {[0, 1, 2].map((i) => {
        const on = i < outs;
        return (
          <div
            key={i}
            className={`w-1.75 h-1.75 rounded-sm border-[1.4px] ${on ? "bg-accent border-accent" : "bg-transparent border-ink-2"
              }`}
          />
        );
      })}
    </div>
  );
}

/* ─── BaseballMark ────────────────────────────────────────────── */

export function BaseballMark({ size = 22, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" className={className} aria-hidden>
      <circle cx="11" cy="11" r="9.5" fill="var(--color-accent)" />
      <path d="M5 6 Q9 11 5 16" stroke="var(--color-surface)" strokeWidth="1" fill="none" strokeDasharray="1.5 1.5" />
      <path d="M17 6 Q13 11 17 16" stroke="var(--color-surface)" strokeWidth="1" fill="none" strokeDasharray="1.5 1.5" />
    </svg>
  );
}

/* ─── Wordmark ────────────────────────────────────────────────── */

export function Wordmark() {
  return (
    <div className="flex items-center gap-2">
      <Link href="/" className="flex flex-row items-center gap-2 no-underline text-inherit">
        <BaseballMark />
        <div className="font-head font-bold text-[18px] text-ink tracking-[-0.5px]">
          Game<span className="text-accent">·</span>State
        </div>
      </Link>
    </div>
  );
}

/* ─── Loader ──────────────────────────────────────────────────── */

export function Loader() {
  return (
    <div className="flex items-center justify-center min-h-[85dvh] py-12">
      <BaseballMark size={56} className="animate-spin [animation-duration:1.4s]" />
    </div>
  );
}

/* ─── TopBar ──────────────────────────────────────────────────── */

/**
 * Global top bar — always visible at the top of the shell.
 * On mobile, shows the Wordmark on the left and a profile chip on the right.
 * On desktop (md+), the primary tab navigation appears between them.
 */
export function TopBar({
  tabs,
  current,
  onChange,
  userName,
  onProfile,
}: {
  tabs: TabBarTab[];
  current: string;
  onChange: (id: string) => void;
  userName: string;
  onProfile: () => void;
}) {
  const initials =
    (userName || "Guest")
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "G";

  return (
    <header className="sticky top-0 z-6 bg-surface border-b border-line-2 px-4 md:px-6 pb-3 pt-[calc(env(safe-area-inset-top,0)+18px)]">
      <div className="flex items-center gap-3 md:gap-6">
        <Wordmark />

        {/* Desktop tab nav */}
        <nav className="hidden md:flex items-center gap-1 ml-2">
          {tabs.map((t) => {
            const active = current === t.id;
            return (
              <button
                key={t.id}
                onClick={() => onChange(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border-none cursor-pointer font-ui text-[13px] font-semibold transition-colors ${active ? "bg-chip text-ink" : "bg-transparent text-ink-2 hover:bg-chip hover:text-ink"
                  }`}
              >
                {t.icon({
                  size: 16,
                  stroke: active ? "var(--color-ink)" : "var(--color-ink-2)",
                  fill: "none",
                })}
                <span>{t.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="flex-1" />

        <button
          onClick={onProfile}
          className="bg-chip border-none rounded-full pr-1 pl-1 py-1 md:pr-3 cursor-pointer flex items-center gap-2 font-ui text-xs font-semibold text-ink hover:bg-line-2 transition-colors"
        >
          <span className="w-5.5 h-5.5 rounded-full bg-accent text-white flex items-center justify-center font-mono text-[10px] font-bold">
            {initials}
          </span>
          <span className="hidden sm:inline">{userName || "Guest"}</span>
        </button>
      </div>
    </header>
  );
}

/* ─── BackChevron ─────────────────────────────────────────────── */

export function BackChevron({ onClick, label = "Back" }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      className="-ml-2 flex items-center gap-1 px-2 py-1 bg-transparent border-none cursor-pointer text-accent font-ui text-sm font-semibold"
    >
      <svg width="9" height="14" viewBox="0 0 9 14" fill="none">
        <path d="M7 1L1.5 7L7 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>{label}</span>
    </button>
  );
}

/* ─── StatTile ────────────────────────────────────────────────── */

export function StatTile({
  label,
  value,
  accent = false,
  sub,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
  sub?: string;
}) {
  return (
    <div className="flex-1 px-2 py-3 bg-surface-2 rounded-[10px] border border-line-2 text-center">
      <div className="text-[9px] font-bold tracking-[1.2px] uppercase text-ink-3 mb-1 font-ui">{label}</div>
      <div className={`font-mono text-[20px] font-semibold tracking-[-0.5px] ${accent ? "text-accent" : "text-ink"}`}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-ink-3 mt-0.5">{sub}</div>}
    </div>
  );
}

/* ─── AppBar ──────────────────────────────────────────────────── */

export function AppBar({
  title,
  leading,
  trailing,
}: {
  title: string;
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 px-[18px] md:px-6 pb-3 pt-4 bg-surface border-b border-line-2">
      {leading}
      <div className="flex-1 font-head font-bold text-[22px] tracking-[-0.6px] text-ink">
        {title}
      </div>
      {trailing}
    </div>
  );
}

/* ─── TabBar ──────────────────────────────────────────────────── */

interface TabBarTab {
  id: string;
  label: string;
  icon: (p: { size?: number; stroke?: string; fill?: string }) => ReactNode;
}

export function TabBar({
  tabs,
  current,
  onChange,
  hidden,
}: {
  tabs: TabBarTab[];
  current: string;
  onChange: (id: string) => void;
  hidden?: boolean;
}) {
  return (
    <div
      className={`md:hidden fixed bottom-0 inset-x-0 px-1.5 pt-2 pb-[calc(env(safe-area-inset-bottom,0)+14px)] bg-surface border-t border-line flex justify-around z-5 transition-transform duration-[240ms] will-change-transform ${hidden ? "translate-y-full" : "translate-y-0"
        }`}
      style={{ transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)" }}
    >
      {tabs.map((t) => {
        const active = current === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`flex flex-col items-center gap-0.5 px-2.5 py-1.5 bg-transparent border-none cursor-pointer font-ui rounded-sm active:bg-active ${active ? "text-accent" : "text-ink-2"
              }`}
          >
            {t.icon({
              size: 22,
              stroke: active ? "var(--color-accent)" : "var(--color-ink-2)",
              fill: "none",
            })}
            <span className="text-[10px] font-semibold tracking-[0.2px]">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ─── DateStrip ───────────────────────────────────────────────── */

export function DateStrip({
  entries,
  selectedIdx,
  onSelect,
}: {
  entries: DateStripEntry[];
  selectedIdx: number;
  onSelect: (i: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const child = el.children[selectedIdx] as HTMLElement | undefined;
    if (child) {
      el.scrollLeft = child.offsetLeft - el.clientWidth / 2 + child.clientWidth / 2;
    }
    // Only run once on mount; we intentionally don't re-center on selection change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div ref={ref} className="flex gap-1 px-[14px] py-2 overflow-x-auto [-webkit-overflow-scrolling:touch]">
      {entries.map((d, i) => {
        const sel = i === selectedIdx;
        return (
          <button
            key={d.iso}
            onClick={() => onSelect(i)}
            className={`min-w-[52px] px-1 pt-1.5 pb-2 rounded-[10px] border-none cursor-pointer font-ui flex flex-col items-center gap-px shrink-0 ${sel ? "bg-accent text-white" : "bg-transparent text-ink"
              }`}
          >
            <span className={`text-[10px] font-semibold tracking-[0.8px] ${sel ? "opacity-95" : "opacity-55"}`}>
              {d.wd}
            </span>
            <span className="font-head text-[19px] font-semibold tracking-[-0.5px] leading-[1.1]">{d.d}</span>
            <span className={`text-[9px] font-medium ${sel ? "opacity-95" : "opacity-50"}`}>{d.m}</span>
          </button>
        );
      })}
    </div>
  );
}
