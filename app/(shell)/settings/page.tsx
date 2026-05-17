"use client";

import { useRouter } from "next/navigation";
import { SettingsScreen, type AuthInfo } from "@/components/screens/SettingsScreen";
import { useShell } from "@/lib/shell";
import {
  DEFAULT_NOTIFICATIONS,
  DEFAULT_PREFS,
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
    // The server action wipes the session cookies and issues a 303 to /login.
    // No client-side push/refresh — those raced on iOS Safari and blanked
    // the destination. The browser auth snapshot is left stale here on
    // purpose: it'll be re-probed by the (shell) layout's mount effect the
    // next time the user re-enters a shell route (sign back in, or continue
    // as guest then a tab route).
    await signOut();
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
