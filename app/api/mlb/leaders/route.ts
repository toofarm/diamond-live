import { mlb } from "@/lib/mlb/upstream";
import { mapLeaders } from "@/lib/mlb/transform";
import { CACHE_HEADERS } from "@/lib/mlb/cacheHeaders";
import { currentSeason } from "@/lib/date";
import type { LeaderCategory, LeaderGroup, LeaderRow } from "@/lib/mlb/types";

/** Maps our UI category code to MLB's leaderCategories param value. */
const CATEGORY_MAP: Record<LeaderCategory, { mlb: string; group: LeaderGroup }> = {
  AVG:  { mlb: "battingAverage",                  group: "hitting"  },
  HR:   { mlb: "homeRuns",                        group: "hitting"  },
  RBI:  { mlb: "runsBattedIn",                    group: "hitting"  },
  OPS:  { mlb: "onBasePlusSlugging",              group: "hitting"  },
  OBP:  { mlb: "onBasePercentage",                group: "hitting"  },
  SLG:  { mlb: "sluggingPercentage",              group: "hitting"  },
  H:    { mlb: "hits",                            group: "hitting"  },
  R:    { mlb: "runs",                            group: "hitting"  },
  ERA:  { mlb: "earnedRunAverage",                group: "pitching" },
  K:    { mlb: "strikeouts",                      group: "pitching" },
  WHIP: { mlb: "walksAndHitsPerInningPitched",    group: "pitching" },
  W:    { mlb: "wins",                            group: "pitching" },
  SV:   { mlb: "saves",                           group: "pitching" },
  K9:   { mlb: "strikeoutsPer9Inn",               group: "pitching" },
  KBB:  { mlb: "strikeoutWalkRatio",              group: "pitching" },
  CG:   { mlb: "completeGames",                   group: "pitching" },
  IP:   { mlb: "inningsPitched",                  group: "pitching" },
  FPCT: { mlb: "fieldingPercentage",              group: "fielding" },
  PO:   { mlb: "putOuts",                         group: "fielding" },
  A:    { mlb: "assists",                         group: "fielding" },
  E:    { mlb: "errors",                          group: "fielding" },
};

/**
 * GET /api/mlb/leaders
 * Returns top 50 for each supported category, keyed by our UI code.
 * The client renders the first 10 and pages in additional sets of 10.
 */
export async function GET() {
  const season = currentSeason();
  const cats = Object.entries(CATEGORY_MAP) as [LeaderCategory, (typeof CATEGORY_MAP)[LeaderCategory]][];

  const results = await Promise.all(
    cats.map(async ([code, info]) => {
      const path = `/stats/leaders?leaderCategories=${info.mlb}&season=${season}&sportId=1&limit=50&statGroup=${info.group}`;
      try {
        const json = await mlb<unknown>(path, { revalidate: 300 });
        return [code, mapLeaders(json)] as const;
      } catch {
        return [code, [] as LeaderRow[]] as const;
      }
    }),
  );

  const out: Partial<Record<LeaderCategory, LeaderRow[]>> = {};
  for (const [code, rows] of results) out[code] = rows;
  return Response.json({ season, leaders: out }, { headers: CACHE_HEADERS.STATIC_5M });
}
