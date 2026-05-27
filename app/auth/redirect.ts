/**
 * Validate a `?redirect=` (or equivalent) query param before using it as a
 * navigation target.
 *
 * Why this exists: an unvalidated redirect param is an open-redirect — an
 * attacker can craft `/login?redirect=https://evil.example/phish` and
 * piggyback on the trustworthy login URL to phish users post-auth.
 *
 * A path passes only when it is a same-origin route:
 *   - Starts with a single `/` (absolute path on this origin).
 *   - Does NOT start with `//` (browsers and Next treat `//evil.com/x` as a
 *     protocol-relative URL pointing off-origin).
 *   - Is not `/login` itself (would create a sign-in → /login → sign-in loop).
 *
 * Anything else falls back to the supplied default. Re-run this on the
 * server even if the client already validated — never trust client input.
 */
export function safeRedirectPath(
  raw: string | string[] | null | undefined,
  fallback: string,
): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string" || value.length === 0) return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  if (value === "/login" || value.startsWith("/login?") || value.startsWith("/login/")) {
    return fallback;
  }
  return value;
}
