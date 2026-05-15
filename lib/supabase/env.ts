/**
 * When `NEXT_PUBLIC_E2E === "1"`, every Supabase code path in the app short-
 * circuits — the middleware skips token refresh, the auth store resolves
 * immediately to `anonymous`, and server-side `getClaims()` checks bail out
 * without hitting the network.
 *
 * Used by the Cypress test runner via the `dev:test` npm script. Avoids:
 *   - Network roundtrips (and the JWKS fetch the auth library performs)
 *     slowing down every test page load.
 *   - Test sessions ever touching the real Supabase project.
 *
 * Regular `npm run dev` and production builds leave this undefined, so the
 * flag has zero effect outside the explicit test path.
 *
 * Must be a `NEXT_PUBLIC_*` var so it's available in both the server bundle
 * (middleware, server components) AND the client bundle (the auth store).
 * Next inlines these at build time for the client.
 */
export const E2E_MODE = process.env.NEXT_PUBLIC_E2E === "1";
