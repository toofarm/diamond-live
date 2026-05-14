import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
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
