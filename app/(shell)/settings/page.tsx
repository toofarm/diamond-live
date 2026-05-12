"use client";

import { SettingsScreen } from "@/components/screens/SettingsScreen";
import { useShell } from "@/lib/shell";
import { DEFAULT_NOTIFICATIONS, DEFAULT_PREFS, type DisplayPrefs, type NotificationPrefs } from "@/lib/storage";
import { usePermissionState } from "@/lib/notifications";

export default function Page() {
  const { user, persist, toggleFollow, openManage, resetOnboarding } = useShell();
  const permission = usePermissionState();
  return (
    <SettingsScreen
      name={user?.name ?? "Guest"}
      follows={user?.follows ?? []}
      notifications={user?.notifications ?? DEFAULT_NOTIFICATIONS}
      permission={permission}
      prefs={user?.prefs ?? DEFAULT_PREFS}
      onUpdateName={(name) => user && persist({ ...user, name })}
      onToggleFollow={toggleFollow}
      onManageFollows={openManage}
      onResetOnboarding={resetOnboarding}
      onUpdateNotifications={(next: NotificationPrefs) => user && persist({ ...user, notifications: next })}
      onUpdatePrefs={(next: DisplayPrefs) => user && persist({ ...user, prefs: next })}
    />
  );
}
