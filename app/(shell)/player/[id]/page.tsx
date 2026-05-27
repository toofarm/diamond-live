"use client";

import { Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { PlayerDetail } from "@/components/screens/PlayerDetail";
import { smartBack } from "@/lib/shell";

function PlayerPageInner() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  return (
    <PlayerDetail
      personId={id}
      onBack={() => smartBack(router, "/leaders")}
      onTeam={(abbr) => router.push(`/team/${abbr}`)}
    />
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PlayerPageInner />
    </Suspense>
  );
}
