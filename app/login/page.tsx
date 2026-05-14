import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Sign in | Game State",
};

/**
 * Server-rendered shell for /login. Bounces already-authenticated users to
 * /scores up front (so the form never flashes for someone who shouldn't see
 * it). All interactive bits live in the `<LoginForm>` client component below.
 */
export default async function LoginPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) redirect("/scores");
  return <LoginForm />;
}
