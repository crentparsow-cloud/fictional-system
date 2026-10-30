-- 0070 Demo titles fully open to signed-in readers for the demo period.
-- A signed-in reader with no purchase or membership reads every section of a
-- public demo title. Anonymous readers still see only the free first part.
-- A real paid title stays gated, and a demo still cannot be bought. Each
-- block must raise or return the expected count; a failure aborts the script.
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('a7000000-0000-0000-0000-000000000001', 'reader70@test');

insert into public.organisations (id, code, kind, legal_name, display_name, slug, country, connect_status) values
  ('a7000000-0000-0000-0000-0000000000a1', 'PB-TST70', 'publisher', 'Org 70 Ltd', 'Org 70', 'org-70', 'GB', 'verified');
insert into public.books (id, org_id, slug, title, rights_status) values
  ('a7000000-0000-0000-0000-0000000000b1', 'a7000000-0000-0000-0000-0000000000a1', 'book-70', 'Book 70', 'public_domain');

-- c1 a live demo title in weeks, c2 a live paid title, c3 a draft demo.
insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, depth, status, badge, is_demo, price_point_id) values
  ('a7000000-0000-0000-0000-0000000000c1', 'AK-T70A0', 'a7000000-0000-0000-0000-0000000000b1', 'a7000000-0000-0000-0000-0000000000a1',
   'wb-70-demo', 'Workbook 70 demo', 'Card', 'productivity', 'full', 'live', 'demo', true, 'p2'),
  ('a7000000-0000-0000-0000-0000000000c2', 'AK-T70B0', 'a7000000-0000-0000-0000-0000000000b1', 'a7000000-0000-0000-0000-0000000000a1',
   'wb-70-paid', 'Workbook 70 paid', 'Card', 'productivity', 'full', 'live', 'official', false, 'p2'),
  ('a7000000-0000-0000-0000-0000000000c3', 'AK-T70C0', 'a7000000-0000-0000-0000-0000000000b1', 'a7000000-0000-0000-0000-0000000000a1',
   'wb-70-draft', 'Workbook 70 draft', 'Card', 'productivity', 'full', 'draft', 'demo', true, 'p2');
insert into public.workbook_versions (id, workbook_id, semver, content, content_hash, published_at) values
  ('a7000000-0000-0000-0000-0000000000d1', 'a7000000-0000-0000-0000-0000000000c1', '1.0.0', '{"structure":{"unit":"week","count":4}}'::jsonb, repeat('a', 64), now()),
  ('a7000000-0000-0000-0000-0000000000d2', 'a7000000-0000-0000-0000-0000000000c2', '1.0.0', '{"structure":{"unit":"part","count":3}}'::jsonb, repeat('b', 64), now()),
  ('a7000000-0000-0000-0000-0000000000d3', 'a7000000-0000-0000-0000-0000000000c3', '1.0.0', '{"structure":{"unit":"week","count":2}}'::jsonb, repeat('c', 64), now());
update public.workbooks set current_version_id = 'a7000000-0000-0000-0000-0000000000d1' where id = 'a7000000-0000-0000-0000-0000000000c1';
update public.workbooks set current_version_id = 'a7000000-0000-0000-0000-0000000000d2' where id = 'a7000000-0000-0000-0000-0000000000c2';

-- Sections as publish_version writes them: listing, start and unit 1 free.
insert into public.workbook_sections (version_id, kind, unit_number, body, free) values
  ('a7000000-0000-0000-0000-0000000000d1', 'listing', null, '{}'::jsonb, true),
  ('a7000000-0000-0000-0000-0000000000d1', 'start',   null, '{}'::jsonb, true),
  ('a7000000-0000-0000-0000-0000000000d1', 'unit',    1,    '{"number": 1}'::jsonb, true),
  ('a7000000-0000-0000-0000-0000000000d1', 'unit',    2,    '{"number": 2}'::jsonb, false),
  ('a7000000-0000-0000-0000-0000000000d1', 'unit',    3,    '{"number": 3}'::jsonb, false),
  ('a7000000-0000-0000-0000-0000000000d1', 'unit',    4,    '{"number": 4}'::jsonb, false),
  ('a7000000-0000-0000-0000-0000000000d1', 'toolkit', null, '{"cards": []}'::jsonb, false),
  ('a7000000-0000-0000-0000-0000000000d1', 'finish',  null, '{}'::jsonb, false),
  ('a7000000-0000-0000-0000-0000000000d2', 'listing', null, '{}'::jsonb, true),
  ('a7000000-0000-0000-0000-0000000000d2', 'unit',    1,    '{"number": 1}'::jsonb, true),
  ('a7000000-0000-0000-0000-0000000000d2', 'unit',    2,    '{"number": 2}'::jsonb, false),
  ('a7000000-0000-0000-0000-0000000000d3', 'unit',    1,    '{"number": 1}'::jsonb, true),
  ('a7000000-0000-0000-0000-0000000000d3', 'unit',    2,    '{"number": 2}'::jsonb, false);

-- The reader is enrolled on the demo and has finished Part 1, so the next
-- step is in Part 2. Today builds its steps from the unit sections RLS
-- returns, so Part 2 must come back for the enrolment to show on Today.
insert into public.enrolments (id, user_id, tenant_id, workbook_id, version_id) values
  ('a7000000-0000-0000-0000-0000000000e1', 'a7000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   'a7000000-0000-0000-0000-0000000000c1', 'a7000000-0000-0000-0000-0000000000d1');

-- ---------------------------------------------------------------------------
-- 1. The switch is on for the demo period
-- ---------------------------------------------------------------------------
do $$ begin
  if not app.demo_fully_open() then raise exception 'app.demo_fully_open() should be on for the demo period'; end if;
  if app.demo_open_to_reader('a7000000-0000-0000-0000-0000000000c1') then raise exception 'demo opened with nobody signed in'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. A signed-in reader with no entitlement reads the whole demo
-- ---------------------------------------------------------------------------
select test_as('a7000000-0000-0000-0000-000000000001');
do $$ declare n int; begin
  if (select app.has_entitlement(app.uid(), '00000000-0000-0000-0000-00000000000a', 'a7000000-0000-0000-0000-0000000000c1', 2)) then
    raise exception 'the reader should have no entitlement on the demo'; end if;
  select count(*) into n from public.workbook_sections where version_id = 'a7000000-0000-0000-0000-0000000000d1';
  if n <> 8 then raise exception 'signed-in reader should read all 8 demo sections, saw %', n; end if;
  select count(*) into n from public.workbook_sections s
   join public.enrolments e on e.version_id = s.version_id
   where e.id = 'a7000000-0000-0000-0000-0000000000e1' and s.kind = 'unit' and s.unit_number = 2;
  if n <> 1 then raise exception 'Part 2 of the enrolled demo should open for Today, saw %', n; end if;
  -- The paid title stays gated.
  select count(*) into n from public.workbook_sections where version_id = 'a7000000-0000-0000-0000-0000000000d2' and kind = 'unit' and unit_number = 2;
  if n <> 0 then raise exception 'paid unit 2 opened with no entitlement, %', n; end if;
  -- A demo that is not public stays closed.
  select count(*) into n from public.workbook_sections where version_id = 'a7000000-0000-0000-0000-0000000000d3';
  if n <> 0 then raise exception 'a draft demo opened, %', n; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. Anonymous readers keep the free try: listing, start and Part 1 only
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
set local role anon;
do $$ declare n int; begin
  select count(*) into n from public.workbook_sections where version_id = 'a7000000-0000-0000-0000-0000000000d1';
  if n <> 3 then raise exception 'anonymous should read listing, start and Part 1 of the demo, saw %', n; end if;
  select count(*) into n from public.workbook_sections where version_id = 'a7000000-0000-0000-0000-0000000000d1' and kind = 'unit' and unit_number = 2;
  if n <> 0 then raise exception 'anonymous read demo Part 2'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. A demo still cannot be bought
-- ---------------------------------------------------------------------------
do $$ begin
  begin
    insert into public.purchases (user_id, tenant_id, workbook_id, kind, price_point_id, stripe_checkout_session_id, currency)
    values ('a7000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
            'a7000000-0000-0000-0000-0000000000c1', 'workbook', 'p2', 'cs_test_demo_70', 'GBP');
    raise exception 'a purchase of a demo was accepted';
  exception when check_violation then null; end;
end $$;

rollback;
