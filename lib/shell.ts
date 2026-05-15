"use client";

import { createContext, useContext } from "react";
import type { UserProfile } from "@/lib/storage";

export interface ShellState {
  user: UserProfile | null;
  /** Persists a profile update. Authenticated writes go through the Supabase
   *  RPC and return Promise<void> for proper await; localStorage writes are
   *  effectively synchronous. Callers that don't need to defer UI can fire
   *  without awaiting. */
  persist: (next: UserProfile) => Promise<void>;
  toggleFollow: (abbr: string) => void;
  openManage: () => void;
  resetOnboarding: () => void;
}

export const ShellContext = createContext<ShellState | null>(null);

export function useShell(): ShellState {
  const v = useContext(ShellContext);
  if (!v) throw new Error("useShell must be used within ShellLayout");
  return v;
}

/**
 * Back button handler that prefers in-app history but falls back to a sensible
 * parent route when the user landed via a shared link (no prior history).
 *
 * Why: window.history.length is 1 only on a fresh tab — any in-app push
 * appends to the stack, so `> 1` reliably distinguishes a direct landing.
 */
export function smartBack(
  router: { back: () => void; push: (url: string) => void },
  fallback: string,
) {
  if (typeof window !== "undefined" && window.history.length > 1) router.back();
  else router.push(fallback);
}
