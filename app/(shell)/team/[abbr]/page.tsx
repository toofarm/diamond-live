"use client";

import { Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { TeamDetail } from "@/components/screens/TeamDetail";
import { smartBack } from "@/lib/shell";

function TeamPageInner() {
  const router = useRouter();
  const params = useParams<{ abbr: string }>();
  return (
    <TeamDetail
      teamAbbr={params.abbr}
      onBack={() => smartBack(router, "/standings")}
      onPlayer={(pid) => router.push(`/player/${pid}`)}
      onGame={(gid) => router.push(`/game/${gid}`)}
    />
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <TeamPageInner />
    </Suspense>
  );
}
