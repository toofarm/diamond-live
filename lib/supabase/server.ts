import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { E2E_MODE } from "@/lib/supabase/env";

/**
 * Server-side Supabase client. Use from Server Components, Server Actions,
 * and Route Handlers. Each call creates a fresh client bound to the current
 * request's cookie jar — never share an instance across requests.
 *
 * For verifying a user server-side, always call `supabase.auth.getClaims()`,
 * not `getSession()`. Per the Supabase docs: `getSession()` "isn't guaranteed
 * to revalidate the Auth token", whereas `getClaims()` validates the JWT
 * signature against the project's published public keys on every call.
 */
export async function createClient() {
  const cookieStore = await cookies();

  // Under E2E_MODE the env vars are typically unset in CI; fall back to
  // placeholders so the SDK instantiates without throwing. Every code path
  // that would actually call into this client (login/forgot/reset pages,
  // /auth/callback, middleware, server actions) is short-circuited
  // upstream when E2E_MODE is on.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    ?? (E2E_MODE ? "https://placeholder.supabase.co" : undefined);
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ?? (E2E_MODE ? "placeholder-anon-key" : undefined);

  return createServerClient(
    url!,
    key!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Calling `setAll` from a Server Component throws because RSCs
            // can't mutate cookies. That's fine — the root middleware refreshes
            // tokens on every request, so we don't lose the refresh, we just
            // skip writing from here. This try/catch is the recommended
            // pattern from the Supabase SSR guide.
          }
        },
      },
    },
  );
}
