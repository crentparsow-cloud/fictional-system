-- 0069 Reader-chosen pace per workbook, and the streak rule by shelf
-- (decided by Crent, 30 October 2026).
--
-- Same rules as 0001 to 0066. Nothing earlier is edited. Functions are
-- security definer with search_path pinned to ''. Safe to run twice.
--
-- Part one: pace. Each enrolment carries the reader's pace: 'daily',
-- 'few_times_a_week' (three a week), 'weekly' or 'own_pace'. null means the
-- default for the title: weekly when its structure.unit is 'week', own pace
-- otherwise. The reader writes it on their own enrolment (the 0003 policy and
-- guard already allow that and keep the pins). Pace never locks a unit.
--
-- Part two: streaks by shelf. 0049 limited streaks, daily goals, the offer
-- and habit_step_days to workbooks with safety_tier = 'none'. The new rule:
-- every workbook may count, except those on the Mind and Mood shelf (shelf id
-- 'mind-and-mood', through workbooks.theme_id -> themes.shelf_id), which never
-- count, never offer and never show streak or goal language. The higher tier
-- stays out as belt and braces. The rule lives in one function,
-- app.habit_allowed(workbook_id). The app holds the same rule in
-- habitAllowed() in @akana/schema. Function names from 0049 stay so the app
-- and earlier tests keep working; their bodies now use the new rule.
--
-- 1. enrolments.pace
-- 2. app.default_pace, app.enrolment_pace
-- 3. app.habit_allowed
-- 4. app.habit_steps, and 0049's step counters redefined on it
-- 5. the 0049 guard trigger redefined
-- 6. public.habit_step_days redefined
-- 7. public.reminder_targets: the 0050 columns plus what the pace needs
-- 8. public.my_pair_paces: the friend's pace and this week's finish

-- ---------------------------------------------------------------------------
-- 1. Pace on the enrolment
-- ---------------------------------------------------------------------------
alter table public.enrolments add column if not exists pace text;
do $$ begin
  alter table public.enrolments add constraint enrolments_pace_check
    check (pace is null or pace in ('daily','few_times_a_week','weekly','own_pace'));
exception when duplicate_object then null; end $$;
comment on column public.enrolments.pace is
  'The reader''s pace for this workbook. null means the default: weekly for a week title, own_pace otherwise (0069).';

-- ---------------------------------------------------------------------------
-- 2. The pace in force
-- ---------------------------------------------------------------------------
create or replace function app.default_pace(p_version uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when (select v.content #>> '{structure,unit}' from public.workbook_versions v where v.id = p_version) = 'week'
              then 'weekly' else 'own_pace' end
$$;
revoke execute on function app.default_pace(uuid) from public, anon, authenticated;
grant execute on function app.default_pace(uuid) to service_role;

create or replace function app.enrolment_pace(p_enrolment uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(e.pace, app.default_pace(e.version_id)) from public.enrolments e where e.id = p_enrolment
$$;
revoke execute on function app.enrolment_pace(uuid) from public, anon, authenticated;
grant execute on function app.enrolment_pace(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 3. The one rule for streaks, goals and the offer
-- ---------------------------------------------------------------------------
create or replace function app.habit_allowed(p_workbook uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select w.safety_tier <> 'higher' and coalesce(t.shelf_id, '') <> 'mind-and-mood'
      from public.workbooks w
      left join public.themes t on t.id = w.theme_id
     where w.id = p_workbook), false)
$$;
revoke execute on function app.habit_allowed(uuid) from public, anon;
grant execute on function app.habit_allowed(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Finished steps on workbooks the streak may count. A step counts once.
-- ---------------------------------------------------------------------------
create or replace function app.habit_steps(p_user uuid) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from (
    select distinct p.enrolment_id, p.ref
      from public.progress_events p
      join public.enrolments e on e.id = p.enrolment_id and e.user_id = p_user
     where p.kind = 'step_done' and p.ref is not null
       and app.habit_allowed(e.workbook_id)
  ) s
$$;
revoke execute on function app.habit_steps(uuid) from public, anon, authenticated;
grant execute on function app.habit_steps(uuid) to service_role;

-- 0049's names, kept for the app. The rule is now the shelf rule.
create or replace function app.none_tier_steps(p_user uuid) returns int
language sql stable security definer set search_path = '' as $$
  select app.habit_steps(p_user)
$$;
revoke execute on function app.none_tier_steps(uuid) from public, anon, authenticated;
grant execute on function app.none_tier_steps(uuid) to service_role;

create or replace function public.habit_none_tier_steps() returns int
language sql stable security definer set search_path = '' as $$
  select case when app.uid() is null then 0 else app.habit_steps(app.uid()) end
$$;
revoke execute on function public.habit_none_tier_steps() from public, anon;
grant execute on function public.habit_none_tier_steps() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. The guard, as 0049 with the shelf rule. Errors keep their AKH codes.
-- ---------------------------------------------------------------------------
create or replace function app.habit_settings_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_need int := coalesce((select (value #>> '{}')::int from public.app_config where key = 'habit_offer_after_steps'), 3);
  v_max  int := coalesce((select (value #>> '{}')::int from public.app_config where key = 'habit_max_goal'), 3);
begin
  new.updated_at := now();
  if new.daily_run_on and (tg_op = 'INSERT' or not old.daily_run_on) then
    if app.habit_steps(new.user_id) < v_need then
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
-- 6. Finished steps per local day, as 0049, on workbooks the streak may count.
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
       where p.kind = 'step_done' and p.ref is not null
         and app.habit_allowed(e.workbook_id)
       group by p.enrolment_id, p.ref
    ) f
   where f.first_at > now() - interval '400 days'
   group by 1
   order by 1;
end $$;
revoke execute on function public.habit_step_days(text) from public, anon;
grant execute on function public.habit_step_days(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. reminder_targets: the 0050 columns, then the pace and the days the pace
--    rule reads, all in the reader's own time zone:
--      pace                  the pace in force
--      last_step_day         the day of the last finished step, or null
--      steps_in_last_week    finished steps in the calendar week of that day
--      last_reminder_day     the local day of the last step reminder, or null
--      last_active_day       the day of the last open or finish
--    The return type changes, so the function is dropped and made again.
-- ---------------------------------------------------------------------------
drop function if exists public.reminder_targets();
create function public.reminder_targets() returns table (
  enrolment_id uuid, user_id uuid, email text, workbook_id uuid, version_id uuid, safety_tier text,
  last_opened_at timestamptz, last_activity timestamptz, sent_since_activity int,
  reminder_days smallint[], reminder_time time, timezone text, pickup_on boolean,
  pace text, last_step_day date, steps_in_last_week int, last_reminder_day date, last_active_day date
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_service_role() then
    raise exception 'only the service role reads reminder targets' using errcode = 'insufficient_privilege';
  end if;
  return query
  select s.enrolment_id, s.user_id, u.email::text, e.workbook_id, e.version_id, w.safety_tier::text,
         e.last_opened_at, a.last_activity,
         (select count(*)::int from public.reminder_log r
           where r.enrolment_id = e.id and r.kind = 'step' and r.sent_at > a.last_activity),
         s.reminder_days,
         case when coalesce(h.usual_time_on, false)
              then coalesce(app.usual_step_time(s.user_id, s.timezone), s.reminder_time)
              else s.reminder_time end,
         s.timezone, s.pickup_on,
         coalesce(e.pace, app.default_pace(e.version_id)),
         ls.day,
         case when ls.day is null then 0 else (
           select count(distinct p.ref)::int from public.progress_events p
            where p.enrolment_id = e.id and p.kind = 'step_done' and p.ref is not null
              and date_trunc('week', (p.at at time zone s.timezone)) = date_trunc('week', ls.day::timestamp)) end,
         (select max(r.local_date) from public.reminder_log r where r.enrolment_id = e.id and r.kind = 'step'),
         (a.last_activity at time zone s.timezone)::date
    from public.today_settings s
    join public.enrolments e on e.id = s.enrolment_id and e.status = 'active'
    join public.workbooks w on w.id = e.workbook_id
    join auth.users u on u.id = s.user_id
    left join public.habit_settings h on h.user_id = s.user_id
    cross join lateral (
      select greatest(e.last_opened_at, coalesce((select max(p.at) from public.progress_events p where p.enrolment_id = e.id), e.last_opened_at)) as last_activity
    ) a
    cross join lateral (
      select (max(p.at) at time zone s.timezone)::date as day
        from public.progress_events p
       where p.enrolment_id = e.id and p.kind = 'step_done' and p.ref is not null
    ) ls
   where s.reminders_on
     and u.email is not null
     and not exists (select 1 from public.account_deletion_requests d
                      where d.user_id = s.user_id and d.cancelled_at is null and d.completed_at is null);
end $$;
revoke execute on function public.reminder_targets() from public, anon, authenticated;
grant execute on function public.reminder_targets() to service_role;

-- ---------------------------------------------------------------------------
-- 8. The friend's pace, for the one status line. Members only, like
--    my_pairs(); no user id leaves the function. this_week is whether the
--    friend finished a step in the current London calendar week.
-- ---------------------------------------------------------------------------
create or replace function public.my_pair_paces() returns table (pair_id uuid, friend_pace text, friend_finished_this_week boolean)
language sql stable security definer set search_path = '' as $$
  select p.id,
         coalesce((select app.enrolment_pace(e.id) from public.enrolments e
                    where e.user_id = case when p.inviter_id = app.uid() then p.friend_id else p.inviter_id end
                      and e.workbook_id = p.workbook_id and e.tenant_id = p.tenant_id
                    limit 1), 'own_pace'),
         exists (select 1 from public.pair_finishes f
                  where f.pair_id = p.id and f.user_id <> app.uid()
                    and f.local_date >= date_trunc('week', app.london_today()::timestamp)::date)
    from public.programme_pairs p
   where app.uid() is not null
     and p.status = 'active'
     and (p.inviter_id = app.uid() or p.friend_id = app.uid())
$$;
revoke execute on function public.my_pair_paces() from public, anon;
grant execute on function public.my_pair_paces() to authenticated, service_role;
