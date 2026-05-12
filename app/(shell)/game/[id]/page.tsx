"use client";

import { useParams, useRouter } from "next/navigation";
import { GameDetail } from "@/components/screens/GameDetail";
import { smartBack } from "@/lib/shell";

export default function Page() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  return (
    <GameDetail
      gameId={id}
      onBack={() => smartBack(router, "/scores")}
      onPlayer={(pid) => router.push(`/player/${pid}`)}
      onTeam={(abbr) => router.push(`/team/${abbr}`)}
    />
  );
}
