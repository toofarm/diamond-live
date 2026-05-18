import { E2E_MODE } from "@/lib/supabase/env";

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      execute: (siteKey: string, options: { action: string }) => Promise<string>;
    };
  }
}

/**
 * Browser-side: ask the loaded reCAPTCHA v3 SDK to mint a token for a named
 * action. The server verifier checks score + action match.
 *
 * Returns null when the SDK hasn't loaded yet (script blocked / network
 * failure / called before `RecaptchaScript` finished mounting) or when
 * we're under E2E_MODE. Callers should treat null as a verification
 * failure on the server side — a null token will be rejected by
 * `verifyRecaptchaToken` and the user will see the same generic error
 * as any other reCAPTCHA failure.
 */
export function executeRecaptcha(action: string): Promise<string | null> {
  if (E2E_MODE) return Promise.resolve(null);
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
  if (typeof window === "undefined" || !siteKey) return Promise.resolve(null);
  const g = window.grecaptcha;
  if (!g) return Promise.resolve(null);
  return new Promise<string | null>((resolve) => {
    g.ready(() => {
      g.execute(siteKey, { action })
        .then((token) => resolve(token))
        .catch(() => resolve(null));
    });
  });
}
