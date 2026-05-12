"use client";

import { useRouter } from "next/navigation";
import { StandingsScreen } from "@/components/screens/StandingsScreen";

export default function Page() {
  const router = useRouter();
  return <StandingsScreen onTeam={(abbr) => router.push(`/team/${abbr}`)} />;
}
