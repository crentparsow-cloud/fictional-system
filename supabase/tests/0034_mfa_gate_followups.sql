-- Role second factor follow-ups (0034, F-143). The money changes 0031 added
-- (church bands, the cooling-off cancel, the buyer type) and 0030's staff
-- billing start are gated like 0032's: at aal1 an owner, finance member or
-- staff member is refused with AKM01 through the public wrapper (the API
-- path); at aal2 with a second factor the call reaches the function's own
-- checks. Viewers and outsiders never see AKM01. Each block must raise or
-- return the expected value; a failure aborts the script.
\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
-- 01 owner, 02 finance, 03 viewer, 06 outsider, 07 platform editor (staff).
insert into auth.users (id, email) values
  ('a0340000-0000-0000-0000-000000000001', 'owner34@work34.example'),
  ('a0340000-0000-0000-0000-000000000002', 'finance34@work34.example'),
  ('a0340000-0000-0000-0000-000000000003', 'viewer34@work34.example'),
  ('a0340000-0000-0000-0000-000000000006', 'outsider34@other34.example'),
  ('a0340000-0000-0000-0000-000000000007', 'staff34@akana.example');

-- f3 a church billed by band, f4 a business not yet billed, f5 a consumer group.
insert into public.organisations (id, kind, legal_name, display_name, slug, country) values
  ('a0340000-0000-0000-0000-0000000000f3', 'church', 'St Thirty-Four', 'St Thirty-Four', 'church-34', 'GB'),
  ('a0340000-0000-0000-0000-0000000000f4', 'business', 'Biz 34 Ltd', 'Biz 34', 'biz-34', 'GB'),
  ('a0340000-0000-0000-0000-0000000000f5', 'community_group', 'Club 34', 'Club 34', 'club-34', 'GB');
insert into public.org_profiles (org_id, billing_country, buyer_type) values
  ('a0340000-0000-0000-0000-0000000000f3', 'GB', 'business'),
  ('a0340000-0000-0000-0000-0000000000f4', 'GB', 'business'),
  ('a0340000-0000-0000-0000-0000000000f5', 'GB', 'consumer');
insert into public.org_members (org_id, user_id, role) values
  ('a0340000-0000-0000-0000-0000000000f3', 'a0340000-0000-0000-0000-000000000001', 'owner'),
  ('a0340000-0000-0000-0000-0000000000f3', 'a0340000-0000-0000-0000-000000000002', 'finance'),
  ('a0340000-0000-0000-0000-0000000000f3', 'a0340000-0000-0000-0000-000000000003', 'viewer'),
  ('a0340000-0000-0000-0000-0000000000f4', 'a0340000-0000-0000-0000-000000000001', 'owner'),
  ('a0340000-0000-0000-0000-0000000000f4', 'a0340000-0000-0000-0000-000000000002', 'finance'),
  ('a0340000-0000-0000-0000-0000000000f4', 'a0340000-0000-0000-0000-000000000003', 'viewer'),
  ('a0340000-0000-0000-0000-0000000000f5', 'a0340000-0000-0000-0000-000000000001', 'owner'),
  ('a0340000-0000-0000-0000-0000000000f5', 'a0340000-0000-0000-0000-000000000002', 'finance'),
  ('a0340000-0000-0000-0000-0000000000f5', 'a0340000-0000-0000-0000-000000000003', 'viewer');
insert into public.org_licences (id, org_id, kind, title_scope, seats_purchased, starts_at, ends_at) values
  ('a0340000-0000-0000-0000-0000000000e1', 'a0340000-0000-0000-0000-0000000000f3', 'church', 'membership', 50, now() - interval '10 days', now() + interval '1 year'),
  ('a0340000-0000-0000-0000-0000000000e2', 'a0340000-0000-0000-0000-0000000000f5', 'group', 'membership', 6, now() - interval '2 days', now() + interval '1 year'),
  ('a0340000-0000-0000-0000-0000000000e3', 'a0340000-0000-0000-0000-0000000000f4', 'teams', 'membership', 5, now() - interval '1 day', now() + interval '1 year');

-- The church's band subscription, as the webhook mirrors it.
do $$ begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "service_role"}', true);
  execute 'set local role service_role';
  perform public.org_billing_apply('sub_C34', 'cus_C34', 'a0340000-0000-0000-0000-0000000000e1', 'active', 'church_band_1', null,
    1, 'send_invoice', 30, now() - interval '10 days', now() + interval '20 days', false, null, null, null, false, now());
end $$;
reset role;

-- Act as a user at a given level, as in 0032's test.
create or replace function pg_temp.as_level(p_user uuid, p_aal text, p_amr jsonb, p_roles text[] default '{}') returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal, 'amr', p_amr,
    'app_metadata', jsonb_build_object('platform_roles', to_jsonb(p_roles)))::text, true);
  execute 'set local role authenticated';
end $$;
create or replace function pg_temp.pw() returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint)) $$;
create or replace function pg_temp.totp() returns jsonb language sql as $$
  select pg_temp.pw() || jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint - 60)) $$;

-- Every gated call, as SQL through the public wrappers.
create table public.t34_calls (k text primary key, q text not null);
grant select on public.t34_calls to authenticated;
insert into public.t34_calls (k, q) values
  ('org_billing_band_change_check', $q$select public.org_billing_band_change_check('a0340000-0000-0000-0000-0000000000e1', 'church_band_2', null)$q$),
  ('org_cooling_off_done', $q$select public.org_cooling_off_done('a0340000-0000-0000-0000-0000000000e2', 100, 'GBP', 'pending')$q$),
  ('org_set_buyer_type', $q$select public.org_set_buyer_type('a0340000-0000-0000-0000-0000000000f4', 'consumer', 'Sole trader')$q$),
  ('org_billing_link_check', $q$select * from public.org_billing_link_check('a0340000-0000-0000-0000-0000000000e3')$q$);

-- 'refused' when the call raised AKM01, otherwise 'through'. Rolled back either way.
create or replace function pg_temp.gate(p_k text) returns text
language plpgsql as $$
declare v_q text;
begin
  select c.q into v_q from public.t34_calls c where c.k = p_k;
  if v_q is null then raise exception 'unknown call %', p_k; end if;
  begin
    execute v_q;
    raise sqlstate 'P0T34';
  exception
    when sqlstate 'AKM01' then return 'refused';
    when sqlstate 'P0T34' then return 'through';
    when others then return 'through';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Owner, finance and staff at aal1: every call refused with AKM01.
-- ---------------------------------------------------------------------------
select pg_temp.as_level('a0340000-0000-0000-0000-000000000001', 'aal1', pg_temp.pw());
do $$ declare r record; begin
  for r in select k from public.t34_calls order by k loop
    if pg_temp.gate(r.k) <> 'refused' then raise exception 'owner at aal1 got through %', r.k; end if;
  end loop;
end $$;
reset role;
select pg_temp.as_level('a0340000-0000-0000-0000-000000000002', 'aal1', pg_temp.pw());
do $$ declare r record; begin
  for r in select k from public.t34_calls order by k loop
    if pg_temp.gate(r.k) <> 'refused' then raise exception 'finance at aal1 got through %', r.k; end if;
  end loop;
end $$;
reset role;
select pg_temp.as_level('a0340000-0000-0000-0000-000000000007', 'aal1', pg_temp.pw(), array['editor']);
do $$ declare r record; begin
  for r in select k from public.t34_calls order by k loop
    if pg_temp.gate(r.k) <> 'refused' then raise exception 'staff at aal1 got through %', r.k; end if;
  end loop;
end $$;
reset role;
-- aal2 with no second factor named is still refused.
select pg_temp.as_level('a0340000-0000-0000-0000-000000000001', 'aal2', pg_temp.pw());
do $$ begin
  if pg_temp.gate('org_billing_band_change_check') <> 'refused' then raise exception 'aal2 without amr factor changed a band'; end if;
  if pg_temp.gate('org_cooling_off_done') <> 'refused' then raise exception 'aal2 without amr factor cancelled'; end if;
end $$;
reset role;
-- Nothing changed.
do $$ begin
  if (select buyer_type from public.org_profiles where org_id = 'a0340000-0000-0000-0000-0000000000f4') <> 'business' then
    raise exception 'buyer type changed at aal1'; end if;
  if (select status from public.org_licences where id = 'a0340000-0000-0000-0000-0000000000e2') = 'ended' then
    raise exception 'licence ended at aal1'; end if;
  if exists (select 1 from public.audit_log where action in ('org.band_change_requested', 'org.band_change_override', 'org.cooling_off_cancelled')
               and org_id in ('a0340000-0000-0000-0000-0000000000f3', 'a0340000-0000-0000-0000-0000000000f5')) then
    raise exception 'an audit row was written at aal1'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Not affected: a viewer and an outsider reach the function's own
-- checks, never AKM01, and are still refused there.
-- ---------------------------------------------------------------------------
select pg_temp.as_level('a0340000-0000-0000-0000-000000000003', 'aal1', pg_temp.pw());
do $$ declare r record; begin
  for r in select k from public.t34_calls order by k loop
    if pg_temp.gate(r.k) <> 'through' then raise exception 'viewer got AKM01 on %', r.k; end if;
  end loop;
end $$;
do $$ begin
  perform public.org_billing_band_change_check('a0340000-0000-0000-0000-0000000000e1', 'church_band_2', null);
  raise exception 'a viewer changed the band';
exception when sqlstate 'AKO01' then null; end $$;
reset role;
select pg_temp.as_level('a0340000-0000-0000-0000-000000000006', 'aal1', pg_temp.pw());
do $$ declare r record; begin
  for r in select k from public.t34_calls order by k loop
    if pg_temp.gate(r.k) <> 'through' then raise exception 'outsider got AKM01 on %, which tells them about the organisation', r.k; end if;
  end loop;
end $$;
do $$ begin
  perform public.org_cooling_off_done('a0340000-0000-0000-0000-0000000000e2', 100, 'GBP', 'pending');
  raise exception 'an outsider cancelled a licence';
exception when sqlstate 'AKO01' then null; end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. At aal2 with a second factor the real work happens.
-- ---------------------------------------------------------------------------
select pg_temp.as_level('a0340000-0000-0000-0000-000000000001', 'aal2', pg_temp.totp());
do $$ declare r record; begin
  for r in select k from public.t34_calls order by k loop
    if pg_temp.gate(r.k) <> 'through' then raise exception 'owner at aal2 refused on %', r.k; end if;
  end loop;
  if public.org_billing_band_change_check('a0340000-0000-0000-0000-0000000000e1', 'church_band_2', null) <> 'up' then
    raise exception 'owner at aal2 could not move up a band'; end if;
end $$;
reset role;
select pg_temp.as_level('a0340000-0000-0000-0000-000000000002', 'aal2', '[{"method": "mfa/webauthn", "timestamp": 1}]'::jsonb);
do $$ begin
  if public.org_billing_band_change_check('a0340000-0000-0000-0000-0000000000e1', 'church_band_1', null) <> 'same' then
    raise exception 'finance with a passkey could not check a band'; end if;
end $$;
reset role;
select pg_temp.as_level('a0340000-0000-0000-0000-000000000007', 'aal2', pg_temp.totp(), array['editor']);
do $$ declare n int; begin
  if not public.org_set_buyer_type('a0340000-0000-0000-0000-0000000000f4', 'consumer', 'Sole trader') then
    raise exception 'staff at aal2 could not set the buyer type'; end if;
  select count(*) into n from public.org_billing_link_check('a0340000-0000-0000-0000-0000000000e3') where seats = 5;
  if n <> 1 then raise exception 'staff at aal2 could not check billing'; end if;
end $$;
reset role;
do $$ begin
  if (select buyer_type from public.org_profiles where org_id = 'a0340000-0000-0000-0000-0000000000f4') <> 'consumer' then
    raise exception 'buyer type not saved at aal2'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. The cores cannot be called directly.
-- ---------------------------------------------------------------------------
select pg_temp.as_level('a0340000-0000-0000-0000-000000000001', 'aal2', pg_temp.totp());
do $$ begin
  perform app.org_billing_band_change_check_core('a0340000-0000-0000-0000-0000000000e1', 'church_band_2', null);
  raise exception 'band core called directly';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform app.org_cooling_off_done_core('a0340000-0000-0000-0000-0000000000e2', 100, 'GBP', 'pending');
  raise exception 'cooling-off core called directly';
exception when insufficient_privilege then null; end $$;
reset role;
select pg_temp.as_level('a0340000-0000-0000-0000-000000000007', 'aal2', pg_temp.totp(), array['editor']);
do $$ begin
  perform app.org_set_buyer_type_core('a0340000-0000-0000-0000-0000000000f4', 'business', 'x');
  raise exception 'buyer type core called directly';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform * from app.org_billing_link_check_core('a0340000-0000-0000-0000-0000000000e3');
  raise exception 'link check core called directly';
exception when insufficient_privilege then null; end $$;
reset role;

-- Anon cannot reach the gated functions at all.
do $$ begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  execute 'set local role anon';
  perform public.org_billing_band_change_check('a0340000-0000-0000-0000-0000000000e1', 'church_band_2', null);
  raise exception 'anon reached the band check';
exception when insufficient_privilege then null; end $$;
reset role;

rollback;
\echo PASS 0034_mfa_gate_followups
