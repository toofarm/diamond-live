"use client";

import { useRouter } from "next/navigation";
import { SettingsScreen, type AuthInfo } from "@/components/screens/SettingsScreen";
import { useShell } from "@/lib/shell";
import {
  DEFAULT_NOTIFICATIONS,
  DEFAULT_PREFS,
  refreshAuthSnapshot,
  useUserState,
  type DisplayPrefs,
  type NotificationPrefs,
} from "@/lib/storage";
import { usePermissionState } from "@/lib/notifications";
import { signOut } from "@/app/auth/actions";

export default function Page() {
  const router = useRouter();
  const { user, persist, toggleFollow, openManage, resetOnboarding } = useShell();
  const userState = useUserState();
  const permission = usePermissionState();

  const authInfo: AuthInfo =
    userState.status === "authenticated"
      ? { status: "authenticated", email: userState.email }
      : { status: "guest" };

  const handleSignOut = async () => {
    await signOut();
    // The server action cleared the cookies, but as with sign-in, the
    // client-side auth store needs to be told to re-read since its
    // onAuthStateChange listener only fires for browser-client-initiated
    // changes. Refresh first, then nav. Land on /login (not /scores) so
    // a signed-out user sees the auth surface, not the splash flow.
    await refreshAuthSnapshot();
    router.push("/login");
    router.refresh();
  };

  return (
    <SettingsScreen
      name={user?.name ?? "Guest"}
      follows={user?.follows ?? []}
      notifications={user?.notifications ?? DEFAULT_NOTIFICATIONS}
      permission={permission}
      prefs={user?.prefs ?? DEFAULT_PREFS}
      authInfo={authInfo}
      onUpdateName={(name) => user && persist({ ...user, name })}
      onToggleFollow={toggleFollow}
      onManageFollows={openManage}
      onResetOnboarding={resetOnboarding}
      onUpdateNotifications={(next: NotificationPrefs) => user && persist({ ...user, notifications: next })}
      onUpdatePrefs={(next: DisplayPrefs) => user && persist({ ...user, prefs: next })}
      onSignOut={handleSignOut}
      onChangePassword={() => router.push("/reset-password")}
      onUpgradeToProfile={() => router.push("/login")}
    />
  );
}
