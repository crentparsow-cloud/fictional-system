-- Library (0056): title requests are rate limited and staff-read only, author
-- follows are private to the reader, rail_signals returns counts only.
-- Each block must raise or return the expected value; a failure aborts the script.
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('a5600000-0000-0000-0000-000000000001', 'editor56@test'),
  ('a5600000-0000-0000-0000-000000000002', 'support56@test'),
  ('a5600000-0000-0000-0000-000000000003', 'reader56a@test'),
  ('a5600000-0000-0000-0000-000000000004', 'reader56b@test');
insert into public.platform_roles (user_id, role) values
  ('a5600000-0000-0000-0000-000000000001', 'editor'),
  ('a5600000-0000-0000-0000-000000000002', 'support');

insert into public.organisations (id, code, kind, legal_name, display_name, slug, country) values
  ('a5600000-0000-0000-0000-0000000000a1', 'PB-TD056', 'publisher', 'Org 56 Ltd', 'Org 56', 'org-56', 'GB');
insert into public.authors (id, code, org_id, slug, display_name, country) values
  ('a5600000-0000-0000-0000-0000000000e1', 'AU-T5601', 'a5600000-0000-0000-0000-0000000000a1', 'author-56a', 'Author 56 A', 'GB'),
  ('a5600000-0000-0000-0000-0000000000e2', 'AU-T5602', 'a5600000-0000-0000-0000-0000000000a1', 'author-56b', 'Author 56 B', 'GB');
insert into public.books (id, org_id, slug, title, rights_status) values
  ('a5600000-0000-0000-0000-0000000000b1', 'a5600000-0000-0000-0000-0000000000a1', 'book-56', 'Book 56', 'public_domain'),
  ('a5600000-0000-0000-0000-0000000000b2', 'a5600000-0000-0000-0000-0000000000a1', 'book-56b', 'Book 56 B', 'public_domain');
insert into public.book_contributors (book_id, author_id, role) values
  ('a5600000-0000-0000-0000-0000000000b1', 'a5600000-0000-0000-0000-0000000000e1', 'author'),
  ('a5600000-0000-0000-0000-0000000000b2', 'a5600000-0000-0000-0000-0000000000e2', 'author');
insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, safety_tier, depth, status) values
  ('a5600000-0000-0000-0000-0000000000c1', 'AK-T56A0', 'a5600000-0000-0000-0000-0000000000b1', 'a5600000-0000-0000-0000-0000000000a1', 'wb-56a', 'Workbook 56 A', 'Card', 'productivity', 'none', 'full', 'live'),
  ('a5600000-0000-0000-0000-0000000000c2', 'AK-T56B0', 'a5600000-0000-0000-0000-0000000000b2', 'a5600000-0000-0000-0000-0000000000a1', 'wb-56b', 'Workbook 56 B', 'Card', 'productivity', 'none', 'full', 'draft');
insert into public.workbook_versions (id, workbook_id, semver, content, content_hash) values
  ('a5600000-0000-0000-0000-0000000000d1', 'a5600000-0000-0000-0000-0000000000c1', '1.0.0', '{}'::jsonb, repeat('c', 64));

-- ---------------------------------------------------------------------------
-- 1. A visitor asks for a title. Stored, trimmed, keyed, rate limited.
-- ---------------------------------------------------------------------------
do $$ declare v_id uuid; v_h text := repeat('a', 64); begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "anon"}'::text, true);
  execute 'set local role anon';
  v_id := public.submit_title_request('  The Power of Habit!  ', ' Charles Duhigg ', 'Please add it.', v_h);
  if v_id is null then raise exception 'a request should be stored'; end if;
  perform public.submit_title_request('the power of habit', null, null, v_h);
  perform public.submit_title_request('Atomic Habits', null, null, v_h);
  begin perform public.submit_title_request('A fourth in a day', null, null, v_h);
    raise exception 'the fourth request from one address should be refused'; exception when sqlstate 'AKZ29' then null; end;
  begin perform public.submit_title_request('', null, null, repeat('b', 64));
    raise exception 'an empty title accepted'; exception when sqlstate 'AKZ01' then null; end;
  begin perform public.submit_title_request('!!!', null, null, repeat('b', 64));
    raise exception 'a title with no letters accepted'; exception when sqlstate 'AKZ01' then null; end;
  begin perform public.submit_title_request(repeat('x', 201), null, null, repeat('b', 64));
    raise exception 'a long title accepted'; exception when sqlstate 'AKZ01' then null; end;
  begin perform public.submit_title_request('Ok', repeat('x', 201), null, repeat('b', 64));
    raise exception 'a long author accepted'; exception when sqlstate 'AKZ02' then null; end;
  begin perform public.submit_title_request('Ok', null, repeat('x', 1001), repeat('b', 64));
    raise exception 'a long note accepted'; exception when sqlstate 'AKZ02' then null; end;
  begin perform public.submit_title_request('Ok', null, null, 'not-a-hash');
    raise exception 'a bad hash accepted'; exception when sqlstate 'AKZ03' then null; end;
  begin perform * from public.title_requests;
    raise exception 'a visitor should have no read grant'; exception when insufficient_privilege then null; end;
  reset role;
  if (select title from public.title_requests where id = v_id) <> 'The Power of Habit!' then raise exception 'title should be trimmed'; end if;
  if (select title_key from public.title_requests where id = v_id) <> 'the power of habit' then raise exception 'title key should be normalised'; end if;
  if (select count(distinct title_key) from public.title_requests where ip_hash = v_h) <> 2 then raise exception 'two requests share one key'; end if;
  if (select user_id from public.title_requests where id = v_id) is not null then raise exception 'a visitor has no user'; end if;
end $$;

-- A signed-in reader is limited by account as well as by address.
do $$ declare i int; begin
  perform test_as('a5600000-0000-0000-0000-000000000003');
  for i in 1..5 loop
    perform public.submit_title_request('Reader title ' || i, null, null, encode(pg_catalog.sha256(convert_to('addr' || i, 'UTF8')), 'hex'));
  end loop;
  begin perform public.submit_title_request('Reader title 6', null, null, encode(pg_catalog.sha256(convert_to('addr6', 'UTF8')), 'hex'));
    raise exception 'the sixth request from one reader should be refused'; exception when sqlstate 'AKZ29' then null; end;
  if (select count(*) from public.title_requests) <> 0 then raise exception 'a reader cannot read requests'; end if;
  reset role;
  if (select count(*) from public.title_requests where user_id = 'a5600000-0000-0000-0000-000000000003') <> 5 then raise exception 'five requests carry the reader'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Staff read and set a status; others cannot.
-- ---------------------------------------------------------------------------
do $$ declare v_id uuid; begin
  select id into v_id from public.title_requests where title_key = 'atomic habits';
  perform test_as('a5600000-0000-0000-0000-000000000004');
  begin perform public.set_title_request_status(v_id, 'planned', 'x');
    raise exception 'a reader should not set a status'; exception when insufficient_privilege then null; end;
  reset role;
  perform test_as('a5600000-0000-0000-0000-000000000002', array['support']);
  if (select count(*) from public.title_requests) < 3 then raise exception 'support reads requests'; end if;
  perform public.set_title_request_status(v_id, 'planned', '  On the list for spring.  ');
  if (select staff_note from public.title_requests where id = v_id) <> 'On the list for spring.' then raise exception 'note should be trimmed'; end if;
  begin perform public.set_title_request_status(v_id, 'maybe', null);
    raise exception 'unknown status accepted'; exception when sqlstate 'AKZ04' then null; end;
  begin perform public.set_title_request_status(gen_random_uuid(), 'done', null);
    raise exception 'unknown id accepted'; exception when sqlstate 'AKZ05' then null; end;
  begin perform public.set_title_request_status(v_id, 'done', repeat('x', 501));
    raise exception 'long note accepted'; exception when sqlstate 'AKZ06' then null; end;
  begin update public.title_requests set title = 'edited' where id = v_id;
    raise exception 'staff should have no direct update grant'; exception when insufficient_privilege then null; end;
  reset role;
  if (select status from public.title_requests where id = v_id) <> 'planned' then raise exception 'status should be planned'; end if;
  if not exists (select 1 from public.audit_log where action = 'title_request.status') then raise exception 'status change should be audited'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Follows: private, own rows only, public authors only, capped.
-- ---------------------------------------------------------------------------
do $$ begin
  perform test_as('a5600000-0000-0000-0000-000000000003');
  insert into public.author_follows (user_id, author_id) values ('a5600000-0000-0000-0000-000000000003', 'a5600000-0000-0000-0000-0000000000e1');
  begin insert into public.author_follows (user_id, author_id) values ('a5600000-0000-0000-0000-000000000004', 'a5600000-0000-0000-0000-0000000000e1');
    raise exception 'a reader should not follow as someone else'; exception when insufficient_privilege then null; end;
  begin insert into public.author_follows (user_id, author_id) values ('a5600000-0000-0000-0000-000000000003', 'a5600000-0000-0000-0000-0000000000e2');
    raise exception 'an author with no live workbook should not be followable'; exception when insufficient_privilege then null; end;
  begin insert into public.author_follows (user_id, author_id) values ('a5600000-0000-0000-0000-000000000003', 'a5600000-0000-0000-0000-0000000000e1');
    raise exception 'a duplicate follow accepted'; exception when unique_violation then null; end;
  if (select count(*) from public.author_follows) <> 1 then raise exception 'the reader sees their own follow'; end if;
  reset role;

  perform test_as('a5600000-0000-0000-0000-000000000004');
  if (select count(*) from public.author_follows) <> 0 then raise exception 'another reader sees no follows'; end if;
  delete from public.author_follows where author_id = 'a5600000-0000-0000-0000-0000000000e1';
  reset role;
  if (select count(*) from public.author_follows) <> 1 then raise exception 'another reader cannot delete a follow'; end if;

  perform test_as('a5600000-0000-0000-0000-000000000003');
  delete from public.author_follows where author_id = 'a5600000-0000-0000-0000-0000000000e1';
  if (select count(*) from public.author_follows) <> 0 then raise exception 'unfollow removes the row'; end if;
  reset role;

  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "anon"}'::text, true);
  execute 'set local role anon';
  begin perform * from public.author_follows;
    raise exception 'a visitor should have no read grant'; exception when insufficient_privilege then null; end;
  reset role;
end $$;

do $$ declare i int; a uuid; begin
  for i in 1..200 loop
    insert into public.authors (id, org_id, slug, display_name) values
      (('a5600000-0000-0000-0002-' || lpad(i::text, 12, '0'))::uuid, 'a5600000-0000-0000-0000-0000000000a1', 'cap-author-' || i, 'Cap ' || i);
    insert into public.author_follows (user_id, author_id) values
      ('a5600000-0000-0000-0000-000000000004', ('a5600000-0000-0000-0002-' || lpad(i::text, 12, '0'))::uuid);
  end loop;
  begin
    insert into public.author_follows (user_id, author_id) values ('a5600000-0000-0000-0000-000000000004', 'a5600000-0000-0000-0000-0000000000e1');
    raise exception 'the 201st follow should be refused';
  exception when sqlstate 'AKZ07' then null; end;
end $$;

-- ---------------------------------------------------------------------------
-- 4. rail_signals: counts, a return after seven days, live workbooks only.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email)
select ('a5600000-0000-0000-0001-' || lpad(g::text, 12, '0'))::uuid, 'r' || g || '@t56' from generate_series(1, 4) g;
insert into public.enrolments (id, user_id, tenant_id, workbook_id, version_id, status, started_at)
select ('a5600000-0000-0000-0003-' || lpad(g::text, 12, '0'))::uuid,
       ('a5600000-0000-0000-0001-' || lpad(g::text, 12, '0'))::uuid, '00000000-0000-0000-0000-00000000000a',
       'a5600000-0000-0000-0000-0000000000c1', 'a5600000-0000-0000-0000-0000000000d1',
       case when g <= 2 then 'finished' else 'active' end, now() - interval '20 days'
  from generate_series(1, 4) g;
insert into public.progress_events (enrolment_id, kind, at) values
  ('a5600000-0000-0000-0003-000000000001', 'step_done', now() - interval '5 days'),
  ('a5600000-0000-0000-0003-000000000002', 'step_done', now() - interval '19 days'),
  ('a5600000-0000-0000-0003-000000000003', 'unit_opened', now() - interval '2 days');
do $$ declare r record; begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "anon"}'::text, true);
  execute 'set local role anon';
  select * into r from public.rail_signals('00000000-0000-0000-0000-00000000000a') where workbook_id = 'a5600000-0000-0000-0000-0000000000c1';
  if r.starts <> 4 or r.finishes <> 2 or r.returned <> 1 then raise exception 'expected 4, 2, 1, got %, %, %', r.starts, r.finishes, r.returned; end if;
  if exists (select 1 from public.rail_signals('00000000-0000-0000-0000-00000000000a') where workbook_id = 'a5600000-0000-0000-0000-0000000000c2') then
    raise exception 'a draft workbook has no signals';
  end if;
  reset role;
end $$;

rollback;
