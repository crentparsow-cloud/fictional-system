-- 0041 Shared membership: one subscription for two people (item 6.1, 13.10).
--
-- A buyer pays for one Stripe subscription on the "two people" plan
-- (member_two_month). The buyer shares an invitation link through their own
-- channels; Akana never emails the invitee. One invited member accepts it on
-- a page that says what they get and that the buyer can remove them.
--
-- Depends on 0001 to 0039. Nothing earlier is edited. Five earlier functions
-- are replaced with their bodies copied and one small change each; every
-- change is marked "0041":
--   app.upsert_subscription      (0009)  accepts the new plan id
--   app.due_terms_reminders      (0011)  the DMCC six-month reminder also
--                                        covers the new plan, to the buyer only
--   app.record_checkout_consent  (0019)  accepts the new plan id
--   app.close_pool_period        (0030)  the member's steps count toward the
--                                        buyer's single share
--   app.sync_membership_entitlement (0009) keeps its guard, delegates to a
--                                        core that also follows seats
--
-- The shape of trust:
--   * The only thing two people share is the entitlement, which is one row
--     per person in public.entitlements, written by the same sync as before.
--     Answers, enrolments, progress and settings are already keyed by user id
--     with RLS on user id (0001, 0003). Nothing here adds a path between
--     them, and supabase/tests/0041_shared_membership.sql proves member A
--     cannot read member B's rows in either direction.
--   * public.membership_seats holds the link between a subscription and its
--     invited member. Neither side can read the other's identity: the column
--     grants leave out member_user_id, owner_user_id and token_hash. The
--     buyer reads the seat's state through public.my_shared_seat(), the
--     member through their own row.
--   * The invitation token is made by the server and only its sha256 hash is
--     stored. The raw token exists in the link the buyer copies, and nowhere
--     in the database.
--   * The buyer owns the subscription: DMCC reminders, cooling-off refund and
--     the Stripe portal all stay with the buyer. The member never has a
--     subscription row and never pays.
--   * Pool income counts once. The receipt is the buyer's only (0021
--     record_membership_receipt reads the invoice, which has one user). The
--     member's completed steps count toward the buyer's share, inside the
--     seat's dates.
--   * When the subscription ends, every seat on it ends and the member's
--     entitlement lapses in the same transaction (trigger on subscriptions).
--     Removing a member, or a member leaving, lapses their access at once.
--     Cancelling at period end ends both people at period end, as before.
--
-- PLACEHOLDER: the price. member_two_month is seeded at GBP 11.99 a month,
-- about 1.5 times the single monthly price (GBP 7.99), VAT inclusive, for the
-- GBP market only. Crent sets the real figure (D1 to D5): change the row and
-- the Stripe price, not the code.

-- ---------------------------------------------------------------------------
-- 1. The plan point
-- ---------------------------------------------------------------------------
insert into public.price_points (id, kind, amounts, active) values
  ('member_two_month', 'membership', '{"GBP": 1199}'::jsonb, true)
on conflict (id) do nothing;

alter table public.subscriptions drop constraint subscriptions_plan_is_membership;
alter table public.subscriptions add constraint subscriptions_plan_is_membership
  check (plan is null or plan in ('member_month','member_year','member_two_month'));

alter table public.checkout_consents drop constraint checkout_consents_plan_check;
alter table public.checkout_consents add constraint checkout_consents_plan_check
  check (plan is null or plan in ('member_month','member_year','member_two_month'));

drop index public.subscriptions_terms_reminder_idx;
create index subscriptions_terms_reminder_idx on public.subscriptions(current_period_end)
  where plan in ('member_month','member_two_month') and status in ('active','trialing');

-- ---------------------------------------------------------------------------
-- 2. Seats
-- ---------------------------------------------------------------------------
create table public.membership_seats (
  id               uuid primary key default gen_random_uuid(),
  subscription_id  uuid not null references public.subscriptions(id) on delete cascade,
  owner_user_id    uuid not null references auth.users(id) on delete cascade,
  tenant_id        uuid not null references public.tenants(id),
  member_user_id   uuid references auth.users(id) on delete cascade,
  status           text not null default 'invited' check (status in ('invited','active','removed','left','ended')),
  token_hash       text unique check (token_hash is null or token_hash ~ '^[0-9a-f]{64}$'),
  invited_at       timestamptz not null default now(),
  expires_at       timestamptz not null default now() + interval '14 days',
  accepted_at      timestamptz,
  ended_at         timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint membership_seats_shape check (
    (status = 'invited' and member_user_id is null and accepted_at is null and ended_at is null and token_hash is not null)
    or (status = 'active' and member_user_id is not null and accepted_at is not null and ended_at is null and token_hash is null)
    or (status in ('removed','left','ended') and ended_at is not null and token_hash is null)),
  constraint membership_seats_not_self check (member_user_id is null or member_user_id <> owner_user_id)
);
-- One open seat per subscription, and one active seat per person per tenant.
create unique index membership_seats_one_open on public.membership_seats(subscription_id) where status in ('invited','active');
create unique index membership_seats_one_per_member on public.membership_seats(member_user_id, tenant_id) where status = 'active';
create index membership_seats_member_idx on public.membership_seats(member_user_id, tenant_id);
create index membership_seats_owner_idx on public.membership_seats(owner_user_id);
create trigger membership_seats_touch before update on public.membership_seats for each row execute function app.touch_updated_at();

alter table public.membership_seats enable row level security;
revoke all on public.membership_seats from anon, authenticated;
-- Column grants leave out member_user_id, owner_user_id and token_hash: the
-- buyer and the member never see each other's account.
grant select (id, subscription_id, tenant_id, status, invited_at, expires_at, accepted_at, ended_at)
  on public.membership_seats to authenticated;
grant select, insert, update on public.membership_seats to service_role;
create policy membership_seats_read on public.membership_seats for select to authenticated
  using (owner_user_id = (select app.uid()) or member_user_id = (select app.uid()) or (select app.is_staff()));

-- ---------------------------------------------------------------------------
-- 3. The entitlement sync, with seats. The body is 0009's, as a core that
-- the guarded wrapper and the seat functions share. The user's own
-- subscriptions count as before; so does every seat they hold. A seat that
-- is not active counts as a cancelled subscription, so a removed member's
-- entitlement lapses rather than being left alone.
-- ---------------------------------------------------------------------------
create or replace function app.membership_entitlement_apply(p_user uuid, p_tenant uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_any     boolean;
  v_live    boolean;
  v_open    boolean;
  v_ends    timestamptz;
  v_id      uuid;
  v_before  public.entitlements%rowtype;
begin
  if p_user is null or p_tenant is null then return 'none'; end if;

  select count(*) > 0,
         bool_or(app.subscription_is_live(x.status, x.past_due_since)),
         bool_or(x.status in ('active','trialing')),
         max(coalesce(x.past_due_since, now()) + app.membership_grace()) filter (where x.status = 'past_due')
    into v_any, v_live, v_open, v_ends
    from (
      select s.status, s.past_due_since
        from public.subscriptions s
       where s.user_id = p_user and s.tenant_id = p_tenant
      union all
      -- 0041: a seat on someone else's subscription
      select case when m.status = 'active' then s.status else 'canceled' end,
             case when m.status = 'active' then s.past_due_since end
        from public.membership_seats m
        join public.subscriptions s on s.id = m.subscription_id
       where m.member_user_id = p_user and m.tenant_id = p_tenant
    ) x;

  if not v_any then return 'none'; end if;

  select * into v_before from public.entitlements
   where user_id = p_user and tenant_id = p_tenant and workbook_id is null and source = 'membership'
   for update;

  if coalesce(v_live, false) then
    if v_open then v_ends := null; end if;
    if v_before.id is null then
      insert into public.entitlements (user_id, tenant_id, workbook_id, source, status, starts_at, ends_at)
      values (p_user, p_tenant, null, 'membership', 'active', now(), v_ends)
      returning id into v_id;
    elsif v_before.status <> 'active' or v_before.ends_at is distinct from v_ends then
      update public.entitlements
         set status = 'active', ends_at = v_ends, starts_at = least(starts_at, now())
       where id = v_before.id;
      v_id := v_before.id;
    else
      return 'active';
    end if;
    perform app.audit('commerce.membership_active', 'user:' || p_user::text, null, p_tenant, null,
      case when v_before.id is null then null else jsonb_build_object('status', v_before.status, 'ends_at', v_before.ends_at) end,
      jsonb_build_object('status', 'active', 'ends_at', v_ends, 'entitlement_id', v_id));
    return 'active';
  end if;

  if v_before.id is not null and v_before.status = 'active' then
    update public.entitlements
       set status = 'lapsed', ends_at = least(coalesce(ends_at, now()), now())
     where id = v_before.id;
    perform app.audit('commerce.membership_lapsed', 'user:' || p_user::text, null, p_tenant, null,
      jsonb_build_object('status', v_before.status, 'ends_at', v_before.ends_at),
      jsonb_build_object('status', 'lapsed', 'entitlement_id', v_before.id));
  end if;
  return 'lapsed';
end $$;

create or replace function app.sync_membership_entitlement(p_user uuid, p_tenant uuid) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if not (app.is_service_role() or app.is_platform(array['owner','editor'])) then
    raise exception 'only the service role or platform owners and editors sync memberships' using errcode = 'insufficient_privilege';
  end if;
  return app.membership_entitlement_apply(p_user, p_tenant);
end $$;

-- ---------------------------------------------------------------------------
-- 4. Seats follow their subscription. After any change to a subscription row
-- the open seat is brought in step: a finished subscription ends the seat,
-- and the member's entitlement is re-synced either way (this also moves the
-- grace period through to the member). Before a delete, the seat is ended so
-- the member's access lapses before the cascade removes the row.
-- ---------------------------------------------------------------------------
create or replace function app.sync_seat_members(p_subscription uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s public.subscriptions%rowtype;
  m public.membership_seats%rowtype;
begin
  select * into s from public.subscriptions where id = p_subscription;
  if not found then return; end if;
  for m in select * from public.membership_seats
            where subscription_id = p_subscription and status in ('invited','active') for update loop
    if s.status in ('canceled','incomplete_expired') or s.ended_at is not null then
      update public.membership_seats
         set status = case when m.status = 'active' then 'ended' else 'removed' end,
             token_hash = null, ended_at = now()
       where id = m.id;
      perform app.audit('commerce.seat_ended', 'seat:' || m.id::text, 'subscription ended', s.tenant_id, null,
        jsonb_build_object('status', m.status), jsonb_build_object('status', 'ended'));
    end if;
    if m.member_user_id is not null then
      perform app.membership_entitlement_apply(m.member_user_id, m.tenant_id);
    end if;
  end loop;
end $$;

create or replace function app.subscriptions_seat_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    update public.membership_seats set status = 'ended', token_hash = null, ended_at = now()
     where subscription_id = old.id and status = 'active';
    perform app.membership_entitlement_apply(m.member_user_id, m.tenant_id)
       from public.membership_seats m where m.subscription_id = old.id and m.member_user_id is not null;
    update public.membership_seats set status = 'removed', token_hash = null, ended_at = now()
     where subscription_id = old.id and status = 'invited';
    return old;
  end if;
  perform app.sync_seat_members(new.id);
  return new;
end $$;
create trigger subscriptions_seats after insert or update on public.subscriptions
  for each row execute function app.subscriptions_seat_trigger();
create trigger subscriptions_seats_delete before delete on public.subscriptions
  for each row execute function app.subscriptions_seat_trigger();

-- ---------------------------------------------------------------------------
-- 5. Seat functions. All run as the signed-in person (app.uid()).
--   create    the buyer makes or refreshes the invitation. The caller passes
--             the sha256 of a token the server made. A fresh call replaces an
--             unused link, so the old link stops working. A taken seat refuses.
--   accept    the invitee, signed in with their own account.
--   remove    the buyer removes the member or withdraws the invitation.
--   leave     the member leaves.
-- Expected outcomes come back as text; errors that mean "this cannot be done"
-- raise with the codes AKS01 (sign in), AKS02 (no two-person plan), AKS03
-- (plan is ending), AKS04 (seat is taken).
-- ---------------------------------------------------------------------------
create or replace function app.seat_create_invite(p_token_hash text, p_tenant uuid) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := app.uid();
  s     public.subscriptions%rowtype;
  m     public.membership_seats%rowtype;
begin
  if v_uid is null then raise exception 'sign in to invite someone' using errcode = 'AKS01'; end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid invitation' using errcode = 'check_violation';
  end if;
  select * into s from public.subscriptions
   where user_id = v_uid and tenant_id = p_tenant and plan = 'member_two_month' and status in ('active','trialing')
   order by created_at desc limit 1 for update;
  if not found then raise exception 'you do not have a two-person membership' using errcode = 'AKS02'; end if;
  if s.cancel_at_period_end or s.cancel_at is not null then
    raise exception 'your membership is ending and cannot take a new member' using errcode = 'AKS03';
  end if;
  select * into m from public.membership_seats where subscription_id = s.id and status in ('invited','active') for update;
  if found and m.status = 'active' then
    raise exception 'the second place is already taken' using errcode = 'AKS04';
  end if;
  if found then
    update public.membership_seats set token_hash = p_token_hash, invited_at = now(), expires_at = now() + interval '14 days'
     where id = m.id;
    return m.id;
  end if;
  insert into public.membership_seats (subscription_id, owner_user_id, tenant_id, status, token_hash)
  values (s.id, v_uid, p_tenant, 'invited', p_token_hash)
  returning id into m.id;
  perform app.audit('commerce.seat_invited', 'seat:' || m.id::text, null, p_tenant, null, null, jsonb_build_object('status', 'invited'));
  return m.id;
end $$;

-- 'joined', 'invalid' (no such link, or already used or withdrawn), 'expired',
-- 'own_link' (the buyer opened their own link), 'has_membership' (the person
-- already pays for a membership), 'in_seat' (they already hold a seat),
-- 'unavailable' (the buyer's membership is no longer running).
create or replace function app.seat_accept(p_token_hash text, p_tenant uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := app.uid();
  m     public.membership_seats%rowtype;
  s     public.subscriptions%rowtype;
begin
  if v_uid is null then raise exception 'sign in to join' using errcode = 'AKS01'; end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then return 'invalid'; end if;
  select * into m from public.membership_seats
   where token_hash = p_token_hash and status = 'invited' and tenant_id = p_tenant for update;
  if not found then return 'invalid'; end if;
  if m.expires_at <= now() then return 'expired'; end if;
  if m.owner_user_id = v_uid then return 'own_link'; end if;
  select * into s from public.subscriptions where id = m.subscription_id;
  if not found or s.status not in ('active','trialing') or s.cancel_at_period_end or s.cancel_at is not null then
    return 'unavailable';
  end if;
  if exists (select 1 from public.subscriptions x
              where x.user_id = v_uid and x.tenant_id = p_tenant and app.subscription_is_live(x.status, x.past_due_since)) then
    return 'has_membership';
  end if;
  if exists (select 1 from public.membership_seats x
              where x.member_user_id = v_uid and x.tenant_id = p_tenant and x.status = 'active') then
    return 'in_seat';
  end if;
  update public.membership_seats
     set status = 'active', member_user_id = v_uid, accepted_at = now(), token_hash = null
   where id = m.id;
  perform app.audit('commerce.seat_joined', 'seat:' || m.id::text, null, p_tenant, null,
    jsonb_build_object('status', 'invited'), jsonb_build_object('status', 'active'));
  perform app.membership_entitlement_apply(v_uid, p_tenant);
  return 'joined';
end $$;

-- 'removed', 'withdrawn' (an unused invitation), or 'none'.
create or replace function app.seat_remove(p_seat uuid default null) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := app.uid();
  m     public.membership_seats%rowtype;
begin
  if v_uid is null then raise exception 'sign in first' using errcode = 'AKS01'; end if;
  select * into m from public.membership_seats
   where owner_user_id = v_uid and status in ('invited','active') and (p_seat is null or id = p_seat)
   order by created_at desc limit 1 for update;
  if not found then return 'none'; end if;
  update public.membership_seats
     set status = 'removed', token_hash = null, ended_at = now()
   where id = m.id;
  perform app.audit('commerce.seat_removed', 'seat:' || m.id::text, null, m.tenant_id, null,
    jsonb_build_object('status', m.status), jsonb_build_object('status', 'removed'));
  if m.member_user_id is not null then
    perform app.membership_entitlement_apply(m.member_user_id, m.tenant_id);
    return 'removed';
  end if;
  return 'withdrawn';
end $$;

create or replace function app.seat_leave() returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := app.uid();
  m     public.membership_seats%rowtype;
begin
  if v_uid is null then raise exception 'sign in first' using errcode = 'AKS01'; end if;
  select * into m from public.membership_seats where member_user_id = v_uid and status = 'active' for update;
  if not found then return 'none'; end if;
  update public.membership_seats set status = 'left', ended_at = now() where id = m.id;
  perform app.audit('commerce.seat_left', 'seat:' || m.id::text, null, m.tenant_id, null,
    jsonb_build_object('status', 'active'), jsonb_build_object('status', 'left'));
  perform app.membership_entitlement_apply(v_uid, m.tenant_id);
  return 'left';
end $$;

-- What the buyer sees about the second place: its state and dates, never who
-- holds it. One row, or none when there is no two-person membership.
create or replace function app.my_shared_seat(p_tenant uuid)
returns table (seat_id uuid, seat_status text, invited_at timestamptz, expires_at timestamptz, accepted_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := app.uid();
begin
  if v_uid is null then return; end if;
  return query
    select m.id, m.status, m.invited_at, m.expires_at, m.accepted_at
      from public.subscriptions s
      left join public.membership_seats m on m.subscription_id = s.id and m.status in ('invited','active')
     where s.user_id = v_uid and s.tenant_id = p_tenant and s.plan = 'member_two_month' and s.status in ('active','trialing','past_due')
     order by s.created_at desc limit 1;
end $$;

-- The invitation page's read, before anyone is signed in: whether the link is
-- usable. Service role only. It names no one.
create or replace function app.seat_invite_state(p_token_hash text, p_tenant uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare m public.membership_seats%rowtype;
begin
  if not app.is_service_role() then
    raise exception 'only the service role reads invitations' using errcode = 'insufficient_privilege';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then return 'invalid'; end if;
  select * into m from public.membership_seats where token_hash = p_token_hash and tenant_id = p_tenant;
  if not found or m.status <> 'invited' then return 'invalid'; end if;
  if m.expires_at <= now() then return 'expired'; end if;
  return 'open';
end $$;

-- ---------------------------------------------------------------------------
-- 6. RPC wrappers (security invoker) and grants
-- ---------------------------------------------------------------------------
create or replace function public.seat_create_invite(p_token_hash text, p_tenant uuid) returns uuid
language sql volatile security invoker set search_path = '' as $$ select app.seat_create_invite(p_token_hash, p_tenant) $$;
create or replace function public.seat_accept(p_token_hash text, p_tenant uuid) returns text
language sql volatile security invoker set search_path = '' as $$ select app.seat_accept(p_token_hash, p_tenant) $$;
create or replace function public.seat_remove(p_seat uuid default null) returns text
language sql volatile security invoker set search_path = '' as $$ select app.seat_remove(p_seat) $$;
create or replace function public.seat_leave() returns text
language sql volatile security invoker set search_path = '' as $$ select app.seat_leave() $$;
create or replace function public.my_shared_seat(p_tenant uuid)
returns table (seat_id uuid, seat_status text, invited_at timestamptz, expires_at timestamptz, accepted_at timestamptz)
language sql stable security invoker set search_path = '' as $$ select * from app.my_shared_seat(p_tenant) $$;
create or replace function public.seat_invite_state(p_token_hash text, p_tenant uuid) returns text
language sql stable security invoker set search_path = '' as $$ select app.seat_invite_state(p_token_hash, p_tenant) $$;

revoke execute on function
  app.membership_entitlement_apply(uuid, uuid), app.sync_seat_members(uuid), app.subscriptions_seat_trigger(),
  app.seat_create_invite(text, uuid), app.seat_accept(text, uuid), app.seat_remove(uuid), app.seat_leave(),
  app.my_shared_seat(uuid), app.seat_invite_state(text, uuid)
  from public, anon;
revoke execute on function
  public.seat_create_invite(text, uuid), public.seat_accept(text, uuid), public.seat_remove(uuid), public.seat_leave(),
  public.my_shared_seat(uuid), public.seat_invite_state(text, uuid)
  from public, anon, authenticated;
grant execute on function
  app.seat_create_invite(text, uuid), app.seat_accept(text, uuid), app.seat_remove(uuid), app.seat_leave(),
  app.my_shared_seat(uuid),
  public.seat_create_invite(text, uuid), public.seat_accept(text, uuid), public.seat_remove(uuid), public.seat_leave(),
  public.my_shared_seat(uuid)
  to authenticated;
grant execute on function app.seat_invite_state(text, uuid), public.seat_invite_state(text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 7. Replaced functions, bodies copied from the migrations named, one marked
-- change each. CREATE OR REPLACE keeps the grants made earlier.
-- ---------------------------------------------------------------------------
-- 0019 record_checkout_consent: the plan list gains member_two_month.
create or replace function app.record_checkout_consent(
  p_kind text, p_version text, p_tenant uuid default null, p_workbook uuid default null, p_plan text default null
) returns bigint
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid   uuid := app.uid();
  v_at    timestamptz := now();
  v_count int;
  v_id    bigint;
begin
  if v_uid is null then
    raise exception 'sign in to start checkout' using errcode = 'AKC01';
  end if;
  if p_kind is null or p_kind not in ('workbook','membership') then
    raise exception 'consent_invalid: kind' using errcode = 'AKC03';
  end if;
  if not exists (select 1 from public.checkout_consent_wordings w where w.kind = p_kind and w.version = p_version) then
    raise exception 'unknown checkout consent wording' using errcode = 'AKC02';
  end if;
  if p_kind = 'workbook' then
    if p_plan is not null then
      raise exception 'consent_invalid: plan' using errcode = 'AKC03';
    end if;
    if p_workbook is null or not exists (select 1 from public.workbooks w where w.id = p_workbook) then
      raise exception 'consent_invalid: workbook' using errcode = 'AKC03';
    end if;
  else
    if p_plan is null or p_plan not in ('member_month','member_year','member_two_month') then
      raise exception 'consent_invalid: plan' using errcode = 'AKC03';
    end if;
    if p_workbook is not null then
      raise exception 'consent_invalid: workbook' using errcode = 'AKC03';
    end if;
  end if;
  if p_tenant is not null and not exists (select 1 from public.tenants t where t.id = p_tenant) then
    raise exception 'consent_invalid: tenant' using errcode = 'AKC03';
  end if;

  select count(*) into v_count from public.checkout_consents c
   where c.user_id = v_uid and c.consented_at > v_at - interval '1 hour';
  if v_count >= 30 then
    raise exception 'too many checkouts, try again later' using errcode = 'AKC29';
  end if;

  insert into public.checkout_consents (user_id, kind, version, tenant_id, workbook_id, plan, consented_at)
  values (v_uid, p_kind, p_version, p_tenant, p_workbook, p_plan, v_at)
  returning id into v_id;
  return v_id;
end $$;

-- 0009 upsert_subscription: the plan list gains member_two_month.
create or replace function app.upsert_subscription(
  p_subscription       text,
  p_customer           text,
  p_user               uuid,
  p_tenant             uuid,
  p_status             text,
  p_plan               text,
  p_price              text,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_cancel_at          timestamptz,
  p_canceled_at        timestamptz,
  p_ended_at           timestamptz,
  p_observed_at        timestamptz
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  s        public.subscriptions%rowtype;
  v_user   uuid := p_user;
  v_tenant uuid := p_tenant;
  v_plan   text := case when p_plan in ('member_month','member_year','member_two_month') then p_plan else null end;
  v_pds    timestamptz;
begin
  if not app.is_service_role() then
    raise exception 'only the service role records subscriptions' using errcode = 'insufficient_privilege';
  end if;
  if p_observed_at is null then
    raise exception 'observed_at is required' using errcode = 'null_value_not_allowed';
  end if;

  select * into s from public.subscriptions where stripe_subscription_id = p_subscription for update;

  if not found then
    if v_user is null or v_tenant is null then
      select x.user_id, x.tenant_id into v_user, v_tenant from public.subscriptions x
       where x.stripe_customer_id = p_customer order by x.created_at desc limit 1;
    end if;
    if v_user is null or v_tenant is null
       or not exists (select 1 from auth.users u where u.id = v_user)
       or not exists (select 1 from public.tenants t where t.id = v_tenant) then
      return 'unlinked';
    end if;
    insert into public.subscriptions (user_id, tenant_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, plan, status,
      current_period_end, cancel_at_period_end, cancel_at, canceled_at, ended_at, past_due_since, observed_at)
    values (v_user, v_tenant, p_customer, p_subscription, p_price, v_plan, p_status,
      p_current_period_end, coalesce(p_cancel_at_period_end, false), p_cancel_at, p_canceled_at, p_ended_at,
      case when p_status = 'past_due' then p_observed_at end, p_observed_at)
    returning * into s;
    perform app.audit('commerce.subscription_recorded', 'subscription:' || p_subscription, null, v_tenant, null, null,
      jsonb_build_object('status', p_status, 'plan', v_plan));
    perform app.sync_membership_entitlement(s.user_id, s.tenant_id);
    return 'applied';
  end if;

  if p_observed_at < s.observed_at then
    return 'stale';
  end if;

  v_pds := case
    when p_status = 'past_due' then coalesce(s.past_due_since, p_observed_at)
    else null end;

  if s.status = p_status
     and s.stripe_price_id is not distinct from coalesce(p_price, s.stripe_price_id)
     and s.plan is not distinct from coalesce(v_plan, s.plan)
     and s.current_period_end is not distinct from p_current_period_end
     and s.cancel_at_period_end = coalesce(p_cancel_at_period_end, false)
     and s.cancel_at is not distinct from p_cancel_at
     and s.canceled_at is not distinct from p_canceled_at
     and s.ended_at is not distinct from p_ended_at then
    update public.subscriptions set observed_at = p_observed_at where id = s.id and observed_at < p_observed_at;
    -- the grace clock may have run out since the last sync
    perform app.sync_membership_entitlement(s.user_id, s.tenant_id);
    return 'unchanged';
  end if;

  update public.subscriptions
     set status = p_status,
         stripe_price_id = coalesce(p_price, stripe_price_id),
         plan = coalesce(v_plan, plan),
         current_period_end = p_current_period_end,
         cancel_at_period_end = coalesce(p_cancel_at_period_end, false),
         cancel_at = p_cancel_at,
         canceled_at = p_canceled_at,
         ended_at = p_ended_at,
         past_due_since = v_pds,
         observed_at = p_observed_at
   where id = s.id;

  if s.status <> p_status then
    perform app.audit('commerce.subscription_status', 'subscription:' || p_subscription, null, s.tenant_id, null,
      jsonb_build_object('status', s.status), jsonb_build_object('status', p_status));
  end if;
  perform app.sync_membership_entitlement(s.user_id, s.tenant_id);
  return 'applied';
end $$;

-- 0011 due_terms_reminders: the plan filter gains member_two_month. The join
-- is to the subscription's owner, so only the buyer is ever reminded.
create or replace function app.due_terms_reminders(p_now timestamptz default now())
returns table (
  stripe_subscription_id text,
  user_id                uuid,
  email                  text,
  current_period_end     timestamptz,
  reminder_anchor_at     timestamptz,
  amount_minor           integer,
  currency               char(3)
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_now timestamptz := coalesce(p_now, now());
begin
  if not app.is_service_role() then
    raise exception 'only the service role reads due reminders' using errcode = 'insufficient_privilege';
  end if;
  return query
    select s.stripe_subscription_id,
           s.user_id,
           u.email::text,
           s.current_period_end,
           coalesce(s.last_terms_reminder_at, s.created_at),
           i.amount_minor,
           i.currency
      from public.subscriptions s
      join auth.users u on u.id = s.user_id
      left join lateral (
        select x.amount_minor, x.currency
          from public.subscription_invoices x
         where x.stripe_subscription_id = s.stripe_subscription_id and x.status = 'paid'
         order by coalesce(x.paid_at, x.created_at) desc
         limit 1) i on true
     where s.plan in ('member_month','member_two_month')
       and s.status in ('active','trialing')
       and not s.cancel_at_period_end
       and s.cancel_at is null
       and s.ended_at is null
       and s.current_period_end >= v_now + interval '3 days'
       and s.current_period_end <= v_now + interval '14 days'
       and coalesce(s.last_terms_reminder_at, s.created_at) <= v_now - interval '6 months'
       and u.email is not null
       and not exists (
         select 1 from public.account_deletion_requests d
          where d.user_id = s.user_id and d.cancelled_at is null and d.completed_at is null)
     order by s.current_period_end, s.stripe_subscription_id;
end $$;

-- 0030 close_pool_period: the reader-membership steps insert is the only change.
create or replace function app.close_pool_period(p_tenant uuid, p_period text, p_currency text, p_livemode boolean)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  cfg      public.royalty_config := app.royalty_config();
  v_id     uuid;
  v_cur    text := upper(p_currency);
  v_from   timestamptz;
  v_to     timestamptz;
  v_net    bigint;
  v_pool   bigint;
  v_alloc  bigint;
  v_subs   int;
  v_active int;
begin
  if not (app.is_service_role() or app.is_money_staff()) then
    raise exception 'only the service role or owner and finance staff close the pool' using errcode = 'insufficient_privilege';
  end if;
  if p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'period must be YYYY-MM' using errcode = 'check_violation';
  end if;
  select id into v_id from public.pool_periods
   where tenant_id = p_tenant and period = p_period and currency = v_cur and livemode = p_livemode;
  if v_id is not null then return v_id; end if;
  v_from := app.month_start(p_period);
  v_to := app.month_start(app.month_after(p_period));
  if now() < v_to + make_interval(days => cfg.refund_window_days) then
    raise exception 'the pool for % closes after the refund window', p_period using errcode = 'object_not_in_prerequisite_state';
  end if;

  -- 0030: one row per share. licence_id is null for a reader's membership.
  create temp table if not exists pg_temp.pool_net30 (user_id uuid, licence_id uuid, source text, net bigint) on commit drop;
  create temp table if not exists pg_temp.pool_steps30 (user_id uuid, licence_id uuid, workbook_id uuid, steps int) on commit drop;
  create temp table if not exists pg_temp.pool_lic30 (licence_id uuid, kind text, seats int, net bigint, holders int) on commit drop;
  truncate pg_temp.pool_net30, pg_temp.pool_steps30, pg_temp.pool_lic30;

  -- Each subscriber's own net receipts in this pool month (refunds and fee
  -- corrections in the month included). Deleted readers drop out: their
  -- money stays unallocated.
  insert into pg_temp.pool_net30 (user_id, licence_id, source, net)
  select x.user_id, null, 'reader_membership',
         sum(x.gross_minor - x.tax_minor - case when cfg.fee_treatment = 'deduct' then coalesce(x.fee_minor, 0) else 0 end)
    from public.royalty_receipts x
   where x.source = 'membership' and x.tenant_id = p_tenant and x.period = p_period and x.currency = v_cur and x.livemode = p_livemode
   group by x.user_id;
  select coalesce(sum(greatest(net, 0)), 0) into v_net from pg_temp.pool_net30;

  -- 0030: each licence's net receipts in the month, and its seat holders.
  insert into pg_temp.pool_lic30 (licence_id, kind, seats, net, holders)
  select l.id, l.kind, l.seats_purchased,
         sum(x.gross_minor - x.tax_minor - case when cfg.fee_treatment = 'deduct' then coalesce(x.fee_minor, 0) else 0 end),
         (select count(distinct s.user_id)::int from public.org_seats s
           where s.licence_id = l.id and s.claimed_at < v_to and (s.released_at is null or s.released_at >= v_from))
    from public.royalty_receipts x
    join public.org_licences l on l.id = x.org_licence_id
   where x.source = 'org_licence' and x.tenant_id = p_tenant and x.period = p_period and x.currency = v_cur and x.livemode = p_livemode
     and l.kind <> 'pilot'
   group by l.id, l.kind, l.seats_purchased;
  select v_net + coalesce(sum(greatest(net, 0)), 0) into v_net from pg_temp.pool_lic30;

  insert into pg_temp.pool_net30 (user_id, licence_id, source, net)
  select h.user_id, c.licence_id, app.org_income_source(c.kind),
         floor(greatest(c.net, 0)::numeric / case when c.kind = 'church' then c.holders else greatest(c.seats, c.holders) end)
    from pg_temp.pool_lic30 c
    join (select distinct s.licence_id, s.user_id from public.org_seats s
           where s.claimed_at < v_to and (s.released_at is null or s.released_at >= v_from)) h on h.licence_id = c.licence_id
   where c.holders > 0 and c.net > 0;

  v_pool := floor(v_net * cfg.pool_share_author);

  -- Completed steps per subscriber per membership workbook, capped.
  -- 0041: on a two-person membership the invited member's steps count toward
  -- the buyer's share, while their seat was open. The buyer is the one
  -- subscriber (one receipt, so the money counts once); the pair share one
  -- cap per title. A step both people did counts once for each person.
  insert into pg_temp.pool_steps30 (user_id, licence_id, workbook_id, steps)
  select p.payer, null, p.workbook_id, least(count(distinct p.step_key), cfg.pool_step_cap)::int
    from (
      select coalesce(m.owner_user_id, e.user_id) as payer, e.workbook_id, e.user_id::text || ':' || pe.ref as step_key
        from public.progress_events pe
        join public.enrolments e on e.id = pe.enrolment_id
        join public.workbooks w on w.id = e.workbook_id
        left join public.membership_seats m
               on m.member_user_id = e.user_id and m.tenant_id = e.tenant_id
              and m.accepted_at <= pe.at and (m.ended_at is null or pe.at < m.ended_at)
       where pe.kind = 'step_done' and pe.ref is not null and pe.at >= v_from and pe.at < v_to
         and e.tenant_id = p_tenant and w.in_membership and not w.is_demo) p
   where p.payer in (select n.user_id from pg_temp.pool_net30 n where n.licence_id is null and n.user_id is not null and n.net > 0)
   group by p.payer, p.workbook_id;

  -- 0030: a seat holder's steps on titles in the licence's scope, while their
  -- seat was open and inside the licence's dates, capped the same way.
  insert into pg_temp.pool_steps30 (user_id, licence_id, workbook_id, steps)
  select e.user_id, n.licence_id, e.workbook_id, least(count(distinct pe.ref), cfg.pool_step_cap)::int
    from pg_temp.pool_net30 n
    join public.org_licences l on l.id = n.licence_id
    join public.enrolments e on e.user_id = n.user_id and e.tenant_id = p_tenant
    join public.workbooks w on w.id = e.workbook_id
    join public.progress_events pe on pe.enrolment_id = e.id
   where n.licence_id is not null and n.net > 0
     and pe.kind = 'step_done' and pe.ref is not null and pe.at >= v_from and pe.at < v_to
     and pe.at >= l.starts_at and pe.at < coalesce(l.ended_at, l.ends_at)
     and not w.is_demo and app.org_licence_scope_has(l.id, w.id)
     and exists (select 1 from public.org_seats s where s.licence_id = l.id and s.user_id = n.user_id
                  and pe.at >= s.claimed_at and (s.released_at is null or pe.at < s.released_at))
   group by e.user_id, n.licence_id, e.workbook_id;

  select count(*) into v_subs from pg_temp.pool_net30 where user_id is not null and net > 0;
  select count(*) into v_active from (
    select s.user_id, s.licence_id from pg_temp.pool_steps30 s group by s.user_id, s.licence_id
    having sum(s.steps) >= greatest(cfg.pool_activity_floor, 1)) a;

  insert into public.pool_periods (tenant_id, period, currency, livemode, net_receipts_minor, share_rate, pool_minor, allocated_minor,
    unallocated_minor, subscribers, active_subscribers, step_cap, activity_floor, fee_treatment, is_placeholder)
  values (p_tenant, p_period, v_cur, p_livemode, v_net, cfg.pool_share_author, v_pool, 0, v_pool, v_subs, v_active,
    cfg.pool_step_cap, cfg.pool_activity_floor, cfg.fee_treatment, cfg.is_placeholder)
  returning id into v_id;

  -- A reader's membership hashes as in 0021; a seat share adds the licence,
  -- so one person with a membership and a seat has two rows.
  insert into public.pool_usage (period_id, user_hash, workbook_id, steps_capped, net_share_minor, allocated_minor, source)
  select v_id,
         encode(sha256(convert_to(s.user_id::text || ':' || v_id::text || coalesce(':' || s.licence_id::text, ''), 'UTF8')), 'hex'),
         s.workbook_id, s.steps,
         floor(n.net::numeric * s.steps / t.total),
         floor(floor(n.net * cfg.pool_share_author) * s.steps / t.total),
         n.source
    from pg_temp.pool_steps30 s
    join pg_temp.pool_net30 n on n.user_id = s.user_id and n.licence_id is not distinct from s.licence_id
    join (select user_id, licence_id, sum(steps) as total from pg_temp.pool_steps30 group by user_id, licence_id) t
      on t.user_id = s.user_id and t.licence_id is not distinct from s.licence_id
   where t.total >= greatest(cfg.pool_activity_floor, 1);

  -- One pool line per workbook and income source for organisations that
  -- earn. Reader membership lines keep 0021's key; organisation income has
  -- its own line, which names the kind of income and never the organisation.
  insert into public.royalty_lines (org_id, workbook_id, tenant_id, kind, period, currency, livemode, net_base_minor, rate,
    author_minor, akana_minor, is_placeholder_rate, pool_period_id, idem_key, note, occurred_at, income_source)
  select w.org_id, u.workbook_id, p_tenant, 'pool', p_period, v_cur, p_livemode, sum(u.net_share_minor), cfg.pool_share_author,
         sum(u.allocated_minor), sum(u.net_share_minor) - sum(u.allocated_minor), cfg.is_placeholder, v_id,
         'pool:' || v_id::text || ':' || u.workbook_id::text || case when u.source = 'reader_membership' then '' else ':' || u.source end,
         case u.source when 'reader_membership' then 'Membership pool, '
                       when 'org_church' then 'Church licences pool, '
                       when 'org_group' then 'Group licences pool, '
                       else 'Teams licences pool, ' end || sum(u.steps_capped)::text || ' capped steps',
         v_to - interval '1 second', u.source
    from public.pool_usage u
    join public.workbooks w on w.id = u.workbook_id
   where u.period_id = v_id and app.org_earns(w.org_id)
   group by w.org_id, u.workbook_id, u.source
  having sum(u.allocated_minor) > 0;

  select coalesce(sum(author_minor), 0) into v_alloc from public.royalty_lines where pool_period_id = v_id;
  -- pool_periods is a record of the close; this is the one update it gets.
  update public.pool_periods set allocated_minor = v_alloc, unallocated_minor = v_pool - v_alloc where id = v_id;

  perform app.audit('money.pool_closed', 'pool_period:' || v_id::text, null, p_tenant, null, null,
    jsonb_build_object('period', p_period, 'currency', v_cur, 'livemode', p_livemode, 'pool_minor', v_pool, 'allocated_minor', v_alloc));
  return v_id;
end $$;
