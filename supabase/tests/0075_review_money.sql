-- 0075 Review fixes, money: one live membership per reader (M9), disputes
-- suspend and restore access (M10), the cooling-off window's dates (M11), a
-- failed refund and a failed bank payout (L7), and the referral payment
-- lookup with an idempotent reversal (M8). Each block must raise or return
-- the expected value; a failure aborts the script.
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('75750000-0000-0000-0000-000000000001', 'one75@test'),
  ('75750000-0000-0000-0000-000000000002', 'two75@test'),
  ('75750000-0000-0000-0000-000000000003', 'buyer75@test'),
  ('75750000-0000-0000-0000-000000000004', 'member75@test'),
  ('75750000-0000-0000-0000-000000000005', 'referrer75@test'),
  ('75750000-0000-0000-0000-000000000006', 'friend75@test'),
  ('75750000-0000-0000-0000-000000000007', 'dup75@test');
insert into public.profiles (user_id)
select ('75750000-0000-0000-0000-00000000000' || n)::uuid from generate_series(1, 7) n on conflict do nothing;

insert into public.organisations (id, code, kind, legal_name, display_name, slug, country, tax_residence, stripe_connect_id, connect_status) values
  ('75750000-0000-0000-0000-0000000000a1', 'PB-TQD75', 'publisher', 'Money Seventy Five Ltd', 'Money 75', 'money-75', 'GB', 'GB', 'acct_money75', 'verified');
insert into public.books (id, org_id, slug, title) values
  ('75750000-0000-0000-0000-0000000000c1', '75750000-0000-0000-0000-0000000000a1', 'money-75-book', 'Money 75 Book');
insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, depth, status, badge) values
  ('75750000-0000-0000-0000-0000000000d1', 'AK-TQD75', '75750000-0000-0000-0000-0000000000c1', '75750000-0000-0000-0000-0000000000a1',
   'money-75-wb', 'Money 75 WB', 'Card', 'productivity', 'full', 'approved', 'official'),
  ('75750000-0000-0000-0000-0000000000d2', 'AK-TQD76', '75750000-0000-0000-0000-0000000000c1', '75750000-0000-0000-0000-0000000000a1',
   'money-76-wb', 'Money 76 WB', 'Card', 'productivity', 'full', 'approved', 'official');

create or replace function pg_temp.as_service() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "service_role"}'::text, true);
  execute 'set local role service_role';
end $$;

-- ---------------------------------------------------------------------------
-- 1. M9. One live membership per reader and tenant.
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
do $$
declare
  t constant uuid := '00000000-0000-0000-0000-00000000000a';
  u constant uuid := '75750000-0000-0000-0000-000000000001';
  r text;
begin
  r := public.upsert_subscription('sub_75a', 'cus_75a', u, t, 'trialing', 'member_month', 'price_m', now() + interval '14 days', false, null, null, null, now());
  if r <> 'applied' then raise exception 'first subscription should apply, saw %', r; end if;
  -- an incomplete second one is allowed: a failed first payment can be tried again
  r := public.upsert_subscription('sub_75b', 'cus_75a', u, t, 'incomplete', 'member_month', 'price_m', null, false, null, null, null, now());
  if r <> 'applied' then raise exception 'an incomplete second subscription should apply, saw %', r; end if;
  -- a second live one is refused, as a new row and as a change of status
  begin
    r := public.upsert_subscription('sub_75c', 'cus_75a', u, t, 'trialing', 'member_month', 'price_m', now() + interval '14 days', false, null, null, null, now());
    raise exception 'a second trial was recorded';
  exception when unique_violation then
    -- the webhook tells this refusal from any other by the index's name
    get stacked diagnostics r = constraint_name;
    if r <> 'subscriptions_one_live_idx' then raise exception 'refused by %, not by the one-live index', r; end if;
    if sqlerrm not like '%subscriptions_one_live_idx%' then raise exception 'the refusal should name the index, saw %', sqlerrm; end if;
  end;
  -- the duplicate, once cancelled in Stripe, is recorded as cancelled and the first stays live
  r := public.upsert_subscription('sub_75c', 'cus_75a', u, t, 'canceled', 'member_month', 'price_m', null, false, null, now(), now(), now());
  if r <> 'applied' then raise exception 'a cancelled duplicate should be recorded, saw %', r; end if;
  if (select status from public.entitlements where user_id = u and source = 'membership') <> 'active' then
    raise exception 'closing the duplicate must not take the membership away';
  end if;
  begin
    r := public.upsert_subscription('sub_75b', 'cus_75a', u, t, 'active', 'member_month', 'price_m', now() + interval '30 days', false, null, null, null, now() + interval '1 second');
    raise exception 'a second live subscription was recorded';
  exception when unique_violation then null; end;
  begin
    r := public.upsert_subscription('sub_75b', 'cus_75a', u, t, 'past_due', 'member_month', 'price_m', now() + interval '30 days', false, null, null, null, now() + interval '2 seconds');
    raise exception 'a second past_due subscription was recorded';
  exception when unique_violation then null; end;
  -- once the first has ended, the next one may be live
  r := public.upsert_subscription('sub_75a', 'cus_75a', u, t, 'canceled', 'member_month', 'price_m', null, false, null, now(), now(), now() + interval '3 seconds');
  r := public.upsert_subscription('sub_75b', 'cus_75a', u, t, 'active', 'member_month', 'price_m', now() + interval '30 days', false, null, null, null, now() + interval '4 seconds');
  if r <> 'applied' then raise exception 'a new membership after the old one ended should apply, saw %', r; end if;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- The clean-up step: with the index gone and two live rows, running the
-- migration again keeps the oldest, marks the later one canceled, deletes
-- nothing, audits it and puts the index back. This also runs 0075 twice.
drop index public.subscriptions_one_live_idx;
insert into public.subscriptions (user_id, tenant_id, stripe_customer_id, stripe_subscription_id, plan, status, observed_at, created_at) values
  ('75750000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-00000000000a', 'cus_75d', 'sub_75old', 'member_month', 'active', now(), now() - interval '2 days'),
  ('75750000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-00000000000a', 'cus_75d', 'sub_75new', 'member_month', 'trialing', now(), now() - interval '1 day');
-- No claims, as on production: a migration runs as the database owner.
select set_config('request.jwt.claims', '', true);
\i supabase/migrations/0075_review_money.sql
do $$ begin
  if (select count(*) from public.subscriptions where user_id = '75750000-0000-0000-0000-000000000007') <> 2 then
    raise exception 'the clean-up must not delete a subscription';
  end if;
  if (select status from public.subscriptions where stripe_subscription_id = 'sub_75old') <> 'active' then
    raise exception 'the oldest live subscription should be kept';
  end if;
  if (select status from public.subscriptions where stripe_subscription_id = 'sub_75new') <> 'canceled' then
    raise exception 'the later duplicate should be marked canceled';
  end if;
  if (select count(*) from public.audit_log where action = 'commerce.subscription_duplicate_closed' and target = 'subscription:sub_75new') <> 1 then
    raise exception 'the duplicate should be audited once';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'subscriptions_one_live_idx') then
    raise exception 'the index should be back';
  end if;
  -- the reader still has the membership through the one that was kept
  if exists (select 1 from public.entitlements where user_id = '75750000-0000-0000-0000-000000000007' and source = 'membership' and status <> 'active') then
    raise exception 'the clean-up took the membership away';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. M11. The window's dates are stored; a null never clears one; a reader
--    cannot write them.
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
do $$
declare r text;
begin
  r := public.record_subscription_window('sub_75b', '2026-11-01T10:00:00Z', '2026-11-15T10:00:00Z');
  if r <> 'set' then raise exception 'window should be set, saw %', r; end if;
  r := public.record_subscription_window('sub_75b', '2026-11-01T10:00:00Z', null);
  if r <> 'unchanged' then raise exception 'a null trial end should change nothing, saw %', r; end if;
  if public.record_subscription_window('sub_missing', now(), null) <> 'unknown' then raise exception 'unknown subscription'; end if;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
do $$ begin
  if (select trial_end from public.subscriptions where stripe_subscription_id = 'sub_75b') <> '2026-11-15T10:00:00Z' then
    raise exception 'trial end not stored';
  end if;
end $$;
select test_as('75750000-0000-0000-0000-000000000001');
do $$ begin
  begin
    perform public.record_subscription_window('sub_75b', now(), now());
    raise exception 'a reader set the window';
  exception when insufficient_privilege then null; end;
  begin
    perform public.dispute_open('dp_75x', 'pi_75wb');
    raise exception 'a reader opened a dispute';
  exception when insufficient_privilege then null; end;
  begin
    perform public.restore_after_failed_refund('pi_75wb', 're_75', 0);
    raise exception 'a reader restored a purchase';
  exception when insufficient_privilege then null; end;
  begin
    perform public.note_connect_payout_failed('acct_money75', 'po_75x', 'x', 1, 'gbp', false);
    raise exception 'a reader recorded a payout failure';
  exception when insufficient_privilege then null; end;
  begin
    perform public.referral_first_payment_intent('75750000-0000-0000-0000-000000000006');
    raise exception 'a reader read a referral payment';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- 3. M10. A dispute on a workbook purchase: suspended, restored when won,
--    refunded and closed when lost.
-- ---------------------------------------------------------------------------
insert into public.purchases (id, user_id, tenant_id, workbook_id, kind, stripe_checkout_session_id, currency, amount_minor, status) values
  ('75750000-0000-0000-0000-0000000000e1', '75750000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000a',
   '75750000-0000-0000-0000-0000000000d1', 'workbook', 'cs_test_75wb', 'GBP', 1200, 'pending'),
  ('75750000-0000-0000-0000-0000000000e2', '75750000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000a',
   '75750000-0000-0000-0000-0000000000d2', 'workbook', 'cs_test_75wc', 'GBP', 1200, 'pending');
select pg_temp.as_service();
do $$
declare j jsonb;
begin
  perform public.grant_purchase_entitlement('75750000-0000-0000-0000-0000000000e1', 'pi_75wb', null, 1200, 200, 'GBP');
  perform public.grant_purchase_entitlement('75750000-0000-0000-0000-0000000000e2', 'pi_75wc', null, 1200, 200, 'GBP');

  j := public.dispute_open('dp_75a', 'pi_75wb');
  if j ->> 'kind' <> 'workbook' or (j ->> 'changed')::boolean is not true then raise exception 'dispute should suspend the workbook, saw %', j; end if;
  if (select status from public.entitlements where purchase_id = '75750000-0000-0000-0000-0000000000e1') <> 'revoked' then
    raise exception 'access should be suspended while the dispute is open';
  end if;
  if (select status from public.purchases where id = '75750000-0000-0000-0000-0000000000e1') <> 'paid' then
    raise exception 'the purchase stays paid while the dispute is open';
  end if;
  j := public.dispute_open('dp_75a', 'pi_75wb');
  if (j ->> 'changed')::boolean then raise exception 'a repeated dispute event should change nothing'; end if;

  j := public.dispute_close('dp_75a', 'pi_75wb', 'won');
  if j ->> 'status' <> 'won' then raise exception 'dispute should be won, saw %', j; end if;
  if (select status from public.entitlements where purchase_id = '75750000-0000-0000-0000-0000000000e1') <> 'active' then
    raise exception 'access should come back when the dispute is won';
  end if;
  j := public.dispute_close('dp_75a', 'pi_75wb', 'lost');
  if j ->> 'status' <> 'won' or (j ->> 'changed')::boolean then raise exception 'a closed dispute should not change, saw %', j; end if;

  -- lost, arriving with no earlier open event
  j := public.dispute_close('dp_75b', 'pi_75wc', 'lost');
  if j ->> 'kind' <> 'workbook' or j ->> 'status' <> 'lost' then raise exception 'lost dispute, saw %', j; end if;
  if (select status from public.entitlements where purchase_id = '75750000-0000-0000-0000-0000000000e2') <> 'revoked' then
    raise exception 'access should stay closed when the dispute is lost';
  end if;
  if (select status from public.purchases where id = '75750000-0000-0000-0000-0000000000e2') <> 'refunded' then
    raise exception 'a lost dispute should mark the purchase refunded';
  end if;
  -- a late open event for a closed dispute changes nothing
  j := public.dispute_open('dp_75b', 'pi_75wc');
  if (j ->> 'changed')::boolean then raise exception 'a late open event reopened a closed dispute'; end if;

  -- nothing we know: recorded as unmatched, nothing touched
  j := public.dispute_open('dp_75zz', 'pi_75nobody');
  if j ->> 'kind' <> 'unmatched' then raise exception 'unknown payment should be unmatched, saw %', j; end if;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- A dispute on a membership payment: the entitlement lapses, a later
-- subscription event does not bring it back, a win does.
select pg_temp.as_service();
do $$
declare
  t constant uuid := '00000000-0000-0000-0000-00000000000a';
  u constant uuid := '75750000-0000-0000-0000-000000000004';
  j jsonb;
  r text;
begin
  r := public.upsert_subscription('sub_75m', 'cus_75m', u, t, 'active', 'member_month', 'price_m', now() + interval '30 days', false, null, null, null, now());
  r := public.record_subscription_invoice('in_75m', 'sub_75m', 'paid', 'gbp', 799, 133, 'subscription_create', now(), now() + interval '30 days', now());
  if (select status from public.entitlements where user_id = u and source = 'membership') <> 'active' then raise exception 'membership should be active'; end if;

  j := public.dispute_open('dp_75m', 'pi_75m', 'in_75m');
  if j ->> 'kind' <> 'membership' or j ->> 'subscription' <> 'sub_75m' then raise exception 'dispute should match the membership, saw %', j; end if;
  if (select status from public.entitlements where user_id = u and source = 'membership') <> 'lapsed' then
    raise exception 'membership access should be suspended while the dispute is open';
  end if;
  -- a renewal event while the dispute is open must not reopen access
  r := public.upsert_subscription('sub_75m', 'cus_75m', u, t, 'active', 'member_month', 'price_m', now() + interval '60 days', false, null, null, null, now() + interval '1 second');
  perform public.sync_membership_entitlement(u, t);
  if (select status from public.entitlements where user_id = u and source = 'membership') <> 'lapsed' then
    raise exception 'a subscription event reopened access during a dispute';
  end if;

  j := public.dispute_close('dp_75m', 'pi_75m', 'won', 'in_75m');
  if (select status from public.entitlements where user_id = u and source = 'membership') <> 'active' then
    raise exception 'membership access should come back when the dispute is won';
  end if;

  j := public.dispute_close('dp_75n', 'pi_75n', 'lost', 'in_75m');
  if j ->> 'subscription' <> 'sub_75m' then raise exception 'lost dispute should name the subscription, saw %', j; end if;
  perform public.sync_membership_entitlement(u, t);
  if (select status from public.entitlements where user_id = u and source = 'membership') <> 'lapsed' then
    raise exception 'membership access should stay closed when the dispute is lost';
  end if;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- 4. L7. A failed refund puts back what the refund closed.
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
do $$
declare r text;
begin
  r := public.restore_after_failed_refund('pi_75wb', 're_75a', 0);
  if r <> 'unchanged' then raise exception 'a purchase that was never refunded should be unchanged, saw %', r; end if;
  perform public.revoke_purchase_entitlement('75750000-0000-0000-0000-0000000000e1', 'charge.refunded');
  if (select status from public.entitlements where purchase_id = '75750000-0000-0000-0000-0000000000e1') <> 'revoked' then raise exception 'setup: refund should revoke'; end if;
  -- another refund still covers the whole price: nothing to restore
  r := public.restore_after_failed_refund('pi_75wb', 're_75a', 1200);
  if r <> 'still_refunded' then raise exception 'expected still_refunded, saw %', r; end if;
  r := public.restore_after_failed_refund('pi_75wb', 're_75a', 0);
  if r <> 'restored' then raise exception 'expected restored, saw %', r; end if;
  if (select status from public.entitlements where purchase_id = '75750000-0000-0000-0000-0000000000e1') <> 'active' then
    raise exception 'access should be back after the refund failed';
  end if;
  if (select status from public.purchases where id = '75750000-0000-0000-0000-0000000000e1') <> 'paid' then raise exception 'purchase should be paid again'; end if;
  r := public.restore_after_failed_refund('pi_75wb', 're_75a', 0);
  if r <> 'unchanged' then raise exception 'a repeat should be unchanged, saw %', r; end if;
  -- a purchase closed by a lost dispute is not reopened by a failed refund
  r := public.restore_after_failed_refund('pi_75wc', 're_75b', 0);
  if r <> 'disputed' then raise exception 'expected disputed, saw %', r; end if;
  if public.restore_after_failed_refund('pi_75nobody', 're_75c', 0) <> 'none' then raise exception 'unknown payment'; end if;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- A failed bank payout: recorded once, stamped on the latest paid payout,
-- and further payouts held.
insert into public.payouts (id, org_id, currency, livemode, amount_minor, status, stripe_destination, stripe_transfer_id, paid_at) values
  ('75750000-0000-0000-0000-0000000000f1', '75750000-0000-0000-0000-0000000000a1', 'GBP', false, 5000, 'paid', 'acct_money75', 'tr_75a', now() - interval '2 days');
select pg_temp.as_service();
do $$
declare r record;
begin
  select * into r from public.note_connect_payout_failed('acct_money75', 'po_75a', 'account_closed', 5000, 'gbp', false);
  if r.org_id <> '75750000-0000-0000-0000-0000000000a1' or r.recorded is not true then raise exception 'payout failure should be recorded, saw %', r; end if;
  select * into r from public.note_connect_payout_failed('acct_money75', 'po_75a', 'account_closed', 5000, 'gbp', false);
  if r.recorded then raise exception 'a repeated event recorded twice'; end if;
  select * into r from public.note_connect_payout_failed('acct_money75', 'po_75b', 'no_account', 100, 'gbp', false);
  if r.recorded is not true then raise exception 'a second failed payout should be recorded'; end if;
  select * into r from public.note_connect_payout_failed('acct_unknown75', 'po_75c', 'x', 1, 'gbp', false);
  if r.org_id is not null or r.recorded then raise exception 'an unknown account should record nothing'; end if;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
do $$ begin
  if (select bank_failure_code from public.payouts where id = '75750000-0000-0000-0000-0000000000f1') is null
     or (select bank_failed_at from public.payouts where id = '75750000-0000-0000-0000-0000000000f1') is null then
    raise exception 'the payout should carry the bank failure';
  end if;
  if (select status from public.payouts where id = '75750000-0000-0000-0000-0000000000f1') <> 'paid' then
    raise exception 'the transfer stands, so the payout row stays paid';
  end if;
  if (select count(*) from public.payout_holds where org_id = '75750000-0000-0000-0000-0000000000a1' and released_at is null) <> 1 then
    raise exception 'one hold should stop further payouts';
  end if;
  if (select count(*) from public.payout_bank_failures where org_id = '75750000-0000-0000-0000-0000000000a1') <> 2 then
    raise exception 'two failures should be on record';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. M8. The friend's first payment is found, and the reward goes back once.
-- ---------------------------------------------------------------------------
insert into public.referrals (id, referrer_id, referred_id, code, status, reward_kind, reward_value, reward_currency, first_payment_intent, qualified_at, rewarded_at) values
  ('75750000-0000-0000-0000-0000000000b1', '75750000-0000-0000-0000-000000000005', '75750000-0000-0000-0000-000000000006', 'ABCDEF7501',
   'rewarded', 'trial_days', 7, null, 'pi_75friend', now(), now());
select pg_temp.as_service();
do $$
declare n int;
begin
  if public.referral_first_payment_intent('75750000-0000-0000-0000-000000000006') <> 'pi_75friend' then raise exception 'first payment not found'; end if;
  if public.referral_first_payment_intent('75750000-0000-0000-0000-000000000001') is not null then raise exception 'no referral should give null'; end if;
  select count(*) into n from public.referral_reverse('pi_75friend', 'refunded');
  if n <> 1 then raise exception 'the reward should be handed back for reversal, saw % rows', n; end if;
  if public.referral_reversed('75750000-0000-0000-0000-0000000000b1', null) <> 'reversed' then raise exception 'reversal not recorded'; end if;
  -- a second refund event, or the cancel after the refund: nothing more to take back
  select count(*) into n from public.referral_reverse('pi_75friend', 'refunded');
  if n <> 0 then raise exception 'a repeated reversal handed the reward back again'; end if;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- RX-6. A row written before 0075 has no window dates until Stripe sends
-- another event. The backfill fills them from what the row and its invoices
-- hold, in the webhook's order, so the cancel page and the webhook agree.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('75750000-0000-0000-0000-000000000008', 'oldtrial75@test'),
  ('75750000-0000-0000-0000-000000000009', 'oldplain75@test'),
  ('75750000-0000-0000-0000-00000000000a', 'oldtrialing75@test');
insert into public.subscriptions (user_id, tenant_id, stripe_customer_id, stripe_subscription_id, plan, status, current_period_end, observed_at, created_at) values
  -- a 14 day trial that began 20 days ago; the first charge was 6 days ago
  ('75750000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-00000000000a', 'cus_75old1', 'sub_75old1', 'member_month', 'active', now() + interval '24 days', now(), now() - interval '20 days'),
  -- no trial, paid 3 days ago
  ('75750000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-00000000000a', 'cus_75old2', 'sub_75old2', 'member_month', 'active', now() + interval '27 days', now(), now() - interval '3 days'),
  -- still in its trial, no invoice that took money
  ('75750000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'cus_75old3', 'sub_75old3', 'member_year', 'trialing', now() + interval '10 days', now(), now() - interval '4 days');
insert into public.subscription_invoices (user_id, tenant_id, stripe_invoice_id, stripe_subscription_id, status, currency, amount_minor, billing_reason, period_start, period_end, paid_at) values
  ('75750000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-00000000000a', 'in_75old1a', 'sub_75old1', 'paid', 'GBP', 0, 'subscription_create', now() - interval '20 days' - interval '5 seconds', now() - interval '6 days', now() - interval '20 days'),
  ('75750000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-00000000000a', 'in_75old1b', 'sub_75old1', 'paid', 'GBP', 799, 'subscription_cycle', now() - interval '6 days', now() + interval '24 days', now() - interval '6 days'),
  ('75750000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-00000000000a', 'in_75old2a', 'sub_75old2', 'paid', 'GBP', 799, 'subscription_create', now() - interval '3 days' - interval '5 seconds', now() + interval '27 days', now() - interval '3 days');
do $$
declare s public.subscriptions; n int;
begin
  -- as the rows stood before the fix: nothing to count from but created_at
  if exists (select 1 from public.subscriptions where stripe_subscription_id like 'sub_75old_' and (started_at is not null or trial_end is not null)) then
    raise exception 'the old rows should start with no window dates';
  end if;
  n := app.backfill_subscription_window();
  if n < 3 then raise exception 'three old rows should be filled, saw %', n; end if;

  select * into s from public.subscriptions where stripe_subscription_id = 'sub_75old1';
  if s.trial_end is distinct from now() - interval '6 days' then raise exception 'the trial end should be the first paid period start, saw %', s.trial_end; end if;
  if s.started_at is distinct from now() - interval '20 days' - interval '5 seconds' then raise exception 'the start should be the first invoice period start, saw %', s.started_at; end if;
  -- the point of the fix: the window opens at the trial end, so day 6 of 14, not day 20
  if not (greatest(s.started_at, s.trial_end) + interval '14 days' > now()) then raise exception 'the window should still be open'; end if;
  if s.created_at + interval '14 days' > now() then raise exception 'the test row should be past 14 days from created_at'; end if;

  select * into s from public.subscriptions where stripe_subscription_id = 'sub_75old2';
  if s.trial_end is not null then raise exception 'a membership with no trial gets no trial end, saw %', s.trial_end; end if;
  if s.started_at is distinct from now() - interval '3 days' - interval '5 seconds' then raise exception 'start not taken from the first invoice, saw %', s.started_at; end if;

  select * into s from public.subscriptions where stripe_subscription_id = 'sub_75old3';
  if s.trial_end is distinct from s.current_period_end then raise exception 'a trialing row takes its period end as the trial end'; end if;
  if s.started_at is distinct from s.created_at then raise exception 'created_at is the last resort for the start'; end if;

  -- dates Stripe has sent are never replaced, and a second run changes nothing
  if (select trial_end from public.subscriptions where stripe_subscription_id = 'sub_75b') <> '2026-11-15T10:00:00Z'
     or (select started_at from public.subscriptions where stripe_subscription_id = 'sub_75b') <> '2026-11-01T10:00:00Z' then
    raise exception 'the backfill replaced dates from Stripe';
  end if;
  if app.backfill_subscription_window() <> 0 then raise exception 'a second run should change nothing'; end if;
  if has_function_privilege('service_role', 'app.backfill_subscription_window()', 'execute')
     or has_function_privilege('authenticated', 'app.backfill_subscription_window()', 'execute') then
    raise exception 'the backfill is not for API roles';
  end if;
end $$;

rollback;
