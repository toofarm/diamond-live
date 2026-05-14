import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

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

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
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
