-- 0040 Today: settings, reminder log, review marks and queue, saved tools,
-- reading places, the service-only job reads, the calendar link and the
-- cron log. Each block must raise or return the expected value; a failure
-- aborts the script. pg_cron, pg_net and Vault are not on a plain Postgres
-- test database, so the guarded scheduling block must have run without
-- error and call_cron_route must log "skipped".
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('a4000000-0000-0000-0000-000000000001', 'reader40a@test'),
  ('a4000000-0000-0000-0000-000000000002', 'reader40b@test'),
  ('a4000000-0000-0000-0000-000000000009', 'support40@test');
insert into public.platform_roles (user_id, role) values ('a4000000-0000-0000-0000-000000000009', 'support');

insert into public.organisations (id, code, kind, legal_name, display_name, slug, country, connect_status) values
  ('a4000000-0000-0000-0000-0000000000a1', 'PB-TST40', 'publisher', 'Org 40 Ltd', 'Org 40', 'org-40', 'GB', 'verified');
insert into public.books (id, org_id, slug, title, rights_status) values
  ('a4000000-0000-0000-0000-0000000000b1', 'a4000000-0000-0000-0000-0000000000a1', 'book-40', 'Book 40', 'public_domain');
insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, safety_tier, depth, status) values
  ('a4000000-0000-0000-0000-0000000000c1', 'AK-T40A0', 'a4000000-0000-0000-0000-0000000000b1', 'a4000000-0000-0000-0000-0000000000a1',
   'wb-40', 'Workbook 40', 'Card', 'productivity', 'none', 'full', 'live');
insert into public.workbook_versions (id, workbook_id, semver, content, content_hash) values
  ('a4000000-0000-0000-0000-0000000000d1', 'a4000000-0000-0000-0000-0000000000c1', '1.0.0', '{}'::jsonb, repeat('c', 64));
insert into public.enrolments (id, user_id, tenant_id, workbook_id, version_id, last_opened_at) values
  ('a4000000-0000-0000-0000-0000000000e1', 'a4000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   'a4000000-0000-0000-0000-0000000000c1', 'a4000000-0000-0000-0000-0000000000d1', '2026-09-01 10:00+00'),
  ('a4000000-0000-0000-0000-0000000000e2', 'a4000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a',
   'a4000000-0000-0000-0000-0000000000c1', 'a4000000-0000-0000-0000-0000000000d1', '2026-09-01 10:00+00');
insert into public.answers (id, enrolment_id, field, sealed, key_id) values
  ('a4000000-0000-0000-0000-0000000000f1', 'a4000000-0000-0000-0000-0000000000e1', 'exercise:plan.what', 'v2.k1.AAAA', 'k1'),
  ('a4000000-0000-0000-0000-0000000000f2', 'a4000000-0000-0000-0000-0000000000e2', 'exercise:plan.what', 'v2.k1.BBBB', 'k1');

create or replace function pg_temp.as_service() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "service_role"}'::text, true);
  execute 'set local role service_role';
end $$;

-- ---------------------------------------------------------------------------
-- 1. today_settings: own rows only; the stop stamp and link hash are not the reader's to write
-- ---------------------------------------------------------------------------
select test_as('a4000000-0000-0000-0000-000000000001');
insert into public.today_settings (enrolment_id, user_id, reminders_on, reminder_days, reminder_time, timezone, review_frequency)
values ('a4000000-0000-0000-0000-0000000000e1', 'a4000000-0000-0000-0000-000000000001', true, '{1,3,5}', '08:30', 'Europe/London', 'often');
-- An upsert from the client names every column it sends.
insert into public.today_settings (enrolment_id, user_id, reminders_on, reminder_days, reminder_time, timezone, review_frequency, pickup_on)
values ('a4000000-0000-0000-0000-0000000000e1', 'a4000000-0000-0000-0000-000000000001', true, '{1,3,5}', '08:30', 'Europe/London', 'often', true)
on conflict (enrolment_id) do update set enrolment_id = excluded.enrolment_id, user_id = excluded.user_id, reminders_on = excluded.reminders_on,
  reminder_days = excluded.reminder_days, reminder_time = excluded.reminder_time, timezone = excluded.timezone,
  review_frequency = excluded.review_frequency, pickup_on = excluded.pickup_on;
do $$ begin
  begin
    insert into public.today_settings (enrolment_id, user_id) values ('a4000000-0000-0000-0000-0000000000e2', 'a4000000-0000-0000-0000-000000000001');
    raise exception 'a reader set up Today for someone else''s programme';
  exception when insufficient_privilege or others then
    if sqlstate not in ('42501') then raise; end if;
  end;
  begin
    update public.today_settings set reminder_days = '{0,9}' where enrolment_id = 'a4000000-0000-0000-0000-0000000000e1';
    raise exception 'weekday 0 and 9 were accepted';
  exception when check_violation then null; end;
  begin
    update public.today_settings set timezone = 'Mars/Olympus' where enrolment_id = 'a4000000-0000-0000-0000-0000000000e1';
    raise exception 'an unknown time zone was accepted';
  exception when check_violation then null; end;
  begin
    update public.today_settings set review_frequency = 'daily' where enrolment_id = 'a4000000-0000-0000-0000-0000000000e1';
    raise exception 'an unknown review frequency was accepted';
  exception when check_violation then null; end;
  begin
    update public.today_settings set reminders_stopped_at = now() where enrolment_id = 'a4000000-0000-0000-0000-0000000000e1';
    raise exception 'a reader wrote the stop stamp';
  exception when insufficient_privilege then null; end;
  begin
    update public.today_settings set calendar_token_hash = repeat('a', 64) where enrolment_id = 'a4000000-0000-0000-0000-0000000000e1';
    raise exception 'a reader wrote a calendar hash directly';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select test_as('a4000000-0000-0000-0000-000000000002');
do $$ begin
  if (select count(*) from public.today_settings) <> 0 then raise exception 'reader B can see reader A''s settings'; end if;
  update public.today_settings set reminders_on = false where enrolment_id = 'a4000000-0000-0000-0000-0000000000e1';
  if found then raise exception 'reader B changed reader A''s settings'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 2. The stop rule's data: reminder_targets counts sends since last activity
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
insert into public.reminder_log (user_id, enrolment_id, kind, ref, local_date, sent_at) values
  ('a4000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-0000000000e1', 'step', 'ex_a', '2026-09-02', '2026-09-02 08:30+00'),
  ('a4000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-0000000000e1', 'step', 'ex_a', '2026-09-04', '2026-09-04 08:30+00'),
  ('a4000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-0000000000e1', 'step', 'ex_a', '2026-09-06', '2026-09-06 08:30+00');
do $$ begin
  begin
    insert into public.reminder_log (user_id, enrolment_id, kind, ref, local_date)
    values ('a4000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-0000000000e1', 'step', 'ex_a', '2026-09-06');
    raise exception 'the same step was logged twice for one day';
  exception when unique_violation then null; end;
  if (select sent_since_activity from public.reminder_targets() where enrolment_id = 'a4000000-0000-0000-0000-0000000000e1') <> 3 then
    raise exception 'three reminders since the last open should count 3';
  end if;
  if (select email from public.reminder_targets() where enrolment_id = 'a4000000-0000-0000-0000-0000000000e1') <> 'reader40a@test' then
    raise exception 'the target carries the address for the mailer';
  end if;
end $$;
reset role;

-- Reader A finishes a step after the second reminder: only later sends count.
insert into public.progress_events (enrolment_id, kind, ref, at) values
  ('a4000000-0000-0000-0000-0000000000e1', 'step_done', 'ex_a', '2026-09-05 12:00+00');
select pg_temp.as_service();
do $$ begin
  if (select sent_since_activity from public.reminder_targets() where enrolment_id = 'a4000000-0000-0000-0000-0000000000e1') <> 1 then
    raise exception 'only the reminder after the step should count';
  end if;
  if not public.stop_reminders('a4000000-0000-0000-0000-0000000000e1') then raise exception 'stop_reminders did nothing'; end if;
  if (select reminders_on from public.today_settings where enrolment_id = 'a4000000-0000-0000-0000-0000000000e1') then raise exception 'reminders still on'; end if;
  if (select reminders_stopped_at from public.today_settings where enrolment_id = 'a4000000-0000-0000-0000-0000000000e1') is null then raise exception 'no stop stamp'; end if;
  if exists (select 1 from public.reminder_targets() where enrolment_id = 'a4000000-0000-0000-0000-0000000000e1') then raise exception 'a stopped programme is still a target'; end if;
end $$;
reset role;

-- Turning reminders back on clears the stop stamp.
select test_as('a4000000-0000-0000-0000-000000000001');
update public.today_settings set reminders_on = true where enrolment_id = 'a4000000-0000-0000-0000-0000000000e1';
do $$ begin
  if (select reminders_stopped_at from public.today_settings where enrolment_id = 'a4000000-0000-0000-0000-0000000000e1') is not null then
    raise exception 'turning reminders on did not clear the stop stamp';
  end if;
  begin
    perform * from public.reminder_log;
    raise exception 'a reader read the reminder log';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.reminder_targets();
    raise exception 'a reader called reminder_targets';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- A pending deletion takes the reader off the list.
insert into public.account_deletion_requests (user_id, requested_at, cancel_before) values
  ('a4000000-0000-0000-0000-000000000001', now() - interval '1 day', now() + interval '6 days');
select pg_temp.as_service();
do $$ begin
  if exists (select 1 from public.reminder_targets()) then raise exception 'a reader whose deletion is pending is still mailed'; end if;
  if exists (select 1 from public.review_targets() where user_id = 'a4000000-0000-0000-0000-000000000001') then
    raise exception 'a reader whose deletion is pending is still in the review list';
  end if;
end $$;
reset role;
delete from public.account_deletion_requests where user_id = 'a4000000-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------------
-- 3. review marks and queue
-- ---------------------------------------------------------------------------
select test_as('a4000000-0000-0000-0000-000000000001');
insert into public.review_marks (answer_id, enrolment_id, state)
values ('a4000000-0000-0000-0000-0000000000f1', 'a4000000-0000-0000-0000-0000000000e1', 'set_aside');
-- An upsert from the client names every column.
insert into public.review_marks (answer_id, enrolment_id, state, updated_at)
values ('a4000000-0000-0000-0000-0000000000f1', 'a4000000-0000-0000-0000-0000000000e1', 'kept', now())
on conflict (answer_id) do update set enrolment_id = excluded.enrolment_id, state = excluded.state, updated_at = excluded.updated_at;
do $$ begin
  if (select state from public.review_marks where answer_id = 'a4000000-0000-0000-0000-0000000000f1') <> 'kept' then raise exception 'mark did not change'; end if;
  begin
    delete from public.review_marks where answer_id = 'a4000000-0000-0000-0000-0000000000f1';
    raise exception 'a mark was deleted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.review_marks (answer_id, enrolment_id, state)
    values ('a4000000-0000-0000-0000-0000000000f2', 'a4000000-0000-0000-0000-0000000000e1', 'kept');
    raise exception 'a reader marked another reader''s answer';
  exception when insufficient_privilege or others then
    if sqlstate not in ('42501') then raise; end if;
  end;
  begin
    insert into public.review_queue (enrolment_id, for_day, answer_id)
    values ('a4000000-0000-0000-0000-0000000000e1', current_date, 'a4000000-0000-0000-0000-0000000000f1');
    raise exception 'a reader wrote the review queue';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select pg_temp.as_service();
insert into public.review_queue (enrolment_id, for_day, answer_id)
values ('a4000000-0000-0000-0000-0000000000e1', '2026-10-10', 'a4000000-0000-0000-0000-0000000000f1');
reset role;
select test_as('a4000000-0000-0000-0000-000000000001');
do $$ begin
  if (select count(*) from public.review_queue) <> 1 then raise exception 'the reader should see their queue row'; end if;
end $$;
reset role;
select test_as('a4000000-0000-0000-0000-000000000002');
do $$ begin
  if (select count(*) from public.review_queue) <> 0 or (select count(*) from public.review_marks) <> 0 then raise exception 'reader B sees reader A''s queue or marks'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4 and 5. Saved tools and reading places
-- ---------------------------------------------------------------------------
select test_as('a4000000-0000-0000-0000-000000000001');
insert into public.toolkit_saves (enrolment_id, tool_id) values ('a4000000-0000-0000-0000-0000000000e1', 'five_breaths');
insert into public.reading_places (enrolment_id, unit, exercise_id, page, field_id, mode, paused)
values ('a4000000-0000-0000-0000-0000000000e1', 3, 'plan', 'yours', 'what', 'full', true);
update public.reading_places set paused = false where enrolment_id = 'a4000000-0000-0000-0000-0000000000e1';
do $$ begin
  begin
    insert into public.toolkit_saves (enrolment_id, tool_id) values ('a4000000-0000-0000-0000-0000000000e1', 'Has Spaces');
    raise exception 'a tool id with spaces was accepted';
  exception when check_violation then null; end;
  begin
    insert into public.reading_places (enrolment_id, unit, page) values ('a4000000-0000-0000-0000-0000000000e2', 1, 'yours');
    raise exception 'a place was written for another reader';
  exception when insufficient_privilege or others then
    if sqlstate not in ('42501') then raise; end if;
  end;
  begin
    update public.reading_places set page = 'free text answer here' where enrolment_id = 'a4000000-0000-0000-0000-0000000000e1';
    raise exception 'a free-text page was accepted';
  exception when check_violation then null; end;
end $$;
delete from public.toolkit_saves where tool_id = 'five_breaths';
reset role;
select test_as('a4000000-0000-0000-0000-000000000002');
do $$ begin
  if (select count(*) from public.reading_places) <> 0 or (select count(*) from public.toolkit_saves) <> 0 then raise exception 'reader B sees reader A''s places or tools'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 6. The calendar link: made once, only the hash kept, rotation stops the old one
-- ---------------------------------------------------------------------------
create temp table tok (n int, t text);
grant all on tok to public;
select test_as('a4000000-0000-0000-0000-000000000001');
insert into tok select 1, public.new_calendar_token('a4000000-0000-0000-0000-0000000000e1');
insert into tok select 2, public.new_calendar_token('a4000000-0000-0000-0000-0000000000e1');
do $$ begin
  if (select length(t) from tok where n = 1) < 60 then raise exception 'the token is too short'; end if;
  if (select t from tok where n = 1) = (select t from tok where n = 2) then raise exception 'a new link repeated the old token'; end if;
  begin
    perform public.new_calendar_token('a4000000-0000-0000-0000-0000000000e2');
    raise exception 'a reader made a link for another reader''s programme';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.calendar_feed_target(repeat('a', 64));
    raise exception 'a reader called calendar_feed_target';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select pg_temp.as_service();
do $$
declare h1 text; h2 text;
begin
  h1 := encode(sha256(convert_to((select t from tok where n = 1), 'UTF8')), 'hex');
  h2 := encode(sha256(convert_to((select t from tok where n = 2), 'UTF8')), 'hex');
  if exists (select 1 from public.calendar_feed_target(h1)) then raise exception 'the replaced link still works'; end if;
  if not exists (select 1 from public.calendar_feed_target(h2)) then raise exception 'the new link does not work'; end if;
  if exists (select 1 from public.today_settings where calendar_token_hash in ((select t from tok where n = 2))) then
    raise exception 'the token itself was stored';
  end if;
end $$;
reset role;
select test_as('a4000000-0000-0000-0000-000000000001');
select public.clear_calendar_token('a4000000-0000-0000-0000-0000000000e1');
reset role;
select pg_temp.as_service();
do $$ begin
  if exists (select 1 from public.calendar_feed_target(encode(sha256(convert_to((select t from tok where n = 2), 'UTF8')), 'hex'))) then
    raise exception 'a cleared link still works';
  end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 7. Cron: the log, the skip paths, and who may read it
-- ---------------------------------------------------------------------------
do $$
declare run bigint;
begin
  -- No base URL yet: skipped, and logged.
  run := app.call_cron_route('today-reminders', '/api/today/reminders');
  if (select status from public.cron_runs where id = run) <> 'skipped' then raise exception 'an unconfigured job should be skipped'; end if;
  -- With a base URL but no Vault or pg_net on this database: still skipped, still logged, no error.
  update public.app_config set value = to_jsonb('https://akana.example'::text) where key = 'cron_base_url';
  run := app.call_cron_route('review-candidates', '/api/today/review-candidates');
  if (select status from public.cron_runs where id = run) not in ('skipped', 'sent') then raise exception 'unexpected status'; end if;
  if (select count(*) from public.cron_runs) <> 2 then raise exception 'each call should leave one log row'; end if;
  if exists (select 1 from public.cron_runs where detail ilike '%bearer%' or detail ilike '%secret%value%') then raise exception 'the log carries a secret'; end if;
end $$;

select test_as('a4000000-0000-0000-0000-000000000001');
do $$ begin
  if (select count(*) from public.cron_runs) <> 0 then raise exception 'a reader can read the cron log'; end if;
  begin
    perform app.call_cron_route('x', '/y');
    raise exception 'a reader called call_cron_route';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select test_as('a4000000-0000-0000-0000-000000000009', array['support']);
do $$ begin
  if (select count(*) from public.cron_runs) <> 2 then raise exception 'staff should read the cron log'; end if;
end $$;
reset role;

-- The default config rows the app reads.
do $$ begin
  if (select value #>> '{}' from public.app_config where key = 'reminder_stop_after') <> '4' then raise exception 'stop after should default to 4'; end if;
  if (select value #>> '{}' from public.app_config where key = 'pickup_gap_days') <> '14' then raise exception 'gap should default to 14'; end if;
  if (select value #>> '{}' from public.app_config where key = 'break_after_minutes') <> '45' then raise exception 'break should default to 45'; end if;
end $$;

rollback;
