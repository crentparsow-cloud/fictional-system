-- Akana Business phase 3 (0030): organisation billing mirror, past due with
-- grace, suspension and end; organisation income as a pool receipt and its
-- pool split; join links with a cap, an expiry and a domain; the bulk
-- invite quota; seat changes; owner offboarding, the roster export and the
-- 30-day sweep; self-serve behind a flag that is off. Each block must raise
-- or return the expected value; a failure aborts the script.
\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
-- 01 owner, 02 finance, 03 viewer, 04 member A (work), 05 member B (home),
-- 06 outsider, 07 platform editor, 08 member C (work), 09 member D (work),
-- 10 self-serve organiser.
insert into auth.users (id, email) values
  ('a0300000-0000-0000-0000-000000000001', 'owner30@work30.example'),
  ('a0300000-0000-0000-0000-000000000002', 'finance30@work30.example'),
  ('a0300000-0000-0000-0000-000000000003', 'viewer30@work30.example'),
  ('a0300000-0000-0000-0000-000000000004', 'amy@work30.example'),
  ('a0300000-0000-0000-0000-000000000005', 'ben@home30.example'),
  ('a0300000-0000-0000-0000-000000000006', 'xander@other30.example'),
  ('a0300000-0000-0000-0000-000000000007', 'editor30@akana.example'),
  ('a0300000-0000-0000-0000-000000000008', 'cat@work30.example'),
  ('a0300000-0000-0000-0000-000000000009', 'dan@work30.example'),
  ('a0300000-0000-0000-0000-000000000010', 'organiser30@home30.example');
insert into public.profiles (user_id) values
  ('a0300000-0000-0000-0000-000000000004'), ('a0300000-0000-0000-0000-000000000005'), ('a0300000-0000-0000-0000-000000000010')
on conflict do nothing;

-- A publisher with two titles: c1 in the membership, c2 outside it.
insert into public.organisations (id, kind, legal_name, display_name, slug, country) values
  ('a0300000-0000-0000-0000-0000000000f1', 'publisher', 'Pub 30 Ltd', 'Pub 30', 'pub-30', 'GB'),
  ('a0300000-0000-0000-0000-0000000000f2', 'business', 'Biz 30 Ltd', 'Biz 30', 'biz-30', 'GB');
insert into public.org_profiles (org_id, billing_name, billing_email, billing_country) values
  ('a0300000-0000-0000-0000-0000000000f2', 'Pat Payer', 'billing@work30.example', 'GB');
insert into public.org_members (org_id, user_id, role) values
  ('a0300000-0000-0000-0000-0000000000f2', 'a0300000-0000-0000-0000-000000000001', 'owner'),
  ('a0300000-0000-0000-0000-0000000000f2', 'a0300000-0000-0000-0000-000000000002', 'finance'),
  ('a0300000-0000-0000-0000-0000000000f2', 'a0300000-0000-0000-0000-000000000003', 'viewer');
insert into public.books (id, org_id, slug, title) values
  ('a0300000-0000-0000-0000-0000000000b1', 'a0300000-0000-0000-0000-0000000000f1', 'book-30', 'Book 30');
insert into public.workbooks (id, code, book_id, org_id, tenant_id, slug, title, card_line, genre_id, depth, badge, is_demo, status, safety_tier, in_membership) values
  ('a0300000-0000-0000-0000-0000000000c1', 'AK-PTX01', 'a0300000-0000-0000-0000-0000000000b1', 'a0300000-0000-0000-0000-0000000000f1',
   '00000000-0000-0000-0000-00000000000a', 'wb30-one', 'Wb One', 'Card', 'productivity', 'full', 'official', false, 'live', 'none', true),
  ('a0300000-0000-0000-0000-0000000000c2', 'AK-PTX02', 'a0300000-0000-0000-0000-0000000000b1', 'a0300000-0000-0000-0000-0000000000f1',
   '00000000-0000-0000-0000-00000000000a', 'wb30-two', 'Wb Two', 'Card', 'productivity', 'full', 'official', false, 'live', 'none', false);
insert into public.workbook_versions (id, workbook_id, semver, content, content_hash, published_at) values
  ('a0300000-0000-0000-0000-0000000000d1', 'a0300000-0000-0000-0000-0000000000c1', '1.0.0', '{"schema_version": "3.0"}'::jsonb, repeat('c', 64), now()),
  ('a0300000-0000-0000-0000-0000000000d2', 'a0300000-0000-0000-0000-0000000000c2', '1.0.0', '{"schema_version": "3.0"}'::jsonb, repeat('d', 64), now());

-- L1 teams (to be billed in Stripe), L2 teams by manual invoice, P1 a pilot.
insert into public.org_licences (id, org_id, kind, title_scope, seats_purchased, starts_at, ends_at) values
  ('a0300000-0000-0000-0000-0000000000e1', 'a0300000-0000-0000-0000-0000000000f2', 'teams', 'membership', 3, '2026-05-01', now() + interval '1 year'),
  ('a0300000-0000-0000-0000-0000000000e2', 'a0300000-0000-0000-0000-0000000000f2', 'teams', 'membership', 2, '2026-05-01', now() + interval '1 year'),
  ('a0300000-0000-0000-0000-0000000000e3', 'a0300000-0000-0000-0000-0000000000f2', 'pilot', 'membership', 2, '2026-05-01', now() + interval '3 months');

create table public.t30_ids (k text primary key, v uuid not null);
grant select, insert on public.t30_ids to anon, authenticated, service_role;
create function public.t30(p text) returns uuid language sql stable as $$ select v from public.t30_ids where k = p $$;
grant execute on function public.t30(text) to anon, authenticated, service_role;
create function public.t30_hash(p text) returns text language sql immutable as $$
  select encode(sha256(convert_to(p, 'UTF8')), 'hex') $$;
grant execute on function public.t30_hash(text) to anon, authenticated, service_role;

create or replace function pg_temp.as_service() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "service_role"}'::text, true);
  execute 'set local role service_role';
end $$;
create or replace function pg_temp.as_anon() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  execute 'set local role anon';
end $$;

-- ---------------------------------------------------------------------------
-- 1. A pilot is never billed. Staff check a licence before billing it.
-- ---------------------------------------------------------------------------
do $$ begin
  update public.org_licences set stripe_subscription_id = 'sub_pilot30' where id = 'a0300000-0000-0000-0000-0000000000e3';
  raise exception 'a pilot took a Stripe subscription';
exception when check_violation then null; end $$;

select test_as('a0300000-0000-0000-0000-000000000007', array['editor']);
do $$ declare n int; begin
  select count(*) into n from public.org_billing_link_check('a0300000-0000-0000-0000-0000000000e1') where seats = 3 and billing_email = 'billing@work30.example';
  if n <> 1 then raise exception 'link check did not return the licence'; end if;
  begin
    perform * from public.org_billing_link_check('a0300000-0000-0000-0000-0000000000e3');
    raise exception 'a pilot passed the billing check';
  exception when sqlstate 'AKO14' then null; end;
end $$;
reset role;
select test_as('a0300000-0000-0000-0000-000000000001');
do $$ begin
  perform * from public.org_billing_link_check('a0300000-0000-0000-0000-0000000000e1');
  raise exception 'an organisation owner started Stripe billing';
exception when sqlstate 'AKO01' then null; end $$;
-- Clients never write the mirror.
do $$ begin
  perform public.org_billing_apply('sub_T30a', 'cus_T30a', 'a0300000-0000-0000-0000-0000000000e1', 'active', 'teams_seat_year', null,
    3, 'send_invoice', 30, '2026-06-01', now() + interval '300 days', false, null, null, null, false, now());
  raise exception 'a client called org_billing_apply';
exception when insufficient_privilege then null; end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 2. The mirror (F-220): active, stale, seat rises and falls, a pilot refused.
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
do $$ declare r text; l public.org_licences; begin
  r := public.org_billing_apply('sub_T30a', 'cus_T30a', 'a0300000-0000-0000-0000-0000000000e1', 'active', 'teams_seat_year', 'price_T30',
    3, 'send_invoice', 30, '2026-06-01', now() + interval '300 days', false, null, null, null, false, '2026-06-01');
  if r <> 'applied' then raise exception 'first apply returned %', r; end if;
  select * into l from public.org_licences where id = 'a0300000-0000-0000-0000-0000000000e1';
  if l.stripe_subscription_id <> 'sub_T30a' or l.billing_state <> 'active' or l.status <> 'active' or l.seats_purchased <> 3 then
    raise exception 'the licence did not follow the subscription';
  end if;
  if l.ends_at < now() + interval '301 days' or l.ends_at > now() + interval '303 days' then
    raise exception 'ends_at is not the period end plus two days: %', l.ends_at;
  end if;
  r := public.org_billing_apply('sub_T30a', 'cus_T30a', null, 'canceled', 'teams_seat_year', 'price_T30',
    3, 'send_invoice', 30, '2026-06-01', now() + interval '300 days', false, null, null, null, false, '2026-05-01');
  if r <> 'stale' then raise exception 'an older observation was applied: %', r; end if;
  r := public.org_billing_apply('sub_T30p', 'cus_T30a', 'a0300000-0000-0000-0000-0000000000e3', 'active', 'teams_seat_year', null,
    2, 'send_invoice', 30, '2026-06-01', now() + interval '300 days', false, null, null, null, false, now());
  if r <> 'unlinked' then raise exception 'a pilot was linked to a subscription: %', r; end if;
  -- A second subscription cannot take a licence that already has one.
  r := public.org_billing_apply('sub_T30x', 'cus_T30a', 'a0300000-0000-0000-0000-0000000000e1', 'active', 'teams_seat_year', null,
    9, 'send_invoice', 30, '2026-06-01', now() + interval '300 days', false, null, null, null, false, now());
  if r <> 'unlinked' then raise exception 'a second subscription took the licence: %', r; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. Join links (F-225).
-- ---------------------------------------------------------------------------
select test_as('a0300000-0000-0000-0000-000000000003');
do $$ begin
  perform public.org_join_link_create('a0300000-0000-0000-0000-0000000000e1', public.t30_hash('link-v'), 10, 2, null);
  raise exception 'a viewer made a join link';
exception when sqlstate 'AKO01' then null; end $$;
reset role;

select test_as('a0300000-0000-0000-0000-000000000001');
do $$ declare v uuid; begin
  v := public.org_join_link_create('a0300000-0000-0000-0000-0000000000e1', public.t30_hash('link-work'), 10, 2, '@Work30.example');
  insert into public.t30_ids values ('link_work', v);
  v := public.org_join_link_create('a0300000-0000-0000-0000-0000000000e1', public.t30_hash('link-open'), 500, 1, null);
  insert into public.t30_ids values ('link_open', v);
  begin
    perform public.org_join_link_create('a0300000-0000-0000-0000-0000000000e1', public.t30_hash('link-big'), 10, 4, null);
    raise exception 'a cap above the seats was accepted';
  exception when sqlstate 'AKO02' then null; end;
  begin
    perform public.org_join_link_create('a0300000-0000-0000-0000-0000000000e1', public.t30_hash('link-bad'), 10, 1, 'not a domain');
    raise exception 'a bad domain was accepted';
  exception when sqlstate 'AKO02' then null; end;
  begin
    perform public.org_join_link_create('a0300000-0000-0000-0000-0000000000e3', public.t30_hash('link-x'), 0, 1, null);
    raise exception 'a zero-day link was accepted';
  exception when sqlstate 'AKO02' then null; end;
end $$;
-- The owner reads links, never the token hash.
do $$ declare n int; d text; begin
  select count(*) into n from public.org_join_links where org_id = 'a0300000-0000-0000-0000-0000000000f2';
  if n <> 2 then raise exception 'owner sees % links', n; end if;
  select email_domain into d from public.org_join_links where id = public.t30('link_work');
  if d <> 'work30.example' then raise exception 'domain not normalised: %', d; end if;
  begin
    perform token_hash from public.org_join_links limit 1;
    raise exception 'token_hash was readable';
  exception when insufficient_privilege then null; end;
end $$;
-- An open link expires no later than the licence.
do $$ declare e timestamptz; begin
  select expires_at into e from public.org_join_links where id = public.t30('link_open');
  if e > now() + interval '91 days' then raise exception 'a link outlives the 90 day maximum'; end if;
end $$;
reset role;

-- Anyone holding the link sees the organisation and the domain.
select pg_temp.as_anon();
do $$ declare r record; begin
  select * into r from public.org_join_link_view(public.t30_hash('link-work'));
  if r.state <> 'ok' or r.organisation_name <> 'Biz 30' or r.email_domain <> 'work30.example' then raise exception 'link view wrong: %', r; end if;
  select * into r from public.org_join_link_view(public.t30_hash('nope'));
  if r.state <> 'unknown' or r.organisation_name is not null then raise exception 'an unknown link said something'; end if;
  begin
    perform * from public.org_join_link_claim(public.t30_hash('link-work'), true);
    raise exception 'anon claimed a seat';
  exception when sqlstate 'AKO01' or insufficient_privilege then null; end;
end $$;
reset role;

-- B is not on the domain; A must confirm 18+; A and C take seats; D finds it full.
select test_as('a0300000-0000-0000-0000-000000000005');
do $$ begin
  perform * from public.org_join_link_claim(public.t30_hash('link-work'), true);
  raise exception 'an address off the domain claimed';
exception when sqlstate 'AKO11' then null; end $$;
reset role;
select test_as('a0300000-0000-0000-0000-000000000004');
do $$ declare r record; e text; begin
  begin
    perform * from public.org_join_link_claim(public.t30_hash('link-work'), false);
    raise exception 'a claim without the 18+ confirmation';
  exception when sqlstate 'AKO10' then null; end;
  select * into r from public.org_join_link_claim(public.t30_hash('link-work'), true);
  if r.already then raise exception 'first claim said already'; end if;
  insert into public.t30_ids values ('seat_a', r.seat_id);
  select * into r from public.org_join_link_claim(public.t30_hash('link-work'), true);
  if not r.already or r.seat_id <> public.t30('seat_a') then raise exception 'second claim not idempotent'; end if;
  if not app.has_entitlement('a0300000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000a', 'a0300000-0000-0000-0000-0000000000c1') then
    raise exception 'the seat did not open a membership title';
  end if;
end $$;
reset role;
select test_as('a0300000-0000-0000-0000-000000000008');
select * from public.org_join_link_claim(public.t30_hash('link-work'), true);
reset role;
select test_as('a0300000-0000-0000-0000-000000000009');
do $$ begin
  perform * from public.org_join_link_claim(public.t30_hash('link-work'), true);
  raise exception 'a claim past the cap';
exception when sqlstate 'AKO12' then null; end $$;
reset role;
-- B takes the open link: no domain, so no address on the roster.
select test_as('a0300000-0000-0000-0000-000000000005');
select * from public.org_join_link_claim(public.t30_hash('link-open'), true);
reset role;
do $$ declare n int; m int; begin
  select count(*) into n from public.org_seats where licence_id = 'a0300000-0000-0000-0000-0000000000e1' and released_at is null;
  if n <> 3 then raise exception 'expected 3 open seats, got %', n; end if;
  select count(*) into m from public.org_seats where licence_id = 'a0300000-0000-0000-0000-0000000000e1' and roster_email = 'amy@work30.example';
  if m <> 1 then raise exception 'the domain link did not record the work address'; end if;
  select count(*) into m from public.org_seats where user_id = 'a0300000-0000-0000-0000-000000000005' and roster_email is null and join_link_id = public.t30('link_open');
  if m <> 1 then raise exception 'the open link recorded an address'; end if;
end $$;
-- The licence is full: the view says so.
select pg_temp.as_anon();
do $$ declare r record; begin
  select * into r from public.org_join_link_view(public.t30_hash('link-work'));
  if r.state <> 'full' then raise exception 'a full link said %', r.state; end if;
end $$;
reset role;

-- The hourly claim limit.
update public.app_config set value = '0' where key = 'org_join_link_claims_per_hour';
select test_as('a0300000-0000-0000-0000-000000000001');
do $$ declare v uuid; begin
  v := public.org_join_link_create('a0300000-0000-0000-0000-0000000000e2', public.t30_hash('link-l2'), 5, 2, null);
  insert into public.t30_ids values ('link_l2', v);
end $$;
reset role;
select test_as('a0300000-0000-0000-0000-000000000009');
do $$ begin
  perform * from public.org_join_link_claim(public.t30_hash('link-l2'), true);
  raise exception 'the hourly limit did not hold';
exception when sqlstate 'AKO29' then null; end $$;
reset role;
update public.app_config set value = '30' where key = 'org_join_link_claims_per_hour';
-- Revoking closes the link.
select test_as('a0300000-0000-0000-0000-000000000001');
do $$ declare r record; begin
  if not public.org_join_link_revoke(public.t30('link_l2')) then raise exception 'revoke returned false'; end if;
  select * into r from public.org_join_link_view(public.t30_hash('link-l2'));
  if r.state <> 'revoked' then raise exception 'a revoked link said %', r.state; end if;
end $$;
-- The bulk invite quota (0024's limits).
do $$ declare q record; begin
  select * into q from public.org_invite_quota('a0300000-0000-0000-0000-0000000000e2');
  if q.places_left <> 2 or q.sends_left_today <> 50 then raise exception 'quota wrong: %', q; end if;
end $$;
reset role;
select test_as('a0300000-0000-0000-0000-000000000004');
do $$ begin
  perform * from public.org_invite_quota('a0300000-0000-0000-0000-0000000000e2');
  raise exception 'a member read the quota';
exception when sqlstate 'AKO01' then null; end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. Seat changes: up, down, never below seats taken, billing roles only.
-- ---------------------------------------------------------------------------
select test_as('a0300000-0000-0000-0000-000000000003');
do $$ begin
  perform public.org_billing_seat_change_check('a0300000-0000-0000-0000-0000000000e1', 5);
  raise exception 'a viewer changed seats';
exception when sqlstate 'AKO01' then null; end $$;
reset role;
select test_as('a0300000-0000-0000-0000-000000000002');
do $$ begin
  if public.org_billing_seat_change_check('a0300000-0000-0000-0000-0000000000e1', 5) <> 'up' then raise exception 'rise not up'; end if;
  if public.org_billing_seat_change_check('a0300000-0000-0000-0000-0000000000e1', 3) <> 'same' then raise exception 'same not same'; end if;
  begin
    perform public.org_billing_seat_change_check('a0300000-0000-0000-0000-0000000000e1', 2);
    raise exception 'seats went below those taken';
  exception when sqlstate 'AKO08' then null; end;
  begin
    perform public.org_billing_seat_change_check('a0300000-0000-0000-0000-0000000000e2', 3);
    raise exception 'a manual licence changed seats in Stripe';
  exception when sqlstate 'AKO14' then null; end;
end $$;
reset role;

select pg_temp.as_service();
do $$ declare s int; begin
  perform public.org_billing_apply('sub_T30a', 'cus_T30a', null, 'active', 'teams_seat_year', 'price_T30',
    5, 'send_invoice', 30, '2026-06-01', now() + interval '300 days', false, null, null, null, false, '2026-06-02');
  select seats_purchased into s from public.org_licences where id = 'a0300000-0000-0000-0000-0000000000e1';
  if s <> 5 then raise exception 'a rise did not reach the licence: %', s; end if;
  -- A fall in the same period waits for the next one.
  perform public.org_billing_apply('sub_T30a', 'cus_T30a', null, 'active', 'teams_seat_year', 'price_T30',
    4, 'send_invoice', 30, '2026-06-01', now() + interval '300 days', false, null, null, null, false, '2026-06-03');
  select seats_purchased into s from public.org_licences where id = 'a0300000-0000-0000-0000-0000000000e1';
  if s <> 5 then raise exception 'a fall took seats away mid period: %', s; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Past due holds access until the grace ends; unpaid suspends; paid again restores.
-- ---------------------------------------------------------------------------
do $$ declare l public.org_licences; begin
  perform public.org_billing_apply('sub_T30a', 'cus_T30a', null, 'past_due', 'teams_seat_year', 'price_T30',
    4, 'send_invoice', 30, '2026-06-01', now() + interval '300 days', false, null, null, null, false, now());
  select * into l from public.org_licences where id = 'a0300000-0000-0000-0000-0000000000e1';
  if l.status <> 'active' or l.billing_state <> 'past_due' or l.grace_until is null
     or l.grace_until < now() + interval '13 days' or l.grace_until > now() + interval '15 days' or l.ends_at <> l.grace_until then
    raise exception 'past due grace wrong: % % %', l.status, l.grace_until, l.ends_at;
  end if;
  if not app.has_entitlement('a0300000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000a', 'a0300000-0000-0000-0000-0000000000c1') then
    raise exception 'access stopped inside the grace';
  end if;
  perform public.org_billing_apply('sub_T30a', 'cus_T30a', null, 'unpaid', 'teams_seat_year', 'price_T30',
    4, 'send_invoice', 30, '2026-06-01', now() + interval '300 days', false, null, null, null, false, now() + interval '1 second');
  select * into l from public.org_licences where id = 'a0300000-0000-0000-0000-0000000000e1';
  if l.status <> 'suspended' then raise exception 'unpaid did not suspend'; end if;
  if app.has_entitlement('a0300000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000a', 'a0300000-0000-0000-0000-0000000000c1') then
    raise exception 'a suspended licence still opened a title';
  end if;
  perform public.org_billing_apply('sub_T30a', 'cus_T30a', null, 'active', 'teams_seat_year', 'price_T30',
    4, 'send_invoice', 30, '2026-06-01', now() + interval '300 days', false, null, null, null, false, now() + interval '2 seconds');
  select * into l from public.org_licences where id = 'a0300000-0000-0000-0000-0000000000e1';
  if l.status <> 'active' or l.grace_until is not null then raise exception 'payment did not restore the licence'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Invoices (F-220) and organisation income as a pool receipt (F-222).
-- ---------------------------------------------------------------------------
do $$ declare r text; begin
  r := public.org_billing_record_invoice('in_T30none', 'sub_T30zzz', null, 'paid', false, 'GBP', 100, 100, 0, null, 'send_invoice', null,
    null, null, null, now(), null, null, false, now());
  if r <> 'unlinked' then raise exception 'an unknown subscription linked: %', r; end if;
  r := public.org_billing_record_invoice('in_T30a', 'sub_T30a', 'AK-0001', 'open', false, 'gbp', 6000, 0, 1000, 'PO 123', 'send_invoice',
    'subscription_create', '2026-06-01', '2027-06-01', '2026-07-01', null, 'https://invoice.stripe.com/i/acct_x/test_y', 'javascript:alert(1)', false, '2026-06-01');
  if r <> 'recorded' then raise exception 'invoice not recorded: %', r; end if;
  r := public.org_billing_record_invoice('in_T30a', 'sub_T30a', 'AK-0001', 'paid', false, 'gbp', 6000, 6000, 1000, null, 'send_invoice',
    'subscription_create', '2026-06-01', '2027-06-01', '2026-07-01', '2026-06-10', null, null, false, '2026-06-10');
  if r <> 'updated' then raise exception 'invoice not updated: %', r; end if;
  -- A late "open" never undoes a payment.
  r := public.org_billing_record_invoice('in_T30a', 'sub_T30a', 'AK-0001', 'open', false, 'gbp', 6000, 0, 1000, null, 'send_invoice',
    null, '2026-06-01', '2027-06-01', '2026-07-01', null, null, null, false, '2026-06-11');
  if (select status from public.org_invoices where stripe_invoice_id = 'in_T30a') <> 'paid' then raise exception 'a paid invoice went back to open'; end if;
  if (select po_number from public.org_invoices where stripe_invoice_id = 'in_T30a') <> 'PO 123' then raise exception 'the PO number was lost'; end if;
  if (select invoice_pdf_url from public.org_invoices where stripe_invoice_id = 'in_T30a') is not null then raise exception 'a non-Stripe URL was stored'; end if;

  r := public.record_org_licence_receipt('in_T30a', false, 'pi_T30a', null, null);
  if r <> 'recorded' then raise exception 'receipt: %', r; end if;
  r := public.record_org_licence_receipt('in_T30a', false, 'pi_T30a', null, null);
  if r <> 'unchanged' then raise exception 'second receipt: %', r; end if;
  if not exists (select 1 from public.royalty_receipts where stripe_ref = 'in_T30a' and source = 'org_licence' and kind = 'membership'
                  and org_licence_id = 'a0300000-0000-0000-0000-0000000000e1' and user_id is null and period = '2026-06'
                  and tenant_id = '00000000-0000-0000-0000-00000000000a' and gross_minor = 6000 and tax_minor = 1000) then
    raise exception 'the receipt is not a pool receipt for the licence tenant';
  end if;
end $$;
reset role;

-- A pilot puts nothing in, even with an invoice row forced in by hand.
insert into public.org_subscriptions (stripe_subscription_id, org_id, licence_id, stripe_customer_id, status, quantity, paid_quantity,
  collection_method, livemode, observed_at)
values ('sub_T30pilot', 'a0300000-0000-0000-0000-0000000000f2', 'a0300000-0000-0000-0000-0000000000e3', 'cus_T30a', 'active', 2, 2,
  'send_invoice', false, now());
insert into public.org_invoices (stripe_invoice_id, org_id, licence_id, stripe_subscription_id, status, currency, amount_due_minor,
  amount_paid_minor, livemode, observed_at, paid_at)
values ('in_T30pilot', 'a0300000-0000-0000-0000-0000000000f2', 'a0300000-0000-0000-0000-0000000000e3', 'sub_T30pilot', 'paid', 'GBP', 500, 500,
  false, now(), now());
select pg_temp.as_service();
do $$ begin
  if public.record_org_licence_receipt('in_T30pilot', false) <> 'pilot' then raise exception 'a pilot made a receipt'; end if;
end $$;
reset role;
delete from public.org_invoices where stripe_invoice_id = 'in_T30pilot';
delete from public.org_subscriptions where stripe_subscription_id = 'sub_T30pilot';

-- Who reads billing: owner and finance, not the viewer or a member.
select test_as('a0300000-0000-0000-0000-000000000002');
do $$ begin
  if (select count(*) from public.org_invoices) <> 1 or (select count(*) from public.org_subscriptions) <> 1 then
    raise exception 'finance cannot read billing';
  end if;
end $$;
reset role;
select test_as('a0300000-0000-0000-0000-000000000003');
do $$ begin
  if (select count(*) from public.org_invoices) <> 0 or (select count(*) from public.org_subscriptions) <> 0 then
    raise exception 'a viewer read billing';
  end if;
end $$;
reset role;
select test_as('a0300000-0000-0000-0000-000000000004');
do $$ begin
  if (select count(*) from public.org_invoices) <> 0 then raise exception 'a member read invoices'; end if;
  begin
    perform 1 from public.royalty_receipts limit 1;
    if found then raise exception 'a member read receipts'; end if;
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 7. The pool split for June: A and B held seats in June, C joined later.
-- Net 6000 - 1000 VAT = 5000. Seats 5, holders 2: 1000 each. Pool share
-- 0.5: 500 each, all on c1 (c2 is outside the membership scope).
-- ---------------------------------------------------------------------------
update public.org_seats set claimed_at = '2026-06-02' where licence_id = 'a0300000-0000-0000-0000-0000000000e1'
  and user_id in ('a0300000-0000-0000-0000-000000000004', 'a0300000-0000-0000-0000-000000000005');
update public.org_licences set seats_purchased = 5 where id = 'a0300000-0000-0000-0000-0000000000e1';
insert into public.enrolments (id, user_id, tenant_id, workbook_id, version_id, started_at) values
  ('a0300000-0000-0000-0000-0000000000a1', 'a0300000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000a',
   'a0300000-0000-0000-0000-0000000000c1', 'a0300000-0000-0000-0000-0000000000d1', '2026-06-03'),
  ('a0300000-0000-0000-0000-0000000000a2', 'a0300000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000a',
   'a0300000-0000-0000-0000-0000000000c1', 'a0300000-0000-0000-0000-0000000000d1', '2026-06-03'),
  ('a0300000-0000-0000-0000-0000000000a3', 'a0300000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000a',
   'a0300000-0000-0000-0000-0000000000c2', 'a0300000-0000-0000-0000-0000000000d2', '2026-06-03'),
  ('a0300000-0000-0000-0000-0000000000a4', 'a0300000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-00000000000a',
   'a0300000-0000-0000-0000-0000000000c1', 'a0300000-0000-0000-0000-0000000000d1', '2026-06-03');
insert into public.progress_events (enrolment_id, kind, ref, at) values
  ('a0300000-0000-0000-0000-0000000000a1', 'step_done', 'ex_one', '2026-06-15'),
  ('a0300000-0000-0000-0000-0000000000a1', 'step_done', 'ex_two', '2026-06-16'),
  ('a0300000-0000-0000-0000-0000000000a2', 'step_done', 'ex_one', '2026-06-15'),
  ('a0300000-0000-0000-0000-0000000000a3', 'step_done', 'ex_one', '2026-06-15'),
  -- C had no seat in June: these never count for the licence.
  ('a0300000-0000-0000-0000-0000000000a4', 'step_done', 'ex_one', '2026-06-15');

select pg_temp.as_service();
do $$ declare
  v uuid;
  p public.pool_periods;
  a bigint;
  n int;
begin
  v := app.close_pool_period('00000000-0000-0000-0000-00000000000a', '2026-06', 'GBP', false);
  select * into p from public.pool_periods where id = v;
  if p.net_receipts_minor <> 5000 or p.pool_minor <> 2500 then raise exception 'pool net % pool %', p.net_receipts_minor, p.pool_minor; end if;
  select coalesce(sum(allocated_minor), 0) into a from public.pool_usage where period_id = v and source = 'org_teams';
  if a <> 1000 then raise exception 'org pool allocated %, expected 1000', a; end if;
  select count(*) into n from public.pool_usage where period_id = v and workbook_id = 'a0300000-0000-0000-0000-0000000000c2';
  if n <> 0 then raise exception 'a title outside the licence scope took pool money'; end if;
  select count(*) into n from public.pool_usage where period_id = v;
  if n <> 2 then raise exception 'expected 2 usage rows (A and B on c1), got %', n; end if;
  if not exists (select 1 from public.royalty_lines where pool_period_id = v and kind = 'pool' and income_source = 'org_teams'
                  and workbook_id = 'a0300000-0000-0000-0000-0000000000c1' and author_minor = 1000
                  and org_id = 'a0300000-0000-0000-0000-0000000000f1' and idem_key like '%:org_teams' and note not like '%Biz 30%') then
    raise exception 'the organisation pool line is missing or names the organisation';
  end if;
  if p.allocated_minor <> 1000 or p.unallocated_minor <> 1500 then raise exception 'pool allocated % unallocated %', p.allocated_minor, p.unallocated_minor; end if;
  -- A refund of the organisation's payment carries the licence.
  if app.record_refund('refund', 're_T30a', 'pi_T30a', 1000, 'GBP', false) <> 'recorded' then raise exception 'refund not recorded'; end if;
  if not exists (select 1 from public.royalty_receipts where stripe_ref = 're_T30a' and source = 'org_licence'
                  and org_licence_id = 'a0300000-0000-0000-0000-0000000000e1' and gross_minor = -1000) then
    raise exception 'the refund lost its licence';
  end if;
  perform app.close_due_pools(false);
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 8. Offboarding (F-228): the owner ends the billed licence; it ends when
-- Stripe says so. The manual licence ends at once.
-- ---------------------------------------------------------------------------
select test_as('a0300000-0000-0000-0000-000000000002');
do $$ begin
  if public.org_billing_end_allowed('a0300000-0000-0000-0000-0000000000e1') then raise exception 'finance may end a licence'; end if;
  perform public.org_licence_end_request('a0300000-0000-0000-0000-0000000000e1');
  raise exception 'finance ended a licence';
exception when sqlstate 'AKO01' then null; end $$;
reset role;
select test_as('a0300000-0000-0000-0000-000000000001');
do $$ begin
  if not public.org_billing_end_allowed('a0300000-0000-0000-0000-0000000000e1') then raise exception 'the owner may not end the licence'; end if;
  if public.org_licence_end_request('a0300000-0000-0000-0000-0000000000e1') <> 'ending' then raise exception 'billed end not ending'; end if;
  if (select status from public.org_licences where id = 'a0300000-0000-0000-0000-0000000000e1') <> 'active' then
    raise exception 'the billed licence ended before the paid period';
  end if;
  begin
    perform public.org_billing_seat_change_check('a0300000-0000-0000-0000-0000000000e1', 5);
    raise exception 'seats changed on an ending licence';
  exception when sqlstate 'AKO08' then null; end;
  if public.org_licence_end_request('a0300000-0000-0000-0000-0000000000e2') <> 'ended' then raise exception 'manual end not ended'; end if;
end $$;
reset role;

select pg_temp.as_service();
do $$ declare l public.org_licences; n int; begin
  perform public.org_billing_apply('sub_T30a', 'cus_T30a', null, 'canceled', 'teams_seat_year', 'price_T30',
    4, 'send_invoice', 30, '2026-06-01', now() + interval '300 days', false, null, now(), now(), false, now() + interval '3 seconds');
  select * into l from public.org_licences where id = 'a0300000-0000-0000-0000-0000000000e1';
  if l.status <> 'ended' or l.ended_at is null then raise exception 'canceled did not end the licence'; end if;
  select count(*) into n from public.org_seats where licence_id = l.id and released_at is null;
  if n <> 0 then raise exception 'seats stayed open after the end'; end if;
  select count(*) into n from public.org_roster_archive where licence_id = l.id;
  if n <> 2 then raise exception 'expected 2 archived addresses, got %', n; end if;
  select count(*) into n from public.org_join_links where licence_id = l.id and revoked_at is null;
  if n <> 0 then raise exception 'join links stayed open'; end if;
end $$;
reset role;

-- The member keeps their work, read only, and is told.
select test_as('a0300000-0000-0000-0000-000000000004');
do $$ declare r record; begin
  if app.has_entitlement('a0300000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000a', 'a0300000-0000-0000-0000-0000000000c1') then
    raise exception 'an ended licence still opened a title';
  end if;
  select * into r from public.my_ended_org_seats();
  if r.organisation_name <> 'Biz 30' then raise exception 'no read-only notice for the member'; end if;
  if (select count(*) from public.enrolments where user_id = 'a0300000-0000-0000-0000-000000000004') <> 1 then
    raise exception 'the member lost their enrolment';
  end if;
  begin
    perform * from public.org_roster_export('a0300000-0000-0000-0000-0000000000f2');
    raise exception 'a member exported the roster';
  exception when sqlstate 'AKO01' then null; end;
end $$;
reset role;

-- The organisation exports its roster after the end: addresses come from the archive.
select test_as('a0300000-0000-0000-0000-000000000001');
do $$ declare n int; begin
  select count(*) into n from public.org_roster_export('a0300000-0000-0000-0000-0000000000f2')
   where roster_email in ('amy@work30.example', 'cat@work30.example') and joined_by = 'link' and released_reason = 'licence_ended';
  if n <> 2 then raise exception 'roster export after end has % addresses', n; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 9. Self-serve (F-226): off by default, then on.
-- ---------------------------------------------------------------------------
select pg_temp.as_anon();
do $$ begin
  if public.org_self_serve_open() then raise exception 'self-serve is open by default'; end if;
end $$;
reset role;
select pg_temp.as_service();
do $$ begin
  perform public.org_self_serve_provision('a0300000-0000-0000-0000-000000000010', 'group_member_month', 'community_group',
    'Book Club 30', 'GB', 'organiser30@home30.example', 'sub_T30ss', 6);
  raise exception 'provisioned while the flag is off';
exception when sqlstate 'AKO13' then null; end $$;
reset role;
update public.feature_flags set enabled = true where key = 'org_self_serve' and scope = 'global';
select pg_temp.as_service();
do $$ declare v uuid; w uuid; o uuid; begin
  v := public.org_self_serve_provision('a0300000-0000-0000-0000-000000000010', 'group_member_month', 'community_group',
    'Book Club 30', 'GB', 'organiser30@home30.example', 'sub_T30ss', 6);
  w := public.org_self_serve_provision('a0300000-0000-0000-0000-000000000010', 'group_member_month', 'community_group',
    'Book Club 30', 'GB', 'organiser30@home30.example', 'sub_T30ss', 6);
  if v <> w then raise exception 'provision is not idempotent'; end if;
  select org_id into o from public.org_licences where id = v and kind = 'group' and self_serve and seats_purchased = 6;
  if o is null then raise exception 'self-serve licence wrong'; end if;
  insert into public.t30_ids values ('ss_org', o);
  begin
    perform public.org_self_serve_provision('a0300000-0000-0000-0000-000000000010', 'group_member_month', 'community_group',
      'Big Club', 'GB', null, 'sub_T30ss2', 40);
    raise exception 'a group above the maximum was accepted';
  exception when sqlstate 'AKO02' then null; end;
  begin
    perform public.org_self_serve_provision('a0300000-0000-0000-0000-000000000010', 'teams_seat_month', 'church',
      'A Church', 'GB', null, 'sub_T30ss3', 5);
    raise exception 'a church signed up for Teams by itself';
  exception when sqlstate 'AKO02' then null; end;
  -- The subscription then links to the licence it provisioned.
  if public.org_billing_apply('sub_T30ss', 'cus_T30ss', null, 'active', 'group_member_month', null,
       6, 'charge_automatically', null, now(), now() + interval '30 days', false, null, null, null, false, now()) <> 'applied' then
    raise exception 'the self-serve subscription did not apply';
  end if;
end $$;
reset role;
update public.feature_flags set enabled = false where key = 'org_self_serve' and scope = 'global';
do $$ begin
  if not exists (select 1 from public.org_members where org_id = public.t30('ss_org') and user_id = 'a0300000-0000-0000-0000-000000000010' and role = 'owner') then
    raise exception 'the organiser is not the owner';
  end if;
end $$;
-- The last-owner guard still holds outside the sweep.
do $$ begin
  delete from public.org_members where org_id = public.t30('ss_org');
  raise exception 'the last owner was removed';
exception when check_violation then null; end $$;

-- ---------------------------------------------------------------------------
-- 10. The sweep (F-228): not while a licence is live; then 30 days after the
-- last end the roster and admin details go. Invoices stay.
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
do $$ begin
  if public.org_offboard_sweep() <> 0 then raise exception 'the sweep took an organisation with a live pilot'; end if;
end $$;
reset role;
update public.org_licences set status = 'ended', ended_at = now() where id = 'a0300000-0000-0000-0000-0000000000e3';
select pg_temp.as_service();
do $$ begin
  if public.org_offboard_sweep() <> 0 then raise exception 'the sweep ran before 30 days'; end if;
end $$;
reset role;
update public.org_licences set ended_at = now() - interval '60 days' where org_id = 'a0300000-0000-0000-0000-0000000000f2';
select pg_temp.as_service();
do $$ declare n int; begin
  n := public.org_offboard_sweep();
  if n <> 1 then raise exception 'sweep offboarded %', n; end if;
  if public.org_offboard_sweep() <> 0 then raise exception 'the sweep ran twice'; end if;
end $$;
reset role;
do $$ begin
  if exists (select 1 from public.org_members where org_id = 'a0300000-0000-0000-0000-0000000000f2') then raise exception 'admins kept'; end if;
  if exists (select 1 from public.org_seats where org_id = 'a0300000-0000-0000-0000-0000000000f2') then raise exception 'roster kept'; end if;
  if exists (select 1 from public.org_roster_archive where org_id = 'a0300000-0000-0000-0000-0000000000f2') then raise exception 'archive kept'; end if;
  if exists (select 1 from public.org_join_links where org_id = 'a0300000-0000-0000-0000-0000000000f2') then raise exception 'links kept'; end if;
  if (select billing_email from public.org_profiles where org_id = 'a0300000-0000-0000-0000-0000000000f2') is not null then raise exception 'billing contact kept'; end if;
  if (select status from public.organisations where id = 'a0300000-0000-0000-0000-0000000000f2') <> 'closed' then raise exception 'not closed'; end if;
  if not exists (select 1 from public.org_invoices where org_id = 'a0300000-0000-0000-0000-0000000000f2') then raise exception 'invoices deleted'; end if;
  if (select count(*) from public.enrolments where user_id = 'a0300000-0000-0000-0000-000000000004') <> 1 then raise exception 'a member lost work'; end if;
end $$;

-- Clients cannot run the sweep or provision.
select test_as('a0300000-0000-0000-0000-000000000001');
do $$ begin
  perform public.org_offboard_sweep();
  raise exception 'a client ran the sweep';
exception when insufficient_privilege then null; end $$;
reset role;

rollback;
\echo PASS 0030_org_billing
