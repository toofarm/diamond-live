"use client";

import { useRouter } from "next/navigation";
import { ScoresScreen } from "@/components/screens/ScoresScreen";
import { useShell } from "@/lib/shell";

export default function Page() {
  const router = useRouter();
  const { user } = useShell();
  return (
    <ScoresScreen
      follows={user?.follows ?? []}
      onGame={(id) => router.push(`/game/${id}`)}
    />
  );
}
