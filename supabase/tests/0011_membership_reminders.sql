-- Membership reminders (0011): which monthly members are due the six-monthly
-- terms reminder, and the stamp that stops a second one. Each block must
-- raise or return the expected rows; a failure aborts the script and the CI
-- step.
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('a0110000-0000-0000-0000-000000000001', 'reader-11a@test'),
  ('a0110000-0000-0000-0000-000000000002', 'reader-11b@test'),
  ('a0110000-0000-0000-0000-000000000003', 'reader-11c@test');

create or replace function pg_temp.as_service() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "service_role"}'::text, true);
  execute 'set local role service_role';
end $$;

-- Subscriptions, recorded the way the webhook records them.
select pg_temp.as_service();
do $$
declare
  t constant uuid := '00000000-0000-0000-0000-00000000000a';
  a constant uuid := 'a0110000-0000-0000-0000-000000000001';
  b constant uuid := 'a0110000-0000-0000-0000-000000000002';
  c constant uuid := 'a0110000-0000-0000-0000-000000000003';
  r text;
begin
  -- due: monthly, seven months in, renews in 7 days
  r := public.upsert_subscription('sub_e1', 'cus_e1', a, t, 'active', 'member_month', 'price_m', now() + interval '7 days', false, null, null, null, now());
  -- renews too soon (2 days) and too late (20 days)
  r := public.upsert_subscription('sub_e2', 'cus_e1', a, t, 'active', 'member_month', 'price_m', now() + interval '2 days', false, null, null, null, now());
  r := public.upsert_subscription('sub_e3', 'cus_e1', a, t, 'active', 'member_month', 'price_m', now() + interval '20 days', false, null, null, null, now());
  -- only five months in
  r := public.upsert_subscription('sub_e4', 'cus_e1', a, t, 'active', 'member_month', 'price_m', now() + interval '7 days', false, null, null, null, now());
  -- set to end at period end, or by a cancel_at date
  r := public.upsert_subscription('sub_e5', 'cus_e1', a, t, 'active', 'member_month', 'price_m', now() + interval '7 days', true, null, now(), null, now());
  r := public.upsert_subscription('sub_e5b', 'cus_e1', a, t, 'active', 'member_month', 'price_m', now() + interval '7 days', false, now() + interval '7 days', now(), null, now());
  -- annual: renewal_notice covers it
  r := public.upsert_subscription('sub_e6', 'cus_e1', a, t, 'active', 'member_year', 'price_y', now() + interval '7 days', false, null, null, null, now());
  -- reminded two months ago
  r := public.upsert_subscription('sub_e7', 'cus_e2', b, t, 'active', 'member_month', 'price_m', now() + interval '7 days', false, null, null, null, now());
  -- reminded six months and a day ago, no paid invoice on record
  r := public.upsert_subscription('sub_e8', 'cus_e2', b, t, 'active', 'member_month', 'price_m', now() + interval '10 days', false, null, null, null, now());
  -- past_due: not in good standing
  r := public.upsert_subscription('sub_e9', 'cus_e2', b, t, 'past_due', 'member_month', 'price_m', now() + interval '7 days', false, null, null, null, now());
  -- due, but the reader is deleting their account
  r := public.upsert_subscription('sub_e10', 'cus_e3', c, t, 'active', 'member_month', 'price_m', now() + interval '7 days', false, null, null, null, now());

  r := public.record_subscription_invoice('in_e1a', 'sub_e1', 'paid', 'gbp', 799, 133, 'subscription_cycle',
    now() - interval '60 days', now() - interval '30 days', now() - interval '30 days');
  r := public.record_subscription_invoice('in_e1b', 'sub_e1', 'paid', 'gbp', 849, 141, 'subscription_cycle',
    now() - interval '30 days', now(), now() - interval '1 day');
  r := public.record_subscription_invoice('in_e1c', 'sub_e1', 'failed', 'gbp', 999, 0, 'subscription_cycle',
    now() - interval '1 hour', now(), now() - interval '1 hour');
end $$;
reset role;

update public.subscriptions set created_at = now() - interval '7 months'
 where stripe_subscription_id in ('sub_e1','sub_e2','sub_e3','sub_e5','sub_e5b','sub_e6','sub_e9','sub_e10');
update public.subscriptions set created_at = now() - interval '5 months' where stripe_subscription_id = 'sub_e4';
update public.subscriptions set created_at = now() - interval '2 years', last_terms_reminder_at = now() - interval '2 months'
 where stripe_subscription_id = 'sub_e7';
update public.subscriptions set created_at = now() - interval '2 years', last_terms_reminder_at = now() - interval '6 months' - interval '1 day'
 where stripe_subscription_id = 'sub_e8';

-- The reader on sub_e10 asks to delete their account.
select test_as('a0110000-0000-0000-0000-000000000003');
do $$ begin perform public.request_account_deletion(null); end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 1. Only sub_e1 and sub_e8 are due, with the latest paid amount.
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
do $$
declare
  ids text[];
  r record;
begin
  select array_agg(stripe_subscription_id order by stripe_subscription_id) into ids from public.due_terms_reminders();
  if ids is distinct from array['sub_e1', 'sub_e8'] then raise exception 'due should be sub_e1 and sub_e8, saw %', ids; end if;

  select * into r from public.due_terms_reminders() where stripe_subscription_id = 'sub_e1';
  if r.email <> 'reader-11a@test' then raise exception 'wrong address for sub_e1: %', r.email; end if;
  if r.amount_minor <> 849 or r.currency <> 'GBP' then raise exception 'sub_e1 price should be the latest paid 849 GBP, saw % %', r.amount_minor, r.currency; end if;
  if r.reminder_anchor_at > now() - interval '6 months' then raise exception 'sub_e1 anchor should be the start'; end if;

  select * into r from public.due_terms_reminders() where stripe_subscription_id = 'sub_e8';
  if r.amount_minor is not null or r.currency is not null then raise exception 'sub_e8 has no paid invoice, saw % %', r.amount_minor, r.currency; end if;
end $$;
reset role;

-- At a time 10 days on, sub_e1 renews in -3 days and sub_e4 is still short of six months.
select pg_temp.as_service();
do $$ declare ids text[]; begin
  select array_agg(stripe_subscription_id order by stripe_subscription_id) into ids from public.due_terms_reminders(now() + interval '10 days');
  if ids is not null and 'sub_e1' = any(ids) then raise exception 'sub_e1 due after its renewal: %', ids; end if;
  if ids is not null and 'sub_e4' = any(ids) then raise exception 'sub_e4 due at five months: %', ids; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 2. The stamp: once sent, not due again; never moved backwards; audited.
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
do $$ declare ids text[]; begin
  if not public.mark_terms_reminder_sent('sub_e1', now()) then raise exception 'first stamp returned false'; end if;
  if public.mark_terms_reminder_sent('sub_e1', now()) then raise exception 'repeated stamp returned true'; end if;
  if public.mark_terms_reminder_sent('sub_e1', now() - interval '1 day') then raise exception 'an earlier stamp moved it back'; end if;
  if public.mark_terms_reminder_sent('sub_missing', now()) then raise exception 'stamped an unknown subscription'; end if;
  select array_agg(stripe_subscription_id order by stripe_subscription_id) into ids from public.due_terms_reminders();
  if ids is distinct from array['sub_e8'] then raise exception 'after the stamp due should be sub_e8 only, saw %', ids; end if;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.audit_log where action = 'commerce.terms_reminder_sent' and target = 'subscription:sub_e1') <> 1 then
    raise exception 'expected one audit row for the stamp'; end if;
  if (select last_terms_reminder_at from public.subscriptions where stripe_subscription_id = 'sub_e1') < now() - interval '1 minute' then
    raise exception 'stamp not stored'; end if;
end $$;

-- Six months after the stamp, with a renewal 7 days off, it is due again.
update public.subscriptions set current_period_end = now() + interval '6 months' + interval '7 days'
 where stripe_subscription_id = 'sub_e1';
select pg_temp.as_service();
do $$ declare ids text[]; begin
  select array_agg(stripe_subscription_id order by stripe_subscription_id) into ids from public.due_terms_reminders(now() + interval '6 months' + interval '1 hour');
  if ids is null or not ('sub_e1' = any(ids)) then raise exception 'sub_e1 not due six months after its reminder: %', ids; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. Readers and anon cannot read the list or stamp anything.
-- ---------------------------------------------------------------------------
select test_as('a0110000-0000-0000-0000-000000000001');
do $$ begin
  begin
    perform public.due_terms_reminders();
    raise exception 'a reader read due reminders';
  exception when insufficient_privilege then null; end;
  begin
    perform public.mark_terms_reminder_sent('sub_e8', now());
    raise exception 'a reader stamped a reminder';
  exception when insufficient_privilege then null; end;
  begin
    perform app.due_terms_reminders(now());
    raise exception 'a reader called app.due_terms_reminders';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role anon;
do $$ begin
  begin
    perform public.due_terms_reminders();
    raise exception 'anon read due reminders';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

rollback;
\echo PASS 0011_membership_reminders
