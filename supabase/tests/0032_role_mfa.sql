-- Role second factor (0032, F-143). Owners, finance and staff need an aal2
-- session with a second factor in amr before any money or membership
-- change in /console, /org and /studio. Every gated function is called
-- through its public wrapper (the API path) at aal1 and must raise AKM01;
-- at aal2 the gate lets it through to the function's own checks. Readers,
-- editors and outsiders are not stopped by the gate. Each block must raise
-- or return the expected value; a failure aborts the script.
\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
-- 01 owner, 02 finance, 03 editor, 04 viewer, 05 reader with a seat,
-- 06 outsider, 07 platform editor (staff).
insert into auth.users (id, email) values
  ('a0320000-0000-0000-0000-000000000001', 'owner32@work32.example'),
  ('a0320000-0000-0000-0000-000000000002', 'finance32@work32.example'),
  ('a0320000-0000-0000-0000-000000000003', 'editor32@work32.example'),
  ('a0320000-0000-0000-0000-000000000004', 'viewer32@work32.example'),
  ('a0320000-0000-0000-0000-000000000005', 'reader32@work32.example'),
  ('a0320000-0000-0000-0000-000000000006', 'outsider32@other32.example'),
  ('a0320000-0000-0000-0000-000000000007', 'staff32@akana.example');
insert into public.profiles (user_id) values ('a0320000-0000-0000-0000-000000000005') on conflict do nothing;

insert into public.organisations (id, kind, legal_name, display_name, slug, country) values
  ('a0320000-0000-0000-0000-0000000000f1', 'publisher', 'Pub 32 Ltd', 'Pub 32', 'pub-32', 'GB'),
  ('a0320000-0000-0000-0000-0000000000f2', 'business', 'Biz 32 Ltd', 'Biz 32', 'biz-32', 'GB');
insert into public.org_members (org_id, user_id, role) values
  ('a0320000-0000-0000-0000-0000000000f1', 'a0320000-0000-0000-0000-000000000001', 'owner'),
  ('a0320000-0000-0000-0000-0000000000f1', 'a0320000-0000-0000-0000-000000000002', 'finance'),
  ('a0320000-0000-0000-0000-0000000000f1', 'a0320000-0000-0000-0000-000000000003', 'editor'),
  ('a0320000-0000-0000-0000-0000000000f1', 'a0320000-0000-0000-0000-000000000004', 'viewer'),
  ('a0320000-0000-0000-0000-0000000000f2', 'a0320000-0000-0000-0000-000000000001', 'owner'),
  ('a0320000-0000-0000-0000-0000000000f2', 'a0320000-0000-0000-0000-000000000002', 'finance');
insert into public.books (id, org_id, slug, title) values
  ('a0320000-0000-0000-0000-0000000000b1', 'a0320000-0000-0000-0000-0000000000f1', 'book-32', 'Book 32');
insert into public.workbooks (id, code, book_id, org_id, tenant_id, slug, title, card_line, genre_id, depth, badge, is_demo, status, safety_tier, in_membership) values
  ('a0320000-0000-0000-0000-0000000000c1', 'AK-PTX32', 'a0320000-0000-0000-0000-0000000000b1', 'a0320000-0000-0000-0000-0000000000f1',
   '00000000-0000-0000-0000-00000000000a', 'wb32-one', 'Wb 32', 'Card', 'productivity', 'full', 'official', false, 'draft', 'none', false);
insert into public.org_invitations (id, org_id, email, role, token_hash, expires_at) values
  ('a0320000-0000-0000-0000-0000000000a1', 'a0320000-0000-0000-0000-0000000000f1', 'new32@work32.example', 'editor', repeat('1', 64), now() + interval '7 days');
insert into public.org_licences (id, org_id, kind, title_scope, seats_purchased, starts_at, ends_at) values
  ('a0320000-0000-0000-0000-0000000000e1', 'a0320000-0000-0000-0000-0000000000f2', 'teams', 'membership', 5, now() - interval '1 day', now() + interval '1 year');
insert into public.org_seat_invitations (id, org_id, licence_id, email, email_hash, token_hash, expires_at) values
  ('a0320000-0000-0000-0000-0000000000a2', 'a0320000-0000-0000-0000-0000000000f2', 'a0320000-0000-0000-0000-0000000000e1',
   'invitee32@work32.example', repeat('2', 64), repeat('3', 64), now() + interval '7 days');
insert into public.org_seats (id, licence_id, org_id, user_id, roster_email) values
  ('a0320000-0000-0000-0000-0000000000a3', 'a0320000-0000-0000-0000-0000000000e1', 'a0320000-0000-0000-0000-0000000000f2',
   'a0320000-0000-0000-0000-000000000005', 'reader32@work32.example');
insert into public.org_join_links (id, org_id, licence_id, token_hash, max_uses, expires_at) values
  ('a0320000-0000-0000-0000-0000000000a4', 'a0320000-0000-0000-0000-0000000000f2', 'a0320000-0000-0000-0000-0000000000e1',
   repeat('4', 64), 3, now() + interval '7 days');

-- Act as a user at a given level. p_amr is the token's amr claim as is.
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
  select pg_temp.pw() || jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint - 7200)) $$;

-- Every gated call, as SQL through the public wrappers.
create table public.t32_calls (k text primary key, q text not null);
grant select on public.t32_calls to authenticated;
insert into public.t32_calls (k, q) values
  ('org_invite', $q$select public.org_invite('a0320000-0000-0000-0000-0000000000f1', 'x32@work32.example', 'editor', null, repeat('5', 64))$q$),
  ('org_invite_resend', $q$select public.org_invite_resend('a0320000-0000-0000-0000-0000000000a1', repeat('6', 64))$q$),
  ('org_invite_revoke', $q$select public.org_invite_revoke('a0320000-0000-0000-0000-0000000000a1')$q$),
  ('org_member_set_role', $q$select public.org_member_set_role('a0320000-0000-0000-0000-0000000000f1', 'a0320000-0000-0000-0000-000000000004', 'author')$q$),
  ('org_member_remove', $q$select public.org_member_remove('a0320000-0000-0000-0000-0000000000f1', 'a0320000-0000-0000-0000-000000000004')$q$),
  ('org_seat_invite', $q$select public.org_seat_invite('a0320000-0000-0000-0000-0000000000e1', 'y32@work32.example', repeat('7', 64))$q$),
  ('org_seat_invite_resend', $q$select public.org_seat_invite_resend('a0320000-0000-0000-0000-0000000000a2', repeat('8', 64))$q$),
  ('org_seat_invite_revoke', $q$select public.org_seat_invite_revoke('a0320000-0000-0000-0000-0000000000a2')$q$),
  ('org_seat_release', $q$select public.org_seat_release('a0320000-0000-0000-0000-0000000000a3')$q$),
  ('org_join_link_create', $q$select public.org_join_link_create('a0320000-0000-0000-0000-0000000000e1', repeat('9', 64), 7, 2, null)$q$),
  ('org_join_link_revoke', $q$select public.org_join_link_revoke('a0320000-0000-0000-0000-0000000000a4')$q$),
  ('org_billing_seat_change_check', $q$select public.org_billing_seat_change_check('a0320000-0000-0000-0000-0000000000e1', 6)$q$),
  ('org_licence_end_request', $q$select public.org_licence_end_request('a0320000-0000-0000-0000-0000000000e1')$q$),
  ('org_billing_end_allowed', $q$select public.org_billing_end_allowed('a0320000-0000-0000-0000-0000000000e1')$q$),
  ('price_choose', $q$select public.price_choose('a0320000-0000-0000-0000-0000000000c1', 'w-499', false)$q$),
  ('licence_accept', $q$select * from public.licence_accept('a0320000-0000-0000-0000-0000000000b1', 'v0', repeat('a', 64), array['WORLD'], array[]::text[],
      24, 0, true, false, false, true, true, true, 'Olive Owner', 'Director', null)$q$),
  ('licence_upload', $q$select * from public.licence_upload('a0320000-0000-0000-0000-0000000000b1', 'v0', 'org/x.pdf', repeat('b', 64), array['WORLD'],
      array[]::text[], 24, 0, true, false, false, 'Olive Owner', 'Director', null)$q$);

-- 'refused' when the call raised AKM01, otherwise 'through' (it ran, or the
-- function's own checks raised something else). Rolled back either way.
create or replace function pg_temp.gate(p_k text) returns text
language plpgsql as $$
declare v_q text;
begin
  select c.q into v_q from public.t32_calls c where c.k = p_k;
  if v_q is null then raise exception 'unknown call %', p_k; end if;
  begin
    execute v_q;
    raise sqlstate 'P0T32';
  exception
    when sqlstate 'AKM01' then return 'refused';
    when sqlstate 'P0T32' then return 'through';
    when others then return 'through';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 1. The claim check.
-- ---------------------------------------------------------------------------
select pg_temp.as_level('a0320000-0000-0000-0000-000000000001', 'aal1', pg_temp.pw());
do $$ begin if app.session_mfa_verified() then raise exception 'aal1 passed'; end if; end $$;
reset role;
select pg_temp.as_level('a0320000-0000-0000-0000-000000000001', 'aal2', pg_temp.pw());
do $$ begin if app.session_mfa_verified() then raise exception 'aal2 with no second factor in amr passed'; end if; end $$;
reset role;
select pg_temp.as_level('a0320000-0000-0000-0000-000000000001', 'aal1', pg_temp.totp());
do $$ begin if app.session_mfa_verified() then raise exception 'totp in amr at aal1 passed'; end if; end $$;
reset role;
-- An old code is fine here: this is a session check, not the payout step-up.
select pg_temp.as_level('a0320000-0000-0000-0000-000000000001', 'aal2', pg_temp.totp());
do $$ begin if not app.session_mfa_verified() then raise exception 'aal2 with totp refused'; end if; end $$;
reset role;
select pg_temp.as_level('a0320000-0000-0000-0000-000000000001', 'aal2', '["pwd", "mfa/webauthn"]'::jsonb);
do $$ begin if not app.session_mfa_verified() then raise exception 'aal2 with webauthn (string amr) refused'; end if; end $$;
reset role;
select pg_temp.as_level('a0320000-0000-0000-0000-000000000001', 'aal2', '"totp"'::jsonb);
do $$ begin if app.session_mfa_verified() then raise exception 'a non-array amr passed'; end if; end $$;
reset role;
select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true);
do $$ begin if app.session_mfa_verified() then raise exception 'no claims passed'; end if; end $$;

-- ---------------------------------------------------------------------------
-- 2. Owner at aal1: every gated function refuses with AKM01.
-- ---------------------------------------------------------------------------
select pg_temp.as_level('a0320000-0000-0000-0000-000000000001', 'aal1', pg_temp.pw());
do $$
declare r record; v text;
begin
  for r in select k from public.t32_calls order by k loop
    v := pg_temp.gate(r.k);
    if v <> 'refused' then raise exception 'owner at aal1 got through %', r.k; end if;
  end loop;
end $$;
-- And nothing changed.
reset role;
do $$ begin
  if (select revoked_at from public.org_invitations where id = 'a0320000-0000-0000-0000-0000000000a1') is not null then raise exception 'invite revoked at aal1'; end if;
  if (select released_at from public.org_seats where id = 'a0320000-0000-0000-0000-0000000000a3') is not null then raise exception 'seat released at aal1'; end if;
  if (select role from public.org_members where org_id = 'a0320000-0000-0000-0000-0000000000f1' and user_id = 'a0320000-0000-0000-0000-000000000004') <> 'viewer' then
    raise exception 'role changed at aal1'; end if;
end $$;

-- aal2 with no second factor named is still refused.
select pg_temp.as_level('a0320000-0000-0000-0000-000000000001', 'aal2', pg_temp.pw());
do $$ begin
  if pg_temp.gate('org_invite_revoke') <> 'refused' then raise exception 'aal2 without amr factor got through'; end if;
  if pg_temp.gate('org_billing_seat_change_check') <> 'refused' then raise exception 'aal2 without amr factor changed seats'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. Finance at aal1: refused wherever the finance role is acting.
-- ---------------------------------------------------------------------------
select pg_temp.as_level('a0320000-0000-0000-0000-000000000002', 'aal1', pg_temp.pw());
do $$
declare r record;
begin
  for r in select k from public.t32_calls order by k loop
    if pg_temp.gate(r.k) <> 'refused' then raise exception 'finance at aal1 got through %', r.k; end if;
  end loop;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. Staff at aal1: refused too.
-- ---------------------------------------------------------------------------
select pg_temp.as_level('a0320000-0000-0000-0000-000000000007', 'aal1', pg_temp.pw(), array['editor']);
do $$
declare r record;
begin
  for r in select k from public.t32_calls order by k loop
    if pg_temp.gate(r.k) <> 'refused' then raise exception 'staff at aal1 got through %', r.k; end if;
  end loop;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 5. Not affected: editor, viewer, outsider and a reader leaving their seat.
-- Their calls reach the function's own role checks (or succeed), never AKM01.
-- ---------------------------------------------------------------------------
select pg_temp.as_level('a0320000-0000-0000-0000-000000000003', 'aal1', pg_temp.pw());
do $$
declare r record;
begin
  for r in select k from public.t32_calls order by k loop
    if pg_temp.gate(r.k) <> 'through' then raise exception 'editor at aal1 got AKM01 on %', r.k; end if;
  end loop;
end $$;
reset role;
select pg_temp.as_level('a0320000-0000-0000-0000-000000000006', 'aal1', pg_temp.pw());
do $$
declare r record;
begin
  for r in select k from public.t32_calls order by k loop
    if pg_temp.gate(r.k) <> 'through' then raise exception 'outsider got AKM01 on %, which tells them about the organisation', r.k; end if;
  end loop;
end $$;
-- The outsider is still refused by the function itself.
do $$ begin
  perform public.org_invite_revoke('a0320000-0000-0000-0000-0000000000a1');
  raise exception 'outsider revoked an invitation';
exception when sqlstate 'AKS01' then null; end $$;
reset role;

select pg_temp.as_level('a0320000-0000-0000-0000-000000000005', 'aal1', pg_temp.pw());
do $$ begin
  if public.org_seat_release('a0320000-0000-0000-0000-0000000000a3') is not true then raise exception 'reader could not leave their seat'; end if;
end $$;
reset role;
update public.org_seats set released_at = null, released_reason = null where id = 'a0320000-0000-0000-0000-0000000000a3';

-- ---------------------------------------------------------------------------
-- 6. Owner at aal2 with TOTP: the gate lets every call through, and the
-- real changes happen.
-- ---------------------------------------------------------------------------
select pg_temp.as_level('a0320000-0000-0000-0000-000000000001', 'aal2', pg_temp.totp());
do $$
declare r record;
begin
  for r in select k from public.t32_calls order by k loop
    if pg_temp.gate(r.k) <> 'through' then raise exception 'owner at aal2 refused on %', r.k; end if;
  end loop;
end $$;
do $$ begin
  if public.org_invite_revoke('a0320000-0000-0000-0000-0000000000a1') is not true then raise exception 'owner at aal2 could not revoke'; end if;
  if public.org_member_set_role('a0320000-0000-0000-0000-0000000000f1', 'a0320000-0000-0000-0000-000000000004', 'author') <> 'author' then
    raise exception 'owner at aal2 could not change a role'; end if;
  if public.org_seat_release('a0320000-0000-0000-0000-0000000000a3') is not true then raise exception 'owner at aal2 could not release a seat'; end if;
  if public.org_join_link_revoke('a0320000-0000-0000-0000-0000000000a4') is not true then raise exception 'owner at aal2 could not close a link'; end if;
end $$;
reset role;

-- Finance at aal2 with a passkey: billing checks go through.
select pg_temp.as_level('a0320000-0000-0000-0000-000000000002', 'aal2', '[{"method": "mfa/webauthn", "timestamp": 1}]'::jsonb);
do $$ begin
  if pg_temp.gate('org_billing_seat_change_check') <> 'through' then raise exception 'finance with passkey refused'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 7. The cores cannot be called directly, and the status helper.
-- ---------------------------------------------------------------------------
select pg_temp.as_level('a0320000-0000-0000-0000-000000000001', 'aal1', pg_temp.pw());
do $$ begin
  perform app.org_invite_revoke_core('a0320000-0000-0000-0000-0000000000a1');
  raise exception 'core called directly';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform app.licence_accept_core('a0320000-0000-0000-0000-0000000000b1', 'v0', repeat('a', 64), array['WORLD'], array[]::text[],
    24, 0, true, false, false, true, true, true, 'O', 'D', null);
  raise exception 'licence core called directly';
exception when insufficient_privilege then null; end $$;
do $$
declare s record;
begin
  select * into s from public.role_mfa_status();
  if not s.required or s.verified then raise exception 'owner at aal1 status wrong: % %', s.required, s.verified; end if;
end $$;
reset role;
select pg_temp.as_level('a0320000-0000-0000-0000-000000000001', 'aal2', pg_temp.totp());
do $$
declare s record;
begin
  select * into s from public.role_mfa_status();
  if not s.required or not s.verified then raise exception 'owner at aal2 status wrong'; end if;
end $$;
reset role;
select pg_temp.as_level('a0320000-0000-0000-0000-000000000005', 'aal1', pg_temp.pw());
do $$
declare s record;
begin
  select * into s from public.role_mfa_status();
  if s.required then raise exception 'reader told they need a second factor'; end if;
  if public.mfa_passkey_open() then raise exception 'passkey flag should default off'; end if;
end $$;
reset role;

-- Anon cannot ask.
do $$ begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  execute 'set local role anon';
  perform public.role_mfa_status();
  raise exception 'anon read mfa status';
exception when insufficient_privilege then null; end $$;
reset role;

rollback;
\echo PASS 0032_role_mfa
