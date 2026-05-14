/**
 * localStorage helpers for the v1 (pre-auth) user profile.
 * Schema: { name: string, follows: string[] }  -- follows is a list of team abbreviations.
 *
 * Exposes a `useUser()` hook backed by useSyncExternalStore so reads stay in sync
 * across components and updates re-render the tree without an effect cascade.
 */

import { useSyncExternalStore } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";


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
  /** True once the user has completed the team-picker onboarding flow. The
   *  shell layout's onboarding gate keys off this — when authenticated users
   *  sign up they get a profile row with onboarded=false, then complete the
   *  flow which flips it to true via the `complete_onboarding` RPC. Guests
   *  are always onboarded once their localStorage profile exists. */
  onboarded: boolean;
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
      // Legacy localStorage data predates the `onboarded` field — the mere
      // existence of a saved profile means the user already went through the
      // flow on this device, so we default to true.
      onboarded: true,
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

/* ── Supabase-backed auth store ──────────────────────────────────────────
 *
 * Module-level mirror of the current authenticated session + profile. Backed
 * by `@supabase/ssr`'s browser client; lazily initialized on the first
 * subscription so that nothing runs on the server. Exposed via
 * `useUserState()` below.
 *
 * The `authSnapshot` cache lets `useSyncExternalStore` return a stable
 * reference between renders — without it, React would treat every render as
 * a state change because we'd be returning a fresh object each time.
 * ─────────────────────────────────────────────────────────────────────── */

type AuthSnapshot =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authenticated"; profile: UserProfile; userId: string; email: string };

let authSnapshot: AuthSnapshot = { status: "loading" };
const authListeners = new Set<() => void>();
let authInitialized = false;

function notifyAuth() {
  authListeners.forEach((l) => l());
}

/** Hydrate a `UserProfile` from the four user tables. RLS scopes everything
 *  to the calling user automatically, so we don't filter by user_id in the
 *  WHERE clause for tables keyed on it — but we do for `profiles` since its
 *  PK is `id`. The `handle_new_user` trigger ensures rows exist on signup;
 *  defaults below are defensive in case any read returns nothing. */
async function fetchAuthenticatedProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserProfile> {
  const [profileRes, followsRes, displayRes, notifRes] = await Promise.all([
    supabase.from("profiles").select("name, onboarded").eq("id", userId).maybeSingle(),
    supabase.from("follows").select("team_abbr"),
    supabase
      .from("display_prefs")
      .select("box_score_units, win_probability, pitch_by_pitch, theme")
      .maybeSingle(),
    supabase
      .from("notification_prefs")
      .select("enabled, cat_start, cat_end, cat_score")
      .maybeSingle(),
  ]);

  const display = displayRes.data;
  const notif = notifRes.data;

  return {
    name: profileRes.data?.name ?? "",
    onboarded: profileRes.data?.onboarded === true,
    follows: (followsRes.data ?? []).map((r: { team_abbr: string }) => r.team_abbr),
    notifications: notif
      ? {
          enabled: notif.enabled,
          categories: {
            start: notif.cat_start,
            end: notif.cat_end,
            score: notif.cat_score,
          },
        }
      : DEFAULT_NOTIFICATIONS,
    prefs: display
      ? {
          boxScoreUnits: display.box_score_units === "metric" ? "metric" : "imperial",
          winProbability: display.win_probability,
          pitchByPitch: display.pitch_by_pitch,
          theme: display.theme === "twilight" ? "twilight" : "light",
        }
      : DEFAULT_PREFS,
  };
}

/**
 * Persist a UserProfile for the currently-authenticated user via the
 * `complete_onboarding` RPC. The RPC writes profile.name + follows +
 * notification_prefs + display_prefs + onboarded=true in a single
 * server-side transaction, so partial-write states are impossible.
 *
 * Refreshes the auth snapshot afterwards so the local store reflects the
 * new profile immediately (including the flipped onboarded flag).
 *
 * Throws if not currently authenticated or if the RPC fails — callers
 * should handle the rejection (typically by surfacing an error toast).
 */
export async function saveAuthenticatedProfile(profile: UserProfile): Promise<void> {
  if (typeof window === "undefined") return;
  const supabase = createClient();
  const { error } = await supabase.rpc("upsert_profile", {
    p_name: profile.name,
    p_follows: profile.follows,
    p_notifications: {
      enabled: profile.notifications.enabled,
      categories: {
        start: profile.notifications.categories.start,
        end: profile.notifications.categories.end,
        score: profile.notifications.categories.score,
      },
    },
    p_prefs: {
      boxScoreUnits: profile.prefs.boxScoreUnits,
      winProbability: profile.prefs.winProbability,
      pitchByPitch: profile.prefs.pitchByPitch,
      theme: profile.prefs.theme,
    },
  });
  if (error) throw new Error(error.message);
  await refreshAuthSnapshot();
}

function initAuthStore(): void {
  if (authInitialized || typeof window === "undefined") return;
  authInitialized = true;

  const supabase = createClient();

  const applyAuthenticated = async (userId: string, email: string) => {
    try {
      const profile = await fetchAuthenticatedProfile(supabase, userId);
      authSnapshot = { status: "authenticated", profile, userId, email };
    } catch {
      // Auth resolved but the profile fetch failed (network blip, etc.).
      // Fall back to anonymous so the app remains usable rather than stuck
      // in a half-authenticated state.
      authSnapshot = { status: "anonymous" };
    }
    notifyAuth();
  };

  const applyAnonymous = () => {
    authSnapshot = { status: "anonymous" };
    notifyAuth();
  };

  // Initial probe. `getClaims()` validates the JWT signature against the
  // project's published public keys and returns the claims payload (or null
  // if no session). We pull `sub` for the user id and `email` for display
  // in Settings, rather than calling `getSession()` separately.
  supabase.auth.getClaims().then(({ data }) => {
    const claims = data?.claims;
    const userId = claims?.sub;
    const email = claims?.email;
    if (typeof userId === "string" && typeof email === "string") {
      applyAuthenticated(userId, email);
    } else applyAnonymous();
  });

  // Reactive: fires on sign-in, sign-out, token refresh, and (in newer
  // supabase-js versions) an INITIAL_SESSION event on mount. Whichever
  // arrives last wins; the snapshot is eventually consistent.
  supabase.auth.onAuthStateChange((_event, session) => {
    const userId = session?.user?.id;
    const email = session?.user?.email;
    if (typeof userId === "string" && typeof email === "string") {
      applyAuthenticated(userId, email);
    } else applyAnonymous();
  });
}

function subscribeAuth(cb: () => void): () => void {
  authListeners.add(cb);
  initAuthStore();
  return () => {
    authListeners.delete(cb);
  };
}

function getAuthSnapshot(): AuthSnapshot {
  return authSnapshot;
}

/** React's `useSyncExternalStore` requires `getServerSnapshot` to return a
 *  referentially stable value across calls — otherwise React treats each
 *  render as a state change and warns "The result of getServerSnapshot should
 *  be cached to avoid an infinite loop". A module-level singleton is the
 *  canonical fix. */
const SERVER_AUTH_SNAPSHOT: AuthSnapshot = { status: "loading" };

function getServerAuthSnapshot(): AuthSnapshot {
  return SERVER_AUTH_SNAPSHOT;
}

/**
 * Force the auth store to re-probe Supabase and notify subscribers. Call
 * this from any code path that mutates the session outside this browser
 * client — most notably the server-action login / signup / signout flows.
 *
 * The browser client's `onAuthStateChange` listener only fires for events
 * triggered by this same client instance. Server actions set the session
 * cookies via the server client, so the browser client's in-memory state
 * stays stale until we explicitly re-read. Without this call, a freshly
 * signed-in user would continue to see the anonymous UI until they manually
 * reloaded the page.
 *
 * Safe to call before the auth store has been initialized — it does the
 * same work `initAuthStore`'s probe would do, just on demand.
 */
export async function refreshAuthSnapshot(): Promise<void> {
  if (typeof window === "undefined") return;
  const supabase = createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const userId = claims?.sub;
  const email = claims?.email;
  if (typeof userId === "string" && typeof email === "string") {
    try {
      const profile = await fetchAuthenticatedProfile(supabase, userId);
      authSnapshot = { status: "authenticated", profile, userId, email };
    } catch {
      authSnapshot = { status: "anonymous" };
    }
  } else {
    authSnapshot = { status: "anonymous" };
  }
  notifyAuth();
}

/* ── Public hooks: auth-aware + profile-only ────────────────────────────
 *
 * `useUserState()` exposes the discriminator for code that needs to branch
 * on auth status (Settings upgrade CTA, guest nudge banner, splash gating).
 * `useUser()` is the narrower convenience hook that returns the profile
 * regardless of how it's backed (Supabase or localStorage), or null when
 * neither is available.
 * ─────────────────────────────────────────────────────────────────────── */

export type UserState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "guest"; profile: UserProfile }
  | { status: "authenticated"; profile: UserProfile; userId: string; email: string };

/**
 * Auth-aware user state. Resolution order:
 *
 *  1. `authenticated` — Supabase session resolved and profile loaded.
 *  2. `guest`         — localStorage profile present (regardless of whether
 *                        auth has finished resolving). Optimistically shows
 *                        the user their cached state so a returning visitor
 *                        sees data immediately, with no spinner flash.
 *  3. `loading`       — auth check still in flight AND no guest profile to
 *                        fall back on. UI should defer first-run rendering.
 *  4. `anonymous`     — auth resolved to no session and no guest profile.
 *                        UI should show the first-run splash.
 *
 * The guest branch winning over `loading` means an existing localStorage
 * user never sees a transient loading state — the only readers of `loading`
 * are brand-new visitors during the initial Supabase session probe.
 */
export function useUserState(): UserState {
  const auth = useSyncExternalStore(subscribeAuth, getAuthSnapshot, getServerAuthSnapshot);
  const guestProfile = useSyncExternalStore(subscribe, getSnapshot, () => null);

  if (auth.status === "authenticated") return auth;
  if (guestProfile) return { status: "guest", profile: guestProfile };
  if (auth.status === "loading") return { status: "loading" };
  return { status: "anonymous" };
}

export function useUser(): UserProfile | null {
  const state = useUserState();
  return state.status === "guest" || state.status === "authenticated"
    ? state.profile
    : null;
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

/** Read the localStorage-backed guest profile synchronously. Returns null
 *  when localStorage is empty or when called server-side. Use this when you
 *  need to peek at the guest profile *even while* `useUser()` is returning
 *  the authenticated profile — specifically during the guest → authenticated
 *  upgrade flow, where we want to import the guest's follows + name into
 *  the brand-new server profile. */
export function readGuestProfile(): UserProfile | null {
  return readFromStorage();
}

/** Merge a guest's localStorage profile into a freshly-authenticated user's
 *  server profile, producing the seed values for the onboarding overlay
 *  during a guest → authenticated upgrade.
 *
 *  Merge rules:
 *   - `name`: guest's typed name wins when it's meaningful (non-empty and
 *     not the "Guest" placeholder). Otherwise the server's name wins —
 *     typically the email handle that signUp wrote into raw_user_meta_data.
 *   - `follows`: union of both. Team abbrs are set-valued, so there's no
 *     conflict; both sources contribute.
 *   - `notifications` / `prefs`: server wins (per the silent-merge policy
 *     established when the auth path was designed — prefs are scalar and
 *     the user can adjust them in Settings post-upgrade).
 *   - `onboarded`: untouched (caller should still flip this true via the
 *     normal RPC path when the user completes the team picker). */
export function mergeProfileForUpgrade(
  authProfile: UserProfile,
  guestProfile: UserProfile | null,
): UserProfile {
  if (!guestProfile) return authProfile;
  const guestName = guestProfile.name.trim();
  const guestNameMeaningful = guestName.length > 0 && guestName !== "Guest";
  return {
    ...authProfile,
    name: guestNameMeaningful ? guestProfile.name : authProfile.name,
    follows: Array.from(new Set([...authProfile.follows, ...guestProfile.follows])),
  };
}
