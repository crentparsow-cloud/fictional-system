-- Membership settings (0010): the 14-day grace, demo titles out of the
-- membership, interim membership prices and email claims. Each block must
-- raise or return the expected count; a failure aborts the script and the
-- CI step.
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('a0100000-0000-0000-0000-000000000001', 'reader-10@test'),
  ('a0100000-0000-0000-0000-000000000002', 'owner-10@test'),
  ('a0100000-0000-0000-0000-000000000003', 'staff-10@test');

insert into public.organisations (id, kind, legal_name, display_name, slug, country) values
  ('a0100000-0000-0000-0000-0000000000f1', 'publisher', 'Org Ten Ltd', 'Org Ten', 'org-ten', 'GB');
insert into public.org_members (org_id, user_id, role) values
  ('a0100000-0000-0000-0000-0000000000f1', 'a0100000-0000-0000-0000-000000000002', 'owner');
insert into public.books (id, org_id, slug, title, rights_status, is_demo) values
  ('a0100000-0000-0000-0000-0000000000b1', 'a0100000-0000-0000-0000-0000000000f1', 'book-ten', 'Book Ten', 'licensed', false),
  ('a0100000-0000-0000-0000-0000000000b2', 'a0100000-0000-0000-0000-0000000000f1', 'book-ten-demo', 'Demo Book Ten', 'own_work', true);

-- A real title and a demo title, both inserted with in_membership true.
insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, depth, badge, is_demo, status, in_membership) values
  ('a0100000-0000-0000-0000-0000000000c1', 'AK-TENR1', 'a0100000-0000-0000-0000-0000000000b1', 'a0100000-0000-0000-0000-0000000000f1',
   'workbook-ten', 'Workbook Ten', 'Card', 'productivity', 'full', 'official', false, 'live', true),
  ('a0100000-0000-0000-0000-0000000000c2', 'AK-TEND1', 'a0100000-0000-0000-0000-0000000000b2', 'a0100000-0000-0000-0000-0000000000f1',
   'workbook-ten-demo', 'Demo Workbook Ten', 'Card', 'productivity', 'full', 'demo', true, 'live', true);
insert into public.workbook_versions (id, workbook_id, semver, content, content_hash, published_at) values
  ('a0100000-0000-0000-0000-0000000000d1', 'a0100000-0000-0000-0000-0000000000c1', '1.0.0', '{"schema_version": "3.0"}'::jsonb, repeat('a', 64), now()),
  ('a0100000-0000-0000-0000-0000000000d2', 'a0100000-0000-0000-0000-0000000000c2', '1.0.0', '{"schema_version": "3.0"}'::jsonb, repeat('b', 64), now());
update public.workbooks set current_version_id = 'a0100000-0000-0000-0000-0000000000d1' where id = 'a0100000-0000-0000-0000-0000000000c1';
update public.workbooks set current_version_id = 'a0100000-0000-0000-0000-0000000000d2' where id = 'a0100000-0000-0000-0000-0000000000c2';
insert into public.workbook_sections (version_id, kind, unit_number, body, free) values
  ('a0100000-0000-0000-0000-0000000000d1', 'listing', null, '{}'::jsonb, true),
  ('a0100000-0000-0000-0000-0000000000d1', 'unit', 1, '{"number": 1}'::jsonb, true),
  ('a0100000-0000-0000-0000-0000000000d1', 'unit', 2, '{"number": 2}'::jsonb, false),
  ('a0100000-0000-0000-0000-0000000000d2', 'listing', null, '{}'::jsonb, true),
  ('a0100000-0000-0000-0000-0000000000d2', 'unit', 1, '{"number": 1}'::jsonb, true),
  ('a0100000-0000-0000-0000-0000000000d2', 'unit', 2, '{"number": 2}'::jsonb, false);

create or replace function pg_temp.as_service() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "service_role"}'::text, true);
  execute 'set local role service_role';
end $$;

-- ---------------------------------------------------------------------------
-- 1. Grace is 14 days, from the row and from the fallback.
-- ---------------------------------------------------------------------------
do $$ begin
  if (select value #>> '{}' from public.app_config where key = 'membership_grace_days') <> '14' then
    raise exception 'membership_grace_days is not 14'; end if;
  if app.membership_grace() <> interval '14 days' then
    raise exception 'membership_grace() is %', app.membership_grace(); end if;
end $$;
savepoint s_grace;
delete from public.app_config where key = 'membership_grace_days';
do $$ begin
  if app.membership_grace() <> interval '14 days' then
    raise exception 'membership_grace() fallback is %', app.membership_grace(); end if;
end $$;
rollback to savepoint s_grace;

-- A past_due member keeps access for 14 days from the first failure.
select pg_temp.as_service();
do $$ declare r text; e public.entitlements; s public.subscriptions; begin
  r := public.upsert_subscription('sub_ten1', 'cus_ten1', 'a0100000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
    'past_due', 'member_year', 'price_test_year', now() + interval '300 days', false, null, null, null, now());
  if r <> 'applied' then raise exception 'past_due upsert returned %', r; end if;
  select * into s from public.subscriptions where stripe_subscription_id = 'sub_ten1';
  select * into e from public.entitlements
   where user_id = 'a0100000-0000-0000-0000-000000000001' and source = 'membership' and workbook_id is null;
  if e.status <> 'active' or e.ends_at is distinct from s.past_due_since + interval '14 days' then
    raise exception 'grace end wrong: % % (since %)', e.status, e.ends_at, s.past_due_since; end if;
end $$;
reset role;
-- Ten days in: still inside grace.
update public.subscriptions set past_due_since = now() - interval '10 days' where stripe_subscription_id = 'sub_ten1';
do $$ begin
  if not app.subscription_is_live('past_due', now() - interval '10 days') then
    raise exception 'day 10 of 14 is outside grace'; end if;
  if app.subscription_is_live('past_due', now() - interval '15 days') then
    raise exception 'day 15 of 14 is inside grace'; end if;
end $$;
select pg_temp.as_service();
do $$ declare r text; begin
  r := public.sync_membership_entitlement('a0100000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a');
  if r <> 'active' then raise exception 'sync on day 10 returned %', r; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 2. Demo titles are never in the membership.
-- ---------------------------------------------------------------------------
do $$ begin
  if exists (select 1 from public.workbooks where is_demo and in_membership) then
    raise exception 'a demo workbook is in the membership'; end if;
  if not (select in_membership from public.workbooks where id = 'a0100000-0000-0000-0000-0000000000c1') then
    raise exception 'the real title lost its membership flag'; end if;
end $$;

-- A member opens the real title's paid unit but not the demo's.
do $$ begin
  if not app.has_entitlement('a0100000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'a0100000-0000-0000-0000-0000000000c1', 2) then
    raise exception 'member cannot open a title in the membership'; end if;
  if app.has_entitlement('a0100000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'a0100000-0000-0000-0000-0000000000c2', 2) then
    raise exception 'membership opened a demo title'; end if;
end $$;

-- A platform editor cannot put a demo title in; the flag stays false.
select test_as('a0100000-0000-0000-0000-000000000003', array['editor']);
do $$ begin
  update public.workbooks set in_membership = true where id = 'a0100000-0000-0000-0000-0000000000c2';
  if (select in_membership from public.workbooks where id = 'a0100000-0000-0000-0000-0000000000c2') then
    raise exception 'an editor put a demo title in the membership'; end if;
end $$;
reset role;

-- Server code and migrations cannot either.
do $$ begin
  update public.workbooks set in_membership = true where id = 'a0100000-0000-0000-0000-0000000000c2';
  if (select in_membership from public.workbooks where id = 'a0100000-0000-0000-0000-0000000000c2') then
    raise exception 'a direct update put a demo title in the membership'; end if;
end $$;

-- An org owner who marks their own title as a demo takes it out, without
-- tripping the membership guard (they never set in_membership themselves).
savepoint s_demo_flip;
select test_as('a0100000-0000-0000-0000-000000000002');
do $$ begin
  update public.workbooks set is_demo = true, badge = 'demo' where id = 'a0100000-0000-0000-0000-0000000000c1';
end $$;
reset role;
do $$ begin
  if (select in_membership from public.workbooks where id = 'a0100000-0000-0000-0000-0000000000c1') then
    raise exception 'a title marked as demo stayed in the membership'; end if;
end $$;
rollback to savepoint s_demo_flip;

-- An org owner still cannot take a real title out of the membership (0009).
savepoint s_owner;
select test_as('a0100000-0000-0000-0000-000000000002');
do $$ begin
  begin
    update public.workbooks set in_membership = false where id = 'a0100000-0000-0000-0000-0000000000c1';
    raise exception 'an org owner took a title out of the membership';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback to savepoint s_owner;

-- ---------------------------------------------------------------------------
-- 3. Interim membership prices: active, GBP only, minor units.
-- ---------------------------------------------------------------------------
do $$ declare p public.price_points; begin
  select * into p from public.price_points where id = 'member_month';
  if not p.active or p.kind <> 'membership' or p.amounts <> '{"GBP": 799}'::jsonb then
    raise exception 'member_month wrong: % % %', p.active, p.kind, p.amounts; end if;
  select * into p from public.price_points where id = 'member_year';
  if not p.active or p.kind <> 'membership' or p.amounts <> '{"GBP": 6999}'::jsonb then
    raise exception 'member_year wrong: % % %', p.active, p.kind, p.amounts; end if;
  -- a workbook point still needs a Stripe price to go active
  begin
    update public.price_points set amounts = '{"GBP": 1200}'::jsonb, active = true where id = 'p1';
    raise exception 'a workbook point went active with no Stripe price';
  exception when check_violation then null; end;
  -- and a membership point still needs amounts
  begin
    update public.price_points set amounts = '{}'::jsonb where id = 'member_month';
    raise exception 'a membership point stayed active with no amounts';
  exception when check_violation then null; end;
end $$;

-- Anyone can read them, as the paywall does.
set local role anon;
do $$ declare n int; begin
  select count(*) into n from public.price_points where kind = 'membership' and active;
  if n <> 3 then raise exception 'anon sees % active membership points', n; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. Email claims: once per key, service role only, releasable.
-- ---------------------------------------------------------------------------
select test_as('a0100000-0000-0000-0000-000000000001');
do $$ begin
  begin
    perform public.claim_email('renewal_notice:sub_ten1:2027-10-06');
    raise exception 'a reader claimed an email';
  exception when insufficient_privilege then null; end;
  begin
    perform app.claim_email('renewal_notice:sub_ten1:2027-10-06');
    raise exception 'a reader called app.claim_email';
  exception when insufficient_privilege then null; end;
  begin
    perform count(*) from public.email_claims;
    raise exception 'a reader read email_claims';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select pg_temp.as_service();
do $$ begin
  if not public.claim_email('renewal_notice:sub_ten1:2027-10-06') then
    raise exception 'the first claim failed'; end if;
  if public.claim_email('renewal_notice:sub_ten1:2027-10-06') then
    raise exception 'a repeated claim succeeded'; end if;
  if not public.claim_email('renewal_notice:sub_ten1:2028-10-06') then
    raise exception 'the next renewal date could not be claimed'; end if;
  if not public.release_email('renewal_notice:sub_ten1:2027-10-06') then
    raise exception 'release found nothing'; end if;
  if not public.claim_email('renewal_notice:sub_ten1:2027-10-06') then
    raise exception 'a released key could not be claimed again'; end if;
  begin
    perform public.claim_email('reader@example.com');
    raise exception 'an email address was accepted as a key';
  exception when check_violation then null; end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 5. Every Stripe customer of a reader whose deletion is due, live or not.
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
do $$ declare r text; begin
  r := public.upsert_subscription('sub_ten2', 'cus_ten2', 'a0100000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
    'canceled', 'member_month', 'price_test_month', now() - interval '30 days', false, null, now() - interval '40 days', now() - interval '30 days', now());
  if r <> 'applied' then raise exception 'canceled upsert returned %', r; end if;
  if exists (select 1 from public.due_deletion_customers()) then raise exception 'customers listed before any deletion is due'; end if;
end $$;
reset role;

select test_as('a0100000-0000-0000-0000-000000000001');
do $$ begin
  perform public.request_account_deletion(null);
  begin
    perform public.due_deletion_customers();
    raise exception 'a reader read due deletion customers';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.account_deletion_requests set requested_at = now() - interval '8 days'
 where user_id = 'a0100000-0000-0000-0000-000000000001';

select pg_temp.as_service();
do $$ declare c text[]; begin
  select array_agg(stripe_customer_id order by stripe_customer_id) into c from public.due_deletion_customers();
  if c is distinct from array['cus_ten1', 'cus_ten2'] then raise exception 'due customers should be cus_ten1 and cus_ten2, saw %', c; end if;
end $$;
reset role;

rollback;
\echo PASS 0010_membership_settings
