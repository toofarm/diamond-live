-- ─────────────────────────────────────────────────────────────────────────
-- Phase 3a: RLS lockdown for analytics.* (read-only, authenticated-only).
--
-- Pre-state on these tables (created out-of-band by the ETL):
--   - `authenticated` has USAGE on schema + SELECT on each table.
--   - `anon` has neither — already blocked at the schema-grant level.
--   - RLS was OFF.
--
-- This migration adds defense-in-depth: enabling RLS with an explicit
-- `FOR SELECT TO authenticated` policy ensures that even if a future grant
-- accidentally hands USAGE to anon, the policy still gates reads. Also
-- explicitly REVOKEs anon to make the intent legible in source.
--
-- Applied to the remote project via the MCP `execute_sql` tool on 2026-05-26;
-- this file is the version-controlled record so a fresh database can be
-- reconstructed by replaying it.
-- ─────────────────────────────────────────────────────────────────────────

alter table analytics.league_pitch_summary  enable row level security;
alter table analytics.pitcher_arsenal       enable row level security;
alter table analytics.player_rolling_stats  enable row level security;

create policy "league_pitch_summary_select_authenticated"
  on analytics.league_pitch_summary
  for select to authenticated
  using (true);

create policy "pitcher_arsenal_select_authenticated"
  on analytics.pitcher_arsenal
  for select to authenticated
  using (true);

create policy "player_rolling_stats_select_authenticated"
  on analytics.player_rolling_stats
  for select to authenticated
  using (true);

revoke all on analytics.league_pitch_summary  from anon;
revoke all on analytics.pitcher_arsenal       from anon;
revoke all on analytics.player_rolling_stats  from anon;
