"use client";

import { Suspense } from "react";
import { useRouter } from "next/navigation";
import { StandingsScreen } from "@/components/screens/StandingsScreen";

function StandingsPageInner() {
  const router = useRouter();
  return <StandingsScreen onTeam={(abbr) => router.push(`/team/${abbr}`)} />;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <StandingsPageInner />
    </Suspense>
  );
}
