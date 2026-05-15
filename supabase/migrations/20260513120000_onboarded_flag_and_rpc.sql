-- ─────────────────────────────────────────────────────────────────────────
-- Phase 3.5: onboarded flag + atomic complete_onboarding RPC
--
-- The `handle_new_user` trigger from the init migration provisions default
-- rows on signup, but those rows have empty `name` and no `follows`. The
-- `onboarded` flag distinguishes "freshly-signed-up user who hasn't seen the
-- team-picker yet" from "established user who chose to follow zero teams" —
-- the shell's onboarding gate keys off it.
--
-- The `complete_onboarding` RPC writes name + follows + prefs + sets
-- onboarded=true atomically. NOT security definer — runs as the calling
-- user so RLS applies, which is the right behavior here (a user can only
-- mutate their own rows).
-- ─────────────────────────────────────────────────────────────────────────

alter table public.profiles
  add column onboarded boolean not null default false;

create or replace function public.complete_onboarding(
  p_name text,
  p_follows text[],
  p_notifications jsonb,
  p_prefs jsonb
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  uid uuid;
begin
  uid := (select auth.uid());
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  update public.profiles
    set name = p_name, onboarded = true
    where id = uid;

  delete from public.follows where user_id = uid;
  if coalesce(array_length(p_follows, 1), 0) > 0 then
    insert into public.follows (user_id, team_abbr)
    select uid, unnest(p_follows);
  end if;

  update public.notification_prefs
    set enabled   = coalesce((p_notifications->>'enabled')::boolean,             enabled),
        cat_start = coalesce((p_notifications->'categories'->>'start')::boolean, cat_start),
        cat_end   = coalesce((p_notifications->'categories'->>'end')::boolean,   cat_end),
        cat_score = coalesce((p_notifications->'categories'->>'score')::boolean, cat_score)
    where user_id = uid;

  update public.display_prefs
    set box_score_units = coalesce(p_prefs->>'boxScoreUnits',             box_score_units),
        win_probability = coalesce((p_prefs->>'winProbability')::boolean, win_probability),
        pitch_by_pitch  = coalesce((p_prefs->>'pitchByPitch')::boolean,   pitch_by_pitch),
        theme           = coalesce(p_prefs->>'theme',                     theme)
    where user_id = uid;
end;
$$;

grant execute on function public.complete_onboarding(text, text[], jsonb, jsonb) to authenticated;
