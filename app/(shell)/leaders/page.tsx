"use client";

import { Suspense } from "react";
import { useRouter } from "next/navigation";
import { LeadersScreen } from "@/components/screens/LeadersScreen";

function LeadersPageInner() {
  const router = useRouter();
  return <LeadersScreen onPlayer={(id) => router.push(`/player/${id}`)} />;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <LeadersPageInner />
    </Suspense>
  );
}
