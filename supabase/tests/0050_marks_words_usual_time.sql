-- 0050 Milestone marks, answer word counts and the usual time. Marks are
-- earned from the reader's own progress, hold no title or answer, and cannot
-- be written or removed by the reader. Word counts are service only. The
-- usual time is the median finishing time, and reminder_targets uses it only
-- when the reader chose it. Each block must raise or return the expected
-- value; a failure aborts the script.
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('a5000000-0000-0000-0000-000000000001', 'reader50a@test'),
  ('a5000000-0000-0000-0000-000000000002', 'reader50b@test');

insert into public.organisations (id, code, kind, legal_name, display_name, slug, country, connect_status) values
  ('a5000000-0000-0000-0000-0000000000a1', 'PB-TST50', 'publisher', 'Org 50 Ltd', 'Org 50', 'org-50', 'GB', 'verified');
insert into public.books (id, org_id, slug, title, rights_status) values
  ('a5000000-0000-0000-0000-0000000000b1', 'a5000000-0000-0000-0000-0000000000a1', 'book-50', 'Book 50', 'public_domain');
insert into public.shelves (id, name, status) values ('shelf-50', 'Shelf 50', 'active');
insert into public.themes (id, name, shelf_id, clearance_status) values ('theme-50', 'Theme 50', 'shelf-50', 'cleared');
insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, theme_id, safety_tier, depth, status) values
  ('a5000000-0000-0000-0000-0000000000c1', 'AK-T50A0', 'a5000000-0000-0000-0000-0000000000b1', 'a5000000-0000-0000-0000-0000000000a1', 'wb-50-1', 'WB 50 1', 'Card', 'productivity', 'theme-50', 'none', 'full', 'live'),
  ('a5000000-0000-0000-0000-0000000000c2', 'AK-T50B0', 'a5000000-0000-0000-0000-0000000000b1', 'a5000000-0000-0000-0000-0000000000a1', 'wb-50-2', 'WB 50 2', 'Card', 'productivity', 'theme-50', 'none', 'full', 'live'),
  ('a5000000-0000-0000-0000-0000000000c3', 'AK-T50C0', 'a5000000-0000-0000-0000-0000000000b1', 'a5000000-0000-0000-0000-0000000000a1', 'wb-50-3', 'WB 50 3', 'Card', 'productivity', 'theme-50', 'none', 'full', 'live');
insert into public.workbook_versions (id, workbook_id, semver, content, content_hash) values
  ('a5000000-0000-0000-0000-0000000000d1', 'a5000000-0000-0000-0000-0000000000c1', '1.0.0', '{}'::jsonb, repeat('a', 64)),
  ('a5000000-0000-0000-0000-0000000000d2', 'a5000000-0000-0000-0000-0000000000c2', '1.0.0', '{}'::jsonb, repeat('b', 64)),
  ('a5000000-0000-0000-0000-0000000000d3', 'a5000000-0000-0000-0000-0000000000c3', '1.0.0', '{}'::jsonb, repeat('c', 64));

create or replace function pg_temp.as_service() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "service_role"}'::text, true);
  execute 'set local role service_role';
end $$;

-- ---------------------------------------------------------------------------
-- 1. Milestone marks. A reader with no progress earns nothing.
-- ---------------------------------------------------------------------------
insert into public.enrolments (id, user_id, tenant_id, workbook_id, version_id) values
  ('a5000000-0000-0000-0000-0000000000e1', 'a5000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   'a5000000-0000-0000-0000-0000000000c1', 'a5000000-0000-0000-0000-0000000000d1');
select test_as('a5000000-0000-0000-0000-000000000001');
do $$ begin
  if exists (select 1 from public.award_milestones()) then raise exception 'a mark was made with no progress'; end if;
end $$;
reset role;

insert into public.progress_events (enrolment_id, kind, ref, at) values
  ('a5000000-0000-0000-0000-0000000000e1', 'step_done', 's1', now());
select test_as('a5000000-0000-0000-0000-000000000001');
do $$ declare k text[]; begin
  select array_agg(kind order by kind) into k from public.award_milestones();
  if k is distinct from array['first_step'] then raise exception 'expected first_step only, got %', k; end if;
  -- A second call makes nothing new.
  if exists (select 1 from public.award_milestones()) then raise exception 'a mark was made twice'; end if;
end $$;
reset role;

insert into public.progress_events (enrolment_id, kind, ref, at) values
  ('a5000000-0000-0000-0000-0000000000e1', 'checkin_done', '1', now());
update public.enrolments set status = 'finished', finished_at = now() where id = 'a5000000-0000-0000-0000-0000000000e1';
select test_as('a5000000-0000-0000-0000-000000000001');
do $$ declare k text[]; begin
  select array_agg(kind order by kind) into k from public.award_milestones();
  if k is distinct from array['first_programme', 'first_week'] then raise exception 'expected week and programme, got %', k; end if;
end $$;
reset role;

-- Three finished programmes on one shelf make the first shelf.
insert into public.enrolments (id, user_id, tenant_id, workbook_id, version_id, status, finished_at) values
  ('a5000000-0000-0000-0000-0000000000e2', 'a5000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   'a5000000-0000-0000-0000-0000000000c2', 'a5000000-0000-0000-0000-0000000000d2', 'finished', now());
select test_as('a5000000-0000-0000-0000-000000000001');
do $$ begin
  if exists (select 1 from public.award_milestones()) then raise exception 'the shelf mark came with two programmes'; end if;
end $$;
reset role;
insert into public.enrolments (id, user_id, tenant_id, workbook_id, version_id, status, finished_at) values
  ('a5000000-0000-0000-0000-0000000000e3', 'a5000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   'a5000000-0000-0000-0000-0000000000c3', 'a5000000-0000-0000-0000-0000000000d3', 'finished', now());
select test_as('a5000000-0000-0000-0000-000000000001');
do $$ declare k text[]; begin
  select array_agg(kind) into k from public.award_milestones();
  if k is distinct from array['first_shelf'] then raise exception 'expected first_shelf, got %', k; end if;
  if (select count(*) from public.milestone_marks) <> 4 then raise exception 'expected four marks'; end if;
  -- The reader can mark one as seen, and nothing else about it.
  update public.milestone_marks set seen_at = now() where kind = 'first_step';
  begin
    update public.milestone_marks set earned_at = now() - interval '1 year';
    raise exception 'a reader changed when a mark was earned';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.milestone_marks (user_id, kind) values ('a5000000-0000-0000-0000-000000000001', 'first_step');
    raise exception 'a reader wrote a mark directly';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.milestone_marks;
    raise exception 'a reader deleted a mark';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Another reader sees none of it and earns their own.
select test_as('a5000000-0000-0000-0000-000000000002');
do $$ begin
  if exists (select 1 from public.milestone_marks) then raise exception 'a reader saw another reader''s marks'; end if;
  if exists (select 1 from public.award_milestones()) then raise exception 'marks were made for a reader with no progress'; end if;
  update public.milestone_marks set seen_at = now();
end $$;
reset role;
do $$ begin
  if (select count(*) from public.milestone_marks where seen_at is not null) <> 1 then
    raise exception 'another reader changed a mark they do not own';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Word counts are service only
-- ---------------------------------------------------------------------------
insert into public.answers (id, enrolment_id, field, sealed, key_id) values
  ('a5000000-0000-0000-0000-0000000000f1', 'a5000000-0000-0000-0000-0000000000e1', 'exercise:plan.what', 'v2.k1.AAAA', 'k1');
select pg_temp.as_service();
insert into public.answer_word_counts (answer_id, words, counted_for) values ('a5000000-0000-0000-0000-0000000000f1', 42, now());
update public.answer_word_counts set words = 43;
reset role;
select test_as('a5000000-0000-0000-0000-000000000001');
do $$ begin
  begin
    perform 1 from public.answer_word_counts;
    raise exception 'a reader read the word counts table';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.answer_word_counts (answer_id, words, counted_for) values ('a5000000-0000-0000-0000-0000000000f1', 1, now());
    raise exception 'a reader wrote a word count';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  begin
    insert into public.answer_word_counts (answer_id, words, counted_for) values ('a5000000-0000-0000-0000-0000000000f1', -1, now());
    raise exception 'a negative count was accepted';
  exception when check_violation or unique_violation then null; end;
end $$;

-- ---------------------------------------------------------------------------
-- 3. The usual time: the median finishing time, to the nearest quarter hour
-- ---------------------------------------------------------------------------
-- Enrolment e2 belongs to reader 1. Five steps finished near half past seven (UTC).
insert into public.progress_events (enrolment_id, kind, ref, at)
select 'a5000000-0000-0000-0000-0000000000e2', 'step_done', 'u' || v.n,
       ((date_trunc('day', now() at time zone 'UTC') - v.n * interval '1 day' + v.t::time) at time zone 'UTC')
  from (values (1, '07:20'), (2, '07:40'), (3, '08:05'), (4, '07:35'), (5, '07:25')) v(n, t);

select test_as('a5000000-0000-0000-0000-000000000001');
do $$ declare t time; begin
  t := public.my_usual_step_time('UTC');
  if t is distinct from time '07:30' then raise exception 'expected 07:30, got %', t; end if;
end $$;
reset role;

-- Too few steps: no usual time is guessed.
select test_as('a5000000-0000-0000-0000-000000000002');
do $$ begin
  if public.my_usual_step_time('UTC') is not null then raise exception 'a usual time was guessed with no steps'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. reminder_targets uses the usual time only when the reader chose it
-- ---------------------------------------------------------------------------
update public.enrolments set status = 'active', finished_at = null where id = 'a5000000-0000-0000-0000-0000000000e2';
insert into public.today_settings (enrolment_id, user_id, reminders_on, reminder_days, reminder_time, timezone)
values ('a5000000-0000-0000-0000-0000000000e2', 'a5000000-0000-0000-0000-000000000001', true, '{1,2,3}', '09:00', 'UTC');

select pg_temp.as_service();
do $$ begin
  if (select reminder_time from public.reminder_targets() where enrolment_id = 'a5000000-0000-0000-0000-0000000000e2') <> time '09:00' then
    raise exception 'the usual time was used without the reader choosing it';
  end if;
end $$;
reset role;

insert into public.habit_settings (user_id, usual_time_on) values ('a5000000-0000-0000-0000-000000000001', true)
on conflict (user_id) do update set usual_time_on = true;
select pg_temp.as_service();
do $$ begin
  if (select reminder_time from public.reminder_targets() where enrolment_id = 'a5000000-0000-0000-0000-0000000000e2') <> time '07:30' then
    raise exception 'the usual time was not used after the reader chose it';
  end if;
end $$;
reset role;

-- Without enough history the time the reader set stays.
delete from public.progress_events where enrolment_id = 'a5000000-0000-0000-0000-0000000000e2' and ref in ('u1', 'u2', 'u3');
select pg_temp.as_service();
do $$ begin
  if (select reminder_time from public.reminder_targets() where enrolment_id = 'a5000000-0000-0000-0000-0000000000e2') <> time '09:00' then
    raise exception 'with too little history the reader''s own time was not kept';
  end if;
end $$;
reset role;

-- A reader cannot call the targets job.
select test_as('a5000000-0000-0000-0000-000000000001');
do $$ begin
  begin
    perform * from public.reminder_targets();
    raise exception 'a reader read the reminder targets';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

rollback;
