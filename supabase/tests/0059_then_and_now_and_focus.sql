-- 0059 Then and now entries and the focus settings. Entries are private to
-- the reader, deletable one by one, written only by the server and tied to the
-- owner's enrolment. The reading settings row accepts the focus and thennow
-- choices and refuses anything else. Each block raises on failure.
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

set local role service_role;
insert into public.then_now_entries (id, user_id, enrolment_id, step_ref, sealed, key_id) values
  ('a5800000-0000-0000-0000-0000000000c1', 'a5800000-0000-0000-0000-000000000001', 'a5800000-0000-0000-0000-0000000000e1', 'plan_first_step', 'v2.k1.aaa', 'k1'),
  ('a5800000-0000-0000-0000-0000000000c2', 'a5800000-0000-0000-0000-000000000001', 'a5800000-0000-0000-0000-0000000000e1', 'plan_first_step', 'v2.k1.bbb', 'k1'),
  ('a5800000-0000-0000-0000-0000000000c3', 'a5800000-0000-0000-0000-000000000002', 'a5800000-0000-0000-0000-0000000000e2', 'plan_first_step', 'v2.k1.ccc', 'k1');
reset role;

do $$ begin
  begin
    insert into public.then_now_entries (user_id, enrolment_id, step_ref, sealed, key_id)
    values ('a5800000-0000-0000-0000-000000000002', 'a5800000-0000-0000-0000-0000000000e1', 'x', 'v2.k1.q', 'k1');
    raise exception 'an entry was written onto someone else''s enrolment';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.then_now_entries (user_id, enrolment_id, step_ref, sealed, key_id)
    values ('a5800000-0000-0000-0000-000000000001', 'a5800000-0000-0000-0000-0000000000e1', 'Has Spaces', 'v2.k1.q', 'k1');
    raise exception 'free text was accepted as a step ref';
  exception when check_violation then null;
  end;
  begin
    insert into public.then_now_entries (user_id, enrolment_id, step_ref, sealed, key_id)
    values ('a5800000-0000-0000-0000-000000000001', 'a5800000-0000-0000-0000-0000000000e1', 'x', 'a plain feeling: 4', 'k1');
    raise exception 'unsealed text was accepted';
  exception when check_violation then null;
  end;
end $$;

select test_as('a5800000-0000-0000-0000-000000000001');
do $$ begin
  if (select count(*) from public.then_now_entries) <> 2 then raise exception 'reader A should see 2 entries'; end if;
  begin
    insert into public.then_now_entries (user_id, enrolment_id, step_ref, sealed, key_id)
    values ('a5800000-0000-0000-0000-000000000001', 'a5800000-0000-0000-0000-0000000000e1', 'x', 'v2.k1.q', 'k1');
    raise exception 'a client wrote an entry';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.then_now_entries set step_ref = 'y';
    raise exception 'a client updated an entry';
  exception when insufficient_privilege then null;
  end;
  delete from public.then_now_entries where id = 'a5800000-0000-0000-0000-0000000000c1';
  delete from public.then_now_entries where id = 'a5800000-0000-0000-0000-0000000000c3';
  if (select count(*) from public.then_now_entries) <> 1 then raise exception 'deleting one own entry failed'; end if;
end $$;
reset role;
do $$ begin
  if not exists (select 1 from public.then_now_entries where id = 'a5800000-0000-0000-0000-0000000000c3') then
    raise exception 'reader A deleted reader B''s entry';
  end if;
end $$;

select test_as('a5800000-0000-0000-0000-000000000003', array['owner', 'support']);
do $$ begin
  if exists (select 1 from public.then_now_entries) then raise exception 'staff could read private entries'; end if;
end $$;
reset role;

-- Focus settings: accepted values, refused values, and the old keys still work.
select test_as('a5800000-0000-0000-0000-000000000002');
do $$ begin
  insert into public.reader_settings (user_id, reading)
  values ('a5800000-0000-0000-0000-000000000002', '{"font": "lexend", "focus": "both", "thennow": "on"}');
  update public.reader_settings set reading = '{"focus": "dim", "thennow": "off", "size": 2}';
  if (select reading ->> 'focus' from public.reader_settings) <> 'dim' then raise exception 'focus was not saved'; end if;
  begin
    update public.reader_settings set reading = '{"focus": "strobe"}';
    raise exception 'an unknown focus value was accepted';
  exception when check_violation then null;
  end;
  begin
    update public.reader_settings set reading = '{"thennow": "maybe"}';
    raise exception 'an unknown thennow value was accepted';
  exception when check_violation then null;
  end;
  begin
    update public.reader_settings set reading = '{"streak": 3}';
    raise exception 'an unknown key was accepted';
  exception when check_violation then null;
  end;
end $$;
reset role;

-- Entries go with the enrolment and the account.
delete from public.enrolments where id = 'a5800000-0000-0000-0000-0000000000e2';
do $$ begin
  if exists (select 1 from public.then_now_entries where id = 'a5800000-0000-0000-0000-0000000000c3') then raise exception 'an entry outlived its enrolment'; end if;
end $$;
delete from auth.users where id = 'a5800000-0000-0000-0000-000000000001';
do $$ begin
  if exists (select 1 from public.then_now_entries) then raise exception 'entries outlived the account'; end if;
end $$;

rollback;
