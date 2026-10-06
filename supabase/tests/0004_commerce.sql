-- Commerce: price points, purchases, entitlements and the entitlement-gated
-- section read (F-093, F-095, F-096, F-114, F-131). Each block must raise or
-- return the expected count; a failure aborts the script and the CI step.
\set ON_ERROR_STOP on

begin;

-- Two readers with no memberships, a staff account, and an organisation that
-- owns one live paid title and one live demo title.
insert into auth.users (id, email) values
  ('55555555-5555-5555-5555-555555555555', 'reader-a@test'),
  ('66666666-6666-6666-6666-666666666666', 'reader-b@test'),
  ('77777777-7777-7777-7777-777777777777', 'staff@test');

insert into public.organisations (id, kind, legal_name, display_name, slug, country) values
  ('dddddddd-0000-0000-0000-000000000001', 'publisher', 'Org D Ltd', 'Org D', 'org-d', 'GB');
insert into public.authors (id, code, org_id, slug, display_name, country) values
  ('dddddddd-0000-0000-0000-0000000000d1', 'AU-TESTD', 'dddddddd-0000-0000-0000-000000000001', 'author-d', 'Author D', 'GB');
insert into public.books (id, org_id, slug, title) values
  ('dddddddd-0000-0000-0000-0000000000d2', 'dddddddd-0000-0000-0000-000000000001', 'book-d', 'Book D');
insert into public.book_contributors (book_id, author_id, role) values
  ('dddddddd-0000-0000-0000-0000000000d2', 'dddddddd-0000-0000-0000-0000000000d1', 'author');

insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, depth, status, badge, is_demo, price_point_id) values
  ('dddddddd-0000-0000-0000-0000000000d4', 'AK-PA1DD', 'dddddddd-0000-0000-0000-0000000000d2', 'dddddddd-0000-0000-0000-000000000001',
   'workbook-paid', 'Paid Workbook', 'Card', 'productivity', 'full', 'live', 'official', false, 'p2'),
  ('dddddddd-0000-0000-0000-0000000000d5', 'AK-DEM0D', 'dddddddd-0000-0000-0000-0000000000d2', 'dddddddd-0000-0000-0000-000000000001',
   'workbook-demo', 'Demo Workbook', 'Card', 'productivity', 'full', 'live', 'demo', true, 'p2');

insert into public.workbook_versions (id, workbook_id, semver, content, content_hash, published_at) values
  ('dddddddd-0000-0000-0000-0000000000d6', 'dddddddd-0000-0000-0000-0000000000d4', '1.0.0', '{"schema_version": "3.0"}'::jsonb, repeat('d', 64), now());
update public.workbooks set current_version_id = 'dddddddd-0000-0000-0000-0000000000d6' where id = 'dddddddd-0000-0000-0000-0000000000d4';

-- Sections written the way publish_version writes them: listing, start and
-- unit 1 free; unit 2, unit 3 and toolkit paid.
insert into public.workbook_sections (version_id, kind, unit_number, body, free) values
  ('dddddddd-0000-0000-0000-0000000000d6', 'listing', null, '{"code": "AK-PA1DD"}'::jsonb, true),
  ('dddddddd-0000-0000-0000-0000000000d6', 'start',   null, '{}'::jsonb, true),
  ('dddddddd-0000-0000-0000-0000000000d6', 'unit',    1,    '{"number": 1}'::jsonb, true),
  ('dddddddd-0000-0000-0000-0000000000d6', 'unit',    2,    '{"number": 2}'::jsonb, false),
  ('dddddddd-0000-0000-0000-0000000000d6', 'unit',    3,    '{"number": 3}'::jsonb, false),
  ('dddddddd-0000-0000-0000-0000000000d6', 'toolkit', null, '{"cards": []}'::jsonb, false);

-- The ladder is seeded with empty amounts and nothing active (D1 to D4 open).
do $$ declare n int; begin
  select count(*) into n from public.price_points;
  if n <> 8 then raise exception 'expected 8 price points, saw %', n; end if;
  select count(*) into n from public.price_points where amounts <> '{}'::jsonb or active;
  if n <> 0 then raise exception 'a price point has figures or is active before Crent set them'; end if;
  begin
    update public.price_points set active = true where id = 'p1';
    raise exception 'a price point went active with no amounts';
  exception when check_violation then null; end;
end $$;

-- Helper for this file: act as the service role the way PostgREST does for
-- the admin client (role switched and the JWT role claim set).
create or replace function pg_temp.as_service() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "service_role"}'::text, true);
  execute 'set local role service_role';
end $$;

-- ---------------------------------------------------------------------------
-- Reader A without an entitlement sees the free sections and nothing paid.
-- ---------------------------------------------------------------------------
savepoint s1;
select test_as('55555555-5555-5555-5555-555555555555');
do $$ declare n int; begin
  select count(*) into n from public.workbook_sections where kind = 'unit' and unit_number = 1;
  if n <> 1 then raise exception 'reader A should read free unit 1, saw %', n; end if;
  select count(*) into n from public.workbook_sections where kind = 'unit' and unit_number = 2;
  if n <> 0 then raise exception 'reader A read paid unit 2 with no entitlement, %', n; end if;
  select count(*) into n from public.workbook_sections where kind = 'toolkit';
  if n <> 0 then raise exception 'reader A read the toolkit with no entitlement, %', n; end if;
  if (select app.has_entitlement(app.uid(), '00000000-0000-0000-0000-00000000000a', 'dddddddd-0000-0000-0000-0000000000d4', 2)) then
    raise exception 'has_entitlement said yes with no rows'; end if;
  -- no client write path for purchases or entitlements
  begin
    insert into public.purchases (user_id, tenant_id, workbook_id, kind, stripe_checkout_session_id, currency)
    values (app.uid(), '00000000-0000-0000-0000-00000000000a', 'dddddddd-0000-0000-0000-0000000000d4', 'workbook', 'cs_test_client', 'GBP');
    raise exception 'reader A inserted a purchase from the client';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.entitlements (user_id, tenant_id, workbook_id, source)
    values (app.uid(), '00000000-0000-0000-0000-00000000000a', 'dddddddd-0000-0000-0000-0000000000d4', 'purchase');
    raise exception 'reader A inserted an entitlement from the client';
  exception when insufficient_privilege then null; end;
end $$;

-- The checkout route (service role) records a pending purchase. A demo title
-- is refused at the table (F-114).
reset role;
select pg_temp.as_service();
insert into public.purchases (id, user_id, tenant_id, workbook_id, kind, price_point_id, stripe_checkout_session_id, currency) values
  ('ffffffff-0000-0000-0000-0000000000f1', '55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-00000000000a',
   'dddddddd-0000-0000-0000-0000000000d4', 'workbook', 'p2', 'cs_test_paid_1', 'GBP');
do $$ begin
  begin
    insert into public.purchases (user_id, tenant_id, workbook_id, kind, stripe_checkout_session_id, currency) values
      ('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-00000000000a',
       'dddddddd-0000-0000-0000-0000000000d5', 'workbook', 'cs_test_demo', 'GBP');
    raise exception 'a purchase was created for a demo workbook';
  exception when check_violation then null; end;
  -- a membership purchase carries no workbook; a workbook purchase must
  begin
    insert into public.purchases (user_id, tenant_id, workbook_id, kind, stripe_checkout_session_id, currency) values
      ('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-00000000000a', null, 'workbook', 'cs_test_nowb', 'GBP');
    raise exception 'a workbook purchase was created without a workbook';
  exception when check_violation then null; end;
end $$;

-- A plain authenticated caller may not grant, even for their own purchase.
reset role;
select test_as('55555555-5555-5555-5555-555555555555');
do $$ begin
  begin
    perform app.grant_purchase_entitlement('ffffffff-0000-0000-0000-0000000000f1');
    raise exception 'a reader granted their own entitlement';
  exception when insufficient_privilege then null; end;
  begin
    perform app.revoke_purchase_entitlement('ffffffff-0000-0000-0000-0000000000f1');
    raise exception 'a reader revoked an entitlement';
  exception when insufficient_privilege then null; end;
end $$;

-- A plain authenticated caller cannot reach the public RPC wrappers either.
do $$ begin
  begin
    perform public.grant_purchase_entitlement('ffffffff-0000-0000-0000-0000000000f1');
    raise exception 'a reader executed the grant wrapper';
  exception when insufficient_privilege then null; end;
end $$;

-- The webhook (service role) grants through the public wrapper, as the admin
-- client's rpc() does. A second call changes nothing.
reset role;
select pg_temp.as_service();
do $$ declare e1 uuid; e2 uuid; n int; t1 timestamptz; t2 timestamptz; begin
  e1 := public.grant_purchase_entitlement('ffffffff-0000-0000-0000-0000000000f1', 'pi_test_1', null, 1200, 200, 'gbp');
  select paid_at into t1 from public.purchases where id = 'ffffffff-0000-0000-0000-0000000000f1';
  if t1 is null then raise exception 'purchase not marked paid'; end if;
  if (select status from public.purchases where id = 'ffffffff-0000-0000-0000-0000000000f1') <> 'paid' then raise exception 'status not paid'; end if;
  if (select currency from public.purchases where id = 'ffffffff-0000-0000-0000-0000000000f1') <> 'GBP' then raise exception 'currency not upper-cased'; end if;
  perform pg_sleep(0.01);
  e2 := app.grant_purchase_entitlement('ffffffff-0000-0000-0000-0000000000f1', 'pi_test_1', null, 1200, 200, 'gbp');
  if e1 <> e2 then raise exception 'second grant made a second entitlement'; end if;
  select paid_at into t2 from public.purchases where id = 'ffffffff-0000-0000-0000-0000000000f1';
  if t1 <> t2 then raise exception 'second grant moved paid_at'; end if;
  select count(*) into n from public.entitlements where purchase_id = 'ffffffff-0000-0000-0000-0000000000f1';
  if n <> 1 then raise exception 'expected 1 entitlement, saw %', n; end if;
end $$;
reset role;
do $$ declare n int; begin
  select count(*) into n from public.audit_log where action = 'commerce.grant_entitlement';
  if n <> 1 then raise exception 'expected 1 grant audit row, saw %', n; end if;
end $$;

-- Reader A now reads unit 2 and the toolkit; reader B still cannot.
reset role;
select test_as('55555555-5555-5555-5555-555555555555');
do $$ declare n int; begin
  select count(*) into n from public.workbook_sections where kind = 'unit' and unit_number = 2;
  if n <> 1 then raise exception 'entitled reader A could not read unit 2, %', n; end if;
  select count(*) into n from public.workbook_sections where kind = 'toolkit';
  if n <> 1 then raise exception 'entitled reader A could not read the toolkit, %', n; end if;
  select count(*) into n from public.workbook_sections;
  if n <> 6 then raise exception 'entitled reader A should see all 6 sections, saw %', n; end if;
  select count(*) into n from public.purchases;
  if n <> 1 then raise exception 'reader A should see their 1 purchase, saw %', n; end if;
  select count(*) into n from public.entitlements;
  if n <> 1 then raise exception 'reader A should see their 1 entitlement, saw %', n; end if;
end $$;
select test_as('66666666-6666-6666-6666-666666666666');
do $$ declare n int; begin
  select count(*) into n from public.workbook_sections where kind = 'unit' and unit_number = 2;
  if n <> 0 then raise exception 'reader B read unit 2 on A''s entitlement, %', n; end if;
  select count(*) into n from public.purchases;
  if n <> 0 then raise exception 'reader B saw another reader''s purchases, %', n; end if;
  select count(*) into n from public.entitlements;
  if n <> 0 then raise exception 'reader B saw another reader''s entitlements, %', n; end if;
end $$;

-- Staff read purchases and entitlements for support.
select test_as('77777777-7777-7777-7777-777777777777', array['support']);
do $$ declare n int; begin
  select count(*) into n from public.purchases;
  if n <> 1 then raise exception 'staff should see 1 purchase, saw %', n; end if;
  select count(*) into n from public.entitlements;
  if n <> 1 then raise exception 'staff should see 1 entitlement, saw %', n; end if;
end $$;

-- Lapsed: an ends_at in the past means read only. The row stays; the gate closes.
reset role;
update public.entitlements set ends_at = now() - interval '1 day' where purchase_id = 'ffffffff-0000-0000-0000-0000000000f1';
select test_as('55555555-5555-5555-5555-555555555555');
do $$ declare n int; begin
  select count(*) into n from public.workbook_sections where kind = 'unit' and unit_number = 2;
  if n <> 0 then raise exception 'lapsed reader A still read unit 2, %', n; end if;
  select count(*) into n from public.workbook_sections where kind = 'unit' and unit_number = 1;
  if n <> 1 then raise exception 'lapsed reader A lost the free unit, %', n; end if;
end $$;
reset role;
update public.entitlements set ends_at = null where purchase_id = 'ffffffff-0000-0000-0000-0000000000f1';

-- Refund: revoke is idempotent, closes the gate, and grant refuses afterwards.
select pg_temp.as_service();
do $$ declare n int; begin
  n := public.revoke_purchase_entitlement('ffffffff-0000-0000-0000-0000000000f1', 'charge.refunded');
  if n <> 1 then raise exception 'expected 1 entitlement revoked, got %', n; end if;
  n := app.revoke_purchase_entitlement('ffffffff-0000-0000-0000-0000000000f1', 'charge.refunded');
  if n <> 0 then raise exception 'second revoke revoked again, %', n; end if;
  if (select status from public.purchases where id = 'ffffffff-0000-0000-0000-0000000000f1') <> 'refunded' then raise exception 'purchase not refunded'; end if;
  begin
    perform app.grant_purchase_entitlement('ffffffff-0000-0000-0000-0000000000f1');
    raise exception 'a refunded purchase was granted again';
  exception when object_not_in_prerequisite_state then null; end;
end $$;
reset role;
do $$ declare n int; begin
  select count(*) into n from public.audit_log where action = 'commerce.revoke_entitlement';
  if n <> 1 then raise exception 'expected 1 revoke audit row, saw %', n; end if;
end $$;
select test_as('55555555-5555-5555-5555-555555555555');
do $$ declare n int; begin
  select count(*) into n from public.workbook_sections where kind = 'unit' and unit_number = 2;
  if n <> 0 then raise exception 'refunded reader A still read unit 2, %', n; end if;
end $$;

-- Library wide: a membership purchase grants a row with no workbook, and the
-- same paid unit opens through it.
reset role;
select pg_temp.as_service();
insert into public.purchases (id, user_id, tenant_id, workbook_id, kind, price_point_id, stripe_checkout_session_id, currency) values
  ('ffffffff-0000-0000-0000-0000000000f2', '55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-00000000000a',
   null, 'membership', 'member_month', 'cs_test_member_1', 'GBP');
do $$ declare e uuid; begin
  e := app.grant_purchase_entitlement('ffffffff-0000-0000-0000-0000000000f2', null, 'sub_test_1', 900, 150, 'GBP');
  if (select workbook_id from public.entitlements where id = e) is not null then raise exception 'membership entitlement carries a workbook'; end if;
  if (select source from public.entitlements where id = e) <> 'membership' then raise exception 'membership entitlement has the wrong source'; end if;
end $$;
reset role;
select test_as('55555555-5555-5555-5555-555555555555');
do $$ declare n int; begin
  select count(*) into n from public.workbook_sections where kind = 'unit' and unit_number = 3;
  if n <> 1 then raise exception 'library-wide entitlement did not open unit 3, %', n; end if;
  if not (select app.has_entitlement(app.uid(), '00000000-0000-0000-0000-00000000000a', 'dddddddd-0000-0000-0000-0000000000d4', 3)) then
    raise exception 'has_entitlement said no with a library-wide row'; end if;
  -- the same account on another tenant has nothing
  if (select app.has_entitlement(app.uid(), gen_random_uuid(), 'dddddddd-0000-0000-0000-0000000000d4', 3)) then
    raise exception 'has_entitlement leaked across tenants'; end if;
end $$;

-- Anonymous visitors read the ladder and the free sections only.
reset role;
select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
set local role anon;
do $$ declare n int; begin
  select count(*) into n from public.price_points;
  if n <> 8 then raise exception 'anon should read 8 price points, saw %', n; end if;
  select count(*) into n from public.workbook_sections where kind = 'unit' and unit_number = 2;
  if n <> 0 then raise exception 'anon read a paid unit, %', n; end if;
  begin
    perform count(*) from public.purchases;
    raise exception 'anon read purchases';
  exception when insufficient_privilege then null; end;
  begin
    perform count(*) from public.entitlements;
    raise exception 'anon read entitlements';
  exception when insufficient_privilege then null; end;
end $$;
rollback to savepoint s1;

rollback;
\echo PASS 0004_commerce
