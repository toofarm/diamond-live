"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { TEAMS } from "@/lib/mlb/teams";
import { useApi } from "@/lib/mlb/client";
import type { GameSummary } from "@/lib/mlb/types";
import type { NotificationPrefs } from "@/lib/storage";

export type PermissionState = "default" | "granted" | "denied" | "unsupported";

function readPermissionNow(): PermissionState {
  if (typeof window === "undefined" || typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

/**
 * Module-level store for the browser's Notifications permission.
 *
 * The Notifications API itself doesn't emit a change event, so we keep our own
 * cache and update it from two sources:
 *   1. focus / visibilitychange — covers the case where the user flips the
 *      setting in browser preferences.
 *   2. `requestPermission()` resolving — covers the in-page permission prompt,
 *      where no DOM event fires after the user clicks Allow / Block.
 */
let permissionCache: PermissionState = readPermissionNow();
const permissionListeners = new Set<() => void>();

function setPermission(next: PermissionState): void {
  if (permissionCache === next) return;
  permissionCache = next;
  permissionListeners.forEach((l) => l());
}

function subscribePermission(cb: () => void): () => void {
  permissionListeners.add(cb);
  // Attach DOM listeners only on first subscribe; detach when the last subscriber leaves.
  if (permissionListeners.size === 1 && typeof window !== "undefined") {
    const resync = () => setPermission(readPermissionNow());
    window.addEventListener("focus", resync);
    document.addEventListener("visibilitychange", resync);
    domTeardown = () => {
      window.removeEventListener("focus", resync);
      document.removeEventListener("visibilitychange", resync);
    };
  }
  return () => {
    permissionListeners.delete(cb);
    if (permissionListeners.size === 0 && domTeardown) {
      domTeardown();
      domTeardown = null;
    }
  };
}
let domTeardown: (() => void) | null = null;

export function usePermissionState(): PermissionState {
  return useSyncExternalStore(
    subscribePermission,
    () => permissionCache,
    () => "default" as PermissionState,
  );
}

export async function requestPermission(): Promise<PermissionState> {
  if (typeof window === "undefined" || typeof Notification === "undefined") return "unsupported";
  try {
    const result = (await Notification.requestPermission()) as PermissionState;
    setPermission(result);
    return result;
  } catch {
    const cur = readPermissionNow();
    setPermission(cur);
    return cur;
  }
}

function teamLabel(abbr: string): string {
  const t = TEAMS[abbr];
  return t ? `${t.city} ${t.name}` : abbr;
}

function fire(title: string, body: string, tag: string) {
  if (typeof window === "undefined" || typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, tag, icon: "/favicon.ico" });
  } catch {
    /* some browsers throw on insecure contexts; swallow */
  }
}

/**
 * Watches today's scoreboard and fires browser notifications when a followed
 * team's game starts (SCHEDULED → LIVE), ends (LIVE → FINAL), or that team
 * scores (their run total increases).
 *
 * The first response after mount only seeds the baseline — we don't fire for
 * games that are already mid-flight when the user opens the app.
 */
export function useGameNotifications(
  follows: string[],
  notifications: NotificationPrefs,
  permission: PermissionState,
) {
  // Poll at 30s. Independent of any per-screen poll: this hook runs in the shell
  // and must keep firing even when the user is off the Scores tab.
  const active = permission === "granted" && notifications.enabled && follows.length > 0;
  const { data } = useApi<{ date: string; games: GameSummary[] }>(
    active ? `/api/mlb/scoreboard?date=${todayISO()}` : null,
    { pollMs: 30_000 },
  );

  const followSet = useRef<Set<string>>(new Set());
  followSet.current = new Set(follows);

  // Per-game previous state. Keyed by gamePk so notifications dedupe naturally.
  type Snap = { status: GameSummary["status"]; awayScore: number; homeScore: number };
  const prev = useRef<Map<number, Snap>>(new Map());
  const seeded = useRef(false);

  useEffect(() => {
    if (!data?.games) return;

    // First payload after mount or after toggling on: seed only, no notifications.
    // Re-seeding is necessary when `active` flips back on, so we clear too.
    if (!seeded.current) {
      const next = new Map<number, Snap>();
      for (const g of data.games) {
        next.set(g.id, { status: g.status, awayScore: g.awayScore ?? 0, homeScore: g.homeScore ?? 0 });
      }
      prev.current = next;
      seeded.current = true;
      return;
    }

    const cats = notifications.categories;
    for (const g of data.games) {
      const isAway = followSet.current.has(g.away);
      const isHome = followSet.current.has(g.home);
      if (!isAway && !isHome) continue;

      const team = isHome ? g.home : g.away;
      const prevSnap = prev.current.get(g.id);
      const cur: Snap = { status: g.status, awayScore: g.awayScore ?? 0, homeScore: g.homeScore ?? 0 };

      if (prevSnap) {
        // Start: SCHEDULED -> LIVE
        if (cats.start && prevSnap.status === "SCHEDULED" && g.status === "LIVE") {
          fire(
            `${teamLabel(team)} game is starting`,
            `${g.away} @ ${g.home} — first pitch`,
            `start-${g.id}`,
          );
        }
        // End: LIVE -> FINAL
        if (cats.end && prevSnap.status === "LIVE" && g.status === "FINAL") {
          fire(
            `${teamLabel(team)} final`,
            `${g.away} ${cur.awayScore} – ${cur.homeScore} ${g.home}`,
            `end-${g.id}`,
          );
        }
        // Score: this team's runs went up.
        if (cats.score) {
          const ourPrev = isHome ? prevSnap.homeScore : prevSnap.awayScore;
          const ourCur  = isHome ? cur.homeScore     : cur.awayScore;
          if (ourCur > ourPrev) {
            fire(
              `${teamLabel(team)} scored`,
              `${g.away} ${cur.awayScore} – ${cur.homeScore} ${g.home}`,
              `score-${g.id}-${ourCur}`,
            );
          }
        }
      }

      prev.current.set(g.id, cur);
    }
  }, [data, notifications.categories]);

  // When notifications are disabled or permission revoked, drop the seed so the
  // next enable cycle starts cleanly.
  useEffect(() => {
    if (!active) {
      seeded.current = false;
      prev.current.clear();
    }
  }, [active]);
}

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
