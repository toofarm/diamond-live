import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata: Metadata = {
  title: "Set new password | Game State",
};

/**
 * /reset-password requires an authenticated session. Two paths land here:
 *  1. The user clicked a password-reset link in their email, which routed
 *     through /auth/callback. The callback exchanged the magic-link code
 *     for a session, so they arrive here authenticated.
 *  2. A signed-in user navigates here from Settings to change their
 *     password.
 *
 * Anyone else (anonymous visitor typing the URL directly) gets bounced to
 * /login — they can't update a password they don't have a session for.
 */
export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  return <ResetPasswordForm />;
}
