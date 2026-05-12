/**
 * localStorage helpers for the v1 (pre-auth) user profile.
 * Schema: { name: string, follows: string[] }  -- follows is a list of team abbreviations.
 *
 * Exposes a `useUser()` hook backed by useSyncExternalStore so reads stay in sync
 * across components and updates re-render the tree without an effect cascade.
 */

import { useSyncExternalStore } from "react";


export type BoxScoreUnits = "imperial" | "metric";
export type Theme = "light" | "twilight";

export interface NotificationPrefs {
  /** User's in-app intent. Browser permission is gated separately via Notification.permission. */
  enabled: boolean;
  categories: {
    start: boolean;
    end: boolean;
    score: boolean;
  };
}

export interface DisplayPrefs {
  boxScoreUnits: BoxScoreUnits;
  winProbability: boolean;
  pitchByPitch: boolean;
  theme: Theme;
}

export interface UserProfile {
  name: string;
  follows: string[];
  notifications: NotificationPrefs;
  prefs: DisplayPrefs;
}

export const DEFAULT_NOTIFICATIONS: NotificationPrefs = {
  enabled: false,
  categories: { start: true, end: true, score: true },
};

export const DEFAULT_PREFS: DisplayPrefs = {
  boxScoreUnits: "imperial",
  winProbability: true,
  pitchByPitch: true,
  theme: "light",
};

/** localStorage key used by the pre-hydration boot script in app/layout.tsx. */
export const STORAGE_KEY = "dl_user";

function readFromStorage(): UserProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<UserProfile>;
    if (typeof parsed?.name !== "string" || !Array.isArray(parsed?.follows)) return null;
    // Forward-compat: older entries lack `notifications` / `prefs`. Fill with defaults.
    const notifications: NotificationPrefs = {
      enabled: parsed.notifications?.enabled === true,
      categories: {
        start: parsed.notifications?.categories?.start ?? DEFAULT_NOTIFICATIONS.categories.start,
        end:   parsed.notifications?.categories?.end   ?? DEFAULT_NOTIFICATIONS.categories.end,
        score: parsed.notifications?.categories?.score ?? DEFAULT_NOTIFICATIONS.categories.score,
      },
    };
    const prefs: DisplayPrefs = {
      boxScoreUnits:   parsed.prefs?.boxScoreUnits === "metric" ? "metric" : "imperial",
      winProbability:  parsed.prefs?.winProbability  ?? DEFAULT_PREFS.winProbability,
      pitchByPitch:    parsed.prefs?.pitchByPitch    ?? DEFAULT_PREFS.pitchByPitch,
      theme:           parsed.prefs?.theme === "twilight" ? "twilight" : "light",
    };
    return {
      name: parsed.name,
      follows: parsed.follows.filter((x): x is string => typeof x === "string"),
      notifications,
      prefs,
    };
  } catch {
    return null;
  }
}

/* Internal cache + subscriber registry so useSyncExternalStore gets stable refs. */
let cached: UserProfile | null = null;
let cacheInitialized = false;
const listeners = new Set<() => void>();

function getSnapshot(): UserProfile | null {
  if (!cacheInitialized) {
    cached = readFromStorage();
    cacheInitialized = true;
  }
  return cached;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      cached = readFromStorage();
      listeners.forEach((l) => l());
    }
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }
  return () => {
    listeners.delete(cb);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

export function useUser(): UserProfile | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

export function saveUser(user: UserProfile): void {
  cached = user;
  cacheInitialized = true;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    } catch {
      /* localStorage may be disabled — silently ignore */
    }
  }
  listeners.forEach((l) => l());
}

export function clearUser(): void {
  cached = null;
  cacheInitialized = true;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  listeners.forEach((l) => l());
}
