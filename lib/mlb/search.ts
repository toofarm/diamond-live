/**
 * Global entity search — players + teams — backed by the
 * `public.search_entities` RPC over the `analytics.search_entities` index.
 *
 * The RPC does trigram matching (fuzzy + substring) and ranks by closeness to
 * each entity's own display name, so a query like "yankee" surfaces the Yankees
 * team above its players, and "judg" / "shohei otani" tolerate typos. See the
 * 20260617000000_search_entities_trgm_and_rpc migration for the SQL.
 *
 * RLS scopes this to authenticated users (anon has no access to the analytics
 * schema), so call it with a client that carries the user's session.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { abbrByMlbId } from "@/lib/mlb/teams";

export type SearchEntityType = "player" | "team";

/** A single ranked search hit, camelCased from the RPC's snake_case columns.
 *  `uid` is the player id (for players) or team id (for teams). `positionName`,
 *  `teamId`, `teamName`, and `teamAbbreviation` are null for team entities. */
export interface SearchEntity {
  entityType: SearchEntityType;
  uid: number;
  displayName: string;
  positionName: string | null;
  teamId: number | null;
  teamName: string | null;
  teamAbbreviation: string | null;
  /** word-similarity of the query to the entity's display name, 0–1. Higher = closer. */
  score: number;
}

/** Raw shape returned by the RPC (snake_case, matches the SQL return table). */
interface SearchEntityRow {
  entity_type: SearchEntityType;
  uid: number;
  display_name: string;
  position_name: string | null;
  team_id: number | null;
  team_name: string | null;
  team_abbreviation: string | null;
  score: number;
}

/** Hard cap mirrored from the RPC (`least(max_results, 50)`); over-asking is
 *  clamped server-side, this just keeps the client honest. */
export const SEARCH_MAX_RESULTS = 50;

export interface SearchEntitiesOptions {
  /** Max hits to return. Clamped to [1, SEARCH_MAX_RESULTS] server-side. Default 10. */
  limit?: number;
}

/**
 * Run a ranked global search. Returns an empty array for a blank query (the
 * RPC needs at least one character) rather than round-tripping. Throws on a
 * transport/RPC error so callers can surface it — mirrors the `if (error)
 * throw` convention in lib/storage.ts.
 */
export async function searchEntities(
  supabase: SupabaseClient,
  query: string,
  options: SearchEntitiesOptions = {},
): Promise<SearchEntity[]> {
  const q = query.trim();
  if (q.length === 0) return [];

  const { data, error } = await supabase.rpc("search_entities", {
    q,
    max_results: options.limit ?? 10,
  });

  if (error) throw new Error(error.message);

  return ((data ?? []) as SearchEntityRow[]).map((r) => ({
    entityType: r.entity_type,
    uid: r.uid,
    displayName: r.display_name,
    positionName: r.position_name,
    teamId: r.team_id,
    teamName: r.team_name,
    // The search index abbreviates Arizona as "AZ" (and could drift on other
    // teams), whereas the app's TEAMS registry — which backs team routing and
    // logos — keys on "ARI". Resolve the canonical abbr by the stable MLB
    // team_id, falling back to the index's value if the id isn't recognized.
    teamAbbreviation:
      r.team_id != null
        ? abbrByMlbId(r.team_id) ?? r.team_abbreviation
        : r.team_abbreviation,
    score: r.score,
  }));
}
