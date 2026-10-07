-- Dashboards, account lookup and notice and takedown (0022): suppression of
-- small counts in the author dashboard and the roll-up, who may read money
-- and counts, the audited account lookup, and the takedown flow end to end.
-- Each block must raise or return the expected count; a failure aborts the
-- script and the CI step.
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('a2200000-0000-0000-0000-000000000001', 'owner22@test'),
  ('a2200000-0000-0000-0000-000000000002', 'author22@test'),
  ('a2200000-0000-0000-0000-000000000003', 'viewer22@test'),
  ('a2200000-0000-0000-0000-000000000004', 'support22@test'),
  ('a2200000-0000-0000-0000-000000000005', 'editor22@test'),
  ('a2200000-0000-0000-0000-000000000006', 'Reader22@Test.example'),
  ('a2200000-0000-0000-0000-000000000007', 'finance22@test'),
  ('a2200000-0000-0000-0000-000000000008', 'other22@test'),
  ('a2200000-0000-0000-0000-000000000009', 'orgeditor22@test');
insert into public.platform_roles (user_id, role) values
  ('a2200000-0000-0000-0000-000000000004', 'support'),
  ('a2200000-0000-0000-0000-000000000005', 'editor'),
  ('a2200000-0000-0000-0000-000000000007', 'finance');

insert into public.organisations (id, code, kind, legal_name, display_name, slug, country, connect_status) values
  ('a2200000-0000-0000-0000-0000000000a1', 'PB-TST22', 'publisher', 'Org 22 Ltd', 'Org 22', 'org-22', 'GB', 'verified'),
  ('a2200000-0000-0000-0000-0000000000a2', 'PB-TSV22', 'publisher', 'Other 22 Ltd', 'Other 22', 'other-22', 'GB', 'verified');
insert into public.org_members (org_id, user_id, role) values
  ('a2200000-0000-0000-0000-0000000000a1', 'a2200000-0000-0000-0000-000000000001', 'owner'),
  ('a2200000-0000-0000-0000-0000000000a1', 'a2200000-0000-0000-0000-000000000002', 'author'),
  ('a2200000-0000-0000-0000-0000000000a1', 'a2200000-0000-0000-0000-000000000003', 'viewer'),
  ('a2200000-0000-0000-0000-0000000000a1', 'a2200000-0000-0000-0000-000000000009', 'editor'),
  ('a2200000-0000-0000-0000-0000000000a2', 'a2200000-0000-0000-0000-000000000008', 'owner');

insert into public.imprints (id, org_id, name) values
  ('a2200000-0000-0000-0000-0000000000f1', 'a2200000-0000-0000-0000-0000000000a1', 'Imprint One');
insert into public.authors (id, org_id, slug, display_name) values
  ('a2200000-0000-0000-0000-0000000000e1', 'a2200000-0000-0000-0000-0000000000a1', 'author-x-22', 'Author X'),
  ('a2200000-0000-0000-0000-0000000000e2', 'a2200000-0000-0000-0000-0000000000a1', 'author-y-22', 'Author Y');
-- Public-domain books, so the licence gate (0013) does not stand in the way.
insert into public.books (id, org_id, slug, title, rights_status, imprint_id) values
  ('a2200000-0000-0000-0000-0000000000b1', 'a2200000-0000-0000-0000-0000000000a1', 'book-22a', 'Book 22A', 'public_domain', 'a2200000-0000-0000-0000-0000000000f1'),
  ('a2200000-0000-0000-0000-0000000000b2', 'a2200000-0000-0000-0000-0000000000a1', 'book-22b', 'Book 22B', 'public_domain', null),
  ('a2200000-0000-0000-0000-0000000000b3', 'a2200000-0000-0000-0000-0000000000a1', 'book-22c', 'Book 22C', 'public_domain', null);
insert into public.book_contributors (book_id, author_id, role) values
  ('a2200000-0000-0000-0000-0000000000b1', 'a2200000-0000-0000-0000-0000000000e1', 'author'),
  ('a2200000-0000-0000-0000-0000000000b2', 'a2200000-0000-0000-0000-0000000000e1', 'author'),
  ('a2200000-0000-0000-0000-0000000000b3', 'a2200000-0000-0000-0000-0000000000e2', 'author');

-- wa and wb belong to Author X, wc to Author Y. All live.
insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, safety_tier, depth, status) values
  ('a2200000-0000-0000-0000-0000000000c1', 'AK-T22A0', 'a2200000-0000-0000-0000-0000000000b1', 'a2200000-0000-0000-0000-0000000000a1',
   'wb-22a', 'Workbook 22A', 'Card', 'productivity', 'none', 'full', 'live'),
  ('a2200000-0000-0000-0000-0000000000c2', 'AK-T22B0', 'a2200000-0000-0000-0000-0000000000b2', 'a2200000-0000-0000-0000-0000000000a1',
   'wb-22b', 'Workbook 22B', 'Card', 'productivity', 'none', 'full', 'live'),
  ('a2200000-0000-0000-0000-0000000000c3', 'AK-T22C0', 'a2200000-0000-0000-0000-0000000000b3', 'a2200000-0000-0000-0000-0000000000a1',
   'wb-22c', 'Workbook 22C', 'Card', 'productivity', 'none', 'full', 'live');

-- August 2026: wa 15 views, wb 3 views, wc 12 views. September: wa 11 views.
insert into public.funnel_counts (day, event, tenant_id, workbook_id, n) values
  ('2026-08-03', 'page_view', '00000000-0000-0000-0000-00000000000a', 'a2200000-0000-0000-0000-0000000000c1', 9),
  ('2026-08-20', 'page_view', '00000000-0000-0000-0000-00000000000a', 'a2200000-0000-0000-0000-0000000000c1', 6),
  ('2026-08-04', 'page_view', '00000000-0000-0000-0000-00000000000a', 'a2200000-0000-0000-0000-0000000000c2', 3),
  ('2026-08-05', 'page_view', '00000000-0000-0000-0000-00000000000a', 'a2200000-0000-0000-0000-0000000000c3', 12),
  ('2026-09-01', 'page_view', '00000000-0000-0000-0000-00000000000a', 'a2200000-0000-0000-0000-0000000000c1', 11),
  ('2026-08-05', 'free_week_started', '00000000-0000-0000-0000-00000000000a', 'a2200000-0000-0000-0000-0000000000c1', 4);

-- Ten readers each finish week one of wa in August (first check-in on unit 1).
insert into auth.users (id, email)
select ('a2200000-0000-0000-0001-' || lpad(g::text, 12, '0'))::uuid, 'r' || g || '@t22' from generate_series(1, 10) g;
insert into public.workbook_versions (id, workbook_id, semver, content, content_hash) values
  ('a2200000-0000-0000-0000-0000000000d1', 'a2200000-0000-0000-0000-0000000000c1', '1.0.0', '{}'::jsonb, repeat('a', 64));
insert into public.enrolments (id, user_id, tenant_id, workbook_id, version_id)
select ('a2200000-0000-0000-0002-' || lpad(g::text, 12, '0'))::uuid, ('a2200000-0000-0000-0001-' || lpad(g::text, 12, '0'))::uuid,
       '00000000-0000-0000-0000-00000000000a', 'a2200000-0000-0000-0000-0000000000c1', 'a2200000-0000-0000-0000-0000000000d1'
  from generate_series(1, 10) g;
insert into public.progress_events (enrolment_id, kind, ref, at)
select ('a2200000-0000-0000-0002-' || lpad(g::text, 12, '0'))::uuid, 'checkin_done', '1', '2026-08-10 12:00+00' from generate_series(1, 10) g;
-- A second check-in on unit 1 by reader 1 in September must not count again.
insert into public.progress_events (enrolment_id, kind, ref, at) values
  ('a2200000-0000-0000-0002-000000000001', 'checkin_done', '1', '2026-09-10 12:00+00'),
  ('a2200000-0000-0000-0002-000000000001', 'finished', null, '2026-09-11 12:00+00');

-- The reader who will be looked up and who buys wa.
insert into public.purchases (id, user_id, tenant_id, workbook_id, kind, stripe_checkout_session_id, currency, amount_minor, status, paid_at) values
  ('a2200000-0000-0000-0000-000000000901', 'a2200000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-00000000000a',
   'a2200000-0000-0000-0000-0000000000c1', 'workbook', 'cs_test_22a', 'GBP', 999, 'paid', '2026-08-12 10:00+00');
insert into public.entitlements (id, user_id, tenant_id, workbook_id, source, purchase_id) values
  ('a2200000-0000-0000-0000-000000000911', 'a2200000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-00000000000a',
   'a2200000-0000-0000-0000-0000000000c1', 'purchase', 'a2200000-0000-0000-0000-000000000901');
-- The reader also bought wc, for the takedown where buyers lose access.
insert into public.purchases (id, user_id, tenant_id, workbook_id, kind, stripe_checkout_session_id, currency, amount_minor, status, paid_at) values
  ('a2200000-0000-0000-0000-000000000902', 'a2200000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-00000000000a',
   'a2200000-0000-0000-0000-0000000000c3', 'workbook', 'cs_test_22c', 'GBP', 999, 'paid', '2026-08-12 10:00+00');
insert into public.entitlements (id, user_id, tenant_id, workbook_id, source, purchase_id) values
  ('a2200000-0000-0000-0000-000000000912', 'a2200000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-00000000000a',
   'a2200000-0000-0000-0000-0000000000c3', 'purchase', 'a2200000-0000-0000-0000-000000000902');
-- Ledger lines (0021): a sale of wa and a sale of wc in August, test mode.
insert into public.royalty_lines (org_id, workbook_id, kind, period, currency, livemode, units, gross_minor, tax_minor, net_base_minor,
                                  rate, author_minor, akana_minor, is_placeholder_rate, idem_key, occurred_at) values
  ('a2200000-0000-0000-0000-0000000000a1', 'a2200000-0000-0000-0000-0000000000c1', 'sale', '2026-08', 'GBP', false, 1, 999, 167, 832,
   0.5, 416, 416, true, 'test22:sale:a', '2026-08-12 10:00+00'),
  ('a2200000-0000-0000-0000-0000000000a1', 'a2200000-0000-0000-0000-0000000000c3', 'sale', '2026-08', 'GBP', false, 1, 999, 167, 832,
   0.5, 416, 416, true, 'test22:sale:c', '2026-08-12 10:00+00');

-- Something sealed the lookup must never return.
insert into public.enrolments (id, user_id, tenant_id, workbook_id, version_id) values
  ('a2200000-0000-0000-0000-000000000921', 'a2200000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-00000000000a',
   'a2200000-0000-0000-0000-0000000000c1', 'a2200000-0000-0000-0000-0000000000d1');
insert into public.answers (enrolment_id, field, sealed, key_id) values
  ('a2200000-0000-0000-0000-000000000921', 'exercise:x.y', 'v2.k1.SECRETCIPHERTEXT', 'k1');

create or replace function pg_temp.as_anon() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "anon"}'::text, true);
  execute 'set local role anon';
end $$;

-- ---------------------------------------------------------------------------
-- 1. Author dashboard (F-042): monthly, suppressed below 10, zero included.
-- ---------------------------------------------------------------------------
select test_as('a2200000-0000-0000-0000-000000000002');
do $$ declare r record; n int; begin
  select * into r from public.org_dashboard('a2200000-0000-0000-0000-0000000000a1', '2026-08-01', '2026-09-30')
   where month = '2026-08-01' and workbook_code = 'AK-T22A0' and metric = 'listing_views';
  if r.n is distinct from 15 or r.suppressed then raise exception 'wa August views should be 15, got % %', r.n, r.suppressed; end if;
  select * into r from public.org_dashboard('a2200000-0000-0000-0000-0000000000a1', '2026-08-01', '2026-09-30')
   where month = '2026-08-01' and workbook_code = 'AK-T22B0' and metric = 'listing_views';
  if r.n is not null or not r.suppressed then raise exception 'wb August views (3) must be suppressed'; end if;
  select * into r from public.org_dashboard('a2200000-0000-0000-0000-0000000000a1', '2026-08-01', '2026-09-30')
   where month = '2026-08-01' and workbook_code = 'AK-T22A0' and metric = 'free_weeks_started';
  if r.n is not null or not r.suppressed then raise exception 'wa free weeks (4) must be suppressed'; end if;
  select * into r from public.org_dashboard('a2200000-0000-0000-0000-0000000000a1', '2026-08-01', '2026-09-30')
   where month = '2026-08-01' and workbook_code = 'AK-T22A0' and metric = 'finished_week_one';
  if r.n is distinct from 10 then raise exception 'wa week one finishers should be 10, got %', r.n; end if;
  select * into r from public.org_dashboard('a2200000-0000-0000-0000-0000000000a1', '2026-08-01', '2026-09-30')
   where month = '2026-09-01' and workbook_code = 'AK-T22A0' and metric = 'finished_week_one';
  if not r.suppressed then raise exception 'a repeat check-in counted again'; end if;
  select * into r from public.org_dashboard('a2200000-0000-0000-0000-0000000000a1', '2026-08-01', '2026-09-30')
   where month = '2026-09-01' and workbook_code = 'AK-T22B0' and metric = 'purchases';
  if r.n is not null or not r.suppressed then raise exception 'a zero must show as suppressed'; end if;
  -- every workbook, month and metric has a row: 3 workbooks x 2 months x 5 metrics
  select count(*) into n from public.org_dashboard('a2200000-0000-0000-0000-0000000000a1', '2026-08-01', '2026-09-30');
  if n <> 30 then raise exception 'expected 30 dashboard rows, got %', n; end if;
  -- no small number ever leaves the database
  if exists (select 1 from public.org_dashboard('a2200000-0000-0000-0000-0000000000a1', '2026-01-01', '2026-12-31') d where d.n < 10) then
    raise exception 'a count under 10 was returned';
  end if;
  begin
    perform public.org_dashboard('a2200000-0000-0000-0000-0000000000a1', '2024-01-01', '2026-12-31');
    raise exception 'a 36 month range was accepted';
  exception when sqlstate 'AKD02' then null; end;
  begin
    perform public.org_dashboard('a2200000-0000-0000-0000-0000000000a2', '2026-08-01', '2026-09-30');
    raise exception 'an author read another organisation';
  exception when sqlstate 'AKD01' then null; end;
  -- the raw counts are not reachable
  begin
    perform app.dashboard_raw('a2200000-0000-0000-0000-0000000000a1', '2026-08-01', '2026-09-30');
    raise exception 'a member called the raw counts';
  exception when insufficient_privilege then null; end;
  -- the author reads earnings (statements read), exact, from the ledger view
  select * into r from public.org_earnings('a2200000-0000-0000-0000-0000000000a1', '2026-08-01', '2026-09-30')
   where workbook_code = 'AK-T22A0';
  if r.author_minor is distinct from 416 or r.units <> 1 or r.livemode or not r.has_placeholder_rate then
    raise exception 'wa earnings wrong: % % %', r.author_minor, r.units, r.livemode;
  end if;
  if (select count(*) from public.org_earnings('a2200000-0000-0000-0000-0000000000a1', '2026-09-01', '2026-09-30')) <> 0 then
    raise exception 'September should have no earnings';
  end if;
  -- an author is not a roll-up reader
  begin
    perform public.publisher_rollup_counts('a2200000-0000-0000-0000-0000000000a1', '2026-08-01', '2026-09-30');
    raise exception 'an author read the roll-up';
  exception when sqlstate 'AKD01' then null; end;
end $$;
reset role;

select test_as('a2200000-0000-0000-0000-000000000003');
do $$ begin
  begin
    perform public.org_dashboard('a2200000-0000-0000-0000-0000000000a1', '2026-08-01', '2026-09-30');
    raise exception 'a viewer read the dashboard';
  exception when sqlstate 'AKD01' then null; end;
  begin
    perform public.org_earnings('a2200000-0000-0000-0000-0000000000a1', '2026-08-01', '2026-09-30');
    raise exception 'a viewer read earnings';
  exception when sqlstate 'AKD01' then null; end;
end $$;
reset role;

-- An organisation editor reads counts but not money.
select test_as('a2200000-0000-0000-0000-000000000009');
do $$ begin
  perform public.org_dashboard('a2200000-0000-0000-0000-0000000000a1', '2026-08-01', '2026-09-30');
  begin
    perform public.org_earnings('a2200000-0000-0000-0000-0000000000a1', '2026-08-01', '2026-09-30');
    raise exception 'an org editor read earnings';
  exception when sqlstate 'AKD01' then null; end;
end $$;
reset role;

-- Support staff do not read dashboards; finance staff do.
select test_as('a2200000-0000-0000-0000-000000000004', array['support']);
do $$ begin
  begin
    perform public.org_dashboard('a2200000-0000-0000-0000-0000000000a1', '2026-08-01', '2026-09-30');
    raise exception 'support read a dashboard';
  exception when sqlstate 'AKD01' then null; end;
end $$;
reset role;
select test_as('a2200000-0000-0000-0000-000000000007', array['finance']);
do $$ begin
  perform public.org_dashboard('a2200000-0000-0000-0000-0000000000a1', '2026-08-01', '2026-09-30');
  perform public.publisher_rollup_earnings('a2200000-0000-0000-0000-0000000000a1', '2026-08-01', '2026-09-30');
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 2. Publisher roll-up (F-058): a total hides when any part is 1 to 9.
-- ---------------------------------------------------------------------------
select test_as('a2200000-0000-0000-0000-000000000001');
do $$ declare r record; begin
  -- Author X in August: wa 15 + wb 3 = 18, but wb is 3, so hidden.
  select * into r from public.publisher_rollup_counts('a2200000-0000-0000-0000-0000000000a1', '2026-08-01', '2026-09-30')
   where month = '2026-08-01' and scope = 'author' and author_name = 'Author X' and metric = 'listing_views';
  if r.n is not null or not r.suppressed then raise exception 'Author X total must hide the 3 inside it'; end if;
  if r.workbooks <> 2 then raise exception 'Author X should have 2 workbooks, got %', r.workbooks; end if;
  -- Author Y in August: wc 12, shown.
  select * into r from public.publisher_rollup_counts('a2200000-0000-0000-0000-0000000000a1', '2026-08-01', '2026-09-30')
   where month = '2026-08-01' and scope = 'author' and author_name = 'Author Y' and metric = 'listing_views';
  if r.n is distinct from 12 then raise exception 'Author Y should show 12, got %', r.n; end if;
  -- Author X in September: wa 11 + wb 0 = 11, shown (a zero part gives nothing away).
  select * into r from public.publisher_rollup_counts('a2200000-0000-0000-0000-0000000000a1', '2026-08-01', '2026-09-30')
   where month = '2026-09-01' and scope = 'author' and author_name = 'Author X' and metric = 'listing_views';
  if r.n is distinct from 11 then raise exception 'Author X September should show 11, got %', r.n; end if;
  -- The organisation total in August contains wb's 3, so it hides.
  select * into r from public.publisher_rollup_counts('a2200000-0000-0000-0000-0000000000a1', '2026-08-01', '2026-09-30')
   where month = '2026-08-01' and scope = 'total' and metric = 'listing_views';
  if not r.suppressed then raise exception 'the August total must hide'; end if;
  -- Filtered to Imprint One (wa only): 15, shown.
  select * into r from public.publisher_rollup_counts('a2200000-0000-0000-0000-0000000000a1', '2026-08-01', '2026-09-30', 'a2200000-0000-0000-0000-0000000000f1')
   where month = '2026-08-01' and scope = 'total' and metric = 'listing_views';
  if r.n is distinct from 15 then raise exception 'Imprint One total should be 15, got %', r.n; end if;
  if exists (select 1 from public.publisher_rollup_counts('a2200000-0000-0000-0000-0000000000a1', '2026-01-01', '2026-12-31') d where d.n < 10) then
    raise exception 'a roll-up count under 10 was returned';
  end if;
  begin
    perform public.publisher_rollup_counts('a2200000-0000-0000-0000-0000000000a1', '2026-08-01', '2026-09-30', 'a2200000-0000-0000-0000-0000000000a1');
    raise exception 'an imprint from nowhere was accepted';
  exception when sqlstate 'AKD02' then null; end;
  if (select count(*) from public.publisher_rollup_filters('a2200000-0000-0000-0000-0000000000a1')) <> 3 then
    raise exception 'filters should list 1 imprint and 2 authors';
  end if;
  -- earnings per author and in total, exact
  select * into r from public.publisher_rollup_earnings('a2200000-0000-0000-0000-0000000000a1', '2026-08-01', '2026-09-30')
   where scope = 'author' and author_name = 'Author Y';
  if r.author_minor is distinct from 416 then raise exception 'Author Y earnings should be 416, got %', r.author_minor; end if;
  select * into r from public.publisher_rollup_earnings('a2200000-0000-0000-0000-0000000000a1', '2026-08-01', '2026-09-30')
   where scope = 'total';
  if r.author_minor is distinct from 832 then raise exception 'total earnings should be 832, got %', r.author_minor; end if;
  select * into r from public.publisher_rollup_earnings('a2200000-0000-0000-0000-0000000000a1', '2026-08-01', '2026-09-30', 'a2200000-0000-0000-0000-0000000000f1')
   where scope = 'total';
  if r.author_minor is distinct from 416 then raise exception 'Imprint One earnings should be 416, got %', r.author_minor; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. Staff account lookup (F-087)
-- ---------------------------------------------------------------------------
select test_as('a2200000-0000-0000-0000-000000000006');
do $$ begin
  begin
    perform public.staff_lookup_account('reader22@test.example', 'Checking my own account');
    raise exception 'a reader used the lookup';
  exception when sqlstate 'AKD01' then null; end;
end $$;
reset role;
select test_as('a2200000-0000-0000-0000-000000000007', array['finance']);
do $$ begin
  begin
    perform public.staff_lookup_account('reader22@test.example', 'Finance check');
    raise exception 'finance used the lookup';
  exception when sqlstate 'AKD01' then null; end;
end $$;
reset role;

select test_as('a2200000-0000-0000-0000-000000000004', array['support']);
do $$ declare j jsonb; t text; begin
  begin
    perform public.staff_lookup_account('reader22@test.example', '   ');
    raise exception 'a lookup without a reason ran';
  exception when sqlstate 'AKD02' then null; end;
  j := public.staff_lookup_account('  READER22@test.example ', 'Ticket 41: cannot open purchase');
  if not (j ->> 'found')::boolean then raise exception 'the reader was not found'; end if;
  if j #>> '{user,id}' <> 'a2200000-0000-0000-0000-000000000006' then raise exception 'wrong user'; end if;
  if jsonb_array_length(j -> 'purchases') <> 2 then raise exception 'expected 2 purchases'; end if;
  if j #>> '{purchases,0,workbook_code}' not like 'AK-T22%' then raise exception 'purchase should carry the code'; end if;
  if jsonb_array_length(j -> 'entitlements') <> 2 then raise exception 'expected 2 entitlements'; end if;
  t := j::text;
  if t like '%SECRETCIPHERTEXT%' or t like '%Workbook 22%' or t like '%enrolment%' or t like '%answer%' then
    raise exception 'the lookup returned answers, enrolments or titles';
  end if;
  j := public.staff_lookup_account('nobody@test.example', 'Ticket 42: no account?');
  if (j ->> 'found')::boolean then raise exception 'a missing account was found'; end if;
  -- the audit log is owner-only to read, so support sees none of it directly
  if (select count(*) from public.audit_log) <> 0 then raise exception 'support read the audit log'; end if;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.audit_log where action = 'account.lookup' and reason like 'Ticket 4%') <> 2 then
    raise exception 'each lookup must write one audit row';
  end if;
  if exists (select 1 from public.audit_log where action = 'account.lookup' and (after::text like '%@%' or target like '%@%')) then
    raise exception 'the audit row must not hold the email';
  end if;
  if (select target from public.audit_log where action = 'account.lookup' and reason = 'Ticket 41: cannot open purchase')
     <> 'user:a2200000-0000-0000-0000-000000000006' then
    raise exception 'the audit row should name the account';
  end if;
end $$;

-- Sixty an hour per member of staff.
select test_as('a2200000-0000-0000-0000-000000000005', array['editor']);
do $$ begin
  for i in 1..60 loop
    perform public.staff_lookup_account('nobody@test.example', 'Rate limit check');
  end loop;
  begin
    perform public.staff_lookup_account('nobody@test.example', 'Rate limit check');
    raise exception 'the 61st lookup in an hour ran';
  exception when sqlstate 'AKD29' then null; end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. Notice and takedown (F-123)
-- ---------------------------------------------------------------------------
create temp table refs22 (k text primary key, ref text);
grant select, insert, update on refs22 to anon, authenticated;

select pg_temp.as_anon();
do $$ declare r text; begin
  -- missing good faith statement
  begin
    perform public.submit_takedown_notice('notice', 'copyright', 'Rights Holder', 'rights@example.com', '1 High St, London', '+44 20 7946 0000',
      'owner', null, 'My book, chapter 3', 'https://akana.example/w/wb-22a', 'Copied text from chapter 3.', false, true, null, 'Rights Holder', null, repeat('1', 64));
    raise exception 'a notice without the good faith statement was accepted';
  exception when sqlstate 'AKN02' then null; end;
  -- copyright needs a phone number (DMCA 512(c)(3)(A)(iv))
  begin
    perform public.submit_takedown_notice('notice', 'copyright', 'Rights Holder', 'rights@example.com', '1 High St, London', null,
      'owner', null, 'My book', 'AK-T22A0', 'Copied text.', true, true, null, 'Rights Holder', null, repeat('1', 64));
    raise exception 'a copyright notice without a phone number was accepted';
  exception when sqlstate 'AKN02' then null; end;
  -- an agent must say who they act for
  begin
    perform public.submit_takedown_notice('notice', 'copyright', 'Agent', 'agent@example.com', '1 High St', '0207 946 0000',
      'agent', null, 'My book', 'AK-T22A0', 'Copied text.', true, true, null, 'Agent', null, repeat('1', 64));
    raise exception 'an agent notice without a principal was accepted';
  exception when sqlstate 'AKN02' then null; end;
  r := public.submit_takedown_notice('notice', 'copyright', 'Rights Holder', 'rights@example.com', '1 High St, London', '+44 20 7946 0000',
    'owner', null, 'My book, chapter 3', 'https://akana.example/w/wb-22a', 'Copied text from chapter 3.', true, true, null, 'Rights Holder', null, repeat('1', 64));
  if r !~ '^TN-[0-9A-F]{10}$' then raise exception 'bad reference %', r; end if;
  insert into refs22 values ('a', r);
  r := public.submit_takedown_notice('notice', 'copyright', 'Rights Holder', 'rights@example.com', '1 High St, London', '+44 20 7946 0000',
    'owner', null, 'Another book', 'AK-T22C0', 'Copied text.', true, true, null, 'Rights Holder', null, repeat('2', 64));
  insert into refs22 values ('c', r);
  -- a counter-notice to a notice not yet acted on is refused
  begin
    perform public.submit_takedown_notice('counter_notice', null, 'Author X', 'x@example.com', '2 Low St', '0207 946 0001',
      'uploader', null, null, 'AK-T22A0', 'It is my own work.', true, true, true, 'Author X', (select ref from refs22 where k = 'a'), repeat('3', 64));
    raise exception 'a counter-notice to an open notice was accepted';
  exception when sqlstate 'AKN04' then null; end;
  -- anon has no grant on the notices at all
  begin
    perform 1 from public.takedown_notices;
    raise exception 'anon read notices';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Rate limit: 5 an hour from one address.
select pg_temp.as_anon();
do $$ begin
  for i in 1..4 loop
    perform public.submit_takedown_notice('notice', 'other_illegal', 'Someone', 's@example.com', 'Somewhere', null,
      'owner', null, null, 'AK-T22B0', 'Unlawful content.', true, true, null, 'Someone', null, repeat('4', 64));
  end loop;
  perform public.submit_takedown_notice('notice', 'other_illegal', 'Someone', 's@example.com', 'Somewhere', null,
    'owner', null, null, 'AK-T22B0', 'Unlawful content.', true, true, null, 'Someone', null, repeat('4', 64));
  begin
    perform public.submit_takedown_notice('notice', 'other_illegal', 'Someone', 's@example.com', 'Somewhere', null,
      'owner', null, null, 'AK-T22B0', 'Unlawful content.', true, true, null, 'Someone', null, repeat('4', 64));
    raise exception 'a sixth notice in an hour was accepted';
  exception when sqlstate 'AKN29' then null; end;
end $$;
reset role;

do $$ begin
  if (select workbook_id from public.takedown_notices where reference = (select ref from refs22 where k = 'a'))
     <> 'a2200000-0000-0000-0000-0000000000c1' then raise exception 'the /w/ link did not resolve to wa'; end if;
  if (select workbook_id from public.takedown_notices where reference = (select ref from refs22 where k = 'c'))
     <> 'a2200000-0000-0000-0000-0000000000c3' then raise exception 'the AK code did not resolve to wc'; end if;
end $$;

-- An organisation member reads nothing from the notice tables.
select test_as('a2200000-0000-0000-0000-000000000001');
do $$ begin
  if (select count(*) from public.takedown_notices) <> 0 then raise exception 'an org owner read notices'; end if;
  begin
    perform public.takedown_queue();
    raise exception 'an org owner read the queue';
  exception when sqlstate 'AKN01' then null; end;
end $$;
reset role;

-- Support reads the queue and marks reviewing, but cannot decide.
select test_as('a2200000-0000-0000-0000-000000000004', array['support']);
do $$ declare v uuid; begin
  if (select count(*) from public.takedown_queue()) <> 7 then raise exception 'support should see 7 notices'; end if;
  select id into v from public.takedown_notices where reference = (select ref from refs22 where k = 'a');
  perform public.takedown_mark(v, 'reviewing');
  begin
    perform public.takedown_decide(v, 'action', 'Valid notice', 'Statement of reasons text that is long enough.');
    raise exception 'support decided a notice';
  exception when sqlstate 'AKN01' then null; end;
end $$;
reset role;

-- Editor takes wa down. Buyers keep access (the default flag).
select test_as('a2200000-0000-0000-0000-000000000005', array['editor']);
do $$ declare v uuid; td uuid; begin
  select id into v from public.takedown_notices where reference = (select ref from refs22 where k = 'a');
  begin
    perform public.takedown_decide(v, 'action', 'Valid notice', 'too short');
    raise exception 'an action without a statement of reasons was accepted';
  exception when sqlstate 'AKN02' then null; end;
  td := public.takedown_decide(v, 'action', 'Valid copyright notice; matching text found.',
    'We have removed Workbook 22A from sale after a copyright notice. No automated means were used.');
  if td is null then raise exception 'no takedown id returned'; end if;
  -- deciding again is refused
  begin
    perform public.takedown_decide(v, 'reject', 'Second go');
    raise exception 'a decided notice was decided again';
  exception when sqlstate 'AKN08' then null; end;
  -- the kill switch cannot resume it
  begin
    perform public.set_workbook_paused('a2200000-0000-0000-0000-0000000000c1', false, 'Try to resume');
    raise exception 'the kill switch resumed a title under takedown';
  exception when sqlstate 'AKN08' then null; end;
end $$;
reset role;
do $$ declare w record; begin
  select status, in_membership into w from public.workbooks where id = 'a2200000-0000-0000-0000-0000000000c1';
  if w.status <> 'paused' or w.in_membership then raise exception 'wa should be paused and out of the membership: % %', w.status, w.in_membership; end if;
  if (select status from public.entitlements where id = 'a2200000-0000-0000-0000-000000000911') <> 'active' then
    raise exception 'the buyer lost access while the flag says keep';
  end if;
  if (select count(*) from public.audit_log where action = 'takedown.actioned') <> 1 then raise exception 'takedown audit missing'; end if;
end $$;

-- The buyer can still read the workbook row; another reader cannot.
select test_as('a2200000-0000-0000-0000-000000000006');
do $$ begin
  if (select count(*) from public.workbooks where id = 'a2200000-0000-0000-0000-0000000000c1') <> 1 then
    raise exception 'the buyer cannot see the title taken down';
  end if;
end $$;
reset role;
select test_as('a2200000-0000-0000-0000-000000000008');
do $$ begin
  if (select count(*) from public.workbooks where id = 'a2200000-0000-0000-0000-0000000000c1') <> 0 then
    raise exception 'a non-buyer can see the title taken down';
  end if;
end $$;
reset role;

-- The organisation sees the statement of reasons, never the sender.
select test_as('a2200000-0000-0000-0000-000000000002');
do $$ declare r record; begin
  select * into r from public.org_takedowns('a2200000-0000-0000-0000-0000000000a1');
  if r.workbook_code <> 'AK-T22A0' or r.statement_of_reasons not like 'We have removed%' then raise exception 'org view wrong'; end if;
  if row_to_json(r)::text like '%rights@example.com%' or row_to_json(r)::text like '%High St%' then
    raise exception 'the org view leaked the sender';
  end if;
end $$;
reset role;

-- Buyers lose access when the flag is off: take wc down.
update public.feature_flags set enabled = false where key = 'takedown_buyers_keep_access' and scope = 'global';
select test_as('a2200000-0000-0000-0000-000000000005', array['editor']);
do $$ declare v uuid; begin
  select id into v from public.takedown_notices where reference = (select ref from refs22 where k = 'c');
  perform public.takedown_decide(v, 'action', 'Valid notice for wc.',
    'We have removed Workbook 22C from sale after a copyright notice. No automated means were used.');
end $$;
reset role;
do $$ begin
  if (select status from public.entitlements where id = 'a2200000-0000-0000-0000-000000000912') <> 'revoked' then
    raise exception 'the buyer kept access while the flag says no';
  end if;
  if (select count(*) from public.takedown_revocations) <> 1 then raise exception 'the revocation was not recorded'; end if;
end $$;
select test_as('a2200000-0000-0000-0000-000000000006');
do $$ begin
  if (select count(*) from public.workbooks where id = 'a2200000-0000-0000-0000-0000000000c3') <> 0 then
    raise exception 'the buyer still sees wc after losing access';
  end if;
end $$;
reset role;
update public.feature_flags set enabled = true where key = 'takedown_buyers_keep_access' and scope = 'global';

-- A counter-notice on wa, then reinstatement.
select pg_temp.as_anon();
do $$ declare r text; begin
  begin
    perform public.submit_takedown_notice('counter_notice', null, 'Author X', 'x@example.com', '2 Low St', '0207 946 0001',
      'uploader', null, null, 'AK-T22A0', 'It is my own work.', true, true, false, 'Author X', (select ref from refs22 where k = 'a'), repeat('5', 64));
    raise exception 'a counter-notice without consent to jurisdiction was accepted';
  exception when sqlstate 'AKN02' then null; end;
  r := public.submit_takedown_notice('counter_notice', null, 'Author X', 'x@example.com', '2 Low St', '0207 946 0001',
    'uploader', null, null, 'AK-T22A0', 'It is my own work.', true, true, true, 'Author X', (select ref from refs22 where k = 'a'), repeat('5', 64));
  if r !~ '^CN-' then raise exception 'bad counter reference %', r; end if;
  insert into refs22 values ('cn', r);
end $$;
reset role;

select test_as('a2200000-0000-0000-0000-000000000005', array['editor']);
do $$ declare td uuid; cn uuid; s text; begin
  select takedown_id into td from public.takedown_notices where reference = (select ref from refs22 where k = 'a');
  select id into cn from public.takedown_notices where reference = (select ref from refs22 where k = 'cn');
  s := public.takedown_reinstate(td, 'Counter-notice stands; no court action within 14 business days.', cn);
  if s <> 'live' then raise exception 'wa should be live again, got %', s; end if;
  begin
    perform public.takedown_reinstate(td, 'Again');
    raise exception 'a takedown was reinstated twice';
  exception when sqlstate 'AKN08' then null; end;
  -- wc back too: its revoked entitlement returns
  select takedown_id into td from public.takedown_notices where reference = (select ref from refs22 where k = 'c');
  perform public.takedown_reinstate(td, 'Notice withdrawn by the sender.');
end $$;
reset role;
do $$ begin
  if (select in_membership from public.workbooks where id = 'a2200000-0000-0000-0000-0000000000c1') is not true then
    raise exception 'wa should be back in the membership';
  end if;
  if (select status from public.takedown_notices where reference = (select ref from refs22 where k = 'cn')) <> 'actioned' then
    raise exception 'the counter-notice should be actioned';
  end if;
  if (select status from public.entitlements where id = 'a2200000-0000-0000-0000-000000000912') <> 'active' then
    raise exception 'the revoked entitlement did not come back';
  end if;
  if (select status from public.workbooks where id = 'a2200000-0000-0000-0000-0000000000c3') <> 'live' then
    raise exception 'wc should be live again';
  end if;
end $$;

-- Repeat infringer: three takedowns in a year flag the organisation.
update public.app_config set value = '2' where key = 'takedown_repeat_threshold';
select test_as('a2200000-0000-0000-0000-000000000005', array['editor']);
do $$ declare v uuid; begin
  for v in select id from public.takedown_notices where basis = 'other_illegal' order by created_at limit 2 loop
    -- both name wb: the second joins the first takedown
    perform public.takedown_decide(v, 'action', 'Unlawful content confirmed.',
      'We have removed Workbook 22B from sale after a notice of unlawful content. No automated means were used.');
  end loop;
  if (select count(*) from public.takedowns where workbook_id = 'a2200000-0000-0000-0000-0000000000c2' and reinstated_at is null) <> 1 then
    raise exception 'a second notice must join the active takedown';
  end if;
  if exists (select 1 from public.takedown_queue() where org_id = 'a2200000-0000-0000-0000-0000000000a1' and repeat_infringer) then
    raise exception 'one active takedown should not flag the organisation at threshold 2';
  end if;
  -- reject one, and take wc down again, so two are active
  select id into v from public.takedown_notices where basis = 'other_illegal' and status = 'received' order by created_at limit 1;
  perform public.takedown_decide(v, 'reject', 'Not unlawful.');
  insert into refs22 values ('x', null);
end $$;
reset role;
select pg_temp.as_anon();
do $$ begin
  update refs22 set ref = public.submit_takedown_notice('notice', 'copyright', 'Rights Holder', 'rights@example.com', '1 High St', '0207 946 0000',
    'owner', null, 'Another book', 'AK-T22C0', 'Copied again.', true, true, null, 'Rights Holder', null, repeat('6', 64)) where k = 'x';
end $$;
reset role;
select test_as('a2200000-0000-0000-0000-000000000005', array['editor']);
do $$ begin
  perform public.takedown_decide((select id from public.takedown_notices where reference = (select ref from refs22 where k = 'x')),
    'action', 'Valid again.', 'We have removed Workbook 22C from sale after a copyright notice. No automated means were used.');
  if not exists (select 1 from public.takedown_queue() where org_id = 'a2200000-0000-0000-0000-0000000000a1' and repeat_infringer) then
    raise exception 'two active takedowns should flag the organisation at threshold 2';
  end if;
end $$;
reset role;

rollback;
\echo PASS 0022_dashboards_takedown
