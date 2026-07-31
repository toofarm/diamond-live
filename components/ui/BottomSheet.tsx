"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconClose } from "@/components/ui/icons";

/** Matches the app shell's inner container (`max-w-300` in (shell)/layout.tsx).
 *  Past this width the card stops growing and centers over the app instead of
 *  running wider than the content it's covering. */
const SHELL_MAX_PX = 1200;

/** The app's content-column cap (`max-w-[900px]` on every detail screen). The
 *  card itself widens to the shell, but its rows stay in this column — a table
 *  stretched across 1200px leaves a dead gap between its middle and right
 *  columns. */
const CONTENT_MAX_PX = 900;

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Small line under the title — season label, row count, etc. */
  subtitle?: string;
  /** data-cy for the card itself. The click-outside targets get
   *  `${testId}-scrim` (the strip) and `${testId}-gutter` (the desktop sides). */
  testId?: string;
  /** Height of the exposed scrim strip above the card, in px. */
  stripPx?: number;
  /** Width at which the card stops spanning the viewport and centers. */
  maxWidthPx?: number;
  /** Width cap for the content inside the card. */
  contentMaxWidthPx?: number;
  children: React.ReactNode;
}

/**
 * Bottom-launched sheet — an "index card" laid over the app.
 *
 * Deliberately not a lightbox: below the shell width the card runs edge-to-edge
 * and covers everything but a thin semi-opaque strip at the top, which is the
 * only cue that content still sits underneath. Escape, the close button in the
 * card's top-right corner, and clicking any exposed scrim all dismiss it.
 *
 * The scrim is split in two on purpose:
 *   - one full-viewport layer does the blur and dim. It has to sit *behind the
 *     card as well*, or the transparent notches outside the rounded top corners
 *     expose sharp, undimmed content while everything around them is blurred.
 *   - transparent hit-targets cover only what's actually exposed (the strip,
 *     plus the side gutters once the card is clamped). A full-viewport button
 *     would be mostly un-clickable — its center sits under the card.
 *
 * Portaled to <body> because every detail screen that would host one is an
 * `absolute inset-0 overflow-hidden` overlay — rendering in place would clip
 * the card to the scroll container it was opened from.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  subtitle,
  testId,
  stripPx = 56,
  maxWidthPx = SHELL_MAX_PX,
  contentMaxWidthPx = CONTENT_MAX_PX,
  children,
}: BottomSheetProps) {
  const titleId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<Element | null>(null);

  // `present` outlives `open` by one animation so the card can slide back down
  // instead of vanishing. `closing` picks the exit keyframes.
  const [present, setPresent] = useState(open);
  const [closing, setClosing] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setPresent(true);
      setClosing(false);
    } else if (present) {
      setClosing(true);
    }
  }

  const settle = () => {
    setPresent(false);
    setClosing(false);
  };

  // Backstop for the exit: `animationend` doesn't fire if the card is never
  // painted (hidden tab, reduced-motion edge cases), which would strand the
  // sheet in the DOM forever.
  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(settle, 500);
    return () => clearTimeout(timer);
  }, [closing]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Pull focus into the sheet on open, hand it back on close. The card itself
  // takes focus rather than the close button — same announcement for assistive
  // tech, without parking a focus ring on the X the moment the sheet opens.
  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement;
    cardRef.current?.focus();
    return () => {
      const el = restoreFocusRef.current;
      if (el instanceof HTMLElement) el.focus();
    };
  }, [open]);

  // Nothing is portaled until the sheet has actually been opened, so the
  // `document` guard is a formality rather than a hydration concern: a closed
  // sheet renders null on the server and on the first client pass alike.
  if (!present || typeof document === "undefined") return null;

  const stripHeight = `calc(env(safe-area-inset-top, 0px) + ${stripPx}px)`;
  // Distance from each viewport edge to the clamped card. Resolves negative on
  // viewports narrower than the clamp, where the browser floors the gutter's
  // width at 0 — so the same markup covers mobile with no conditional.
  const gutterInset = `calc(50% + ${maxWidthPx / 2}px)`;

  return createPortal(
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      {/* Blur + dim. Spans the whole viewport, card included, so the corner
          notches read as blurred backdrop rather than a sharp-edged gap. */}
      <div
        aria-hidden
        className={`absolute inset-0 pointer-events-none ${
          closing ? "dl-scrim-out" : "dl-scrim-in"
        }`}
        style={{
          background: "color-mix(in srgb, var(--color-ink) 26%, transparent)",
          backdropFilter: "blur(1.5px)",
          WebkitBackdropFilter: "blur(1.5px)",
        }}
      />

      {/* Click-outside: the strip above the card... */}
      <button
        type="button"
        data-cy={testId ? `${testId}-scrim` : undefined}
        aria-label={`Close ${title}`}
        onClick={onClose}
        className="absolute top-0 left-0 right-0 w-full bg-transparent border-none cursor-pointer"
        style={{ height: stripHeight }}
      />

      {/* ...and the gutters beside it, which only exist once the card clamps.
          Decorative duplicates of the strip target — hidden from the a11y tree
          so assistive tech is offered one "close" affordance, not three. */}
      {(["left", "right"] as const).map((side) => (
        <button
          key={side}
          type="button"
          aria-hidden
          tabIndex={-1}
          data-cy={testId ? `${testId}-gutter` : undefined}
          data-cy-side={side}
          onClick={onClose}
          className="absolute bottom-0 bg-transparent border-none cursor-pointer"
          style={{
            top: stripHeight,
            left: side === "left" ? 0 : gutterInset,
            right: side === "left" ? gutterInset : 0,
          }}
        />
      ))}

      <div
        ref={cardRef}
        tabIndex={-1}
        data-cy={testId}
        onAnimationEnd={() => closing && settle()}
        className={`absolute left-0 right-0 bottom-0 mx-auto w-full flex flex-col bg-surface-2 border-t border-line rounded-t-[20px] overflow-hidden outline-none ${
          closing ? "dl-sheet-out" : "dl-sheet-in"
        }`}
        style={{
          top: stripHeight,
          maxWidth: maxWidthPx,
          boxShadow: "0 -12px 36px rgba(0, 0, 0, 0.22)",
        }}
      >
        <div
          className="w-full mx-auto flex items-start gap-3 px-3.5 md:px-5 pt-4 pb-3"
          style={{ maxWidth: contentMaxWidthPx }}
        >
          <div className="flex-1 min-w-0">
            <div
              id={titleId}
              className="font-head text-[19px] font-bold text-ink tracking-[-0.4px] leading-tight"
            >
              {title}
            </div>
            {subtitle && (
              <div className="mt-0.5 font-mono text-[11px] text-ink-3 tracking-[0.4px]">
                {subtitle}
              </div>
            )}
          </div>
          <button
            type="button"
            data-cy="sheet-close"
            aria-label="Close"
            onClick={onClose}
            className="shrink-0 -mr-1 -mt-1 p-2 rounded-full bg-transparent border-none cursor-pointer text-ink-2 hover:text-ink hover:bg-chip transition-colors"
          >
            <IconClose size={18} />
          </button>
        </div>

        {/* The ruled line of an index card. */}
        <div
          className="h-px shrink-0"
          style={{
            background: "color-mix(in srgb, var(--color-accent) 55%, transparent)",
          }}
        />

        <div
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
        >
          <div className="w-full mx-auto" style={{ maxWidth: contentMaxWidthPx }}>
            {children}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
