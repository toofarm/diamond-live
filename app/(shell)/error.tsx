"use client";

import { ErrorFallback } from "@/components/ui/ErrorFallback";

/**
 * Catches render errors in any shell route. Sits inside `(shell)/layout.tsx`,
 * so the TopBar and TabBar stay mounted and the user can navigate away rather
 * than being stranded on a dead page.
 */
export default function ShellError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return <ErrorFallback error={error} retry={unstable_retry} scope="shell" />;
}
