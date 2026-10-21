-- 0050 Habit and persistence, part two: milestone marks, the monthly word
-- count, and reminders at the reader's usual time (build list 4.5, 12.6,
-- 12.4).
--
-- Same rules as 0001 to 0049. Nothing earlier is edited. Depends on 0002,
-- 0003, 0040 and 0049.
--
-- Reader answers stay sealed. Nothing below holds reader text: marks hold a
-- kind and a time, word counts hold a number, and the usual time is worked out
-- from the times steps were finished.
--
-- 1. milestone_marks and public.award_milestones: first step, first week,
--    first programme, first shelf. A mark carries no title, no shelf name and
--    no answer, so the image made from it cannot either.
-- 2. answer_word_counts: how many words an answer held when it was last
--    written. Filled by the server after it opens the answer for its owner.
--    Service role only. The sum is the "words this month" line (12.6).
-- 3. app.usual_step_time and public.my_usual_step_time: the time of day a
--    reader usually finishes a step.
-- 4. public.reminder_targets, replaced with the same shape: when the reader
--    chose "my usual time" the reminder time comes from 3. The reminder job,
--    its cron route and the mailer are unchanged.

-- ---------------------------------------------------------------------------
-- 1. Milestone marks
-- ---------------------------------------------------------------------------
insert into public.app_config (key, value) values
  ('milestone_shelf_programmes', '3'),
  ('usual_time_min_steps', '5')
on conflict (key) do nothing;

create table if not exists public.milestone_marks (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users(id) on delete cascade,
  kind      text not null check (kind in ('first_step','first_week','first_programme','first_shelf')),
  earned_at timestamptz not null default now(),
  seen_at   timestamptz,
  unique (user_id, kind)
);

alter table public.milestone_marks enable row level security;
revoke all on public.milestone_marks from anon, authenticated;
grant select on public.milestone_marks to authenticated;
-- A reader can mark a mark as seen, nothing else. No insert and no delete:
-- marks are earned through award_milestones and never taken away.
grant update (seen_at) on public.milestone_marks to authenticated;
grant select, insert, update on public.milestone_marks to service_role;
create policy milestone_marks_read on public.milestone_marks for select to authenticated
  using (user_id = (select app.uid()));
create policy milestone_marks_seen on public.milestone_marks for update to authenticated
  using (user_id = (select app.uid()))
  with check (user_id = (select app.uid()));

-- Works out what the signed-in reader has earned and records anything new.
-- Returns only the marks made by this call. Safe to call as often as needed.
--   first_step       a step finished
--   first_week       the first weekly check-in done on any programme
--   first_programme  a programme finished
--   first_shelf      enough programmes finished on one shelf (app_config
--                    milestone_shelf_programmes, default 3)
create or replace function public.award_milestones() returns setof public.milestone_marks
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := app.uid();
  v_shelf_need int := coalesce((select (value #>> '{}')::int from public.app_config where key = 'milestone_shelf_programmes'), 3);
  v_kinds text[] := '{}';
  r public.milestone_marks;
begin
  if v_user is null then return; end if;

  if exists (select 1 from public.progress_events p join public.enrolments e on e.id = p.enrolment_id
              where e.user_id = v_user and p.kind = 'step_done') then
    v_kinds := array_append(v_kinds, 'first_step');
  end if;
  if exists (select 1 from public.progress_events p join public.enrolments e on e.id = p.enrolment_id
              where e.user_id = v_user and p.kind = 'checkin_done') then
    v_kinds := array_append(v_kinds, 'first_week');
  end if;
  if exists (select 1 from public.enrolments e where e.user_id = v_user and e.status = 'finished')
     or exists (select 1 from public.progress_events p join public.enrolments e on e.id = p.enrolment_id
                 where e.user_id = v_user and p.kind = 'finished') then
    v_kinds := array_append(v_kinds, 'first_programme');
  end if;
  if exists (
    select 1
      from public.enrolments e
      join public.workbooks w on w.id = e.workbook_id
      join public.themes t on t.id = w.theme_id
     where e.user_id = v_user and e.status = 'finished' and t.shelf_id is not null
     group by t.shelf_id
    having count(distinct w.id) >= v_shelf_need
  ) then
    v_kinds := array_append(v_kinds, 'first_shelf');
  end if;

  for r in
    insert into public.milestone_marks (user_id, kind)
    select v_user, k from unnest(v_kinds) as k
    on conflict (user_id, kind) do nothing
    returning *
  loop
    return next r;
  end loop;
end $$;
revoke execute on function public.award_milestones() from public, anon;
grant execute on function public.award_milestones() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Word counts per answer. A number and the write time it was counted for;
--    the server recounts when the answer has been written since.
-- ---------------------------------------------------------------------------
create table if not exists public.answer_word_counts (
  answer_id   uuid primary key references public.answers(id) on delete cascade,
  words       int not null check (words between 0 and 100000),
  counted_for timestamptz not null
);

alter table public.answer_word_counts enable row level security;
revoke all on public.answer_word_counts from anon, authenticated;
grant select, insert, update, delete on public.answer_word_counts to service_role;
-- No policy for clients: the table is read and written by the server only.

-- ---------------------------------------------------------------------------
-- 3. The usual time. The median local time of day at which the reader first
--    finished each of their steps over the last 90 days, rounded to the
--    nearest quarter hour. null until there are enough steps to say
--    (app_config usual_time_min_steps, default 5).
-- ---------------------------------------------------------------------------
create or replace function app.usual_step_time(p_user uuid, p_tz text) returns time
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz text := case when app.valid_timezone(p_tz) then p_tz else 'Europe/London' end;
  v_min int := coalesce((select (value #>> '{}')::int from public.app_config where key = 'usual_time_min_steps'), 5);
  v_n int;
  v_median numeric;
  v_rounded int;
begin
  select count(*), percentile_disc(0.5) within group (order by m)
    into v_n, v_median
    from (
      select (extract(hour from f.first_at at time zone v_tz) * 60 + extract(minute from f.first_at at time zone v_tz)) as m
        from (
          select p.enrolment_id, p.ref, min(p.at) as first_at
            from public.progress_events p
            join public.enrolments e on e.id = p.enrolment_id and e.user_id = p_user
           where p.kind = 'step_done' and p.ref is not null
           group by p.enrolment_id, p.ref
        ) f
       where f.first_at > now() - interval '90 days'
    ) t;
  if v_n < v_min or v_median is null then return null; end if;
  v_rounded := least((round(v_median / 15.0) * 15)::int, 24 * 60 - 15);
  return make_time(v_rounded / 60, v_rounded % 60, 0);
end $$;
revoke execute on function app.usual_step_time(uuid, text) from public, anon, authenticated;
grant execute on function app.usual_step_time(uuid, text) to service_role;

create or replace function public.my_usual_step_time(p_tz text default 'Europe/London') returns time
language sql stable security definer set search_path = '' as $$
  select case when app.uid() is null then null else app.usual_step_time(app.uid(), p_tz) end
$$;
revoke execute on function public.my_usual_step_time(text) from public, anon;
grant execute on function public.my_usual_step_time(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. reminder_targets: same columns as 0040. reminder_time is the reader's
--    usual time when they chose it and there is enough history, and the time
--    they set otherwise.
-- ---------------------------------------------------------------------------
create or replace function public.reminder_targets() returns table (
  enrolment_id uuid, user_id uuid, email text, workbook_id uuid, version_id uuid, safety_tier text,
  last_opened_at timestamptz, last_activity timestamptz, sent_since_activity int,
  reminder_days smallint[], reminder_time time, timezone text, pickup_on boolean
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
         s.timezone, s.pickup_on
    from public.today_settings s
    join public.enrolments e on e.id = s.enrolment_id and e.status = 'active'
    join public.workbooks w on w.id = e.workbook_id
    join auth.users u on u.id = s.user_id
    left join public.habit_settings h on h.user_id = s.user_id
    cross join lateral (
      select greatest(e.last_opened_at, coalesce((select max(p.at) from public.progress_events p where p.enrolment_id = e.id), e.last_opened_at)) as last_activity
    ) a
   where s.reminders_on
     and u.email is not null
     and not exists (select 1 from public.account_deletion_requests d
                      where d.user_id = s.user_id and d.cancelled_at is null and d.completed_at is null);
end $$;
revoke execute on function public.reminder_targets() from public, anon, authenticated;
grant execute on function public.reminder_targets() to service_role;
