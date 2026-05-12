import { mlb } from "@/lib/mlb/upstream";
import { mapRoster } from "@/lib/mlb/transform";
import { CACHE_HEADERS } from "@/lib/mlb/cacheHeaders";
import { TEAMS } from "@/lib/mlb/teams";

/**
 * GET /api/mlb/team/[teamAbbr]
 * Returns the team's active roster keyed by our short abbreviation.
 */
export async function GET(_: Request, { params }: { params: Promise<{ teamAbbr: string }> }) {
  const { teamAbbr } = await params;
  const team = TEAMS[teamAbbr];
  if (!team) {
    return Response.json({ error: `Unknown team ${teamAbbr}` }, { status: 404 });
  }

  try {
    const json = await mlb<unknown>(`/teams/${team.mlbId}/roster?rosterType=active`, {
      revalidate: 600,
    });
    const roster = mapRoster(json);
    return Response.json({ abbr: teamAbbr, roster }, { headers: CACHE_HEADERS.STATIC_10M });
  } catch (err) {
    return Response.json(
      { abbr: teamAbbr, roster: [], error: (err as Error).message },
      { status: 502 },
    );
  }
}
