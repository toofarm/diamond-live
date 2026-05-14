import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const metadata: Metadata = {
  title: "Forgot password | Game State",
};

/**
 * Server-rendered shell for /forgot-password. A user who's already signed
 * in doesn't need the email-reset roundtrip — bounce them to /reset-password
 * where they can update their password directly using their live session.
 */
export default async function ForgotPasswordPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) redirect("/reset-password");
  return <ForgotPasswordForm />;
}
