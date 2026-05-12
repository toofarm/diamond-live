"use client";

import { useRouter } from "next/navigation";
import { ScheduleScreen } from "@/components/screens/ScheduleScreen";
import { useShell } from "@/lib/shell";

export default function Page() {
  const router = useRouter();
  const { user } = useShell();
  return (
    <ScheduleScreen
      follows={user?.follows ?? []}
      onGame={(id) => router.push(`/game/${id}`)}
      onTeam={(abbr) => router.push(`/team/${abbr}`)}
    />
  );
}
