import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { E2E_MODE } from "@/lib/supabase/env";
import { safeRedirectPath } from "@/app/auth/redirect";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Sign in | Game State",
};

/**
 * Server-rendered shell for /login. Bounces already-authenticated users to
 * their intended destination (or /scores) up front so the form never flashes
 * for someone who shouldn't see it. The `?redirect=` query param — set by
 * auth-gated routes when they bounce anonymous visitors here — is honored
 * for both the already-authenticated bounce and the post-sign-in redirect,
 * via the validated path forwarded into `<LoginForm>`.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const redirectTo = safeRedirectPath(params.redirect, "/scores");

  if (!E2E_MODE) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    if (data?.claims) redirect(redirectTo);
  }
  return <LoginForm redirectTo={redirectTo} />;
}
