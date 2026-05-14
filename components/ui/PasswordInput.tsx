"use client";

import { useState } from "react";

interface PasswordInputProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  autoComplete?: string;
  autoFocus?: boolean;
  placeholder?: string;
}

/**
 * Password input with an in-field "Show / Hide" toggle. The toggle flips
 * the underlying input between `type="password"` and `type="text"` and is
 * deliberately a text-only affordance (rather than an eye icon) to match
 * the existing form aesthetic — small caps, ink-3 muted color, lives in
 * the same visual register as the section labels.
 *
 * Visibility state is local to this component, so when the user toggles
 * "Show" on the new-password field it doesn't reveal the confirm field —
 * they're independent. This matches the standard behavior in most apps.
 */
export function PasswordInput({
  value,
  onChange,
  autoComplete,
  autoFocus,
  placeholder,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full bg-surface rounded-[12px] border border-line pl-3.5 pr-14 py-3 text-ink text-[16px] font-ui outline-none focus:border-accent"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        data-cy="password-visibility-toggle"
        className="absolute right-2.5 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer font-ui text-[11px] font-bold tracking-[1px] uppercase text-ink-3 px-1.5 py-1"
      >
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  );
}
