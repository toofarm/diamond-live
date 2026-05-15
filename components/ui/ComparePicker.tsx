"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export interface CompareItem {
  id: string;
  label: string;
  sublabel?: string;
  badge?: ReactNode;
}

export interface ComparePickerProps {
  items: CompareItem[];          // caller pre-filters + pre-sorts
  query: string;
  onQueryChange: (q: string) => void;
  selectedId: string | null;
  selectedLabel?: string;
  onSelect: (id: string) => void;
  onClear: () => void;
  placeholder?: string;
  loading?: boolean;
  emptyText?: string;
  dataCy?: string;
}

/** Inline combobox: text input + dropdown tray of options. Used above the
 *  Season-tab stat tables on TeamDetail/PlayerDetail.
 *
 *  Caller is responsible for filtering `items` against `query`; we just
 *  render them and handle focus, keyboard nav, and outside-click close.
 *  We slice to a hard 50-item cap so a fat list (e.g. ~2000 active players,
 *  empty query) doesn't paint a giant DOM. */
export function ComparePicker({
  items,
  query,
  onQueryChange,
  selectedId,
  selectedLabel,
  onSelect,
  onClear,
  placeholder = "Compare to…",
  loading = false,
  emptyText = "No matches",
  dataCy = "compare-picker",
}: ComparePickerProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const visible = items.slice(0, 50);

  // Focus an option button by index. Used by ArrowDown from the input and by
  // arrow nav between options. RAF defers the focus call by one frame so the
  // tray DOM is committed before we try to focus into it (covers the case
  // where ArrowDown both opens the tray AND moves focus on the same keystroke).
  const focusOption = (i: number) => {
    setActiveIndex(i);
    requestAnimationFrame(() => optionRefs.current[i]?.focus());
  };

  // Reset highlight when the filtered list changes. Render-phase adjustment per
  // React's "adjusting some state when a prop changes" pattern — avoids the
  // cascading render an effect-driven reset would cause.
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [prevKey, setPrevKey] = useState<string>(`${query}${items.length}`);
  const key = `${query}${items.length}`;
  if (key !== prevKey) {
    setPrevKey(key);
    setActiveIndex(0);
  }

  // Close on outside mousedown so option clicks (which fire on mouseup) still
  // register against the tray before it disappears.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const commit = (id: string) => {
    onSelect(id);
    setOpen(false);
    inputRef.current?.blur();
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      if (visible.length > 0) focusOption(0);
    } else if (e.key === "Enter") {
      if (!open || visible.length === 0) return;
      e.preventDefault();
      const pick = visible[Math.min(activeIndex, visible.length - 1)];
      if (pick) commit(pick.id);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  // Keyboard nav once focus is inside the tray. ArrowUp at index 0 hands focus
  // back to the input so the keyboard journey is reversible. Enter/Space on a
  // <button> trigger native onClick — no extra handler needed.
  const onOptionKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (i < visible.length - 1) focusOption(i + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (i === 0) {
        inputRef.current?.focus();
        setActiveIndex(0);
      } else {
        focusOption(i - 1);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.focus();
    }
  };

  const showTray = open;
  const inputValue = selectedId && selectedLabel && !open ? selectedLabel : query;

  return (
    <div ref={rootRef} data-cy={dataCy} className="relative">
      <div className="flex items-center gap-2 bg-surface border border-line rounded-[12px] px-3 py-2">
        <svg
          aria-hidden
          viewBox="0 0 16 16"
          width="14"
          height="14"
          className="shrink-0 text-ink-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <circle cx="7" cy="7" r="5" />
          <path d="M11 11l3 3" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          data-cy="compare-input"
          type="text"
          value={inputValue}
          placeholder={placeholder}
          onChange={(e) => {
            onQueryChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onInputKeyDown}
          className="flex-1 bg-transparent border-none outline-none font-ui text-[13px] text-ink placeholder:text-ink-3"
        />
        {selectedId && (
          <button
            type="button"
            data-cy="compare-clear"
            onClick={() => {
              onClear();
              onQueryChange("");
            }}
            className="bg-transparent border-none cursor-pointer text-ink-3 hover:text-ink font-ui text-[13px] leading-none p-0"
            aria-label="Clear comparison"
          >
            ×
          </button>
        )}
      </div>

      {showTray && (
        <div
          data-cy="compare-tray"
          className="absolute top-full left-0 right-0 mt-1 max-h-72 overflow-y-auto bg-surface border border-line rounded-[12px] shadow-lg z-10"
        >
          {loading ? (
            <div className="px-3 py-3 font-ui text-[13px] text-ink-3">Loading…</div>
          ) : visible.length === 0 ? (
            <div className="px-3 py-3 font-ui text-[13px] text-ink-3">{emptyText}</div>
          ) : (
            visible.map((item, i) => {
              const active = i === activeIndex;
              return (
                <button
                  key={item.id}
                  ref={(el) => {
                    optionRefs.current[i] = el;
                  }}
                  type="button"
                  data-cy="compare-option"
                  data-cy-id={item.id}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => commit(item.id)}
                  onKeyDown={(e) => onOptionKeyDown(e, i)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 bg-transparent border-none cursor-pointer text-left ${
                    active ? "bg-chip" : ""
                  } ${i === visible.length - 1 ? "" : "border-b border-line-2"}`}
                >
                  {item.badge && <span className="shrink-0">{item.badge}</span>}
                  <span className="flex-1 min-w-0">
                    <span className="block font-head text-[13px] font-semibold text-ink tracking-[-0.2px] truncate">
                      {item.label}
                    </span>
                    {item.sublabel && (
                      <span className="block font-mono text-[11px] text-ink-3 truncate">
                        {item.sublabel}
                      </span>
                    )}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
