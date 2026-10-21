-- 0049 Habit and persistence, part one: the optional daily run, daily goals and
-- the companion (build list 4.4, 13.6, 4.6, 11.2).
--
-- Same rules as 0001 to 0048. Nothing earlier is edited. Every table has RLS
-- on, grants are given back column by column, and every function is security
-- definer with search_path pinned to ''. Depends on 0001, 0002, 0003 and 0040.
--
-- The rule that matters. Streaks and daily goals exist only for readers who
-- choose them, only after they have finished a few steps, and never for a
-- mental health title (safety tier standard or higher, tiers 1 and 2). The
-- block is in the data layer, not in the page:
--   * habit_step_days returns rows only from enrolments on workbooks with
--     safety_tier = 'none'. A tier 1 or 2 title cannot reach a run, whatever
--     the app does.
--   * habit_settings refuses to switch the run on until the reader has
--     finished the configured number of steps on tier 'none' titles.
-- Nothing is compared between readers. No function here takes another
-- reader's id and no table can be read across readers.
--
-- Names. The 0003 test forbids any function or column whose name contains the
-- word the habit is commonly known by, so the schema says "daily run" and
-- "step days". The app calls it a streak.
--
-- 1. Config the app reads (public app_config, not secret).
-- 2. habit_settings: one row per reader.
-- 3. app.none_tier_steps and public.habit_none_tier_steps: finished steps on
--    tier 'none' titles, for the offer and the guard.
-- 4. The guard trigger.
-- 5. public.habit_step_days: finished steps per local day, tier 'none' only,
--    empty unless the reader switched the run on.
-- 6. public.companion_state: total finished steps and a high-water mark that
--    only ever rises, so the companion never loses anything.

-- ---------------------------------------------------------------------------
-- 1. Config
-- ---------------------------------------------------------------------------
insert into public.app_config (key, value) values
  ('habit_offer_after_steps', '3'),
  ('habit_pause_days', '3'),
  ('habit_max_goal', '3'),
  ('companion_stage_steps', '[3,10,25,50,100,200]')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 2. habit_settings
-- ---------------------------------------------------------------------------
create table if not exists public.habit_settings (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  -- The daily run: off until the reader switches it on.
  daily_run_on          boolean not null default false,
  -- Finished steps that make a goal day. The ceiling is in app_config.
  daily_goal            smallint not null default 1 check (daily_goal between 1 and 10),
  -- Set when the reader says "not now" to the offer. The offer then stays quiet.
  offer_declined_at    timestamptz,
  -- The companion on Today. null means the default: on, or off for a reader
  -- who has a mental health title.
  companion_on          boolean,
  -- Reminders at the reader's usual time (12.4), read by reminder_targets in 0050.
  usual_time_on         boolean not null default false,
  -- Finished steps seen so far. Only ever goes up.
  companion_high_water  int not null default 0 check (companion_high_water >= 0),
  updated_at            timestamptz not null default now()
);

alter table public.habit_settings enable row level security;
revoke all on public.habit_settings from anon, authenticated;
grant select on public.habit_settings to authenticated;
-- A reader writes the choices, never the high-water mark. user_id is in the
-- update list because an upsert from the client names every column; the
-- policies below still pin it to the reader.
grant insert (user_id, daily_run_on, daily_goal, offer_declined_at, companion_on, usual_time_on)
  on public.habit_settings to authenticated;
grant update (user_id, daily_run_on, daily_goal, offer_declined_at, companion_on, usual_time_on)
  on public.habit_settings to authenticated;
grant select, insert, update on public.habit_settings to service_role;

create policy habit_settings_read on public.habit_settings for select to authenticated
  using (user_id = (select app.uid()));
create policy habit_settings_insert on public.habit_settings for insert to authenticated
  with check (user_id = (select app.uid()));
create policy habit_settings_update on public.habit_settings for update to authenticated
  using (user_id = (select app.uid()))
  with check (user_id = (select app.uid()));

-- ---------------------------------------------------------------------------
-- 3. Finished steps on tier 'none' titles. A step counts once, however many
--    times it is done again.
-- ---------------------------------------------------------------------------
create or replace function app.none_tier_steps(p_user uuid) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from (
    select distinct p.enrolment_id, p.ref
      from public.progress_events p
      join public.enrolments e on e.id = p.enrolment_id and e.user_id = p_user
      join public.workbooks w on w.id = e.workbook_id and w.safety_tier = 'none'
     where p.kind = 'step_done' and p.ref is not null
  ) s
$$;
revoke execute on function app.none_tier_steps(uuid) from public, anon, authenticated;
grant execute on function app.none_tier_steps(uuid) to service_role;

create or replace function public.habit_none_tier_steps() returns int
language sql stable security definer set search_path = '' as $$
  select case when app.uid() is null then 0 else app.none_tier_steps(app.uid()) end
$$;
revoke execute on function public.habit_none_tier_steps() from public, anon;
grant execute on function public.habit_none_tier_steps() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. The guard. The run cannot be switched on before the offer is earned, and
--    the goal cannot go above the ceiling. Errors use AKH codes.
--      AKH01  the run is offered only after enough finished steps
--      AKH02  the daily goal is above the ceiling
-- ---------------------------------------------------------------------------
create or replace function app.habit_settings_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_need int := coalesce((select (value #>> '{}')::int from public.app_config where key = 'habit_offer_after_steps'), 3);
  v_max  int := coalesce((select (value #>> '{}')::int from public.app_config where key = 'habit_max_goal'), 3);
begin
  new.updated_at := now();
  if new.daily_run_on and (tg_op = 'INSERT' or not old.daily_run_on) then
    if app.none_tier_steps(new.user_id) < v_need then
      raise exception 'the daily run is offered after % finished steps', v_need using errcode = 'AKH01';
    end if;
  end if;
  if new.daily_goal > v_max then
    raise exception 'the daily goal cannot be above %', v_max using errcode = 'AKH02';
  end if;
  return new;
end $$;
drop trigger if exists habit_settings_guard on public.habit_settings;
create trigger habit_settings_guard before insert or update on public.habit_settings
  for each row execute function app.habit_settings_guard();

-- ---------------------------------------------------------------------------
-- 5. Finished steps per local day, for the reader only, tier 'none' only, and
--    only while the reader has the run switched on. The last 400 days.
-- ---------------------------------------------------------------------------
create or replace function public.habit_step_days(p_tz text default 'Europe/London')
returns table (step_day date, step_count int)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := app.uid();
  v_tz text := case when app.valid_timezone(p_tz) then p_tz else 'Europe/London' end;
begin
  if v_user is null then return; end if;
  if not coalesce((select s.daily_run_on from public.habit_settings s where s.user_id = v_user), false) then return; end if;
  return query
  select (f.first_at at time zone v_tz)::date, count(*)::int
    from (
      select p.enrolment_id, p.ref, min(p.at) as first_at
        from public.progress_events p
        join public.enrolments e on e.id = p.enrolment_id and e.user_id = v_user
        join public.workbooks w on w.id = e.workbook_id and w.safety_tier = 'none'
       where p.kind = 'step_done' and p.ref is not null
       group by p.enrolment_id, p.ref
    ) f
   where f.first_at > now() - interval '400 days'
   group by 1
   order by 1;
end $$;
revoke execute on function public.habit_step_days(text) from public, anon;
grant execute on function public.habit_step_days(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. The companion. Total finished steps across every title (the reader sees
--    it only if the companion is on), and a high-water mark that only rises.
--    A reader whose enrolments are later removed keeps what the companion
--    had grown to.
-- ---------------------------------------------------------------------------
create or replace function public.companion_state() returns table (steps int, high_water int)
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := app.uid();
  v_steps int;
  v_hw int;
begin
  if v_user is null then return; end if;
  select count(*)::int into v_steps from (
    select distinct p.enrolment_id, p.ref
      from public.progress_events p
      join public.enrolments e on e.id = p.enrolment_id and e.user_id = v_user
     where p.kind = 'step_done' and p.ref is not null
  ) s;
  insert into public.habit_settings as h (user_id, companion_high_water) values (v_user, v_steps)
  on conflict (user_id) do update set companion_high_water = greatest(h.companion_high_water, excluded.companion_high_water)
  returning h.companion_high_water into v_hw;
  return query select v_steps, v_hw;
end $$;
revoke execute on function public.companion_state() from public, anon;
grant execute on function public.companion_state() to authenticated, service_role;
