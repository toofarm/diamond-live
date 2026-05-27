"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

/**
 * Batch search-param updates into a single router.replace, scoped to the
 * current pathname. Pass `null` to delete a key.
 *
 * `router.replace` (not push) so tab/toggle changes don't bloat back/forward
 * history — but the latest URL still lives at the top of the history stack,
 * so when the user navigates forward and hits Back, the restored URL carries
 * their last selection.
 */
export function useQueryUpdater(): (updates: Record<string, string | null>) => void {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return useCallback(
    (updates) => {
      const qs = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v == null) qs.delete(k);
        else qs.set(k, v);
      }
      const s = qs.toString();
      router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );
}

/**
 * Bind a single search param to a typed value. Reading returns the param if
 * it parses as a member of `valid`, otherwise the default. Writing the
 * default strips the param so unmodified URLs stay clean.
 */
export function useTabParam<T extends string>(
  name: string,
  defaultValue: T,
  valid: readonly T[],
): [T, (next: T) => void] {
  const searchParams = useSearchParams();
  const update = useQueryUpdater();
  const raw = searchParams.get(name);
  const current: T =
    raw && (valid as readonly string[]).includes(raw) ? (raw as T) : defaultValue;
  const setValue = useCallback(
    (next: T) => update({ [name]: next === defaultValue ? null : next }),
    [update, name, defaultValue],
  );
  return [current, setValue];
}
