-- 0009 Memberships: monthly and annual membership in subscription mode, the
-- Stripe subscription mirror, the membership catalogue and the entitlement
-- that follows a subscription's state (F-097, F-095, F-098, F-025).
--
-- Same rules as 0001 to 0007. Every table has RLS on. Grants to anon and
-- authenticated are revoked for the new tables and given back table by table.
-- Policies call the app.* helpers as (select app.fn(...)). Depends on 0001 to
-- 0007 only.
--
-- The shape of trust here:
--   * public.subscriptions mirrors Stripe. It is written only by
--     app.upsert_subscription() and app.mark_subscription_cancelled(), which
--     the webhook and the deletion job call with the service role. A reader
--     reads their own rows. Staff read all. Nobody deletes from a client.
--   * Membership access is still one row in public.entitlements (source
--     membership, workbook_id null), so has_entitlement stays the single
--     check. app.sync_membership_entitlement() keeps that row in step with
--     the reader's subscriptions:
--       active or trialing      active, no end date
--       past_due                active until past_due_since plus the grace
--                               period, then has_entitlement says no on its own
--       anything else           lapsed (read only, answers kept)
--     A reader with no subscription rows at all is left alone, so the grant
--     that checkout.session.completed makes is not undone while
--     customer.subscription.created is still on its way.
--   * The membership catalogue (question C1, recommended answer): a title is
--     in the membership unless its licence takes it out. workbooks.in_membership
--     defaults to true. Only platform owners and editors, or server code,
--     change it. A library-wide row with source membership opens only
--     catalogue titles; other library-wide sources (tenant access) are
--     unchanged.
--   * public.subscription_invoices keeps one row per paid or failed
--     membership invoice: amounts, tax and Stripe ids, never a title (F-098).
--     Like purchases, it outlives the account: user_id is set to null when
--     the auth user goes.
--   * Account deletion cannot finish while the reader still has a live
--     subscription in the mirror. The job cancels it in Stripe first
--     (apps/web/lib/account-complete.ts), records that here, then runs
--     complete_due_deletions(). A guard trigger refuses the completion
--     otherwise, so a failed cancel can never leave a paying subscription
--     behind a deleted account.

-- ---------------------------------------------------------------------------
-- Config. PLACEHOLDER: the grace period after a failed renewal is Crent's
-- figure (F-097). Seeded to the same 7 days as the deletion undo so the code
-- has a value; change the row, not the code.
-- ---------------------------------------------------------------------------
insert into public.app_config (key, value) values ('membership_grace_days', '7')
on conflict (key) do nothing;

create or replace function app.membership_grace() returns interval
language sql stable security definer set search_path = '' as $$
  select make_interval(days => greatest(0, coalesce(
    (select (value #>> '{}')::int from public.app_config where key = 'membership_grace_days'), 7)))
$$;

-- ---------------------------------------------------------------------------
-- The membership catalogue.
-- ---------------------------------------------------------------------------
alter table public.workbooks add column in_membership boolean not null default true;
create index workbooks_in_membership_idx on public.workbooks(id) where in_membership;

create or replace function app.workbook_in_membership(p_workbook uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.workbooks w where w.id = p_workbook and w.in_membership)
$$;

-- Org members may update their workbooks (0002), but whether a title is in
-- the membership is a licence term: platform owners and editors, or server
-- code, only. Runs as the caller, like app.guard_workbook_status().
create or replace function app.guard_workbook_membership() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated') and not app.is_platform(array['owner','editor'])
     and new.in_membership is distinct from old.in_membership then
    raise exception 'only platform owners and editors change whether a workbook is in the membership'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger workbooks_membership_guard before update of in_membership on public.workbooks
  for each row execute function app.guard_workbook_membership();

-- ---------------------------------------------------------------------------
-- has_entitlement, extended. Same signature and the same body as 0004, with
-- one change: a library-wide row whose source is membership opens a workbook
-- only when that workbook is in the membership catalogue. Grace for a
-- past_due member is carried by ends_at on the row, so it needs no branch here.
-- ---------------------------------------------------------------------------
create or replace function app.has_entitlement(p_user uuid, p_tenant uuid, p_workbook uuid, p_unit int default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user is not null and p_tenant is not null and exists (
    select 1 from public.entitlements e
    where e.user_id = p_user
      and e.tenant_id = p_tenant
      and (e.workbook_id = p_workbook
           or (e.workbook_id is null
               and (e.source <> 'membership' or p_workbook is null or app.workbook_in_membership(p_workbook))))
      and e.status = 'active'
      and e.starts_at <= now()
      and (e.ends_at is null or e.ends_at > now()))
$$;

-- ---------------------------------------------------------------------------
-- Subscriptions: one row per Stripe subscription. status uses Stripe's words.
-- plan is the price point (member_month or member_year). current_period_end
-- comes from the subscription item (it moved there in API 2025-03-31).
-- observed_at is when the state was read from Stripe; an older observation
-- never overwrites a newer one, so out-of-order webhooks are harmless.
-- ---------------------------------------------------------------------------
create table public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  tenant_id              uuid not null references public.tenants(id),
  stripe_customer_id     text not null check (stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  stripe_subscription_id text not null unique check (stripe_subscription_id ~ '^sub_[A-Za-z0-9]+$'),
  stripe_price_id        text,
  plan                   text references public.price_points(id),
  status                 text not null check (status in ('incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused')),
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  cancel_at              timestamptz,
  canceled_at            timestamptz,
  ended_at               timestamptz,
  past_due_since         timestamptz,
  observed_at            timestamptz not null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint subscriptions_plan_is_membership check (plan is null or plan in ('member_month','member_year'))
);
create index subscriptions_user_idx on public.subscriptions(user_id, tenant_id);
create index subscriptions_customer_idx on public.subscriptions(stripe_customer_id);
create index subscriptions_tenant_idx on public.subscriptions(tenant_id);
create trigger subscriptions_touch before update on public.subscriptions for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Subscription invoices: the money side of each renewal, for receipts in the
-- account (F-098) and the monthly pool (D3). Ids and amounts only.
-- ---------------------------------------------------------------------------
create table public.subscription_invoices (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid references auth.users(id) on delete set null,
  tenant_id              uuid not null references public.tenants(id),
  stripe_invoice_id      text not null unique check (stripe_invoice_id ~ '^in_[A-Za-z0-9]+$'),
  stripe_subscription_id text not null,
  status                 text not null check (status in ('paid','failed')),
  currency               char(3) not null,
  amount_minor           integer not null default 0 check (amount_minor >= 0),
  tax_minor              integer not null default 0 check (tax_minor >= 0),
  billing_reason         text,
  period_start           timestamptz,
  period_end             timestamptz,
  paid_at                timestamptz,
  failed_at              timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index subscription_invoices_user_idx on public.subscription_invoices(user_id, tenant_id);
create index subscription_invoices_subscription_idx on public.subscription_invoices(stripe_subscription_id);
create index subscription_invoices_tenant_idx on public.subscription_invoices(tenant_id);
create trigger subscription_invoices_touch before update on public.subscription_invoices for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Statuses that keep a membership open. past_due counts only inside grace.
-- ---------------------------------------------------------------------------
create or replace function app.subscription_is_live(p_status text, p_past_due_since timestamptz) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_status in ('active','trialing')
      or (p_status = 'past_due' and coalesce(p_past_due_since, now()) + app.membership_grace() > now())
$$;

-- ---------------------------------------------------------------------------
-- Keep the library-wide membership entitlement in step with the reader's
-- subscriptions on one tenant. Returns the entitlement status it settled on:
-- 'active', 'lapsed' or 'none' (no subscription rows: left alone).
-- Writes one audit row when the entitlement changes.
-- ---------------------------------------------------------------------------
create or replace function app.sync_membership_entitlement(p_user uuid, p_tenant uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_any     boolean;
  v_live    boolean;
  v_open    boolean;
  v_ends    timestamptz;
  v_id      uuid;
  v_before  public.entitlements%rowtype;
begin
  if not (app.is_service_role() or app.is_platform(array['owner','editor'])) then
    raise exception 'only the service role or platform owners and editors sync memberships' using errcode = 'insufficient_privilege';
  end if;
  if p_user is null or p_tenant is null then return 'none'; end if;

  select count(*) > 0,
         bool_or(app.subscription_is_live(s.status, s.past_due_since)),
         bool_or(s.status in ('active','trialing')),
         max(coalesce(s.past_due_since, now()) + app.membership_grace()) filter (where s.status = 'past_due')
    into v_any, v_live, v_open, v_ends
    from public.subscriptions s
   where s.user_id = p_user and s.tenant_id = p_tenant;

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

-- ---------------------------------------------------------------------------
-- Upsert from a webhook. Idempotent and order-safe:
--   'applied'   the row was inserted or changed, and the entitlement synced
--   'unchanged' the same state was seen before (a repeated delivery)
--   'stale'     an older observation than the one stored; nothing changes
--   'unlinked'  no reader to attach it to (no metadata, no earlier row for
--               the customer, or the auth user is gone); nothing changes
-- The reader and tenant come from the subscription's metadata on first
-- sight, or from an earlier row for the same Stripe customer. Once a row
-- exists its reader and tenant never change.
-- ---------------------------------------------------------------------------
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
  v_plan   text := case when p_plan in ('member_month','member_year') then p_plan else null end;
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

-- ---------------------------------------------------------------------------
-- The deletion job cancelled this subscription in Stripe. Record it now
-- rather than wait for customer.subscription.deleted, so the guard below
-- lets the deletion go ahead. Idempotent. Returns true when it changed a row.
-- ---------------------------------------------------------------------------
create or replace function app.mark_subscription_cancelled(p_subscription text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  s public.subscriptions%rowtype;
begin
  if not app.is_service_role() then
    raise exception 'only the service role records subscriptions' using errcode = 'insufficient_privilege';
  end if;
  update public.subscriptions
     set status = 'canceled',
         canceled_at = coalesce(canceled_at, now()),
         ended_at = coalesce(ended_at, now()),
         cancel_at_period_end = false,
         past_due_since = null,
         observed_at = greatest(observed_at, now())
   where stripe_subscription_id = p_subscription and status not in ('canceled','incomplete_expired')
   returning * into s;
  if not found then return false; end if;
  perform app.audit('commerce.subscription_status', 'subscription:' || p_subscription, 'account deletion', s.tenant_id, null,
    null, jsonb_build_object('status', 'canceled'));
  perform app.sync_membership_entitlement(s.user_id, s.tenant_id);
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- Record an invoice from invoice.paid or invoice.payment_failed. Idempotent:
-- a paid invoice stays paid if a late failure for the same invoice arrives.
-- Returns 'recorded', 'unchanged' or 'unlinked' (no subscription row yet).
-- ---------------------------------------------------------------------------
create or replace function app.record_subscription_invoice(
  p_invoice      text,
  p_subscription text,
  p_status       text,
  p_currency     text,
  p_amount_minor int,
  p_tax_minor    int,
  p_billing_reason text,
  p_period_start timestamptz,
  p_period_end   timestamptz,
  p_at           timestamptz
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  s  public.subscriptions%rowtype;
  i  public.subscription_invoices%rowtype;
begin
  if not app.is_service_role() then
    raise exception 'only the service role records invoices' using errcode = 'insufficient_privilege';
  end if;
  if p_status not in ('paid','failed') then
    raise exception 'invoice status must be paid or failed' using errcode = 'check_violation';
  end if;

  select * into s from public.subscriptions where stripe_subscription_id = p_subscription;
  if not found then return 'unlinked'; end if;

  select * into i from public.subscription_invoices where stripe_invoice_id = p_invoice for update;
  if not found then
    insert into public.subscription_invoices (user_id, tenant_id, stripe_invoice_id, stripe_subscription_id, status, currency,
      amount_minor, tax_minor, billing_reason, period_start, period_end, paid_at, failed_at)
    values (s.user_id, s.tenant_id, p_invoice, p_subscription, p_status, upper(p_currency),
      greatest(coalesce(p_amount_minor, 0), 0), greatest(coalesce(p_tax_minor, 0), 0), p_billing_reason, p_period_start, p_period_end,
      case when p_status = 'paid' then coalesce(p_at, now()) end,
      case when p_status = 'failed' then coalesce(p_at, now()) end);
    return 'recorded';
  end if;

  if i.status = 'paid' or (i.status = p_status) then
    return 'unchanged';
  end if;

  -- failed, now paid
  update public.subscription_invoices
     set status = 'paid', paid_at = coalesce(p_at, now()),
         amount_minor = greatest(coalesce(p_amount_minor, amount_minor), 0),
         tax_minor = greatest(coalesce(p_tax_minor, tax_minor), 0),
         currency = upper(coalesce(p_currency, currency))
   where id = i.id;
  return 'recorded';
end $$;

-- ---------------------------------------------------------------------------
-- The deletion job's first step: the live subscriptions of readers whose
-- deletion is due, so the job can cancel them in Stripe before it calls
-- complete_due_deletions().
-- ---------------------------------------------------------------------------
create or replace function app.due_deletion_subscriptions()
returns table (user_id uuid, stripe_subscription_id text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_service_role() then
    raise exception 'only the service role reads due deletions' using errcode = 'insufficient_privilege';
  end if;
  return query
    select s.user_id, s.stripe_subscription_id
      from public.account_deletion_requests d
      join public.subscriptions s on s.user_id = d.user_id
     where d.cancelled_at is null and d.completed_at is null and d.cancel_before <= now()
       and s.status not in ('canceled','incomplete_expired')
     order by d.cancel_before, s.created_at;
end $$;

-- Guard: a deletion cannot be marked complete while the reader still has a
-- subscription that Stripe could charge. complete_due_deletions() runs in
-- one transaction, so the raise rolls the whole run back and nothing is
-- deleted; the job retries after cancelling.
create or replace function app.guard_deletion_subscriptions() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.completed_at is not null and old.completed_at is null and exists (
       select 1 from public.subscriptions s
        where s.user_id = new.user_id and s.status not in ('canceled','incomplete_expired')) then
    raise exception 'cancel the membership in Stripe before the account is deleted'
      using errcode = 'object_not_in_prerequisite_state';
  end if;
  return new;
end $$;
create trigger account_deletion_requests_subscriptions before update of completed_at on public.account_deletion_requests
  for each row execute function app.guard_deletion_subscriptions();

-- ---------------------------------------------------------------------------
-- RPC wrappers. PostgREST exposes the public schema only. Security invoker:
-- the app functions do the checks. Service role only.
-- ---------------------------------------------------------------------------
create or replace function public.upsert_subscription(
  p_subscription text, p_customer text, p_user uuid, p_tenant uuid, p_status text, p_plan text, p_price text,
  p_current_period_end timestamptz, p_cancel_at_period_end boolean, p_cancel_at timestamptz,
  p_canceled_at timestamptz, p_ended_at timestamptz, p_observed_at timestamptz
) returns text
language sql security invoker set search_path = '' as $$
  select app.upsert_subscription(p_subscription, p_customer, p_user, p_tenant, p_status, p_plan, p_price,
    p_current_period_end, p_cancel_at_period_end, p_cancel_at, p_canceled_at, p_ended_at, p_observed_at)
$$;
create or replace function public.sync_membership_entitlement(p_user uuid, p_tenant uuid) returns text
language sql security invoker set search_path = '' as $$
  select app.sync_membership_entitlement(p_user, p_tenant)
$$;
create or replace function public.mark_subscription_cancelled(p_subscription text) returns boolean
language sql security invoker set search_path = '' as $$
  select app.mark_subscription_cancelled(p_subscription)
$$;
create or replace function public.record_subscription_invoice(
  p_invoice text, p_subscription text, p_status text, p_currency text, p_amount_minor int, p_tax_minor int,
  p_billing_reason text, p_period_start timestamptz, p_period_end timestamptz, p_at timestamptz
) returns text
language sql security invoker set search_path = '' as $$
  select app.record_subscription_invoice(p_invoice, p_subscription, p_status, p_currency, p_amount_minor, p_tax_minor,
    p_billing_reason, p_period_start, p_period_end, p_at)
$$;
create or replace function public.due_deletion_subscriptions()
returns table (user_id uuid, stripe_subscription_id text)
language sql security invoker set search_path = '' as $$
  select * from app.due_deletion_subscriptions()
$$;

revoke execute on function
  app.upsert_subscription(text, text, uuid, uuid, text, text, text, timestamptz, boolean, timestamptz, timestamptz, timestamptz, timestamptz),
  app.sync_membership_entitlement(uuid, uuid),
  app.mark_subscription_cancelled(text),
  app.record_subscription_invoice(text, text, text, text, int, int, text, timestamptz, timestamptz, timestamptz),
  app.due_deletion_subscriptions()
  from public;
revoke execute on function
  public.upsert_subscription(text, text, uuid, uuid, text, text, text, timestamptz, boolean, timestamptz, timestamptz, timestamptz, timestamptz),
  public.sync_membership_entitlement(uuid, uuid),
  public.mark_subscription_cancelled(text),
  public.record_subscription_invoice(text, text, text, text, int, int, text, timestamptz, timestamptz, timestamptz),
  public.due_deletion_subscriptions()
  from public, anon, authenticated;
grant execute on function
  app.upsert_subscription(text, text, uuid, uuid, text, text, text, timestamptz, boolean, timestamptz, timestamptz, timestamptz, timestamptz),
  app.sync_membership_entitlement(uuid, uuid),
  app.mark_subscription_cancelled(text),
  app.record_subscription_invoice(text, text, text, text, int, int, text, timestamptz, timestamptz, timestamptz),
  app.due_deletion_subscriptions(),
  public.upsert_subscription(text, text, uuid, uuid, text, text, text, timestamptz, boolean, timestamptz, timestamptz, timestamptz, timestamptz),
  public.sync_membership_entitlement(uuid, uuid),
  public.mark_subscription_cancelled(text),
  public.record_subscription_invoice(text, text, text, text, int, int, text, timestamptz, timestamptz, timestamptz),
  public.due_deletion_subscriptions()
  to service_role;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.subscriptions         enable row level security;
alter table public.subscription_invoices enable row level security;

revoke all on public.subscriptions, public.subscription_invoices from anon, authenticated;

-- The reader reads their own; staff read all. No client writes. The service
-- role grant is what Supabase gives by default; plain Postgres needs it said.
grant select on public.subscriptions to authenticated;
grant select, insert, update on public.subscriptions to service_role;
create policy subscriptions_read on public.subscriptions for select to authenticated
  using (user_id = (select app.uid()) or (select app.is_staff()));

grant select on public.subscription_invoices to authenticated;
grant select, insert, update on public.subscription_invoices to service_role;
create policy subscription_invoices_read on public.subscription_invoices for select to authenticated
  using (user_id = (select app.uid()) or (select app.is_staff()));
