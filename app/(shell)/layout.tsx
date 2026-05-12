"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useUser, saveUser, clearUser, DEFAULT_NOTIFICATIONS, type UserProfile } from "@/lib/storage";
import { TabBar, TopBar } from "@/components/ui/primitives";
import { IconScores, IconStandings, IconSchedule, IconLeaders, IconSettings } from "@/components/ui/icons";
import { Onboarding } from "@/components/onboarding/Onboarding";
import { ShellContext, type ShellState } from "@/lib/shell";
import { useGameNotifications, usePermissionState } from "@/lib/notifications";

const TABS = [
  { id: "scores",    label: "Scores",    icon: IconScores },
  { id: "standings", label: "Standings", icon: IconStandings },
  { id: "schedule",  label: "Schedule",  icon: IconSchedule },
  { id: "leaders",   label: "Leaders",   icon: IconLeaders },
  { id: "settings",  label: "Settings",  icon: IconSettings },
];

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
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [manageMode, setManageMode] = useState(false);
  // `useUser` is backed by useSyncExternalStore with a `() => null` server
  // snapshot, so `user` reads as null on SSR and the first client render even
  // when a profile exists in localStorage. Wait one effect tick before letting
  // the onboarding overlay open so returning users don't see it flash on mount.
  const [hydrated, setHydrated] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- post-mount hydration flag; React's canonical SSR-skew pattern
  useEffect(() => setHydrated(true), []);
  const onboardingOpen = hydrated && (manageMode || (user == null && !onboardingDismissed));

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

  const persist = (next: UserProfile) => saveUser(next);

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

  const shellState: ShellState = { user, persist, toggleFollow, openManage, resetOnboarding };

  return (
    <ShellContext.Provider value={shellState}>
      <div className="dl-app-root">
        <div className="relative w-full max-w-[1200px] min-h-[100dvh] flex flex-col bg-canvas">
          <TopBar
            tabs={TABS}
            current={tab ?? ""}
            onChange={(id) => router.push(`/${id}`)}
            userName={userName}
            onProfile={() => router.push("/settings")}
          />

          <main
            className={`relative flex-1 min-h-0 ${isTabRoute ? "pb-[calc(env(safe-area-inset-bottom,0)+76px)] md:pb-0" : ""}`}
          >
            {children}
          </main>

          {isTabRoute && !onboardingOpen && (
            <TabBar
              tabs={TABS}
              current={tab!}
              onChange={(id) => router.push(`/${id}`)}
              hidden={navHidden}
            />
          )}

          {onboardingOpen && (
            <Onboarding
              initial={manageMode && user ? user : undefined}
              onDone={(profile) => {
                persist(profile);
                dismissOnboarding();
              }}
              onCancel={dismissOnboarding}
            />
          )}
        </div>
      </div>
    </ShellContext.Provider>
  );
}
