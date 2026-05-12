"use client";

import { useParams, useRouter } from "next/navigation";
import { TeamDetail } from "@/components/screens/TeamDetail";
import { smartBack } from "@/lib/shell";

export default function Page() {
  const router = useRouter();
  const params = useParams<{ abbr: string }>();
  return (
    <TeamDetail
      teamAbbr={params.abbr}
      onBack={() => smartBack(router, "/standings")}
      onPlayer={(pid) => router.push(`/player/${pid}`)}
    />
  );
}
