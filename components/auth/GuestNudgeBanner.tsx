"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Toast } from "@/components/ui/Toast";

const STORAGE_KEY = "dl_guest_nudge_until";
const COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours

/** Read the dismiss cooldown from localStorage. Returns true (banner visible)
 *  when no timestamp is set, when the timestamp is in the past, or when the
 *  stored value is malformed. SSR-safe — returns false when window is missing,
 *  but this function only runs on the client because the shell gates the
 *  banner behind `userState.status === "guest"`, which itself reads
 *  localStorage and so won't resolve to "guest" during SSR. */
function readVisibility(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const until = raw ? Number(raw) : 0;
    return !Number.isFinite(until) || Date.now() > until;
  } catch {
    return true;
  }
}

/**
 * Guest-mode prompt to create a profile. Uses the `push` variant of `<Toast>`
 * — warm accent-tinted, friendly tone. Dismissing writes `now + 4h` to
 * localStorage, suppressing re-appearance until the cooldown expires.
 *
 * Mounted by the shell layout conditionally on `userState.status === "guest"`,
 * so it never appears for authenticated, anonymous, or loading states.
 *
 * Visibility uses `useState` lazy-init (not an effect) so the read is
 * synchronous on first render and the linter doesn't flag a cascading-render
 * pattern. Safe because the component only mounts after the guest user state
 * has resolved, which itself is client-side.
 */
export function GuestNudgeBanner() {
  const router = useRouter();
  const [visible, setVisible] = useState<boolean>(readVisibility);

  const dismiss = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(Date.now() + COOLDOWN_MS));
    } catch {
      // localStorage disabled — banner hides for the session but the cooldown
      // doesn't persist. Acceptable degradation.
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      data-cy="guest-nudge-banner"
      // Floating below the TopBar (height ≈ safe-area + 58–62px). On wide
      // screens we centered-cap the width so the toast doesn't span the full
      // 1200px shell.
      className="fixed left-3.5 right-3.5 md:left-6 md:right-6 z-50 mx-auto max-w-160"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 80px)" }}
    >
      <Toast
        variant="push"
        message="Create a profile to sync across devices"
        cta={{ label: "Sign up", onClick: () => router.push("/login") }}
        onDismiss={dismiss}
      />
    </div>
  );
}
