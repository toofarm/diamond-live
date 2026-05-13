import { mlb } from "@/lib/mlb/upstream";
import { mapCoaches, mapFrontOffice } from "@/lib/mlb/transform";
import { CACHE_HEADERS } from "@/lib/mlb/cacheHeaders";
import { TEAMS } from "@/lib/mlb/teams";
import type { PersonnelData } from "@/lib/mlb/types";

/**
 * GET /api/mlb/team/[teamAbbr]/personnel
 *
 * Returns coaching staff + front office in a single response. The front-office
 * endpoint is undocumented and can 404 or return an empty roster for some teams
 * — we use `Promise.allSettled` so a failure there leaves coaches intact.
 *
 * The client hides the front-office section silently when the array is empty.
 */
export async function GET(_: Request, { params }: { params: Promise<{ teamAbbr: string }> }) {
  const { teamAbbr } = await params;
  const team = TEAMS[teamAbbr];
  if (!team) {
    return Response.json({ error: `Unknown team ${teamAbbr}` }, { status: 404 });
  }

  const [coachesRes, frontOfficeRes] = await Promise.allSettled([
    mlb<unknown>(`/teams/${team.mlbId}/coaches`, { revalidate: 3600 }),
    mlb<unknown>(`/teams/${team.mlbId}/personnel`, { revalidate: 3600 }),
  ]);

  const coachesJson = coachesRes.status === "fulfilled" ? coachesRes.value : {};
  const frontOfficeJson = frontOfficeRes.status === "fulfilled" ? frontOfficeRes.value : {};

  const body: PersonnelData = {
    coaches: mapCoaches(coachesJson),
    frontOffice: mapFrontOffice(frontOfficeJson),
  };

  return Response.json(body, { headers: CACHE_HEADERS.STATIC_1H });
}
