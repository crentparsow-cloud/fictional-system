-- 0034 Role second factor, the follow-ups (F-143).
--
-- 0032 put app.require_role_mfa in front of the money and membership
-- changes that existed in 0030. 0031 was written at the same time and added
-- more, and one staff money check in 0030 was left out. This migration gates
-- them the same way:
--
--   app.org_billing_band_change_check  /org/billing: owner or finance moves a
--                                      church band (staff override in /admin)
--   app.org_cooling_off_done           /org/billing: the owner cancels inside
--                                      the cooling-off and the licence ends now
--   app.org_set_buyer_type             /admin: staff set consumer or business
--   app.org_billing_link_check         /admin: staff start Stripe billing
--
-- Not gated, because they change nothing: app.org_cooling_off_state (the
-- billing page reads it at any level; the cooling-off cancel already passes
-- app.org_billing_end_allowed, gated in 0032, before Stripe is touched),
-- app.org_invite_quota and app.org_roster_export. The service-role functions
-- in 0031 (outbox, reminders, the organiser's seat) have no signed-in caller.
--
-- Same pattern as 0032: each app.* definer is renamed to <name>_core and
-- loses its grants; a new app.<name> with the same signature runs the check
-- and calls the core. The public wrappers call app.<name> by name and pick
-- up the gate unchanged. An outsider passes the gate and is refused by the
-- core with its own error.
--
-- Depends on 0030, 0031 and 0032 (app.require_role_mfa).

-- ---------------------------------------------------------------------------
-- 1. Move the cores aside.
-- ---------------------------------------------------------------------------
alter function app.org_billing_band_change_check(uuid, text, text) rename to org_billing_band_change_check_core;
alter function app.org_cooling_off_done(uuid, int, text, text) rename to org_cooling_off_done_core;
alter function app.org_set_buyer_type(uuid, text, text) rename to org_set_buyer_type_core;
alter function app.org_billing_link_check(uuid) rename to org_billing_link_check_core;

-- ---------------------------------------------------------------------------
-- 2. Gated functions, same names and signatures as before.
-- ---------------------------------------------------------------------------

-- /org/billing: church bands (0031).
create or replace function app.org_billing_band_change_check(p_licence uuid, p_plan text, p_reason text default null) returns text
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.require_role_mfa((select l.org_id from public.org_licences l where l.id = p_licence));
  return app.org_billing_band_change_check_core(p_licence, p_plan, p_reason);
end $$;

-- /org/billing: the cooling-off cancel (0031). The server asks
-- app.org_billing_end_allowed first, so a refused session never reaches
-- Stripe; this keeps the direct API path closed too.
create or replace function app.org_cooling_off_done(p_licence uuid, p_refund_minor int, p_currency text, p_refund_state text)
returns boolean
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.require_role_mfa((select l.org_id from public.org_licences l where l.id = p_licence));
  return app.org_cooling_off_done_core(p_licence, p_refund_minor, p_currency, p_refund_state);
end $$;

-- /admin: staff only. Staff need a second factor wherever they act.
create or replace function app.org_set_buyer_type(p_org uuid, p_type text, p_reason text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.require_role_mfa(p_org);
  return app.org_set_buyer_type_core(p_org, p_type, p_reason);
end $$;

create or replace function app.org_billing_link_check(p_licence uuid)
returns table (org_id uuid, kind text, seats int, legal_name text, display_name text, country text,
               billing_name text, billing_email text, vat_number text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_role_mfa((select l.org_id from public.org_licences l where l.id = p_licence));
  return query select * from app.org_billing_link_check_core(p_licence);
end $$;

-- ---------------------------------------------------------------------------
-- 3. Execute. The cores are reachable only through the gated functions.
-- ---------------------------------------------------------------------------
revoke execute on function
  app.org_billing_band_change_check_core(uuid, text, text), app.org_cooling_off_done_core(uuid, int, text, text),
  app.org_set_buyer_type_core(uuid, text, text), app.org_billing_link_check_core(uuid)
  from public, anon, authenticated, service_role;

revoke execute on function
  app.org_billing_band_change_check(uuid, text, text), app.org_cooling_off_done(uuid, int, text, text),
  app.org_set_buyer_type(uuid, text, text), app.org_billing_link_check(uuid)
  from public, anon;

-- Signed-in callers, as 0030 and 0031 granted them. Each core still checks
-- the caller's role itself.
grant execute on function
  app.org_billing_band_change_check(uuid, text, text), app.org_cooling_off_done(uuid, int, text, text),
  app.org_set_buyer_type(uuid, text, text), app.org_billing_link_check(uuid)
  to authenticated;
