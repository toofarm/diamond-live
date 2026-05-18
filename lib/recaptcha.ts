/**
 * reCAPTCHA v3 server-side verification.
 *
 * Posts the user's token + our secret to Google's siteverify endpoint and
 * returns true only when the response reports success and a score >= 0.5.
 * Used by the sign-in, sign-up, and guest-creation server actions to gate
 * each action behind a bot-likelihood check. The action-name match is best-
 * effort: Google may omit `action` on legitimate responses, so we only
 * reject when it's present and disagrees.
 *
 * Returns boolean rather than throwing — callers translate a `false` into
 * a generic user-facing error so we never reveal that reCAPTCHA was the
 * gate that denied them.
 */
export async function verifyRecaptchaToken(
  token: string | null | undefined,
  action: string,
): Promise<boolean> {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret || !token) return false;
  try {
    const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
      cache: "no-store",
    });
    if (!res.ok) return false;
    const data = (await res.json()) as {
      success?: boolean;
      score?: number;
      action?: string;
    };
    if (!data.success) return false;
    if (typeof data.score !== "number" || data.score < 0.5) return false;
    if (data.action && data.action !== action) return false;
    return true;
  } catch {
    return false;
  }
}
