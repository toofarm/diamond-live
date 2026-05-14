"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Wordmark } from "@/components/ui/primitives";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { signInWithPassword, signUpWithPassword } from "@/app/auth/actions";
import { refreshAuthSnapshot } from "@/lib/storage";

type Mode = "signin" | "signup";

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);

  const trimmedEmail = email.trim();
  const canSubmit = trimmedEmail.length > 0 && password.length >= 6 && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setMessage(null);
    setBusy(true);
    const result =
      mode === "signin"
        ? await signInWithPassword(trimmedEmail, password)
        : await signUpWithPassword(trimmedEmail, password);
    setBusy(false);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.error ?? "Something went wrong. Try again." });
      return;
    }
    if (mode === "signup" && result.needsConfirm) {
      // Email confirmation required — flip the form to sign-in and surface a
      // calm next-step message. The user clicks the link in their email, then
      // returns here to sign in.
      setMessage({
        tone: "info",
        text: "Check your email to confirm your account, then sign in here.",
      });
      setMode("signin");
      setPassword("");
      return;
    }
    // Auth succeeded with a live session. The server action set the session
    // cookies, but the client-side auth store's `onAuthStateChange` listener
    // only fires for events triggered by this same browser-client instance —
    // server-action sign-ins are invisible to it. Force the store to re-probe
    // BEFORE we navigate, so the destination route renders with the correct
    // `useUserState()` value on its very first paint (no onboarding flash).
    await refreshAuthSnapshot();
    router.push("/scores");
    router.refresh();
  };

  return (
    <div className="dl-app-root">
      <div className="relative w-full max-w-[480px] min-h-[100dvh] flex flex-col bg-canvas px-6">
        <div className="shrink-0 pt-[calc(env(safe-area-inset-top,0)+40px)]">
          <Wordmark />
          <h1 className="mt-7 font-head text-[32px] font-bold tracking-[-1.2px] leading-[1.05] text-ink">
            {mode === "signin" ? <>Welcome<br />back.</> : <>Create your<br />profile.</>}
          </h1>
          <p className="mt-2.5 text-sm text-ink-2 leading-normal max-w-[320px]">
            {mode === "signin"
              ? "Sign in to sync your follows and preferences across devices."
              : "Your follows, preferences, and notification settings will sync everywhere you sign in."}
          </p>
        </div>

        <form onSubmit={submit} className="mt-7 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="font-ui text-[11px] font-bold tracking-[1.4px] uppercase text-ink-3">
              Email
            </span>
            <input
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="bg-surface rounded-[12px] border border-line px-3.5 py-3 text-ink text-[16px] font-ui outline-none focus:border-accent"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between">
              <span className="font-ui text-[11px] font-bold tracking-[1.4px] uppercase text-ink-3">
                Password
              </span>
              {mode === "signin" && (
                <Link
                  href="/forgot-password"
                  data-cy="forgot-password-link"
                  className="text-[11px] text-accent font-semibold no-underline"
                >
                  Forgot?
                </Link>
              )}
            </div>
            <PasswordInput
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "signup" ? "At least 6 characters" : "Your password"}
            />
          </label>

          {message && (
            <div
              data-cy={message.tone === "error" ? "auth-error" : "auth-info"}
              className={`mt-1 rounded-[10px] px-3 py-2 text-[13px] font-ui leading-snug ${
                message.tone === "error"
                  ? "bg-[color-mix(in_srgb,var(--color-neg)_10%,transparent)] text-neg"
                  : "bg-chip text-ink-2"
              }`}
            >
              {message.text}
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className={`mt-2 px-4 py-[14px] rounded-[14px] border-none font-head text-[15px] font-semibold tracking-[-0.2px] ${
              canSubmit
                ? "bg-accent text-white cursor-pointer"
                : "bg-chip text-ink-3 cursor-default"
            }`}
          >
            {busy
              ? mode === "signin"
                ? "Signing in…"
                : "Creating account…"
              : mode === "signin"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>

        <div className="mt-4 text-center text-sm text-ink-2 font-ui">
          {mode === "signin" ? (
            <>
              No account yet?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("signup");
                  setMessage(null);
                }}
                className="bg-transparent border-none p-0 cursor-pointer text-accent font-semibold"
              >
                Create one
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setMessage(null);
                }}
                className="bg-transparent border-none p-0 cursor-pointer text-accent font-semibold"
              >
                Sign in
              </button>
            </>
          )}
        </div>

        <div className="flex-1" />

        <div className="pb-[calc(env(safe-area-inset-bottom,0)+28px)] pt-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-line-2" />
            <span className="font-mono text-[10px] text-ink-3 tracking-[1.4px] uppercase">or</span>
            <div className="flex-1 h-px bg-line-2" />
          </div>
          <Link
            href="/scores"
            data-cy="continue-as-guest"
            className="block w-full text-center px-4 py-[14px] rounded-[14px] bg-chip text-ink border border-line no-underline font-head text-[15px] font-semibold tracking-[-0.2px]"
          >
            Continue as guest
          </Link>
          <p className="mt-2.5 text-center text-[11px] text-ink-3 leading-relaxed">
            Guests can use the full app, but follows and preferences only live on this device.
          </p>
        </div>
      </div>
    </div>
  );
}
