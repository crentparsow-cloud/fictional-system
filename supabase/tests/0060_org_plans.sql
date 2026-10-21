-- Organisations, Phase B (0060): the published price table, the church band
-- lookup, self-serve sign-up for the small-organisation plan and the church
-- bands, the seat range and when a fall takes effect, the 14-day refund
-- window, the standing sign-up link, the six-seat group licence (payment,
-- places, refund) and the staff-started pilot. Each block must raise or
-- return the expected value; a failure aborts the script.
\set ON_ERROR_STOP on

begin;

-- 01 organiser (small org), 02 church organiser, 03 pack buyer, 04 to 10
-- members, 11 platform editor, 12 platform owner, 13 org owner of a customer
-- organisation (for the pilot), 14 outsider.
insert into auth.users (id, email) values
  ('a0600000-0000-0000-0000-000000000001', 'org60@small60.example'),
  ('a0600000-0000-0000-0000-000000000002', 'vicar60@church60.example'),
  ('a0600000-0000-0000-0000-000000000003', 'buyer60@home60.example'),
  ('a0600000-0000-0000-0000-000000000004', 'm4@home60.example'),
  ('a0600000-0000-0000-0000-000000000005', 'm5@home60.example'),
  ('a0600000-0000-0000-0000-000000000006', 'm6@home60.example'),
  ('a0600000-0000-0000-0000-000000000007', 'm7@home60.example'),
  ('a0600000-0000-0000-0000-000000000008', 'm8@home60.example'),
  ('a0600000-0000-0000-0000-000000000009', 'm9@home60.example'),
  ('a0600000-0000-0000-0000-000000000010', 'm10@home60.example'),
  ('a0600000-0000-0000-0000-000000000011', 'editor60@akana.example'),
  ('a0600000-0000-0000-0000-000000000012', 'owner60@akana.example'),
  ('a0600000-0000-0000-0000-000000000013', 'boss60@big60.example'),
  ('a0600000-0000-0000-0000-000000000014', 'xander60@other.example');
insert into public.profiles (user_id)
select ('a0600000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid from generate_series(1, 14) n
on conflict do nothing;

insert into public.organisations (id, kind, legal_name, display_name, slug, country) values
  ('a0600000-0000-0000-0000-0000000000f1', 'publisher', 'Pub 60 Ltd', 'Pub 60', 'pub-60', 'GB'),
  ('a0600000-0000-0000-0000-0000000000f2', 'business', 'Big 60 Ltd', 'Big 60', 'big-60', 'GB');
insert into public.org_members (org_id, user_id, role) values
  ('a0600000-0000-0000-0000-0000000000f2', 'a0600000-0000-0000-0000-000000000013', 'owner');
insert into public.books (id, org_id, slug, title) values
  ('a0600000-0000-0000-0000-0000000000b1', 'a0600000-0000-0000-0000-0000000000f1', 'book-60', 'Book 60');
insert into public.workbooks (id, code, book_id, org_id, tenant_id, slug, title, card_line, genre_id, depth, badge, is_demo, status, safety_tier, in_membership) values
  ('a0600000-0000-0000-0000-0000000000c1', 'AK-PTX61', 'a0600000-0000-0000-0000-0000000000b1', 'a0600000-0000-0000-0000-0000000000f1',
   '00000000-0000-0000-0000-00000000000a', 'wb60-one', 'Wb One', 'Card', 'productivity', 'full', 'official', false, 'live', 'none', true),
  ('a0600000-0000-0000-0000-0000000000c2', 'AK-PTX62', 'a0600000-0000-0000-0000-0000000000b1', 'a0600000-0000-0000-0000-0000000000f1',
   '00000000-0000-0000-0000-00000000000a', 'wb60-two', 'Wb Two', 'Card', 'productivity', 'full', 'official', false, 'live', 'none', true),
  ('a0600000-0000-0000-0000-0000000000c3', 'AK-PTX63', 'a0600000-0000-0000-0000-0000000000b1', 'a0600000-0000-0000-0000-0000000000f1',
   '00000000-0000-0000-0000-00000000000a', 'wb60-demo', 'Wb Demo', 'Card', 'productivity', 'full', 'demo', true, 'live', 'none', true);
insert into public.platform_roles (user_id, role) values
  ('a0600000-0000-0000-0000-000000000011', 'editor'),
  ('a0600000-0000-0000-0000-000000000012', 'owner');

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
create table public.t60_ids (k text primary key, v uuid not null);
grant select, insert on public.t60_ids to anon, authenticated, service_role;
create function public.t60(p text) returns uuid language sql stable as $$ select v from public.t60_ids where k = p $$;
grant execute on function public.t60(text) to anon, authenticated, service_role;
create function public.t60_hash(p text) returns text language sql immutable as $$
  select encode(sha256(convert_to(p, 'UTF8')), 'hex') $$;
grant execute on function public.t60_hash(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. The price table: published, audited, and changed only by staff owners.
-- ---------------------------------------------------------------------------
select pg_temp.as_anon();
do $$ declare v text; begin
  select string_agg(plan_id || '=' || amount_minor, ',' order by sort) into v from public.org_plan_prices;
  if v <> 'small_org_year=6000,church_band_1=12000,church_band_2=24000,church_band_3=48000,church_band_4=90000,group_licence_six=3900' then
    raise exception 'published prices were %', v;
  end if;
  begin
    update public.org_plan_prices set amount_minor = 1 where plan_id = 'small_org_year';
    raise exception 'anon changed a price';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select test_as('a0600000-0000-0000-0000-000000000011', array['editor']);
do $$ declare n int; begin
  update public.org_plan_prices set amount_minor = 7000 where plan_id = 'small_org_year';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'an editor changed a price'; end if;
end $$;
reset role;

select test_as('a0600000-0000-0000-0000-000000000012', array['owner']);
do $$ declare n int; begin
  update public.org_plan_prices set amount_minor = 6500 where plan_id = 'small_org_year';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'a platform owner could not change a price'; end if;
  update public.org_plan_prices set amount_minor = 6000 where plan_id = 'small_org_year';
end $$;
reset role;
do $$ begin
  if (select count(*) from public.audit_log where action = 'org.plan_price_changed' and target = 'org_plan:small_org_year') <> 2 then
    raise exception 'price changes were not audited';
  end if;
end $$;

-- An inactive price is hidden from the public.
update public.org_plan_prices set active = false where plan_id = 'church_band_4';
select pg_temp.as_anon();
do $$ begin
  if exists (select 1 from public.org_plan_prices where plan_id = 'church_band_4') then raise exception 'an inactive price is public'; end if;
end $$;
reset role;
update public.org_plan_prices set active = true where plan_id = 'church_band_4';

-- ---------------------------------------------------------------------------
-- 2. Church bands by attendance.
-- ---------------------------------------------------------------------------
do $$ declare r record; begin
  for r in select * from (values (0,'church_band_1'),(49,'church_band_1'),(50,'church_band_2'),(149,'church_band_2'),
                                 (150,'church_band_3'),(399,'church_band_3'),(400,'church_band_4'),(5000,'church_band_4')) as t(a, b) loop
    if app.org_church_band_for(r.a) is distinct from r.b then raise exception 'attendance % gave %', r.a, app.org_church_band_for(r.a); end if;
  end loop;
  if app.org_church_band_for(null) is not null or app.org_church_band_for(-1) is not null then raise exception 'a bad attendance found a band'; end if;
  if (select app.org_band_seats('church_band_4')) <> 10000 or app.org_band_number('church_band_4') <> 4 then
    raise exception 'band 4 is not unlimited';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Self-serve sign-up: the small-organisation plan and the church bands.
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
do $$ begin
  begin
    perform public.org_self_serve_provision('a0600000-0000-0000-0000-000000000001', 'small_org_year', 'business', 'Small 60', 'GB', null, 'sub_S60', 10);
    raise exception 'sign-up worked while closed';
  exception when sqlstate 'AKO13' then null; end;
end $$;
reset role;
update public.feature_flags set enabled = true where key = 'org_self_serve' and scope = 'global';
select pg_temp.as_service();
do $$ declare v uuid; begin
  -- 5 to 50 seats only.
  begin perform public.org_self_serve_provision('a0600000-0000-0000-0000-000000000001', 'small_org_year', 'business', 'Small 60', 'GB', null, 'sub_S60x', 4);
    raise exception '4 seats were accepted'; exception when sqlstate 'AKO02' then null; end;
  begin perform public.org_self_serve_provision('a0600000-0000-0000-0000-000000000001', 'small_org_year', 'business', 'Small 60', 'GB', null, 'sub_S60y', 51);
    raise exception '51 seats were accepted'; exception when sqlstate 'AKO02' then null; end;
  begin perform public.org_self_serve_provision('a0600000-0000-0000-0000-000000000001', 'small_org_year', 'church', 'Small 60', 'GB', null, 'sub_S60z', 10);
    raise exception 'a church took the small-organisation plan'; exception when sqlstate 'AKO02' then null; end;
  v := public.org_self_serve_provision('a0600000-0000-0000-0000-000000000001', 'small_org_year', 'business', 'Small 60', 'GB', 'bill@small60.example', 'sub_S60', 10);
  insert into public.t60_ids values ('s_lic', v), ('s_org', (select org_id from public.org_licences where id = v));
  if (select kind || '/' || seats_purchased || '/' || self_serve from public.org_licences where id = v) <> 'teams/10/true' then
    raise exception 'the small-organisation licence is wrong';
  end if;
  if public.org_self_serve_provision('a0600000-0000-0000-0000-000000000001', 'small_org_year', 'business', 'Small 60', 'GB', null, 'sub_S60', 10) <> v then
    raise exception 'a repeated webhook made a second licence';
  end if;

  -- A church: one subscription of quantity 1, seats are the band's room.
  v := public.org_self_serve_provision('a0600000-0000-0000-0000-000000000002', 'church_band_3', 'church', 'St Example 60', 'GB', null, 'sub_C60', 1);
  insert into public.t60_ids values ('c_lic', v), ('c_org', (select org_id from public.org_licences where id = v));
  if (select kind || '/' || seats_purchased from public.org_licences where id = v) <> 'church/10000' then raise exception 'the church licence is wrong'; end if;
  begin perform public.org_self_serve_provision('a0600000-0000-0000-0000-000000000002', 'church_band_2', 'church', 'St Two 60', 'GB', null, 'sub_C60b', 2);
    raise exception 'a church band took quantity 2'; exception when sqlstate 'AKO02' then null; end;
  begin perform public.org_self_serve_provision('a0600000-0000-0000-0000-000000000002', 'church_band_2', 'business', 'St Two 60', 'GB', null, 'sub_C60c', 1);
    raise exception 'a business took a church band'; exception when sqlstate 'AKO02' then null; end;
end $$;
reset role;
-- An off-sale plan is refused.
update public.org_plan_prices set active = false where plan_id = 'church_band_1';
select pg_temp.as_service();
do $$ begin
  begin perform public.org_self_serve_provision('a0600000-0000-0000-0000-000000000002', 'church_band_1', 'church', 'St One 60', 'GB', null, 'sub_C60d', 1);
    raise exception 'a plan that is not on sale was provisioned'; exception when sqlstate 'AKO02' then null; end;
end $$;
reset role;
update public.org_plan_prices set active = true where plan_id = 'church_band_1';
select pg_temp.as_service();

-- The mirror accepts the new plan ids and a fourth band.
do $$ declare r text; begin
  r := public.org_billing_apply('sub_S60', 'cus_S60', null, 'active', 'small_org_year', 'price_s60', 10, 'charge_automatically', null,
    now() - interval '10 days', now() + interval '355 days', false, null, null, null, false, now() - interval '1 hour');
  if r <> 'applied' then raise exception 'small org mirror: %', r; end if;
  r := public.org_billing_apply('sub_C60', 'cus_C60', null, 'active', 'church_band_4', 'price_c60', 1, 'charge_automatically', null,
    now() - interval '10 days', now() + interval '355 days', false, null, null, null, false, now());
  if r <> 'applied' then raise exception 'church band 4 mirror: %', r; end if;
  if (select seats_purchased from public.org_licences where id = public.t60('c_lic')) <> 10000 then raise exception 'band 4 changed the seats'; end if;
  begin
    perform public.org_billing_apply('sub_S60', 'cus_S60', null, 'active', 'small_org_year_x', null, 10, 'charge_automatically', null,
      now(), now() + interval '1 day', false, null, null, null, false, now());
    raise exception 'an unknown plan was mirrored';
  exception when sqlstate 'AKO02' then null; end;
end $$;
reset role;

do $$ begin
  if not exists (select 1 from public.org_members where org_id = public.t60('s_org') and user_id = 'a0600000-0000-0000-0000-000000000001' and role = 'owner') then
    raise exception 'the organiser is not the owner';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Seats: 5 to 50, a rise at once, a fall only at renewal.
-- ---------------------------------------------------------------------------
select test_as('a0600000-0000-0000-0000-000000000001');
do $$ begin
  if public.org_billing_seat_change_check(public.t60('s_lic'), 20) <> 'up' then raise exception 'seats up'; end if;
  if public.org_billing_seat_change_check(public.t60('s_lic'), 50) <> 'up' then raise exception 'seats up to 50'; end if;
  if public.org_billing_seat_change_check(public.t60('s_lic'), 7) <> 'down' then raise exception 'seats down'; end if;
  if public.org_billing_seat_change_check(public.t60('s_lic'), 10) <> 'same' then raise exception 'seats same'; end if;
  begin perform public.org_billing_seat_change_check(public.t60('s_lic'), 51);
    raise exception '51 seats'; exception when sqlstate 'AKO02' then null; end;
  begin perform public.org_billing_seat_change_check(public.t60('s_lic'), 4);
    raise exception '4 seats'; exception when sqlstate 'AKO02' then null; end;
end $$;
reset role;
select test_as('a0600000-0000-0000-0000-000000000014');
do $$ begin
  perform public.org_billing_seat_change_check(public.t60('s_lic'), 20);
  raise exception 'an outsider changed the seats';
exception when sqlstate 'AKO01' then null; end $$;
reset role;

-- A fall changes what Stripe bills next, but the seats stay until the period turns.
select pg_temp.as_service();
do $$ begin
  perform public.org_billing_apply('sub_S60', 'cus_S60', null, 'active', 'small_org_year', 'price_s60', 7, 'charge_automatically', null,
    now() - interval '10 days', now() + interval '355 days', false, null, null, null, false, now());
  if (select seats_purchased from public.org_licences where id = public.t60('s_lic')) <> 10 then raise exception 'seats fell mid-period'; end if;
  perform public.org_billing_apply('sub_S60', 'cus_S60', null, 'active', 'small_org_year', 'price_s60', 7, 'charge_automatically', null,
    now(), now() + interval '365 days', false, null, null, null, false, now() + interval '1 second');
  if (select seats_purchased from public.org_licences where id = public.t60('s_lic')) <> 7 then raise exception 'seats did not fall at renewal'; end if;
  -- A rise is immediate.
  perform public.org_billing_apply('sub_S60', 'cus_S60', null, 'active', 'small_org_year', 'price_s60', 12, 'charge_automatically', null,
    now(), now() + interval '365 days', false, null, null, null, false, now() + interval '2 seconds');
  if (select seats_purchased from public.org_licences where id = public.t60('s_lic')) <> 12 then raise exception 'seats did not rise at once'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 5. The 14-day refund window covers the small-organisation plan.
-- ---------------------------------------------------------------------------
select test_as('a0600000-0000-0000-0000-000000000001');
do $$ declare s text; begin
  select state into s from public.org_cooling_off_state(public.t60('s_lic'));
  if s <> 'open' then raise exception 'a new small-organisation plan has no refund window: %', s; end if;
end $$;
reset role;
select test_as('a0600000-0000-0000-0000-000000000002');
do $$ declare s text; begin
  select state into s from public.org_cooling_off_state(public.t60('c_lic'));
  if s <> 'business' then raise exception 'a church has a consumer refund window: %', s; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 6. The standing sign-up link: one at a time, rotatable, used instead of invitations.
-- ---------------------------------------------------------------------------
select test_as('a0600000-0000-0000-0000-000000000014');
do $$ begin
  perform public.org_standing_link_rotate(public.t60('s_lic'), public.t60_hash('outsider'));
  raise exception 'an outsider made a standing link';
exception when sqlstate 'AKO01' then null; end $$;
reset role;
select test_as('a0600000-0000-0000-0000-000000000001');
do $$ declare a uuid; b uuid; begin
  begin perform public.org_standing_link_rotate(public.t60('s_lic'), 'not-a-hash');
    raise exception 'a bad hash was accepted'; exception when sqlstate 'AKO02' then null; end;
  a := public.org_standing_link_rotate(public.t60('s_lic'), public.t60_hash('first-link'));
  insert into public.t60_ids values ('link_a', a);
  if (select count(*) from public.org_join_links where licence_id = public.t60('s_lic') and standing and revoked_at is null) <> 1 then
    raise exception 'one standing link expected';
  end if;
  b := public.org_standing_link_rotate(public.t60('s_lic'), public.t60_hash('second-link'));
  if (select count(*) from public.org_join_links where licence_id = public.t60('s_lic') and standing and revoked_at is null) <> 1 then
    raise exception 'rotation left two open standing links';
  end if;
  if (select revoked_at from public.org_join_links where id = a) is null then raise exception 'the old link stayed open'; end if;
  if (select state from public.org_join_link_view(public.t60_hash('first-link'))) <> 'revoked' then raise exception 'old link state'; end if;
  if (select state from public.org_join_link_view(public.t60_hash('second-link'))) <> 'ok' then raise exception 'new link state'; end if;
end $$;
reset role;

-- Members take places with the new link and need no invitation; the old one fails.
select test_as('a0600000-0000-0000-0000-000000000004');
do $$ declare r record; begin
  begin perform * from public.org_join_link_claim(public.t60_hash('first-link'), true);
    raise exception 'a closed link was used'; exception when sqlstate 'AKO04' then null; end;
  begin perform * from public.org_join_link_claim(public.t60_hash('second-link'), false);
    raise exception 'a claim without the 18 or over tick'; exception when sqlstate 'AKO10' then null; end;
  select * into r from public.org_join_link_claim(public.t60_hash('second-link'), true);
  if r.already then raise exception 'first claim reported as already'; end if;
  if (select already from public.org_join_link_claim(public.t60_hash('second-link'), true)) is not true then raise exception 'second claim not idempotent'; end if;
end $$;
reset role;
do $$ begin
  if not app.has_entitlement('a0600000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000a', 'a0600000-0000-0000-0000-0000000000c1') then
    raise exception 'the member has no access through the link';
  end if;
end $$;
-- Adding seats makes room again: a full licence turns the link away, then takes people once seats are added.
update public.org_licences set seats_purchased = 1 where id = public.t60('s_lic');
select test_as('a0600000-0000-0000-0000-000000000005');
do $$ begin
  perform * from public.org_join_link_claim(public.t60_hash('second-link'), true);
  raise exception 'a full licence took another member';
exception when sqlstate 'AKO07' then null; end $$;
reset role;
update public.org_licences set seats_purchased = 12 where id = public.t60('s_lic');
select test_as('a0600000-0000-0000-0000-000000000005');
do $$ begin perform * from public.org_join_link_claim(public.t60_hash('second-link'), true); end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 7. The six-seat group licence.
-- ---------------------------------------------------------------------------
select test_as('a0600000-0000-0000-0000-000000000003');
do $$ begin
  perform public.org_pack_provision('a0600000-0000-0000-0000-000000000003', 'a0600000-0000-0000-0000-0000000000c1', 'Pack 60', 'cs_P60', 'pi_P60', 3900, 650, 'GBP', false, 'GB');
  raise exception 'a client provisioned a pack';
exception when insufficient_privilege then null; end $$;
reset role;
update public.feature_flags set enabled = false where key = 'org_self_serve' and scope = 'global';
select pg_temp.as_service();
do $$ begin
  begin perform public.org_pack_provision('a0600000-0000-0000-0000-000000000003', 'a0600000-0000-0000-0000-0000000000c1', 'Pack 60', 'cs_P60', 'pi_P60', 3900, 650, 'GBP', false, 'GB');
    raise exception 'a pack sold while closed'; exception when sqlstate 'AKO13' then null; end;
end $$;
reset role;
update public.feature_flags set enabled = true where key = 'org_self_serve' and scope = 'global';
select pg_temp.as_service();
do $$ declare v uuid; begin
  begin perform public.org_pack_provision('a0600000-0000-0000-0000-000000000003', 'a0600000-0000-0000-0000-0000000000c3', 'Pack 60', 'cs_P60d', 'pi_P60d', 3900, 650, 'GBP', false, 'GB');
    raise exception 'a pack of a demo title'; exception when sqlstate 'AKO02' then null; end;
  begin perform public.org_pack_provision('a0600000-0000-0000-0000-000000000003', null, 'Pack 60', 'cs_P60e', 'pi_P60e', 3900, 650, 'GBP', false, 'GB');
    raise exception 'a pack of no title'; exception when sqlstate 'AKO02' then null; end;
  v := public.org_pack_provision('a0600000-0000-0000-0000-000000000003', 'a0600000-0000-0000-0000-0000000000c1', 'Pack 60', 'cs_P60', 'pi_P60', 3900, 650, 'GBP', false, 'GB');
  insert into public.t60_ids values ('p_lic', v), ('p_org', (select org_id from public.org_licences where id = v));
  if public.org_pack_provision('a0600000-0000-0000-0000-000000000003', 'a0600000-0000-0000-0000-0000000000c1', 'Pack 60', 'cs_P60', 'pi_P60', 3900, 650, 'GBP', false, 'GB') <> v then
    raise exception 'a repeated webhook made a second pack';
  end if;
  if (select kind || '/' || title_scope || '/' || seats_purchased from public.org_licences where id = v) <> 'group/list/6' then raise exception 'pack licence shape'; end if;
  if (select count(*) from public.org_licence_titles where licence_id = v and workbook_id = 'a0600000-0000-0000-0000-0000000000c1') <> 1 then raise exception 'pack title'; end if;
  if (select buyer_type from public.org_profiles where org_id = public.t60('p_org')) <> 'consumer' then raise exception 'pack buyer type'; end if;
  if not exists (select 1 from public.royalty_receipts where org_licence_id = v and source = 'org_licence' and gross_minor = 3900 and tax_minor = 650 and payment_intent_id = 'pi_P60') then
    raise exception 'pack receipt';
  end if;
  if (select ends_at from public.org_licences where id = v) < now() + interval '40 years' then raise exception 'a one-off licence runs out too soon'; end if;
end $$;
reset role;

-- Six places, one workbook only.
select test_as('a0600000-0000-0000-0000-000000000003');
do $$ begin perform public.org_standing_link_rotate(public.t60('p_lic'), public.t60_hash('pack-link')); end $$;
reset role;
do $$ declare i int; begin
  for i in 4..9 loop
    perform test_as(('a0600000-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid);
    perform * from public.org_join_link_claim(public.t60_hash('pack-link'), true);
    reset role;
  end loop;
end $$;
select test_as('a0600000-0000-0000-0000-000000000010');
do $$ begin
  perform * from public.org_join_link_claim(public.t60_hash('pack-link'), true);
  raise exception 'a seventh person took a place';
exception when sqlstate 'AKO07' then null; end $$;
reset role;
do $$ begin
  if not app.has_entitlement('a0600000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-00000000000a', 'a0600000-0000-0000-0000-0000000000c1') then
    raise exception 'a pack member cannot read the pack workbook';
  end if;
  if app.has_entitlement('a0600000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-00000000000a', 'a0600000-0000-0000-0000-0000000000c2') then
    raise exception 'a pack member can read another workbook';
  end if;
end $$;

-- A part refund keeps the places; a full refund ends the licence.
select pg_temp.as_service();
do $$ begin
  if app.record_refund('refund', 're_P60a', 'pi_P60', 1000, 'GBP', false) <> 'recorded' then raise exception 'part refund'; end if;
  if (select status from public.org_licences where id = public.t60('p_lic')) <> 'active' then raise exception 'a part refund ended the pack'; end if;
  if app.record_refund('refund', 're_P60b', 'pi_P60', 2900, 'GBP', false) <> 'recorded' then raise exception 'rest of refund'; end if;
  if (select status from public.org_licences where id = public.t60('p_lic')) <> 'ended' then raise exception 'a full refund left the pack open'; end if;
end $$;
reset role;
do $$ begin
  if app.has_entitlement('a0600000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-00000000000a', 'a0600000-0000-0000-0000-0000000000c1') then
    raise exception 'access stayed after the refund';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Pilot: staff only, larger buyers, 30 days, once.
-- ---------------------------------------------------------------------------
select test_as('a0600000-0000-0000-0000-000000000013');
do $$ begin
  perform public.org_pilot_start('a0600000-0000-0000-0000-0000000000f2', 100);
  raise exception 'an organisation owner started its own pilot';
exception when sqlstate 'AKO01' then null; end $$;
reset role;
select test_as('a0600000-0000-0000-0000-000000000011', array['editor']);
do $$ declare v uuid; l public.org_licences; begin
  begin perform public.org_pilot_start('a0600000-0000-0000-0000-0000000000f2', 50);
    raise exception '50 seats got a pilot'; exception when sqlstate 'AKO02' then null; end;
  begin perform public.org_pilot_start('a0600000-0000-0000-0000-0000000000f1', 100);
    raise exception 'a publisher got a pilot'; exception when sqlstate 'AKO02' then null; end;
  v := public.org_pilot_start('a0600000-0000-0000-0000-0000000000f2', 100);
  select * into l from public.org_licences where id = v;
  if l.kind <> 'pilot' or l.seats_purchased <> 100 or l.title_scope <> 'membership' then raise exception 'pilot shape'; end if;
  if l.ends_at - l.starts_at <> interval '30 days' then raise exception 'pilot length %', l.ends_at - l.starts_at; end if;
  begin perform public.org_pilot_start('a0600000-0000-0000-0000-0000000000f2', 100);
    raise exception 'a second pilot'; exception when sqlstate 'AKO05' then null; end;
end $$;
reset role;
do $$ begin
  if not exists (select 1 from public.audit_log where action = 'org.pilot_started') then raise exception 'pilot not audited'; end if;
end $$;

rollback;
