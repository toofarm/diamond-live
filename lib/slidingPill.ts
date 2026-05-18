"use client";

import { useLayoutEffect, useRef, useState } from "react";

interface IndicatorPos {
  left: number;
  width: number;
}

/**
 * Measure the active pill inside a horizontal pill track so a single
 * absolute-positioned indicator can slide between options instead of each
 * button toggling its own background. Re-measures when the active key
 * changes or the container resizes.
 *
 * Usage:
 *   const { containerRef, pos } = useSlidingPill(activeKey);
 *   <div ref={containerRef} className="relative ...">
 *     <span aria-hidden style={{ left: pos?.left, width: pos?.width }} ... />
 *     {options.map(o => (
 *       <button data-sliding-key={o.key} className="relative ...">…</button>
 *     ))}
 *   </div>
 *
 * Each pill button must carry `data-sliding-key` matching the value passed
 * to the hook. Buttons should be `position: relative` so they paint above
 * the indicator; the indicator should be `position: absolute` inside the
 * container and pointer-events: none.
 */
export function useSlidingPill(
  activeKey: string | number,
  paddingOffset: number,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<IndicatorPos | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => {
      const sel = `[data-sliding-key="${CSS.escape(String(activeKey))}"]`;
      const active = container.querySelector<HTMLElement>(sel);
      if (active) {
        setPos({
          left: active.offsetLeft - paddingOffset,
          width: active.offsetWidth - paddingOffset,
        });
      }
    };
    measure();
    // Re-measure on container resize so the indicator stays correct when the
    // viewport changes (Leaders uses `w-full flex-1` buttons that grow with
    // the layout) or font loads shift button widths.
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    return () => ro.disconnect();
  }, [activeKey, paddingOffset]);

  return { containerRef, pos };
}
