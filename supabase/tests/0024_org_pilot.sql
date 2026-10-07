-- Akana Business pilot: customer organisations, licences, seats with the
-- team_seat entitlement, seat invitations and the console counts
-- (F-201 to F-204). has_entitlement guards every paid unit, so it is tested
-- from every side: scope, dates, status, the organisation's status, release,
-- a second licence, other tenants, and the sources it already served. Each
-- block must raise or return the expected value; a failure aborts the script.
\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
-- 001 business owner, 002 finance, 003 viewer, 004 member A, 005 member B,
-- 006 outsider X, 007 platform editor, 008 platform support, 009 church
-- owner, 010 member D (deletion), 011 member E (expiry and limits).
insert into auth.users (id, email) values
  ('a0240000-0000-0000-0000-000000000001', 'owner24@test.example'),
  ('a0240000-0000-0000-0000-000000000002', 'finance24@test.example'),
  ('a0240000-0000-0000-0000-000000000003', 'viewer24@test.example'),
  ('a0240000-0000-0000-0000-000000000004', 'amy@home.example'),
  ('a0240000-0000-0000-0000-000000000005', 'ben@home.example'),
  ('a0240000-0000-0000-0000-000000000006', 'xander@test.example'),
  ('a0240000-0000-0000-0000-000000000007', 'editor24@akana.example'),
  ('a0240000-0000-0000-0000-000000000008', 'support24@akana.example'),
  ('a0240000-0000-0000-0000-000000000009', 'vicar24@test.example'),
  ('a0240000-0000-0000-0000-000000000010', 'dee@home.example'),
  ('a0240000-0000-0000-0000-000000000011', 'eve@home.example');
insert into public.profiles (user_id) values ('a0240000-0000-0000-0000-000000000004') on conflict do nothing;
-- Twelve readers for the counting test.
insert into auth.users (id, email)
select ('a0240000-0000-0000-0001-0000000000' || lpad(n::text, 2, '0'))::uuid, 'count' || n || '@test.example'
from generate_series(1, 12) n;

-- A publisher with six titles. c1, c2 in the membership; c3 outside it; c4
-- demo; c5 higher tier; c6 on a white-label storefront.
insert into public.organisations (id, kind, legal_name, display_name, slug, country) values
  ('a0240000-0000-0000-0000-0000000000f1', 'publisher', 'Pub 24 Ltd', 'Pub 24', 'pub-24', 'GB');
insert into public.tenants (id, slug, kind, org_id, name) values
  ('a0240000-0000-0000-0000-0000000000e2', 'wl-24', 'white_label', 'a0240000-0000-0000-0000-0000000000f1', 'WL 24');
insert into public.books (id, org_id, slug, title) values
  ('a0240000-0000-0000-0000-0000000000b1', 'a0240000-0000-0000-0000-0000000000f1', 'book-24', 'Book 24');
insert into public.workbooks (id, code, book_id, org_id, tenant_id, slug, title, card_line, genre_id, depth, badge, is_demo, status, safety_tier, in_membership) values
  ('a0240000-0000-0000-0000-0000000000c1', 'AK-PTW01', 'a0240000-0000-0000-0000-0000000000b1', 'a0240000-0000-0000-0000-0000000000f1',
   '00000000-0000-0000-0000-00000000000a', 'wb24-one', 'Wb One', 'Card', 'productivity', 'full', 'official', false, 'live', 'none', true),
  ('a0240000-0000-0000-0000-0000000000c2', 'AK-PTW02', 'a0240000-0000-0000-0000-0000000000b1', 'a0240000-0000-0000-0000-0000000000f1',
   '00000000-0000-0000-0000-00000000000a', 'wb24-two', 'Wb Two', 'Card', 'productivity', 'full', 'official', false, 'live', 'none', true),
  ('a0240000-0000-0000-0000-0000000000c3', 'AK-PTW03', 'a0240000-0000-0000-0000-0000000000b1', 'a0240000-0000-0000-0000-0000000000f1',
   '00000000-0000-0000-0000-00000000000a', 'wb24-three', 'Wb Three', 'Card', 'productivity', 'full', 'official', false, 'live', 'none', false),
  ('a0240000-0000-0000-0000-0000000000c4', 'AK-PTW04', 'a0240000-0000-0000-0000-0000000000b1', 'a0240000-0000-0000-0000-0000000000f1',
   '00000000-0000-0000-0000-00000000000a', 'wb24-four', 'Wb Four', 'Card', 'productivity', 'full', 'demo', true, 'live', 'none', true),
  ('a0240000-0000-0000-0000-0000000000c5', 'AK-PTW05', 'a0240000-0000-0000-0000-0000000000b1', 'a0240000-0000-0000-0000-0000000000f1',
   '00000000-0000-0000-0000-00000000000a', 'wb24-five', 'Wb Five', 'Card', 'wellbeing', 'full', 'official', false, 'live', 'higher', true),
  ('a0240000-0000-0000-0000-0000000000c6', 'AK-PTW06', 'a0240000-0000-0000-0000-0000000000b1', 'a0240000-0000-0000-0000-0000000000f1',
   'a0240000-0000-0000-0000-0000000000e2', 'wb24-six', 'Wb Six', 'Card', 'productivity', 'full', 'official', false, 'live', 'none', true);
insert into public.workbook_versions (id, workbook_id, semver, content, content_hash, published_at) values
  ('a0240000-0000-0000-0000-0000000000d1', 'a0240000-0000-0000-0000-0000000000c1', '1.0.0', '{"schema_version": "3.0"}'::jsonb, repeat('a', 64), now()),
  ('a0240000-0000-0000-0000-0000000000d3', 'a0240000-0000-0000-0000-0000000000c3', '1.0.0', '{"schema_version": "3.0"}'::jsonb, repeat('b', 64), now());
update public.workbooks set current_version_id = 'a0240000-0000-0000-0000-0000000000d1' where id = 'a0240000-0000-0000-0000-0000000000c1';
update public.workbooks set current_version_id = 'a0240000-0000-0000-0000-0000000000d3' where id = 'a0240000-0000-0000-0000-0000000000c3';
insert into public.workbook_sections (version_id, kind, unit_number, body, free) values
  ('a0240000-0000-0000-0000-0000000000d1', 'unit', 1, '{"number": 1}'::jsonb, true),
  ('a0240000-0000-0000-0000-0000000000d1', 'unit', 2, '{"number": 2}'::jsonb, false),
  ('a0240000-0000-0000-0000-0000000000d3', 'unit', 2, '{"number": 2}'::jsonb, false);

-- A's own work, which the organisation must never reach.
insert into public.enrolments (id, user_id, tenant_id, workbook_id, version_id) values
  ('a0240000-0000-0000-0000-0000000000a1', 'a0240000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000a',
   'a0240000-0000-0000-0000-0000000000c1', 'a0240000-0000-0000-0000-0000000000d1');
insert into public.answers (enrolment_id, field, sealed, key_id) values
  ('a0240000-0000-0000-0000-0000000000a1', 'exercise:ex_one.f_one', 'v2.k1.AAAA', 'k1');
insert into public.progress_events (enrolment_id, kind, ref) values
  ('a0240000-0000-0000-0000-0000000000a1', 'step_done', 'ex_one');

-- Ids made during the test, readable by every role inside this transaction.
create table public.t24_ids (k text primary key, v uuid not null);
grant select, insert on public.t24_ids to anon, authenticated, service_role;
create function public.t24(p text) returns uuid language sql stable as $$ select v from public.t24_ids where k = p $$;
grant execute on function public.t24(text) to anon, authenticated, service_role;
create function public.t24_hash(p text) returns text language sql immutable as $$
  select encode(sha256(convert_to(p, 'UTF8')), 'hex') $$;
grant execute on function public.t24_hash(text) to anon, authenticated, service_role;

create or replace function pg_temp.as_anon() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  execute 'set local role anon';
end $$;

-- ---------------------------------------------------------------------------
-- 1. Kinds (F-201): the four customer kinds exist, nothing else does.
-- ---------------------------------------------------------------------------
do $$ begin
  insert into public.organisations (kind, legal_name, display_name, slug, country)
  values ('community_group', 'Club', 'Club', 'club-24-direct', 'GB');
  begin
    insert into public.organisations (kind, legal_name, display_name, slug, country) values ('school', 'S', 'S', 's-24', 'GB');
    raise exception 'an unknown organisation kind was accepted';
  exception when check_violation then null; end;
end $$;

-- Staff create customer organisations with a profile; nobody else does.
select test_as('a0240000-0000-0000-0000-000000000007', array['editor']);
do $$ declare v uuid; begin
  v := public.create_customer_organisation('business', ' Biz 24 ', 'Biz 24 Ltd', 'gb', 'biz-24', '50_249', 'Retail', null,
         'gb 123 456 789', 'Pat Payer', 'Billing@Biz.example', null);
  insert into public.t24_ids values ('biz', v);
  v := public.create_customer_organisation('church', 'St Test', 'St Test PCC', 'GB', 'st-test-24', 'under_10', null, '1234567', null, null, null, null);
  insert into public.t24_ids values ('church', v);
  begin
    perform public.create_customer_organisation('publisher', 'P', 'P', 'GB', 'p-24');
    raise exception 'a publisher was made as a customer organisation';
  exception when sqlstate 'AKO02' then null; end;
  begin
    perform public.create_customer_organisation('charity', 'C', 'C', 'GB', 'c-24', null, null, null, 'not a vat number!');
    raise exception 'a bad VAT number was accepted';
  exception when sqlstate 'AKO02' then null; end;
  begin
    perform public.create_customer_organisation('charity', 'C', 'C', 'GB', 'biz-24');
    raise exception 'a duplicate slug was accepted';
  exception when sqlstate 'AKO05' then null; end;
end $$;
reset role;
do $$ declare o record; p record; begin
  select * into o from public.organisations where id = public.t24('biz');
  if o.kind <> 'business' or o.code is not null or o.display_name <> 'Biz 24' or o.country <> 'GB' then
    raise exception 'customer organisation row is wrong: % % % %', o.kind, o.code, o.display_name, o.country; end if;
  select * into p from public.org_profiles where org_id = public.t24('biz');
  if p.billing_email <> 'billing@biz.example' or p.vat_number <> 'GB123456789' or p.billing_country <> 'GB' or p.size_band <> '50_249' then
    raise exception 'profile row is wrong'; end if;
  if not exists (select 1 from public.audit_log where action = 'organisation.created' and org_id = public.t24('biz')) then
    raise exception 'no audit row for the customer organisation'; end if;
end $$;

select test_as('a0240000-0000-0000-0000-000000000008', array['support']);
do $$ begin
  begin
    perform public.create_customer_organisation('business', 'S', 'S', 'GB', 's-co-24');
    raise exception 'platform support created an organisation';
  exception when sqlstate 'AKO01' then null; end;
end $$;
reset role;
select test_as('a0240000-0000-0000-0000-000000000006');
do $$ begin
  begin
    perform public.create_customer_organisation('business', 'S', 'S', 'GB', 's-co-24');
    raise exception 'a reader created an organisation';
  exception when sqlstate 'AKO01' then null; end;
end $$;
reset role;

-- Roles in the business and the church.
insert into public.org_members (org_id, user_id, role) values
  (public.t24('biz'), 'a0240000-0000-0000-0000-000000000001', 'owner'),
  (public.t24('biz'), 'a0240000-0000-0000-0000-000000000002', 'finance'),
  (public.t24('biz'), 'a0240000-0000-0000-0000-000000000003', 'viewer'),
  (public.t24('church'), 'a0240000-0000-0000-0000-000000000009', 'owner');

-- Finance keeps the billing profile; a viewer cannot.
select test_as('a0240000-0000-0000-0000-000000000002');
do $$ begin
  perform public.org_profile_save(public.t24('biz'), '250_999', 'Retail', null, null, 'Pat Payer', 'accounts@biz.example', 'GB');
  if (select billing_email from public.org_profiles where org_id = public.t24('biz')) <> 'accounts@biz.example' then
    raise exception 'finance could not save the profile'; end if;
end $$;
reset role;
select test_as('a0240000-0000-0000-0000-000000000003');
do $$ begin
  begin
    perform public.org_profile_save(public.t24('biz'), null, null, null, null, null, null, null);
    raise exception 'a viewer saved the profile';
  exception when sqlstate 'AKO01' then null; end;
  if exists (select 1 from public.org_profiles) then raise exception 'a viewer read the billing profile'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 2. Licences (F-202): staff only, with checked scope.
-- ---------------------------------------------------------------------------
select test_as('a0240000-0000-0000-0000-000000000007', array['editor']);
do $$ declare v uuid; begin
  v := public.org_licence_create(public.t24('biz'), 'teams', 'membership', 12, now() - interval '1 day', now() + interval '1 year', 'INV-0001');
  insert into public.t24_ids values ('L1', v);
  v := public.org_licence_create(public.t24('biz'), 'pilot', 'list', 2, now() - interval '1 day', now() + interval '90 days', null,
         array['a0240000-0000-0000-0000-0000000000c2'::uuid]);
  insert into public.t24_ids values ('L2', v);
  v := public.org_licence_create(public.t24('church'), 'church', 'membership', 3, now() - interval '1 day', now() + interval '1 year', 'INV-0002');
  insert into public.t24_ids values ('L3', v);
  v := public.org_licence_create(public.t24('biz'), 'teams', 'membership', 20, now() - interval '60 days', now() + interval '1 year', 'INV-0003');
  insert into public.t24_ids values ('L4', v);

  begin
    perform public.org_licence_create('a0240000-0000-0000-0000-0000000000f1', 'teams', 'membership', 5, now(), now() + interval '1 year');
    raise exception 'a licence was made for a publisher';
  exception when sqlstate 'AKO02' then null; end;
  begin
    perform public.org_licence_create(public.t24('biz'), 'teams', 'list', 5, now(), now() + interval '1 year');
    raise exception 'a list licence with no titles was accepted';
  exception when sqlstate 'AKO02' then null; end;
  begin
    perform public.org_licence_create(public.t24('biz'), 'teams', 'list', 5, now(), now() + interval '1 year', null, array['a0240000-0000-0000-0000-0000000000c4'::uuid]);
    raise exception 'a demo title went on a licence';
  exception when sqlstate 'AKO02' then null; end;
  begin
    perform public.org_licence_create(public.t24('biz'), 'teams', 'list', 5, now(), now() + interval '1 year', null, array['a0240000-0000-0000-0000-0000000000c5'::uuid]);
    raise exception 'a higher-tier title went on a licence';
  exception when sqlstate 'AKO02' then null; end;
  begin
    perform public.org_licence_create(public.t24('biz'), 'teams', 'list', 5, now(), now() + interval '1 year', null, array['a0240000-0000-0000-0000-0000000000c6'::uuid]);
    raise exception 'a title from another storefront went on a licence';
  exception when sqlstate 'AKO02' then null; end;
  begin
    perform public.org_licence_create(public.t24('biz'), 'teams', 'membership', 5, now(), now() + interval '1 year', null, array['a0240000-0000-0000-0000-0000000000c1'::uuid]);
    raise exception 'a membership licence took a list';
  exception when sqlstate 'AKO02' then null; end;
  begin
    perform public.org_licence_create(public.t24('biz'), 'teams', 'membership', 5, now(), now() - interval '1 day');
    raise exception 'a licence that ends before it starts was accepted';
  exception when sqlstate 'AKO02' then null; end;
  begin
    perform public.org_licence_create(public.t24('biz'), 'teams', 'membership', 0, now(), now() + interval '1 year');
    raise exception 'a licence with no seats was accepted';
  exception when sqlstate 'AKO02' then null; end;
end $$;
reset role;

select test_as('a0240000-0000-0000-0000-000000000001');
do $$ begin
  begin
    perform public.org_licence_create(public.t24('biz'), 'teams', 'membership', 500, now(), now() + interval '1 year');
    raise exception 'an organisation owner made their own licence';
  exception when sqlstate 'AKO01' then null; end;
  begin
    insert into public.org_licences (org_id, kind, title_scope, seats_purchased, starts_at, ends_at)
    values (public.t24('biz'), 'teams', 'membership', 500, now(), now() + interval '1 year');
    raise exception 'an owner inserted a licence directly';
  exception when insufficient_privilege then null; end;
  begin
    update public.org_licences set seats_purchased = 500;
    raise exception 'an owner updated a licence directly';
  exception when insufficient_privilege then null; end;
  -- The owner reads their organisation's licences and nobody else's.
  if (select count(*) from public.org_licences) <> 3 then raise exception 'owner sees % licences, expected 3', (select count(*) from public.org_licences); end if;
  if exists (select 1 from public.org_licences where org_id = public.t24('church')) then raise exception 'owner read the church licence'; end if;
  if (select count(*) from public.org_licence_titles) <> 1 then raise exception 'owner cannot read the licence titles'; end if;
end $$;
reset role;

select test_as('a0240000-0000-0000-0000-000000000006');
do $$ begin
  if exists (select 1 from public.org_licences) or exists (select 1 from public.org_seats) or exists (select 1 from public.org_profiles)
     or exists (select 1 from public.org_licence_titles) or exists (select 1 from public.org_seat_invitations) then
    raise exception 'an outsider read organisation rows'; end if;
  begin
    perform 1 from public.org_seat_blocks;
    raise exception 'a client read the block list';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select test_as('a0240000-0000-0000-0000-000000000008', array['support']);
do $$ begin
  if (select count(*) from public.org_licences) < 4 then raise exception 'support staff cannot see licences'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. Invitations (F-203): who may send, what is stored, places on a licence.
-- ---------------------------------------------------------------------------
select test_as('a0240000-0000-0000-0000-000000000001');
do $$ declare v uuid; begin
  v := public.org_seat_invite(public.t24('L1'), ' Amy@Work.example ', public.t24_hash('tok-amy'));
  insert into public.t24_ids values ('inv-amy', v);
  if (select email from public.org_seat_invitations where id = v) <> 'amy@work.example' then
    raise exception 'the invitation address was not normalised'; end if;
  begin
    perform token_hash from public.org_seat_invitations;
    raise exception 'the owner read a token hash';
  exception when insufficient_privilege then null; end;
  begin
    perform email_hash from public.org_seat_invitations;
    raise exception 'the owner read an address hash';
  exception when insufficient_privilege then null; end;
  begin
    perform public.org_seat_invite(public.t24('L1'), 'not-an-address', public.t24_hash('tok-bad'));
    raise exception 'a bad address was accepted';
  exception when sqlstate 'AKO02' then null; end;
  begin
    perform public.org_seat_invite(public.t24('L1'), 'ok@work.example', 'abc');
    raise exception 'a bad token hash was accepted';
  exception when sqlstate 'AKO02' then null; end;
  begin
    perform public.org_seat_invite(public.t24('L3'), 'ok@work.example', public.t24_hash('tok-church'));
    raise exception 'the business owner invited to the church licence';
  exception when sqlstate 'AKO01' then null; end;
  -- Places: L2 has two seats. Two invitations fill it; revoking one frees a place.
  v := public.org_seat_invite(public.t24('L2'), 'ben@work.example', public.t24_hash('tok-ben'));
  insert into public.t24_ids values ('inv-ben', v);
  v := public.org_seat_invite(public.t24('L2'), 'cal@work.example', public.t24_hash('tok-cal'));
  insert into public.t24_ids values ('inv-cal', v);
  begin
    perform public.org_seat_invite(public.t24('L2'), 'dan@work.example', public.t24_hash('tok-dan'));
    raise exception 'a third invitation went out on a two-seat licence';
  exception when sqlstate 'AKO07' then null; end;
  if not public.org_seat_invite_revoke(public.t24('inv-cal')) then raise exception 'revoke returned false'; end if;
  if public.org_seat_invite_revoke(public.t24('inv-cal')) then raise exception 'a second revoke changed something'; end if;
  if (select email from public.org_seat_invitations where id = public.t24('inv-cal')) is not null then
    raise exception 'a revoked invitation kept its address'; end if;
  v := public.org_seat_invite(public.t24('L2'), 'dan@work.example', public.t24_hash('tok-dan'));
  insert into public.t24_ids values ('inv-dan', v);
end $$;
reset role;

-- Finance and viewers read seats but do not manage them; outsiders do neither.
select test_as('a0240000-0000-0000-0000-000000000002');
do $$ begin
  begin
    perform public.org_seat_invite(public.t24('L1'), 'f@work.example', public.t24_hash('tok-f'));
    raise exception 'finance sent a seat invitation';
  exception when sqlstate 'AKO01' then null; end;
  if exists (select 1 from public.org_seat_invitations) then raise exception 'finance read invitation addresses'; end if;
end $$;
reset role;
select test_as('a0240000-0000-0000-0000-000000000003');
do $$ begin
  begin
    perform public.org_seat_invite(public.t24('L1'), 'v@work.example', public.t24_hash('tok-v'));
    raise exception 'a viewer sent a seat invitation';
  exception when sqlstate 'AKO01' then null; end;
  begin
    perform public.org_seat_invite_revoke(public.t24('inv-amy'));
    raise exception 'a viewer revoked an invitation';
  exception when sqlstate 'AKO01' then null; end;
end $$;
reset role;
select test_as('a0240000-0000-0000-0000-000000000006');
do $$ begin
  begin
    perform public.org_seat_invite(public.t24('L1'), 'x@work.example', public.t24_hash('tok-x'));
    raise exception 'an outsider sent a seat invitation';
  exception when sqlstate 'AKO01' then null; end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. The link: what anyone holding it sees, and the claim.
-- ---------------------------------------------------------------------------
select pg_temp.as_anon();
do $$ declare r record; begin
  select * into r from public.org_seat_invite_view(public.t24_hash('tok-amy'));
  if r.state <> 'ok' or r.organisation_name <> 'Biz 24' or r.organisation_kind <> 'business' or r.email_hint <> 'a***@work.example' then
    raise exception 'invitation view is wrong: % % %', r.state, r.organisation_name, r.email_hint; end if;
  select * into r from public.org_seat_invite_view(public.t24_hash('no-such-token'));
  if r.state <> 'unknown' or r.organisation_name is not null then raise exception 'an unknown link gave something away'; end if;
  select * into r from public.org_seat_invite_view('not hex');
  if r.state <> 'unknown' then raise exception 'a malformed hash was looked up'; end if;
  select * into r from public.org_seat_invite_view(public.t24_hash('tok-cal'));
  if r.state <> 'revoked' then raise exception 'a revoked link shows %', r.state; end if;
  begin
    perform public.org_seat_claim(public.t24_hash('tok-amy'), true);
    raise exception 'anon claimed a seat';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- No seat yet: A cannot open the paid unit.
do $$ begin
  if app.has_entitlement('a0240000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000a', 'a0240000-0000-0000-0000-0000000000c1', 2) then
    raise exception 'has_entitlement said yes before any seat'; end if;
end $$;

select test_as('a0240000-0000-0000-0000-000000000004');
do $$ declare r record; begin
  begin
    perform public.org_seat_claim(public.t24_hash('tok-amy'), false);
    raise exception 'a seat was claimed without the 18 or over confirmation';
  exception when sqlstate 'AKO10' then null; end;
  begin
    perform public.org_seat_claim(public.t24_hash('tok-amy'), null);
    raise exception 'a seat was claimed with a null confirmation';
  exception when sqlstate 'AKO10' then null; end;
  begin
    perform public.org_seat_claim(public.t24_hash('tok-cal'), true);
    raise exception 'a revoked invitation was claimed';
  exception when sqlstate 'AKO04' then null; end;
  -- A's account address is not the invited work address. The link is enough.
  select * into r from public.org_seat_claim(public.t24_hash('tok-amy'), true);
  if r.already or r.organisation_name <> 'Biz 24' or r.org_id <> public.t24('biz') then raise exception 'claim result is wrong'; end if;
  insert into public.t24_ids values ('seat-amy', r.seat_id);
  begin
    perform public.org_seat_claim(public.t24_hash('tok-amy'), true);
    raise exception 'a used link was claimed again';
  exception when sqlstate 'AKO04' then null; end;
  -- The holder reads their own seat, and nothing about anyone else's.
  if (select count(*) from public.org_seats) <> 1 then raise exception 'the holder sees % seats', (select count(*) from public.org_seats); end if;
  if (select count(*) from public.my_org_seats()) <> 1 or (select organisation_name from public.my_org_seats()) <> 'Biz 24' then
    raise exception 'my_org_seats is wrong'; end if;
  if exists (select 1 from public.org_licences) then raise exception 'a seat holder read licence rows'; end if;
end $$;
reset role;

do $$ declare s record; e record; i record; begin
  select * into s from public.org_seats where id = public.t24('seat-amy');
  if s.user_id <> 'a0240000-0000-0000-0000-000000000004' or s.roster_email <> 'amy@work.example' or s.released_at is not null then
    raise exception 'seat row is wrong'; end if;
  select * into e from public.entitlements where id = s.entitlement_id;
  if e.source <> 'team_seat' or e.workbook_id is not null or e.org_licence_id <> public.t24('L1') or e.status <> 'active'
     or e.ends_at <> (select ends_at from public.org_licences where id = public.t24('L1')) then
    raise exception 'team_seat entitlement is wrong'; end if;
  select * into i from public.org_seat_invitations where id = public.t24('inv-amy');
  if i.accepted_at is null or i.accepted_by <> 'a0240000-0000-0000-0000-000000000004' or i.email is not null then
    raise exception 'the accepted invitation kept its address or was not marked'; end if;
  if (select adult_confirmed_at from public.profiles where user_id = 'a0240000-0000-0000-0000-000000000004') is null then
    raise exception 'the 18 or over confirmation was not recorded'; end if;
  if not exists (select 1 from public.tenant_members where user_id = 'a0240000-0000-0000-0000-000000000004' and tenant_id = '00000000-0000-0000-0000-00000000000a') then
    raise exception 'the seat holder did not join the marketplace tenant'; end if;
  if exists (select 1 from public.audit_log where action like 'org.seat%' and (coalesce(after::text, '') ~ '@' or coalesce(before::text, '') ~ '@' or coalesce(reason, '') ~ '@')) then
    raise exception 'an audit row carries an address'; end if;
end $$;

-- One seat per person per licence: a second invitation for A resolves to the same seat.
select test_as('a0240000-0000-0000-0000-000000000001');
do $$ begin
  begin
    perform public.org_seat_invite(public.t24('L1'), 'amy@work.example', public.t24_hash('tok-amy-again'));
    raise exception 'an address with a seat was invited again';
  exception when sqlstate 'AKO05' then null; end;
  perform public.org_seat_invite(public.t24('L1'), 'amy.other@work.example', public.t24_hash('tok-amy-2'));
end $$;
reset role;
select test_as('a0240000-0000-0000-0000-000000000004');
do $$ declare r record; begin
  select * into r from public.org_seat_claim(public.t24_hash('tok-amy-2'), true);
  if not r.already or r.seat_id <> public.t24('seat-amy') then raise exception 'a second seat was made for the same person'; end if;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.org_seats where licence_id = public.t24('L1') and user_id = 'a0240000-0000-0000-0000-000000000004') <> 1 then
    raise exception 'A holds more than one seat on L1'; end if;
  if (select count(*) from public.entitlements where user_id = 'a0240000-0000-0000-0000-000000000004' and source = 'team_seat') <> 1 then
    raise exception 'A has more than one team_seat row'; end if;
end $$;

-- B takes the list licence seat.
select test_as('a0240000-0000-0000-0000-000000000005');
do $$ declare r record; begin
  select * into r from public.org_seat_claim(public.t24_hash('tok-ben'), true);
  insert into public.t24_ids values ('seat-ben', r.seat_id);
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 5. has_entitlement through a seat: scope.
-- ---------------------------------------------------------------------------
create function public.t24_can(p_user text, p_workbook text, p_tenant uuid default '00000000-0000-0000-0000-00000000000a') returns boolean
language sql stable as $$
  select app.has_entitlement(('a0240000-0000-0000-0000-' || p_user)::uuid, p_tenant, ('a0240000-0000-0000-0000-' || p_workbook)::uuid, 2)
$$;

do $$ begin
  -- A, membership scope.
  if not public.t24_can('000000000004', '0000000000c1') then raise exception 'A cannot open c1 (in the membership)'; end if;
  if not public.t24_can('000000000004', '0000000000c2') then raise exception 'A cannot open c2 (in the membership)'; end if;
  if public.t24_can('000000000004', '0000000000c3') then raise exception 'A opened c3, outside the membership'; end if;
  if public.t24_can('000000000004', '0000000000c4') then raise exception 'A opened a demo title'; end if;
  if public.t24_can('000000000004', '0000000000c5') then raise exception 'A opened a higher-tier title'; end if;
  if public.t24_can('000000000004', '0000000000c6', 'a0240000-0000-0000-0000-0000000000e2') then raise exception 'A opened a title on another storefront'; end if;
  if public.t24_can('000000000004', '0000000000c1', 'a0240000-0000-0000-0000-0000000000e2') then raise exception 'A opened c1 on the wrong tenant'; end if;
  if app.has_entitlement('a0240000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000a', null) then
    raise exception 'a seat answered yes to a library-wide question'; end if;
  if app.has_entitlement('a0240000-0000-0000-0000-000000000004', null, 'a0240000-0000-0000-0000-0000000000c1') then
    raise exception 'a null tenant was let through'; end if;
  if app.has_entitlement(null, '00000000-0000-0000-0000-00000000000a', 'a0240000-0000-0000-0000-0000000000c1') then
    raise exception 'a null user was let through'; end if;
  -- B, list scope: only the listed title, even though c1 is in the membership.
  if not public.t24_can('000000000005', '0000000000c2') then raise exception 'B cannot open the listed title'; end if;
  if public.t24_can('000000000005', '0000000000c1') then raise exception 'B opened a title not on the list'; end if;
  -- X, no seat.
  if public.t24_can('000000000006', '0000000000c1') then raise exception 'X opened c1 with no seat'; end if;
end $$;

-- The section policy follows: A reads unit 2 of c1 and not of c3.
select test_as('a0240000-0000-0000-0000-000000000004');
do $$ begin
  if (select count(*) from public.workbook_sections where version_id = 'a0240000-0000-0000-0000-0000000000d1' and unit_number = 2) <> 1 then
    raise exception 'A cannot read the paid unit of c1 through the seat'; end if;
  if exists (select 1 from public.workbook_sections where version_id = 'a0240000-0000-0000-0000-0000000000d3' and unit_number = 2) then
    raise exception 'A read the paid unit of c3 through the seat'; end if;
end $$;
reset role;
select test_as('a0240000-0000-0000-0000-000000000006');
do $$ begin
  if exists (select 1 from public.workbook_sections where version_id = 'a0240000-0000-0000-0000-0000000000d1' and unit_number = 2) then
    raise exception 'X read the paid unit of c1'; end if;
end $$;
reset role;

-- Changing the list moves access with it.
select test_as('a0240000-0000-0000-0000-000000000007', array['editor']);
do $$ begin
  perform public.org_licence_set_titles(public.t24('L2'), array['a0240000-0000-0000-0000-0000000000c1'::uuid, 'a0240000-0000-0000-0000-0000000000c3'::uuid]);
  begin
    perform public.org_licence_set_titles(public.t24('L1'), array['a0240000-0000-0000-0000-0000000000c1'::uuid]);
    raise exception 'a membership licence took a list';
  exception when sqlstate 'AKO08' then null; end;
  begin
    perform public.org_licence_set_titles(public.t24('L2'), '{}'::uuid[]);
    raise exception 'a list licence was emptied';
  exception when sqlstate 'AKO02' then null; end;
end $$;
reset role;
do $$ begin
  if public.t24_can('000000000005', '0000000000c2') then raise exception 'B kept a title taken off the list'; end if;
  if not public.t24_can('000000000005', '0000000000c1') then raise exception 'B cannot open a title added to the list'; end if;
  if not public.t24_can('000000000005', '0000000000c3') then raise exception 'B cannot open a listed title outside the membership'; end if;
end $$;

-- A title taken out of the membership leaves a membership-scope licence too.
update public.workbooks set in_membership = false where id = 'a0240000-0000-0000-0000-0000000000c2';
do $$ begin
  if public.t24_can('000000000004', '0000000000c2') then raise exception 'A kept a title taken out of the membership'; end if;
end $$;
update public.workbooks set in_membership = true where id = 'a0240000-0000-0000-0000-0000000000c2';

-- ---------------------------------------------------------------------------
-- 6. has_entitlement through a seat: status, dates, the organisation.
-- ---------------------------------------------------------------------------
create function public.t24_update(p_licence text, p_status text, p_starts timestamptz, p_ends timestamptz, p_seats int default null) returns text
language sql as $$
  select public.org_licence_update(public.t24(p_licence), coalesce(p_seats, (select seats_purchased from public.org_licences where id = public.t24(p_licence))),
    p_starts, p_ends, 'INV-0001', p_status, 'test')
$$;
grant execute on function public.t24_update(text, text, timestamptz, timestamptz, int) to authenticated;

select test_as('a0240000-0000-0000-0000-000000000007', array['editor']);
do $$ declare s timestamptz := now() - interval '1 day'; e timestamptz := now() + interval '1 year'; begin
  perform public.t24_update('L1', 'suspended', s, e);
  if public.t24_can('000000000004', '0000000000c1') then raise exception 'a suspended licence still opens c1'; end if;
  perform public.t24_update('L1', 'active', s, e);
  if not public.t24_can('000000000004', '0000000000c1') then raise exception 'a resumed licence does not open c1'; end if;

  -- Past its end, even while the status says active.
  perform public.t24_update('L1', 'active', now() - interval '30 days', now() - interval '1 minute');
  if public.t24_can('000000000004', '0000000000c1') then raise exception 'a licence past its end still opens c1'; end if;
  if (select e2.ends_at from public.entitlements e2 where e2.user_id = 'a0240000-0000-0000-0000-000000000004'
        and e2.source = 'team_seat' and e2.org_licence_id = public.t24('L1')) > now() then
    raise exception 'the seat entitlement did not follow the licence end'; end if;
  perform public.t24_update('L1', 'active', s, e);
  if not public.t24_can('000000000004', '0000000000c1') then raise exception 'an extended licence does not open c1'; end if;

  -- Not started yet.
  perform public.t24_update('L1', 'active', now() + interval '1 day', e);
  if public.t24_can('000000000004', '0000000000c1') then raise exception 'a licence that has not started opens c1'; end if;
  perform public.t24_update('L1', 'active', s, e);

  -- Seats cannot go below those taken and invited.
  begin
    perform public.t24_update('L2', 'active', s, now() + interval '90 days', 1);
    raise exception 'seats went below the places in use';
  exception when sqlstate 'AKO08' then null; end;
  begin
    perform public.org_licence_update(public.t24('L1'), 12, s, e, null, 'active', '  ');
    raise exception 'a change with no reason was accepted';
  exception when sqlstate 'AKO02' then null; end;
end $$;
reset role;

-- The licence row itself, if it were ever changed behind the functions'
-- backs, still decides: has_entitlement reads it live.
update public.org_licences set status = 'suspended' where id = public.t24('L1');
do $$ begin
  if public.t24_can('000000000004', '0000000000c1') then raise exception 'a suspended licence row still opens c1'; end if;
end $$;
update public.org_licences set status = 'active' where id = public.t24('L1');

-- The organisation, suspended or closed, shuts every seat.
update public.organisations set status = 'suspended' where id = public.t24('biz');
do $$ begin
  if public.t24_can('000000000004', '0000000000c1') then raise exception 'a suspended organisation still opens c1'; end if;
end $$;
update public.organisations set status = 'closed' where id = public.t24('biz');
do $$ begin
  if public.t24_can('000000000004', '0000000000c1') then raise exception 'a closed organisation still opens c1'; end if;
end $$;
update public.organisations set status = 'active' where id = public.t24('biz');

-- A lapsed or revoked seat row shuts too, whatever the licence says.
update public.entitlements set status = 'revoked' where id = (select entitlement_id from public.org_seats where id = public.t24('seat-amy'));
do $$ begin
  if public.t24_can('000000000004', '0000000000c1') then raise exception 'a revoked team_seat row still opens c1'; end if;
end $$;
update public.entitlements set status = 'active' where id = (select entitlement_id from public.org_seats where id = public.t24('seat-amy'));
do $$ begin
  if not public.t24_can('000000000004', '0000000000c1') then raise exception 'A lost access after the state was restored'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 7. The shape of a team_seat row is fixed, and other sources are untouched.
-- ---------------------------------------------------------------------------
do $$ begin
  begin
    insert into public.entitlements (user_id, tenant_id, workbook_id, source, org_licence_id)
    values ('a0240000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-00000000000a', 'a0240000-0000-0000-0000-0000000000c3', 'team_seat', public.t24('L1'));
    raise exception 'a per-title team_seat row was accepted';
  exception when check_violation then null; end;
  begin
    insert into public.entitlements (user_id, tenant_id, workbook_id, source)
    values ('a0240000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-00000000000a', null, 'team_seat');
    raise exception 'a team_seat row with no licence was accepted';
  exception when check_violation then null; end;
  begin
    insert into public.entitlements (user_id, tenant_id, workbook_id, source, org_licence_id)
    values ('a0240000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-00000000000a', null, 'membership', public.t24('L1'));
    raise exception 'a membership row naming a licence was accepted';
  exception when check_violation then null; end;
  -- The old key still holds for every other source.
  insert into public.entitlements (user_id, tenant_id, workbook_id, source)
  values ('a0240000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-00000000000a', null, 'membership');
  begin
    insert into public.entitlements (user_id, tenant_id, workbook_id, source)
    values ('a0240000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-00000000000a', null, 'membership');
    raise exception 'a second membership row was accepted';
  exception when unique_violation then null; end;
  -- Membership: catalogue titles only; library-wide question still yes.
  if not public.t24_can('000000000006', '0000000000c1') then raise exception 'membership no longer opens c1'; end if;
  if public.t24_can('000000000006', '0000000000c3') then raise exception 'membership opened c3'; end if;
  if not app.has_entitlement('a0240000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-00000000000a', null) then
    raise exception 'membership no longer answers the library-wide question'; end if;
  -- Purchase: the one title, for good.
  insert into public.entitlements (user_id, tenant_id, workbook_id, source)
  values ('a0240000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-00000000000a', 'a0240000-0000-0000-0000-0000000000c3', 'purchase');
  if not public.t24_can('000000000006', '0000000000c3') then raise exception 'a purchase no longer opens its title'; end if;
  -- A lapsed membership is read only.
  update public.entitlements set ends_at = now() - interval '1 second'
   where user_id = 'a0240000-0000-0000-0000-000000000006' and source = 'membership';
  if public.t24_can('000000000006', '0000000000c1') then raise exception 'a lapsed membership still opens c1'; end if;
  -- A seat holder who also buys a title keeps it when the seat goes.
  insert into public.entitlements (user_id, tenant_id, workbook_id, source)
  values ('a0240000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000a', 'a0240000-0000-0000-0000-0000000000c2', 'purchase');
end $$;

-- ---------------------------------------------------------------------------
-- 8. Release: the organisation, the holder, nobody else. Work goes read only.
-- ---------------------------------------------------------------------------
select test_as('a0240000-0000-0000-0000-000000000006');
do $$ begin
  begin
    perform public.org_seat_release(public.t24('seat-amy'));
    raise exception 'an outsider released a seat';
  exception when sqlstate 'AKO01' then null; end;
end $$;
reset role;
select test_as('a0240000-0000-0000-0000-000000000003');
do $$ begin
  begin
    perform public.org_seat_release(public.t24('seat-amy'));
    raise exception 'a viewer released a seat';
  exception when sqlstate 'AKO01' then null; end;
end $$;
reset role;
select test_as('a0240000-0000-0000-0000-000000000001');
do $$ begin
  if not public.org_seat_release(public.t24('seat-amy')) then raise exception 'the owner could not release a seat'; end if;
  if public.org_seat_release(public.t24('seat-amy')) then raise exception 'a second release changed something'; end if;
  if exists (select 1 from public.org_seat_roster(public.t24('L1'))) then raise exception 'a released seat stayed on the roster'; end if;
end $$;
reset role;
do $$ declare s record; begin
  if public.t24_can('000000000004', '0000000000c1') then raise exception 'a released seat still opens c1'; end if;
  select * into s from public.org_seats where id = public.t24('seat-amy');
  if s.released_reason <> 'released_by_organisation' or s.roster_email is not null then raise exception 'release did not clear the seat'; end if;
  if (select status from public.entitlements where id = s.entitlement_id) <> 'lapsed' then raise exception 'the seat row did not lapse'; end if;
  -- A's work is still A's.
  if not exists (select 1 from public.answers where enrolment_id = 'a0240000-0000-0000-0000-0000000000a1')
     or not exists (select 1 from public.enrolments where id = 'a0240000-0000-0000-0000-0000000000a1') then
    raise exception 'releasing a seat touched the member''s work'; end if;
end $$;

-- B leaves on their own; their purchase of c2 stays.
select test_as('a0240000-0000-0000-0000-000000000005');
do $$ begin
  if not public.org_seat_release(public.t24('seat-ben')) then raise exception 'B could not leave their seat'; end if;
end $$;
reset role;
do $$ begin
  if (select released_reason from public.org_seats where id = public.t24('seat-ben')) <> 'left' then raise exception 'leaving was not recorded as left'; end if;
  if public.t24_can('000000000005', '0000000000c1') then raise exception 'B kept a listed title after leaving'; end if;
  if not public.t24_can('000000000005', '0000000000c2') then raise exception 'B lost a title they bought'; end if;
end $$;

-- A is invited back and claims again: the same entitlement row comes back.
select test_as('a0240000-0000-0000-0000-000000000001');
do $$ begin
  perform public.org_seat_invite(public.t24('L1'), 'amy@work.example', public.t24_hash('tok-amy-back'));
end $$;
reset role;
select test_as('a0240000-0000-0000-0000-000000000004');
do $$ declare r record; begin
  select * into r from public.org_seat_claim(public.t24_hash('tok-amy-back'), true);
  if r.already then raise exception 'a released seat counted as still held'; end if;
  insert into public.t24_ids values ('seat-amy-2', r.seat_id);
end $$;
reset role;
do $$ begin
  if not public.t24_can('000000000004', '0000000000c1') then raise exception 'A cannot open c1 after claiming again'; end if;
  if (select count(*) from public.entitlements where user_id = 'a0240000-0000-0000-0000-000000000004' and source = 'team_seat') <> 1 then
    raise exception 'claiming again made a second team_seat row'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 9. Two licences: one ending does not touch the other.
-- ---------------------------------------------------------------------------
select test_as('a0240000-0000-0000-0000-000000000009');
do $$ begin
  perform public.org_seat_invite(public.t24('L3'), 'amy@church.example', public.t24_hash('tok-amy-church'));
  perform public.org_seat_invite(public.t24('L3'), 'pending@church.example', public.t24_hash('tok-pending-church'));
end $$;
reset role;
select test_as('a0240000-0000-0000-0000-000000000004');
do $$ declare r record; begin
  select * into r from public.org_seat_claim(public.t24_hash('tok-amy-church'), true);
  insert into public.t24_ids values ('seat-amy-church', r.seat_id);
end $$;
reset role;
do $$ begin
  if (select count(*) from public.entitlements where user_id = 'a0240000-0000-0000-0000-000000000004' and source = 'team_seat' and status = 'active') <> 2 then
    raise exception 'A does not hold two team_seat rows'; end if;
end $$;
-- The church owner sees their own roster and not the business one.
select test_as('a0240000-0000-0000-0000-000000000009');
do $$ begin
  if (select count(*) from public.org_seat_roster(public.t24('L3'))) <> 1 then raise exception 'church roster is wrong'; end if;
  begin
    perform public.org_seat_roster(public.t24('L1'));
    raise exception 'the church owner read the business roster';
  exception when sqlstate 'AKO01' then null; end;
  if exists (select 1 from public.org_seats where org_id = public.t24('biz')) then raise exception 'the church owner read business seats'; end if;
end $$;
reset role;
select test_as('a0240000-0000-0000-0000-000000000007', array['editor']);
do $$ begin
  perform public.t24_update('L3', 'ended', now() - interval '1 day', now() + interval '1 year');
  begin
    perform public.t24_update('L3', 'active', now() - interval '1 day', now() + interval '1 year');
    raise exception 'an ended licence was opened again';
  exception when sqlstate 'AKO08' then null; end;
end $$;
reset role;
do $$ begin
  if (select released_reason from public.org_seats where id = public.t24('seat-amy-church')) <> 'licence_ended' then
    raise exception 'ending the licence did not release its seats'; end if;
  if exists (select 1 from public.org_seat_invitations where licence_id = public.t24('L3') and revoked_at is null and accepted_at is null and declined_at is null) then
    raise exception 'ending the licence left an invitation open'; end if;
  if (select state from public.org_seat_invite_view(public.t24_hash('tok-pending-church'))) <> 'revoked' then
    raise exception 'an invitation on an ended licence still works'; end if;
  if not public.t24_can('000000000004', '0000000000c1') then raise exception 'ending the church licence took A''s business seat'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 10. Saying no, expiry, limits and deletion.
-- ---------------------------------------------------------------------------
select test_as('a0240000-0000-0000-0000-000000000001');
do $$ begin
  perform public.org_seat_invite(public.t24('L1'), 'nope@work.example', public.t24_hash('tok-nope'));
  perform public.org_seat_invite(public.t24('L1'), 'late@work.example', public.t24_hash('tok-late'));
end $$;
reset role;
select pg_temp.as_anon();
do $$ begin
  if public.org_seat_decline(public.t24_hash('tok-nope')) <> 'declined' then raise exception 'decline did not work'; end if;
  if public.org_seat_decline(public.t24_hash('tok-nope')) <> 'already' then raise exception 'a second decline was not idempotent'; end if;
  if public.org_seat_decline(public.t24_hash('unknown')) <> 'unknown' then raise exception 'an unknown decline was not refused'; end if;
  if (select state from public.org_seat_invite_view(public.t24_hash('tok-nope'))) <> 'declined' then raise exception 'declined link shows another state'; end if;
end $$;
reset role;
select test_as('a0240000-0000-0000-0000-000000000001');
do $$ begin
  begin
    perform public.org_seat_invite(public.t24('L1'), 'nope@work.example', public.t24_hash('tok-nope-2'));
    raise exception 'an address that said no was invited again';
  exception when sqlstate 'AKO09' then null; end;
end $$;
reset role;

update public.org_seat_invitations set expires_at = now() - interval '1 minute', created_at = now() - interval '15 days'
 where token_hash = public.t24_hash('tok-late');
select test_as('a0240000-0000-0000-0000-000000000011');
do $$ begin
  if (select state from public.org_seat_invite_view(public.t24_hash('tok-late'))) <> 'expired' then raise exception 'an expired link is not expired'; end if;
  begin
    perform public.org_seat_claim(public.t24_hash('tok-late'), true);
    raise exception 'an expired invitation was claimed';
  exception when sqlstate 'AKO04' then null; end;
end $$;
reset role;

-- Resend: a new link, five sends at most. The old link stops working.
select test_as('a0240000-0000-0000-0000-000000000001');
do $$ declare v uuid; begin
  v := public.org_seat_invite(public.t24('L1'), 'resend@work.example', public.t24_hash('tok-r0'));
  perform public.org_seat_invite_resend(v, public.t24_hash('tok-r1'));
  perform public.org_seat_invite_resend(v, public.t24_hash('tok-r2'));
  perform public.org_seat_invite_resend(v, public.t24_hash('tok-r3'));
  perform public.org_seat_invite_resend(v, public.t24_hash('tok-r4'));
  begin
    perform public.org_seat_invite_resend(v, public.t24_hash('tok-r5'));
    raise exception 'a sixth send went out';
  exception when sqlstate 'AKO29' then null; end;
  if (select state from public.org_seat_invite_view(public.t24_hash('tok-r0'))) <> 'unknown' then raise exception 'the old link still works after a resend'; end if;
  perform public.org_seat_invite_revoke(v);
  begin
    perform public.org_seat_invite_resend(v, public.t24_hash('tok-r6'));
    raise exception 'a revoked invitation was sent again';
  exception when sqlstate 'AKO08' then null; end;
end $$;
reset role;

-- Three invitations to one address in 30 days, then no more.
select test_as('a0240000-0000-0000-0000-000000000001');
do $$ begin
  perform public.org_seat_invite(public.t24('L1'), 'thrice@work.example', public.t24_hash('tok-t1'));
  perform public.org_seat_invite(public.t24('L1'), 'thrice@work.example', public.t24_hash('tok-t2'));
  perform public.org_seat_invite(public.t24('L1'), 'thrice@work.example', public.t24_hash('tok-t3'));
  if (select count(*) from public.org_seat_invitations where licence_id = public.t24('L1') and revoked_at is null and accepted_at is null
        and declined_at is null and email = 'thrice@work.example') <> 1 then
    raise exception 'a newer invitation did not replace the open one'; end if;
  begin
    perform public.org_seat_invite(public.t24('L1'), 'thrice@work.example', public.t24_hash('tok-t4'));
    raise exception 'a fourth invitation to one address went out';
  exception when sqlstate 'AKO29' then null; end;
end $$;
reset role;

-- The daily limit per organisation comes from app_config.
update public.app_config set value = to_jsonb((select count(*) from public.audit_log
   where action in ('org.seat_invited','org.seat_invite_resent') and org_id = public.t24('biz') and at > now() - interval '1 day')::int)
 where key = 'org_seat_invites_per_day';
select test_as('a0240000-0000-0000-0000-000000000001');
do $$ begin
  begin
    perform public.org_seat_invite(public.t24('L1'), 'limit@work.example', public.t24_hash('tok-limit'));
    raise exception 'the daily invitation limit did not hold';
  exception when sqlstate 'AKO29' then null; end;
end $$;
reset role;
update public.app_config set value = '50' where key = 'org_seat_invites_per_day';

-- Deletion: no claim while pending; a completed deletion releases the seat.
select test_as('a0240000-0000-0000-0000-000000000001');
do $$ begin
  perform public.org_seat_invite(public.t24('L1'), 'dee@work.example', public.t24_hash('tok-dee'));
  perform public.org_seat_invite(public.t24('L1'), 'eve@work.example', public.t24_hash('tok-eve'));
end $$;
reset role;
select test_as('a0240000-0000-0000-0000-000000000010');
do $$ declare r record; begin
  select * into r from public.org_seat_claim(public.t24_hash('tok-dee'), true);
  insert into public.t24_ids values ('seat-dee', r.seat_id);
end $$;
reset role;
insert into public.account_deletion_requests (user_id, requested_at, cancel_before)
values ('a0240000-0000-0000-0000-000000000011', now(), now() + interval '7 days'),
       ('a0240000-0000-0000-0000-000000000010', now() - interval '8 days', now() - interval '1 day');
select test_as('a0240000-0000-0000-0000-000000000011');
do $$ begin
  begin
    perform public.org_seat_claim(public.t24_hash('tok-eve'), true);
    raise exception 'a seat was claimed by an account scheduled for deletion';
  exception when sqlstate 'AKO06' then null; end;
end $$;
reset role;
update public.account_deletion_requests set completed_at = now() where user_id = 'a0240000-0000-0000-0000-000000000010';
do $$ begin
  if (select released_reason from public.org_seats where id = public.t24('seat-dee')) <> 'account_deleted' then
    raise exception 'a completed deletion left the seat open'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 11. Console counts (F-204): suppressed, weekly, never per person.
-- ---------------------------------------------------------------------------
-- L4 has twenty seats. Counting users take seats 30 days ago. Started
-- means an enrolment on a title in scope, begun after the claim and before
-- this week. The cases below move one number at a time.
create function public.t24_seed_counts(p_claimed int, p_started int) returns void
language plpgsql as $$
declare n int;
begin
  delete from public.enrolments where user_id::text like 'a0240000-0000-0000-0001-%';
  delete from public.org_seats where licence_id = public.t24('L4');
  for n in 1..p_claimed loop
    insert into public.org_seats (licence_id, org_id, user_id, roster_email, claimed_at)
    values (public.t24('L4'), public.t24('biz'), ('a0240000-0000-0000-0001-0000000000' || lpad(n::text, 2, '0'))::uuid,
            'count' || n || '@work.example', now() - interval '30 days');
    if n <= p_started then
      insert into public.enrolments (user_id, tenant_id, workbook_id, version_id, started_at)
      values (('a0240000-0000-0000-0001-0000000000' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-00000000000a',
              'a0240000-0000-0000-0000-0000000000c1', 'a0240000-0000-0000-0000-0000000000d1', now() - interval '20 days');
    end if;
  end loop;
end $$;
create function public.t24_counts() returns record language sql as $$
  select people_started, started_shown, seats_claimed from public.org_seat_summary(public.t24('biz')) where licence_id = public.t24('L4')
$$;
grant execute on function public.t24_counts() to authenticated;

create function public.t24_expect(p_claimed int, p_started int, p_value int, p_shown text) returns void
language plpgsql as $$
declare v int; s text; c int;
begin
  perform public.t24_seed_counts(p_claimed, p_started);
  perform test_as('a0240000-0000-0000-0000-000000000003');
  select people_started, started_shown, seats_claimed into v, s, c
    from public.org_seat_summary(public.t24('biz')) where licence_id = public.t24('L4');
  execute 'reset role';
  if c <> p_claimed or s <> p_shown or v is distinct from p_value then
    raise exception 'counts for % claimed, % started: got % % %, expected % %', p_claimed, p_started, c, v, s, p_value, p_shown;
  end if;
end $$;

select public.t24_expect(3, 2, null, 'fewer_than');
select public.t24_expect(8, 6, null, 'hidden');
select public.t24_expect(10, 4, null, 'fewer_than');
select public.t24_expect(10, 5, 5, 'exact');
select public.t24_expect(12, 6, 6, 'exact');
select public.t24_expect(12, 9, 5, 'at_least');
select public.t24_expect(12, 12, 5, 'at_least');

-- Starts this week, before the claim, or outside the scope do not count.
select public.t24_seed_counts(12, 6);
update public.enrolments set started_at = now() where user_id = 'a0240000-0000-0000-0001-000000000001';
update public.enrolments set started_at = now() - interval '45 days' where user_id = 'a0240000-0000-0000-0001-000000000002';
update public.enrolments set workbook_id = 'a0240000-0000-0000-0000-0000000000c3', version_id = 'a0240000-0000-0000-0000-0000000000d3'
 where user_id = 'a0240000-0000-0000-0001-000000000003';
select test_as('a0240000-0000-0000-0000-000000000001');
do $$ declare r record; begin
  select * into r from public.org_seat_summary(public.t24('biz')) where licence_id = public.t24('L4');
  if r.started_shown <> 'fewer_than' or r.people_started is not null then
    raise exception 'starts this week, before the claim or out of scope were counted: % %', r.people_started, r.started_shown; end if;
  if r.counted_until > now() or r.counted_until < now() - interval '7 days 2 hours' then raise exception 'counted_until is not the start of this week'; end if;
  if r.threshold <> 5 then raise exception 'threshold is not the owner threshold'; end if;
end $$;
reset role;

-- Who may read the counts and the roster.
select test_as('a0240000-0000-0000-0000-000000000006');
do $$ begin
  begin
    perform public.org_seat_summary(public.t24('biz'));
    raise exception 'an outsider read the counts';
  exception when sqlstate 'AKO01' then null; end;
  begin
    perform public.org_seat_roster(public.t24('L1'));
    raise exception 'an outsider read the roster';
  exception when sqlstate 'AKO01' then null; end;
end $$;
reset role;
select test_as('a0240000-0000-0000-0000-000000000004');
do $$ begin
  begin
    perform public.org_seat_summary(public.t24('biz'));
    raise exception 'a seat holder read the counts';
  exception when sqlstate 'AKO01' then null; end;
end $$;
reset role;
select pg_temp.as_anon();
do $$ begin
  begin
    perform public.org_seat_summary(public.t24('biz'));
    raise exception 'anon read the counts';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- The roster carries the invited address and the claim date, nothing else.
do $$ begin
  if (select array_agg(a.attname::text order by a.attnum) from pg_proc p
        cross join lateral unnest(p.proargnames, p.proargmodes) with ordinality as a(attname, mode, attnum)
        where p.oid = 'public.org_seat_roster(uuid)'::regprocedure and a.mode = 't') <> array['seat_id','roster_email','claimed_at'] then
    raise exception 'the roster returns more than the address and claim date'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 12. The privacy line: nobody at the organisation reaches a member's work.
-- ---------------------------------------------------------------------------
do $$ declare u text; begin
  foreach u in array array['a0240000-0000-0000-0000-000000000001', 'a0240000-0000-0000-0000-000000000002', 'a0240000-0000-0000-0000-000000000003'] loop
    perform test_as(u::uuid);
    if exists (select 1 from public.answers) then raise exception '% read answers', u; end if;
    if exists (select 1 from public.enrolments) then raise exception '% read enrolments', u; end if;
    if exists (select 1 from public.progress_events) then raise exception '% read progress events', u; end if;
    if exists (select 1 from public.entitlements) then raise exception '% read entitlements', u; end if;
    if exists (select 1 from public.profiles where user_id <> u::uuid) then raise exception '% read profiles', u; end if;
    begin
      insert into public.org_seats (licence_id, org_id, user_id) values (public.t24('L1'), public.t24('biz'), u::uuid);
      raise exception '% inserted a seat', u;
    exception when insufficient_privilege then null; end;
    begin
      perform entitlement_id from public.org_seats;
      raise exception '% read the seat entitlement id', u;
    exception when insufficient_privilege then null; end;
    execute 'reset role';
  end loop;
end $$;

-- The owner still reads their roster: the address they invited, nothing more.
select test_as('a0240000-0000-0000-0000-000000000001');
do $$ begin
  if not exists (select 1 from public.org_seat_roster(public.t24('L1')) where roster_email = 'amy@work.example') then
    raise exception 'the owner cannot see who holds a seat'; end if;
  if exists (select 1 from public.org_seat_roster(public.t24('L1')) where roster_email like '%@home.example') then
    raise exception 'the roster showed a member''s own account address'; end if;
end $$;
reset role;

rollback;
\echo PASS 0024_org_pilot
