"use client";

import { useMemo, useState } from "react";
import { TEAMS } from "@/lib/mlb/teams";
import { Wordmark, TeamBadge } from "@/components/ui/primitives";
import { IconSearch, IconCheck } from "@/components/ui/icons";
import { DEFAULT_NOTIFICATIONS, DEFAULT_PREFS, type UserProfile } from "@/lib/storage";

interface Props {
  onDone: (profile: UserProfile) => void;
  /** Pre-populated starting values for name / follows / notifications / prefs.
   *  Used by:
   *   - Settings "manage teams" (passes the current user profile)
   *   - The guest → authenticated upgrade flow (passes the merged profile
   *     from `mergeProfileForUpgrade`)
   *  Providing `initial` no longer implies manage-mode — pair with the
   *  `manageMode` prop when you want to skip to step 2. */
  initial?: UserProfile;
  /** When true, jumps directly to step 2 (team picker) and switches the
   *  CTA copy to "Cancel" / "Confirm selections" — used by the Settings
   *  → "Manage teams" entry point. Defaults to false. */
  manageMode?: boolean;
  onCancel?: () => void;
  /** When provided, the flow opens with a splash that lets the user pick
   *  between creating a profile (fires `onSignUp` — typically a navigation
   *  to /login) and continuing as a guest (proceeds to the name + teams
   *  flow). Omit to skip the splash and start at step 1 directly. */
  onSignUp?: () => void;
}

const overlayClass =
  "fixed inset-0 max-w-[1200px] mx-auto bg-canvas flex flex-col z-20";

const ctaWrapClass =
  "absolute bottom-0 inset-x-0 px-6 pt-3.5 pb-[calc(env(safe-area-inset-bottom,0)+28px)] " +
  "bg-[linear-gradient(180deg,transparent,var(--color-canvas)_22%)]";

const ctaBaseClass =
  "flex-1 px-4 py-[14px] rounded-[14px] border-none font-head text-[15px] font-semibold tracking-[-0.2px]";

const secondaryBtnClass =
  "px-4 py-[14px] bg-chip text-ink border border-line rounded-[14px] cursor-pointer font-head text-[15px] font-semibold tracking-[-0.2px] " +
  "basis-[36%] shrink-0 grow-0";

export function Onboarding({ onDone, initial, manageMode = false, onCancel, onSignUp }: Props) {
  const showSplash = !manageMode && !!onSignUp;
  const [step, setStep] = useState<0 | 1 | 2>(manageMode ? 2 : showSplash ? 0 : 1);
  const [name, setName] = useState(initial?.name ?? "");
  const [selected, setSelected] = useState<string[]>(initial?.follows ?? []);
  const [query, setQuery] = useState("");

  const toggle = (abbr: string) =>
    setSelected((s) => (s.includes(abbr) ? s.filter((x) => x !== abbr) : [...s, abbr]));

  const groups = useMemo(() => {
    const al: typeof TEAMS[string][] = [];
    const nl: typeof TEAMS[string][] = [];
    const q = query.trim().toLowerCase();
    for (const t of Object.values(TEAMS)) {
      if (!q || `${t.city} ${t.name} ${t.abbr}`.toLowerCase().includes(q)) {
        (t.league === "AL" ? al : nl).push(t);
      }
    }
    al.sort((a, b) => a.city.localeCompare(b.city));
    nl.sort((a, b) => a.city.localeCompare(b.city));
    return { al, nl };
  }, [query]);

  /* ── Step 0: splash — sign up vs continue as guest ─────────── */
  if (step === 0 && onSignUp) {
    return (
      <div data-cy="onboarding-splash" className={overlayClass}>
        <div className="shrink-0 pt-[calc(env(safe-area-inset-top,0)+40px)] px-6 pb-2">
          <Wordmark />
          <h1 className="mt-7 font-head text-[32px] font-bold tracking-[-1.2px] leading-[1.05] text-ink">
            Welcome to<br />Game State.
          </h1>
          <p className="mt-2.5 text-sm text-ink-2 leading-normal max-w-[320px]">
            Create a profile to sync your follows and preferences across devices, or continue as a guest to keep everything on this device.
          </p>
        </div>
        <div className="flex-1" />
        <div className={ctaWrapClass}>
          <button
            data-cy="splash-signup"
            onClick={onSignUp}
            className={`${ctaBaseClass} w-full bg-accent text-white cursor-pointer mb-2.5`}
          >
            Create a profile
          </button>
          <button
            data-cy="splash-guest"
            onClick={() => setStep(1)}
            className={`${ctaBaseClass} w-full bg-chip text-ink border border-line cursor-pointer`}
          >
            Continue as guest
          </button>
          <SignInFallback onSignIn={onSignUp} />
        </div>
      </div>
    );
  }

  /* ── Step 1: name ─────────────────────────────────────────── */
  if (step === 1) {
    const trimmed = name.trim();
    return (
      <div className={overlayClass}>
        <div className="shrink-0 pt-[calc(env(safe-area-inset-top,0)+40px)] px-6 pb-2">
          <Wordmark />
          <h1 className="mt-7 font-head text-[32px] font-bold tracking-[-1.2px] leading-[1.05] text-ink">
            What&rsquo;s your<br />name?
          </h1>
          <p className="mt-2.5 text-sm text-ink-2 leading-normal max-w-[280px]">
            We&rsquo;ll show this on your profile. You can change it later in Settings.
          </p>
          <div className="mt-6 bg-surface rounded-[12px] border border-line px-3.5 py-3">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              onKeyDown={(e) => {
                if (e.key === "Enter" && trimmed) setStep(2);
              }}
              className="w-full bg-transparent outline-none border-none text-ink text-[18px] font-head font-medium tracking-[-0.3px]"
            />
          </div>
        </div>
        <div className="flex-1" />
        <div className={ctaWrapClass}>
          <button
            onClick={() => trimmed && setStep(2)}
            disabled={!trimmed}
            className={`${ctaBaseClass} w-full ${
              trimmed ? "bg-accent text-white cursor-pointer" : "bg-chip text-ink-3 cursor-default"
            }`}
          >
            Continue
          </button>
          <SignInFallback onSignIn={onSignUp} />
        </div>
      </div>
    );
  }

  /* ── Step 2: teams ────────────────────────────────────────── */
  return (
    <div className={overlayClass}>
      <div className="shrink-0 pt-[calc(env(safe-area-inset-top,0)+40px)] px-6 pb-2">
        <Wordmark />
        <h1 className="mt-7 font-head text-[32px] font-bold tracking-[-1.2px] leading-[1.05] text-ink">
          {manageMode ? (
            <>Manage your<br />teams.</>
          ) : (
            <>Follow your<br />teams.</>
          )}
        </h1>
        <p className="mt-2.5 text-sm text-ink-2 leading-normal max-w-[280px]">
          {manageMode
            ? "Adjust which clubs you follow. Changes apply when you confirm."
            : "Pick the clubs you want to track. We'll surface their games at the top of your feed."}
        </p>
        <div className="mt-[18px] flex items-center gap-2 bg-surface rounded-[12px] border border-line px-3 py-2.5">
          <IconSearch size={16} stroke="var(--color-ink-3)" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search teams"
            className="flex-1 bg-transparent outline-none border-none text-ink text-sm font-ui"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pt-2 px-6 pb-[140px]">
        {[
          ["American League", groups.al] as const,
          ["National League", groups.nl] as const,
        ].map(([title, list]) => (
          <div key={title} className="mt-[18px]">
            <div className="font-head text-[11px] font-semibold tracking-[1.4px] uppercase text-ink-3 mb-2.5">
              {title}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {list.map((t) => {
                const on = selected.includes(t.abbr);
                return (
                  <button
                    key={t.abbr}
                    onClick={() => toggle(t.abbr)}
                    className={`flex items-center gap-2.5 p-2.5 rounded-[12px] cursor-pointer text-left font-ui transition-all ${
                      on
                        ? "bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)] border-[1.5px] border-accent"
                        : "bg-surface border-[1.5px] border-line"
                    }`}
                  >
                    <TeamBadge abbr={t.abbr} size={28} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] text-ink-3 font-medium">{t.city}</div>
                      <div className="font-head text-sm font-semibold text-ink tracking-[-0.2px] whitespace-nowrap overflow-hidden text-ellipsis">
                        {t.name}
                      </div>
                    </div>
                    {on && <IconCheck size={16} stroke="var(--color-accent)" sw={2.4} />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className={ctaWrapClass}>
        <div className="flex items-center justify-between mb-2.5 text-xs text-ink-2 font-ui">
          <span>
            {selected.length} team{selected.length !== 1 ? "s" : ""} selected
          </span>
          {!manageMode && (
            <button
              onClick={() => onDone({
                name: name.trim() || "Guest",
                follows: [],
                notifications: DEFAULT_NOTIFICATIONS,
                prefs: DEFAULT_PREFS,
                onboarded: true,
              })}
              className="bg-transparent border-none cursor-pointer text-ink-3 text-xs font-ui p-0"
            >
              Skip
            </button>
          )}
        </div>
        <div className="flex gap-2.5">
          {manageMode ? (
            <button onClick={() => onCancel?.()} className={`${secondaryBtnClass} cursor-pointer`}>
              Cancel
            </button>
          ) : (
            <button onClick={() => setStep(1)} className={`${secondaryBtnClass} cursor-pointer`}>
              Back
            </button>
          )}
          <button
            onClick={() => onDone({
              name: name.trim() || initial?.name || "Guest",
              follows: selected,
              notifications: initial?.notifications ?? DEFAULT_NOTIFICATIONS,
              prefs: initial?.prefs ?? DEFAULT_PREFS,
              onboarded: true,
            })}
            disabled={!manageMode && selected.length === 0}
            className={`${ctaBaseClass} ${
              !manageMode && selected.length === 0
                ? "bg-chip text-ink-3 cursor-default"
                : "bg-accent text-white cursor-pointer"
            }`}
          >
            {manageMode ? "Confirm selections" : "Continue to scores"}
          </button>
        </div>
        <SignInFallback onSignIn={onSignUp} />
      </div>
    </div>
  );
}

/**
 * Subtle "already have a profile? Sign in" link rendered below the primary
 * onboarding CTAs. Gated on `onSignIn` being defined so it only appears for
 * truly anonymous users — manageMode (re-pick teams from Settings) and the
 * authenticated-not-onboarded path both pass undefined and get nothing.
 *
 * Intentionally a text link rather than a button — the primary action on
 * each step is "continue with the current flow"; this is a fail-safe for
 * someone who reached onboarding erroneously.
 */
function SignInFallback({ onSignIn }: { onSignIn: (() => void) | undefined }) {
  if (!onSignIn) return null;
  return (
    <p
      data-cy="onboarding-signin-fallback"
      className="mt-3 text-center text-[12px] text-ink-3 font-ui"
    >
      Already have a profile?{" "}
      <button
        type="button"
        data-cy="onboarding-signin-link"
        onClick={onSignIn}
        className="bg-transparent border-none p-0 cursor-pointer text-accent font-semibold"
      >
        Sign in
      </button>
    </p>
  );
}
