"use client";

import { useState } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/ui/primitives";
import { requestPasswordReset } from "@/app/auth/actions";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);

  const trimmed = email.trim();
  const canSubmit = trimmed.length > 0 && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setMessage(null);
    setBusy(true);
    // Pass window.location.origin so the server action can construct the
    // absolute redirect URL Supabase needs — avoids parsing forwarded-host
    // headers on the server, and works correctly in dev/preview/prod.
    const result = await requestPasswordReset(trimmed, window.location.origin);
    setBusy(false);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.error ?? "Something went wrong." });
      return;
    }
    setMessage({
      tone: "info",
      text: "Check your email — we sent you a password reset link.",
    });
  };

  return (
    <div className="dl-app-root">
      <div className="relative w-full max-w-[480px] min-h-[100dvh] flex flex-col bg-canvas px-6">
        <div className="shrink-0 pt-[calc(env(safe-area-inset-top,0)+40px)]">
          <Wordmark />
          <h1 className="mt-7 font-head text-[32px] font-bold tracking-[-1.2px] leading-[1.05] text-ink">
            Reset your<br />password.
          </h1>
          <p className="mt-2.5 text-sm text-ink-2 leading-normal max-w-[320px]">
            Enter the email you signed up with. We&rsquo;ll send you a link to set a new password.
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
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="bg-surface rounded-[12px] border border-line px-3.5 py-3 text-ink text-[16px] font-ui outline-none focus:border-accent"
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
            {busy ? "Sending…" : "Send reset link"}
          </button>
        </form>

        <div className="flex-1" />

        <div className="pb-[calc(env(safe-area-inset-bottom,0)+28px)] pt-6 text-center">
          <Link
            href="/login"
            data-cy="back-to-login"
            className="text-sm text-accent font-semibold no-underline"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
