"use client";

import { createBrowserClient } from "@supabase/ssr";

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
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
  );
}
