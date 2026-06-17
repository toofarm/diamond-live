"use client";

import { Suspense } from "react";
import { useRouter } from "next/navigation";
import { SearchScreen } from "@/components/screens/SearchScreen";

function SearchPageInner() {
  const router = useRouter();
  return (
    <SearchScreen
      onPlayer={(id) => router.push(`/player/${id}`)}
      onTeam={(abbr) => router.push(`/team/${abbr}`)}
    />
  );
}

export default function Page() {
  // SearchScreen reads ?q= via useSearchParams — wrap in Suspense so the route
  // can prerender up to this boundary (matches the other tab routes).
  return (
    <Suspense fallback={null}>
      <SearchPageInner />
    </Suspense>
  );
}
