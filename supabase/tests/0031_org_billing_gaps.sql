-- 0031: consumer organisers (buyer type, reminder notices, cooling-off),
-- the billing email outbox and its contacts, church band changes, and the
-- self-serve organiser's own seat. Each block must raise or return the
-- expected value; a failure aborts the script.
\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
-- 01 consumer organiser, 02 member of the group, 03 business owner,
-- 04 business finance, 05 business viewer, 06 platform editor, 07 outsider,
-- 08 church owner, 09 organiser with no 18+ confirmation, 10 seat holder.
insert into auth.users (id, email) values
  ('a0310000-0000-0000-0000-000000000001', 'organiser31@home31.example'),
  ('a0310000-0000-0000-0000-000000000002', 'friend31@home31.example'),
  ('a0310000-0000-0000-0000-000000000003', 'owner31@work31.example'),
  ('a0310000-0000-0000-0000-000000000004', 'finance31@work31.example'),
  ('a0310000-0000-0000-0000-000000000005', 'viewer31@work31.example'),
  ('a0310000-0000-0000-0000-000000000006', 'editor31@akana.example'),
  ('a0310000-0000-0000-0000-000000000007', 'outsider31@other31.example'),
  ('a0310000-0000-0000-0000-000000000008', 'vicar31@church31.example'),
  ('a0310000-0000-0000-0000-000000000009', 'young31@home31.example'),
  ('a0310000-0000-0000-0000-000000000010', 'holder31@work31.example');
insert into public.profiles (user_id) values
  ('a0310000-0000-0000-0000-000000000001'), ('a0310000-0000-0000-0000-000000000002'), ('a0310000-0000-0000-0000-000000000009'),
  ('a0310000-0000-0000-0000-000000000010')
on conflict do nothing;

-- A business (staff made, invoiced) and a church.
insert into public.organisations (id, kind, legal_name, display_name, slug, country) values
  ('a0310000-0000-0000-0000-0000000000f2', 'business', 'Biz 31 Ltd', 'Biz 31', 'biz-31', 'GB'),
  ('a0310000-0000-0000-0000-0000000000f3', 'church', 'St Thirty-One', 'St Thirty-One', 'church-31', 'GB');
insert into public.org_profiles (org_id, billing_name, billing_email, billing_country) values
  ('a0310000-0000-0000-0000-0000000000f2', 'Pat Payer', 'accounts@work31.example', 'GB'),
  ('a0310000-0000-0000-0000-0000000000f3', null, null, 'GB');
insert into public.org_members (org_id, user_id, role) values
  ('a0310000-0000-0000-0000-0000000000f2', 'a0310000-0000-0000-0000-000000000003', 'owner'),
  ('a0310000-0000-0000-0000-0000000000f2', 'a0310000-0000-0000-0000-000000000004', 'finance'),
  ('a0310000-0000-0000-0000-0000000000f2', 'a0310000-0000-0000-0000-000000000005', 'viewer'),
  ('a0310000-0000-0000-0000-0000000000f3', 'a0310000-0000-0000-0000-000000000008', 'owner');
-- B1 teams (invoiced), C1 church band.
insert into public.org_licences (id, org_id, kind, title_scope, seats_purchased, starts_at, ends_at) values
  ('a0310000-0000-0000-0000-0000000000e1', 'a0310000-0000-0000-0000-0000000000f2', 'teams', 'membership', 5, '2026-05-01', now() + interval '1 year'),
  ('a0310000-0000-0000-0000-0000000000e2', 'a0310000-0000-0000-0000-0000000000f3', 'church', 'membership', 50, '2026-05-01', now() + interval '1 year');
-- A seat holder on the business licence: never a billing contact.
insert into public.org_seats (licence_id, org_id, user_id, roster_email) values
  ('a0310000-0000-0000-0000-0000000000e1', 'a0310000-0000-0000-0000-0000000000f2', 'a0310000-0000-0000-0000-000000000010', 'holder31@work31.example');

create table public.t31_ids (k text primary key, v uuid not null);
grant select, insert on public.t31_ids to anon, authenticated, service_role;
create function public.t31(p text) returns uuid language sql stable as $$ select v from public.t31_ids where k = p $$;
grant execute on function public.t31(text) to anon, authenticated, service_role;

create or replace function pg_temp.as_service() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "service_role"}'::text, true);
  execute 'set local role service_role';
end $$;

-- ---------------------------------------------------------------------------
-- 1. Buyer type: a self-serve Group is a consumer, a self-serve team and a
-- staff-made customer are businesses. Staff correct it with a reason.
-- ---------------------------------------------------------------------------
update public.feature_flags set enabled = true where key = 'org_self_serve' and scope = 'global';
select pg_temp.as_service();
do $$ declare v uuid; t uuid; y uuid; begin
  v := public.org_self_serve_provision('a0310000-0000-0000-0000-000000000001', 'group_member_month', 'community_group',
    'Book Club 31', 'GB', 'organiser31@home31.example', 'sub_G31', 6);
  insert into public.t31_ids values ('g_lic', v), ('g_org', (select org_id from public.org_licences where id = v));
  t := public.org_self_serve_provision('a0310000-0000-0000-0000-000000000003', 'teams_seat_month', 'business',
    'Small Team 31', 'GB', null, 'sub_T31', 3);
  insert into public.t31_ids values ('t_lic', t), ('t_org', (select org_id from public.org_licences where id = t));
  y := public.org_self_serve_provision('a0310000-0000-0000-0000-000000000009', 'group_member_month', 'community_group',
    'Young Club 31', 'GB', null, 'sub_Y31', 4);
  insert into public.t31_ids values ('y_lic', y);
end $$;
reset role;
update public.feature_flags set enabled = false where key = 'org_self_serve' and scope = 'global';
-- The organiser who never confirmed 18 or over (0030 sets it only on an existing profile row; clear it to test the rule).
update public.profiles set adult_confirmed_at = null where user_id = 'a0310000-0000-0000-0000-000000000009';
do $$ begin
  if (select buyer_type from public.org_profiles where org_id = public.t31('g_org')) <> 'consumer' then raise exception 'a self-serve group is not a consumer'; end if;
  if (select buyer_type from public.org_profiles where org_id = public.t31('t_org')) <> 'business' then raise exception 'a self-serve team is not a business'; end if;
  if (select buyer_type from public.org_profiles where org_id = 'a0310000-0000-0000-0000-0000000000f2') <> 'business' then raise exception 'a customer is not a business by default'; end if;
end $$;

select test_as('a0310000-0000-0000-0000-000000000003');
do $$ begin
  perform public.org_set_buyer_type('a0310000-0000-0000-0000-0000000000f2', 'consumer', 'no');
  raise exception 'an organisation owner set its own buyer type';
exception when sqlstate 'AKO01' then null; end $$;
reset role;
select test_as('a0310000-0000-0000-0000-000000000006', array['editor']);
do $$ begin
  begin
    perform public.org_set_buyer_type('a0310000-0000-0000-0000-0000000000f2', 'consumer', null);
    raise exception 'a buyer type change had no reason';
  exception when sqlstate 'AKO02' then null; end;
  if not public.org_set_buyer_type(public.t31('t_org'), 'consumer', 'Sole trader, buying for a reading circle') then raise exception 'staff could not set consumer'; end if;
  if public.org_set_buyer_type(public.t31('t_org'), 'consumer', 'again') then raise exception 'a no-op change reported a change'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 2. The organiser's own seat (auto-seat): adults only, owner only, once.
-- ---------------------------------------------------------------------------
select test_as('a0310000-0000-0000-0000-000000000001');
do $$ begin
  perform public.org_self_serve_seat_organiser(public.t31('g_lic'), 'a0310000-0000-0000-0000-000000000001');
  raise exception 'a client seated itself';
exception when insufficient_privilege then null; end $$;
reset role;
select pg_temp.as_service();
do $$ declare a uuid; b uuid; begin
  a := public.org_self_serve_seat_organiser(public.t31('g_lic'), 'a0310000-0000-0000-0000-000000000001');
  b := public.org_self_serve_seat_organiser(public.t31('g_lic'), 'a0310000-0000-0000-0000-000000000001');
  if a is null or a <> b then raise exception 'the organiser seat is missing or not idempotent'; end if;
  if not exists (select 1 from public.org_seats s join public.entitlements e on e.id = s.entitlement_id
                  where s.id = a and e.source = 'team_seat' and e.status = 'active' and s.roster_email = 'organiser31@home31.example') then
    raise exception 'the organiser seat has no live entitlement';
  end if;
  if public.org_self_serve_seat_organiser(public.t31('y_lic'), 'a0310000-0000-0000-0000-000000000009') is not null then
    raise exception 'an organiser with no 18 or over confirmation got a seat';
  end if;
  begin
    perform public.org_self_serve_seat_organiser(public.t31('g_lic'), 'a0310000-0000-0000-0000-000000000002');
    raise exception 'someone other than the owner was seated';
  exception when sqlstate 'AKO02' then null; end;
  begin
    perform public.org_self_serve_seat_organiser('a0310000-0000-0000-0000-0000000000e1', 'a0310000-0000-0000-0000-000000000003');
    raise exception 'a staff-made licence took an organiser seat';
  exception when sqlstate 'AKO02' then null; end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. Billing contacts: owners, finance and the billing address. Never a
-- viewer or a seat holder. Service role only.
-- ---------------------------------------------------------------------------
select test_as('a0310000-0000-0000-0000-000000000003');
do $$ begin
  perform * from public.org_billing_contacts('a0310000-0000-0000-0000-0000000000f2');
  raise exception 'a client read the billing contacts';
exception when insufficient_privilege then null; end $$;
reset role;
select pg_temp.as_service();
do $$ declare v text; begin
  select string_agg(email || '/' || role, ',' order by email) into v from public.org_billing_contacts('a0310000-0000-0000-0000-0000000000f2');
  if v <> 'accounts@work31.example/billing,finance31@work31.example/finance,owner31@work31.example/owner' then
    raise exception 'billing contacts were %', v;
  end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. The mirror for the consumer group and the business, then reminders.
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
do $$ begin
  perform public.org_billing_apply('sub_G31', 'cus_G31', null, 'active', 'group_member_month', null,
    6, 'charge_automatically', null, now() - interval '23 days', now() + interval '7 days', false, null, null, null, false, now());
  perform public.org_billing_apply('sub_B31', 'cus_B31', 'a0310000-0000-0000-0000-0000000000e1', 'active', 'teams_seat_month', null,
    5, 'send_invoice', 30, now() - interval '23 days', now() + interval '7 days', false, null, null, null, false, now());
  perform public.org_billing_record_invoice('in_G31a', 'sub_G31', 'G31-0001', 'paid', false, 'GBP', 1800, 1800, 300, null,
    'charge_automatically', 'subscription_create', now() - interval '7 months', now() - interval '6 months', null, now() - interval '7 months', null, null, false, now());
  perform public.org_billing_record_invoice('in_G31b', 'sub_G31', 'G31-0002', 'paid', false, 'GBP', 1800, 1800, 300, null,
    'charge_automatically', 'subscription_cycle', now() - interval '23 days', now() + interval '7 days', null, now() - interval '23 days', null, null, false, now());
end $$;
reset role;
-- The group began seven months ago, the business too.
update public.org_subscriptions set created_at = now() - interval '7 months' where stripe_subscription_id in ('sub_G31', 'sub_B31');
select pg_temp.as_service();
do $$ declare r record; n int; begin
  select count(*) into n from public.due_org_terms_reminders(now());
  if n <> 1 then raise exception 'due reminders: % rows', n; end if;
  select * into r from public.due_org_terms_reminders(now());
  if r.stripe_subscription_id <> 'sub_G31' or r.yearly or r.amount_minor <> 1800 or r.currency <> 'GBP' or r.seats <> 6 then
    raise exception 'the due reminder is wrong: %', row_to_json(r);
  end if;
  -- Not while the next payment is too close.
  select count(*) into n from public.due_org_terms_reminders(now() + interval '5 days');
  if n <> 0 then raise exception 'a reminder was due 2 days before a payment'; end if;
  if not public.mark_org_terms_reminder_sent('sub_G31', now()) then raise exception 'the stamp did not change'; end if;
  if public.mark_org_terms_reminder_sent('sub_G31', now() - interval '1 day') then raise exception 'the stamp went backwards'; end if;
  select count(*) into n from public.due_org_terms_reminders(now());
  if n <> 0 then raise exception 'a stamped subscription is still due'; end if;
end $$;
reset role;

-- A yearly consumer plan: due once 3 to 30 days before the renewal.
select pg_temp.as_service();
do $$ declare n int; begin
  perform public.org_billing_apply('sub_T31', 'cus_T31', null, 'active', 'teams_seat_year', null,
    3, 'charge_automatically', null, now() - interval '345 days', now() + interval '20 days', false, null, null, null, false, now());
  select count(*) into n from public.due_org_terms_reminders(now()) where stripe_subscription_id = 'sub_T31' and yearly;
  if n <> 1 then raise exception 'the yearly consumer plan was not due'; end if;
  select count(*) into n from public.due_org_terms_reminders(now() - interval '15 days') where stripe_subscription_id = 'sub_T31';
  if n <> 0 then raise exception 'a yearly reminder was due 35 days ahead'; end if;
  perform public.mark_org_terms_reminder_sent('sub_T31', now());
  select count(*) into n from public.due_org_terms_reminders(now() + interval '5 days') where stripe_subscription_id = 'sub_T31';
  if n <> 0 then raise exception 'a yearly reminder was due twice in one period'; end if;
end $$;
reset role;
select test_as('a0310000-0000-0000-0000-000000000001');
do $$ begin
  perform * from public.due_org_terms_reminders(now());
  raise exception 'a client read due reminders';
exception when insufficient_privilege then null; end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 5. The outbox: each event once, never readable by a client.
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
do $$ declare n int; begin
  perform public.org_billing_record_invoice('in_B31a', 'sub_B31', 'B31-0001', 'open', false, 'GBP', 6000, 0, 1000, 'PO-31',
    'send_invoice', 'subscription_cycle', now(), now() + interval '30 days', now() + interval '30 days', null,
    'https://invoice.stripe.com/i/acct_x/test_B31a', null, false, now());
  perform public.org_billing_record_invoice('in_B31a', 'sub_B31', 'B31-0001', 'open', false, 'GBP', 6000, 0, 1000, 'PO-31',
    'send_invoice', 'subscription_cycle', now(), now() + interval '30 days', now() + interval '30 days', null,
    'https://invoice.stripe.com/i/acct_x/test_B31a', null, false, now());
  select count(*) into n from public.org_billing_mail where kind = 'invoice_sent' and ref = 'in_B31a';
  if n <> 1 then raise exception 'invoice_sent queued % times', n; end if;
  -- A card invoice is not "sent": Stripe charges it.
  select count(*) into n from public.org_billing_mail where kind = 'invoice_sent' and invoice_id like 'in_G31%';
  if n <> 0 then raise exception 'a card invoice queued invoice_sent'; end if;
  -- A failed payment, once however often Stripe says so.
  perform public.org_billing_record_invoice('in_B31a', 'sub_B31', 'B31-0001', 'open', true, 'GBP', 6000, 0, 1000, 'PO-31',
    'send_invoice', 'subscription_cycle', now(), now() + interval '30 days', now() + interval '30 days', null, null, null, false, now());
  perform public.org_billing_record_invoice('in_B31a', 'sub_B31', 'B31-0001', 'open', true, 'GBP', 6000, 0, 1000, 'PO-31',
    'send_invoice', 'subscription_cycle', now(), now() + interval '30 days', now() + interval '30 days', null, null, null, false, now());
  select count(*) into n from public.org_billing_mail where kind = 'payment_failed' and ref = 'in_B31a';
  if n <> 1 then raise exception 'payment_failed queued % times', n; end if;
  -- Overdue: queued by the daily sweep once the due date passes.
  if public.org_billing_queue_overdue(now()) <> 0 then raise exception 'an invoice was overdue before its due date'; end if;
  if public.org_billing_queue_overdue(now() + interval '31 days') <> 1 then raise exception 'the overdue invoice was not queued'; end if;
  if public.org_billing_queue_overdue(now() + interval '32 days') <> 0 then raise exception 'overdue queued twice'; end if;
end $$;
reset role;

-- Suspended by billing, then ending (owner request and Stripe flag: one
-- email), then ended.
select pg_temp.as_service();
do $$ declare n int; begin
  perform public.org_billing_apply('sub_B31', 'cus_B31', null, 'unpaid', 'teams_seat_month', null,
    5, 'send_invoice', 30, now() - interval '23 days', now() + interval '7 days', false, null, null, null, false, now());
  select count(*) into n from public.org_billing_mail where kind = 'licence_suspended' and licence_id = 'a0310000-0000-0000-0000-0000000000e1';
  if n <> 1 then raise exception 'licence_suspended queued % times', n; end if;
  perform public.org_billing_apply('sub_B31', 'cus_B31', null, 'active', 'teams_seat_month', null,
    5, 'send_invoice', 30, now() - interval '23 days', now() + interval '7 days', false, null, null, null, false, now());
end $$;
reset role;
select test_as('a0310000-0000-0000-0000-000000000003');
do $$ begin
  if public.org_licence_end_request('a0310000-0000-0000-0000-0000000000e1') <> 'ending' then raise exception 'the end request did not say ending'; end if;
end $$;
reset role;
select pg_temp.as_service();
do $$ declare n int; begin
  perform public.org_billing_apply('sub_B31', 'cus_B31', null, 'active', 'teams_seat_month', null,
    5, 'send_invoice', 30, now() - interval '23 days', now() + interval '7 days', true, null, null, null, false, now());
  select count(*) into n from public.org_billing_mail where kind = 'licence_ending' and licence_id = 'a0310000-0000-0000-0000-0000000000e1';
  if n <> 1 then raise exception 'licence_ending queued % times', n; end if;
  select count(*) into n from public.org_billing_mail_due(100) where kind = 'licence_ending' and relevant and organisation_name = 'Biz 31' and not consumer;
  if n <> 1 then raise exception 'the ending email is not due'; end if;
  -- The invoice is paid: the failure and overdue notices no longer apply.
  perform public.org_billing_record_invoice('in_B31a', 'sub_B31', 'B31-0001', 'paid', false, 'GBP', 6000, 6000, 1000, 'PO-31',
    'send_invoice', 'subscription_cycle', now(), now() + interval '30 days', now() + interval '30 days', now(), null, null, false, now());
  select count(*) into n from public.org_billing_mail_due(100) where invoice_number = 'B31-0001' and relevant;
  if n <> 0 then raise exception 'a paid invoice still has % notices to send', n; end if;
  perform public.org_billing_apply('sub_B31', 'cus_B31', null, 'canceled', 'teams_seat_month', null,
    5, 'send_invoice', 30, now() - interval '23 days', now() + interval '7 days', true, null, now(), now(), false, now());
  select count(*) into n from public.org_billing_mail where kind = 'licence_ended' and ref = 'a0310000-0000-0000-0000-0000000000e1';
  if n <> 1 then raise exception 'licence_ended queued % times', n; end if;
  select count(*) into n from public.org_billing_mail_due(100) where kind = 'licence_ending' and relevant;
  if n <> 0 then raise exception 'the ending email is still relevant after the end'; end if;
end $$;
-- Marking a row done takes it off the list; a failed attempt keeps it there.
do $$ declare v uuid; n int; begin
  select id into v from public.org_billing_mail where kind = 'licence_ended' and ref = 'a0310000-0000-0000-0000-0000000000e1';
  if not public.org_billing_mail_done(v, false) then raise exception 'an attempt was not counted'; end if;
  select count(*) into n from public.org_billing_mail_due(100) where id = v;
  if n <> 1 then raise exception 'a failed row left the list'; end if;
  if not public.org_billing_mail_done(v, true) then raise exception 'the row was not marked done'; end if;
  if public.org_billing_mail_done(v, true) then raise exception 'a done row was marked twice'; end if;
  select count(*) into n from public.org_billing_mail_due(100) where id = v;
  if n <> 0 then raise exception 'a done row is still due'; end if;
end $$;
reset role;
select test_as('a0310000-0000-0000-0000-000000000003');
do $$ begin
  perform 1 from public.org_billing_mail limit 1;
  raise exception 'a client read the outbox';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform * from public.org_billing_mail_due(10);
  raise exception 'a client read the due mail';
exception when insufficient_privilege then null; end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 6. Cooling-off: open at the start for a consumer, never for a business,
-- closed after 14 days, open again after a yearly renewal.
-- ---------------------------------------------------------------------------
select test_as('a0310000-0000-0000-0000-000000000007');
do $$ begin
  perform * from public.org_cooling_off_state(public.t31('g_lic'));
  raise exception 'an outsider read the cooling-off state';
exception when sqlstate 'AKO01' then null; end $$;
reset role;
-- sub_G31's first invoice was paid seven months ago: closed.
select test_as('a0310000-0000-0000-0000-000000000001');
do $$ declare s text; begin
  select state into s from public.org_cooling_off_state(public.t31('g_lic'));
  if s <> 'closed' then raise exception 'a seven-month-old plan is in cooling-off: %', s; end if;
  begin
    perform public.org_cooling_off_done(public.t31('g_lic'), 100, 'GBP', 'pending');
    raise exception 'a closed cooling-off ended the licence';
  exception when sqlstate 'AKO31' then null; end;
end $$;
reset role;
-- Make it a new plan: first paid five days ago.
update public.org_invoices set paid_at = now() - interval '5 days' where stripe_invoice_id = 'in_G31a';
select test_as('a0310000-0000-0000-0000-000000000001');
do $$ declare r record; begin
  select * into r from public.org_cooling_off_state(public.t31('g_lic'));
  if r.state <> 'open' or r.reason <> 'start' or r.stripe_subscription_id <> 'sub_G31' or r.closes_at < now() + interval '8 days' then
    raise exception 'cooling-off at the start is wrong: %', row_to_json(r);
  end if;
end $$;
reset role;
select test_as('a0310000-0000-0000-0000-000000000002');
do $$ begin
  perform public.org_cooling_off_done(public.t31('g_lic'), 100, 'GBP', 'pending');
  raise exception 'a non-owner cancelled the group';
exception when sqlstate 'AKO01' then null; end $$;
reset role;
select test_as('a0310000-0000-0000-0000-000000000003');
do $$ declare s text; begin
  select state into s from public.org_cooling_off_state('a0310000-0000-0000-0000-0000000000e1');
  if s <> 'business' then raise exception 'a business has a cooling-off: %', s; end if;
  begin
    perform public.org_cooling_off_done('a0310000-0000-0000-0000-0000000000e1', 0, 'GBP', null);
    raise exception 'a business used the consumer cooling-off';
  exception when sqlstate 'AKO31' then null; end;
end $$;
reset role;
select test_as('a0310000-0000-0000-0000-000000000001');
do $$ begin
  if not public.org_cooling_off_done(public.t31('g_lic'), 1260, 'gbp', 'pending') then raise exception 'the cooling-off cancel failed'; end if;
end $$;
reset role;
do $$ declare m public.org_billing_mail; begin
  if (select status from public.org_licences where id = public.t31('g_lic')) <> 'ended' then raise exception 'the licence did not end now'; end if;
  if exists (select 1 from public.org_seats where licence_id = public.t31('g_lic') and released_at is null) then raise exception 'a seat stayed open'; end if;
  select * into m from public.org_billing_mail where kind = 'licence_ended' and ref = public.t31('g_lic')::text;
  if m.refund_minor <> 1260 or m.refund_currency <> 'GBP' or m.refund_state <> 'pending' then raise exception 'the refund is not on the ended email'; end if;
end $$;

-- A yearly consumer plan renewed three days ago: open again.
select pg_temp.as_service();
do $$ begin
  perform public.org_billing_record_invoice('in_T31a', 'sub_T31', 'T31-0001', 'paid', false, 'GBP', 9000, 9000, 1500, null,
    'charge_automatically', 'subscription_create', now() - interval '380 days', now() - interval '15 days', null, now() - interval '380 days', null, null, false, now());
  perform public.org_billing_record_invoice('in_T31b', 'sub_T31', 'T31-0002', 'paid', false, 'GBP', 9000, 9000, 1500, null,
    'charge_automatically', 'subscription_cycle', now() - interval '3 days', now() + interval '362 days', null, now() - interval '3 days', null, null, false, now());
end $$;
reset role;
update public.org_subscriptions set created_at = now() - interval '380 days' where stripe_subscription_id = 'sub_T31';
select test_as('a0310000-0000-0000-0000-000000000003');
do $$ declare r record; begin
  select * into r from public.org_cooling_off_state(public.t31('t_lic'));
  if r.state <> 'open' or r.reason <> 'renewal' then raise exception 'cooling-off after a yearly renewal is wrong: %', row_to_json(r); end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 7. Church bands: owner or finance, active and not ending, never below the
-- places used; staff override with a reason; the mirror sets the seats.
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
do $$ begin
  perform public.org_billing_apply('sub_C31', 'cus_C31', 'a0310000-0000-0000-0000-0000000000e2', 'active', 'church_band_1', null,
    1, 'send_invoice', 30, now() - interval '10 days', now() + interval '20 days', false, null, null, null, false, now());
end $$;
reset role;
select test_as('a0310000-0000-0000-0000-000000000005');
do $$ begin
  perform public.org_billing_band_change_check('a0310000-0000-0000-0000-0000000000e2', 'church_band_2', null);
  raise exception 'someone outside the church changed its band';
exception when sqlstate 'AKO01' then null; end $$;
reset role;
select test_as('a0310000-0000-0000-0000-000000000008');
do $$ begin
  if public.org_billing_band_change_check('a0310000-0000-0000-0000-0000000000e2', 'church_band_2', null) <> 'up' then raise exception 'band up'; end if;
  if public.org_billing_band_change_check('a0310000-0000-0000-0000-0000000000e2', 'church_band_1', null) <> 'same' then raise exception 'band same'; end if;
  begin
    perform public.org_billing_band_change_check('a0310000-0000-0000-0000-0000000000e2', 'teams_seat_year', null);
    raise exception 'a band moved to a seat plan';
  exception when sqlstate 'AKO02' then null; end;
  begin
    perform public.org_billing_band_change_check('a0310000-0000-0000-0000-0000000000e2', 'church_band_2', 'I am staff');
    raise exception 'an organisation owner used the staff override';
  exception when sqlstate 'AKO01' then null; end;
end $$;
reset role;
select test_as('a0310000-0000-0000-0000-000000000003');
do $$ begin
  perform public.org_billing_band_change_check(public.t31('t_lic'), 'church_band_2', null);
  raise exception 'a seat plan changed band';
exception when sqlstate 'AKO14' then null; end $$;
reset role;
-- The mirror sees band 2: 150 seats.
select pg_temp.as_service();
do $$ begin
  perform public.org_billing_apply('sub_C31', 'cus_C31', null, 'active', 'church_band_2', null,
    1, 'send_invoice', 30, now() - interval '10 days', now() + interval '20 days', false, null, null, null, false, now());
  if (select seats_purchased from public.org_licences where id = 'a0310000-0000-0000-0000-0000000000e2') <> 150 then
    raise exception 'band 2 did not set 150 seats';
  end if;
end $$;
reset role;
-- 60 places used: the church cannot drop to band 1 itself.
do $$ declare i int; v uuid; begin
  for i in 1..60 loop
    v := gen_random_uuid();
    insert into auth.users (id, email) values (v, 'p' || i || '@church31.example');
    insert into public.org_seats (licence_id, org_id, user_id) values ('a0310000-0000-0000-0000-0000000000e2', 'a0310000-0000-0000-0000-0000000000f3', v);
  end loop;
end $$;
select test_as('a0310000-0000-0000-0000-000000000008');
do $$ begin
  perform public.org_billing_band_change_check('a0310000-0000-0000-0000-0000000000e2', 'church_band_1', null);
  raise exception 'the band went below the places used';
exception when sqlstate 'AKO08' then null; end $$;
reset role;
-- Past due: the church waits, staff may still override.
select pg_temp.as_service();
do $$ begin
  perform public.org_billing_apply('sub_C31', 'cus_C31', null, 'past_due', 'church_band_2', null,
    1, 'send_invoice', 30, now() - interval '10 days', now() + interval '20 days', false, null, null, null, false, now());
end $$;
reset role;
select test_as('a0310000-0000-0000-0000-000000000008');
do $$ begin
  perform public.org_billing_band_change_check('a0310000-0000-0000-0000-0000000000e2', 'church_band_3', null);
  raise exception 'a past-due church changed its band';
exception when sqlstate 'AKO08' then null; end $$;
reset role;
select test_as('a0310000-0000-0000-0000-000000000006', array['editor']);
do $$ begin
  if public.org_billing_band_change_check('a0310000-0000-0000-0000-0000000000e2', 'church_band_1', 'Agreed with the treasurer by phone') <> 'down' then
    raise exception 'the staff override did not go through';
  end if;
end $$;
reset role;
select pg_temp.as_service();
do $$ begin
  perform public.org_billing_apply('sub_C31', 'cus_C31', null, 'past_due', 'church_band_1', null,
    1, 'send_invoice', 30, now() - interval '10 days', now() + interval '20 days', false, null, null, null, false, now());
  if (select seats_purchased from public.org_licences where id = 'a0310000-0000-0000-0000-0000000000e2') <> 60 then
    raise exception 'band 1 dropped seats below the 60 taken';
  end if;
end $$;
reset role;
do $$ begin
  if not exists (select 1 from public.audit_log where action = 'org.band_change_override' and org_id = 'a0310000-0000-0000-0000-0000000000f3'
                  and reason = 'Agreed with the treasurer by phone') then
    raise exception 'the override was not audited';
  end if;
end $$;

rollback;
\echo PASS 0031_org_billing_gaps
