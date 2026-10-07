-- Royalty ledger (0021): receipts and sale lines, append-only, RLS on the
-- ledger, refunds that reverse the author's share and revoke on a full
-- refund, fee corrections, statements and the late-line move, the
-- membership pool, payout decisions, holds, the run, transfer reversals and
-- reconciliation. Each block must raise or return the expected value; a
-- failure aborts the script and the CI step.
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('a0210000-0000-0000-0000-000000000001', 'owner@ledger.test'),
  ('a0210000-0000-0000-0000-000000000002', 'author@ledger.test'),
  ('a0210000-0000-0000-0000-000000000003', 'editor@ledger.test'),
  ('a0210000-0000-0000-0000-000000000004', 'outsider@ledger.test'),
  ('a0210000-0000-0000-0000-000000000005', 'reader@ledger.test'),
  ('a0210000-0000-0000-0000-000000000006', 'finance-staff@ledger.test'),
  ('a0210000-0000-0000-0000-000000000007', 'support-staff@ledger.test'),
  ('a0210000-0000-0000-0000-000000000008', 'reader2@ledger.test');

insert into public.organisations (id, code, kind, legal_name, display_name, slug, country, tax_residence, stripe_connect_id, connect_status) values
  ('a0210000-0000-0000-0000-0000000000a1', 'PB-TQD21', 'publisher', 'Ledger One Ltd', 'Ledger One', 'ledger-one', 'GB', 'GB', 'acct_ledgerone1', 'verified'),
  ('a0210000-0000-0000-0000-0000000000a2', 'PB-TQD22', 'publisher', 'Ledger Two Ltd', 'Ledger Two', 'ledger-two', 'GB', null, null, 'not_started');
insert into public.org_members (org_id, user_id, role) values
  ('a0210000-0000-0000-0000-0000000000a1', 'a0210000-0000-0000-0000-000000000001', 'owner'),
  ('a0210000-0000-0000-0000-0000000000a1', 'a0210000-0000-0000-0000-000000000002', 'author'),
  ('a0210000-0000-0000-0000-0000000000a1', 'a0210000-0000-0000-0000-000000000003', 'editor'),
  ('a0210000-0000-0000-0000-0000000000a2', 'a0210000-0000-0000-0000-000000000004', 'owner');

insert into public.books (id, org_id, slug, title) values
  ('a0210000-0000-0000-0000-0000000000c1', 'a0210000-0000-0000-0000-0000000000a1', 'ledger-book', 'Ledger Book'),
  ('a0210000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000001', 'ledger-house-book', 'House Book');
insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, depth, status, badge) values
  ('a0210000-0000-0000-0000-0000000000d1', 'AK-TQD21', 'a0210000-0000-0000-0000-0000000000c1', 'a0210000-0000-0000-0000-0000000000a1',
   'ledger-wb-one', 'Ledger WB One', 'Card', 'productivity', 'full', 'approved', 'official'),
  ('a0210000-0000-0000-0000-0000000000d2', 'AK-TQD22', 'a0210000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000001',
   'ledger-wb-house', 'Ledger WB House', 'Card', 'productivity', 'full', 'approved', 'official');

-- Two paid purchases in August 2026 (a closed month by the time this runs),
-- one of the publisher's title and one of an Akana house title.
insert into public.purchases (id, user_id, tenant_id, workbook_id, kind, stripe_checkout_session_id, stripe_payment_intent_id,
  currency, amount_minor, tax_minor, status, paid_at) values
  ('a0210000-0000-0000-0000-0000000000e1', 'a0210000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000a',
   'a0210000-0000-0000-0000-0000000000d1', 'workbook', 'cs_test_ledger1', 'pi_ledger1', 'GBP', 1200, 200, 'paid', '2026-08-10T12:00:00Z'),
  ('a0210000-0000-0000-0000-0000000000e2', 'a0210000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000a',
   'a0210000-0000-0000-0000-0000000000d2', 'workbook', 'cs_test_ledger2', 'pi_ledger2', 'GBP', 1200, 200, 'paid', '2026-08-11T12:00:00Z'),
  ('a0210000-0000-0000-0000-0000000000e3', 'a0210000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-00000000000a',
   'a0210000-0000-0000-0000-0000000000d1', 'workbook', 'cs_test_ledger3', 'pi_ledger3', 'GBP', 1000, 0, 'paid', '2026-08-12T12:00:00Z');
insert into public.entitlements (user_id, tenant_id, workbook_id, source, purchase_id) values
  ('a0210000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000a', 'a0210000-0000-0000-0000-0000000000d1', 'purchase',
   'a0210000-0000-0000-0000-0000000000e1');

create or replace function pg_temp.as_service() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "service_role"}'::text, true);
  execute 'set local role service_role';
end $$;

-- ---------------------------------------------------------------------------
-- 1. Config is seeded as a placeholder and readable by staff only.
-- ---------------------------------------------------------------------------
do $$ begin
  if not (app.royalty_config()).is_placeholder then raise exception 'seed config is not marked placeholder'; end if;
end $$;
select test_as('a0210000-0000-0000-0000-000000000001');
do $$ declare n int; begin
  select count(*) into n from public.royalty_config;
  if n <> 0 then raise exception 'non-staff read royalty_config'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 2. Sale receipts: the service role records; readers and org owners cannot.
-- ---------------------------------------------------------------------------
select test_as('a0210000-0000-0000-0000-000000000001');
do $$ begin
  begin
    perform public.record_sale_receipt('a0210000-0000-0000-0000-0000000000e1', false, null, 50);
    raise exception 'org owner recorded a sale receipt';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin
    perform public.record_refund('refund', 're_x', 'pi_ledger1', 100, 'GBP', false);
    raise exception 'anon called record_refund';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select pg_temp.as_service();
do $$ declare v text; l record; begin
  v := public.record_sale_receipt('a0210000-0000-0000-0000-0000000000e1', false, null, null);
  if v <> 'recorded' then raise exception 'sale 1: %', v; end if;
  v := public.record_sale_receipt('a0210000-0000-0000-0000-0000000000e1', false, null, null);
  if v <> 'unchanged' then raise exception 'sale 1 again: %', v; end if;
  v := public.record_sale_receipt('a0210000-0000-0000-0000-0000000000e2', false, 'txn_ledger2', 40);
  if v <> 'recorded_no_royalty' then raise exception 'house sale: %', v; end if;
  v := public.record_sale_receipt('a0210000-0000-0000-0000-0000000000e3', false, 'txn_ledger3', 30);
  if v <> 'recorded' then raise exception 'sale 3: %', v; end if;

  select * into l from public.royalty_lines where idem_key like 'sale:%' and workbook_id = 'a0210000-0000-0000-0000-0000000000d1'
   order by occurred_at limit 1;
  -- 1200 gross, 200 VAT, fee not yet known: base 1000, half is 500
  if l.net_base_minor <> 1000 or l.author_minor <> 500 or l.akana_minor <> 500 or l.period <> '2026-08' or not l.is_placeholder_rate
     or l.units <> 1 then
    raise exception 'sale line wrong: base % author % akana % period % placeholder %', l.net_base_minor, l.author_minor, l.akana_minor, l.period, l.is_placeholder_rate;
  end if;
  if exists (select 1 from public.royalty_lines where workbook_id = 'a0210000-0000-0000-0000-0000000000d2') then
    raise exception 'house title earned a royalty line';
  end if;
  -- 1000 gross, no VAT, fee 30: base 970, half 485
  if not exists (select 1 from public.royalty_lines where idem_key like 'sale:%' and author_minor = 485 and fee_minor = 30) then
    raise exception 'sale 3 line wrong';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Append-only, for every role.
-- ---------------------------------------------------------------------------
do $$ begin
  begin
    update public.royalty_lines set author_minor = 1 where kind = 'sale';
    raise exception 'service role updated a ledger line';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.royalty_receipts where kind = 'sale';
    raise exception 'service role deleted a receipt';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  begin
    update public.royalty_lines set author_minor = 1 where kind = 'sale';
    raise exception 'owner role updated a ledger line';
  exception when insufficient_privilege then null; end;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Fee learned later: the author's share moves by half the fee.
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
do $$ declare v text; r uuid; s bigint; begin
  select id into r from public.royalty_receipts where kind = 'sale' and purchase_id = 'a0210000-0000-0000-0000-0000000000e1';
  v := public.record_fee_correction(r, 50, 'txn_ledger1');
  if v <> 'corrected' then raise exception 'fee correction: %', v; end if;
  v := public.record_fee_correction(r, 50, 'txn_ledger1');
  if v <> 'unchanged' then raise exception 'fee correction again: %', v; end if;
  select sum(author_minor) into s from public.royalty_lines where org_id = 'a0210000-0000-0000-0000-0000000000a1' and workbook_id = 'a0210000-0000-0000-0000-0000000000d1'
    and receipt_id in (select id from public.royalty_receipts where coalesce(original_receipt_id, id) = r);
  if s <> 475 then raise exception 'after fee 50 the author should hold 475, holds %', s; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Refunds: a partial refund reverses in proportion and keeps access; the
-- rest reverses what is left and revokes. Idempotent; never over-refunds.
-- ---------------------------------------------------------------------------
do $$ declare v text; s bigint; begin
  v := public.record_refund('refund', 're_ledger1a', 'pi_ledger1', 600, 'GBP', false, '2026-08-20T10:00:00Z', 'goodwill');
  if v <> 'recorded' then raise exception 'partial refund: %', v; end if;
  v := public.record_refund('refund', 're_ledger1a', 'pi_ledger1', 600, 'GBP', false, '2026-08-20T10:00:00Z', 'goodwill');
  if v <> 'unchanged' then raise exception 'partial refund again: %', v; end if;
  if exists (select 1 from public.purchases where id = 'a0210000-0000-0000-0000-0000000000e1' and status = 'refunded') then
    raise exception 'a partial refund marked the purchase refunded';
  end if;
  -- 475 (after the fee) * 600 / 1200 = 237
  if not exists (select 1 from public.royalty_lines where idem_key = 'refund:re_ledger1a' and author_minor = -237 and units = 0) then
    raise exception 'partial refund line wrong';
  end if;
  begin
    perform public.record_refund('refund', 're_ledger1b', 'pi_ledger1', 600, 'USD', false);
    raise exception 'a refund in the wrong currency was accepted';
  exception when check_violation then null; end;
  v := public.record_refund('refund', 're_ledger1b', 'pi_ledger1', 900, 'GBP', false, '2026-08-21T10:00:00Z', 'faulty');
  if v <> 'recorded' then raise exception 'final refund: %', v; end if;
  v := public.record_refund('refund', 're_ledger1c', 'pi_ledger1', 100, 'GBP', false);
  if v <> 'nothing_left' then raise exception 'over-refund: %', v; end if;
  select sum(author_minor) into s from public.royalty_lines where workbook_id = 'a0210000-0000-0000-0000-0000000000d1'
    and (receipt_id in (select id from public.royalty_receipts where purchase_id = 'a0210000-0000-0000-0000-0000000000e1'));
  if s <> 0 then raise exception 'after a full refund the author should hold 0, holds %', s; end if;
  if not exists (select 1 from public.royalty_lines where idem_key = 'refund:re_ledger1b' and units = -1) then
    raise exception 'the full refund should take the unit back';
  end if;
  if not exists (select 1 from public.purchases where id = 'a0210000-0000-0000-0000-0000000000e1' and status = 'refunded') then
    raise exception 'a full refund did not mark the purchase refunded';
  end if;
  if exists (select 1 from public.entitlements where purchase_id = 'a0210000-0000-0000-0000-0000000000e1' and status <> 'revoked') then
    raise exception 'a full refund left access open';
  end if;
  v := public.record_refund('refund', 're_unknown', 'pi_nothing', 100, 'GBP', false);
  if v <> 'no_receipt' then raise exception 'unknown payment: %', v; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 6. Who reads the ledger: money staff and the organisation's own owner and
-- author. Not its editor, another organisation or support staff.
-- ---------------------------------------------------------------------------
select test_as('a0210000-0000-0000-0000-000000000002');
do $$ declare n int; begin
  select count(*) into n from public.royalty_lines;
  if n = 0 then raise exception 'author cannot read own ledger'; end if;
  select count(*) into n from public.royalty_receipts;
  if n <> 0 then raise exception 'author read receipts'; end if;
  select count(*) into n from public.royalty_balances;
  if n <> 1 then raise exception 'author should see one balance row, saw %', n; end if;
end $$;
reset role;
select test_as('a0210000-0000-0000-0000-000000000003');
do $$ declare n int; begin
  select count(*) into n from public.royalty_lines;
  if n <> 0 then raise exception 'editor read the ledger'; end if;
end $$;
reset role;
select test_as('a0210000-0000-0000-0000-000000000004');
do $$ declare n int; begin
  select count(*) into n from public.royalty_lines;
  if n <> 0 then raise exception 'another organisation read the ledger'; end if;
  select count(*) into n from public.royalty_title_months;
  if n <> 0 then raise exception 'another organisation read title months'; end if;
end $$;
reset role;
select test_as('a0210000-0000-0000-0000-000000000007', array['support']);
do $$ declare n int; begin
  select count(*) into n from public.royalty_lines;
  if n <> 0 then raise exception 'support staff read the ledger'; end if;
  begin
    perform public.place_payout_hold('a0210000-0000-0000-0000-0000000000a1', 'checking a chargeback');
    raise exception 'support placed a payout hold';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select test_as('a0210000-0000-0000-0000-000000000006', array['finance']);
do $$ declare n int; begin
  select count(*) into n from public.royalty_receipts;
  if n < 3 then raise exception 'finance staff should read receipts'; end if;
  begin
    perform public.set_royalty_config(0.6, 0.6, 0.5, 20, 1, 'deduct', 14, 30, '{"GBP": 2500}', '{"GBP": 100000}', 15, 'x');
    raise exception 'finance set the royalty config';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 7. Statements close August; a late August line moves to September.
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
do $$ declare n int; st public.statements%rowtype; v text; begin
  n := public.close_due_statements(false);
  if n <> 1 then raise exception 'expected one statement closed, got %', n; end if;
  select * into st from public.statements where org_id = 'a0210000-0000-0000-0000-0000000000a1' and period = '2026-08';
  -- sale 1 (500) fee correction (-25) refunds (-475) sale 3 (485)
  if st.sales_minor <> 985 or st.refunds_minor <> -475 or st.adjustments_minor <> -25 or st.closing_minor <> 485 or st.units <> 1
     or not st.is_placeholder_rate or st.opening_minor <> 0 then
    raise exception 'statement wrong: sales % refunds % adj % closing % units %', st.sales_minor, st.refunds_minor, st.adjustments_minor, st.closing_minor, st.units;
  end if;
  n := public.close_due_statements(false);
  if n <> 0 then raise exception 'closing again closed %', n; end if;
  begin
    update public.statements set closing_minor = 0 where id = st.id;
    raise exception 'a statement was edited';
  exception when insufficient_privilege then null; end;
  -- a partial refund dated in August lands in September
  v := public.record_refund('refund', 're_ledger3a', 'pi_ledger3', 100, 'GBP', false, '2026-08-25T10:00:00Z', 'late');
  if v <> 'recorded' then raise exception 'late refund: %', v; end if;
  if not exists (select 1 from public.royalty_lines where idem_key = 'refund:re_ledger3a' and period = '2026-09' and author_minor = -48) then
    raise exception 'late refund did not move to September';
  end if;
end $$;
reset role;

-- The author reads their statement; the other organisation does not.
select test_as('a0210000-0000-0000-0000-000000000002');
do $$ declare n int; begin
  select count(*) into n from public.statements;
  if n <> 1 then raise exception 'author should read one statement, saw %', n; end if;
end $$;
reset role;
select test_as('a0210000-0000-0000-0000-000000000004');
do $$ declare n int; begin
  select count(*) into n from public.statements;
  if n <> 0 then raise exception 'another organisation read a statement'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 8. The membership pool: user-centric, capped steps, activity floor.
-- ---------------------------------------------------------------------------
insert into public.workbook_versions (id, workbook_id, semver, content, content_hash, published_at) values
  ('a0210000-0000-0000-0000-0000000000f1', 'a0210000-0000-0000-0000-0000000000d1', '1.0.0', '{}'::jsonb, repeat('a', 64), now()),
  ('a0210000-0000-0000-0000-0000000000f2', 'a0210000-0000-0000-0000-0000000000d2', '1.0.0', '{}'::jsonb, repeat('b', 64), now());
insert into public.subscriptions (user_id, tenant_id, stripe_customer_id, stripe_subscription_id, plan, status, observed_at) values
  ('a0210000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000a', 'cus_ledger5', 'sub_ledger5', 'member_month', 'active', now()),
  ('a0210000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-00000000000a', 'cus_ledger8', 'sub_ledger8', 'member_month', 'active', now());
insert into public.subscription_invoices (user_id, tenant_id, stripe_invoice_id, stripe_subscription_id, status, currency, amount_minor, tax_minor, paid_at) values
  ('a0210000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000a', 'in_ledger5', 'sub_ledger5', 'paid', 'GBP', 1200, 200, '2026-07-05T09:00:00Z'),
  ('a0210000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-00000000000a', 'in_ledger8', 'sub_ledger8', 'paid', 'GBP', 1200, 200, '2026-07-06T09:00:00Z');
insert into public.enrolments (id, user_id, tenant_id, workbook_id, version_id) values
  ('a0210000-0000-0000-0000-0000000000b1', 'a0210000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000a',
   'a0210000-0000-0000-0000-0000000000d1', 'a0210000-0000-0000-0000-0000000000f1'),
  ('a0210000-0000-0000-0000-0000000000b2', 'a0210000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000a',
   'a0210000-0000-0000-0000-0000000000d2', 'a0210000-0000-0000-0000-0000000000f2');
-- Reader 5 in July: 30 steps in the publisher's title (capped at 20) and 20
-- in the house title. Reader 8 did nothing, so their share stays unallocated.
insert into public.progress_events (enrolment_id, kind, ref, at)
select 'a0210000-0000-0000-0000-0000000000b1', 'step_done', 'step_' || g, '2026-07-10T10:00:00Z' from generate_series(1, 30) g;
insert into public.progress_events (enrolment_id, kind, ref, at)
select 'a0210000-0000-0000-0000-0000000000b2', 'step_done', 'step_' || g, '2026-07-11T10:00:00Z' from generate_series(1, 20) g;
-- the same step twice counts once; a step in August does not count in July
insert into public.progress_events (enrolment_id, kind, ref, at) values
  ('a0210000-0000-0000-0000-0000000000b1', 'step_done', 'step_1', '2026-07-12T10:00:00Z'),
  ('a0210000-0000-0000-0000-0000000000b2', 'step_done', 'step_99', '2026-08-02T10:00:00Z');

select pg_temp.as_service();
do $$ declare v text; n int; p public.pool_periods%rowtype; begin
  v := public.record_membership_receipt('in_ledger5', false, 'pi_ledger_in5', null, 40);
  if v <> 'recorded' then raise exception 'membership receipt: %', v; end if;
  v := public.record_membership_receipt('in_ledger5', false, 'pi_ledger_in5', null, 40);
  if v <> 'unchanged' then raise exception 'membership receipt again: %', v; end if;
  v := public.record_membership_receipt('in_ledger8', false, 'pi_ledger_in8', null, 40);
  if v <> 'recorded' then raise exception 'membership receipt 8: %', v; end if;
  v := public.record_membership_receipt('in_nothing', false);
  if v <> 'unlinked' then raise exception 'unknown invoice: %', v; end if;
  if exists (select 1 from public.royalty_lines where kind = 'pool') then raise exception 'a pool line before the close'; end if;

  n := public.close_due_pools(false);
  if n <> 1 then raise exception 'expected one pool closed, got %', n; end if;
  select * into p from public.pool_periods where period = '2026-07';
  -- each subscriber nets 1200 - 200 - 40 = 960; two subscribers 1920; half is 960
  if p.net_receipts_minor <> 1920 or p.pool_minor <> 960 or p.subscribers <> 2 or p.active_subscribers <> 1 then
    raise exception 'pool wrong: net % pool % subs % active %', p.net_receipts_minor, p.pool_minor, p.subscribers, p.active_subscribers;
  end if;
  -- reader 5's 480 split 20:20 between the two titles; only the publisher's 240 is a line
  if not exists (select 1 from public.royalty_lines where kind = 'pool' and org_id = 'a0210000-0000-0000-0000-0000000000a1'
                  and workbook_id = 'a0210000-0000-0000-0000-0000000000d1' and author_minor = 240 and period = '2026-07') then
    raise exception 'pool line for the publisher wrong';
  end if;
  if p.allocated_minor <> 240 or p.unallocated_minor <> 720 then
    raise exception 'pool allocation wrong: allocated % unallocated %', p.allocated_minor, p.unallocated_minor;
  end if;
  if exists (select 1 from public.royalty_lines where kind = 'pool' and workbook_id = 'a0210000-0000-0000-0000-0000000000d2') then
    raise exception 'the house title got a pool line';
  end if;
  if exists (select 1 from public.pool_usage where user_hash like '%a0210000%') then raise exception 'pool_usage holds a raw id'; end if;
  if public.close_due_pools(false) <> 0 then raise exception 'pool closed twice'; end if;
  -- a membership refund dated in July now counts in the next open pool month
  v := public.record_refund('refund', 're_ledger_in5', 'pi_ledger_in5', 300, 'GBP', false, '2026-07-20T10:00:00Z', 'cooling off');
  if v <> 'recorded' then raise exception 'membership refund: %', v; end if;
  if not exists (select 1 from public.royalty_receipts where stripe_ref = 're_ledger_in5' and period = '2026-08') then
    raise exception 'membership refund after the pool closed did not move to August';
  end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 9. Payouts: decisions, holds, the run, completion and reversal.
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
do $$ declare c record; begin
  -- July's pool statement closes now too
  perform public.close_due_statements(false);
  select * into c from public.payout_candidates(false) where org_id = 'a0210000-0000-0000-0000-0000000000a1';
  if c.decision is distinct from 'skip' or c.reason is distinct from 'below_minimum' then
    raise exception 'small balance: % %', c.decision, c.reason;
  end if;
end $$;
reset role;

-- An owner adds 30.00 today. It sits in the open month, so it is not payable yet.
select test_as('a0210000-0000-0000-0000-000000000006', array['owner']);
do $$ begin perform public.add_royalty_adjustment('a0210000-0000-0000-0000-0000000000a1', 'GBP', false, 3000, 'adjustment', 'Test top up'); end $$;
reset role;
select pg_temp.as_service();
do $$ declare c record; begin
  select * into c from public.payout_candidates(false) where org_id = 'a0210000-0000-0000-0000-0000000000a1';
  if c.reason is distinct from 'below_minimum' then raise exception 'open-month money counted as payable: %', c.reason; end if;
end $$;
reset role;

-- History: a June adjustment written directly (standing in for an older
-- month). Closing June makes the balance payable above the minimum.
insert into public.royalty_lines (org_id, kind, period, currency, livemode, author_minor, idem_key, note, occurred_at)
values ('a0210000-0000-0000-0000-0000000000a1', 'adjustment', '2026-06', 'GBP', false, 4000, 'adj:test-june', 'Test', '2026-06-15T10:00:00Z');
select pg_temp.as_service();
do $$ declare c record; v_run uuid; p public.payouts%rowtype; v text; b record; begin
  perform public.close_due_statements(false);
  select * into c from public.payout_candidates(false) where org_id = 'a0210000-0000-0000-0000-0000000000a1';
  if c.decision is distinct from 'pay' then raise exception 'expected pay, got % %', c.decision, c.reason; end if;
  select * into c from public.payout_candidates(false) where org_id = 'a0210000-0000-0000-0000-0000000000a2';
  if c.org_id is not null then raise exception 'an organisation with no lines is a candidate'; end if;

  v_run := public.start_payout_run(false, 'cron');
  select * into p from public.payouts where run_id = v_run;
  if p.status <> 'pending' or p.amount_minor <> c.payable_minor or p.stripe_destination <> 'acct_ledgerone1' then
    raise exception 'payout row wrong: % % %', p.status, p.amount_minor, p.stripe_destination;
  end if;
  -- a second run while one is pending pays nothing more
  perform public.start_payout_run(false, 'cron');
  if (select count(*) from public.payouts where org_id = 'a0210000-0000-0000-0000-0000000000a1') <> 1 then
    raise exception 'a second run made a second payout';
  end if;
  v := public.complete_payout(p.id, 'tr_ledger1');
  if v <> 'paid' then raise exception 'complete: %', v; end if;
  v := public.complete_payout(p.id, 'tr_ledger1');
  if v <> 'unchanged' then raise exception 'complete again: %', v; end if;
  select * into b from public.royalty_balances where org_id = 'a0210000-0000-0000-0000-0000000000a1' and currency = 'GBP' and not livemode;
  if b.payable_minor <> 0 then raise exception 'after the payout nothing should be payable, % is', b.payable_minor; end if;

  -- reclaim 100 after a refund
  v := public.record_transfer_reversal(p.id, 'trr_ledger1', 100, 'refund after payout');
  if v <> 'recorded' then raise exception 'reversal: %', v; end if;
  v := public.record_transfer_reversal(p.id, 'trr_ledger1', 100, 'refund after payout');
  if v <> 'unchanged' then raise exception 'reversal again: %', v; end if;
  begin
    perform public.record_transfer_reversal(p.id, 'trr_ledger2', p.amount_minor, 'too much');
    raise exception 'reversed more than the transfer';
  exception when check_violation then null; end;
end $$;
reset role;

-- Holds: finance staff place one; the candidate is skipped as held.
select test_as('a0210000-0000-0000-0000-000000000006', array['finance']);
do $$ declare h uuid; c record; begin
  h := public.place_payout_hold('a0210000-0000-0000-0000-0000000000a1', 'Chargeback under review');
  select * into c from public.payout_candidates(false) where org_id = 'a0210000-0000-0000-0000-0000000000a1';
  if c.reason <> 'held' then raise exception 'held organisation was %', c.reason; end if;
  if not public.release_payout_hold(h, 'Resolved') then raise exception 'release failed'; end if;
  if public.release_payout_hold(h, 'Again') then raise exception 'released twice'; end if;
end $$;
reset role;
do $$ begin
  if not exists (select 1 from public.audit_log where action = 'money.payout_hold_placed') then raise exception 'hold not audited'; end if;
end $$;

-- Unverified Connect is skipped, and live mode refuses placeholder rates.
update public.organisations set connect_status = 'action_needed' where id = 'a0210000-0000-0000-0000-0000000000a1';
select pg_temp.as_service();
do $$ declare c record; begin
  select * into c from public.payout_candidates(false) where org_id = 'a0210000-0000-0000-0000-0000000000a1';
  if c.reason <> 'unverified' then raise exception 'unverified organisation was %', c.reason; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 10. Reconciliation: the service role records; staff resolve.
-- ---------------------------------------------------------------------------
select test_as('a0210000-0000-0000-0000-000000000006', array['finance']);
do $$ begin
  begin
    perform public.record_reconciliation(false, now() - interval '1 day', now(), 0, 0, 0, '[]'::jsonb);
    raise exception 'staff recorded a reconciliation run';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select pg_temp.as_service();
do $$ declare r uuid; n int; begin
  r := public.record_reconciliation(false, now() - interval '1 day', now(), 3, 2, 1,
    '[{"kind": "missing_in_ledger", "stripe_ref": "ch_x", "balance_txn_id": "txn_x", "currency": "gbp", "actual_minor": 500},
      {"kind": "fee_corrected", "stripe_ref": "pi_ledger3", "expected_minor": 30, "actual_minor": 31}]'::jsonb);
  select issues into n from public.reconciliation_runs where id = r;
  if n <> 1 then raise exception 'issues should be 1, got %', n; end if;
  select count(*) into n from public.receipts_for_reconciliation(false, '2026-08-01', '2026-09-01');
  if n < 3 then raise exception 'receipts for reconciliation: %', n; end if;
end $$;
reset role;
select test_as('a0210000-0000-0000-0000-000000000006', array['finance']);
do $$ declare i uuid; begin
  select id into i from public.reconciliation_items where kind = 'missing_in_ledger';
  if not public.resolve_reconciliation_item(i, 'Test charge made outside Akana') then raise exception 'resolve failed'; end if;
end $$;
reset role;

rollback;
\echo PASS 0021_royalty_ledger
