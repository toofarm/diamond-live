"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wordmark } from "@/components/ui/primitives";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { updatePassword } from "@/app/auth/actions";

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);

  const passwordOk = password.length >= 6;
  const passwordsMatch = passwordOk && password === confirm;
  const canSubmit = passwordsMatch && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setMessage(null);
    setBusy(true);
    const result = await updatePassword(password);
    setBusy(false);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.error ?? "Something went wrong." });
      return;
    }
    // updateUser keeps the user signed in; just bounce them into the app.
    // router.refresh() ensures any server-rendered auth-aware UI catches up.
    router.push("/scores");
    router.refresh();
  };

  return (
    <div className="dl-app-root">
      <div className="relative w-full max-w-[480px] min-h-[100dvh] flex flex-col bg-canvas px-6">
        <div className="shrink-0 pt-[calc(env(safe-area-inset-top,0)+40px)]">
          <Wordmark />
          <h1 className="mt-7 font-head text-[32px] font-bold tracking-[-1.2px] leading-[1.05] text-ink">
            Set a new<br />password.
          </h1>
          <p className="mt-2.5 text-sm text-ink-2 leading-normal max-w-[320px]">
            Choose a password at least 6 characters long.
          </p>
        </div>

        <form onSubmit={submit} className="mt-7 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="font-ui text-[11px] font-bold tracking-[1.4px] uppercase text-ink-3">
              New password
            </span>
            <PasswordInput
              autoComplete="new-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="font-ui text-[11px] font-bold tracking-[1.4px] uppercase text-ink-3">
              Confirm password
            </span>
            <PasswordInput
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-enter the password above"
            />
            {password.length > 0 && confirm.length > 0 && !passwordsMatch && (
              <span className="text-[11px] text-neg">Passwords don&rsquo;t match.</span>
            )}
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
            {busy ? "Updating…" : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}
