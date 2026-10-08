-- 0032 Role second factor (F-143, finishing it).
--
-- Organisation owners and finance members, and Akana staff, need a verified
-- authenticator (Supabase Auth MFA, session at aal2) before they can change
-- money or membership: members and invitations in /console, seats, join
-- links, bulk invitations, seat counts and the end of a licence in /org, and
-- prices and licence signing in /studio. Payout changes already need a fresh
-- code (0014, app.recent_step_up) and are not changed here.
--
-- The rule is read from the signed token: aal must be aal2 and amr must name
-- a second factor (TOTP, or WebAuthn once passkeys are switched on). The app
-- checks the same thing first (apps/web/lib/mfa/role-mfa.ts) and sends the
-- person to /verify, but the database refuses on its own, so calling the
-- API directly does not get round it.
--
-- How the functions are gated without copying their bodies: each app.*
-- definer function below is renamed to <name>_core and loses its grants; a
-- new app.<name> with the same signature runs the check and then calls the
-- core. The public wrappers call app.<name> by name, so they pick up the
-- gate unchanged. Readers are not affected: claiming or declining a seat,
-- accepting an invitation and leaving your own seat are not gated.
--
-- Depends on 0001 to 0030 only.

-- ---------------------------------------------------------------------------
-- 1. The checks.
-- ---------------------------------------------------------------------------

-- True when this session reached aal2 with a second factor. AMR entries are
-- objects ({method, timestamp}) from Supabase Auth, or plain strings when an
-- access token hook rewrites them (RFC 8176 style); both are read.
create or replace function app.session_mfa_verified() returns boolean
language sql stable security definer set search_path = '' as $$
  with c as (select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb as j)
  select coalesce((
    select (c.j ->> 'aal') = 'aal2' and exists (
      select 1 from jsonb_array_elements(case when jsonb_typeof(c.j -> 'amr') = 'array' then c.j -> 'amr' else '[]'::jsonb end) e
      where (case jsonb_typeof(e) when 'object' then e ->> 'method' when 'string' then e #>> '{}' else null end)
            in ('totp', 'mfa/totp', 'webauthn', 'mfa/webauthn'))
    from c), false)
$$;

-- True when the caller must have a second factor to act for this
-- organisation: they are its owner or finance member, or Akana staff.
create or replace function app.role_mfa_required(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.uid() is not null and (
    app.is_staff()
    or (p_org is not null and exists (
      select 1 from public.org_members m
       where m.org_id = p_org and m.user_id = app.uid() and m.role in ('owner', 'finance'))))
$$;

-- Raise unless the caller may go ahead. Someone with no role here passes
-- through, and the core function refuses them with its own error, so this
-- check never tells an outsider anything.
create or replace function app.require_role_mfa(p_org uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if app.role_mfa_required(p_org) and not app.session_mfa_verified() then
    raise exception 'verify with your authenticator app first' using errcode = 'AKM01';
  end if;
end $$;

-- For the console banners: does this person need a second factor anywhere,
-- and does this session have one. Their own memberships only.
create or replace function app.role_mfa_status()
returns table (required boolean, verified boolean)
language sql stable security definer set search_path = '' as $$
  select app.uid() is not null and (app.is_staff() or exists (
           select 1 from public.org_members m where m.user_id = app.uid() and m.role in ('owner', 'finance'))),
         app.session_mfa_verified()
$$;

-- Passkeys as a second factor (WebAuthn through Supabase Auth MFA). The
-- client API is experimental, so it stays off until Crent switches it on.
insert into public.feature_flags (key, scope, enabled, reason) values
  ('mfa_passkey', 'global', false, 'Passkey (WebAuthn) as a second factor (F-143). Supabase marks the API experimental; off until tested on staging.')
on conflict do nothing;

create or replace function app.mfa_passkey_open() returns boolean
language sql stable security definer set search_path = '' as $$ select app.flag('mfa_passkey') $$;

-- ---------------------------------------------------------------------------
-- 2. Move the cores aside.
-- ---------------------------------------------------------------------------
alter function app.org_invite(uuid, text, text, uuid, text) rename to org_invite_core;
alter function app.org_invite_resend(uuid, text) rename to org_invite_resend_core;
alter function app.org_invite_revoke(uuid) rename to org_invite_revoke_core;
alter function app.org_member_set_role(uuid, uuid, text) rename to org_member_set_role_core;
alter function app.org_member_remove(uuid, uuid) rename to org_member_remove_core;
alter function app.org_seat_invite(uuid, text, text) rename to org_seat_invite_core;
alter function app.org_seat_invite_resend(uuid, text) rename to org_seat_invite_resend_core;
alter function app.org_seat_invite_revoke(uuid) rename to org_seat_invite_revoke_core;
alter function app.org_seat_release(uuid) rename to org_seat_release_core;
alter function app.org_join_link_create(uuid, text, int, int, text) rename to org_join_link_create_core;
alter function app.org_join_link_revoke(uuid) rename to org_join_link_revoke_core;
alter function app.org_billing_seat_change_check(uuid, int) rename to org_billing_seat_change_check_core;
alter function app.org_licence_end_request(uuid) rename to org_licence_end_request_core;
alter function app.org_billing_end_allowed(uuid) rename to org_billing_end_allowed_core;
alter function app.price_choose(uuid, text, boolean) rename to price_choose_core;
alter function app.licence_accept(uuid, text, text, text[], text[], int, int, boolean, boolean, boolean, boolean, boolean, boolean, text, text, text)
  rename to licence_accept_core;
alter function app.licence_upload(uuid, text, text, text, text[], text[], int, int, boolean, boolean, boolean, text, text, text)
  rename to licence_upload_core;

-- ---------------------------------------------------------------------------
-- 3. Gated functions, same names and signatures as before.
-- ---------------------------------------------------------------------------

-- /console: members and invitations (0013).
create or replace function app.org_invite(p_org uuid, p_email text, p_role text, p_author uuid, p_token_hash text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.require_role_mfa(p_org);
  return app.org_invite_core(p_org, p_email, p_role, p_author, p_token_hash);
end $$;

create or replace function app.org_invite_resend(p_invite uuid, p_token_hash text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.require_role_mfa((select i.org_id from public.org_invitations i where i.id = p_invite));
  return app.org_invite_resend_core(p_invite, p_token_hash);
end $$;

create or replace function app.org_invite_revoke(p_invite uuid) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.require_role_mfa((select i.org_id from public.org_invitations i where i.id = p_invite));
  return app.org_invite_revoke_core(p_invite);
end $$;

create or replace function app.org_member_set_role(p_org uuid, p_user uuid, p_role text) returns text
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.require_role_mfa(p_org);
  return app.org_member_set_role_core(p_org, p_user, p_role);
end $$;

create or replace function app.org_member_remove(p_org uuid, p_user uuid) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.require_role_mfa(p_org);
  return app.org_member_remove_core(p_org, p_user);
end $$;

-- /org: seats, invitations, join links (0024, 0030).
create or replace function app.org_seat_invite(p_licence uuid, p_email text, p_token_hash text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.require_role_mfa((select l.org_id from public.org_licences l where l.id = p_licence));
  return app.org_seat_invite_core(p_licence, p_email, p_token_hash);
end $$;

create or replace function app.org_seat_invite_resend(p_invite uuid, p_token_hash text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.require_role_mfa((select i.org_id from public.org_seat_invitations i where i.id = p_invite));
  return app.org_seat_invite_resend_core(p_invite, p_token_hash);
end $$;

create or replace function app.org_seat_invite_revoke(p_invite uuid) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.require_role_mfa((select i.org_id from public.org_seat_invitations i where i.id = p_invite));
  return app.org_seat_invite_revoke_core(p_invite);
end $$;

-- Leaving your own seat is a reader action and is never gated.
create or replace function app.org_seat_release(p_seat uuid) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare v_org uuid; v_holder uuid;
begin
  select s.org_id, s.user_id into v_org, v_holder from public.org_seats s where s.id = p_seat;
  if v_holder is distinct from app.uid() then
    perform app.require_role_mfa(v_org);
  end if;
  return app.org_seat_release_core(p_seat);
end $$;

create or replace function app.org_join_link_create(p_licence uuid, p_token_hash text, p_days int, p_max_uses int, p_domain text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.require_role_mfa((select l.org_id from public.org_licences l where l.id = p_licence));
  return app.org_join_link_create_core(p_licence, p_token_hash, p_days, p_max_uses, p_domain);
end $$;

create or replace function app.org_join_link_revoke(p_link uuid) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.require_role_mfa((select k.org_id from public.org_join_links k where k.id = p_link));
  return app.org_join_link_revoke_core(p_link);
end $$;

-- /org/billing: seat count and the end of a licence (0030).
create or replace function app.org_billing_seat_change_check(p_licence uuid, p_quantity int) returns text
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.require_role_mfa((select l.org_id from public.org_licences l where l.id = p_licence));
  return app.org_billing_seat_change_check_core(p_licence, p_quantity);
end $$;

create or replace function app.org_licence_end_request(p_licence uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.require_role_mfa((select l.org_id from public.org_licences l where l.id = p_licence));
  return app.org_licence_end_request_core(p_licence);
end $$;

-- Asked before Stripe is told to stop the subscription, so it is gated too.
create or replace function app.org_billing_end_allowed(p_licence uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_role_mfa((select l.org_id from public.org_licences l where l.id = p_licence));
  return app.org_billing_end_allowed_core(p_licence);
end $$;

-- /studio: prices (0020) and licence signing (0013).
create or replace function app.price_choose(p_workbook uuid, p_point text, p_in_membership boolean) returns text
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.require_role_mfa((select w.org_id from public.workbooks w where w.id = p_workbook));
  return app.price_choose_core(p_workbook, p_point, p_in_membership);
end $$;

create or replace function app.licence_accept(
  p_book uuid, p_version text, p_text_sha256 text,
  p_territories text[], p_excluded text[], p_term_months int, p_exclusive_months int,
  p_subscription boolean, p_cover boolean, p_audio boolean,
  p_warrant_rights boolean, p_warrant_no_clash boolean, p_warrant_no_claims boolean,
  p_signer_name text, p_signer_capacity text, p_ip_hash text
) returns table (licence_id uuid, licence_ref text, licence_status text)
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.require_role_mfa((select b.org_id from public.books b where b.id = p_book));
  return query select * from app.licence_accept_core(p_book, p_version, p_text_sha256, p_territories, p_excluded, p_term_months,
    p_exclusive_months, p_subscription, p_cover, p_audio, p_warrant_rights, p_warrant_no_clash, p_warrant_no_claims,
    p_signer_name, p_signer_capacity, p_ip_hash);
end $$;

create or replace function app.licence_upload(
  p_book uuid, p_version text, p_path text, p_document_sha256 text,
  p_territories text[], p_excluded text[], p_term_months int, p_exclusive_months int,
  p_subscription boolean, p_cover boolean, p_audio boolean,
  p_signer_name text, p_signer_capacity text, p_ip_hash text
) returns table (licence_id uuid, licence_ref text, licence_status text)
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.require_role_mfa((select b.org_id from public.books b where b.id = p_book));
  return query select * from app.licence_upload_core(p_book, p_version, p_path, p_document_sha256, p_territories, p_excluded,
    p_term_months, p_exclusive_months, p_subscription, p_cover, p_audio, p_signer_name, p_signer_capacity, p_ip_hash);
end $$;

-- ---------------------------------------------------------------------------
-- 4. Wrappers for the app.
-- ---------------------------------------------------------------------------
create or replace function public.role_mfa_status() returns table (required boolean, verified boolean)
language sql stable security invoker set search_path = '' as $$ select * from app.role_mfa_status() $$;
create or replace function public.mfa_passkey_open() returns boolean
language sql stable security invoker set search_path = '' as $$ select app.mfa_passkey_open() $$;

-- ---------------------------------------------------------------------------
-- 5. Execute. The cores are reachable only through the gated functions.
-- ---------------------------------------------------------------------------
revoke execute on function
  app.org_invite_core(uuid, text, text, uuid, text), app.org_invite_resend_core(uuid, text), app.org_invite_revoke_core(uuid),
  app.org_member_set_role_core(uuid, uuid, text), app.org_member_remove_core(uuid, uuid),
  app.org_seat_invite_core(uuid, text, text), app.org_seat_invite_resend_core(uuid, text), app.org_seat_invite_revoke_core(uuid),
  app.org_seat_release_core(uuid), app.org_join_link_create_core(uuid, text, int, int, text), app.org_join_link_revoke_core(uuid),
  app.org_billing_seat_change_check_core(uuid, int), app.org_licence_end_request_core(uuid), app.org_billing_end_allowed_core(uuid),
  app.price_choose_core(uuid, text, boolean),
  app.licence_accept_core(uuid, text, text, text[], text[], int, int, boolean, boolean, boolean, boolean, boolean, boolean, text, text, text),
  app.licence_upload_core(uuid, text, text, text, text[], text[], int, int, boolean, boolean, boolean, text, text, text)
  from public, anon, authenticated, service_role;

revoke execute on function
  app.session_mfa_verified(), app.role_mfa_required(uuid), app.require_role_mfa(uuid), app.role_mfa_status(), app.mfa_passkey_open(),
  app.org_invite(uuid, text, text, uuid, text), app.org_invite_resend(uuid, text), app.org_invite_revoke(uuid),
  app.org_member_set_role(uuid, uuid, text), app.org_member_remove(uuid, uuid),
  app.org_seat_invite(uuid, text, text), app.org_seat_invite_resend(uuid, text), app.org_seat_invite_revoke(uuid),
  app.org_seat_release(uuid), app.org_join_link_create(uuid, text, int, int, text), app.org_join_link_revoke(uuid),
  app.org_billing_seat_change_check(uuid, int), app.org_licence_end_request(uuid), app.org_billing_end_allowed(uuid),
  app.price_choose(uuid, text, boolean),
  app.licence_accept(uuid, text, text, text[], text[], int, int, boolean, boolean, boolean, boolean, boolean, boolean, text, text, text),
  app.licence_upload(uuid, text, text, text, text[], text[], int, int, boolean, boolean, boolean, text, text, text),
  public.role_mfa_status(), public.mfa_passkey_open()
  from public, anon;

-- Signed-in callers. Each core still checks the caller's role itself.
grant execute on function
  app.session_mfa_verified(), app.role_mfa_required(uuid), app.require_role_mfa(uuid), app.role_mfa_status(), app.mfa_passkey_open(),
  app.org_invite(uuid, text, text, uuid, text), app.org_invite_resend(uuid, text), app.org_invite_revoke(uuid),
  app.org_member_set_role(uuid, uuid, text), app.org_member_remove(uuid, uuid),
  app.org_seat_invite(uuid, text, text), app.org_seat_invite_resend(uuid, text), app.org_seat_invite_revoke(uuid),
  app.org_seat_release(uuid), app.org_join_link_create(uuid, text, int, int, text), app.org_join_link_revoke(uuid),
  app.org_billing_seat_change_check(uuid, int), app.org_licence_end_request(uuid), app.org_billing_end_allowed(uuid),
  app.price_choose(uuid, text, boolean),
  app.licence_accept(uuid, text, text, text[], text[], int, int, boolean, boolean, boolean, boolean, boolean, boolean, text, text, text),
  app.licence_upload(uuid, text, text, text, text[], text[], int, int, boolean, boolean, boolean, text, text, text),
  public.role_mfa_status(), public.mfa_passkey_open()
  to authenticated, service_role;
