import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { E2E_MODE } from "@/lib/supabase/env";

export async function proxy(request: NextRequest) {
  // Tests run against a flagged build that never talks to Supabase — short-
  // circuit token refresh so the test runner doesn't burn time on JWKS
  // fetches or worse, attempt network calls Supabase isn't reachable for.
  if (E2E_MODE) return NextResponse.next({ request });
  return await updateSession(request);
}

export const config = {
  // Run on every page route and every server action / API route EXCEPT:
  // - `_next/static`, `_next/image` (build assets, never auth-relevant)
  // - asset extensions in the public folder
  // - `api/mlb/*` — read-only public MLB proxy. These get hit on every
  //   scoreboard poll (every 20s) and notification poll (every 30s), so we
  //   skip the auth-refresh roundtrip on them. Add auth-gated routes under a
  //   different prefix (e.g. `/api/me/*`) and they'll be covered automatically.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/mlb|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
