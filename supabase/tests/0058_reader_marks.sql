-- 0058 Highlights and notes: private to the reader. A reader sees and
-- deletes only their own marks, cannot write one from the client, staff
-- cannot read them, a mark must belong to its enrolment's owner, and marks
-- go with the enrolment and the account. Each block raises on failure.
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('a5800000-0000-0000-0000-000000000001', 'reader-a@test'),
  ('a5800000-0000-0000-0000-000000000002', 'reader-b@test'),
  ('a5800000-0000-0000-0000-000000000003', 'staff@test');

insert into public.organisations (id, kind, legal_name, display_name, slug, country) values
  ('a5800000-0000-0000-0000-0000000000a1', 'publisher', 'Org Ltd', 'Org', 'org-t58', 'GB');
insert into public.authors (id, code, org_id, slug, display_name, country) values
  ('a5800000-0000-0000-0000-0000000000a2', 'AU-TESTZ', 'a5800000-0000-0000-0000-0000000000a1', 'author-t58', 'Author', 'GB');
insert into public.books (id, org_id, slug, title) values
  ('a5800000-0000-0000-0000-0000000000a3', 'a5800000-0000-0000-0000-0000000000a1', 'book-t58', 'Book');
insert into public.book_contributors (book_id, author_id, role) values
  ('a5800000-0000-0000-0000-0000000000a3', 'a5800000-0000-0000-0000-0000000000a2', 'author');
insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, depth, status) values
  ('a5800000-0000-0000-0000-0000000000a4', 'AK-TESTZ', 'a5800000-0000-0000-0000-0000000000a3', 'a5800000-0000-0000-0000-0000000000a1',
   'workbook-t58', 'Live Workbook', 'Card', 'productivity', 'full', 'live');
insert into public.workbook_versions (id, workbook_id, semver, content, content_hash, published_at) values
  ('a5800000-0000-0000-0000-0000000000a5', 'a5800000-0000-0000-0000-0000000000a4', '1.0.0', '{"schema_version": "3.0"}'::jsonb, repeat('d', 64), now());
update public.workbooks set current_version_id = 'a5800000-0000-0000-0000-0000000000a5' where id = 'a5800000-0000-0000-0000-0000000000a4';

insert into public.enrolments (id, user_id, tenant_id, workbook_id, version_id) values
  ('a5800000-0000-0000-0000-0000000000e1', 'a5800000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'a5800000-0000-0000-0000-0000000000a4', 'a5800000-0000-0000-0000-0000000000a5'),
  ('a5800000-0000-0000-0000-0000000000e2', 'a5800000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'a5800000-0000-0000-0000-0000000000a4', 'a5800000-0000-0000-0000-0000000000a5');

-- 1. The server (service role) writes marks.
set local role service_role;
insert into public.reader_marks (id, user_id, enrolment_id, ref, colour, sealed, key_id) values
  ('a5800000-0000-0000-0000-0000000000b1', 'a5800000-0000-0000-0000-000000000001', 'a5800000-0000-0000-0000-0000000000e1', 'unit:3#2', 'yellow', 'v2.k1.abc', 'k1'),
  ('a5800000-0000-0000-0000-0000000000b2', 'a5800000-0000-0000-0000-000000000001', 'a5800000-0000-0000-0000-0000000000e1', 'unit:3#4', 'pink', 'v2.k1.def', 'k1'),
  ('a5800000-0000-0000-0000-0000000000b3', 'a5800000-0000-0000-0000-000000000002', 'a5800000-0000-0000-0000-0000000000e2', 'unit:3#2', 'blue', 'v2.k1.ghi', 'k1');
reset role;

-- 2. A mark cannot be written for someone else's enrolment, even by the server.
do $$ begin
  begin
    insert into public.reader_marks (user_id, enrolment_id, ref, colour, sealed, key_id)
    values ('a5800000-0000-0000-0000-000000000002', 'a5800000-0000-0000-0000-0000000000e1', 'unit:9#1', 'green', 'v2.k1.x', 'k1');
    raise exception 'a mark was written onto someone else''s enrolment';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.reader_marks (user_id, enrolment_id, ref, colour, sealed, key_id)
    values ('a5800000-0000-0000-0000-000000000001', 'a5800000-0000-0000-0000-0000000000e1', 'unit:9#1', 'purple', 'v2.k1.x', 'k1');
    raise exception 'an unknown colour was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.reader_marks (user_id, enrolment_id, ref, colour, sealed, key_id)
    values ('a5800000-0000-0000-0000-000000000001', 'a5800000-0000-0000-0000-0000000000e1', 'unit:9#1', 'green', 'plain note text', 'k1');
    raise exception 'unsealed text was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.reader_marks (user_id, enrolment_id, ref, colour, sealed, key_id)
    values ('a5800000-0000-0000-0000-000000000001', 'a5800000-0000-0000-0000-0000000000e1', 'unit:3#2', 'green', 'v2.k1.y', 'k1');
    raise exception 'two marks on one paragraph';
  exception when unique_violation then null;
  end;
end $$;

-- 3. Reader A sees only their two marks, and cannot write from the client.
select test_as('a5800000-0000-0000-0000-000000000001');
do $$ begin
  if (select count(*) from public.reader_marks) <> 2 then raise exception 'reader A should see 2 marks'; end if;
  begin
    insert into public.reader_marks (user_id, enrolment_id, ref, colour, sealed, key_id)
    values ('a5800000-0000-0000-0000-000000000001', 'a5800000-0000-0000-0000-0000000000e1', 'unit:5#1', 'green', 'v2.k1.z', 'k1');
    raise exception 'a client wrote a mark';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.reader_marks set colour = 'blue';
    raise exception 'a client updated a mark';
  exception when insufficient_privilege then null;
  end;
  -- 4. They can delete their own, and not another reader's.
  delete from public.reader_marks where id = 'a5800000-0000-0000-0000-0000000000b2';
  delete from public.reader_marks where id = 'a5800000-0000-0000-0000-0000000000b3';
  if (select count(*) from public.reader_marks) <> 1 then raise exception 'delete of own mark failed'; end if;
end $$;
reset role;
do $$ begin
  if not exists (select 1 from public.reader_marks where id = 'a5800000-0000-0000-0000-0000000000b3') then
    raise exception 'reader A deleted reader B''s mark';
  end if;
end $$;

-- 5. Reader B sees only their own. Staff and signed-out visitors see none.
select test_as('a5800000-0000-0000-0000-000000000002');
do $$ begin
  if (select count(*) from public.reader_marks) <> 1 then raise exception 'reader B should see 1 mark'; end if;
  if exists (select 1 from public.reader_marks where user_id <> 'a5800000-0000-0000-0000-000000000002') then raise exception 'reader B saw another reader''s mark'; end if;
end $$;
reset role;
select test_as('a5800000-0000-0000-0000-000000000003', array['owner', 'support']);
do $$ begin
  if exists (select 1 from public.reader_marks) then raise exception 'staff could read private marks'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
  begin
    perform 1 from public.reader_marks;
    raise exception 'anon could read marks';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- 6. Marks go with the enrolment, and with the account.
delete from public.enrolments where id = 'a5800000-0000-0000-0000-0000000000e2';
do $$ begin
  if exists (select 1 from public.reader_marks where id = 'a5800000-0000-0000-0000-0000000000b3') then raise exception 'a mark outlived its enrolment'; end if;
end $$;
delete from auth.users where id = 'a5800000-0000-0000-0000-000000000001';
do $$ begin
  if exists (select 1 from public.reader_marks) then raise exception 'marks outlived the account'; end if;
end $$;

rollback;
