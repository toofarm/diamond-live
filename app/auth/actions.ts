"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { E2E_MODE } from "@/lib/supabase/env";
import { verifyRecaptchaToken } from "@/lib/recaptcha";

/** Result shape shared by the sign-in / sign-up server actions. `needsConfirm`
 *  is only set on a successful sign-up when the project requires email
 *  confirmation — the client uses it to flip the message to "check your inbox"
 *  rather than navigating into the app. */
export interface AuthResult {
  ok: boolean;
  error?: string;
  needsConfirm?: boolean;
}

/** Generic copy shown when reCAPTCHA verification fails. We never tell the
 *  user that bot-detection denied them — both because it leaks the gate to
 *  an adversary and because false positives shouldn't read as accusations. */
const RECAPTCHA_GENERIC_ERROR = "Something went wrong. Please try again.";

export async function signInWithPassword(
  email: string,
  password: string,
  recaptchaToken: string | null,
): Promise<AuthResult> {
  if (E2E_MODE) return { ok: false, error: "Auth disabled under E2E_MODE." };
  if (!(await verifyRecaptchaToken(recaptchaToken, "signin"))) {
    return { ok: false, error: RECAPTCHA_GENERIC_ERROR };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };

  // Re-render every server segment so any server component reading
  // `getClaims()` sees the new session on the next render.
  revalidatePath("/", "layout");
  // Navigate on the server (303 from the action) rather than handing the
  // success result back to the client and letting it call `router.push`.
  // The client-side push-after-action pattern races on iOS Safari (the
  // `router.refresh()` we used to call would clear the in-flight RSC fetch
  // for the destination, leaving `<main>` blank until a manual reload).
  // `redirect` throws NEXT_REDIRECT and never returns.
  redirect("/scores");
}

export async function signUpWithPassword(
  email: string,
  password: string,
  recaptchaToken: string | null,
): Promise<AuthResult> {
  if (E2E_MODE) return { ok: false, error: "Auth disabled under E2E_MODE." };
  if (!(await verifyRecaptchaToken(recaptchaToken, "signup"))) {
    return { ok: false, error: RECAPTCHA_GENERIC_ERROR };
  }
  const supabase = await createClient();
  // Default the username to the part of the email before `@` — gives new
  // users a sensible display name without an extra signup field. The
  // `handle_new_user` trigger reads `raw_user_meta_data->>'full_name'`
  // and writes it to `public.profiles.name`. Users can edit it in Settings.
  const handle = email.split("@")[0] || "";
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: handle } },
  });
  if (error) return { ok: false, error: error.message };
  // When email confirmation is on (default for new Supabase projects),
  // `signUp` returns no session — the user must confirm via email before
  // they can sign in. When confirmation is off, the session is set and we
  // can drop them into the app immediately via a server-side redirect.
  if (!data.session) return { ok: true, needsConfirm: true };
  revalidatePath("/", "layout");
  redirect("/scores");
}

export async function signOut(): Promise<void> {
  // Under E2E_MODE there's no real Supabase session to terminate, but the
  // redirect itself is part of the user-facing flow Cypress needs to assert
  // on — skip the Supabase call only, keep the redirect.
  if (!E2E_MODE) {
    const supabase = await createClient();
    await supabase.auth.signOut();
    revalidatePath("/", "layout");
  }
  // Same rationale as signInWithPassword: navigate on the server so the
  // client never sees a `router.push` + `router.refresh` race that blanked
  // the page on iOS Safari. Land on /login so the signed-out user sees the
  // auth surface, not the splash flow. Throws NEXT_REDIRECT; never returns.
  redirect("/login");
}

/**
 * Request a password-reset email. Supabase sends a link that hits
 * `/auth/callback?code=...&next=/reset-password` — the existing callback
 * exchanges the code for a session, then redirects the user into the
 * /reset-password form where they're (temporarily) authenticated and can
 * update their password.
 *
 * `origin` is passed in from the browser (`window.location.origin`) so we
 * don't have to parse forwarded-host headers server-side. The URL must be
 * whitelisted in the Supabase dashboard → Authentication → URL
 * Configuration → Redirect URLs.
 */
export async function requestPasswordReset(
  email: string,
  origin: string,
): Promise<AuthResult> {
  if (E2E_MODE) return { ok: false, error: "Auth disabled under E2E_MODE." };
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Verify a reCAPTCHA token before the client commits to the guest-account
 * path. The guest profile itself still lives in localStorage — this action
 * exists purely to gate entry into that flow on a bot-likelihood check.
 *
 * Bypassed under E2E_MODE so Cypress can drive the splash → name → teams
 * flow without producing a real token. In every other environment a missing
 * or low-score token resolves to the same generic error as sign-in / sign-up
 * failures.
 */
export async function verifyGuestRecaptcha(
  recaptchaToken: string | null,
): Promise<AuthResult> {
  if (E2E_MODE) return { ok: true };
  if (!(await verifyRecaptchaToken(recaptchaToken, "guest"))) {
    return { ok: false, error: RECAPTCHA_GENERIC_ERROR };
  }
  return { ok: true };
}

/**
 * Update the currently-authenticated user's password. Used both by the
 * password-reset flow (where the user just authenticated via a magic link)
 * and by the future Settings "Change password" affordance.
 */
export async function updatePassword(newPassword: string): Promise<AuthResult> {
  if (E2E_MODE) return { ok: false, error: "Auth disabled under E2E_MODE." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}
