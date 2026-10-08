-- Reader polish: the higher-tier "I have read this" kept server side (F-022)
-- and read only while an account deletion is pending (F-025). Each block
-- must raise or return the expected result; a failure aborts the script.
\set ON_ERROR_STOP on

begin;

-- Readers A and B.
insert into auth.users (id, email) values
  ('a0260000-0000-0000-0000-000000000001', 'reader26a@test'),
  ('a0260000-0000-0000-0000-000000000002', 'reader26b@test');

insert into public.organisations (id, kind, legal_name, display_name, slug, country) values
  ('a0260000-0000-0000-0000-0000000000f1', 'publisher', 'Pub 26 Ltd', 'Pub 26', 'pub-26', 'GB');
insert into public.books (id, org_id, slug, title) values
  ('a0260000-0000-0000-0000-0000000000b1', 'a0260000-0000-0000-0000-0000000000f1', 'book-26', 'Book 26');
-- c1 higher tier, c2 tier none.
insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, depth, status, safety_tier) values
  ('a0260000-0000-0000-0000-0000000000c1', 'AK-RPX01', 'a0260000-0000-0000-0000-0000000000b1', 'a0260000-0000-0000-0000-0000000000f1',
   'wb26-higher', 'Wb Higher', 'Card', 'wellbeing', 'full', 'live', 'higher'),
  ('a0260000-0000-0000-0000-0000000000c2', 'AK-RPX02', 'a0260000-0000-0000-0000-0000000000b1', 'a0260000-0000-0000-0000-0000000000f1',
   'wb26-none', 'Wb None', 'Card', 'productivity', 'full', 'live', 'none');
insert into public.workbook_versions (id, workbook_id, semver, content, content_hash, published_at) values
  ('a0260000-0000-0000-0000-0000000000d1', 'a0260000-0000-0000-0000-0000000000c1', '1.0.0', '{"schema_version": "3.0"}'::jsonb, repeat('1', 64), now()),
  ('a0260000-0000-0000-0000-0000000000d2', 'a0260000-0000-0000-0000-0000000000c1', '1.1.0', '{"schema_version": "3.0"}'::jsonb, repeat('2', 64), now()),
  ('a0260000-0000-0000-0000-0000000000d3', 'a0260000-0000-0000-0000-0000000000c2', '1.0.0', '{"schema_version": "3.0"}'::jsonb, repeat('3', 64), now());

-- A has the higher-tier and the tier-none workbook; B the higher-tier one.
insert into public.enrolments (id, user_id, tenant_id, workbook_id, version_id) values
  ('a0260000-0000-0000-0000-0000000000e1', 'a0260000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   'a0260000-0000-0000-0000-0000000000c1', 'a0260000-0000-0000-0000-0000000000d1'),
  ('a0260000-0000-0000-0000-0000000000e2', 'a0260000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   'a0260000-0000-0000-0000-0000000000c2', 'a0260000-0000-0000-0000-0000000000d3'),
  ('a0260000-0000-0000-0000-0000000000e3', 'a0260000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a',
   'a0260000-0000-0000-0000-0000000000c1', 'a0260000-0000-0000-0000-0000000000d1');

-- ---------------------------------------------------------------------------
-- 1. Higher-tier acknowledgement
-- ---------------------------------------------------------------------------
-- Anon can do nothing.
set local role anon;
do $$ begin
  begin
    perform public.acknowledge_higher_tier('a0260000-0000-0000-0000-0000000000e1');
    raise exception 'anon acknowledged';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.enrolment_acknowledgements;
    raise exception 'anon read acknowledgements';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select test_as('a0260000-0000-0000-0000-000000000001');
do $$ declare t1 timestamptz; t2 timestamptz; n int; begin
  -- Own higher-tier enrolment: recorded once, a second press keeps the first time.
  t1 := public.acknowledge_higher_tier('a0260000-0000-0000-0000-0000000000e1');
  if t1 is null then raise exception 'no time returned'; end if;
  t2 := public.acknowledge_higher_tier('a0260000-0000-0000-0000-0000000000e1');
  if t2 <> t1 then raise exception 'second press changed the time'; end if;
  select count(*) into n from public.enrolment_acknowledgements;
  if n <> 1 then raise exception 'A should see 1 acknowledgement, saw %', n; end if;
  select count(*) into n from public.enrolment_acknowledgements
   where enrolment_id = 'a0260000-0000-0000-0000-0000000000e1' and version_id = 'a0260000-0000-0000-0000-0000000000d1';
  if n <> 1 then raise exception 'acknowledgement not on the pinned version'; end if;

  -- A tier-none workbook has nothing to acknowledge.
  begin
    perform public.acknowledge_higher_tier('a0260000-0000-0000-0000-0000000000e2');
    raise exception 'acknowledged a tier none workbook';
  exception when sqlstate 'AKA03' then null;
  end;

  -- Someone else's enrolment is refused.
  begin
    perform public.acknowledge_higher_tier('a0260000-0000-0000-0000-0000000000e3');
    raise exception 'acknowledged another reader''s enrolment';
  exception when sqlstate 'AKA01' then null;
  end;

  -- No direct writes.
  begin
    insert into public.enrolment_acknowledgements (enrolment_id, version_id, user_id)
    values ('a0260000-0000-0000-0000-0000000000e3', 'a0260000-0000-0000-0000-0000000000d1', 'a0260000-0000-0000-0000-000000000001');
    raise exception 'client inserted an acknowledgement';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.enrolment_acknowledgements;
    raise exception 'client deleted an acknowledgement';
  exception when insufficient_privilege then null;
  end;
  -- The owner id column is not readable.
  begin
    perform user_id from public.enrolment_acknowledgements;
    raise exception 'client read user_id';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- B sees none of A's rows.
select test_as('a0260000-0000-0000-0000-000000000002');
do $$ declare n int; begin
  select count(*) into n from public.enrolment_acknowledgements;
  if n <> 0 then raise exception 'B saw % acknowledgements', n; end if;
end $$;
reset role;

-- A new version asks again: re-pin A and the old row no longer matches.
update public.enrolments set version_id = 'a0260000-0000-0000-0000-0000000000d2' where id = 'a0260000-0000-0000-0000-0000000000e1';
select test_as('a0260000-0000-0000-0000-000000000001');
do $$ declare n int; begin
  select count(*) into n from public.enrolment_acknowledgements
   where enrolment_id = 'a0260000-0000-0000-0000-0000000000e1' and version_id = 'a0260000-0000-0000-0000-0000000000d2';
  if n <> 0 then raise exception 'new version already acknowledged'; end if;
  perform public.acknowledge_higher_tier('a0260000-0000-0000-0000-0000000000e1');
  select count(*) into n from public.enrolment_acknowledgements where enrolment_id = 'a0260000-0000-0000-0000-0000000000e1';
  if n <> 2 then raise exception 'expected one row per version, saw %', n; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 2. Read only while a deletion is pending
-- ---------------------------------------------------------------------------
select test_as('a0260000-0000-0000-0000-000000000001');
do $$ begin
  if public.my_account_read_only() then raise exception 'read only before any request'; end if;
  insert into public.progress_events (enrolment_id, kind, ref) values ('a0260000-0000-0000-0000-0000000000e2', 'unit_opened', '1');
  perform public.request_account_deletion();
  if not public.my_account_read_only() then raise exception 'not read only after the request'; end if;
  begin
    insert into public.progress_events (enrolment_id, kind, ref) values ('a0260000-0000-0000-0000-0000000000e2', 'unit_opened', '2');
    raise exception 'progress written while deletion pending';
  exception when sqlstate 'AKR01' then null;
  end;
  -- The acknowledgement is a safety record, not the reader's work: still allowed.
  perform public.acknowledge_higher_tier('a0260000-0000-0000-0000-0000000000e1');
  -- Clients cannot ask about anyone else.
  begin
    perform app.account_read_only('a0260000-0000-0000-0000-000000000002');
    raise exception 'client called app.account_read_only';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- B is not affected by A's request.
select test_as('a0260000-0000-0000-0000-000000000002');
do $$ begin
  if public.my_account_read_only() then raise exception 'B is read only'; end if;
  insert into public.progress_events (enrolment_id, kind, ref) values ('a0260000-0000-0000-0000-0000000000e3', 'unit_opened', '1');
end $$;
reset role;

-- The server (no signed-in user) is not blocked, so jobs still run.
insert into public.progress_events (enrolment_id, kind, ref) values ('a0260000-0000-0000-0000-0000000000e2', 'unit_opened', '3');

-- Cancelling lifts it.
select test_as('a0260000-0000-0000-0000-000000000001');
do $$ begin
  perform public.cancel_account_deletion();
  if public.my_account_read_only() then raise exception 'still read only after cancelling'; end if;
  insert into public.progress_events (enrolment_id, kind, ref) values ('a0260000-0000-0000-0000-0000000000e2', 'unit_opened', '2');
end $$;
reset role;

-- Deleting the enrolment takes its acknowledgements with it.
delete from public.enrolments where id = 'a0260000-0000-0000-0000-0000000000e1';
do $$ declare n int; begin
  select count(*) into n from public.enrolment_acknowledgements where enrolment_id = 'a0260000-0000-0000-0000-0000000000e1';
  if n <> 0 then raise exception 'acknowledgements outlived the enrolment'; end if;
end $$;

rollback;
\echo PASS 0026_reader_polish
