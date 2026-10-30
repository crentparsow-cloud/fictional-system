-- 0049 Habit: the optional daily run and the companion. The run is the
-- reader's own, offered only after enough finished steps, and a mental health
-- title (tier standard or higher) can never reach it. The companion's
-- high-water mark only rises. Each block must raise or return the expected
-- value; a failure aborts the script.
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('a4900000-0000-0000-0000-000000000001', 'reader49a@test'),
  ('a4900000-0000-0000-0000-000000000002', 'reader49b@test'),
  ('a4900000-0000-0000-0000-000000000003', 'reader49c@test');

insert into public.organisations (id, code, kind, legal_name, display_name, slug, country, connect_status) values
  ('a4900000-0000-0000-0000-0000000000a1', 'PB-TST49', 'publisher', 'Org 49 Ltd', 'Org 49', 'org-49', 'GB', 'verified');
insert into public.books (id, org_id, slug, title, rights_status) values
  ('a4900000-0000-0000-0000-0000000000b1', 'a4900000-0000-0000-0000-0000000000a1', 'book-49', 'Book 49', 'public_domain');
-- Since 0069 the streak rule is by shelf: the standard title sits on a Mind
-- and Mood Theme, so it stays out under both the old and the new rule.
insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, theme_id, safety_tier, depth, status) values
  ('a4900000-0000-0000-0000-0000000000c1', 'AK-T49A0', 'a4900000-0000-0000-0000-0000000000b1', 'a4900000-0000-0000-0000-0000000000a1',
   'wb-49-none', 'Workbook 49 none', 'Card', 'productivity', null, 'none', 'full', 'live'),
  ('a4900000-0000-0000-0000-0000000000c2', 'AK-T49B0', 'a4900000-0000-0000-0000-0000000000b1', 'a4900000-0000-0000-0000-0000000000a1',
   'wb-49-std', 'Workbook 49 standard', 'Card', 'wellbeing', 'settled-mind', 'standard', 'full', 'live');
insert into public.workbook_versions (id, workbook_id, semver, content, content_hash) values
  ('a4900000-0000-0000-0000-0000000000d1', 'a4900000-0000-0000-0000-0000000000c1', '1.0.0', '{}'::jsonb, repeat('c', 64)),
  ('a4900000-0000-0000-0000-0000000000d2', 'a4900000-0000-0000-0000-0000000000c2', '1.0.0', '{}'::jsonb, repeat('d', 64));

-- Reader 1: three steps on a tier none title. Reader 2: five steps, all on a
-- standard title. Reader 3: two steps on a tier none title.
insert into public.enrolments (id, user_id, tenant_id, workbook_id, version_id) values
  ('a4900000-0000-0000-0000-0000000000e1', 'a4900000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   'a4900000-0000-0000-0000-0000000000c1', 'a4900000-0000-0000-0000-0000000000d1'),
  ('a4900000-0000-0000-0000-0000000000e2', 'a4900000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a',
   'a4900000-0000-0000-0000-0000000000c2', 'a4900000-0000-0000-0000-0000000000d2'),
  ('a4900000-0000-0000-0000-0000000000e3', 'a4900000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000a',
   'a4900000-0000-0000-0000-0000000000c1', 'a4900000-0000-0000-0000-0000000000d1');
insert into public.progress_events (enrolment_id, kind, ref, at) values
  ('a4900000-0000-0000-0000-0000000000e1', 'step_done', 's1', now() - interval '3 days'),
  ('a4900000-0000-0000-0000-0000000000e1', 'step_done', 's2', now() - interval '2 days'),
  ('a4900000-0000-0000-0000-0000000000e1', 'step_done', 's3', now() - interval '1 day'),
  -- the same step done again does not count twice
  ('a4900000-0000-0000-0000-0000000000e1', 'step_done', 's3', now() - interval '1 hour'),
  ('a4900000-0000-0000-0000-0000000000e2', 'step_done', 's1', now() - interval '5 days'),
  ('a4900000-0000-0000-0000-0000000000e2', 'step_done', 's2', now() - interval '4 days'),
  ('a4900000-0000-0000-0000-0000000000e2', 'step_done', 's3', now() - interval '3 days'),
  ('a4900000-0000-0000-0000-0000000000e2', 'step_done', 's4', now() - interval '2 days'),
  ('a4900000-0000-0000-0000-0000000000e2', 'step_done', 's5', now() - interval '1 day'),
  ('a4900000-0000-0000-0000-0000000000e3', 'step_done', 's1', now() - interval '2 days'),
  ('a4900000-0000-0000-0000-0000000000e3', 'step_done', 's2', now() - interval '1 day');

-- ---------------------------------------------------------------------------
-- 1. The offer is earned: the run cannot be switched on early, and only tier
--    none steps count toward it.
-- ---------------------------------------------------------------------------
select test_as('a4900000-0000-0000-0000-000000000003');
do $$ begin
  if public.habit_none_tier_steps() <> 2 then raise exception 'reader 3 should have 2 counted steps'; end if;
  begin
    insert into public.habit_settings (user_id, daily_run_on) values ('a4900000-0000-0000-0000-000000000003', true);
    raise exception 'the run was switched on after two steps';
  exception when sqlstate 'AKH01' then null; end;
  -- Saying "not now" to the offer is allowed at any point.
  insert into public.habit_settings (user_id, offer_declined_at) values ('a4900000-0000-0000-0000-000000000003', now());
end $$;
reset role;

select test_as('a4900000-0000-0000-0000-000000000002');
do $$ begin
  if public.habit_none_tier_steps() <> 0 then raise exception 'standard tier steps were counted toward the offer'; end if;
  begin
    insert into public.habit_settings (user_id, daily_run_on) values ('a4900000-0000-0000-0000-000000000002', true);
    raise exception 'a reader with only a mental health title switched the run on';
  exception when sqlstate 'AKH01' then null; end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 2. A reader with three tier none steps can switch it on; the goal ceiling holds
-- ---------------------------------------------------------------------------
select test_as('a4900000-0000-0000-0000-000000000001');
do $$ declare n int; begin
  if public.habit_none_tier_steps() <> 3 then raise exception 'the repeated step was counted twice'; end if;
  -- While the run is off nothing comes back.
  select count(*) into n from public.habit_step_days('Europe/London');
  if n <> 0 then raise exception 'step days came back while the run was off'; end if;
  begin
    insert into public.habit_settings (user_id, daily_run_on, daily_goal) values ('a4900000-0000-0000-0000-000000000001', true, 9);
    raise exception 'a goal above the ceiling was accepted';
  exception when sqlstate 'AKH02' then null; end;
  insert into public.habit_settings (user_id, daily_run_on, daily_goal) values ('a4900000-0000-0000-0000-000000000001', true, 2);
  select count(*) into n from public.habit_step_days('Europe/London');
  if n <> 3 then raise exception 'expected three step days, got %', n; end if;
  if (select sum(step_count) from public.habit_step_days('Europe/London')) <> 3 then raise exception 'a repeated step was counted twice'; end if;
  -- An unknown time zone falls back quietly.
  select count(*) into n from public.habit_step_days('Mars/Olympus');
  if n <> 3 then raise exception 'a bad time zone broke the read'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. The block for tier 1 and 2 titles holds even with the run on: add a
--    standard title to reader 1 and its steps never appear.
-- ---------------------------------------------------------------------------
insert into public.enrolments (id, user_id, tenant_id, workbook_id, version_id) values
  ('a4900000-0000-0000-0000-0000000000e4', 'a4900000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   'a4900000-0000-0000-0000-0000000000c2', 'a4900000-0000-0000-0000-0000000000d2');
insert into public.progress_events (enrolment_id, kind, ref, at) values
  ('a4900000-0000-0000-0000-0000000000e4', 'step_done', 'm1', now() - interval '1 day'),
  ('a4900000-0000-0000-0000-0000000000e4', 'step_done', 'm2', now() - interval '1 day'),
  ('a4900000-0000-0000-0000-0000000000e4', 'step_done', 'm3', now());
select test_as('a4900000-0000-0000-0000-000000000001');
do $$ begin
  if (select sum(step_count) from public.habit_step_days('Europe/London')) <> 3 then
    raise exception 'steps on a mental health title reached the daily run';
  end if;
  if public.habit_none_tier_steps() <> 3 then raise exception 'mental health steps counted toward the offer'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. Settings are private to the reader and the high-water mark is not theirs to write
-- ---------------------------------------------------------------------------
select test_as('a4900000-0000-0000-0000-000000000003');
do $$ begin
  if exists (select 1 from public.habit_settings where user_id <> 'a4900000-0000-0000-0000-000000000003') then
    raise exception 'a reader saw someone else''s habit settings';
  end if;
  begin
    update public.habit_settings set companion_high_water = 500;
    raise exception 'a reader wrote the high-water mark';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.habit_settings (user_id) values ('a4900000-0000-0000-0000-000000000001');
    raise exception 'a reader wrote settings for someone else';
  exception when insufficient_privilege or unique_violation or check_violation then null;
           when others then if sqlstate <> '42501' then raise; end if; end;
  -- Nothing is exposed across readers: the functions take no reader id.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname in ('habit_step_days', 'habit_none_tier_steps', 'companion_state')
                and pg_get_function_arguments(p.oid) ~* 'uuid') then
    raise exception 'a habit function takes a reader id';
  end if;
end $$;
reset role;


-- Signed out: nothing at all.
set local role anon;
do $$ begin
  begin
    perform public.habit_none_tier_steps();
    raise exception 'a signed-out visitor called a habit function';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from public.habit_settings;
    raise exception 'a signed-out visitor read habit settings';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 5. The companion keeps what it has grown to, even when steps are later removed
-- ---------------------------------------------------------------------------
select test_as('a4900000-0000-0000-0000-000000000002');
do $$ declare s int; h int; begin
  select c.steps, c.high_water into s, h from public.companion_state() c;
  if s <> 5 or h <> 5 then raise exception 'expected 5 and 5, got % and %', s, h; end if;
end $$;
reset role;
delete from public.progress_events where enrolment_id = 'a4900000-0000-0000-0000-0000000000e2' and ref in ('s4', 's5');
select test_as('a4900000-0000-0000-0000-000000000002');
do $$ declare s int; h int; begin
  select c.steps, c.high_water into s, h from public.companion_state() c;
  if s <> 3 then raise exception 'expected the live count to be 3, got %', s; end if;
  if h <> 5 then raise exception 'the companion lost what it had grown to: %', h; end if;
end $$;
reset role;

-- Config the app reads is present.
do $$ begin
  if (select count(*) from public.app_config where key in ('habit_offer_after_steps', 'habit_pause_days', 'habit_max_goal', 'companion_stage_steps')) <> 4 then
    raise exception 'habit config is missing';
  end if;
end $$;

rollback;
