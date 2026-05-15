"use client";

import { createBrowserClient } from "@supabase/ssr";
import { E2E_MODE } from "@/lib/supabase/env";

/**
 * Browser-side Supabase client. Use from client components for direct DB
 * access (subject to RLS) and for auth flows triggered in the browser
 * (`signInWithOAuth`, `signOut`, etc.).
 *
 * The underlying `createBrowserClient` returns a singleton, so calling this
 * from multiple components is cheap.
 *
 * Env: `NEXT_PUBLIC_SUPABASE_URL` plus either
 * `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (preferred, new format) or
 * `NEXT_PUBLIC_SUPABASE_ANON_KEY` (legacy, works through end of 2026).
 *
 * Under E2E_MODE the env vars are typically unset in CI, which would make
 * the `!` non-null assertions blow up at instantiation. We fall back to
 * harmless placeholder values so the SDK instantiates cleanly — every
 * call-site that would have hit the network is already gated upstream
 * (see middleware.ts, lib/storage.ts, app/login/page.tsx, etc.), so the
 * placeholder client never actually issues a request.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    ?? (E2E_MODE ? "https://placeholder.supabase.co" : undefined);
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ?? (E2E_MODE ? "placeholder-anon-key" : undefined);
  return createBrowserClient(url!, key!);
}
