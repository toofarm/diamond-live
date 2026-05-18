import { E2E_MODE } from "@/lib/supabase/env";

/**
 * Discrete attribution footer required when the floating v3 badge is hidden
 * via CSS (see `.grecaptcha-badge` in globals.css). Google's terms allow
 * suppressing the badge only when this notice — including links to their
 * Privacy Policy and Terms of Service — is shown on every page that
 * executes reCAPTCHA. Currently /login and the onboarding splash.
 *
 * Skipped under E2E_MODE so it doesn't appear in fixtures or screenshots.
 */
export function RecaptchaNotice() {
  if (E2E_MODE) return null;
  return (
    <p className="mt-3 text-center text-[10px] text-ink-3 leading-relaxed">
      Protected by reCAPTCHA. Google's{" "}
      <a
        href="https://policies.google.com/privacy"
        target="_blank"
        rel="noopener noreferrer"
        className="text-ink-3 underline"
      >
        Privacy Policy
      </a>{" "}
      and{" "}
      <a
        href="https://policies.google.com/terms"
        target="_blank"
        rel="noopener noreferrer"
        className="text-ink-3 underline"
      >
        Terms
      </a>{" "}
      apply.
    </p>
  );
}
