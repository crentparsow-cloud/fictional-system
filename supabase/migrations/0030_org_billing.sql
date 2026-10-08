-- 0030 Akana Business phase 3: organisation billing, organisation income in
-- the pool, join links and bulk invites, self-serve sign-up behind a flag,
-- offboarding and export (F-220, F-222, F-225, F-226, F-228).
--
-- Depends on 0001 to 0029 (0026 to 0029 are not yet in production; this
-- migration only reads 0028's group tables when it offboards). Same rules as
-- before: every table has RLS on, grants to anon and authenticated are
-- revoked and given back narrowly, helpers are security definer with
-- search_path pinned to '', and PostgREST sees thin public wrappers that run
-- as the caller. Nothing earlier is edited. Four earlier functions are
-- replaced with create or replace, each copying its body exactly and adding
-- what is marked "0030":
--   app.royalty_receipt_period  (0021)  organisation receipts move past a
--                                       closed pool month, like membership
--   app.close_due_pools         (0021)  organisation receipts open a pool month
--   app.close_pool_period       (0021)  organisation income joins the pool
--   app.guard_last_owner        (0001)  the offboarding sweep may remove the
--                                       last owner of an organisation whose
--                                       licences have all ended
--
-- STRIPE TEST MODE ONLY. Every price is a placeholder: the app reads price
-- ids from env (STRIPE_PRICE_ORG_*), shows no figures, and says "Talk to us"
-- while one is missing. Self-serve sign-up (F-226) also waits for the
-- org_self_serve feature flag, which is seeded OFF here and stays off until
-- Crent sets prices.
--
-- ===========================================================================
-- FOR OTHER BUILDERS
-- ===========================================================================
-- public.org_subscriptions  mirror of a Stripe subscription that pays for one
--   organisation licence. Kept apart from public.subscriptions (0009), which
--   is for readers. quantity is the seats Stripe bills now; paid_quantity is
--   the most seats paid for in the current period (a fall waits for renewal).
--   observed_at ordering as in 0009: an older observation changes nothing.
--   RLS: the organisation's billing:read roles (owner, finance) and staff.
-- public.org_invoices       one row per Stripe invoice on such a
--   subscription: number, status, amounts, VAT, PO number, due and paid
--   dates, and Stripe's own invoice links. Never a title. Same RLS.
-- public.org_licences gains billing_state (the Stripe status), grace_until
--   (past due: access holds until then), end_requested_at, self_serve.
--   A licence's access rule is still 0024's: status active and inside
--   starts_at to ends_at. Billing moves those columns:
--     active, trialing   status active, ends_at = period end + 2 days
--     past_due           status active, ends_at = the earlier of that and
--                        grace_until (first seen past due + grace days)
--     unpaid, paused,    status suspended (comes back when paid)
--     incomplete
--     canceled,          status ended: every seat released (work stays the
--     incomplete_expired reader's, read only), invitations and links closed
-- public.org_join_links     a shareable link per licence with an expiry, a cap
--   and an optional email domain. Token hash only. 18+ claim, as invitations.
-- public.royalty_receipts gains source 'org_licence' and org_licence_id. An
--   organisation's paid invoice is a receipt of kind 'membership' (so refunds,
--   disputes and fee corrections reach it through the 0021 functions
--   unchanged) for the licence's tenant. Pilot licences never have one.
-- public.pool_usage gains source; public.royalty_lines gains income_source,
--   set on pool lines: 'reader_membership', 'org_teams', 'org_church' or
--   'org_group'. Statements can show organisation income apart from reader
--   memberships. Nothing on a line, a statement or pool_usage names the
--   organisation.
--
-- How organisation income is split (D3, akana-business.md 5.4). For each
-- licence with net receipts in the pool month, each seat holder whose seat
-- was open at some point in the month gets an equal share:
--   teams, group  net / greatest(seats_purchased, holders): an unfilled seat's
--                 share stays unallocated, and churn never over-allocates
--   church        net / holders (the church per-reader split)
-- Each share is then split across the titles that person completed steps in,
-- inside the licence's scope and while their seat was open, capped, with the
-- same activity floor, exactly as a reader's membership is. Holders are found
-- from org_seats claimed_at and released_at, as 0024 says to.
--
-- Error codes (0024's, plus):
--   AKO11  the account's email is not on the link's domain
--   AKO12  the link has reached its cap
--   AKO13  self-serve sign-up is closed (the flag is off)
--   AKO14  the licence is not billed in Stripe, or cannot be
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Config and the flag. Every figure is a placeholder for Crent.
-- ---------------------------------------------------------------------------
insert into public.app_config (key, value) values
  ('org_billing_grace_days', '14'),
  ('org_offboard_days', '30'),
  ('org_join_links_per_day', '10'),
  ('org_join_link_claims_per_hour', '30'),
  ('org_join_link_max_days', '90'),
  ('org_self_serve_group_min', '4'),
  ('org_self_serve_group_max', '15'),
  ('org_self_serve_teams_min', '2'),
  ('org_self_serve_teams_max', '25')
on conflict (key) do nothing;

insert into public.feature_flags (key, scope, enabled, reason) values
  ('org_self_serve', 'global', false, 'Self-serve Group and small Teams sign-up (F-226). Stays off until Crent sets organisation prices.')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Licences, seats and receipts: new columns.
-- ---------------------------------------------------------------------------
alter table public.org_licences
  add column billing_state text check (billing_state is null or billing_state in
    ('incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused')),
  add column grace_until timestamptz,
  add column end_requested_at timestamptz,
  add column end_requested_by uuid references auth.users(id) on delete set null,
  add column self_serve boolean not null default false;
alter table public.org_licences add constraint org_licences_pilot_unbilled
  check (kind <> 'pilot' or stripe_subscription_id is null);
create unique index org_licences_stripe_sub_idx on public.org_licences(stripe_subscription_id) where stripe_subscription_id is not null;

alter table public.royalty_receipts drop constraint royalty_receipts_source_check;
alter table public.royalty_receipts add constraint royalty_receipts_source_check
  check (source in ('purchase','membership','org_licence'));
alter table public.royalty_receipts add column org_licence_id uuid references public.org_licences(id);
alter table public.royalty_receipts add constraint royalty_receipts_org_licence
  check ((source = 'org_licence') = (org_licence_id is not null));
create index royalty_receipts_org_licence_idx on public.royalty_receipts(org_licence_id) where org_licence_id is not null;

alter table public.pool_usage add column source text not null default 'reader_membership'
  check (source in ('reader_membership','org_teams','org_church','org_group'));
alter table public.royalty_lines add column income_source text
  check (income_source is null or income_source in ('reader_membership','org_teams','org_church','org_group'));

-- ---------------------------------------------------------------------------
-- 3. Tables
-- ---------------------------------------------------------------------------
create table public.org_subscriptions (
  stripe_subscription_id text primary key check (stripe_subscription_id ~ '^sub_[A-Za-z0-9]+$'),
  org_id               uuid not null references public.organisations(id) on delete cascade,
  licence_id           uuid not null unique references public.org_licences(id) on delete cascade,
  stripe_customer_id   text not null check (stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  status               text not null check (status in ('incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused')),
  plan                 text check (plan is null or plan in ('teams_seat_month','teams_seat_year','group_member_month','church_band_1','church_band_2','church_band_3')),
  price_id             text check (price_id is null or price_id ~ '^price_[A-Za-z0-9]+$'),
  quantity             int not null check (quantity between 1 and 10000),
  paid_quantity        int not null check (paid_quantity between 1 and 10000),
  collection_method    text not null check (collection_method in ('charge_automatically','send_invoice')),
  days_until_due       int check (days_until_due is null or days_until_due between 1 and 90),
  current_period_start timestamptz,
  current_period_end   timestamptz,
  cancel_at_period_end boolean not null default false,
  cancel_at            timestamptz,
  canceled_at          timestamptz,
  ended_at             timestamptz,
  past_due_since       timestamptz,
  livemode             boolean not null,
  observed_at          timestamptz not null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index org_subscriptions_org_idx on public.org_subscriptions(org_id);
create trigger org_subscriptions_touch before update on public.org_subscriptions for each row execute function app.touch_updated_at();

create table public.org_invoices (
  stripe_invoice_id      text primary key check (stripe_invoice_id ~ '^in_[A-Za-z0-9]+$'),
  org_id                 uuid not null references public.organisations(id) on delete cascade,
  licence_id             uuid not null references public.org_licences(id) on delete cascade,
  stripe_subscription_id text not null references public.org_subscriptions(stripe_subscription_id) on delete cascade,
  number                 text check (number is null or number ~ '^[A-Za-z0-9-]{1,64}$'),
  status                 text not null check (status in ('draft','open','paid','void','uncollectible')),
  payment_failed_at      timestamptz,
  currency               char(3) not null check (currency ~ '^[A-Z]{3}$'),
  amount_due_minor       integer not null check (amount_due_minor >= 0),
  amount_paid_minor      integer not null check (amount_paid_minor >= 0),
  tax_minor              integer not null default 0 check (tax_minor >= 0),
  po_number              text check (po_number is null or (char_length(po_number) between 1 and 60 and po_number !~ '[<>[:cntrl:]]')),
  collection_method      text check (collection_method is null or collection_method in ('charge_automatically','send_invoice')),
  billing_reason         text check (billing_reason is null or billing_reason ~ '^[a-z_]{1,40}$'),
  period_start           timestamptz,
  period_end             timestamptz,
  due_at                 timestamptz,
  paid_at                timestamptz,
  hosted_invoice_url     text check (hosted_invoice_url is null or (char_length(hosted_invoice_url) <= 1000 and hosted_invoice_url ~ '^https://[a-z0-9.-]+\.stripe\.com/[!-~]+$')),
  invoice_pdf_url        text check (invoice_pdf_url is null or (char_length(invoice_pdf_url) <= 1000 and invoice_pdf_url ~ '^https://[a-z0-9.-]+\.stripe\.com/[!-~]+$')),
  livemode               boolean not null,
  observed_at            timestamptz not null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index org_invoices_org_idx on public.org_invoices(org_id, created_at desc);
create index org_invoices_licence_idx on public.org_invoices(licence_id);
create trigger org_invoices_touch before update on public.org_invoices for each row execute function app.touch_updated_at();

create table public.org_join_links (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organisations(id) on delete cascade,
  licence_id   uuid not null references public.org_licences(id) on delete cascade,
  token_hash   text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  email_domain text check (email_domain is null or (char_length(email_domain) between 3 and 253 and email_domain = lower(email_domain)
                                                    and email_domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$')),
  max_uses     int not null check (max_uses between 1 and 10000),
  uses         int not null default 0,
  expires_at   timestamptz not null,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  revoked_at   timestamptz,
  constraint org_join_links_uses check (uses between 0 and max_uses),
  constraint org_join_links_window check (expires_at > created_at)
);
create index org_join_links_licence_idx on public.org_join_links(licence_id, created_at desc);
create index org_join_links_org_idx on public.org_join_links(org_id);

alter table public.org_seats add column join_link_id uuid references public.org_join_links(id) on delete set null;

-- The roster as it stood when a licence ended, so the organisation can still
-- export it until the offboarding sweep deletes it (F-228). 0024 clears
-- roster_email when a seat is released; this keeps a copy for that window.
create table public.org_roster_archive (
  seat_id      uuid primary key references public.org_seats(id) on delete cascade,
  org_id       uuid not null references public.organisations(id) on delete cascade,
  licence_id   uuid not null references public.org_licences(id) on delete cascade,
  roster_email text not null,
  claimed_at   timestamptz not null,
  released_at  timestamptz not null,
  archived_at  timestamptz not null default now()
);
create index org_roster_archive_org_idx on public.org_roster_archive(org_id);

-- One row per organisation the sweep has offboarded. Counts only.
create table public.org_offboarded (
  org_id          uuid primary key references public.organisations(id) on delete cascade,
  last_ended_at   timestamptz not null,
  done_at         timestamptz not null default now(),
  seats_deleted   int not null,
  admins_removed  int not null
);

-- ---------------------------------------------------------------------------
-- 4. Shared helpers
-- ---------------------------------------------------------------------------
create or replace function app.org_plan_is_band(p_plan text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p_plan like 'church\_band\_%', false)
$$;

-- Which pool source a licence's income counts as.
create or replace function app.org_income_source(p_kind text) returns text
language sql immutable set search_path = '' as $$
  select case p_kind when 'teams' then 'org_teams' when 'church' then 'org_church' when 'group' then 'org_group' end
$$;

-- End a licence now: final. Every open seat is released (the work stays the
-- reader's and goes read only), every open invitation revoked and every join
-- link closed. Internal; callers check the role.
create or replace function app.org_licence_end_inner(p_licence uuid, p_reason text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  l      public.org_licences;
  v_seat uuid;
begin
  select * into l from public.org_licences x where x.id = p_licence for update;
  if not found or l.status = 'ended' then return false; end if;
  update public.org_licences x set status = 'ended', ended_at = now(), grace_until = null where x.id = l.id;
  for v_seat in select s.id from public.org_seats s where s.licence_id = l.id and s.released_at is null loop
    perform app.org_seat_end(v_seat, 'licence_ended');
  end loop;
  update public.org_seat_invitations i set revoked_at = now(), email = null
   where i.licence_id = l.id and i.accepted_at is null and i.declined_at is null and i.revoked_at is null;
  update public.org_join_links k set revoked_at = now() where k.licence_id = l.id and k.revoked_at is null;
  perform app.audit('org.licence_ended', 'org_licence:' || l.id::text, p_reason, null, l.org_id, null,
    jsonb_build_object('reason', p_reason, 'kind', l.kind));
  return true;
end $$;

-- Keep the roster address of a seat a licence end releases (F-228).
create or replace function app.org_seats_archive_on_end() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.released_at is null and new.released_at is not null and new.released_reason = 'licence_ended' and old.roster_email is not null then
    insert into public.org_roster_archive (seat_id, org_id, licence_id, roster_email, claimed_at, released_at)
    values (old.id, old.org_id, old.licence_id, old.roster_email, old.claimed_at, new.released_at)
    on conflict (seat_id) do nothing;
  end if;
  return new;
end $$;
create trigger org_seats_archive_roster before update of released_at on public.org_seats
  for each row execute function app.org_seats_archive_on_end();

-- A refund, dispute or fee correction of an organisation receipt carries its
-- licence. 0021's functions copy source but know nothing of org_licence_id.
create or replace function app.royalty_receipt_org_licence() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.source = 'org_licence' and new.org_licence_id is null and new.original_receipt_id is not null then
    select r.org_licence_id into new.org_licence_id from public.royalty_receipts r where r.id = new.original_receipt_id;
  end if;
  return new;
end $$;
create trigger royalty_receipts_org_licence before insert on public.royalty_receipts
  for each row execute function app.royalty_receipt_org_licence();

-- ---------------------------------------------------------------------------
-- 5. Billing mirror (F-220). The Stripe webhook calls these with the service
-- role. Idempotent; an older observation changes nothing.
-- ---------------------------------------------------------------------------
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
  if p_plan is not null and p_plan not in ('teams_seat_month','teams_seat_year','group_member_month','church_band_1','church_band_2','church_band_3') then
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

create or replace function app.org_billing_record_invoice(
  p_invoice text, p_subscription text, p_number text, p_status text, p_payment_failed boolean,
  p_currency text, p_amount_due int, p_amount_paid int, p_tax int, p_po text, p_collection text, p_billing_reason text,
  p_period_start timestamptz, p_period_end timestamptz, p_due_at timestamptz, p_paid_at timestamptz,
  p_hosted_url text, p_pdf_url text, p_livemode boolean, p_observed_at timestamptz
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  s     public.org_subscriptions;
  i     public.org_invoices;
  v_had boolean;
  v_status text := p_status;
  v_url_ok text := '^https://[a-z0-9.-]+\.stripe\.com/[!-~]+$';
begin
  if not app.is_service_role() then
    raise exception 'only the service role records organisation invoices' using errcode = 'AKO01';
  end if;
  if p_invoice is null or p_invoice !~ '^in_[A-Za-z0-9]+$' or p_status is null
     or p_status not in ('draft','open','paid','void','uncollectible') or p_observed_at is null then
    raise exception 'org_invalid: invoice' using errcode = 'AKO02';
  end if;
  select * into s from public.org_subscriptions x where x.stripe_subscription_id = p_subscription;
  if not found then return 'unlinked'; end if;
  select * into i from public.org_invoices x where x.stripe_invoice_id = p_invoice for update;
  v_had := found;
  if v_had and i.observed_at > p_observed_at then return 'stale'; end if;
  -- A settled invoice never goes back to open.
  if v_had and i.status in ('paid','void','uncollectible') and v_status in ('draft','open') then return 'unchanged'; end if;

  insert into public.org_invoices (stripe_invoice_id, org_id, licence_id, stripe_subscription_id, number, status, payment_failed_at, currency,
    amount_due_minor, amount_paid_minor, tax_minor, po_number, collection_method, billing_reason, period_start, period_end, due_at, paid_at,
    hosted_invoice_url, invoice_pdf_url, livemode, observed_at)
  values (p_invoice, s.org_id, s.licence_id, s.stripe_subscription_id,
    case when p_number ~ '^[A-Za-z0-9-]{1,64}$' then p_number end, v_status,
    case when p_payment_failed then p_observed_at end, upper(coalesce(p_currency, 'GBP')),
    greatest(coalesce(p_amount_due, 0), 0), greatest(coalesce(p_amount_paid, 0), 0), greatest(coalesce(p_tax, 0), 0),
    app.clean_text(case when p_po ~ '[<>]' then null else p_po end, 60),
    case when p_collection in ('charge_automatically','send_invoice') then p_collection end,
    case when p_billing_reason ~ '^[a-z_]{1,40}$' then p_billing_reason end,
    p_period_start, p_period_end, p_due_at, p_paid_at,
    case when char_length(p_hosted_url) <= 1000 and p_hosted_url ~ v_url_ok then p_hosted_url end,
    case when char_length(p_pdf_url) <= 1000 and p_pdf_url ~ v_url_ok then p_pdf_url end,
    coalesce(p_livemode, false), p_observed_at)
  on conflict (stripe_invoice_id) do update set
    number = coalesce(excluded.number, public.org_invoices.number),
    status = excluded.status,
    payment_failed_at = coalesce(public.org_invoices.payment_failed_at, excluded.payment_failed_at),
    currency = excluded.currency, amount_due_minor = excluded.amount_due_minor, amount_paid_minor = excluded.amount_paid_minor,
    tax_minor = excluded.tax_minor, po_number = coalesce(excluded.po_number, public.org_invoices.po_number),
    collection_method = coalesce(excluded.collection_method, public.org_invoices.collection_method),
    billing_reason = coalesce(excluded.billing_reason, public.org_invoices.billing_reason),
    period_start = excluded.period_start, period_end = excluded.period_end, due_at = excluded.due_at,
    paid_at = coalesce(excluded.paid_at, public.org_invoices.paid_at),
    hosted_invoice_url = coalesce(excluded.hosted_invoice_url, public.org_invoices.hosted_invoice_url),
    invoice_pdf_url = coalesce(excluded.invoice_pdf_url, public.org_invoices.invoice_pdf_url),
    livemode = excluded.livemode, observed_at = excluded.observed_at;

  if not v_had or i.status is distinct from v_status then
    perform app.audit('org.invoice_' || v_status, 'org_invoice:' || p_invoice, null, null, s.org_id, null,
      jsonb_build_object('licence', s.licence_id, 'failed', coalesce(p_payment_failed, false)));
  end if;
  return case when v_had then 'updated' else 'recorded' end;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Organisation income into the ledger and the pool (F-222).
-- ---------------------------------------------------------------------------

-- A paid organisation invoice becomes a pool receipt for the licence's
-- tenant. Pilot licences put nothing in (they are never billed; this refuses
-- them anyway). No lines: the money waits in the pool month. Returns
-- 'recorded', 'unchanged', 'unlinked', 'not_paid' or 'pilot'.
create or replace function app.record_org_licence_receipt(p_invoice text, p_livemode boolean, p_payment_intent text default null,
  p_balance_txn text default null, p_fee_minor int default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  i     public.org_invoices;
  l     public.org_licences;
  v_rid uuid;
  v_at  timestamptz;
begin
  if not (app.is_service_role() or app.is_money_staff()) then
    raise exception 'only the service role records receipts' using errcode = 'insufficient_privilege';
  end if;
  select * into i from public.org_invoices x where x.stripe_invoice_id = p_invoice;
  if not found then return 'unlinked'; end if;
  select * into l from public.org_licences x where x.id = i.licence_id;
  if l.kind = 'pilot' then return 'pilot'; end if;
  if i.status <> 'paid' then return 'not_paid'; end if;
  if i.amount_paid_minor <= 0 then return 'unchanged'; end if;
  v_at := coalesce(i.paid_at, now());
  insert into public.royalty_receipts (kind, source, tenant_id, user_id, org_licence_id, stripe_ref, payment_intent_id,
    balance_txn_id, currency, gross_minor, tax_minor, fee_minor, livemode, period, occurred_at)
  values ('membership', 'org_licence', l.tenant_id, null, l.id, i.stripe_invoice_id,
    case when p_payment_intent ~ '^pi_[A-Za-z0-9_]+$' then p_payment_intent end,
    case when p_balance_txn ~ '^txn_[A-Za-z0-9_]+$' then p_balance_txn end,
    i.currency, i.amount_paid_minor, least(i.tax_minor, i.amount_paid_minor), p_fee_minor, coalesce(p_livemode, false), app.money_month(v_at), v_at)
  on conflict (kind, stripe_ref) do nothing
  returning id into v_rid;
  return case when v_rid is null then 'unchanged' else 'recorded' end;
end $$;

-- 0021's period rule, with organisation receipts moved past a closed pool
-- month like membership ones. Body copied; the condition gains 'org_licence'.
create or replace function app.royalty_receipt_period() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_period text := app.money_month(new.occurred_at);
begin
  if new.source in ('membership', 'org_licence') then  -- 0030
    while exists (select 1 from public.pool_periods p
                   where p.tenant_id = new.tenant_id and p.period = v_period and p.currency = new.currency and p.livemode = new.livemode) loop
      v_period := app.month_after(v_period);
    end loop;
  end if;
  new.period := v_period;
  return new;
end $$;

-- 0021's pool close, with organisation income added. The membership part is
-- the 0021 body unchanged; the organisation part follows the rule in the
-- header. Temp tables carry a 30 suffix so they never meet 0021's.
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
  insert into pg_temp.pool_steps30 (user_id, licence_id, workbook_id, steps)
  select e.user_id, null, e.workbook_id, least(count(distinct pe.ref), cfg.pool_step_cap)::int
    from public.progress_events pe
    join public.enrolments e on e.id = pe.enrolment_id
    join public.workbooks w on w.id = e.workbook_id
   where pe.kind = 'step_done' and pe.ref is not null and pe.at >= v_from and pe.at < v_to
     and e.tenant_id = p_tenant and w.in_membership and not w.is_demo
     and e.user_id in (select n.user_id from pg_temp.pool_net30 n where n.licence_id is null and n.user_id is not null and n.net > 0)
   group by e.user_id, e.workbook_id;

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

-- 0021's close_due_pools, with organisation receipts opening a month too.
create or replace function app.close_due_pools(p_livemode boolean) returns int
language plpgsql security definer set search_path = '' as $$
declare
  cfg public.royalty_config := app.royalty_config();
  k   record;
  n   int := 0;
begin
  if not (app.is_service_role() or app.is_money_staff()) then
    raise exception 'only the service role or owner and finance staff close the pool' using errcode = 'insufficient_privilege';
  end if;
  for k in
    select distinct x.tenant_id, x.period, x.currency from public.royalty_receipts x
     where x.source in ('membership', 'org_licence') and x.livemode = p_livemode  -- 0030
       and now() >= app.month_start(app.month_after(x.period)) + make_interval(days => cfg.refund_window_days)
       and not exists (select 1 from public.pool_periods p where p.tenant_id = x.tenant_id and p.period = x.period
                        and p.currency = x.currency and p.livemode = p_livemode)
     order by x.period
  loop
    perform app.close_pool_period(k.tenant_id, k.period, k.currency, p_livemode);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- 7. The organisation's billing actions (F-220, F-228). The server talks to
-- Stripe; these check the role first and keep the record.
-- ---------------------------------------------------------------------------

-- Staff: may this licence be billed in Stripe? Returns what the server needs
-- to create the customer and subscription. Never a pilot.
create or replace function app.org_billing_link_check(p_licence uuid)
returns table (org_id uuid, kind text, seats int, legal_name text, display_name text, country text,
               billing_name text, billing_email text, vat_number text)
language plpgsql stable security definer set search_path = '' as $$
declare l public.org_licences;
begin
  if not app.is_platform(array['owner','editor','finance']) then
    raise exception 'only platform owners, editors and finance start organisation billing' using errcode = 'AKO01';
  end if;
  select * into l from public.org_licences x where x.id = p_licence;
  if not found then raise exception 'org_invalid: licence' using errcode = 'AKO02'; end if;
  if l.kind = 'pilot' then raise exception 'a pilot is free and is never billed' using errcode = 'AKO14'; end if;
  if l.status = 'ended' then raise exception 'this licence has ended' using errcode = 'AKO08'; end if;
  if l.stripe_subscription_id is not null or exists (select 1 from public.org_subscriptions s where s.licence_id = l.id) then
    raise exception 'this licence is already billed in Stripe' using errcode = 'AKO05';
  end if;
  return query
    select o.id, l.kind, l.seats_purchased, o.legal_name, o.display_name, o.country::text,
           p.billing_name, p.billing_email, p.vat_number
      from public.organisations o left join public.org_profiles p on p.org_id = o.id
     where o.id = l.org_id;
end $$;

-- The owner or finance asks for a different number of seats. Checks the
-- role and the floor (seats taken plus open invitations), writes the audit
-- row and says whether it is a rise ('up', prorated now) or a fall ('down',
-- billed from the next period; the seats paid for stay until then).
create or replace function app.org_billing_seat_change_check(p_licence uuid, p_quantity int) returns text
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
  if l.self_serve then
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

-- The owner ends a licence (F-228). Billed in Stripe: the server has already
-- set the subscription to cancel at the end of the paid period, so this
-- records the request and returns 'ending'; the licence ends when Stripe
-- says the subscription has ended. Not billed in Stripe: it ends now.
create or replace function app.org_licence_end_request(p_licence uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  l public.org_licences;
begin
  select * into l from public.org_licences x where x.id = p_licence for update;
  if not found or app.uid() is null
     or not (app.is_org_member(l.org_id, array['owner']) or app.is_platform(array['owner','editor'])) then
    raise exception 'not allowed' using errcode = 'AKO01';
  end if;
  if l.status = 'ended' then raise exception 'this licence has ended' using errcode = 'AKO08'; end if;
  if exists (select 1 from public.org_subscriptions s where s.licence_id = l.id and s.status not in ('canceled','incomplete_expired')) then
    update public.org_licences x set end_requested_at = coalesce(x.end_requested_at, now()), end_requested_by = app.uid() where x.id = l.id;
    perform app.audit('org.licence_end_requested', 'org_licence:' || l.id::text, null, null, l.org_id, null, jsonb_build_object('billed', true));
    return 'ending';
  end if;
  perform app.org_licence_end_inner(l.id, 'ended_by_organisation');
  return 'ended';
end $$;

-- May the caller end this licence? Asked before the server changes Stripe.
create or replace function app.org_billing_end_allowed(p_licence uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.uid() is not null and exists (
    select 1 from public.org_licences l
     where l.id = p_licence and l.status <> 'ended'
       and (app.is_org_member(l.org_id, array['owner']) or app.is_platform(array['owner','editor'])))
$$;

-- ---------------------------------------------------------------------------
-- 8. Join links (F-225). The server mints the token and passes only its hash.
-- ---------------------------------------------------------------------------
create or replace function app.org_join_link_create(p_licence uuid, p_token_hash text, p_days int, p_max_uses int, p_domain text)
returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  l        public.org_licences;
  v_domain text := nullif(regexp_replace(lower(btrim(coalesce(p_domain, ''))), '^@', ''), '');
  v_days   int := least(p_days, app.org_config_int('org_join_link_max_days', 90));
  v_exp    timestamptz;
  v_id     uuid;
  n        int;
begin
  select * into l from public.org_licences x where x.id = p_licence for update;
  if not found or app.uid() is null or not app.org_can_manage_seats(l.org_id) then
    raise exception 'not allowed to make links for this licence' using errcode = 'AKO01';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'org_invalid: token' using errcode = 'AKO02';
  end if;
  if l.status <> 'active' or l.ends_at <= now()
     or exists (select 1 from public.organisations o where o.id = l.org_id and o.status in ('suspended','closed')) then
    raise exception 'this licence is not open' using errcode = 'AKO08';
  end if;
  if p_days is null or p_days < 1 then
    raise exception 'org_invalid: days' using errcode = 'AKO02';
  end if;
  if p_max_uses is null or p_max_uses < 1 or p_max_uses > l.seats_purchased then
    raise exception 'org_invalid: cap (1 to the seats on the licence)' using errcode = 'AKO02';
  end if;
  if v_domain is not null and (char_length(v_domain) > 253 or v_domain !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$') then
    raise exception 'org_invalid: domain' using errcode = 'AKO02';
  end if;
  select count(*) into n from public.org_join_links k where k.licence_id = l.id and k.revoked_at is null and k.expires_at > now();
  if n >= 5 then
    raise exception 'five links are open on this licence; close one first' using errcode = 'AKO08';
  end if;
  select count(*) into n from public.audit_log a
   where a.action = 'org.join_link_created' and a.org_id = l.org_id and a.at > now() - interval '1 day';
  if n >= app.org_config_int('org_join_links_per_day', 10) then
    raise exception 'too many links today' using errcode = 'AKO29';
  end if;
  v_exp := least(now() + make_interval(days => v_days), l.ends_at);
  insert into public.org_join_links (org_id, licence_id, token_hash, email_domain, max_uses, expires_at, created_by)
  values (l.org_id, l.id, p_token_hash, v_domain, p_max_uses, v_exp, app.uid())
  returning id into v_id;
  perform app.audit('org.join_link_created', 'org_join_link:' || v_id::text, null, null, l.org_id, null,
    jsonb_build_object('licence', l.id, 'max_uses', p_max_uses, 'domain', v_domain is not null, 'expires_at', v_exp));
  return v_id;
end $$;

create or replace function app.org_join_link_revoke(p_link uuid) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare k public.org_join_links;
begin
  select * into k from public.org_join_links x where x.id = p_link for update;
  if not found or app.uid() is null or not app.org_can_manage_seats(k.org_id) then
    raise exception 'not allowed' using errcode = 'AKO01';
  end if;
  if k.revoked_at is not null then return false; end if;
  update public.org_join_links x set revoked_at = now() where x.id = k.id;
  perform app.audit('org.join_link_revoked', 'org_join_link:' || k.id::text, null, null, k.org_id, null, jsonb_build_object('licence', k.licence_id));
  return true;
end $$;

-- Anyone holding a link may ask what it is for: the organisation's name and
-- the email domain it asks for. Never a title.
create or replace function app.org_join_link_view(p_token_hash text)
returns table (state text, organisation_name text, organisation_kind text, email_domain text, expires_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  k public.org_join_links;
  l public.org_licences;
  o public.organisations;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return query select 'unknown'::text, null::text, null::text, null::text, null::timestamptz; return;
  end if;
  select * into k from public.org_join_links x where x.token_hash = p_token_hash;
  if not found then
    return query select 'unknown'::text, null::text, null::text, null::text, null::timestamptz; return;
  end if;
  select * into l from public.org_licences x where x.id = k.licence_id;
  select * into o from public.organisations x where x.id = k.org_id;
  return query select
    case when k.revoked_at is not null then 'revoked'
         when k.expires_at <= now() then 'expired'
         when l.status <> 'active' or l.ends_at <= now() or o.status in ('suspended','closed') then 'closed'
         when k.uses >= k.max_uses or app.org_licence_places_used(l.id) >= l.seats_purchased then 'full'
         else 'ok' end,
    o.display_name, o.kind, k.email_domain, k.expires_at;
end $$;

-- Take a seat with a link. Signed in, a button press, the 18 or over
-- confirmation, the account's email on the link's domain when it has one.
-- With a domain, the organisation's roster shows the account's address (the
-- page says so first); without one, it shows none. Idempotent for the same
-- person: a second claim returns the open seat.
create or replace function app.org_join_link_claim(p_token_hash text, p_adult boolean)
returns table (seat_id uuid, org_id uuid, organisation_name text, already boolean)
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid   uuid := app.uid();
  k       public.org_join_links;
  l       public.org_licences;
  v_name  text;
  v_email text;
  v_seat  uuid;
  v_ent   uuid;
  n       int;
begin
  if v_uid is null then
    raise exception 'sign in first' using errcode = 'AKO01';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'unknown link' using errcode = 'AKO04';
  end if;
  if p_adult is not true then
    raise exception 'confirm you are 18 or over' using errcode = 'AKO10';
  end if;
  select * into k from public.org_join_links x where x.token_hash = p_token_hash for update;
  if not found or k.revoked_at is not null or k.expires_at <= now() then
    raise exception 'this link cannot be used' using errcode = 'AKO04';
  end if;
  if exists (select 1 from public.account_deletion_requests d where d.user_id = v_uid and d.cancelled_at is null) then
    raise exception 'this account is scheduled for deletion' using errcode = 'AKO06';
  end if;
  select * into l from public.org_licences x where x.id = k.licence_id for update;
  if l.status <> 'active' or l.ends_at <= now()
     or exists (select 1 from public.organisations o where o.id = l.org_id and o.status in ('suspended','closed')) then
    raise exception 'this licence is not open' using errcode = 'AKO08';
  end if;
  select o.display_name into v_name from public.organisations o where o.id = l.org_id;
  select lower(u.email) into v_email from auth.users u where u.id = v_uid;
  if k.email_domain is not null and (v_email is null or split_part(v_email, '@', 2) <> k.email_domain) then
    raise exception 'this link is for % addresses', k.email_domain using errcode = 'AKO11';
  end if;
  if v_email is not null and exists (select 1 from public.org_seat_blocks b where b.org_id = l.org_id and b.email_hash = app.org_email_hash(v_email)) then
    raise exception 'this address asked not to be invited' using errcode = 'AKO09';
  end if;

  select s.id into v_seat from public.org_seats s where s.licence_id = l.id and s.user_id = v_uid and s.released_at is null;
  if v_seat is not null then
    return query select v_seat, l.org_id, v_name, true;
    return;
  end if;

  select count(*) into n from public.audit_log a
   where a.action = 'org.seat_claimed' and a.after ->> 'link' = k.id::text and a.at > now() - interval '1 hour';
  if n >= app.org_config_int('org_join_link_claims_per_hour', 30) then
    raise exception 'too many people used this link in the last hour' using errcode = 'AKO29';
  end if;
  if k.uses >= k.max_uses then
    raise exception 'this link has reached its limit' using errcode = 'AKO12';
  end if;
  if app.org_licence_places_used(l.id) >= l.seats_purchased then
    raise exception 'no seats left on this licence' using errcode = 'AKO07';
  end if;

  select e.id into v_ent from public.entitlements e
   where e.user_id = v_uid and e.tenant_id = l.tenant_id and e.workbook_id is null
     and e.source = 'team_seat' and e.org_licence_id = l.id
   for update;
  if v_ent is null then
    insert into public.entitlements (user_id, tenant_id, workbook_id, source, status, starts_at, ends_at, org_licence_id)
    values (v_uid, l.tenant_id, null, 'team_seat', 'active', l.starts_at, l.ends_at, l.id)
    returning id into v_ent;
  else
    update public.entitlements e set status = 'active', starts_at = l.starts_at, ends_at = l.ends_at where e.id = v_ent;
  end if;

  insert into public.org_seats (licence_id, org_id, user_id, invitation_id, entitlement_id, roster_email, join_link_id)
  values (l.id, l.org_id, v_uid, null, v_ent, case when k.email_domain is not null then v_email end, k.id)
  returning id into v_seat;
  update public.org_join_links x set uses = x.uses + 1 where x.id = k.id;
  update public.profiles p set adult_confirmed_at = coalesce(p.adult_confirmed_at, now()) where p.user_id = v_uid;
  insert into public.tenant_members (tenant_id, user_id, role) values (l.tenant_id, v_uid, 'reader') on conflict do nothing;

  perform app.audit('org.seat_claimed', 'org_seat:' || v_seat::text, null, null, l.org_id, null,
    jsonb_build_object('licence', l.id, 'link', k.id, 'entitlement', v_ent));
  return query select v_seat, l.org_id, v_name, false;
end $$;

-- For the bulk invite preview (F-225): places left on the licence and
-- invitations left today under 0024's daily limit.
create or replace function app.org_invite_quota(p_licence uuid)
returns table (places_left int, sends_left_today int)
language plpgsql stable security definer set search_path = '' as $$
declare
  l public.org_licences;
  n int;
begin
  select * into l from public.org_licences x where x.id = p_licence;
  if not found or app.uid() is null or not app.org_can_manage_seats(l.org_id) then
    raise exception 'not allowed' using errcode = 'AKO01';
  end if;
  select count(*) into n from public.audit_log a
   where a.action in ('org.seat_invited','org.seat_invite_resent') and a.org_id = l.org_id and a.at > now() - interval '1 day';
  return query select greatest(0, l.seats_purchased - app.org_licence_places_used(l.id)),
                      greatest(0, app.org_config_int('org_seat_invites_per_day', 50) - n);
end $$;

-- ---------------------------------------------------------------------------
-- 9. Self-serve sign-up (F-226). Behind the org_self_serve flag, seeded off.
-- The webhook calls this with the service role once Checkout completes. The
-- organiser becomes the organisation's owner. Idempotent on the subscription.
-- ---------------------------------------------------------------------------
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
  elsif p_plan in ('teams_seat_month','teams_seat_year') then
    v_kind := 'teams';
    if p_org_kind is null or p_org_kind not in ('business','charity') then raise exception 'org_invalid: kind' using errcode = 'AKO02'; end if;
    v_min := app.org_config_int('org_self_serve_teams_min', 2); v_max := app.org_config_int('org_self_serve_teams_max', 25);
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
  values (v_org, v_kind, 'membership', p_quantity, now(), now() + interval '2 days', 'active', p_subscription, true, p_user)
  returning id into v_licence;

  perform app.audit('organisation.created', 'organisation:' || v_org::text, 'self_serve', null, v_org, null,
    jsonb_build_object('kind', p_org_kind, 'slug', v_slug, 'country', v_country, 'customer', true, 'self_serve', true));
  perform app.audit('org.licence_created', 'org_licence:' || v_licence::text, 'self_serve', null, v_org, null,
    jsonb_build_object('kind', v_kind, 'title_scope', 'membership', 'seats', p_quantity, 'plan', p_plan));
  return v_licence;
end $$;

create or replace function app.org_self_serve_open() returns boolean
language sql stable security definer set search_path = '' as $$ select app.flag('org_self_serve') $$;

-- ---------------------------------------------------------------------------
-- 10. Members after an end, and the organisation's export (F-228).
-- ---------------------------------------------------------------------------

-- For the member: organisations whose licence ended in the last 90 days and
-- that give them no seat now. Their work is still theirs, read only.
create or replace function app.my_ended_org_seats()
returns table (organisation_name text, ended_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select x.display_name, x.released_at from (
    select distinct on (s.org_id) s.org_id, o.display_name, s.released_at
      from public.org_seats s join public.organisations o on o.id = s.org_id
     where s.user_id = app.uid() and s.released_reason = 'licence_ended' and s.released_at > now() - interval '90 days'
       and not exists (select 1 from public.org_seats s2 where s2.user_id = s.user_id and s2.org_id = s.org_id and s2.released_at is null)
     order by s.org_id, s.released_at desc) x
  order by x.released_at desc
$$;

-- The roster as CSV rows: the address the organisation invited (or the work
-- address a domain link recorded), when the seat was taken and released.
-- Never anything a person did or wrote.
create or replace function app.org_roster_export(p_org uuid)
returns table (licence_id uuid, licence_kind text, licence_starts_at timestamptz, licence_ends_at timestamptz,
               roster_email text, joined_by text, claimed_at timestamptz, released_at timestamptz, released_reason text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if app.uid() is null or p_org is null or not (app.org_can(p_org, 'seats', 'read') or app.is_staff()) then
    raise exception 'not allowed' using errcode = 'AKO01';
  end if;
  return query
    select l.id, l.kind, l.starts_at, coalesce(l.ended_at, l.ends_at),
           coalesce(s.roster_email, a.roster_email),
           case when s.invitation_id is not null then 'invitation' when s.join_link_id is not null then 'link' else 'other' end,
           s.claimed_at, s.released_at, s.released_reason
      from public.org_seats s
      join public.org_licences l on l.id = s.licence_id
      left join public.org_roster_archive a on a.seat_id = s.id
     where s.org_id = p_org
     order by l.starts_at, s.claimed_at, s.id;
end $$;

-- ---------------------------------------------------------------------------
-- 11. Offboarding sweep (F-228). Daily. An organisation whose licences have
-- all ended loses its roster and admin details once org_offboard_days have
-- passed since the last end, or once that month's pool has closed if that is
-- later (the pool split needs the seat dates). Members keep their accounts
-- and their work. Invoices, the billing mirror and ledger rows stay: they are
-- accounting records and hold no roster. Hashes of addresses that said no
-- stay too, so those people are not invited again.
-- ---------------------------------------------------------------------------
create or replace function app.org_offboard_due(p_org uuid) returns timestamptz
language plpgsql stable security definer set search_path = '' as $$
declare
  v_last timestamptz;
  cfg    public.royalty_config := app.royalty_config();
begin
  if not app.is_customer_org(p_org) then return null; end if;
  if not exists (select 1 from public.org_licences l where l.org_id = p_org) then return null; end if;
  if exists (select 1 from public.org_licences l where l.org_id = p_org and l.status <> 'ended') then return null; end if;
  select max(l.ended_at) into v_last from public.org_licences l where l.org_id = p_org;
  return greatest(v_last + make_interval(days => greatest(1, app.org_config_int('org_offboard_days', 30))),
                  app.month_start(app.month_after(app.money_month(v_last))) + make_interval(days => cfg.refund_window_days + 1));
end $$;

-- 0001's guard, with one way through: the sweep, for an organisation that is
-- due to be offboarded, inside the transaction that offboards it.
create or replace function app.guard_last_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- 0030
  if coalesce(current_setting('app.offboarding_org', true), '') = old.org_id::text
     and app.org_offboard_due(old.org_id) is not null then
    return coalesce(new, old);
  end if;
  if (tg_op = 'DELETE' and old.role = 'owner') or (tg_op = 'UPDATE' and old.role = 'owner' and new.role <> 'owner') then
    if not exists (select 1 from public.org_members where org_id = old.org_id and role = 'owner' and user_id <> old.user_id) then
      raise exception 'an organisation must keep at least one owner' using errcode = 'check_violation';
    end if;
  end if;
  return coalesce(new, old);
end $$;

create or replace function app.org_offboard_sweep() returns int
language plpgsql volatile security definer set search_path = '' as $$
declare
  o       record;
  v_due   timestamptz;
  v_seats int;
  v_admins int;
  n       int := 0;
begin
  if not app.is_service_role() then
    raise exception 'only the service role runs the offboarding sweep' using errcode = 'AKO01';
  end if;
  for o in
    select x.id from public.organisations x
     where app.is_customer_kind(x.kind)
       and not exists (select 1 from public.org_offboarded d where d.org_id = x.id)
       and exists (select 1 from public.org_licences l where l.org_id = x.id)
       and not exists (select 1 from public.org_licences l where l.org_id = x.id and l.status <> 'ended')
     order by x.id
  loop
    v_due := app.org_offboard_due(o.id);
    continue when v_due is null or v_due > now();
    perform set_config('app.offboarding_org', o.id::text, true);
    delete from public.org_roster_archive a where a.org_id = o.id;
    delete from public.org_join_links k where k.org_id = o.id;
    delete from public.org_seat_invitations i where i.org_id = o.id;
    delete from public.org_invitations i where i.org_id = o.id;
    delete from public.org_groups g where g.org_id = o.id;
    delete from public.org_seats s where s.org_id = o.id;
    get diagnostics v_seats = row_count;
    delete from public.org_members m where m.org_id = o.id;
    get diagnostics v_admins = row_count;
    update public.org_profiles p set billing_name = null, billing_email = null where p.org_id = o.id;
    update public.organisations x set status = 'closed' where x.id = o.id;
    insert into public.org_offboarded (org_id, last_ended_at, seats_deleted, admins_removed)
    select o.id, max(l.ended_at), v_seats, v_admins from public.org_licences l where l.org_id = o.id;
    perform set_config('app.offboarding_org', '', true);
    perform app.audit('org.offboarded', 'organisation:' || o.id::text, null, null, o.id, null,
      jsonb_build_object('seats_deleted', v_seats, 'admins_removed', v_admins));
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- 12. RPC wrappers. Security invoker: the app functions do the checks.
-- ---------------------------------------------------------------------------
create or replace function public.org_billing_apply(
  p_subscription text, p_customer text, p_licence uuid, p_status text, p_plan text, p_price text,
  p_quantity int, p_collection text, p_days_until_due int,
  p_period_start timestamptz, p_period_end timestamptz,
  p_cancel_at_period_end boolean, p_cancel_at timestamptz, p_canceled_at timestamptz, p_ended_at timestamptz,
  p_livemode boolean, p_observed_at timestamptz
) returns text
language sql volatile security invoker set search_path = '' as $$
  select app.org_billing_apply(p_subscription, p_customer, p_licence, p_status, p_plan, p_price, p_quantity, p_collection,
    p_days_until_due, p_period_start, p_period_end, p_cancel_at_period_end, p_cancel_at, p_canceled_at, p_ended_at, p_livemode, p_observed_at) $$;
create or replace function public.org_billing_record_invoice(
  p_invoice text, p_subscription text, p_number text, p_status text, p_payment_failed boolean,
  p_currency text, p_amount_due int, p_amount_paid int, p_tax int, p_po text, p_collection text, p_billing_reason text,
  p_period_start timestamptz, p_period_end timestamptz, p_due_at timestamptz, p_paid_at timestamptz,
  p_hosted_url text, p_pdf_url text, p_livemode boolean, p_observed_at timestamptz
) returns text
language sql volatile security invoker set search_path = '' as $$
  select app.org_billing_record_invoice(p_invoice, p_subscription, p_number, p_status, p_payment_failed, p_currency, p_amount_due,
    p_amount_paid, p_tax, p_po, p_collection, p_billing_reason, p_period_start, p_period_end, p_due_at, p_paid_at, p_hosted_url,
    p_pdf_url, p_livemode, p_observed_at) $$;
create or replace function public.record_org_licence_receipt(p_invoice text, p_livemode boolean, p_payment_intent text default null,
  p_balance_txn text default null, p_fee_minor int default null) returns text
language sql volatile security invoker set search_path = '' as $$
  select app.record_org_licence_receipt(p_invoice, p_livemode, p_payment_intent, p_balance_txn, p_fee_minor) $$;
create or replace function public.org_billing_link_check(p_licence uuid)
returns table (org_id uuid, kind text, seats int, legal_name text, display_name text, country text,
               billing_name text, billing_email text, vat_number text)
language sql stable security invoker set search_path = '' as $$ select * from app.org_billing_link_check(p_licence) $$;
create or replace function public.org_billing_seat_change_check(p_licence uuid, p_quantity int) returns text
language sql volatile security invoker set search_path = '' as $$ select app.org_billing_seat_change_check(p_licence, p_quantity) $$;
create or replace function public.org_licence_end_request(p_licence uuid) returns text
language sql volatile security invoker set search_path = '' as $$ select app.org_licence_end_request(p_licence) $$;
create or replace function public.org_billing_end_allowed(p_licence uuid) returns boolean
language sql stable security invoker set search_path = '' as $$ select app.org_billing_end_allowed(p_licence) $$;
create or replace function public.org_join_link_create(p_licence uuid, p_token_hash text, p_days int, p_max_uses int, p_domain text) returns uuid
language sql volatile security invoker set search_path = '' as $$ select app.org_join_link_create(p_licence, p_token_hash, p_days, p_max_uses, p_domain) $$;
create or replace function public.org_join_link_revoke(p_link uuid) returns boolean
language sql volatile security invoker set search_path = '' as $$ select app.org_join_link_revoke(p_link) $$;
create or replace function public.org_join_link_view(p_token_hash text)
returns table (state text, organisation_name text, organisation_kind text, email_domain text, expires_at timestamptz)
language sql stable security invoker set search_path = '' as $$ select * from app.org_join_link_view(p_token_hash) $$;
create or replace function public.org_join_link_claim(p_token_hash text, p_adult boolean)
returns table (seat_id uuid, org_id uuid, organisation_name text, already boolean)
language sql volatile security invoker set search_path = '' as $$ select * from app.org_join_link_claim(p_token_hash, p_adult) $$;
create or replace function public.org_invite_quota(p_licence uuid)
returns table (places_left int, sends_left_today int)
language sql stable security invoker set search_path = '' as $$ select * from app.org_invite_quota(p_licence) $$;
create or replace function public.org_self_serve_provision(
  p_user uuid, p_plan text, p_org_kind text, p_name text, p_country text, p_billing_email text, p_subscription text, p_quantity int
) returns uuid
language sql volatile security invoker set search_path = '' as $$
  select app.org_self_serve_provision(p_user, p_plan, p_org_kind, p_name, p_country, p_billing_email, p_subscription, p_quantity) $$;
create or replace function public.org_self_serve_open() returns boolean
language sql stable security invoker set search_path = '' as $$ select app.org_self_serve_open() $$;
create or replace function public.my_ended_org_seats()
returns table (organisation_name text, ended_at timestamptz)
language sql stable security invoker set search_path = '' as $$ select * from app.my_ended_org_seats() $$;
create or replace function public.org_roster_export(p_org uuid)
returns table (licence_id uuid, licence_kind text, licence_starts_at timestamptz, licence_ends_at timestamptz,
               roster_email text, joined_by text, claimed_at timestamptz, released_at timestamptz, released_reason text)
language sql stable security invoker set search_path = '' as $$ select * from app.org_roster_export(p_org) $$;
create or replace function public.org_offboard_sweep() returns int
language sql volatile security invoker set search_path = '' as $$ select app.org_offboard_sweep() $$;

-- Execute: revoke from everyone, then give back to the roles that need it.
revoke execute on function
  app.org_plan_is_band(text), app.org_income_source(text), app.org_licence_end_inner(uuid, text),
  app.org_seats_archive_on_end(), app.royalty_receipt_org_licence(),
  app.org_billing_apply(text, text, uuid, text, text, text, int, text, int, timestamptz, timestamptz, boolean, timestamptz, timestamptz, timestamptz, boolean, timestamptz),
  app.org_billing_record_invoice(text, text, text, text, boolean, text, int, int, int, text, text, text, timestamptz, timestamptz, timestamptz, timestamptz, text, text, boolean, timestamptz),
  app.record_org_licence_receipt(text, boolean, text, text, int),
  app.org_billing_link_check(uuid), app.org_billing_seat_change_check(uuid, int), app.org_licence_end_request(uuid), app.org_billing_end_allowed(uuid),
  app.org_join_link_create(uuid, text, int, int, text), app.org_join_link_revoke(uuid), app.org_join_link_view(text),
  app.org_join_link_claim(text, boolean), app.org_invite_quota(uuid),
  app.org_self_serve_provision(uuid, text, text, text, text, text, text, int), app.org_self_serve_open(),
  app.my_ended_org_seats(), app.org_roster_export(uuid), app.org_offboard_due(uuid), app.org_offboard_sweep()
  from public, anon, authenticated;
revoke execute on function
  public.org_billing_apply(text, text, uuid, text, text, text, int, text, int, timestamptz, timestamptz, boolean, timestamptz, timestamptz, timestamptz, boolean, timestamptz),
  public.org_billing_record_invoice(text, text, text, text, boolean, text, int, int, int, text, text, text, timestamptz, timestamptz, timestamptz, timestamptz, text, text, boolean, timestamptz),
  public.record_org_licence_receipt(text, boolean, text, text, int),
  public.org_billing_link_check(uuid), public.org_billing_seat_change_check(uuid, int), public.org_licence_end_request(uuid), public.org_billing_end_allowed(uuid),
  public.org_join_link_create(uuid, text, int, int, text), public.org_join_link_revoke(uuid), public.org_join_link_view(text),
  public.org_join_link_claim(text, boolean), public.org_invite_quota(uuid),
  public.org_self_serve_provision(uuid, text, text, text, text, text, text, int), public.org_self_serve_open(),
  public.my_ended_org_seats(), public.org_roster_export(uuid), public.org_offboard_sweep()
  from public, anon, authenticated;

-- The server (service role) alone: the webhook mirror, receipts, provisioning, the sweep.
grant execute on function
  app.org_billing_apply(text, text, uuid, text, text, text, int, text, int, timestamptz, timestamptz, boolean, timestamptz, timestamptz, timestamptz, boolean, timestamptz),
  app.org_billing_record_invoice(text, text, text, text, boolean, text, int, int, int, text, text, text, timestamptz, timestamptz, timestamptz, timestamptz, text, text, boolean, timestamptz),
  app.record_org_licence_receipt(text, boolean, text, text, int),
  app.org_self_serve_provision(uuid, text, text, text, text, text, text, int), app.org_offboard_sweep(),
  public.org_billing_apply(text, text, uuid, text, text, text, int, text, int, timestamptz, timestamptz, boolean, timestamptz, timestamptz, timestamptz, boolean, timestamptz),
  public.org_billing_record_invoice(text, text, text, text, boolean, text, int, int, int, text, text, text, timestamptz, timestamptz, timestamptz, timestamptz, text, text, boolean, timestamptz),
  public.record_org_licence_receipt(text, boolean, text, text, int),
  public.org_self_serve_provision(uuid, text, text, text, text, text, text, int), public.org_offboard_sweep()
  to service_role;
-- Anyone holding a join link may ask what it is for. Anyone may ask whether
-- self-serve is open.
grant execute on function app.org_join_link_view(text), public.org_join_link_view(text),
  app.org_self_serve_open(), public.org_self_serve_open() to anon, authenticated, service_role;
-- Signed-in callers. Each function checks the caller's role itself.
grant execute on function
  app.org_billing_link_check(uuid), app.org_billing_seat_change_check(uuid, int), app.org_licence_end_request(uuid), app.org_billing_end_allowed(uuid),
  app.org_join_link_create(uuid, text, int, int, text), app.org_join_link_revoke(uuid), app.org_join_link_claim(text, boolean),
  app.org_invite_quota(uuid), app.my_ended_org_seats(), app.org_roster_export(uuid),
  public.org_billing_link_check(uuid), public.org_billing_seat_change_check(uuid, int), public.org_licence_end_request(uuid), public.org_billing_end_allowed(uuid),
  public.org_join_link_create(uuid, text, int, int, text), public.org_join_link_revoke(uuid), public.org_join_link_claim(text, boolean),
  public.org_invite_quota(uuid), public.my_ended_org_seats(), public.org_roster_export(uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 13. Row level security. Reads only; every write goes through a function.
-- ---------------------------------------------------------------------------
alter table public.org_subscriptions  enable row level security;
alter table public.org_invoices       enable row level security;
alter table public.org_join_links     enable row level security;
alter table public.org_roster_archive enable row level security;
alter table public.org_offboarded     enable row level security;

revoke all on public.org_subscriptions, public.org_invoices, public.org_join_links, public.org_roster_archive, public.org_offboarded
  from anon, authenticated;

-- Billing: the organisation's billing roles (owner, finance) and staff.
grant select on public.org_subscriptions to authenticated;
create policy org_subscriptions_read on public.org_subscriptions for select to authenticated
  using ((select app.org_can(org_id, 'billing', 'read')) or (select app.is_staff()));
grant select on public.org_invoices to authenticated;
create policy org_invoices_read on public.org_invoices for select to authenticated
  using ((select app.org_can(org_id, 'billing', 'read')) or (select app.is_staff()));

-- Join links: seat managers and staff. Never the token hash.
grant select (id, org_id, licence_id, email_domain, max_uses, uses, expires_at, created_by, created_at, revoked_at)
  on public.org_join_links to authenticated;
create policy org_join_links_read on public.org_join_links for select to authenticated
  using ((select app.org_can(org_id, 'seats', 'manage')) or (select app.is_staff()));

-- org_roster_archive and org_offboarded: no client reads (the export function reads the archive).

grant select, insert, update, delete on public.org_subscriptions, public.org_invoices, public.org_join_links,
  public.org_roster_archive, public.org_offboarded to service_role;
