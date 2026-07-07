"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  useUser,
  useUserState,
  saveUser,
  saveAuthenticatedProfile,
  clearUser,
  readGuestProfile,
  mergeProfileForUpgrade,
  refreshAuthSnapshot,
  DEFAULT_NOTIFICATIONS,
  type UserProfile,
} from "@/lib/storage";
import { TabBar, TopBar } from "@/components/ui/primitives";
import { IconScores, IconStandings, IconSchedule, IconLeaders, IconSettings, IconSearch } from "@/components/ui/icons";
import { SEARCH_INPUT_ID } from "@/components/screens/SearchScreen";
import { Onboarding } from "@/components/onboarding/Onboarding";
import { GuestNudgeBanner } from "@/components/auth/GuestNudgeBanner";
import { ShellContext, type ShellState } from "@/lib/shell";
import { useGameNotifications, usePermissionState } from "@/lib/notifications";

// Desktop top-bar nav: Search sits second, Settings stays (the user badge also
// routes there). The mobile tab bar (below) drops Settings — it's reachable via
// the badge — so Search lands in the second slot there too.
const TABS = [
  { id: "scores", label: "Scores", icon: IconScores },
  { id: "search", label: "Search", icon: IconSearch },
  { id: "standings", label: "Standings", icon: IconStandings },
  { id: "schedule", label: "Schedule", icon: IconSchedule },
  { id: "leaders", label: "Leaders", icon: IconLeaders },
  { id: "settings", label: "Settings", icon: IconSettings },
];

// Mobile bottom bar omits Settings (popped off per design — still reachable from
// the profile badge), which leaves Search in the second position.
const MOBILE_TABS = TABS.filter((t) => t.id !== "settings");

// Route ids that count as top-level tabs (drives TabBar visibility + active
// highlighting). Derived from the full TABS list so /search and /settings both
// register as tab routes even though the mobile bar hides Settings.
const TAB_IDS = new Set(TABS.map((t) => t.id));

function deriveTab(pathname: string): string | null {
  const seg = pathname.split("/")[1] ?? "";
  return TAB_IDS.has(seg) ? seg : null;
}

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const tab = deriveTab(pathname);
  const isTabRoute = tab !== null;

  const user = useUser();
  const userState = useUserState();
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [manageMode, setManageMode] = useState(false);

  // Keep the <html data-theme> attribute in lockstep with the user's theme
  // preference so toggles in Settings apply without a reload. The initial
  // value is set pre-hydration by the boot script in app/layout.tsx.
  const theme = user?.prefs?.theme;
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (theme === "twilight") {
      document.documentElement.setAttribute("data-theme", "twilight");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }, [theme]);
  // `useUser` is backed by useSyncExternalStore with a `() => null` server
  // snapshot, so `user` reads as null on SSR and the first client render even
  // when a profile exists in localStorage. Wait one effect tick before letting
  // the onboarding overlay open so returning users don't see it flash on mount.
  //
  // We also re-probe the browser auth store on every shell mount. The
  // supabase-js `onAuthStateChange` listener only fires for events the
  // browser client itself originated — our sign-in / sign-out / sign-up
  // flows go through server actions that mutate cookies via the server
  // client, leaving the in-memory snapshot stale in three directions:
  //   - anonymous → authenticated (just signed in, redirected here)
  //   - authenticated → anonymous (signed out, came back as guest)
  //   - authenticated → different authenticated (signed in as someone else)
  // Re-probing on mount catches all three without needing to enumerate
  // which one we're in. The probe is gated to `setHydrated` so the
  // onboarding overlay never opens against a stale snapshot. On a normal
  // returning-user page load the snapshot is "loading" until
  // `initAuthStore`'s own probe completes; this extra probe is a small
  // duplicate of that one, harmless and idempotent.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    refreshAuthSnapshot().finally(() => setHydrated(true));
  }, []);

  // Onboarding gate: open for brand-new anonymous visitors AND for authenticated
  // users who just signed up (Supabase session exists but the profile row's
  // `onboarded` flag is still false). We deliberately do NOT open during the
  // brief `loading` window — that would flash the overlay for returning auth
  // users before their session is verified.
  const isAnonymous = userState.status === "anonymous";
  const isAuthNotOnboarded =
    userState.status === "authenticated" && !userState.profile.onboarded;
  const needsOnboarding = isAnonymous || isAuthNotOnboarded;

  // Guest → authenticated auto-upgrade: when a user goes from guest to a
  // permanent account, they've already picked their name + teams during the
  // guest flow. Re-traversing onboarding is friction we can avoid — we merge
  // the localStorage guest profile into their fresh server profile and flip
  // `onboarded` to true automatically, so they land directly on /scores.
  //
  // If the merge fails we mark `autoUpgradeFailed` and fall through to the
  // normal onboarding overlay (which gets the same merged values as `initial`
  // below, so the user can retry manually).
  const [autoUpgradeFailed, setAutoUpgradeFailed] = useState(false);
  const upgradeFiredRef = useRef(false);
  const guestForUpgrade =
    isAuthNotOnboarded && !autoUpgradeFailed ? readGuestProfile() : null;
  const willAutoUpgrade =
    guestForUpgrade !== null && userState.status === "authenticated";

  // Onboarding stays closed during the auto-upgrade window. On success,
  // `onboarded` flips true and needsOnboarding becomes false naturally. On
  // failure, `autoUpgradeFailed` flips true → willAutoUpgrade becomes false
  // → the overlay opens with merged `initial` values for manual completion.
  const onboardingOpen =
    hydrated &&
    !willAutoUpgrade &&
    (manageMode || (needsOnboarding && !onboardingDismissed));

  // Global notification dispatcher — must live above the route tree so notifications
  // continue firing while the user is on any tab (or background-tab).
  const permission = usePermissionState();
  useGameNotifications(
    user?.follows ?? [],
    user?.notifications ?? DEFAULT_NOTIFICATIONS,
    permission,
  );

  // Auto-hide the bottom TabBar on scroll-down / reveal on scroll-up.
  // Tab routes only — detail routes don't render the TabBar.
  const lastScrollY = useRef(0);
  const [navHidden, setNavHidden] = useState(false);
  useEffect(() => {
    if (!isTabRoute) return;
    const onScroll = () => {
      const cur = window.scrollY;
      const delta = cur - lastScrollY.current;
      if (cur < 16) setNavHidden(false);
      else if (delta > 6) setNavHidden(true);
      else if (delta < -6) setNavHidden(false);
      lastScrollY.current = cur;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isTabRoute]);

  // Path change: reset auto-hide tracking (Next handles the actual scroll).
  useEffect(() => {
    lastScrollY.current = 0;
    setNavHidden(false);
  }, [pathname]);

  // iOS Safari (WebKit) intermittently keeps a stale composite layer for
  // <main> across a route swap — most visibly when leaving the absolutely
  // positioned, layer-promoted GameDetail/PlayerDetail/TeamDetail overlay back
  // to a tab screen like /scores. The next screen mounts in the DOM but isn't
  // painted until a touch or scroll forces a repaint.
  //
  // A *static* `transform: translateZ(0)` (the prior attempt) doesn't help:
  // pinning <main> to a permanent compositing layer means its cached texture is
  // exactly what goes stale, and a never-changing transform never triggers an
  // invalidation. Note too that changing a transform *value* only re-composites
  // the existing texture — it does not re-rasterize it. Only the promotion
  // transition `none → layer` forces WebKit to raster the current DOM.
  //
  // So on every navigation we toggle the transform: applying translateZ(0)
  // rasters the freshly mounted screen (it paints), and clearing it next frame
  // rasters back into the parent (invisibly) and resets the resting state so
  // the next nav's `none → layer` transition is again a real invalidation.
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    el.style.transform = "translateZ(0)";
    // Force a synchronous style/layout flush so the promotion (and its raster)
    // lands now instead of being coalesced away by the clear below.
    void el.offsetHeight;
    const raf = requestAnimationFrame(() => {
      el.style.transform = "";
    });
    return () => cancelAnimationFrame(raf);
  }, [pathname]);

  /** Auth-aware write. Authenticated users go through the `upsert_profile`
   *  RPC (which also refreshes the auth snapshot so the in-memory profile
   *  catches up); guests and anonymous users write to localStorage as
   *  before. Returns a Promise so callers that need to defer UI (e.g.
   *  dismissing the onboarding overlay) can await.
   *
   *  After a successful authenticated write we also clear the localStorage
   *  guest profile, if any. It's dead weight at that point — useUserState
   *  is reading from Supabase — and leaving it around would resurrect old
   *  guest state if the user later signed out and continued as guest. */
  const persist = async (next: UserProfile): Promise<void> => {
    if (userState.status === "authenticated") {
      await saveAuthenticatedProfile(next);
      clearUser();
    } else {
      saveUser(next);
    }
  };

  // Guest → authenticated auto-upgrade effect (paired with `willAutoUpgrade`
  // computed above). Fires once when conditions are met; resets and falls
  // through to manual onboarding on failure. `upgradeKey` provides a stable
  // dep — userState is a new object on every render so we can't depend on
  // it directly without making the effect re-fire endlessly.
  const upgradeKey =
    userState.status === "authenticated"
      ? `${userState.userId}:${userState.profile.onboarded}`
      : userState.status;
  useEffect(() => {
    if (!willAutoUpgrade) return;
    if (upgradeFiredRef.current) return;
    if (userState.status !== "authenticated" || !guestForUpgrade) return;

    upgradeFiredRef.current = true;
    const merged = mergeProfileForUpgrade(userState.profile, guestForUpgrade);
    persist({ ...merged, onboarded: true }).catch(() => {
      upgradeFiredRef.current = false;
      setAutoUpgradeFailed(true);
    });
    // userState + persist + guestForUpgrade are stable for this render —
    // re-running on every render would cause an upgrade loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [willAutoUpgrade, upgradeKey]);

  const toggleFollow = (abbr: string) => {
    if (!user) return;
    const follows = user.follows.includes(abbr)
      ? user.follows.filter((x) => x !== abbr)
      : [...user.follows, abbr];
    persist({ ...user, follows });
  };

  const openManage = () => setManageMode(true);

  const resetOnboarding = () => {
    clearUser();
    setManageMode(false);
    setOnboardingDismissed(false);
    router.push("/scores");
  };

  const dismissOnboarding = () => {
    setOnboardingDismissed(true);
    setManageMode(false);
  };

  const userName = user?.name ?? "Guest";

  // Navigate to a top-level tab. Tapping Search also pulls focus into the search
  // input. On a cross-route nav the SearchScreen autofocuses on mount, so this
  // rAF (element not yet mounted → no-op) only matters when Search is tapped
  // while already on /search, where there's no remount to trigger autofocus.
  const navigate = (id: string) => {
    router.push(`/${id}`);
    if (id === "search") {
      requestAnimationFrame(() => {
        document.getElementById(SEARCH_INPUT_ID)?.focus();
      });
    }
  };

  const shellState: ShellState = { user, persist, toggleFollow, openManage, resetOnboarding };

  return (
    <ShellContext.Provider value={shellState}>
      <div className="dl-app-root">
        <div className="relative w-full max-w-300 min-h-dvh flex flex-col bg-canvas">
          <TopBar
            tabs={TABS}
            current={tab ?? ""}
            onChange={navigate}
            userName={userName}
            onProfile={() => router.push("/settings")}
          />

          {userState.status === "guest" && <GuestNudgeBanner />}

          <main
            ref={mainRef}
            className={`relative flex-1 min-h-0 ${isTabRoute ? "pb-[calc(env(safe-area-inset-bottom,0)+76px)] md:pb-0" : ""}`}
          >
            {children}
          </main>

          {isTabRoute && !onboardingOpen && (
            <TabBar
              tabs={MOBILE_TABS}
              current={tab!}
              onChange={navigate}
              hidden={navHidden}
            />
          )}

          {onboardingOpen && (
            <Onboarding
              // Initial values for the form. Three cases:
              //  - manage mode (Settings → Manage Teams): seed from current profile
              //  - guest → auth upgrade: merge guest's localStorage data into the
              //    fresh server profile so the user doesn't re-enter their teams
              //  - all other cases (anonymous splash → guest): no initial values
              initial={
                manageMode && user
                  ? user
                  : isAuthNotOnboarded && userState.status === "authenticated"
                    ? mergeProfileForUpgrade(userState.profile, readGuestProfile())
                    : undefined
              }
              manageMode={manageMode}
              onDone={async (profile) => {
                await persist(profile);
                dismissOnboarding();
              }}
              onCancel={dismissOnboarding}
              // Only anonymous users see the "Create a profile vs guest" splash —
              // an authenticated-but-not-yet-onboarded user is already signed up
              // and just needs to pick teams.
              onSignUp={isAnonymous ? () => router.push("/login") : undefined}
            />
          )}
        </div>
      </div>
    </ShellContext.Provider>
  );
}
