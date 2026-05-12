"use client";

import { useRouter } from "next/navigation";
import { LeadersScreen } from "@/components/screens/LeadersScreen";

export default function Page() {
  const router = useRouter();
  return <LeadersScreen onPlayer={(id) => router.push(`/player/${id}`)} />;
}
