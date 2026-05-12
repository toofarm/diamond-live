"use client";

import { useParams, useRouter } from "next/navigation";
import { PlayerDetail } from "@/components/screens/PlayerDetail";
import { smartBack } from "@/lib/shell";

export default function Page() {
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
