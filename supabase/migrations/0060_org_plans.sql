-- 0060 Organisations, Phase B: published prices, the small-organisation plan,
-- church bands, the six-seat group licence, pilots and the standing sign-up
-- link (items 6.6, 9.1, 9.4, 9.5, 13.14, 13.15, 14.37).
--
-- Depends on 0001 to 0048. Nothing earlier is edited. Where an earlier
-- function has to change, it is replaced with create or replace, its body
-- copied exactly, and each change is marked "0060":
--   app.org_billing_apply        (0030) accepts the two new plan ids
--   app.org_self_serve_provision (0030) the small-organisation plan, the four
--                                       church bands; seats come from prices
--   app.org_billing_seat_change_check_core (0030, renamed in 0032) the seat
--                                       range of the small-organisation plan
--   app.org_cooling_off_state    (0031) the 14-day refund window also covers
--   app.org_cooling_off_done_core (0031, renamed in 0034) a small-organisation plan
--   app.org_band_number, app.org_band_seats (0031) a fourth band
--   app.org_plan_yearly          (0031) the small-organisation plan is yearly
--
-- PRICES AND TERMS. Every figure comes from docs/planning/AK_Phase_B_Decisions_
-- 2026-10-21.md and is a proposal on the pre-launch review list. They live in
-- public.org_plan_prices, not in code. Change a row and the Organisations
-- page, the sign-up pages and Stripe Checkout follow. Amounts are GBP minor
-- units (pence), VAT exclusive as organisations are invoiced, a per-seat
-- yearly amount for small_org_year, a yearly amount for each church band, and
-- a one-off amount for group_licence_six.
--
-- FOR OTHER BUILDERS
-- public.org_plan_prices  readable by anyone (the prices are published);
--   only platform owners and finance can change a row, and every change is
--   audited. small_org_year min_seats and max_seats are the seat range for
--   the plan, read by sign-up, by the Organisations page and by the seat
--   change check (replaced below). The older teams_seat_* plans keep the
--   org_self_serve_teams_min and _max rows in app_config.
-- Small-organisation plan (13.14). Annual only, 5 to 50 seats, a Stripe
--   subscription whose quantity is the seats. A rise is prorated at once
--   (lib/org-billing-server changeLicenceSeats). A fall is billed from the
--   next renewal and seats_purchased follows paid_quantity, so the seats stay
--   until the period ends (0030). Over 50 seats is a pilot, then an invoice.
-- Standing sign-up link (13.15). org_join_links.standing marks the one link
--   a licence keeps for its members to use instead of invitations. It has no
--   cap beyond the seats on the licence and does not expire on its own. The
--   admin rotates it; the old one closes in the same step. Only the token
--   hash is stored, so the new address is shown once, as for other links.
-- Church bands (9.5). Four bands by average Sunday attendance, chosen by the
--   organiser (self-declared). A band licence has room for everyone in the
--   congregation: org_church_band_<n>_seats is set to the largest seat count
--   the table allows, because the price is for the band, not per person.
-- Six-seat group licence (14.37). One workbook, six places, paid once through
--   Stripe Checkout. app.org_pack_provision (service role, from the webhook)
--   makes a small consumer organisation owned by the buyer, a group licence
--   that lists the one workbook, and the pool receipt. Members take the six
--   places with the standing link or by invitation. A full refund ends the
--   licence (trigger on royalty_receipts). org_packs holds the Checkout
--   session id so a repeated webhook changes nothing.
-- Pilot (9.4). app.org_pilot_start: platform owners and editors only, for a
--   buyer over org_pilot_min_seats, once per organisation, for
--   org_pilot_days days from now. Small teams have no pilot; they have the
--   14-day refund window (org_cooling_off_state now covers small_org_year).
--
-- Error codes (0024 and 0030's): AKO01 not allowed, AKO02 invalid, AKO05
-- already exists, AKO08 wrong state, AKO13 self-serve closed, AKO29 limited.

-- ---------------------------------------------------------------------------
-- 1. Config and the price table
-- ---------------------------------------------------------------------------
insert into public.app_config (key, value) values
  ('org_pilot_days', '30'),
  ('org_pilot_min_seats', '51'),
  ('org_pack_years', '50'),
  ('org_church_band_1_seats', '10000'),
  ('org_church_band_2_seats', '10000'),
  ('org_church_band_3_seats', '10000'),
  ('org_church_band_4_seats', '10000')
on conflict (key) do update set value = excluded.value, updated_at = now();

create table public.org_plan_prices (
  plan_id        text primary key check (plan_id in
    ('small_org_year','church_band_1','church_band_2','church_band_3','church_band_4','group_licence_six')),
  label          text not null check (char_length(label) between 3 and 80 and label !~ '[<>[:cntrl:]]'),
  kind           text not null check (kind in ('seat_year','band_year','pack_once')),
  currency       char(3) not null default 'GBP' check (currency ~ '^[A-Z]{3}$'),
  amount_minor   integer not null check (amount_minor > 0 and amount_minor <= 10000000),
  -- Whether the amount already includes VAT. Organisation prices are shown
  -- plus VAT where it applies; the one-off group licence, bought by an
  -- individual, includes it. Crent to confirm (decisions note).
  tax_behavior   text not null default 'exclusive' check (tax_behavior in ('inclusive','exclusive')),
  min_seats      int check (min_seats is null or min_seats between 1 and 10000),
  max_seats      int check (max_seats is null or max_seats between 1 and 10000),
  attendance_min int check (attendance_min is null or attendance_min >= 0),
  attendance_max int check (attendance_max is null or attendance_max >= 0),
  sort           int not null default 0,
  active         boolean not null default true,
  note           text check (note is null or char_length(note) <= 300),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint org_plan_prices_seats check ((kind in ('seat_year','pack_once')) = (min_seats is not null and max_seats is not null)
                                          and (min_seats is null or min_seats <= max_seats)),
  constraint org_plan_prices_pack_seats check (kind <> 'pack_once' or min_seats = max_seats),
  constraint org_plan_prices_band check ((kind = 'band_year') = (attendance_min is not null)
                                         and (attendance_max is null or attendance_max >= attendance_min)),
  constraint org_plan_prices_kind_plan check (
    (kind = 'seat_year' and plan_id = 'small_org_year') or
    (kind = 'band_year' and plan_id like 'church\_band\_%') or
    (kind = 'pack_once' and plan_id = 'group_licence_six'))
);
create trigger org_plan_prices_touch before update on public.org_plan_prices for each row execute function app.touch_updated_at();

create or replace function app.org_plan_prices_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.amount_minor is distinct from old.amount_minor or new.active is distinct from old.active
     or new.min_seats is distinct from old.min_seats or new.max_seats is distinct from old.max_seats then
    perform app.audit('org.plan_price_changed', 'org_plan:' || new.plan_id, null, null, null,
      jsonb_build_object('amount_minor', old.amount_minor, 'active', old.active, 'min_seats', old.min_seats, 'max_seats', old.max_seats),
      jsonb_build_object('amount_minor', new.amount_minor, 'active', new.active, 'min_seats', new.min_seats, 'max_seats', new.max_seats));
  end if;
  return new;
end $$;
create trigger org_plan_prices_audit after update on public.org_plan_prices
  for each row execute function app.org_plan_prices_audit();

insert into public.org_plan_prices (plan_id, label, kind, amount_minor, tax_behavior, min_seats, max_seats, attendance_min, attendance_max, sort, note) values
  ('small_org_year',    'Small organisation, per seat, yearly', 'seat_year', 6000,  'exclusive', 5,  50, null, null, 10, 'Same as 5 pounds a month. Annual only. Over 50 seats is a pilot, then an annual invoice.'),
  ('church_band_1',     'Church, under 50 people on a Sunday',  'band_year', 12000, 'exclusive', null, null, 0,   49,   20, 'Unlimited members within the band.'),
  ('church_band_2',     'Church, 50 to 149 people',             'band_year', 24000, 'exclusive', null, null, 50,  149,  21, 'Unlimited members within the band.'),
  ('church_band_3',     'Church, 150 to 399 people',            'band_year', 48000, 'exclusive', null, null, 150, 399,  22, 'Unlimited members within the band.'),
  ('church_band_4',     'Church, 400 people or more',           'band_year', 90000, 'exclusive', null, null, 400, null, 23, 'Unlimited members within the band.'),
  ('group_licence_six', 'Group licence, one workbook, six places', 'pack_once', 3900, 'inclusive', 6, 6, null, null, 30, 'One payment, no renewal.')
on conflict (plan_id) do nothing;

alter table public.org_plan_prices enable row level security;
revoke all on public.org_plan_prices from anon, authenticated;
grant select on public.org_plan_prices to anon, authenticated;
create policy org_plan_prices_read on public.org_plan_prices for select to anon, authenticated
  using (active or (select app.is_platform(array['owner','editor','finance'])));
grant update (label, amount_minor, tax_behavior, min_seats, max_seats, attendance_min, attendance_max, sort, active, note) on public.org_plan_prices to authenticated;
create policy org_plan_prices_write on public.org_plan_prices for update to authenticated
  using ((select app.is_platform(array['owner','finance']))) with check ((select app.is_platform(array['owner','finance'])));
grant select, insert, update, delete on public.org_plan_prices to service_role;

-- The church band an average Sunday attendance falls in, or null when no
-- band is published for it. Used by tests and by anything that wants to
-- suggest a band; the organiser still chooses their own.
create or replace function app.org_church_band_for(p_attendance int) returns text
language sql stable security definer set search_path = '' as $$
  select p.plan_id from public.org_plan_prices p
   where p.kind = 'band_year' and p.active and p_attendance is not null and p_attendance >= p.attendance_min
     and (p.attendance_max is null or p_attendance <= p.attendance_max)
   order by p.attendance_min desc limit 1
$$;

-- ---------------------------------------------------------------------------
-- 2. Plans: the subscription mirror accepts the new ids, and a fourth band.
-- ---------------------------------------------------------------------------
alter table public.org_subscriptions drop constraint org_subscriptions_plan_check;
alter table public.org_subscriptions add constraint org_subscriptions_plan_check
  check (plan is null or plan in ('teams_seat_month','teams_seat_year','small_org_year','group_member_month',
                                  'church_band_1','church_band_2','church_band_3','church_band_4'));

create or replace function app.org_band_number(p_plan text) returns int
language sql immutable set search_path = '' as $$
  select case p_plan when 'church_band_1' then 1 when 'church_band_2' then 2 when 'church_band_3' then 3 when 'church_band_4' then 4 end  -- 0060
$$;

create or replace function app.org_band_seats(p_plan text) returns int
language sql stable security definer set search_path = '' as $$
  select case when app.org_band_number(p_plan) is null then null
              else greatest(1, least(10000, app.org_config_int('org_' || p_plan || '_seats',
                     case p_plan when 'church_band_1' then 50 when 'church_band_2' then 150 when 'church_band_3' then 400 else 10000 end))) end  -- 0060
$$;

create or replace function app.org_plan_yearly(p_plan text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p_plan in ('teams_seat_year', 'small_org_year'), false)  -- 0060
$$;

-- A small-organisation plan has the same 14-day refund window as a personal
-- plan: from the start and from each yearly renewal.
create or replace function app.org_refund_window_applies(p_licence uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.org_licences l
     where l.id = p_licence
       and (app.org_is_consumer(l.org_id)
            or exists (select 1 from public.org_subscriptions s where s.licence_id = l.id and s.plan = 'small_org_year')))
$$;

-- ---------------------------------------------------------------------------
-- 3. Replaced functions (bodies copied; changes marked 0060)
-- ---------------------------------------------------------------------------

-- app.org_billing_apply (0030): the plan check accepts small_org_year and church_band_4.
create or replace function app.org_billing_apply(
  p_subscription text, p_customer text, p_licence uuid, p_status text, p_plan text, p_price text,
  p_quantity int, p_collection text, p_days_until_due int,
  p_period_start timestamptz, p_period_end timestamptz,
  p_cancel_at_period_end boolean, p_cancel_at timestamptz, p_canceled_at timestamptz, p_ended_at timestamptz,
  p_livemode boolean, p_observed_at timestamptz
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  s       public.org_subscriptions;
  l       public.org_licences;
  v_had   boolean;
  v_paid  int;
  v_since timestamptz;
  v_grace int := greatest(0, least(60, app.org_config_int('org_billing_grace_days', 14)));
  v_ends  timestamptz;
  v_status text;
begin
  if not app.is_service_role() then
    raise exception 'only the service role mirrors organisation billing' using errcode = 'AKO01';
  end if;
  if p_subscription is null or p_subscription !~ '^sub_[A-Za-z0-9]+$' or p_customer is null or p_customer !~ '^cus_[A-Za-z0-9]+$' then
    raise exception 'org_invalid: subscription' using errcode = 'AKO02';
  end if;
  if p_status is null or p_status not in ('incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused') then
    raise exception 'org_invalid: status' using errcode = 'AKO02';
  end if;
  if p_quantity is null or p_quantity not between 1 and 10000 then
    raise exception 'org_invalid: quantity' using errcode = 'AKO02';
  end if;
  if p_collection is null or p_collection not in ('charge_automatically','send_invoice') or p_observed_at is null then
    raise exception 'org_invalid: collection' using errcode = 'AKO02';
  end if;
  if p_plan is not null and p_plan not in ('teams_seat_month','teams_seat_year','group_member_month','church_band_1','church_band_2','church_band_3','small_org_year','church_band_4') then  -- 0060
    raise exception 'org_invalid: plan' using errcode = 'AKO02';
  end if;

  select * into s from public.org_subscriptions x where x.stripe_subscription_id = p_subscription for update;
  v_had := found;
  if v_had then
    if s.observed_at > p_observed_at then return 'stale'; end if;
    select * into l from public.org_licences x where x.id = s.licence_id for update;
  else
    select * into l from public.org_licences x where x.stripe_subscription_id = p_subscription for update;
    if not found and p_licence is not null then
      select * into l from public.org_licences x where x.id = p_licence for update;
    end if;
    if l.id is null then return 'unlinked'; end if;
    if l.kind = 'pilot' or (l.stripe_subscription_id is not null and l.stripe_subscription_id <> p_subscription) then
      return 'unlinked';
    end if;
  end if;

  v_paid := case when v_had and s.current_period_start is not distinct from p_period_start then greatest(s.paid_quantity, p_quantity)
                 else p_quantity end;
  v_since := case when p_status = 'past_due' then coalesce(case when v_had then s.past_due_since end, p_observed_at) end;

  insert into public.org_subscriptions (stripe_subscription_id, org_id, licence_id, stripe_customer_id, status, plan, price_id, quantity,
    paid_quantity, collection_method, days_until_due, current_period_start, current_period_end, cancel_at_period_end, cancel_at,
    canceled_at, ended_at, past_due_since, livemode, observed_at)
  values (p_subscription, l.org_id, l.id, p_customer, p_status, p_plan, p_price, p_quantity, v_paid, p_collection, p_days_until_due,
    p_period_start, p_period_end, coalesce(p_cancel_at_period_end, false), p_cancel_at, p_canceled_at, p_ended_at, v_since,
    coalesce(p_livemode, false), p_observed_at)
  on conflict (stripe_subscription_id) do update set
    stripe_customer_id = excluded.stripe_customer_id, status = excluded.status, plan = excluded.plan, price_id = excluded.price_id,
    quantity = excluded.quantity, paid_quantity = excluded.paid_quantity, collection_method = excluded.collection_method,
    days_until_due = excluded.days_until_due, current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end, cancel_at_period_end = excluded.cancel_at_period_end,
    cancel_at = excluded.cancel_at, canceled_at = excluded.canceled_at, ended_at = excluded.ended_at,
    past_due_since = excluded.past_due_since, livemode = excluded.livemode, observed_at = excluded.observed_at;

  if l.status = 'ended' then
    return 'applied';
  end if;

  if p_status in ('canceled','incomplete_expired') then
    update public.org_licences x set billing_state = p_status, stripe_subscription_id = p_subscription where x.id = l.id;
    perform app.org_licence_end_inner(l.id, 'billing_' || p_status);
    return 'applied';
  end if;

  v_status := case
    when p_status in ('active','trialing','past_due') then
      -- A licence staff suspended stays suspended; one billing suspended comes back.
      case when l.status = 'suspended' and coalesce(l.billing_state, 'active') in ('active','trialing','past_due') then 'suspended' else 'active' end
    else 'suspended' end;
  v_ends := coalesce(p_period_end, l.ends_at) + interval '2 days';
  if p_status = 'past_due' then
    v_ends := least(v_ends, v_since + make_interval(days => v_grace));
  end if;
  v_ends := greatest(v_ends, l.starts_at + interval '1 second');

  update public.org_licences x
     set status = v_status,
         billing_state = p_status,
         grace_until = case when p_status = 'past_due' then v_since + make_interval(days => v_grace) end,
         ends_at = v_ends,
         seats_purchased = case when app.org_plan_is_band(p_plan) then x.seats_purchased else v_paid end,
         stripe_subscription_id = p_subscription
   where x.id = l.id;
  perform app.org_licence_sync_entitlements(l.id);

  if not v_had or s.status is distinct from p_status or s.quantity is distinct from p_quantity
     or s.cancel_at_period_end is distinct from coalesce(p_cancel_at_period_end, false) then
    perform app.audit('org.billing_synced', 'org_licence:' || l.id::text, null, null, l.org_id,
      case when v_had then jsonb_build_object('status', s.status, 'quantity', s.quantity) end,
      jsonb_build_object('status', p_status, 'licence_status', v_status, 'quantity', p_quantity, 'paid_quantity', v_paid,
                         'plan', p_plan, 'cancel_at_period_end', coalesce(p_cancel_at_period_end, false)));
  end if;
  return 'applied';
end $$;

-- app.org_billing_seat_change_check_core (0030, renamed in 0032): the seat range of a
-- small-organisation plan comes from org_plan_prices. Everything else is as it was.
create or replace function app.org_billing_seat_change_check_core(p_licence uuid, p_quantity int) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  l public.org_licences;
  s public.org_subscriptions;
  v_min int := 1;
  v_max int := 10000;
begin
  select * into l from public.org_licences x where x.id = p_licence;
  if not found or app.uid() is null or not app.org_can(l.org_id, 'billing', 'write') then
    raise exception 'not allowed' using errcode = 'AKO01';
  end if;
  select * into s from public.org_subscriptions x where x.licence_id = l.id;
  if not found or app.org_plan_is_band(s.plan) then
    raise exception 'this licence is not billed by the seat in Stripe' using errcode = 'AKO14';
  end if;
  if l.status <> 'active' or s.status not in ('active','trialing','past_due') or s.cancel_at_period_end or l.end_requested_at is not null then
    raise exception 'seats cannot change on this licence now' using errcode = 'AKO08';
  end if;
  if s.plan = 'small_org_year' then  -- 0060
    select p.min_seats, p.max_seats into v_min, v_max from public.org_plan_prices p where p.plan_id = 'small_org_year';
  elsif l.self_serve then
    if l.kind = 'group' then
      v_min := app.org_config_int('org_self_serve_group_min', 4); v_max := app.org_config_int('org_self_serve_group_max', 15);
    else
      v_min := app.org_config_int('org_self_serve_teams_min', 2); v_max := app.org_config_int('org_self_serve_teams_max', 25);
    end if;
  end if;
  if p_quantity is null or p_quantity < v_min or p_quantity > least(v_max, 10000) then
    raise exception 'org_invalid: seats (% to %)', v_min, least(v_max, 10000) using errcode = 'AKO02';
  end if;
  if p_quantity < app.org_licence_places_used(l.id) then
    raise exception 'seats cannot go below the % already taken or invited', app.org_licence_places_used(l.id) using errcode = 'AKO08';
  end if;
  perform app.audit('org.seat_change_requested', 'org_licence:' || l.id::text, null, null, l.org_id,
    jsonb_build_object('quantity', s.quantity), jsonb_build_object('quantity', p_quantity));
  return case when p_quantity > s.quantity then 'up' when p_quantity < s.quantity then 'down' else 'same' end;
end $$;

-- app.org_cooling_off_state (0031) and app.org_cooling_off_done_core (0031, renamed in
-- 0034): the refund window applies to a small-organisation plan as well as a personal plan.
create or replace function app.org_cooling_off_state(p_licence uuid)
returns table (state text, reason text, stripe_subscription_id text, opened_at timestamptz, closes_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  l       public.org_licences;
  s       public.org_subscriptions;
  v_days  int := greatest(14, least(30, app.org_config_int('org_cooling_off_days', 14)));
  v_start timestamptz;
  v_renew timestamptz;
begin
  select * into l from public.org_licences x where x.id = p_licence;
  if not found or app.uid() is null or not (app.org_can(l.org_id, 'billing', 'read') or app.is_staff()) then
    raise exception 'not allowed' using errcode = 'AKO01';
  end if;
  if not app.org_refund_window_applies(l.id) then  -- 0060
    return query select 'business'::text, null::text, null::text, null::timestamptz, null::timestamptz; return;
  end if;
  select * into s from public.org_subscriptions x where x.licence_id = l.id;
  if not found then
    return query select 'not_billed'::text, null::text, null::text, null::timestamptz, null::timestamptz; return;
  end if;
  if l.status = 'ended' or s.status in ('canceled','incomplete_expired') then
    return query select 'ended'::text, null::text, s.stripe_subscription_id, null::timestamptz, null::timestamptz; return;
  end if;
  -- The start: the first invoice's payment, else when the subscription was first recorded.
  select min(coalesce(i.paid_at, i.created_at)) into v_start from public.org_invoices i
   where i.stripe_subscription_id = s.stripe_subscription_id and i.status = 'paid' and i.billing_reason = 'subscription_create';
  v_start := coalesce(v_start, s.created_at);
  if now() <= v_start + make_interval(days => v_days) then
    return query select 'open'::text, 'start'::text, s.stripe_subscription_id, v_start, v_start + make_interval(days => v_days); return;
  end if;
  -- A yearly renewal opens it again, from that renewal's payment.
  if app.org_plan_yearly(s.plan) then
    select max(coalesce(i.paid_at, i.created_at)) into v_renew from public.org_invoices i
     where i.stripe_subscription_id = s.stripe_subscription_id and i.status = 'paid' and i.billing_reason = 'subscription_cycle';
    if v_renew is not null and now() <= v_renew + make_interval(days => v_days) then
      return query select 'open'::text, 'renewal'::text, s.stripe_subscription_id, v_renew, v_renew + make_interval(days => v_days); return;
    end if;
  end if;
  return query select 'closed'::text, null::text, s.stripe_subscription_id, null::timestamptz, null::timestamptz;
end $$;

-- The owner cancelled inside the cooling-off. The server has already
-- refunded the unused days and cancelled the subscription in Stripe. The
-- licence ends now: every seat is released, the work stays each reader's.
-- The refund goes on the licence_ended email.
create or replace function app.org_cooling_off_done_core(p_licence uuid, p_refund_minor int, p_currency text, p_refund_state text)
returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  l       public.org_licences;
  v_state text;
  v_ended boolean;
  v_cur   text := upper(btrim(coalesce(p_currency, '')));
begin
  select * into l from public.org_licences x where x.id = p_licence for update;
  if not found or app.uid() is null or not app.is_org_member(l.org_id, array['owner']) then
    raise exception 'not allowed' using errcode = 'AKO01';
  end if;
  if not app.org_refund_window_applies(l.id) then  -- 0060
    raise exception 'the cooling-off period is for personal plans and small teams' using errcode = 'AKO31';
  end if;
  select c.state into v_state from app.org_cooling_off_state(l.id) c;
  -- 'ended': the cancel webhook may have arrived first.
  if v_state not in ('open','ended') then
    raise exception 'the cooling-off period is not open' using errcode = 'AKO31';
  end if;
  if p_refund_minor is not null and (p_refund_minor < 0 or v_cur !~ '^[A-Z]{3}$') then
    raise exception 'org_invalid: refund' using errcode = 'AKO02';
  end if;
  v_ended := app.org_licence_end_inner(l.id, 'cooling_off');
  update public.org_billing_mail m
     set refund_minor = p_refund_minor,
         refund_currency = case when p_refund_minor is not null then v_cur end,
         refund_state = case when p_refund_state in ('pending','succeeded','failed') then p_refund_state end
   where m.kind = 'licence_ended' and m.ref = l.id::text and m.done_at is null;
  perform app.audit('org.cooling_off_cancelled', 'org_licence:' || l.id::text, null, null, l.org_id, null,
    jsonb_build_object('refund_minor', p_refund_minor, 'currency', nullif(v_cur, ''), 'ended_now', v_ended));
  return true;
end $$;

-- Self-serve provisioning (0030, F-226), with the Phase B plans. The webhook
-- calls it with the service role once Checkout completes. Idempotent on the
-- subscription. 0060: small_org_year (5 to 50 seats from org_plan_prices,
-- annual, business or charity) and church_band_1 to 4 (one subscription of
-- quantity 1, seats = the band's room, kind church). Group and the older
-- teams plans keep their 0030 rules.
create or replace function app.org_self_serve_provision(
  p_user uuid, p_plan text, p_org_kind text, p_name text, p_country text, p_billing_email text,
  p_subscription text, p_quantity int
) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_licence uuid;
  v_org     uuid := gen_random_uuid();
  v_name    text := app.clean_text(p_name, 121);
  v_country text := upper(btrim(coalesce(p_country, '')));
  v_email   text := lower(app.clean_text(p_billing_email, 255));
  v_kind    text;
  v_slug    text;
  v_min     int;
  v_max     int;
  v_seats   int;
  v_price   public.org_plan_prices;
begin
  if not app.is_service_role() then
    raise exception 'only the service role provisions self-serve organisations' using errcode = 'AKO01';
  end if;
  if not app.flag('org_self_serve') then
    raise exception 'self-serve sign-up is closed' using errcode = 'AKO13';
  end if;
  if p_subscription is null or p_subscription !~ '^sub_[A-Za-z0-9]+$' then
    raise exception 'org_invalid: subscription' using errcode = 'AKO02';
  end if;
  select l.id into v_licence from public.org_licences l where l.stripe_subscription_id = p_subscription;
  if v_licence is not null then return v_licence; end if;

  if p_plan = 'group_member_month' then
    v_kind := 'group';
    if p_org_kind is distinct from 'community_group' then raise exception 'org_invalid: kind' using errcode = 'AKO02'; end if;
    v_min := app.org_config_int('org_self_serve_group_min', 4); v_max := app.org_config_int('org_self_serve_group_max', 15);
    v_seats := p_quantity;
  elsif p_plan in ('teams_seat_month','teams_seat_year') then
    v_kind := 'teams';
    if p_org_kind is null or p_org_kind not in ('business','charity') then raise exception 'org_invalid: kind' using errcode = 'AKO02'; end if;
    v_min := app.org_config_int('org_self_serve_teams_min', 2); v_max := app.org_config_int('org_self_serve_teams_max', 25);
    v_seats := p_quantity;
  elsif p_plan = 'small_org_year' then  -- 0060
    v_kind := 'teams';
    if p_org_kind is null or p_org_kind not in ('business','charity') then raise exception 'org_invalid: kind' using errcode = 'AKO02'; end if;
    select * into v_price from public.org_plan_prices x where x.plan_id = 'small_org_year' and x.active;
    if not found then raise exception 'org_invalid: plan (not on sale)' using errcode = 'AKO02'; end if;
    v_min := v_price.min_seats; v_max := v_price.max_seats;
    v_seats := p_quantity;
  elsif p_plan in ('church_band_1','church_band_2','church_band_3','church_band_4') then  -- 0060
    v_kind := 'church';
    if p_org_kind is distinct from 'church' then raise exception 'org_invalid: kind' using errcode = 'AKO02'; end if;
    select * into v_price from public.org_plan_prices x where x.plan_id = p_plan and x.active;
    if not found then raise exception 'org_invalid: plan (not on sale)' using errcode = 'AKO02'; end if;
    v_min := 1; v_max := 1;
    v_seats := app.org_band_seats(p_plan);
  else
    raise exception 'org_invalid: plan' using errcode = 'AKO02';
  end if;
  if p_quantity is null or p_quantity < v_min or p_quantity > v_max then
    raise exception 'org_invalid: seats' using errcode = 'AKO02';
  end if;
  if p_user is null or not exists (select 1 from auth.users u where u.id = p_user) then
    raise exception 'org_invalid: user' using errcode = 'AKO02';
  end if;
  if exists (select 1 from public.account_deletion_requests d where d.user_id = p_user and d.cancelled_at is null) then
    raise exception 'this account is scheduled for deletion' using errcode = 'AKO06';
  end if;
  if v_name is null or char_length(v_name) > 120 or v_name ~ '[<>]' then
    raise exception 'org_invalid: name' using errcode = 'AKO02';
  end if;
  if v_country !~ '^[A-Z]{2}$' then
    raise exception 'org_invalid: country' using errcode = 'AKO02';
  end if;
  if v_email is not null and v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    v_email := null;
  end if;

  v_slug := left(coalesce(nullif(btrim(regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'), '-'), ''), 'organisation'), 60);
  v_slug := btrim(v_slug, '-') || '-' || substr(md5(p_subscription), 1, 8);

  insert into public.organisations (id, code, kind, legal_name, display_name, slug, country)
  values (v_org, null, p_org_kind, v_name, v_name, v_slug, v_country);
  insert into public.org_profiles (org_id, billing_email, billing_country) values (v_org, v_email, v_country);
  insert into public.org_members (org_id, user_id, role) values (v_org, p_user, 'owner');
  update public.profiles p set adult_confirmed_at = coalesce(p.adult_confirmed_at, now()) where p.user_id = p_user;

  insert into public.org_licences (org_id, kind, title_scope, seats_purchased, starts_at, ends_at, status, stripe_subscription_id,
    self_serve, created_by)
  values (v_org, v_kind, 'membership', v_seats, now(), now() + interval '2 days', 'active', p_subscription, true, p_user)
  returning id into v_licence;

  perform app.audit('organisation.created', 'organisation:' || v_org::text, 'self_serve', null, v_org, null,
    jsonb_build_object('kind', p_org_kind, 'slug', v_slug, 'country', v_country, 'customer', true, 'self_serve', true));
  perform app.audit('org.licence_created', 'org_licence:' || v_licence::text, 'self_serve', null, v_org, null,
    jsonb_build_object('kind', v_kind, 'title_scope', 'membership', 'seats', v_seats, 'plan', p_plan,
                       'declared_band', app.org_band_number(p_plan)));
  return v_licence;
end $$;

-- ---------------------------------------------------------------------------
-- 4. The six-seat group licence (14.37). One-off payment, one workbook.
-- ---------------------------------------------------------------------------
create table public.org_packs (
  session_id        text primary key check (session_id ~ '^cs_[A-Za-z0-9_]+$'),
  org_id            uuid not null references public.organisations(id) on delete cascade,
  licence_id        uuid not null unique references public.org_licences(id) on delete cascade,
  workbook_id       uuid not null references public.workbooks(id),
  buyer_user_id     uuid references auth.users(id) on delete set null,
  payment_intent_id text check (payment_intent_id is null or payment_intent_id ~ '^pi_[A-Za-z0-9_]+$'),
  amount_minor      integer not null check (amount_minor > 0),
  currency          char(3) not null check (currency ~ '^[A-Z]{3}$'),
  livemode          boolean not null,
  created_at        timestamptz not null default now()
);
create index org_packs_org_idx on public.org_packs(org_id);
create index org_packs_workbook_idx on public.org_packs(workbook_id);
create index org_packs_buyer_idx on public.org_packs(buyer_user_id);

create or replace function app.org_pack_provision(
  p_user uuid, p_workbook uuid, p_name text, p_session text, p_payment_intent text,
  p_amount int, p_tax int, p_currency text, p_livemode boolean, p_country text,
  p_balance_txn text default null, p_fee_minor int default null
) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_licence uuid;
  v_org     uuid := gen_random_uuid();
  v_name    text := coalesce(app.clean_text(p_name, 121), 'Study group');
  v_country text := upper(btrim(coalesce(p_country, '')));
  v_price   public.org_plan_prices;
  v_slug    text;
  v_ref     text;
  v_at      timestamptz := now();
  v_cur     text := upper(btrim(coalesce(p_currency, '')));
begin
  if not app.is_service_role() then
    raise exception 'only the service role provisions a group licence' using errcode = 'AKO01';
  end if;
  if not app.flag('org_self_serve') then
    raise exception 'self-serve sign-up is closed' using errcode = 'AKO13';
  end if;
  if p_session is null or p_session !~ '^cs_[A-Za-z0-9_]+$' then
    raise exception 'org_invalid: session' using errcode = 'AKO02';
  end if;
  select k.licence_id into v_licence from public.org_packs k where k.session_id = p_session;
  if v_licence is not null then return v_licence; end if;
  select * into v_price from public.org_plan_prices x where x.plan_id = 'group_licence_six';
  if not found then raise exception 'org_invalid: plan' using errcode = 'AKO02'; end if;
  if p_amount is null or p_amount <= 0 or v_cur !~ '^[A-Z]{3}$' then
    raise exception 'org_invalid: amount' using errcode = 'AKO02';
  end if;
  if p_user is null or not exists (select 1 from auth.users u where u.id = p_user) then
    raise exception 'org_invalid: user' using errcode = 'AKO02';
  end if;
  if exists (select 1 from public.account_deletion_requests d where d.user_id = p_user and d.cancelled_at is null) then
    raise exception 'this account is scheduled for deletion' using errcode = 'AKO06';
  end if;
  if v_name ~ '[<>]' then
    raise exception 'org_invalid: name' using errcode = 'AKO02';
  end if;
  if v_country !~ '^[A-Z]{2}$' then v_country := 'GB'; end if;
  if p_workbook is null or not exists (
       select 1 from public.workbooks w
        where w.id = p_workbook and w.status = 'live' and not w.is_demo and w.safety_tier <> 'higher'
          and w.tenant_id = '00000000-0000-0000-0000-00000000000a') then
    raise exception 'org_invalid: workbook' using errcode = 'AKO02';
  end if;

  v_slug := left(coalesce(nullif(btrim(regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'), '-'), ''), 'group'), 60);
  v_slug := btrim(v_slug, '-') || '-' || substr(md5(p_session), 1, 8);

  insert into public.organisations (id, code, kind, legal_name, display_name, slug, country)
  values (v_org, null, 'community_group', v_name, v_name, v_slug, v_country);
  insert into public.org_profiles (org_id, billing_country, buyer_type) values (v_org, v_country, 'consumer');
  insert into public.org_members (org_id, user_id, role) values (v_org, p_user, 'owner');
  update public.profiles p set adult_confirmed_at = coalesce(p.adult_confirmed_at, now()) where p.user_id = p_user;

  insert into public.org_licences (org_id, kind, title_scope, seats_purchased, starts_at, ends_at, status, self_serve, created_by)
  values (v_org, 'group', 'list', v_price.min_seats, v_at,
          v_at + make_interval(years => greatest(1, least(100, app.org_config_int('org_pack_years', 50)))), 'active', true, p_user)
  returning id into v_licence;
  perform app.org_licence_set_titles_inner(v_licence, array[p_workbook]);

  insert into public.org_packs (session_id, org_id, licence_id, workbook_id, buyer_user_id, payment_intent_id, amount_minor, currency, livemode)
  values (p_session, v_org, v_licence, p_workbook, p_user,
          case when p_payment_intent ~ '^pi_[A-Za-z0-9_]+$' then p_payment_intent end, p_amount, v_cur, coalesce(p_livemode, false));

  -- The money joins the organisation pool like a paid invoice does (0030).
  v_ref := case when p_payment_intent ~ '^pi_[A-Za-z0-9_]+$' then p_payment_intent else p_session end;
  insert into public.royalty_receipts (kind, source, tenant_id, user_id, org_licence_id, stripe_ref, payment_intent_id,
    balance_txn_id, currency, gross_minor, tax_minor, fee_minor, livemode, period, occurred_at)
  values ('membership', 'org_licence', '00000000-0000-0000-0000-00000000000a', null, v_licence, v_ref,
    case when p_payment_intent ~ '^pi_[A-Za-z0-9_]+$' then p_payment_intent end,
    case when p_balance_txn ~ '^txn_[A-Za-z0-9_]+$' then p_balance_txn end,
    v_cur, p_amount, least(greatest(coalesce(p_tax, 0), 0), p_amount), p_fee_minor, coalesce(p_livemode, false),
    app.money_month(v_at), v_at)
  on conflict (kind, stripe_ref) do nothing;

  perform app.audit('organisation.created', 'organisation:' || v_org::text, 'group_licence', null, v_org, null,
    jsonb_build_object('kind', 'community_group', 'slug', v_slug, 'country', v_country, 'customer', true, 'self_serve', true));
  perform app.audit('org.licence_created', 'org_licence:' || v_licence::text, 'group_licence', null, v_org, null,
    jsonb_build_object('kind', 'group', 'title_scope', 'list', 'seats', v_price.min_seats, 'plan', 'group_licence_six', 'titles', 1));
  return v_licence;
end $$;

-- A full refund of the payment ends the licence: every place is released and
-- what each person wrote stays theirs, read only (0030's end rule).
create or replace function app.org_pack_refund_ends() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_licence uuid;
  v_orig    bigint;
  v_taken   bigint;
begin
  if new.kind <> 'refund' or new.original_receipt_id is null then return new; end if;
  select r.org_licence_id, r.gross_minor into v_licence, v_orig from public.royalty_receipts r where r.id = new.original_receipt_id;
  if v_licence is null or not exists (select 1 from public.org_packs k where k.licence_id = v_licence) then return new; end if;
  select coalesce(-sum(x.gross_minor), 0) into v_taken from public.royalty_receipts x
   where x.original_receipt_id = new.original_receipt_id and x.kind in ('refund','dispute','dispute_reversal');
  if v_taken >= v_orig then
    perform app.org_licence_end_inner(v_licence, 'refunded');
  end if;
  return new;
end $$;
create trigger royalty_receipts_org_pack_refund after insert on public.royalty_receipts
  for each row execute function app.org_pack_refund_ends();

-- ---------------------------------------------------------------------------
-- 5. The standing sign-up link (13.15)
-- ---------------------------------------------------------------------------
alter table public.org_join_links add column standing boolean not null default false;
create unique index org_join_links_standing_idx on public.org_join_links(licence_id) where standing and revoked_at is null;

-- Make the licence's standing link, closing the one it had. The server mints
-- the token and passes only its hash.
create or replace function app.org_standing_link_rotate(p_licence uuid, p_token_hash text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  l    public.org_licences;
  v_id uuid;
  n    int;
  v_had boolean;
begin
  select * into l from public.org_licences x where x.id = p_licence for update;
  if not found or app.uid() is null or not app.org_can_manage_seats(l.org_id) then
    raise exception 'not allowed to make links for this licence' using errcode = 'AKO01';
  end if;
  perform app.require_role_mfa(l.org_id);  -- as 0032 does for the other link functions
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'org_invalid: token' using errcode = 'AKO02';
  end if;
  if l.status <> 'active' or l.ends_at <= now()
     or exists (select 1 from public.organisations o where o.id = l.org_id and o.status in ('suspended','closed')) then
    raise exception 'this licence is not open' using errcode = 'AKO08';
  end if;
  select count(*) into n from public.audit_log a
   where a.action = 'org.standing_link_rotated' and a.org_id = l.org_id and a.at > now() - interval '1 day';
  if n >= app.org_config_int('org_join_links_per_day', 10) then
    raise exception 'too many links today' using errcode = 'AKO29';
  end if;
  update public.org_join_links k set revoked_at = now() where k.licence_id = l.id and k.standing and k.revoked_at is null;
  v_had := found;
  insert into public.org_join_links (org_id, licence_id, token_hash, email_domain, max_uses, uses, expires_at, created_by, standing)
  values (l.org_id, l.id, p_token_hash, null, 10000, 0, now() + interval '10 years', app.uid(), true)
  returning id into v_id;
  perform app.audit('org.standing_link_rotated', 'org_join_link:' || v_id::text, null, null, l.org_id, null,
    jsonb_build_object('licence', l.id, 'replaced', v_had));
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Pilot for larger buyers (9.4). Akana staff only.
-- ---------------------------------------------------------------------------
create or replace function app.org_pilot_start(p_org uuid, p_seats int) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_days int := greatest(1, least(90, app.org_config_int('org_pilot_days', 30)));
  v_min  int := app.org_config_int('org_pilot_min_seats', 51);
  v_id   uuid;
begin
  if not app.is_platform(array['owner','editor']) then
    raise exception 'only platform owners and editors start a pilot' using errcode = 'AKO01';
  end if;
  perform app.require_role_mfa(null);  -- staff need a second factor, as in 0032
  if p_seats is null or p_seats < v_min or p_seats > 10000 then
    raise exception 'org_invalid: seats (a pilot is for buyers of % seats or more)', v_min using errcode = 'AKO02';
  end if;
  if exists (select 1 from public.org_licences l where l.org_id = p_org and l.kind = 'pilot') then
    raise exception 'this organisation has already had a pilot' using errcode = 'AKO05';
  end if;
  v_id := app.org_licence_create(p_org, 'pilot', 'membership', p_seats, now(), now() + make_interval(days => v_days), null, null);
  perform app.audit('org.pilot_started', 'org_licence:' || v_id::text, null, null, p_org, null,
    jsonb_build_object('seats', p_seats, 'days', v_days));
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 7. RPC wrappers (security invoker; the app functions do the checks)
-- ---------------------------------------------------------------------------
create or replace function public.org_pack_provision(
  p_user uuid, p_workbook uuid, p_name text, p_session text, p_payment_intent text,
  p_amount int, p_tax int, p_currency text, p_livemode boolean, p_country text,
  p_balance_txn text default null, p_fee_minor int default null
) returns uuid
language sql volatile security invoker set search_path = '' as $$
  select app.org_pack_provision(p_user, p_workbook, p_name, p_session, p_payment_intent, p_amount, p_tax, p_currency, p_livemode,
    p_country, p_balance_txn, p_fee_minor) $$;
create or replace function public.org_standing_link_rotate(p_licence uuid, p_token_hash text) returns uuid
language sql volatile security invoker set search_path = '' as $$ select app.org_standing_link_rotate(p_licence, p_token_hash) $$;
create or replace function public.org_pilot_start(p_org uuid, p_seats int) returns uuid
language sql volatile security invoker set search_path = '' as $$ select app.org_pilot_start(p_org, p_seats) $$;
create or replace function public.org_church_band_for(p_attendance int) returns text
language sql stable security invoker set search_path = '' as $$ select app.org_church_band_for(p_attendance) $$;

-- Execute: nothing by default, then back to the roles that need each.
revoke execute on function
  app.org_plan_prices_audit(), app.org_church_band_for(int), app.org_refund_window_applies(uuid),
  app.org_pack_provision(uuid, uuid, text, text, text, int, int, text, boolean, text, text, int), app.org_pack_refund_ends(),
  app.org_standing_link_rotate(uuid, text), app.org_pilot_start(uuid, int),
  public.org_pack_provision(uuid, uuid, text, text, text, int, int, text, boolean, text, text, int),
  public.org_standing_link_rotate(uuid, text), public.org_pilot_start(uuid, int), public.org_church_band_for(int)
  from public, anon, authenticated;
grant execute on function
  app.org_pack_provision(uuid, uuid, text, text, text, int, int, text, boolean, text, text, int),
  public.org_pack_provision(uuid, uuid, text, text, text, int, int, text, boolean, text, text, int)
  to service_role;
grant execute on function
  app.org_standing_link_rotate(uuid, text), app.org_pilot_start(uuid, int), app.org_refund_window_applies(uuid),
  public.org_standing_link_rotate(uuid, text), public.org_pilot_start(uuid, int)
  to authenticated;
grant execute on function app.org_church_band_for(int), public.org_church_band_for(int) to anon, authenticated, service_role;
-- The band functions are read by the table's own policies and the sync, which run as their owner.
grant execute on function app.org_band_number(text), app.org_plan_yearly(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. Row level security for the new table and the link column
-- ---------------------------------------------------------------------------
alter table public.org_packs enable row level security;
revoke all on public.org_packs from anon, authenticated;
grant select on public.org_packs to authenticated;
create policy org_packs_read on public.org_packs for select to authenticated
  using ((select app.org_can(org_id, 'billing', 'read')) or (select app.is_staff()));
grant select, insert, update, delete on public.org_packs to service_role;

grant select (standing) on public.org_join_links to authenticated;
