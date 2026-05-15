"use client";

import { IconClose } from "@/components/ui/icons";

export type ToastVariant = "push" | "notification" | "error";

interface ToastProps {
  variant: ToastVariant;
  message: React.ReactNode;
  cta?: { label: string; onClick: () => void };
  onDismiss?: () => void;
}

/**
 * Visual primitive for in-app toast banners. Three variants:
 *
 *  - `push`         — warm accent-tinted, used for promotional CTAs
 *                     (sign-up nudge, upgrade prompts, etc.). Friendly.
 *  - `notification` — neutral surface, used for app updates and informational
 *                     messages ("New version available", "Settings saved").
 *  - `error`        — abrasive red with a strong border, used for app-wide
 *                     error states ("Couldn't connect", "Action failed").
 *                     Renders with `role="alert"` so screen readers announce
 *                     it immediately; the other variants use `role="status"`
 *                     for polite announcement.
 *
 * Positioning is intentionally left to the caller — wrap in a fixed/sticky
 * container, embed inline, or stack via a future ToastContainer. Each
 * variant ships its own CTA-button color so the action's visual weight
 * tracks the toast's tone (accent push, ink-dark notification, neg error).
 */
const VARIANT_STYLES: Record<ToastVariant, {
  bg: string;
  borderColor: string;
  ctaBg: string;
  role: "status" | "alert";
}> = {
  push: {
    bg: "color-mix(in srgb, var(--color-accent) 6%, var(--color-surface))",
    borderColor: "var(--color-line)",
    ctaBg: "var(--color-accent)",
    role: "status",
  },
  notification: {
    bg: "var(--color-surface)",
    borderColor: "var(--color-line)",
    ctaBg: "var(--color-ink)",
    role: "status",
  },
  error: {
    bg: "color-mix(in srgb, var(--color-neg) 12%, var(--color-surface))",
    borderColor: "color-mix(in srgb, var(--color-neg) 45%, transparent)",
    ctaBg: "var(--color-neg)",
    role: "alert",
  },
};

export function Toast({ variant, message, cta, onDismiss }: ToastProps) {
  const styles = VARIANT_STYLES[variant];
  return (
    <div
      data-cy={`toast-${variant}`}
      role={styles.role}
      className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl border shadow-sm"
      style={{ background: styles.bg, borderColor: styles.borderColor }}
    >
      <div className="flex-1 min-w-0 font-head text-[13px] font-semibold text-ink tracking-[-0.2px]">
        {message}
      </div>
      {cta && (
        <button
          data-cy="toast-cta"
          onClick={cta.onClick}
          className="shrink-0 px-3 py-1.5 text-white rounded-lg border-none cursor-pointer font-head text-[12px] font-semibold tracking-[-0.2px]"
          style={{ background: styles.ctaBg }}
        >
          {cta.label}
        </button>
      )}
      {onDismiss && (
        <button
          data-cy="toast-dismiss"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 p-1 bg-transparent border-none cursor-pointer text-ink-3"
        >
          <IconClose size={16} />
        </button>
      )}
    </div>
  );
}
