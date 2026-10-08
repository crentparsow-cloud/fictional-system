-- Demo money (0029): the reset rebuilds test-mode sales, statements and
-- dashboard counts for the demo publisher only, the demo logins see them, and
-- every attempt to move a demo figure into the real ledger, statements,
-- payouts, receipts, pool, reconciliation or reports is refused or finds
-- nothing. Each block must raise or return the expected value; a failure
-- aborts the script and the CI step.
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('a2900000-0000-0000-0000-000000000001', 'demo-publisher29@test'),
  ('a2900000-0000-0000-0000-000000000002', 'demo-author29@test'),
  ('a2900000-0000-0000-0000-000000000003', 'realowner29@test'),
  ('a2900000-0000-0000-0000-000000000004', 'owner-staff29@test'),
  ('a2900000-0000-0000-0000-000000000005', 'reader29@test');
insert into public.platform_roles (user_id, role) values ('a2900000-0000-0000-0000-000000000004', 'owner');

-- A real publisher with a real title and one real test-mode sale three months ago.
insert into public.organisations (id, code, kind, legal_name, display_name, slug, country, tax_residence, stripe_connect_id, connect_status) values
  ('a2900000-0000-0000-0000-0000000000a1', 'PB-TDM29', 'publisher', 'Real Money Ltd', 'Real Money', 'real-money-29', 'GB', 'GB', 'acct_realmoney29', 'verified');
insert into public.org_members (org_id, user_id, role) values
  ('a2900000-0000-0000-0000-0000000000a1', 'a2900000-0000-0000-0000-000000000003', 'owner');
insert into public.books (id, org_id, slug, title) values
  ('a2900000-0000-0000-0000-0000000000c1', 'a2900000-0000-0000-0000-0000000000a1', 'real-book-29', 'Real Book');
insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, depth, status, badge) values
  ('a2900000-0000-0000-0000-0000000000d1', 'AK-TDM29', 'a2900000-0000-0000-0000-0000000000c1', 'a2900000-0000-0000-0000-0000000000a1',
   'real-wb-29', 'Real WB', 'Card', 'productivity', 'full', 'live', 'official');
insert into public.royalty_lines (org_id, workbook_id, tenant_id, kind, period, currency, livemode, units, gross_minor, tax_minor,
  fee_minor, net_base_minor, rate, author_minor, akana_minor, is_placeholder_rate, idem_key, occurred_at)
values ('a2900000-0000-0000-0000-0000000000a1', 'a2900000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000000a',
  'sale', '2000-01', 'GBP', false, 1, 1000, 0, 0, 1000, 0.5, 500, 500, true, 'test29:real-sale', now() - interval '3 months');

create or replace function pg_temp.as_service() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "service_role"}'::text, true);
  execute 'set local role service_role';
end $$;

-- Run a statement and require error AKQ01.
create or replace function pg_temp.expect_akq01(p_sql text, p_what text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when sqlstate 'AKQ01' then
    return;
  end;
  raise exception 'not refused with AKQ01: %', p_what;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Before any reset there is no demo money, and the migration wrote none.
-- ---------------------------------------------------------------------------
do $$ begin
  if exists (select 1 from public.demo_royalty_lines) or exists (select 1 from public.demo_statements)
     or exists (select 1 from public.demo_funnel_months) then
    raise exception 'the migration wrote demo money';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The nightly reset (service role) rebuilds the demo money.
-- ---------------------------------------------------------------------------
insert into public.demo_accounts (user_id, kind) values
  ('a2900000-0000-0000-0000-000000000001', 'publisher'),
  ('a2900000-0000-0000-0000-000000000002', 'author');

select pg_temp.as_service();
do $$ declare r jsonb; begin
  r := public.reset_demo_state_job();
  if (r -> 'money' ->> 'statements')::int < 4 then raise exception 'expected at least four demo statements, got %', r; end if;
  if (r -> 'money' ->> 'funnel_rows')::int <> 90 then raise exception 'expected 90 funnel rows (6 months, 3 workbooks, 5 metrics), got %', r; end if;
  if (r -> 'money' ->> 'lines')::int < 100 then raise exception 'too few demo lines: %', r; end if;
end $$;
reset role;

do $$ declare s record; v_prev bigint := 0; v_sum bigint; n int := 0; begin
  if exists (select 1 from public.demo_royalty_lines where org_id <> '00000000-0000-0000-0000-0000000000d0' or livemode or not is_demo) then
    raise exception 'demo lines outside the demo organisation, in live mode or unmarked';
  end if;
  if exists (select 1 from public.demo_royalty_lines where occurred_at > now()) then raise exception 'a demo line is in the future'; end if;
  if not exists (select 1 from public.demo_royalty_lines where kind = 'refund') then raise exception 'no demo refund'; end if;
  if not exists (select 1 from public.demo_royalty_lines where kind = 'payout') then raise exception 'no demo payout'; end if;
  if exists (select 1 from public.demo_royalty_lines where workbook_id in ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f4')) then
    raise exception 'a workbook in review or draft has demo sales';
  end if;
  -- Each statement opens where the last closed and adds up to its lines.
  for s in select * from public.demo_statements order by period loop
    n := n + 1;
    if s.opening_minor <> v_prev then raise exception 'statement % opens at %, previous closed at %', s.period, s.opening_minor, v_prev; end if;
    select coalesce(sum(author_minor), 0) into v_sum from public.demo_royalty_lines where period = s.period;
    if s.closing_minor <> s.opening_minor + v_sum then raise exception 'statement % does not add up', s.period; end if;
    if s.sales_minor <= 0 then raise exception 'statement % has no sales', s.period; end if;
    if s.livemode or not s.is_demo then raise exception 'statement % is not marked demo and test mode', s.period; end if;
    v_prev := s.closing_minor;
  end loop;
  if n < 4 then raise exception 'expected four or more statements'; end if;
  -- Only months whose refund window has passed have a statement.
  if exists (select 1 from public.demo_statements x
              where now() < app.month_start(app.month_after(x.period)) + interval '14 days') then
    raise exception 'a statement closed early';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Nothing demo reached the real money tables.
-- ---------------------------------------------------------------------------
create or replace function pg_temp.no_demo_in_real(p_when text) returns void
language plpgsql as $$
begin
  if exists (select 1 from public.royalty_lines l join public.organisations o on o.id = l.org_id where o.is_demo) then raise exception '%: demo org in royalty_lines', p_when; end if;
  if exists (select 1 from public.royalty_lines l join public.workbooks w on w.id = l.workbook_id where w.is_demo) then raise exception '%: demo workbook in royalty_lines', p_when; end if;
  if exists (select 1 from public.statements s join public.organisations o on o.id = s.org_id where o.is_demo) then raise exception '%: demo org in statements', p_when; end if;
  if exists (select 1 from public.payouts p join public.organisations o on o.id = p.org_id where o.is_demo) then raise exception '%: demo org in payouts', p_when; end if;
  if exists (select 1 from public.royalty_receipts r join public.tenants t on t.id = r.tenant_id where t.is_demo) then raise exception '%: demo tenant in receipts', p_when; end if;
  if exists (select 1 from public.royalty_receipts r join public.workbooks w on w.id = r.workbook_id where w.is_demo) then raise exception '%: demo workbook in receipts', p_when; end if;
  if exists (select 1 from public.pool_periods p join public.tenants t on t.id = p.tenant_id where t.is_demo) then raise exception '%: demo tenant in pool', p_when; end if;
  if exists (select 1 from public.royalty_balances b join public.organisations o on o.id = b.org_id where o.is_demo) then raise exception '%: demo org in balances', p_when; end if;
  if exists (select 1 from public.royalty_title_months m join public.organisations o on o.id = m.org_id where o.is_demo) then raise exception '%: demo org in title months', p_when; end if;
end $$;
select pg_temp.no_demo_in_real('after reset');

-- ---------------------------------------------------------------------------
-- 4. The real machinery runs and still finds no demo money: statements,
-- pool, payout decisions, a payout run and reconciliation.
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
do $$ declare v_run uuid; begin
  perform public.close_due_statements(false);
  perform public.close_due_pools(false);
  if exists (select 1 from public.payout_candidates(false) c where c.org_id = '00000000-0000-0000-0000-0000000000d0') then
    raise exception 'the demo organisation is a payout candidate';
  end if;
  v_run := public.start_payout_run(false, 'cron');
  if exists (select 1 from public.payouts p where p.run_id = v_run and p.org_id = '00000000-0000-0000-0000-0000000000d0') then
    raise exception 'the payout run paid the demo organisation';
  end if;
  if exists (select 1 from public.receipts_for_reconciliation(false, '-infinity', 'infinity') r
              where r.stripe_ref like '%demo%' or r.gross_minor = 799) then
    raise exception 'reconciliation sees demo money';
  end if;
end $$;
reset role;
select pg_temp.no_demo_in_real('after the real jobs');

do $$ declare s public.statements; begin
  -- The real organisation's statement holds only its real line.
  select * into s from public.statements where org_id = 'a2900000-0000-0000-0000-0000000000a1';
  if not found then raise exception 'the real statement did not close'; end if;
  if s.sales_minor <> 500 or s.line_count <> 1 then raise exception 'real statement picked up something else: %', to_jsonb(s); end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Every way into the real tables refuses demo money (AKQ01), even for the
-- table owner.
-- ---------------------------------------------------------------------------
select pg_temp.expect_akq01($q$
  insert into public.royalty_lines (org_id, kind, period, currency, livemode, author_minor, idem_key, occurred_at)
  values ('00000000-0000-0000-0000-0000000000d0', 'adjustment', '2026-01', 'GBP', false, 100, 'test29:leak1', now())
$q$, 'royalty line for the demo organisation');
select pg_temp.expect_akq01($q$
  insert into public.royalty_lines (org_id, workbook_id, kind, period, currency, livemode, author_minor, idem_key, occurred_at)
  values ('a2900000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000f1', 'sale', '2026-01', 'GBP', false, 100, 'test29:leak2', now())
$q$, 'royalty line naming a demo workbook for a real organisation');
select pg_temp.expect_akq01($q$
  insert into public.statements (org_id, period, currency, livemode, opening_minor, sales_minor, refunds_minor, pool_minor,
    adjustments_minor, payouts_minor, closing_minor, units, line_count, is_placeholder_rate)
  values ('00000000-0000-0000-0000-0000000000d0', '2026-01', 'GBP', false, 0, 1, 0, 0, 0, 0, 1, 1, 1, true)
$q$, 'statement for the demo organisation');
select pg_temp.expect_akq01($q$
  insert into public.payouts (org_id, currency, livemode, amount_minor, status)
  values ('00000000-0000-0000-0000-0000000000d0', 'GBP', false, 100, 'pending')
$q$, 'payout for the demo organisation');
select pg_temp.expect_akq01($q$
  insert into public.royalty_receipts (kind, source, tenant_id, stripe_ref, currency, gross_minor, livemode, period, occurred_at)
  values ('sale', 'purchase', '00000000-0000-0000-0000-0000000000d1', 'pi_test29_leak', 'GBP', 799, false, '2026-01', now())
$q$, 'receipt on the demo tenant');
select pg_temp.expect_akq01($q$
  insert into public.royalty_receipts (kind, source, tenant_id, workbook_id, stripe_ref, currency, gross_minor, livemode, period, occurred_at)
  values ('sale', 'purchase', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f1', 'pi_test29_leak2', 'GBP', 799, false, '2026-01', now())
$q$, 'receipt naming a demo workbook');
select pg_temp.expect_akq01($q$
  insert into public.pool_periods (tenant_id, period, currency, livemode, net_receipts_minor, share_rate, pool_minor, allocated_minor,
    unallocated_minor, subscribers, active_subscribers, step_cap, activity_floor, fee_treatment, is_placeholder)
  values ('00000000-0000-0000-0000-0000000000d1', '2026-01', 'GBP', false, 0, 0.5, 0, 0, 0, 0, 0, 20, 1, 'deduct', true)
$q$, 'pool month on the demo tenant');

-- Staff adjustments cannot reach the demo organisation either.
select test_as('a2900000-0000-0000-0000-000000000004', array['owner']);
select pg_temp.expect_akq01($q$
  select public.add_royalty_adjustment('00000000-0000-0000-0000-0000000000d0', 'GBP', false, 500, 'adjustment', 'trying to leak')
$q$, 'staff adjustment on the demo organisation');
reset role;

-- The service role cannot write demo money into the real ledger.
select pg_temp.as_service();
select pg_temp.expect_akq01($q$
  insert into public.royalty_lines (org_id, kind, period, currency, livemode, author_minor, idem_key, occurred_at)
  values ('00000000-0000-0000-0000-0000000000d0', 'sale', '2026-01', 'GBP', false, 100, 'test29:leak3', now())
$q$, 'service role royalty line for the demo organisation');
reset role;

-- ---------------------------------------------------------------------------
-- 6. And the demo tables refuse real money.
-- ---------------------------------------------------------------------------
select pg_temp.expect_akq01($q$
  insert into public.demo_royalty_lines (org_id, kind, period, currency, author_minor, occurred_at)
  values ('a2900000-0000-0000-0000-0000000000a1', 'sale', '2026-01', 'GBP', 100, now())
$q$, 'demo line for a real organisation');
select pg_temp.expect_akq01($q$
  insert into public.demo_royalty_lines (org_id, workbook_id, kind, period, currency, author_minor, occurred_at)
  values ('00000000-0000-0000-0000-0000000000d0', 'a2900000-0000-0000-0000-0000000000d1', 'sale', '2026-01', 'GBP', 100, now())
$q$, 'demo line naming a real workbook');
select pg_temp.expect_akq01($q$
  insert into public.demo_statements (org_id, period, currency, opening_minor, sales_minor, refunds_minor, pool_minor,
    adjustments_minor, payouts_minor, closing_minor, units, line_count, is_placeholder_rate)
  values ('a2900000-0000-0000-0000-0000000000a1', '2026-01', 'GBP', 0, 1, 0, 0, 0, 0, 1, 1, 1, true)
$q$, 'demo statement for a real organisation');
select pg_temp.expect_akq01($q$
  insert into public.demo_funnel_months (org_id, workbook_id, month, metric, n)
  values ('a2900000-0000-0000-0000-0000000000a1', 'a2900000-0000-0000-0000-0000000000d1', '2026-01-01', 'listing_views', 50)
$q$, 'demo counts for a real organisation');
do $$ begin
  begin
    insert into public.demo_royalty_lines (org_id, kind, period, currency, livemode, author_minor, occurred_at)
    values ('00000000-0000-0000-0000-0000000000d0', 'sale', '2026-01', 'GBP', true, 100, now());
    raise exception 'a live-mode demo line was stored';
  exception when check_violation then null;
  end;
  begin
    insert into public.demo_statements (org_id, period, currency, opening_minor, sales_minor, refunds_minor, pool_minor,
      adjustments_minor, payouts_minor, closing_minor, units, line_count, is_placeholder_rate, is_demo)
    values ('00000000-0000-0000-0000-0000000000d0', '1999-01', 'GBP', 0, 1, 0, 0, 0, 0, 1, 1, 1, true, false);
    raise exception 'an unmarked demo statement was stored';
  exception when check_violation then null;
  end;
end $$;

-- No client writes demo money, not even the demo publisher.
select test_as('a2900000-0000-0000-0000-000000000001');
do $$ begin
  begin
    insert into public.demo_royalty_lines (org_id, kind, period, currency, author_minor, occurred_at)
    values ('00000000-0000-0000-0000-0000000000d0', 'sale', '2026-01', 'GBP', 100, now());
    raise exception 'demo publisher wrote a demo line';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.demo_statements;
    raise exception 'demo publisher deleted demo statements';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.demo_funnel_months;
    raise exception 'demo publisher read raw demo counts';
  exception when insufficient_privilege then null;
  end;
end $$;
-- Nor can the demo publisher turn the demo into a real organisation.
select pg_temp.expect_akq01($q$
  update public.organisations set is_demo = false where id = '00000000-0000-0000-0000-0000000000d0'
$q$, 'demo owner clearing is_demo');
reset role;

-- A real owner cannot mark their own organisation a demo.
select test_as('a2900000-0000-0000-0000-000000000003');
select pg_temp.expect_akq01($q$
  update public.organisations set is_demo = true where id = 'a2900000-0000-0000-0000-0000000000a1'
$q$, 'real owner setting is_demo');
reset role;

-- Even Akana cannot mix them: real money stays real, demo money stays demo.
select pg_temp.expect_akq01($q$
  update public.organisations set is_demo = true where id = 'a2900000-0000-0000-0000-0000000000a1'
$q$, 'organisation with real money becoming a demo');
select pg_temp.expect_akq01($q$
  update public.organisations set is_demo = false where id = '00000000-0000-0000-0000-0000000000d0'
$q$, 'demo organisation with demo money becoming real');

-- ---------------------------------------------------------------------------
-- 7. The demo logins see the demo money on every page that reads money.
-- ---------------------------------------------------------------------------
select test_as('a2900000-0000-0000-0000-000000000001');
do $$ declare
  v_from date := (date_trunc('month', now()) - interval '5 months')::date;
  v_to   date := (now() at time zone 'utc')::date;
  n int;
  b record;
begin
  select count(*) into n from public.demo_statements;
  if n < 4 then raise exception 'demo publisher sees % demo statements', n; end if;
  select * into b from public.demo_royalty_balances;
  if not found or b.currency <> 'GBP' or b.livemode then raise exception 'demo balance missing or wrong'; end if;
  if exists (select 1 from public.statements) or exists (select 1 from public.royalty_balances) then
    raise exception 'demo publisher sees real statements or balances';
  end if;

  select count(*) into n from public.org_earnings('00000000-0000-0000-0000-0000000000d0', v_from, v_to) e
   where e.workbook_code = 'AK-DEM01' and e.units > 0 and not e.livemode;
  if n < 5 then raise exception 'earnings show % months of AK-DEM01 sales', n; end if;
  if not exists (select 1 from public.org_earnings('00000000-0000-0000-0000-0000000000d0', v_from, v_to) e where e.refunds_author_minor < 0) then
    raise exception 'earnings show no refund';
  end if;
  if not exists (select 1 from public.publisher_rollup_earnings('00000000-0000-0000-0000-0000000000d0', v_from, v_to) r
                  where r.scope = 'author' and r.author_name = 'Odalys Penhaligon-Reyes' and r.author_minor > 0) then
    raise exception 'roll-up earnings missing for the demo author';
  end if;

  -- The dashboard: shown counts and suppressed ones, and nothing for the draft.
  if not exists (select 1 from public.org_dashboard('00000000-0000-0000-0000-0000000000d0', v_from, v_to) d
                  where d.workbook_code = 'AK-DEM01' and d.metric = 'listing_views' and d.n >= 100 and not d.suppressed) then
    raise exception 'dashboard has no listing views for AK-DEM01';
  end if;
  if not exists (select 1 from public.org_dashboard('00000000-0000-0000-0000-0000000000d0', v_from, v_to) d
                  where d.workbook_code = 'AK-DEM01' and d.metric = 'purchases' and d.n >= 10) then
    raise exception 'dashboard has no purchases for AK-DEM01';
  end if;
  if not exists (select 1 from public.org_dashboard('00000000-0000-0000-0000-0000000000d0', v_from, v_to) d where d.suppressed and d.n is null) then
    raise exception 'dashboard shows no suppressed count';
  end if;
  if exists (select 1 from public.org_dashboard('00000000-0000-0000-0000-0000000000d0', v_from, v_to) d where d.workbook_code = 'AK-DEM04') then
    raise exception 'dashboard lists the draft';
  end if;
  if not exists (select 1 from public.publisher_rollup_counts('00000000-0000-0000-0000-0000000000d0', v_from, v_to) r
                  where r.scope = 'total' and r.metric = 'listing_views' and not r.suppressed) then
    raise exception 'roll-up counts show nothing';
  end if;
end $$;
reset role;

-- The demo author login reads the same statements (author members read statements).
select test_as('a2900000-0000-0000-0000-000000000002');
do $$ begin
  if not exists (select 1 from public.demo_statements) then raise exception 'demo author cannot read demo statements'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 8. A real organisation never sees demo money, and its own reads are real.
-- ---------------------------------------------------------------------------
select test_as('a2900000-0000-0000-0000-000000000003');
do $$ declare
  v_from date := (date_trunc('month', now()) - interval '5 months')::date;
  v_to   date := (now() at time zone 'utc')::date;
begin
  if exists (select 1 from public.demo_royalty_lines) or exists (select 1 from public.demo_statements)
     or exists (select 1 from public.demo_royalty_balances) then
    raise exception 'a real owner reads demo money';
  end if;
  if exists (select 1 from public.org_earnings('a2900000-0000-0000-0000-0000000000a1', v_from, v_to) e where e.workbook_code <> 'AK-TDM29') then
    raise exception 'real earnings include another title';
  end if;
  if not exists (select 1 from public.org_earnings('a2900000-0000-0000-0000-0000000000a1', v_from, v_to) e where e.author_minor = 500) then
    raise exception 'real earnings lost the real sale';
  end if;
  if exists (select 1 from public.org_dashboard('a2900000-0000-0000-0000-0000000000a1', v_from, v_to) d where d.workbook_code like 'AK-DEM%') then
    raise exception 'real dashboard lists a demo title';
  end if;
  begin
    perform public.org_earnings('00000000-0000-0000-0000-0000000000d0', v_from, v_to);
    raise exception 'real owner read demo earnings';
  exception when sqlstate 'AKD01' then null;
  end;
end $$;
reset role;

-- A reader with no organisation sees nothing.
select test_as('a2900000-0000-0000-0000-000000000005');
do $$ begin
  if exists (select 1 from public.demo_royalty_lines) or exists (select 1 from public.demo_statements) then
    raise exception 'a reader reads demo money';
  end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 9. A second reset (staff) puts the same demo money back, and still nothing leaks.
-- ---------------------------------------------------------------------------
create temp table before29 as
  select (select count(*) from public.demo_royalty_lines) as lines,
         (select count(*) from public.demo_statements) as stmts,
         (select sum(closing_minor) from public.demo_statements) as closing;
-- A stray row a demo user could never write, to prove the reset clears it.
insert into public.demo_funnel_months (org_id, workbook_id, month, metric, n)
values ('00000000-0000-0000-0000-0000000000d0', '00000000-0000-0000-0000-0000000000f4', '1999-01-01', 'listing_views', 7);
grant select on before29 to authenticated;
select test_as('a2900000-0000-0000-0000-000000000004', array['owner']);
select public.reset_demo_state(null);
reset role;
do $$ declare b record; begin
  select * into b from before29;
  if (select count(*) from public.demo_royalty_lines) <> b.lines or (select count(*) from public.demo_statements) <> b.stmts
     or (select sum(closing_minor) from public.demo_statements) <> b.closing then
    raise exception 'a second reset gave different demo money';
  end if;
  if exists (select 1 from public.demo_funnel_months where month = '1999-01-01') then raise exception 'reset kept a stray demo row'; end if;
  if (select count(*) from public.demo_funnel_months) <> 90 then raise exception 'funnel rows not rebuilt'; end if;
  if not exists (select 1 from public.audit_log where action = 'demo.reset' and after ? 'money') then
    raise exception 'the reset audit row does not record the demo money';
  end if;
end $$;
select pg_temp.no_demo_in_real('after the second reset');

-- The rebuild refuses a real organisation.
select pg_temp.expect_akq01($q$
  select app.rebuild_demo_money('a2900000-0000-0000-0000-0000000000a1')
$q$, 'rebuilding demo money for a real organisation');

-- Clients cannot call the rebuild or the internal readers.
select test_as('a2900000-0000-0000-0000-000000000001');
do $$ begin
  begin
    perform app.rebuild_demo_money('00000000-0000-0000-0000-0000000000d0');
    raise exception 'a client called the rebuild';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

rollback;
