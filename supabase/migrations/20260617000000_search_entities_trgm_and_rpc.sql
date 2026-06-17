-- ─────────────────────────────────────────────────────────────────────────
-- Global search: trigram index + ranked search RPC over analytics.search_entities
--
-- `analytics.search_entities` is the denormalized search index (one row per
-- player + team) built out-of-band by the ETL. It carries a prebuilt
-- `search_text` blob ("aaron judge nyy new york yankees") so a single lookup
-- can match a player by name, team abbreviation, or city.
--
-- Two pieces:
--   1. A GIN gin_trgm_ops index on `search_text`. This accelerates BOTH
--      `ILIKE '%q%'` substring matches and the `<%` word-similarity operator,
--      so one index covers exact-substring and fuzzy/typo matching.
--   2. `public.search_entities(q, max_results)` — the query path the app calls.
--      It lives in `public` (the only Data-API-exposed schema) because the
--      `analytics` schema is not exposed and PostgREST cannot express
--      similarity ranking anyway. It is SECURITY INVOKER (not definer): the
--      `authenticated` role already holds USAGE + SELECT on the table, so the
--      RPC runs with the caller's privileges and RLS still applies — no
--      security-definer-in-an-exposed-schema footgun. Matching ranks by
--      similarity to the entity's own display_name (so "yankee" surfaces the
--      Yankees team above its players), while the WHERE still matches on the
--      full search_text (so team words still find players). Granted to
--      `authenticated` only; revoked from anon/public.
--
-- Applied to the remote project via the MCP `execute_sql` tool on 2026-06-17;
-- this file is the version-controlled record so a fresh database can be
-- reconstructed by replaying it. pg_trgm is already installed (public schema).
-- ─────────────────────────────────────────────────────────────────────────

create index if not exists search_entities_search_text_trgm_idx
  on analytics.search_entities
  using gin (search_text gin_trgm_ops);

create or replace function public.search_entities(q text, max_results int default 10)
returns table (
  entity_type       varchar,
  uid               int,
  display_name      text,
  position_name     text,
  team_id           int,
  team_name         text,
  team_abbreviation varchar,
  score             real
)
language sql
stable
security invoker
set search_path = public
as $$
  with input as (
    select lower(btrim(q)) as q
  )
  select
    se.entity_type,
    se.uid,
    se.display_name,
    se.position_name,
    se.team_id,
    se.team_name,
    se.team_abbreviation,
    word_similarity(input.q, lower(se.display_name)) as score
  from analytics.search_entities se, input
  where length(input.q) >= 1
    and (
      se.search_text ilike '%' || input.q || '%'   -- substring match across name + team
      or input.q <% se.search_text                  -- fuzzy word-similarity match
    )
  order by
    (lower(se.display_name) like input.q || '%') desc,     -- name prefix wins
    word_similarity(input.q, lower(se.display_name)) desc,  -- closeness to the entity's own name
    (se.entity_type = 'team') desc,                         -- teams edge out players on ties
    word_similarity(input.q, se.search_text) desc,          -- then overall text relevance
    se.display_name
  limit greatest(1, least(max_results, 50));
$$;

grant execute on function public.search_entities(text, int) to authenticated;
revoke execute on function public.search_entities(text, int) from anon, public;
