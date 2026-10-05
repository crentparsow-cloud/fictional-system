-- Catalogue visibility, version isolation, publishing and section gating
-- (T1 catalogue policies, F-019 free unit, F-131). Each block must raise or
-- return the expected count; a failure aborts the script and the CI step.
\set ON_ERROR_STOP on

begin;

-- Two organisations with an owner each, a reader with no memberships, and a
-- platform editor.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner-a@test'),
  ('22222222-2222-2222-2222-222222222222', 'owner-b@test'),
  ('33333333-3333-3333-3333-333333333333', 'reader@test'),
  ('44444444-4444-4444-4444-444444444444', 'staff@test');

insert into public.organisations (id, kind, legal_name, display_name, slug, country) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'publisher', 'Org A Ltd', 'Org A', 'org-a', 'GB'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'publisher', 'Org B Ltd', 'Org B', 'org-b', 'US');
insert into public.org_members (org_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'owner');

insert into public.authors (id, code, org_id, slug, display_name, legal_name, country) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'AU-TEST1', 'aaaaaaaa-0000-0000-0000-000000000001', 'author-a', 'Author A', 'A. Private', 'GB'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'AU-TEST2', 'bbbbbbbb-0000-0000-0000-000000000002', 'author-b', 'Author B', 'B. Private', 'US');

insert into public.books (id, org_id, slug, title, rights_status, is_demo) values
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-000000000001', 'book-a', 'Book A', 'licensed', false),
  ('aaaaaaaa-0000-0000-0000-0000000000a3', 'aaaaaaaa-0000-0000-0000-000000000001', 'book-demo', 'Demo Book', 'own_work', true),
  ('bbbbbbbb-0000-0000-0000-0000000000b2', 'bbbbbbbb-0000-0000-0000-000000000002', 'book-b', 'Book B', 'licensed', false);
insert into public.book_contributors (book_id, author_id, role) values
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'author'),
  ('aaaaaaaa-0000-0000-0000-0000000000a3', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'author'),
  ('bbbbbbbb-0000-0000-0000-0000000000b2', 'bbbbbbbb-0000-0000-0000-0000000000b1', 'author');

-- Org A: one live workbook and one live demo. Org B: one draft.
insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, depth, badge, is_demo, status) values
  ('aaaaaaaa-0000-0000-0000-0000000000a4', 'AK-TEST1', 'aaaaaaaa-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-000000000001',
   'workbook-a', 'Workbook A', 'Card A', 'business', 'full', 'official', false, 'live'),
  ('aaaaaaaa-0000-0000-0000-0000000000a5', 'AK-TEST2', 'aaaaaaaa-0000-0000-0000-0000000000a3', 'aaaaaaaa-0000-0000-0000-000000000001',
   'workbook-demo', 'Demo Workbook', 'Card demo', 'career', 'outline', 'demo', true, 'live'),
  ('bbbbbbbb-0000-0000-0000-0000000000b4', 'AK-TEST3', 'bbbbbbbb-0000-0000-0000-0000000000b2', 'bbbbbbbb-0000-0000-0000-000000000002',
   'workbook-b', 'Workbook B', 'Card B', 'finance', 'full', 'official', false, 'draft');

-- A small v3 document for workbook A: three units, first unit free, with an
-- internal block that must never reach a section.
create temp table doc as select $j$
{
  "schema_version": "3.0",
  "code": "AK-TEST1",
  "slug": "workbook-a",
  "title": "Workbook A",
  "card_line": "Card A",
  "book": {"book_id": "book-a", "title": "Book A"},
  "author": {"author_id": "AU-TEST1", "display_name": "Author A"},
  "genre": "business",
  "language": "en",
  "spelling": "en-GB",
  "is_demo": false,
  "depth": "full",
  "badge": "official",
  "safety_tier": "none",
  "advice_guardrail": "not_legal_or_tax_advice",
  "structure": {"unit": "week", "count": 3, "free_units": 1},
  "start": {"welcome": "Welcome", "how_it_works": ["Read", "Do"], "why_prompt": "Why now"},
  "units": [
    {"number": 1, "focus": "One", "exercise_ids": ["ex_one"]},
    {"number": 2, "focus": "Two", "exercise_ids": ["ex_three", "ex_two"]},
    {"number": 3, "focus": "Three", "exercise_ids": ["ex_three"]}
  ],
  "exercises": [
    {"id": "ex_one", "title": "Exercise one", "purpose": "p", "why": "w", "source": {"chapter": "1"}, "minutes": 10,
     "steps": [{"text": "Do it"}], "fields": [{"id": "f_one", "type": "short_text", "label": "Note"}], "done_when": "Done"},
    {"id": "ex_two", "title": "Exercise two", "purpose": "p", "why": "w", "source": {"chapter": "2"}, "minutes": 10,
     "steps": [{"text": "Do it"}], "fields": [{"id": "f_two", "type": "short_text", "label": "Note"}], "done_when": "Done"},
    {"id": "ex_three", "title": "Exercise three", "purpose": "p", "why": "w", "source": {"chapter": "3"}, "minutes": 10,
     "steps": [{"text": "Do it"}], "fields": [{"id": "f_three", "type": "short_text", "label": "Note"}], "done_when": "Done"}
  ],
  "toolkit": [{"id": "tk_one", "title": "Card", "when_to_use": "When stuck", "steps": ["a", "b"], "minutes": 3, "source": {"chapter": "1"}}],
  "finish": {"summary": "Done", "book_bridge": "Back to the book"},
  "keep_going": {"monthly_questions": ["Still going?"], "refresher_ids": ["ex_one"]},
  "safety_hub": {"points": [{"title": "Help", "text": "Reach out"}], "see_doctor": ["If worried"]},
  "internal": {"notes": "house only"}
}
$j$::jsonb as content;

insert into public.workbook_versions (id, workbook_id, semver, content, content_hash) values
  ('aaaaaaaa-0000-0000-0000-0000000000a6', 'aaaaaaaa-0000-0000-0000-0000000000a4', '1.0.0',
   (select content from doc), (select encode(sha256(convert_to(content::text, 'UTF8')), 'hex') from doc)),
  ('bbbbbbbb-0000-0000-0000-0000000000b6', 'bbbbbbbb-0000-0000-0000-0000000000b4', '0.1.0',
   '{"schema_version": "3.0", "title": "Draft B"}'::jsonb, repeat('b', 64));

-- Anonymous visitors see live workbooks only, and demo titles only while
-- demo_visible is on. Drafts and non-public authors and books stay hidden.
savepoint s1;
update public.feature_flags set enabled = false where key = 'demo_visible' and scope = 'global';
select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
set local role anon;
do $$ declare n int; begin
  select count(*) into n from public.workbooks;
  if n <> 1 then raise exception 'anon with demo hidden should see 1 workbook, saw %', n; end if;
  select count(*) into n from public.workbooks where slug = 'workbook-b';
  if n <> 0 then raise exception 'anon saw the draft workbook'; end if;
  select count(*) into n from public.authors;
  if n <> 1 then raise exception 'anon should see 1 public author, saw %', n; end if;
  select count(*) into n from public.books;
  if n <> 1 then raise exception 'anon should see 1 public book, saw %', n; end if;
  select count(*) into n from public.genres;
  if n <> 11 then raise exception 'anon should see 11 genres, saw %', n; end if;
  begin
    perform legal_name from public.authors;
    raise exception 'anon read authors.legal_name';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.feature_flags set enabled = true where key = 'demo_visible' and scope = 'global';
select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
set local role anon;
do $$ declare n int; begin
  select count(*) into n from public.workbooks;
  if n <> 2 then raise exception 'anon with demo visible should see 2 workbooks, saw %', n; end if;
  select count(*) into n from public.books;
  if n <> 2 then raise exception 'anon should see 2 public books, saw %', n; end if;
end $$;
rollback to savepoint s1;

-- Owner A reads their own version content and never organisation B's.
-- Owner B sees their own draft and the public titles, and cannot edit A's rows.
savepoint s2;
select test_as('11111111-1111-1111-1111-111111111111');
do $$ declare n int; begin
  select count(*) into n from public.workbook_versions;
  if n <> 1 then raise exception 'owner A should see 1 version, saw %', n; end if;
  select count(*) into n from public.workbook_versions where workbook_id = 'bbbbbbbb-0000-0000-0000-0000000000b4';
  if n <> 0 then raise exception 'owner A read organisation B version content'; end if;
  select count(*) into n from public.workbooks where org_id = 'bbbbbbbb-0000-0000-0000-000000000002';
  if n <> 0 then raise exception 'owner A saw organisation B draft'; end if;
  -- Owner A may not approve or publish their own workbook
  begin
    update public.workbooks set status = 'live' where id = 'aaaaaaaa-0000-0000-0000-0000000000a4';
    update public.workbooks set status = 'in_review' where id = 'aaaaaaaa-0000-0000-0000-0000000000a4';
    update public.workbooks set status = 'live' where id = 'aaaaaaaa-0000-0000-0000-0000000000a4';
    raise exception 'owner A moved a workbook to live';
  exception when insufficient_privilege then null; end;
  -- Owner A may not publish a version
  begin
    perform app.publish_version('aaaaaaaa-0000-0000-0000-0000000000a6');
    raise exception 'owner A published a version';
  exception when insufficient_privilege then null; end;
end $$;
rollback to savepoint s2;

savepoint s3;
select test_as('22222222-2222-2222-2222-222222222222');
do $$ declare n int; begin
  select count(*) into n from public.workbooks where slug = 'workbook-b';
  if n <> 1 then raise exception 'owner B should see their draft'; end if;
  select count(*) into n from public.workbook_versions;
  if n <> 1 then raise exception 'owner B should see 1 version, saw %', n; end if;
  update public.authors set bio = 'pwned' where id = 'aaaaaaaa-0000-0000-0000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'owner B updated organisation A author'; end if;
  update public.authors set bio = 'mine' where id = 'bbbbbbbb-0000-0000-0000-0000000000b1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'owner B could not update their own author'; end if;
  begin
    insert into public.workbooks (code, book_id, org_id, slug, title, genre_id)
    values ('AK-TEST4', 'aaaaaaaa-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-000000000001', 'intruder', 'Intruder', 'career');
    raise exception 'owner B created a workbook for organisation A';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.workbook_versions (workbook_id, semver, content, content_hash)
    values ('bbbbbbbb-0000-0000-0000-0000000000b4', '0.2.0', '{}'::jsonb, repeat('c', 64));
    raise exception 'owner B inserted a version from the client';
  exception when insufficient_privilege then null; end;
end $$;
rollback to savepoint s3;

-- Publishing splits the document into sections with the right free flags.
savepoint s4;
select test_as('44444444-4444-4444-4444-444444444444', array['editor']);
select app.publish_version('aaaaaaaa-0000-0000-0000-0000000000a6');
reset role;
do $$ declare n int; b jsonb; begin
  select count(*) into n from public.workbook_sections where version_id = 'aaaaaaaa-0000-0000-0000-0000000000a6';
  if n <> 9 then raise exception 'expected 9 sections, saw %', n; end if;
  select count(*) into n from public.workbook_sections where version_id = 'aaaaaaaa-0000-0000-0000-0000000000a6' and kind = 'unit';
  if n <> 3 then raise exception 'expected 3 unit sections, saw %', n; end if;
  select count(*) into n from public.workbook_sections where version_id = 'aaaaaaaa-0000-0000-0000-0000000000a6' and free;
  if n <> 4 then raise exception 'expected listing, start, safety_hub and unit 1 free, saw % free sections', n; end if;
  if not (select free from public.workbook_sections where version_id = 'aaaaaaaa-0000-0000-0000-0000000000a6' and kind = 'unit' and unit_number = 1) then
    raise exception 'unit 1 should be free'; end if;
  if (select free from public.workbook_sections where version_id = 'aaaaaaaa-0000-0000-0000-0000000000a6' and kind = 'unit' and unit_number = 2) then
    raise exception 'unit 2 should not be free'; end if;
  if (select free from public.workbook_sections where version_id = 'aaaaaaaa-0000-0000-0000-0000000000a6' and kind = 'toolkit') then
    raise exception 'toolkit should not be free'; end if;
  -- unit 2 carries its two exercises in exercise_ids order
  select body into b from public.workbook_sections where version_id = 'aaaaaaaa-0000-0000-0000-0000000000a6' and kind = 'unit' and unit_number = 2;
  if jsonb_array_length(b->'exercises') <> 2 then raise exception 'unit 2 should carry 2 exercises'; end if;
  if b->'exercises'->0->>'id' <> 'ex_three' or b->'exercises'->1->>'id' <> 'ex_two' then raise exception 'unit 2 exercises out of order'; end if;
  -- nothing internal leaks, listing has the outline and no exercises
  select count(*) into n from public.workbook_sections where version_id = 'aaaaaaaa-0000-0000-0000-0000000000a6' and body::text like '%house only%';
  if n <> 0 then raise exception 'internal block reached a section'; end if;
  select body into b from public.workbook_sections where version_id = 'aaaaaaaa-0000-0000-0000-0000000000a6' and kind = 'listing';
  if jsonb_array_length(b->'outline') <> 3 or b ? 'exercises' then raise exception 'listing body is wrong'; end if;
  -- version and workbook are updated, and the audit row is written
  if (select published_at from public.workbook_versions where id = 'aaaaaaaa-0000-0000-0000-0000000000a6') is null then
    raise exception 'published_at not set'; end if;
  if (select current_version_id from public.workbooks where id = 'aaaaaaaa-0000-0000-0000-0000000000a4') <> 'aaaaaaaa-0000-0000-0000-0000000000a6' then
    raise exception 'current_version_id not set'; end if;
  select count(*) into n from public.audit_log where action = 'workbook.publish_version';
  if n <> 1 then raise exception 'publish should write 1 audit row, saw %', n; end if;
  -- publishing twice is refused
  begin
    perform set_config('request.jwt.claims', jsonb_build_object('app_metadata', jsonb_build_object('platform_roles', array['editor']))::text, true);
    perform app.publish_version('aaaaaaaa-0000-0000-0000-0000000000a6');
    raise exception 'version was published twice';
  exception when object_not_in_prerequisite_state then null; end;
end $$;

-- Published content is immutable, even for the table owner
do $$ begin
  begin
    update public.workbook_versions set content = '{}'::jsonb where id = 'aaaaaaaa-0000-0000-0000-0000000000a6';
    raise exception 'published content was updated';
  exception when object_not_in_prerequisite_state then null; end;
  begin
    update public.workbook_versions set content_hash = repeat('0', 64) where id = 'aaaaaaaa-0000-0000-0000-0000000000a6';
    raise exception 'published content_hash was updated';
  exception when object_not_in_prerequisite_state then null; end;
  begin
    delete from public.workbook_versions where id = 'aaaaaaaa-0000-0000-0000-0000000000a6';
    raise exception 'published version was deleted';
  exception when object_not_in_prerequisite_state then null; end;
  -- approval columns on a published version may still change
  update public.workbook_versions set author_approved_by = '11111111-1111-1111-1111-111111111111' where id = 'aaaaaaaa-0000-0000-0000-0000000000a6';
  -- the unpublished draft stays editable
  update public.workbook_versions set content = '{"schema_version": "3.0", "title": "Draft B2"}'::jsonb, content_hash = repeat('d', 64)
   where id = 'bbbbbbbb-0000-0000-0000-0000000000b6';
end $$;

-- A reader with no memberships: listing and free sections of the live
-- workbook, nothing paid, no version content.
select test_as('33333333-3333-3333-3333-333333333333');
do $$ declare n int; begin
  select count(*) into n from public.workbook_sections where kind = 'listing';
  if n <> 1 then raise exception 'reader should see 1 listing section, saw %', n; end if;
  select count(*) into n from public.workbook_sections where kind = 'unit' and unit_number = 1;
  if n <> 1 then raise exception 'reader should see the free unit 1'; end if;
  select count(*) into n from public.workbook_sections where kind = 'unit' and unit_number = 2;
  if n <> 0 then raise exception 'reader saw unit 2 without an entitlement'; end if;
  select count(*) into n from public.workbook_sections where kind in ('toolkit','finish','keep_going');
  if n <> 0 then raise exception 'reader saw paid sections'; end if;
  select count(*) into n from public.workbook_sections where kind in ('start','safety_hub');
  if n <> 2 then raise exception 'reader should see start and safety_hub, saw %', n; end if;
  select count(*) into n from public.workbook_versions;
  if n <> 0 then raise exception 'reader read version content'; end if;
  select count(*) into n from public.tenant_listings;
  if n <> 0 then raise exception 'listings should be empty here'; end if;
  begin
    insert into public.tenant_listings (tenant_id, workbook_id) values ('00000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-0000000000a4');
    raise exception 'reader wrote a tenant listing';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Once the workbook is paused, the reader sees none of its sections.
update public.workbooks set status = 'paused' where id = 'aaaaaaaa-0000-0000-0000-0000000000a4';
select test_as('33333333-3333-3333-3333-333333333333');
do $$ declare n int; begin
  select count(*) into n from public.workbook_sections;
  if n <> 0 then raise exception 'reader saw sections of a paused workbook, %', n; end if;
end $$;
rollback to savepoint s4;

-- Staff editor manages tenant listings for the marketplace; owner B cannot.
savepoint s5;
select test_as('44444444-4444-4444-4444-444444444444', array['editor']);
insert into public.tenant_listings (tenant_id, workbook_id, featured) values ('00000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-0000000000a4', true);
select test_as('22222222-2222-2222-2222-222222222222');
do $$ declare n int; begin
  update public.tenant_listings set visible = false where workbook_id = 'aaaaaaaa-0000-0000-0000-0000000000a4';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'owner B changed a marketplace listing'; end if;
end $$;
rollback to savepoint s5;

-- citext moved to the extensions schema and tenant_domains.host still matches
-- case-insensitively: with the schema on the search_path, as Supabase sets it
-- for the database, and with the operator fully qualified.
savepoint s6;
reset role;
do $$ declare n int; begin
  if (select nspname from pg_namespace n join pg_type t on t.typnamespace = n.oid where t.typname = 'citext') <> 'extensions' then
    raise exception 'citext is not in the extensions schema'; end if;
  if (select format_type(atttypid, atttypmod) from pg_attribute where attrelid = 'public.tenant_domains'::regclass and attname = 'host') <> 'extensions.citext' then
    raise exception 'tenant_domains.host is not extensions.citext'; end if;
  insert into public.tenant_domains (host, tenant_id) values ('Books.Example.COM', '00000000-0000-0000-0000-00000000000a');
  select count(*) into n from public.tenant_domains where host operator(extensions.=) 'books.example.com'::extensions.citext;
  if n <> 1 then raise exception 'citext match with the qualified operator failed'; end if;
  perform set_config('search_path', 'public, extensions', true);
  select count(*) into n from public.tenant_domains where host = 'BOOKS.example.com';
  if n <> 1 then raise exception 'citext match with extensions on the search_path failed'; end if;
  if (select proconfig from pg_proc where oid = 'app.touch_updated_at()'::regprocedure) is null then
    raise exception 'app.touch_updated_at has no pinned search_path'; end if;
end $$;
rollback to savepoint s6;

rollback;
\echo PASS 0002_catalogue
