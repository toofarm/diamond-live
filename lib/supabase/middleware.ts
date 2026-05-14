import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refresh the Supabase auth tokens on every request and forward the refreshed
 * cookies to both the inbound request (so downstream Server Components see
 * the up-to-date session in the same request lifecycle) and the outbound
 * response (so the browser stores the refreshed cookies).
 *
 * Called from the root `middleware.ts`. Per the Supabase SSR docs and the
 * `createServerClient` typedef comment: omitting this middleware causes
 * "random logouts, early session termination, JSON parsing errors, increased
 * refresh token requests, or relying on garbage state" — because Server
 * Components cannot write cookies and therefore cannot refresh tokens
 * themselves.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Mirror the refreshed cookies onto BOTH the inbound request (so
          // any downstream code in this same request sees them) AND the
          // outbound response (so the browser stores them for next request).
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Triggers any pending token refresh as a side-effect. We don't act on the
  // claims here — the middleware's only job is to keep cookies fresh. Per the
  // Supabase docs: "Always use supabase.auth.getClaims() to protect pages and
  // user data. Never trust supabase.auth.getSession() inside server code such
  // as Proxy" — getClaims() validates the JWT signature on every call.
  await supabase.auth.getClaims();

  return response;
}
