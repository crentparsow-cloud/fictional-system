-- Memberships: the subscription mirror, the membership catalogue, the
-- entitlement that follows a subscription, invoices and the deletion guard
-- (F-097, F-095, F-098, F-025). Each block must raise or return the expected
-- count; a failure aborts the script and the CI step.
\set ON_ERROR_STOP on

begin;

-- Readers A and B, an org owner, and a platform editor. One organisation
-- owns two live titles: M is in the membership, X is not.
insert into auth.users (id, email) values
  ('55555555-5555-5555-5555-555555555555', 'reader-a@test'),
  ('66666666-6666-6666-6666-666666666666', 'reader-b@test'),
  ('99999999-9999-9999-9999-999999999999', 'owner@test'),
  ('77777777-7777-7777-7777-777777777777', 'staff@test');

insert into public.organisations (id, kind, legal_name, display_name, slug, country) values
  ('cdcdcdcd-0000-0000-0000-000000000001', 'publisher', 'Org M Ltd', 'Org M', 'org-m', 'GB');
insert into public.org_members (org_id, user_id, role) values
  ('cdcdcdcd-0000-0000-0000-000000000001', '99999999-9999-9999-9999-999999999999', 'owner');
insert into public.authors (id, code, org_id, slug, display_name, country) values
  ('cdcdcdcd-0000-0000-0000-0000000000a1', 'AU-TESTM', 'cdcdcdcd-0000-0000-0000-000000000001', 'author-m', 'Author M', 'GB');
insert into public.books (id, org_id, slug, title) values
  ('cdcdcdcd-0000-0000-0000-0000000000b1', 'cdcdcdcd-0000-0000-0000-000000000001', 'book-m', 'Book M');

insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, depth, status, in_membership) values
  ('cdcdcdcd-0000-0000-0000-0000000000c1', 'AK-MEMB1', 'cdcdcdcd-0000-0000-0000-0000000000b1', 'cdcdcdcd-0000-0000-0000-000000000001',
   'workbook-member', 'Member Workbook', 'Card', 'productivity', 'full', 'live', true),
  ('cdcdcdcd-0000-0000-0000-0000000000c2', 'AK-MEMB2', 'cdcdcdcd-0000-0000-0000-0000000000b1', 'cdcdcdcd-0000-0000-0000-000000000001',
   'workbook-outside', 'Outside Workbook', 'Card', 'productivity', 'full', 'live', false);
insert into public.workbook_versions (id, workbook_id, semver, content, content_hash, published_at) values
  ('cdcdcdcd-0000-0000-0000-0000000000d1', 'cdcdcdcd-0000-0000-0000-0000000000c1', '1.0.0', '{"schema_version": "3.0"}'::jsonb, repeat('1', 64), now()),
  ('cdcdcdcd-0000-0000-0000-0000000000d2', 'cdcdcdcd-0000-0000-0000-0000000000c2', '1.0.0', '{"schema_version": "3.0"}'::jsonb, repeat('2', 64), now());
update public.workbooks set current_version_id = 'cdcdcdcd-0000-0000-0000-0000000000d1' where id = 'cdcdcdcd-0000-0000-0000-0000000000c1';
update public.workbooks set current_version_id = 'cdcdcdcd-0000-0000-0000-0000000000d2' where id = 'cdcdcdcd-0000-0000-0000-0000000000c2';
insert into public.workbook_sections (version_id, kind, unit_number, body, free) values
  ('cdcdcdcd-0000-0000-0000-0000000000d1', 'listing', null, '{}'::jsonb, true),
  ('cdcdcdcd-0000-0000-0000-0000000000d1', 'unit', 1, '{"number": 1}'::jsonb, true),
  ('cdcdcdcd-0000-0000-0000-0000000000d1', 'unit', 2, '{"number": 2}'::jsonb, false),
  ('cdcdcdcd-0000-0000-0000-0000000000d2', 'listing', null, '{}'::jsonb, true),
  ('cdcdcdcd-0000-0000-0000-0000000000d2', 'unit', 1, '{"number": 1}'::jsonb, true),
  ('cdcdcdcd-0000-0000-0000-0000000000d2', 'unit', 2, '{"number": 2}'::jsonb, false);

-- Reader A has an enrolment and an answer, so deletion has something to remove.
insert into public.enrolments (id, user_id, tenant_id, workbook_id, version_id) values
  ('cdcdcdcd-0000-0000-0000-0000000000e1', '55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-00000000000a',
   'cdcdcdcd-0000-0000-0000-0000000000c1', 'cdcdcdcd-0000-0000-0000-0000000000d1');
insert into public.answers (enrolment_id, field, sealed, key_id) values
  ('cdcdcdcd-0000-0000-0000-0000000000e1', 'exercise:ex_one.f_one', 'v2.k1.AAAA', 'k1');

create or replace function pg_temp.as_service() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "service_role"}'::text, true);
  execute 'set local role service_role';
end $$;

-- A helper so each upsert below reads as one line: subscription, customer,
-- reader, status, observed seconds ago (larger is older).
create or replace function pg_temp.upsert(p_sub text, p_customer text, p_user uuid, p_status text, p_ago int,
  p_cancel_at_period_end boolean default false) returns text
language sql as $$
  select public.upsert_subscription(p_sub, p_customer, p_user,
    case when p_user is null then null else '00000000-0000-0000-0000-00000000000a'::uuid end,
    p_status, 'member_month', 'price_test_month', now() + interval '30 days', p_cancel_at_period_end,
    null, null, null, now() - make_interval(secs => p_ago))
$$;

-- ---------------------------------------------------------------------------
-- The catalogue defaults to in, and only staff or server code change it.
-- ---------------------------------------------------------------------------
do $$ declare n int; begin
  select count(*) into n from public.workbooks where in_membership;
  if n < 1 then raise exception 'no workbook is in the membership'; end if;
  if (select value #>> '{}' from public.app_config where key = 'membership_grace_days') is null then
    raise exception 'membership_grace_days is not seeded'; end if;
end $$;

savepoint s_catalogue;
select test_as('99999999-9999-9999-9999-999999999999');
do $$ begin
  begin
    update public.workbooks set in_membership = false where id = 'cdcdcdcd-0000-0000-0000-0000000000c1';
    raise exception 'an org owner took a title out of the membership';
  exception when insufficient_privilege then null; end;
  -- other columns stay editable for the owner
  update public.workbooks set card_line = 'New card' where id = 'cdcdcdcd-0000-0000-0000-0000000000c1';
end $$;
reset role;
select test_as('77777777-7777-7777-7777-777777777777', array['editor']);
do $$ declare n int; begin
  update public.workbooks set in_membership = false where id = 'cdcdcdcd-0000-0000-0000-0000000000c1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'a platform editor could not change the membership flag'; end if;
end $$;
reset role;
rollback to savepoint s_catalogue;

-- ---------------------------------------------------------------------------
-- No client write path; readers cannot call the definer functions.
-- ---------------------------------------------------------------------------
select test_as('55555555-5555-5555-5555-555555555555');
do $$ begin
  begin
    insert into public.subscriptions (user_id, tenant_id, stripe_customer_id, stripe_subscription_id, status, observed_at)
    values (app.uid(), '00000000-0000-0000-0000-00000000000a', 'cus_client', 'sub_client', 'active', now());
    raise exception 'reader A inserted a subscription from the client';
  exception when insufficient_privilege then null; end;
  begin
    perform public.upsert_subscription('sub_client', 'cus_client', app.uid(), '00000000-0000-0000-0000-00000000000a',
      'active', 'member_month', null, null, false, null, null, null, now());
    raise exception 'reader A called upsert_subscription';
  exception when insufficient_privilege then null; end;
  begin
    perform app.upsert_subscription('sub_client', 'cus_client', app.uid(), '00000000-0000-0000-0000-00000000000a',
      'active', 'member_month', null, null, false, null, null, null, now());
    raise exception 'reader A called app.upsert_subscription';
  exception when insufficient_privilege then null; end;
  begin
    perform public.sync_membership_entitlement(app.uid(), '00000000-0000-0000-0000-00000000000a');
    raise exception 'reader A called sync_membership_entitlement';
  exception when insufficient_privilege then null; end;
  begin
    perform public.due_deletion_subscriptions();
    raise exception 'reader A read due deletion subscriptions';
  exception when insufficient_privilege then null; end;
  -- no membership yet: unit 2 of the member title stays shut
  if (select app.has_entitlement(app.uid(), '00000000-0000-0000-0000-00000000000a', 'cdcdcdcd-0000-0000-0000-0000000000c1', 2)) then
    raise exception 'has_entitlement said yes before any membership'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Created and active: the membership entitlement appears with no end date.
-- It opens the member title and not the one outside the catalogue.
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
do $$ declare r text; begin
  r := pg_temp.upsert('sub_testA1', 'cus_testA', '55555555-5555-5555-5555-555555555555', 'active', 100);
  if r <> 'applied' then raise exception 'first upsert returned %', r; end if;
end $$;
reset role;
do $$ declare e public.entitlements; begin
  select * into e from public.entitlements
   where user_id = '55555555-5555-5555-5555-555555555555' and source = 'membership' and workbook_id is null;
  if e.id is null or e.status <> 'active' or e.ends_at is not null then
    raise exception 'active membership entitlement wrong: % %', e.status, e.ends_at; end if;
end $$;
select test_as('55555555-5555-5555-5555-555555555555');
do $$ declare n int; begin
  if not (select app.has_entitlement(app.uid(), '00000000-0000-0000-0000-00000000000a', 'cdcdcdcd-0000-0000-0000-0000000000c1', 2)) then
    raise exception 'an active member cannot open a catalogue title'; end if;
  if (select app.has_entitlement(app.uid(), '00000000-0000-0000-0000-00000000000a', 'cdcdcdcd-0000-0000-0000-0000000000c2', 2)) then
    raise exception 'membership opened a title outside the catalogue'; end if;
  select count(*) into n from public.workbook_sections where version_id = 'cdcdcdcd-0000-0000-0000-0000000000d1' and kind = 'unit' and unit_number = 2;
  if n <> 1 then raise exception 'member did not read unit 2 of the member title, %', n; end if;
  select count(*) into n from public.workbook_sections where version_id = 'cdcdcdcd-0000-0000-0000-0000000000d2' and kind = 'unit' and unit_number = 2;
  if n <> 0 then raise exception 'member read unit 2 of a title outside the membership, %', n; end if;
  -- the reader reads their own subscription
  select count(*) into n from public.subscriptions;
  if n <> 1 then raise exception 'reader A should see 1 subscription, saw %', n; end if;
end $$;
reset role;

-- A repeated delivery changes nothing and writes no audit row.
select set_config('test.audit_before', count(*)::text, true) from public.audit_log;
select pg_temp.as_service();
do $$ declare r text; begin
  r := pg_temp.upsert('sub_testA1', 'cus_testA', '55555555-5555-5555-5555-555555555555', 'active', 100);
  if r <> 'unchanged' then raise exception 'repeated upsert returned %', r; end if;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.audit_log) <> current_setting('test.audit_before')::bigint then
    raise exception 'repeated upsert wrote audit rows'; end if;
end $$;
select pg_temp.as_service();
do $$ declare r text; begin
  -- an older observation is ignored
  r := pg_temp.upsert('sub_testA1', 'cus_testA', '55555555-5555-5555-5555-555555555555', 'canceled', 500);
  if r <> 'stale' then raise exception 'older observation returned %', r; end if;
  if (select status from public.subscriptions where stripe_subscription_id = 'sub_testA1') <> 'active' then
    raise exception 'a stale event changed the status'; end if;
  -- cancel at period end keeps access
  r := pg_temp.upsert('sub_testA1', 'cus_testA', '55555555-5555-5555-5555-555555555555', 'active', 90, true);
  if r <> 'applied' then raise exception 'cancel_at_period_end upsert returned %', r; end if;
  if not (select cancel_at_period_end from public.subscriptions where stripe_subscription_id = 'sub_testA1') then
    raise exception 'cancel_at_period_end not recorded'; end if;
  if not app.has_entitlement('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-00000000000a', 'cdcdcdcd-0000-0000-0000-0000000000c1', 2) then
    raise exception 'cancelling at period end closed access early'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- past_due: access stays inside the grace period, then closes on its own.
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
do $$ declare r text; e public.entitlements; s public.subscriptions; begin
  r := pg_temp.upsert('sub_testA1', 'cus_testA', '55555555-5555-5555-5555-555555555555', 'past_due', 80);
  if r <> 'applied' then raise exception 'past_due upsert returned %', r; end if;
  select * into s from public.subscriptions where stripe_subscription_id = 'sub_testA1';
  if s.past_due_since is null then raise exception 'past_due_since not set'; end if;
  select * into e from public.entitlements
   where user_id = '55555555-5555-5555-5555-555555555555' and source = 'membership' and workbook_id is null;
  if e.status <> 'active' or e.ends_at is distinct from s.past_due_since + interval '7 days' then
    raise exception 'past_due entitlement wrong: % % (since %)', e.status, e.ends_at, s.past_due_since; end if;
  if not app.has_entitlement('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-00000000000a', 'cdcdcdcd-0000-0000-0000-0000000000c1', 2) then
    raise exception 'past_due member inside grace lost access'; end if;
  -- a second past_due delivery keeps the first past_due_since
  r := pg_temp.upsert('sub_testA1', 'cus_testA', '55555555-5555-5555-5555-555555555555', 'past_due', 70);
  if (select past_due_since from public.subscriptions where stripe_subscription_id = 'sub_testA1') <> s.past_due_since then
    raise exception 'past_due_since moved on a repeat'; end if;
end $$;
reset role;
-- Wind the clock: grace ran out eight days ago.
update public.subscriptions set past_due_since = now() - interval '8 days' where stripe_subscription_id = 'sub_testA1';
update public.entitlements set ends_at = now() - interval '1 day'
 where user_id = '55555555-5555-5555-5555-555555555555' and source = 'membership';
do $$ begin
  if app.has_entitlement('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-00000000000a', 'cdcdcdcd-0000-0000-0000-0000000000c1', 2) then
    raise exception 'past_due member kept access after grace'; end if;
end $$;
select pg_temp.as_service();
do $$ declare r text; begin
  r := public.sync_membership_entitlement('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-00000000000a');
  if r <> 'lapsed' then raise exception 'sync after grace returned %', r; end if;
  -- payment recovered: active again, no end date
  r := pg_temp.upsert('sub_testA1', 'cus_testA', '55555555-5555-5555-5555-555555555555', 'active', 60);
  if r <> 'applied' then raise exception 'recovery upsert returned %', r; end if;
  if (select past_due_since from public.subscriptions where stripe_subscription_id = 'sub_testA1') is not null then
    raise exception 'past_due_since kept after recovery'; end if;
  if not app.has_entitlement('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-00000000000a', 'cdcdcdcd-0000-0000-0000-0000000000c1', 2) then
    raise exception 'recovered member has no access'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Canceled: lapsed, read only. A trialing second subscription for the same
-- customer with no metadata links to the same reader and reopens access.
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
do $$ declare r text; begin
  r := pg_temp.upsert('sub_testA1', 'cus_testA', '55555555-5555-5555-5555-555555555555', 'canceled', 50);
  if r <> 'applied' then raise exception 'cancel upsert returned %', r; end if;
  if (select status from public.entitlements where user_id = '55555555-5555-5555-5555-555555555555' and source = 'membership') <> 'lapsed' then
    raise exception 'canceled membership did not lapse'; end if;
  if app.has_entitlement('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-00000000000a', 'cdcdcdcd-0000-0000-0000-0000000000c1', 2) then
    raise exception 'canceled member kept access'; end if;
  -- unknown customer and no metadata: nothing to attach it to
  r := pg_temp.upsert('sub_testZ1', 'cus_testZ', null, 'active', 40);
  if r <> 'unlinked' then raise exception 'unknown customer returned %', r; end if;
  if exists (select 1 from public.subscriptions where stripe_subscription_id = 'sub_testZ1') then
    raise exception 'an unlinked subscription was stored'; end if;
  -- a reader that does not exist is unlinked too, not an error
  r := pg_temp.upsert('sub_testZ2', 'cus_testZ', gen_random_uuid(), 'active', 40);
  if r <> 'unlinked' then raise exception 'missing reader returned %', r; end if;
  -- known customer, no metadata: linked through the earlier row
  r := pg_temp.upsert('sub_testA2', 'cus_testA', null, 'trialing', 30);
  if r <> 'applied' then raise exception 'second subscription returned %', r; end if;
  if (select user_id from public.subscriptions where stripe_subscription_id = 'sub_testA2') <> '55555555-5555-5555-5555-555555555555' then
    raise exception 'second subscription linked to the wrong reader'; end if;
  if not app.has_entitlement('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-00000000000a', 'cdcdcdcd-0000-0000-0000-0000000000c1', 2) then
    raise exception 'trialing member has no access'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- A membership granted at checkout before any subscription event arrives is
-- left alone by sync (reader B has no subscription rows yet).
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
insert into public.purchases (id, user_id, tenant_id, workbook_id, kind, price_point_id, stripe_checkout_session_id, currency) values
  ('cdcdcdcd-0000-0000-0000-0000000000f1', '66666666-6666-6666-6666-666666666666', '00000000-0000-0000-0000-00000000000a',
   null, 'membership', 'member_month', 'cs_test_member_b', 'GBP');
do $$ declare r text; begin
  perform public.grant_purchase_entitlement('cdcdcdcd-0000-0000-0000-0000000000f1', null, 'sub_testB1', 800, 133, 'GBP');
  r := public.sync_membership_entitlement('66666666-6666-6666-6666-666666666666', '00000000-0000-0000-0000-00000000000a');
  if r <> 'none' then raise exception 'sync with no subscriptions returned %', r; end if;
  if not app.has_entitlement('66666666-6666-6666-6666-666666666666', '00000000-0000-0000-0000-00000000000a', 'cdcdcdcd-0000-0000-0000-0000000000c1', 2) then
    raise exception 'checkout grant was undone before the subscription arrived'; end if;
  -- then the subscription arrives as incomplete_expired: access closes
  r := pg_temp.upsert('sub_testB1', 'cus_testB', '66666666-6666-6666-6666-666666666666', 'incomplete_expired', 20);
  if app.has_entitlement('66666666-6666-6666-6666-666666666666', '00000000-0000-0000-0000-00000000000a', 'cdcdcdcd-0000-0000-0000-0000000000c1', 2) then
    raise exception 'an expired subscription left the checkout grant open'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Invoices: idempotent, a paid invoice stays paid, and readers see their own.
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
do $$ declare r text; begin
  r := public.record_subscription_invoice('in_testA1', 'sub_testA2', 'failed', 'gbp', 800, 133, 'subscription_cycle', now(), now() + interval '1 month', now());
  if r <> 'recorded' then raise exception 'failed invoice returned %', r; end if;
  r := public.record_subscription_invoice('in_testA1', 'sub_testA2', 'failed', 'gbp', 800, 133, 'subscription_cycle', now(), now() + interval '1 month', now());
  if r <> 'unchanged' then raise exception 'repeated failed invoice returned %', r; end if;
  r := public.record_subscription_invoice('in_testA1', 'sub_testA2', 'paid', 'gbp', 800, 133, 'subscription_cycle', now(), now() + interval '1 month', now());
  if r <> 'recorded' then raise exception 'retry paid returned %', r; end if;
  r := public.record_subscription_invoice('in_testA1', 'sub_testA2', 'failed', 'gbp', 800, 133, 'subscription_cycle', now(), now() + interval '1 month', now());
  if r <> 'unchanged' then raise exception 'late failure after paid returned %', r; end if;
  if (select status from public.subscription_invoices where stripe_invoice_id = 'in_testA1') <> 'paid' then
    raise exception 'a paid invoice went back to failed'; end if;
  if (select currency from public.subscription_invoices where stripe_invoice_id = 'in_testA1') <> 'GBP' then
    raise exception 'invoice currency not upper case'; end if;
  r := public.record_subscription_invoice('in_testZ1', 'sub_unknown', 'paid', 'gbp', 800, 133, null, null, null, now());
  if r <> 'unlinked' then raise exception 'unknown subscription invoice returned %', r; end if;
end $$;
reset role;

select test_as('66666666-6666-6666-6666-666666666666');
do $$ declare n int; begin
  select count(*) into n from public.subscriptions where user_id = '55555555-5555-5555-5555-555555555555';
  if n <> 0 then raise exception 'reader B read reader A''s subscriptions, %', n; end if;
  select count(*) into n from public.subscription_invoices;
  if n <> 0 then raise exception 'reader B read invoices that are not theirs, %', n; end if;
end $$;
reset role;
select test_as('55555555-5555-5555-5555-555555555555');
do $$ declare n int; begin
  select count(*) into n from public.subscription_invoices;
  if n <> 1 then raise exception 'reader A should read 1 invoice, saw %', n; end if;
end $$;
reset role;
select test_as('77777777-7777-7777-7777-777777777777', array['support']);
do $$ declare n int; begin
  select count(*) into n from public.subscriptions;
  if n < 3 then raise exception 'staff should read every subscription, saw %', n; end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
set local role anon;
do $$ begin
  begin
    perform count(*) from public.subscriptions;
    raise exception 'anon read subscriptions';
  exception when insufficient_privilege then null; end;
  begin
    perform count(*) from public.subscription_invoices;
    raise exception 'anon read subscription invoices';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Deletion: a due reader with a live subscription cannot be deleted until
-- the subscription is cancelled. The job lists it, cancels it, records it,
-- then runs. Invoices outlive the account.
-- ---------------------------------------------------------------------------
select test_as('55555555-5555-5555-5555-555555555555');
do $$ begin perform public.request_account_deletion(null); end $$;
reset role;
update public.account_deletion_requests set requested_at = now() - interval '8 days'
 where user_id = '55555555-5555-5555-5555-555555555555';

select pg_temp.as_service();
do $$ declare subs text[]; begin
  select array_agg(stripe_subscription_id) into subs from public.due_deletion_subscriptions();
  if subs is distinct from array['sub_testA2'] then raise exception 'due subscriptions should be sub_testA2, saw %', subs; end if;
  begin
    perform public.complete_due_deletions();
    raise exception 'deletion completed with a live subscription';
  exception when object_not_in_prerequisite_state then null; end;
end $$;
reset role;
do $$ declare n int; begin
  select count(*) into n from public.answers a join public.enrolments e on e.id = a.enrolment_id
   where e.user_id = '55555555-5555-5555-5555-555555555555';
  if n <> 1 then raise exception 'the refused run still deleted answers, % left', n; end if;
end $$;

select pg_temp.as_service();
do $$ declare ids uuid[]; begin
  if not public.mark_subscription_cancelled('sub_testA2') then raise exception 'cancel was not recorded'; end if;
  if public.mark_subscription_cancelled('sub_testA2') then raise exception 'cancel recorded twice'; end if;
  if exists (select 1 from public.due_deletion_subscriptions()) then raise exception 'cancelled subscription still listed'; end if;
  select array_agg(user_id) into ids from public.complete_due_deletions();
  if ids is distinct from array['55555555-5555-5555-5555-555555555555'::uuid] then
    raise exception 'job should return reader A, returned %', ids; end if;
end $$;
reset role;
do $$ declare n int; begin
  select count(*) into n from public.entitlements where user_id = '55555555-5555-5555-5555-555555555555';
  if n <> 0 then raise exception 'reader A still has % entitlements', n; end if;
  -- the auth user goes: subscriptions with it, invoices kept and unlinked
  delete from auth.users where id = '55555555-5555-5555-5555-555555555555';
  select count(*) into n from public.subscriptions where stripe_customer_id = 'cus_testA';
  if n <> 0 then raise exception 'subscriptions outlived the account, %', n; end if;
  select count(*) into n from public.subscription_invoices where stripe_invoice_id = 'in_testA1' and user_id is null;
  if n <> 1 then raise exception 'invoice was not kept and unlinked'; end if;
end $$;

rollback;
\echo PASS 0009_memberships
