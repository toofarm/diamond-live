import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth + email-magic-link callback. The provider (Google for now) redirects
 * the user here with a `?code=...` query param; we exchange that code for a
 * session, which writes session cookies via the server client's `setAll`
 * cookie handler. After success, redirect to `next` (default `/scores`) so
 * the user lands inside the app.
 *
 * Pattern from the Supabase Google OAuth guide. The forwarded-host branch
 * handles deployments behind a load balancer (Vercel etc.) where `origin` is
 * the internal host, not the user-visible one.
 *
 * On exchange failure we currently redirect to `/scores?auth_error=1`; a
 * dedicated error page lands with the login UI in Phase 3.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/scores";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";
      if (isLocalEnv) return NextResponse.redirect(`${origin}${next}`);
      if (forwardedHost) return NextResponse.redirect(`https://${forwardedHost}${next}`);
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/scores?auth_error=1`);
}
