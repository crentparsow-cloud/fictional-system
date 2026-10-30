-- 0069 Pace and the streak rule by shelf. Streaks may count on any workbook
-- except the Mind and Mood shelf and the higher tier. Each enrolment carries
-- a pace, defaulted from the title's unit. Each block must raise or return the
-- expected value; a failure aborts the script.
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('a6900000-0000-0000-0000-000000000001', 'reader69a@test'),
  ('a6900000-0000-0000-0000-000000000002', 'reader69b@test'),
  ('a6900000-0000-0000-0000-000000000003', 'reader69c@test');

insert into public.organisations (id, code, kind, legal_name, display_name, slug, country, connect_status) values
  ('a6900000-0000-0000-0000-0000000000a1', 'PB-TST69', 'publisher', 'Org 69 Ltd', 'Org 69', 'org-69', 'GB', 'verified');
insert into public.books (id, org_id, slug, title, rights_status) values
  ('a6900000-0000-0000-0000-0000000000b1', 'a6900000-0000-0000-0000-0000000000a1', 'book-69', 'Book 69', 'public_domain');

-- c1 tier none, no Theme              -> counts
-- c2 tier standard, Health and Body   -> counts (new under 0069)
-- c3 tier none, Mind and Mood         -> never counts (new under 0069)
-- c4 tier higher, no Theme            -> never counts
insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, theme_id, safety_tier, depth, status) values
  ('a6900000-0000-0000-0000-0000000000c1', 'AK-T69A0', 'a6900000-0000-0000-0000-0000000000b1', 'a6900000-0000-0000-0000-0000000000a1',
   'wb-69-none', 'Workbook 69 none', 'Card', 'productivity', null, 'none', 'full', 'live'),
  ('a6900000-0000-0000-0000-0000000000c2', 'AK-T69B0', 'a6900000-0000-0000-0000-0000000000b1', 'a6900000-0000-0000-0000-0000000000a1',
   'wb-69-health', 'Workbook 69 health', 'Card', 'wellbeing', 'everyday-movement', 'standard', 'full', 'live'),
  ('a6900000-0000-0000-0000-0000000000c3', 'AK-T69C0', 'a6900000-0000-0000-0000-0000000000b1', 'a6900000-0000-0000-0000-0000000000a1',
   'wb-69-mind', 'Workbook 69 mind', 'Card', 'productivity', 'settled-mind', 'none', 'full', 'live'),
  ('a6900000-0000-0000-0000-0000000000c4', 'AK-T69D0', 'a6900000-0000-0000-0000-0000000000b1', 'a6900000-0000-0000-0000-0000000000a1',
   'wb-69-higher', 'Workbook 69 higher', 'Card', 'wellbeing', null, 'higher', 'full', 'live');
insert into public.workbook_versions (id, workbook_id, semver, content, content_hash) values
  ('a6900000-0000-0000-0000-0000000000d1', 'a6900000-0000-0000-0000-0000000000c1', '1.0.0', '{"structure":{"unit":"week","count":4}}'::jsonb, repeat('a', 64)),
  ('a6900000-0000-0000-0000-0000000000d2', 'a6900000-0000-0000-0000-0000000000c2', '1.0.0', '{"structure":{"unit":"part","count":6}}'::jsonb, repeat('b', 64)),
  ('a6900000-0000-0000-0000-0000000000d3', 'a6900000-0000-0000-0000-0000000000c3', '1.0.0', '{"structure":{"unit":"chapter","count":8}}'::jsonb, repeat('c', 64)),
  ('a6900000-0000-0000-0000-0000000000d4', 'a6900000-0000-0000-0000-0000000000c4', '1.0.0', '{}'::jsonb, repeat('e', 64));

-- Reader 1: three steps on the Health and Body title, and a pace row on c1.
-- Reader 2: three steps on the Mind and Mood title and three on the higher title.
-- Reader 3: an enrolment on c1, the friend in a pair with reader 1.
insert into public.enrolments (id, user_id, tenant_id, workbook_id, version_id) values
  ('a6900000-0000-0000-0000-0000000000e1', 'a6900000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   'a6900000-0000-0000-0000-0000000000c2', 'a6900000-0000-0000-0000-0000000000d2'),
  ('a6900000-0000-0000-0000-0000000000e2', 'a6900000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a',
   'a6900000-0000-0000-0000-0000000000c3', 'a6900000-0000-0000-0000-0000000000d3'),
  ('a6900000-0000-0000-0000-0000000000e3', 'a6900000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a',
   'a6900000-0000-0000-0000-0000000000c4', 'a6900000-0000-0000-0000-0000000000d4'),
  ('a6900000-0000-0000-0000-0000000000e4', 'a6900000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   'a6900000-0000-0000-0000-0000000000c1', 'a6900000-0000-0000-0000-0000000000d1'),
  ('a6900000-0000-0000-0000-0000000000e5', 'a6900000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000a',
   'a6900000-0000-0000-0000-0000000000c1', 'a6900000-0000-0000-0000-0000000000d1');
insert into public.progress_events (enrolment_id, kind, ref, at) values
  ('a6900000-0000-0000-0000-0000000000e1', 'step_done', 's1', now() - interval '3 days'),
  ('a6900000-0000-0000-0000-0000000000e1', 'step_done', 's2', now() - interval '2 days'),
  ('a6900000-0000-0000-0000-0000000000e1', 'step_done', 's3', now() - interval '1 day'),
  ('a6900000-0000-0000-0000-0000000000e2', 'step_done', 's1', now() - interval '3 days'),
  ('a6900000-0000-0000-0000-0000000000e2', 'step_done', 's2', now() - interval '2 days'),
  ('a6900000-0000-0000-0000-0000000000e2', 'step_done', 's3', now() - interval '1 day'),
  ('a6900000-0000-0000-0000-0000000000e3', 'step_done', 's1', now() - interval '3 days'),
  ('a6900000-0000-0000-0000-0000000000e3', 'step_done', 's2', now() - interval '2 days'),
  ('a6900000-0000-0000-0000-0000000000e3', 'step_done', 's3', now() - interval '1 day');

-- ---------------------------------------------------------------------------
-- 1. The one rule: app.habit_allowed
-- ---------------------------------------------------------------------------
do $$ begin
  if not app.habit_allowed('a6900000-0000-0000-0000-0000000000c1') then raise exception 'a tier none title without a Theme should count'; end if;
  if not app.habit_allowed('a6900000-0000-0000-0000-0000000000c2') then raise exception 'a standard title on Health and Body should count'; end if;
  if app.habit_allowed('a6900000-0000-0000-0000-0000000000c3') then raise exception 'a Mind and Mood title counted'; end if;
  if app.habit_allowed('a6900000-0000-0000-0000-0000000000c4') then raise exception 'a higher tier title counted'; end if;
  if app.habit_allowed('a6900000-0000-0000-0000-0000000000ff') then raise exception 'an unknown workbook counted'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The offer, the guard and the step days follow the shelf rule
-- ---------------------------------------------------------------------------
select test_as('a6900000-0000-0000-0000-000000000002');
do $$ begin
  if public.habit_none_tier_steps() <> 0 then raise exception 'Mind and Mood or higher tier steps were counted toward the offer'; end if;
  begin
    insert into public.habit_settings (user_id, daily_run_on) values ('a6900000-0000-0000-0000-000000000002', true);
    raise exception 'a reader with only Mind and Mood and higher titles switched the streak on';
  exception when sqlstate 'AKH01' then null; end;
end $$;
reset role;

select test_as('a6900000-0000-0000-0000-000000000001');
do $$ begin
  if public.habit_none_tier_steps() <> 3 then raise exception 'standard tier steps off Mind and Mood should now count'; end if;
  insert into public.habit_settings (user_id, daily_run_on) values ('a6900000-0000-0000-0000-000000000001', true);
  if (select coalesce(sum(step_count), 0) from public.habit_step_days('Europe/London')) <> 3 then
    raise exception 'step days should hold the three Health and Body steps';
  end if;
end $$;
reset role;

-- Reader 1 starts a Mind and Mood title: its steps never reach the step days.
insert into public.enrolments (id, user_id, tenant_id, workbook_id, version_id) values
  ('a6900000-0000-0000-0000-0000000000e6', 'a6900000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   'a6900000-0000-0000-0000-0000000000c3', 'a6900000-0000-0000-0000-0000000000d3');
insert into public.progress_events (enrolment_id, kind, ref, at) values
  ('a6900000-0000-0000-0000-0000000000e6', 'step_done', 'm1', now() - interval '1 hour');
select test_as('a6900000-0000-0000-0000-000000000001');
do $$ begin
  if public.habit_none_tier_steps() <> 3 then raise exception 'a Mind and Mood step reached the offer count'; end if;
  if (select coalesce(sum(step_count), 0) from public.habit_step_days('Europe/London')) <> 3 then
    raise exception 'a Mind and Mood step reached the step days';
  end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. Pace: the default follows the unit, the reader sets their own, a bad
--    value is refused, and nobody sets another reader's pace
-- ---------------------------------------------------------------------------
do $$ begin
  if app.enrolment_pace('a6900000-0000-0000-0000-0000000000e4') <> 'weekly' then raise exception 'a week title should default to weekly'; end if;
  if app.enrolment_pace('a6900000-0000-0000-0000-0000000000e1') <> 'own_pace' then raise exception 'a part title should default to own pace'; end if;
  if app.enrolment_pace('a6900000-0000-0000-0000-0000000000e2') <> 'own_pace' then raise exception 'a chapter title should default to own pace'; end if;
end $$;

select test_as('a6900000-0000-0000-0000-000000000001');
do $$
declare n int;
begin
  update public.enrolments set pace = 'daily' where id = 'a6900000-0000-0000-0000-0000000000e4';
  if (select pace from public.enrolments where id = 'a6900000-0000-0000-0000-0000000000e4') <> 'daily' then raise exception 'the reader could not set their pace'; end if;
  begin
    update public.enrolments set pace = 'hourly' where id = 'a6900000-0000-0000-0000-0000000000e4';
    raise exception 'a made-up pace was stored';
  exception when check_violation then null; end;
  update public.enrolments set pace = 'weekly' where id = 'a6900000-0000-0000-0000-0000000000e5';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'a reader changed another reader''s pace'; end if;
end $$;
reset role;

do $$ begin
  if app.enrolment_pace('a6900000-0000-0000-0000-0000000000e4') <> 'daily' then raise exception 'the chosen pace should win over the default'; end if;
  if (select pace from public.enrolments where id = 'a6900000-0000-0000-0000-0000000000e5') is not null then raise exception 'reader 3''s pace changed'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. reminder_targets carries the pace and the days the pace rule reads
-- ---------------------------------------------------------------------------
insert into public.today_settings (enrolment_id, user_id, reminders_on, reminder_days, reminder_time, timezone) values
  ('a6900000-0000-0000-0000-0000000000e1', 'a6900000-0000-0000-0000-000000000001', true, '{1,2,3,4,5,6,7}', '08:30', 'Europe/London');
insert into public.reminder_log (user_id, enrolment_id, kind, ref, local_date) values
  ('a6900000-0000-0000-0000-000000000001', 'a6900000-0000-0000-0000-0000000000e1', 'step', 's3', current_date - 5);

create or replace function pg_temp.as_service() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "service_role"}'::text, true);
  execute 'set local role service_role';
end $$;

select pg_temp.as_service();
do $$
declare r record;
begin
  select * into r from public.reminder_targets() where enrolment_id = 'a6900000-0000-0000-0000-0000000000e1';
  if r is null then raise exception 'the target is missing'; end if;
  if r.pace <> 'own_pace' then raise exception 'the target pace should be the default own pace, got %', r.pace; end if;
  if r.last_step_day <> ((now() - interval '1 day') at time zone 'Europe/London')::date then raise exception 'the last step day is wrong'; end if;
  if r.steps_in_last_week < 1 or r.steps_in_last_week > 3 then raise exception 'steps in the last week out of range: %', r.steps_in_last_week; end if;
  if r.last_reminder_day <> current_date - 5 then raise exception 'the last reminder day is wrong'; end if;
  if r.last_active_day is null then raise exception 'the last active day is missing'; end if;
end $$;
reset role;

select test_as('a6900000-0000-0000-0000-000000000001');
do $$ begin
  begin
    perform * from public.reminder_targets();
    raise exception 'a reader called reminder_targets';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 5. my_pair_paces: the friend's pace and this week's finish, members only
-- ---------------------------------------------------------------------------
insert into public.programme_pairs (id, workbook_id, tenant_id, inviter_id, friend_id, inviter_label, friend_label, status, token_hash, accepted_at) values
  ('a6900000-0000-0000-0000-0000000000f1', 'a6900000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000a',
   'a6900000-0000-0000-0000-000000000001', 'a6900000-0000-0000-0000-000000000003', 'Sam', 'Alex', 'active', null, now());
insert into public.pair_finishes (pair_id, user_id, local_date) values
  ('a6900000-0000-0000-0000-0000000000f1', 'a6900000-0000-0000-0000-000000000001', app.london_today());

select test_as('a6900000-0000-0000-0000-000000000003');
do $$ begin
  if (select friend_pace from public.my_pair_paces()) <> 'daily' then raise exception 'reader 3 should see reader 1''s daily pace'; end if;
  if not (select friend_finished_this_week from public.my_pair_paces()) then raise exception 'reader 1 finished this week'; end if;
end $$;
reset role;

select test_as('a6900000-0000-0000-0000-000000000001');
do $$ begin
  if (select friend_pace from public.my_pair_paces()) <> 'weekly' then raise exception 'reader 1 should see reader 3''s default weekly pace'; end if;
  if (select friend_finished_this_week from public.my_pair_paces()) then raise exception 'reader 3 has not finished this week'; end if;
end $$;
reset role;

select test_as('a6900000-0000-0000-0000-000000000002');
do $$ begin
  if exists (select 1 from public.my_pair_paces()) then raise exception 'a stranger saw a pair'; end if;
end $$;
reset role;

rollback;
