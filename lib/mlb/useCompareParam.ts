"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Read/write the `?compare=` query param used by the Season-tab comparison
 * picker on TeamDetail and PlayerDetail. The param stays put across sub-tab
 * switches and is dropped naturally when the user navigates to a different
 * team/player.
 *
 * `router.replace` (not push) so the comparison doesn't pollute back/forward
 * history with every keystroke-driven selection.
 */
export function useCompareParam(): {
  compareId: string | null;
  setCompare: (id: string) => void;
  clearCompare: () => void;
} {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const compareId = searchParams.get("compare");

  const setCompare = (id: string) => {
    const qs = new URLSearchParams(searchParams.toString());
    qs.set("compare", id);
    router.replace(`${pathname}?${qs.toString()}`, { scroll: false });
  };

  const clearCompare = () => {
    const qs = new URLSearchParams(searchParams.toString());
    qs.delete("compare");
    const s = qs.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };

  return { compareId, setCompare, clearCompare };
}
