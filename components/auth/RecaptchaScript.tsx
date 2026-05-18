"use client";

import Script from "next/script";
import { E2E_MODE } from "@/lib/supabase/env";

const SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

/**
 * Lazy-loads the reCAPTCHA v3 SDK with the public site key baked into the
 * URL. Mount on the surfaces that need to produce a token (currently /login
 * and the onboarding splash) rather than the root layout — keeping the
 * badge and the network call off every other route.
 *
 * Skipped under E2E_MODE so Cypress runs don't paint the badge or fetch
 * the SDK; the matching server-side bypass lets test-mode submits pass
 * through without a real token. Also no-ops when the site key isn't set
 * (local dev without the env var) so the rest of the form keeps working.
 */
export function RecaptchaScript() {
  if (E2E_MODE || !SITE_KEY) return null;
  return (
    <Script
      src={`https://www.google.com/recaptcha/api.js?render=${SITE_KEY}`}
      strategy="afterInteractive"
    />
  );
}
