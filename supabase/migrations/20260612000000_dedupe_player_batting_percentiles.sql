-- ─────────────────────────────────────────────────────────────────────────
-- Dedupe analytics.player_batting_percentiles + add PK + RLS select policy.
--
-- Pre-state (table created out-of-band by the ETL, after the 20260526 RLS
-- migration, so it was never brought in line with its sibling tables):
--   - 629 rows but only 332 distinct (player_id, season) keys. 237 keys are
--     duplicated; all duplicate rows are byte-identical (0 value conflicts),
--     so collapsing to one row per key is lossless.
--   - No primary key, so nothing prevented the duplicate inserts.
--   - RLS was ON but had NO policy → reads were denied for everyone,
--     including `authenticated`. The table was effectively unreadable.
--
-- This migration:
--   1. Collapses duplicates, keeping one physical row per (player_id, season).
--   2. Adds a PK on (player_id, season) so re-runs of the ETL upsert cleanly
--      instead of accreting duplicates.
--   3. Adds the same `FOR SELECT TO authenticated` policy the sibling
--      analytics.* tables got in 20260526, and revokes anon.
--
-- Applied to the remote project via the MCP `execute_sql` tool on 2026-06-12;
-- this file is the version-controlled record so a fresh database can be
-- reconstructed by replaying it.
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Collapse duplicate rows (keep the lowest ctid per key).
delete from analytics.player_batting_percentiles a
using analytics.player_batting_percentiles b
where a.ctid > b.ctid
  and a.player_id = b.player_id
  and a.season    = b.season;

-- 2. Prevent future duplicates.
alter table analytics.player_batting_percentiles
  add constraint player_batting_percentiles_pkey primary key (player_id, season);

-- 3. Bring RLS in line with the sibling analytics.* tables.
create policy "player_batting_percentiles_select_authenticated"
  on analytics.player_batting_percentiles
  for select to authenticated
  using (true);

revoke all on analytics.player_batting_percentiles from anon;
