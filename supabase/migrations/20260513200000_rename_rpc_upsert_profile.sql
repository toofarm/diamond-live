-- ─────────────────────────────────────────────────────────────────────────
-- Polish: rename `complete_onboarding` → `upsert_profile`.
--
-- The RPC was introduced as part of the onboarding flow (chunk 3.5) but is
-- now also called for every authenticated Settings write (chunk 5: toggling
-- a preference, changing your name, adding/removing a follow). The
-- `complete_onboarding` name was misleading once Settings shared the path.
--
-- ALTER FUNCTION RENAME preserves the body, signature, and grants — no
-- need to drop + recreate, no client downtime.
-- ─────────────────────────────────────────────────────────────────────────

alter function public.complete_onboarding(text, text[], jsonb, jsonb)
  rename to upsert_profile;
