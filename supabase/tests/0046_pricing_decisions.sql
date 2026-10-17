-- Pricing decisions (0046): the four membership price points, the trial
-- lengths, the author shares and the payout calendar as decided on
-- 15 October 2026, the two-person yearly plan through the subscription,
-- consent and seat functions, and the weekly settlement rule that lets a
-- weekly payout run pay money that is past the refund window without waiting
-- for a month to close. Each block must raise or return the expected value;
-- a failure aborts the script and the CI step.
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('a0460000-0000-0000-0000-000000000001', 'owner46@pricing.test'),
  ('a0460000-0000-0000-0000-000000000002', 'buyer46@pricing.test'),
  ('a0460000-0000-0000-0000-000000000005', 'reader46@pricing.test'),
  ('a0460000-0000-0000-0000-000000000006', 'staff46@akana.example');

insert into public.organisations (id, code, kind, legal_name, display_name, slug, country, tax_residence, stripe_connect_id, connect_status) values
  ('a0460000-0000-0000-0000-0000000000a1', 'PB-TQD46', 'publisher', 'Pricing One Ltd', 'Pricing One', 'pricing-one', 'GB', 'GB', 'acct_pricing46', 'verified');
insert into public.org_members (org_id, user_id, role) values
  ('a0460000-0000-0000-0000-0000000000a1', 'a0460000-0000-0000-0000-000000000001', 'owner');
insert into public.books (id, org_id, slug, title) values
  ('a0460000-0000-0000-0000-0000000000c1', 'a0460000-0000-0000-0000-0000000000a1', 'pricing-book', 'Pricing Book');
insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, depth, status, badge) values
  ('a0460000-0000-0000-0000-0000000000d1', 'AK-TQD46', 'a0460000-0000-0000-0000-0000000000c1', 'a0460000-0000-0000-0000-0000000000a1',
   'pricing-wb-one', 'Pricing WB One', 'Card', 'productivity', 'full', 'approved', 'official');

-- One marketplace sale and one through the author's own link.
insert into public.purchases (id, user_id, tenant_id, workbook_id, kind, stripe_checkout_session_id, stripe_payment_intent_id,
  currency, amount_minor, tax_minor, status, paid_at, channel) values
  ('a0460000-0000-0000-0000-0000000000e1', 'a0460000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000a',
   'a0460000-0000-0000-0000-0000000000d1', 'workbook', 'cs_test_price1', 'pi_price1', 'GBP', 1200, 200, 'paid', now() - interval '3 days', 'marketplace'),
  ('a0460000-0000-0000-0000-0000000000e2', 'a0460000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000a',
   'a0460000-0000-0000-0000-0000000000d1', 'workbook', 'cs_test_price2', 'pi_price2', 'GBP', 1200, 200, 'paid', now() - interval '2 days', 'author_link');

create or replace function pg_temp.as_service() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "service_role"}'::text, true);
  execute 'set local role service_role';
end $$;

-- ---------------------------------------------------------------------------
-- 1. The four membership points, readable by anyone; the ladder is unchanged.
-- ---------------------------------------------------------------------------
set local role anon;
do $$ declare r record; begin
  for r in select * from (values
      ('member_month', 799), ('member_year', 6999), ('member_two_month', 1199), ('member_two_year', 10499),
      ('p1', 799), ('p2', 899), ('p3', 999), ('p4', 1199), ('p5', 1299), ('p6', 1499)) as v(id, minor) loop
    -- the workbook ladder carries its amounts from the staging and production
    -- rows, not from the migrations, so only the membership points are exact here
    if r.id like 'member%' then
      if (select (amounts ->> 'GBP')::int from public.price_points where id = r.id and active and kind = 'membership') is distinct from r.minor then
        raise exception 'price point % is not %', r.id, r.minor;
      end if;
    end if;
  end loop;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 2. Trials: 14 days monthly, 21 days annual.
-- ---------------------------------------------------------------------------
do $$ begin
  if (select (value #>> '{}')::int from public.app_config where key = 'membership_trial_days_monthly') <> 14 then raise exception 'monthly trial is not 14 days'; end if;
  if (select (value #>> '{}')::int from public.app_config where key = 'membership_trial_days_yearly') <> 21 then raise exception 'annual trial is not 21 days'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. The decided figures: shares, pool, weekly Fridays, GBP 10.00 floor.
-- ---------------------------------------------------------------------------
do $$ declare c public.royalty_config; begin
  c := app.royalty_config();
  if c.is_placeholder then raise exception 'the figures are still a placeholder'; end if;
  if c.sale_rate_author_link <> 0.8000 or c.sale_rate_author <> 0.6500 or c.pool_share_author <> 0.5000 then
    raise exception 'shares wrong: % % %', c.sale_rate_author_link, c.sale_rate_author, c.pool_share_author;
  end if;
  if c.fee_treatment <> 'deduct' then raise exception 'shares must be of net after card processing'; end if;
  if c.payout_cadence <> 'weekly' or c.payout_weekday <> 5 then raise exception 'calendar wrong: % %', c.payout_cadence, c.payout_weekday; end if;
  if (c.min_payout_minor ->> 'GBP')::bigint <> 1000 then raise exception 'GBP floor is %', c.min_payout_minor ->> 'GBP'; end if;
end $$;

-- A member of staff and an author read the schedule; it says decided.
select test_as('a0460000-0000-0000-0000-000000000001');
do $$ declare s record; begin
  select * into s from public.payout_schedule();
  if s.is_placeholder or s.payout_cadence <> 'weekly' or s.sale_rate_author <> 0.6500 or s.sale_rate_author_link <> 0.8000 then
    raise exception 'schedule wrong';
  end if;
end $$;
reset role;

-- The sale lines use the new rates, 65 and 80 percent of net after VAT and the card fee.
select pg_temp.as_service();
do $$ declare ln public.royalty_lines%rowtype; begin
  perform public.record_sale_receipt('a0460000-0000-0000-0000-0000000000e1', false, null, 50);
  perform public.record_sale_receipt('a0460000-0000-0000-0000-0000000000e2', false, null, 50);
  select l.* into ln from public.royalty_lines l join public.royalty_receipts r on r.id = l.receipt_id
   where r.purchase_id = 'a0460000-0000-0000-0000-0000000000e1';
  -- 1200 gross, 200 VAT, 50 fee: base 950; 65% = 617 (rounded down), Akana 333
  if ln.channel <> 'marketplace' or ln.rate <> 0.6500 or ln.net_base_minor <> 950 or ln.author_minor <> 617 or ln.akana_minor <> 333 or ln.is_placeholder_rate then
    raise exception 'marketplace line wrong: % % % % % %', ln.channel, ln.rate, ln.net_base_minor, ln.author_minor, ln.akana_minor, ln.is_placeholder_rate;
  end if;
  select l.* into ln from public.royalty_lines l join public.royalty_receipts r on r.id = l.receipt_id
   where r.purchase_id = 'a0460000-0000-0000-0000-0000000000e2';
  -- 80% = 760, Akana 190
  if ln.channel <> 'author_link' or ln.rate <> 0.8000 or ln.author_minor <> 760 or ln.akana_minor <> 190 or ln.is_placeholder_rate then
    raise exception 'author link line wrong: % % % % %', ln.channel, ln.rate, ln.author_minor, ln.akana_minor, ln.is_placeholder_rate;
  end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. Weekly settlement. A sale 40 days old (past the refund window and the
-- first-payout hold) is payable at once; money from the last few days is not;
-- the floor carries forward. Under a monthly config the same ledger is not
-- payable until a month closes, as in 0021.
-- ---------------------------------------------------------------------------
insert into public.royalty_lines (org_id, workbook_id, kind, period, currency, livemode, units, gross_minor, tax_minor, net_base_minor,
                                  rate, author_minor, akana_minor, is_placeholder_rate, idem_key, occurred_at) values
  ('a0460000-0000-0000-0000-0000000000a1', 'a0460000-0000-0000-0000-0000000000d1', 'sale', app.money_month(now() - interval '40 days'), 'GBP', false, 1,
   2400, 400, 2000, 0.65, 1300, 700, false, 'test46:old', now() - interval '40 days');

select pg_temp.as_service();
do $$ declare b record; c record; begin
  select * into b from public.royalty_balances where org_id = 'a0460000-0000-0000-0000-0000000000a1' and currency = 'GBP' and not livemode;
  if b.balance_minor <> 1300 + 617 + 760 then raise exception 'balance %', b.balance_minor; end if;
  if b.settled_minor <> 1300 or b.payable_minor <> 1300 then
    raise exception 'weekly: settled % payable % (expected 1300)', b.settled_minor, b.payable_minor;
  end if;
  select * into c from public.payout_candidates(false) where org_id = 'a0460000-0000-0000-0000-0000000000a1';
  if c.decision <> 'pay' or c.payable_minor <> 1300 then raise exception 'weekly: expected pay 1300, got % % %', c.decision, c.reason, c.payable_minor; end if;
end $$;
reset role;

-- Below the floor, the balance carries forward.
insert into public.royalty_lines (org_id, kind, period, currency, livemode, author_minor, idem_key, note, occurred_at)
values ('a0460000-0000-0000-0000-0000000000a1', 'adjustment', app.money_month(now() - interval '35 days'), 'GBP', false, -400, 'test46:adj-down', 'Test', now() - interval '35 days');
select pg_temp.as_service();
do $$ declare c record; begin
  select * into c from public.payout_candidates(false) where org_id = 'a0460000-0000-0000-0000-0000000000a1';
  if c.decision <> 'skip' or c.reason <> 'below_minimum' then raise exception 'floor: expected below_minimum, got % %', c.decision, c.reason; end if;
end $$;
reset role;
insert into public.royalty_lines (org_id, kind, period, currency, livemode, author_minor, idem_key, note, occurred_at)
values ('a0460000-0000-0000-0000-0000000000a1', 'adjustment', app.money_month(now() - interval '34 days'), 'GBP', false, 400, 'test46:adj-up', 'Test', now() - interval '34 days');

-- A monthly config: nothing is payable until a statement closes.
insert into public.royalty_config (effective_from, is_placeholder, sale_rate_author, sale_rate_author_link, pool_share_author,
  pool_step_cap, pool_activity_floor, fee_treatment, refund_window_days, first_payout_hold_days,
  min_payout_minor, approval_above_minor, payout_day, payout_cadence, payout_weekday, note)
select now(), false, c.sale_rate_author, c.sale_rate_author_link, c.pool_share_author,
  c.pool_step_cap, c.pool_activity_floor, c.fee_treatment, c.refund_window_days, c.first_payout_hold_days,
  c.min_payout_minor, c.approval_above_minor, c.payout_day, 'monthly', 5, 'Test fixture: monthly'
from app.royalty_config() c;
select pg_temp.as_service();
do $$ declare b record; c record; begin
  select * into b from public.royalty_balances where org_id = 'a0460000-0000-0000-0000-0000000000a1' and currency = 'GBP' and not livemode;
  if b.payable_minor <> 0 then raise exception 'monthly: payable % before any statement closes', b.payable_minor; end if;
  select * into c from public.payout_candidates(false) where org_id = 'a0460000-0000-0000-0000-0000000000a1';
  if c.reason <> 'nothing_due' then raise exception 'monthly: expected nothing_due, got %', c.reason; end if;
  perform public.close_due_statements(false);
  select * into b from public.royalty_balances where org_id = 'a0460000-0000-0000-0000-0000000000a1' and currency = 'GBP' and not livemode;
  if b.payable_minor <> 1300 then raise exception 'monthly: payable % after the old month closes (expected 1300)', b.payable_minor; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 5. The two-person yearly plan: subscription, consent and seat.
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
do $$ declare r text; begin
  r := public.upsert_subscription('sub_price46', 'cus_price46', 'a0460000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a',
    'active', 'member_two_year', 'price_test_two_year', now() + interval '300 days', false, null, null, null, now());
  if r <> 'applied' then raise exception 'two-person yearly subscription: %', r; end if;
  if (select plan from public.subscriptions where stripe_subscription_id = 'sub_price46') is distinct from 'member_two_year' then
    raise exception 'the yearly two-person plan was not kept';
  end if;
end $$;
reset role;

select test_as('a0460000-0000-0000-0000-000000000002');
do $$ declare v text; id bigint; sid uuid; st record; begin
  select version into v from public.checkout_consent_wordings where kind = 'membership' order by published_at desc limit 1;
  id := public.record_checkout_consent('membership', v, '00000000-0000-0000-0000-00000000000a', null, 'member_two_year');
  if id is null then raise exception 'no consent recorded for the yearly two-person plan'; end if;
  begin
    perform public.record_checkout_consent('membership', v, '00000000-0000-0000-0000-00000000000a', null, 'member_two_week');
    raise exception 'an unknown plan was accepted';
  exception when sqlstate 'AKC03' then null; end;
  sid := public.seat_create_invite(encode(sha256(convert_to('token46', 'UTF8')), 'hex'), '00000000-0000-0000-0000-00000000000a');
  if sid is null then raise exception 'no invitation on the yearly two-person plan'; end if;
  select * into st from public.my_shared_seat('00000000-0000-0000-0000-00000000000a');
  if st.seat_status is distinct from 'invited' then raise exception 'seat state is %', st.seat_status; end if;
end $$;
reset role;

rollback;
