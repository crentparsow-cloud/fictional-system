-- Enrolments, sealed answers and progress events (T3, F-134, F-018, F-020,
-- F-131). Each block must raise or return the expected count; a failure
-- aborts the script and the CI step.
\set ON_ERROR_STOP on

begin;

-- Two readers with no memberships, and an organisation that owns the titles.
insert into auth.users (id, email) values
  ('55555555-5555-5555-5555-555555555555', 'reader-a@test'),
  ('66666666-6666-6666-6666-666666666666', 'reader-b@test'),
  ('77777777-7777-7777-7777-777777777777', 'staff@test');

insert into public.organisations (id, kind, legal_name, display_name, slug, country) values
  ('cccccccc-0000-0000-0000-000000000001', 'publisher', 'Org C Ltd', 'Org C', 'org-c', 'GB');

insert into public.authors (id, code, org_id, slug, display_name, country) values
  ('cccccccc-0000-0000-0000-0000000000c1', 'AU-TESTC', 'cccccccc-0000-0000-0000-000000000001', 'author-c', 'Author C', 'GB');
insert into public.books (id, org_id, slug, title) values
  ('cccccccc-0000-0000-0000-0000000000c2', 'cccccccc-0000-0000-0000-000000000001', 'book-c', 'Book C');
insert into public.book_contributors (book_id, author_id, role) values
  ('cccccccc-0000-0000-0000-0000000000c2', 'cccccccc-0000-0000-0000-0000000000c1', 'author');

-- One live workbook with two versions (an old one and the current one) and
-- one draft workbook with a version of its own.
insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, depth, status) values
  ('cccccccc-0000-0000-0000-0000000000c4', 'AK-TESTC', 'cccccccc-0000-0000-0000-0000000000c2', 'cccccccc-0000-0000-0000-000000000001',
   'workbook-live', 'Live Workbook', 'Card', 'productivity', 'full', 'live'),
  ('cccccccc-0000-0000-0000-0000000000c5', 'AK-TESTD', 'cccccccc-0000-0000-0000-0000000000c2', 'cccccccc-0000-0000-0000-000000000001',
   'workbook-draft', 'Draft Workbook', 'Card', 'productivity', 'full', 'draft');

insert into public.workbook_versions (id, workbook_id, semver, content, content_hash, published_at) values
  ('cccccccc-0000-0000-0000-0000000000c6', 'cccccccc-0000-0000-0000-0000000000c4', '1.0.0', '{"schema_version": "3.0"}'::jsonb, repeat('a', 64), now() - interval '1 day'),
  ('cccccccc-0000-0000-0000-0000000000c7', 'cccccccc-0000-0000-0000-0000000000c4', '1.1.0', '{"schema_version": "3.0"}'::jsonb, repeat('b', 64), now()),
  ('cccccccc-0000-0000-0000-0000000000c8', 'cccccccc-0000-0000-0000-0000000000c5', '0.1.0', '{"schema_version": "3.0"}'::jsonb, repeat('c', 64), null);
update public.workbooks set current_version_id = 'cccccccc-0000-0000-0000-0000000000c7' where id = 'cccccccc-0000-0000-0000-0000000000c4';
update public.workbooks set current_version_id = 'cccccccc-0000-0000-0000-0000000000c8' where id = 'cccccccc-0000-0000-0000-0000000000c5';

-- Reader A enrols in the live workbook on the marketplace tenant, pinned to
-- the current version. The draft title and the old version are refused.
savepoint s1;
select test_as('55555555-5555-5555-5555-555555555555');
do $$ declare n int; begin
  insert into public.enrolments (id, user_id, tenant_id, workbook_id, version_id) values
    ('eeeeeeee-0000-0000-0000-0000000000e1', '55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-00000000000a',
     'cccccccc-0000-0000-0000-0000000000c4', 'cccccccc-0000-0000-0000-0000000000c7');
  select count(*) into n from public.enrolments;
  if n <> 1 then raise exception 'reader A should see their 1 enrolment, saw %', n; end if;
  begin
    insert into public.enrolments (user_id, tenant_id, workbook_id, version_id) values
      ('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-00000000000a',
       'cccccccc-0000-0000-0000-0000000000c5', 'cccccccc-0000-0000-0000-0000000000c8');
    raise exception 'reader A enrolled in a draft workbook';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.enrolments (user_id, tenant_id, workbook_id, version_id) values
      ('66666666-6666-6666-6666-666666666666', '00000000-0000-0000-0000-00000000000a',
       'cccccccc-0000-0000-0000-0000000000c4', 'cccccccc-0000-0000-0000-0000000000c7');
    raise exception 'reader A enrolled someone else';
  exception when insufficient_privilege then null; end;
  -- a second enrolment on the same tenant and workbook is one row, so the
  -- unique constraint fires before any policy question arises
  begin
    insert into public.enrolments (user_id, tenant_id, workbook_id, version_id) values
      ('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-00000000000a',
       'cccccccc-0000-0000-0000-0000000000c4', 'cccccccc-0000-0000-0000-0000000000c7');
    raise exception 'reader A enrolled twice';
  exception when unique_violation then null; end;
  -- status and last_opened_at move; the pins do not
  update public.enrolments set last_opened_at = now(), status = 'paused' where id = 'eeeeeeee-0000-0000-0000-0000000000e1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'reader A could not update their enrolment'; end if;
  begin
    update public.enrolments set version_id = 'cccccccc-0000-0000-0000-0000000000c6' where id = 'eeeeeeee-0000-0000-0000-0000000000e1';
    raise exception 'reader A moved their enrolment to another version';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.enrolments where id = 'eeeeeeee-0000-0000-0000-0000000000e1';
    raise exception 'reader A deleted an enrolment';
  exception when insufficient_privilege then null; end;
end $$;

-- The wrong version is refused on insert (a fresh row, so no unique clash).
select test_as('66666666-6666-6666-6666-666666666666');
do $$ begin
  begin
    insert into public.enrolments (user_id, tenant_id, workbook_id, version_id) values
      ('66666666-6666-6666-6666-666666666666', '00000000-0000-0000-0000-00000000000a',
       'cccccccc-0000-0000-0000-0000000000c4', 'cccccccc-0000-0000-0000-0000000000c6');
    raise exception 'reader B enrolled on the old version';
  exception when insufficient_privilege then null; end;
end $$;

-- Reader B cannot see A's enrolment, and cannot touch it.
do $$ declare n int; begin
  select count(*) into n from public.enrolments;
  if n <> 0 then raise exception 'reader B saw another reader''s enrolment, %', n; end if;
  update public.enrolments set status = 'finished' where id = 'eeeeeeee-0000-0000-0000-0000000000e1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'reader B updated another reader''s enrolment'; end if;
end $$;

-- Staff read enrolments (support), but have no special write.
select test_as('77777777-7777-7777-7777-777777777777', array['support']);
do $$ declare n int; begin
  select count(*) into n from public.enrolments;
  if n <> 1 then raise exception 'staff should see 1 enrolment, saw %', n; end if;
  update public.enrolments set status = 'finished' where id = 'eeeeeeee-0000-0000-0000-0000000000e1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'staff updated a reader''s enrolment'; end if;
end $$;

-- Answers: no client write path at all, for the owner or for anyone else.
select test_as('55555555-5555-5555-5555-555555555555');
do $$ begin
  begin
    insert into public.answers (enrolment_id, field, sealed, key_id)
    values ('eeeeeeee-0000-0000-0000-0000000000e1', 'exercise:ex_one.f_one', 'v2.k1.AAAA', 'k1');
    raise exception 'reader A inserted an answer from the client';
  exception when insufficient_privilege then null; end;
  begin
    update public.answers set sealed = 'v2.k1.BBBB' where enrolment_id = 'eeeeeeee-0000-0000-0000-0000000000e1';
    raise exception 'reader A updated an answer from the client';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.answers where enrolment_id = 'eeeeeeee-0000-0000-0000-0000000000e1';
    raise exception 'reader A deleted an answer from the client';
  exception when insufficient_privilege then null; end;
end $$;

-- The service role writes a sealed answer, and overwrites it (last write wins).
reset role;
set local role service_role;
insert into public.answers (enrolment_id, field, sealed, key_id)
values ('eeeeeeee-0000-0000-0000-0000000000e1', 'exercise:ex_one.f_one', 'v2.k1.AAAA', 'k1');
insert into public.answers (enrolment_id, field, sealed, key_id)
values ('eeeeeeee-0000-0000-0000-0000000000e1', 'exercise:ex_one.f_one', 'v2.k1.CCCC', 'k1')
on conflict (enrolment_id, field) do update set sealed = excluded.sealed, key_id = excluded.key_id, updated_at = now();
insert into public.answers (enrolment_id, field, sealed, key_id)
values ('eeeeeeee-0000-0000-0000-0000000000e1', 'checkin:1.mood', 'v2.k1.DDDD', 'k1');
reset role;

-- A plaintext-looking value is refused even for the table owner.
do $$ begin
  begin
    insert into public.answers (enrolment_id, field, sealed, key_id)
    values ('eeeeeeee-0000-0000-0000-0000000000e1', 'exercise:ex_two.f_two', 'hello', 'k1');
    raise exception 'an unsealed value was stored';
  exception when check_violation then null; end;
end $$;

-- Reader A reads their ciphertext; reader B sees nothing.
select test_as('55555555-5555-5555-5555-555555555555');
do $$ declare n int; s text; begin
  select count(*) into n from public.answers;
  if n <> 2 then raise exception 'reader A should see 2 answers, saw %', n; end if;
  select sealed into s from public.answers where field = 'exercise:ex_one.f_one';
  if s <> 'v2.k1.CCCC' then raise exception 'last write did not win, saw %', s; end if;
end $$;
select test_as('66666666-6666-6666-6666-666666666666');
do $$ declare n int; begin
  select count(*) into n from public.answers;
  if n <> 0 then raise exception 'reader B saw another reader''s answers, %', n; end if;
  if (select app.enrolment_owner('eeeeeeee-0000-0000-0000-0000000000e1')) then
    raise exception 'enrolment_owner said yes for the wrong reader'; end if;
end $$;

-- Progress events: the owner inserts and reads; update and delete have no
-- grant; another reader can neither insert against the enrolment nor read.
select test_as('55555555-5555-5555-5555-555555555555');
do $$ declare n int; begin
  insert into public.progress_events (enrolment_id, kind, ref) values
    ('eeeeeeee-0000-0000-0000-0000000000e1', 'unit_opened', '1'),
    ('eeeeeeee-0000-0000-0000-0000000000e1', 'step_done', 'ex_one');
  select count(*) into n from public.progress_events;
  if n <> 2 then raise exception 'reader A should see 2 events, saw %', n; end if;
  begin
    update public.progress_events set kind = 'finished' where enrolment_id = 'eeeeeeee-0000-0000-0000-0000000000e1';
    raise exception 'reader A updated an event';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.progress_events where enrolment_id = 'eeeeeeee-0000-0000-0000-0000000000e1';
    raise exception 'reader A deleted an event';
  exception when insufficient_privilege then null; end;
  -- free text is not an id
  begin
    insert into public.progress_events (enrolment_id, kind, ref) values
      ('eeeeeeee-0000-0000-0000-0000000000e1', 'step_done', 'I felt low today');
    raise exception 'free text was stored as a ref';
  exception when check_violation then null; end;
end $$;
select test_as('66666666-6666-6666-6666-666666666666');
do $$ declare n int; begin
  select count(*) into n from public.progress_events;
  if n <> 0 then raise exception 'reader B saw another reader''s events, %', n; end if;
  begin
    insert into public.progress_events (enrolment_id, kind, ref) values
      ('eeeeeeee-0000-0000-0000-0000000000e1', 'unit_opened', '2');
    raise exception 'reader B wrote an event against another reader''s enrolment';
  exception when insufficient_privilege then null; end;
end $$;

-- Anonymous visitors have nothing here.
reset role;
select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
set local role anon;
do $$ begin
  begin
    perform count(*) from public.enrolments;
    raise exception 'anon read enrolments';
  exception when insufficient_privilege then null; end;
  begin
    perform count(*) from public.answers;
    raise exception 'anon read answers';
  exception when insufficient_privilege then null; end;
end $$;
rollback to savepoint s1;

-- No streak or missed-day logic exists anywhere in the schema (F-018).
savepoint s2;
reset role;
do $$ declare n int; begin
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname in ('app', 'public') and (p.proname ~* 'streak' or p.proname ~* 'missed');
  if n <> 0 then raise exception 'a streak or missed-day function exists'; end if;
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and (column_name ~* 'streak' or column_name ~* 'missed');
  if n <> 0 then raise exception 'a streak or missed-day column exists'; end if;
end $$;
rollback to savepoint s2;

rollback;
\echo PASS 0003_answers
