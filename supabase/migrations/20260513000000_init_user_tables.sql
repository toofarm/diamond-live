-- ─────────────────────────────────────────────────────────────────────────
-- Phase 2: User tables (profiles, follows, display_prefs, notification_prefs)
--
-- All tables: RLS enabled, scoped to auth.uid(), authenticated-role grants
-- only. Anonymous users have no access. Schema mirrors `UserProfile` from
-- lib/storage.ts.
--
-- Applied to the remote project via the MCP `execute_sql` tool on 2026-05-13;
-- this file is the version-controlled record so a fresh database can be
-- reconstructed by replaying it.
-- ─────────────────────────────────────────────────────────────────────────

-- Private schema for security-definer helpers, kept off the REST surface per
-- Supabase security guidance (don't put `security definer` in exposed schemas).
create schema if not exists private;

-- 1. profiles ────────────────────────────────────────────────────────────
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

grant select, insert, update on public.profiles to authenticated;

-- 2. follows ─────────────────────────────────────────────────────────────
create table public.follows (
  user_id     uuid not null references auth.users(id) on delete cascade,
  team_abbr   text not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, team_abbr)
);
alter table public.follows enable row level security;

create policy "follows_select_own" on public.follows
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "follows_insert_own" on public.follows
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "follows_delete_own" on public.follows
  for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, delete on public.follows to authenticated;

-- 3. display_prefs ───────────────────────────────────────────────────────
create table public.display_prefs (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  box_score_units  text not null default 'imperial' check (box_score_units in ('imperial', 'metric')),
  win_probability  boolean not null default true,
  pitch_by_pitch   boolean not null default true,
  theme            text not null default 'light' check (theme in ('light', 'twilight')),
  updated_at       timestamptz not null default now()
);
alter table public.display_prefs enable row level security;

create policy "display_prefs_select_own" on public.display_prefs
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "display_prefs_insert_own" on public.display_prefs
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "display_prefs_update_own" on public.display_prefs
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update on public.display_prefs to authenticated;

-- 4. notification_prefs ──────────────────────────────────────────────────
create table public.notification_prefs (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  enabled     boolean not null default false,
  cat_start   boolean not null default true,
  cat_end     boolean not null default true,
  cat_score   boolean not null default true,
  updated_at  timestamptz not null default now()
);
alter table public.notification_prefs enable row level security;

create policy "notification_prefs_select_own" on public.notification_prefs
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "notification_prefs_insert_own" on public.notification_prefs
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "notification_prefs_update_own" on public.notification_prefs
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update on public.notification_prefs to authenticated;

-- 5. updated_at trigger (shared across the three mutable tables) ─────────
create or replace function private.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

create trigger display_prefs_set_updated_at
  before update on public.display_prefs
  for each row execute function private.set_updated_at();

create trigger notification_prefs_set_updated_at
  before update on public.notification_prefs
  for each row execute function private.set_updated_at();

-- 6. Auto-provision rows on auth.users insert ────────────────────────────
-- When a new user signs up (email/pw, Google OAuth, etc.), Supabase inserts
-- into auth.users; this trigger then creates default rows in profiles +
-- display_prefs + notification_prefs so the app never has to handle the
-- "user exists but has no profile yet" state.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  insert into public.display_prefs (user_id) values (new.id);
  insert into public.notification_prefs (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
