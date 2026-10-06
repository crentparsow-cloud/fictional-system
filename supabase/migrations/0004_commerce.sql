-- 0004 Commerce: price points, purchases, entitlements and the entitlement
-- check that 0002 left a slot for (F-093 ladder, F-095 entitlements, F-096
-- checkout and webhook, F-098 receipts, F-114 demo cannot be bought).
--
-- Same rules as 0001 to 0003. Every table has RLS on. Grants to anon and
-- authenticated are revoked for the new tables and given back table by table.
-- Policies call the app.* helpers as (select app.fn(...)).
--
-- The shape of trust here:
--   * Prices are public data. The ladder rows are seeded with EMPTY amounts
--     because Crent has not set the figures (questions D1 to D4 and C4 are
--     open). Nothing can be sold while an amount is missing: the checkout
--     route refuses, and price_points.active stays false.
--   * A purchase is written only by server code. The checkout route inserts
--     a pending row with the service role before it sends the reader to
--     Stripe; the webhook marks it paid through app.grant_purchase_entitlement.
--     Readers read their own rows. Staff read all. Nobody deletes.
--   * Entitlements are the single answer to "can this reader open this".
--     Written only by the two functions below. A lapsed membership
--     (ends_at in the past) becomes read only: has_entitlement says no and
--     the reader keeps their answers. A buyer keeps access when a licence
--     ends, because a purchase entitlement has no ends_at (F-095).

-- ---------------------------------------------------------------------------
-- Price points: the ladder. One row per point, amounts per currency in minor
-- units, for example {"GBP": 1200, "EUR": 1400, "USD": 1500, "AUD": 2200,
-- "CAD": 2000, "NZD": 2400}. GBP leads; the others are fixed per point, not
-- converted (F-093). stripe_price_id is filled when the Stripe catalogue is
-- created in test mode. Workbook points are p1 to p6 by workbook length;
-- membership has a monthly and an annual point.
--
-- PLACEHOLDER: every row is seeded with amounts = '{}' and active = false.
-- Crent sets the GBP figures and the fixed foreign prices (C4, D1 to D4).
-- Until then apps/web/lib/pricing.ts shows "Price to be confirmed".
-- ---------------------------------------------------------------------------
create table public.price_points (
  id              text primary key check (id ~ '^[a-z][a-z0-9_]{0,31}$'),
  kind            text not null check (kind in ('workbook','membership')),
  amounts         jsonb not null default '{}'::jsonb,
  stripe_price_id text unique,
  active          boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- amounts is an object of ISO currency code to a whole number of minor units
  constraint price_points_amounts_object check (jsonb_typeof(amounts) = 'object'),
  -- a point cannot go active with no amounts and no Stripe price behind it
  constraint price_points_active_needs_amounts check (not active or (amounts <> '{}'::jsonb and stripe_price_id is not null))
);
create trigger price_points_touch before update on public.price_points for each row execute function app.touch_updated_at();

insert into public.price_points (id, kind, amounts, active) values
  ('p1',           'workbook',   '{}'::jsonb, false),
  ('p2',           'workbook',   '{}'::jsonb, false),
  ('p3',           'workbook',   '{}'::jsonb, false),
  ('p4',           'workbook',   '{}'::jsonb, false),
  ('p5',           'workbook',   '{}'::jsonb, false),
  ('p6',           'workbook',   '{}'::jsonb, false),
  ('member_month', 'membership', '{}'::jsonb, false),
  ('member_year',  'membership', '{}'::jsonb, false);

alter table public.workbooks
  add column price_point_id text references public.price_points(id);
create index workbooks_price_point_idx on public.workbooks(price_point_id);

-- ---------------------------------------------------------------------------
-- Purchases: one row per Stripe Checkout Session we started. kind workbook
-- carries a workbook_id; kind membership carries none and later a
-- subscription id. amount_minor and tax_minor are copied from the session
-- when it completes. Statements and receipts never carry a title: the Stripe
-- side only ever sees "Akana workbook" and the AK code (F-092, F-098).
-- ---------------------------------------------------------------------------
create table public.purchases (
  id                         uuid primary key default gen_random_uuid(),
  user_id                    uuid not null references auth.users(id) on delete cascade,
  tenant_id                  uuid not null references public.tenants(id),
  workbook_id                uuid references public.workbooks(id),
  kind                       text not null check (kind in ('workbook','membership')),
  price_point_id             text references public.price_points(id),
  stripe_checkout_session_id text not null unique,
  stripe_payment_intent_id   text,
  stripe_subscription_id     text,
  currency                   char(3) not null,
  amount_minor               integer not null default 0 check (amount_minor >= 0),
  tax_minor                  integer not null default 0 check (tax_minor >= 0),
  status                     text not null default 'pending' check (status in ('pending','paid','refunded','failed')),
  created_at                 timestamptz not null default now(),
  paid_at                    timestamptz,
  refunded_at                timestamptz,
  constraint purchases_kind_workbook check ((kind = 'workbook') = (workbook_id is not null))
);
create index purchases_user_idx on public.purchases(user_id, tenant_id);
create index purchases_workbook_idx on public.purchases(workbook_id);
create index purchases_payment_intent_idx on public.purchases(stripe_payment_intent_id);

-- ---------------------------------------------------------------------------
-- Entitlements. workbook_id null means library wide (membership, tenant
-- access). source says where it came from; gift and team_seat are reserved.
-- One row per user, tenant, workbook and source, with null workbook_id
-- treated as a value so a second membership grant updates the same row.
-- ---------------------------------------------------------------------------
create table public.entitlements (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  tenant_id   uuid not null references public.tenants(id),
  workbook_id uuid references public.workbooks(id),
  source      text not null check (source in ('free_unit','purchase','membership','tenant','gift','team_seat')),
  status      text not null default 'active' check (status in ('active','lapsed','revoked')),
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz,
  purchase_id uuid references public.purchases(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique nulls not distinct (user_id, tenant_id, workbook_id, source)
);
create index entitlements_workbook_idx on public.entitlements(workbook_id);
create index entitlements_purchase_idx on public.entitlements(purchase_id);
create trigger entitlements_touch before update on public.entitlements for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Helpers. Security definer, stable, search_path pinned, as in 0002.
-- ---------------------------------------------------------------------------

-- The tenant that owns the workbook a version belongs to.
create or replace function app.version_tenant(p_version uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select w.tenant_id from public.workbook_versions v
  join public.workbooks w on w.id = v.workbook_id
  where v.id = p_version
$$;

-- Is this request running as the service role? Inside a security definer
-- function current_user is the function owner, so the JWT role claim is the
-- only reliable signal. PostgREST sets it to service_role for the admin
-- client; the test shim sets it the same way.
create or replace function app.is_service_role() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(current_setting('request.jwt.claims', true), '{}')::jsonb ->> 'role' = 'service_role'
$$;

-- Can this user open this workbook on this tenant right now? True when an
-- active entitlement exists for the workbook, or library wide (workbook_id
-- null), that has started and has not ended. p_unit is accepted so callers
-- can pass the unit they are asking about; the free-unit rule (unit N free
-- when N <= structure.free_units, F-019) is already carried by
-- workbook_sections.free at publish time, so this function does not repeat
-- it. It is here so the signature does not change when per-unit rules arrive.
create or replace function app.has_entitlement(p_user uuid, p_tenant uuid, p_workbook uuid, p_unit int default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user is not null and p_tenant is not null and exists (
    select 1 from public.entitlements e
    where e.user_id = p_user
      and e.tenant_id = p_tenant
      and (e.workbook_id = p_workbook or e.workbook_id is null)
      and e.status = 'active'
      and e.starts_at <= now()
      and (e.ends_at is null or e.ends_at > now()))
$$;

-- ---------------------------------------------------------------------------
-- The slot 0002 left: an entitled reader loads the paid units, toolkit,
-- finish and keep_going. The free and listing branches are unchanged.
-- ---------------------------------------------------------------------------
drop policy workbook_sections_read on public.workbook_sections;
create policy workbook_sections_read on public.workbook_sections for select to anon, authenticated
  using (
    ((kind = 'listing' or free) and (select app.workbook_is_public(app.version_workbook(version_id))))
    or (select app.can_read_workbook(app.version_workbook(version_id)))
    or (select app.has_entitlement(app.uid(), app.version_tenant(version_id), app.version_workbook(version_id), unit_number))
  );

-- ---------------------------------------------------------------------------
-- Guard: demo content cannot be bought (F-114). Runs before insert and
-- before any update that points a purchase at a workbook. Security definer so
-- the workbook lookup never depends on the caller's read policy.
-- ---------------------------------------------------------------------------
create or replace function app.guard_purchase_not_demo() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.workbook_id is not null and exists (
       select 1 from public.workbooks w where w.id = new.workbook_id and w.is_demo) then
    raise exception 'demo workbook % cannot be bought', new.workbook_id using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger purchases_not_demo before insert or update of workbook_id on public.purchases
  for each row execute function app.guard_purchase_not_demo();

-- ---------------------------------------------------------------------------
-- Grant: the webhook's one call. Marks the purchase paid if it is not already,
-- upserts an active entitlement (purchase for a workbook, membership for a
-- library-wide row) and writes one audit row. Idempotent: a second call for a
-- paid purchase with an active entitlement changes nothing and writes no
-- second audit row. Only the service role or a platform owner or editor may
-- call it. Returns the entitlement id.
-- ---------------------------------------------------------------------------
create or replace function app.grant_purchase_entitlement(
  p_purchase uuid,
  p_payment_intent text default null,
  p_subscription text default null,
  p_amount_minor int default null,
  p_tax_minor int default null,
  p_currency text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  p        public.purchases%rowtype;
  v_source text;
  v_id     uuid;
  v_changed boolean := false;
begin
  if not (app.is_service_role() or app.is_platform(array['owner','editor'])) then
    raise exception 'only the service role or platform owners and editors grant entitlements' using errcode = 'insufficient_privilege';
  end if;

  select * into p from public.purchases where id = p_purchase for update;
  if not found then
    raise exception 'purchase % not found', p_purchase using errcode = 'no_data_found';
  end if;
  if p.status = 'refunded' then
    raise exception 'purchase % is refunded', p_purchase using errcode = 'object_not_in_prerequisite_state';
  end if;

  if p.status <> 'paid' then
    update public.purchases
       set status = 'paid',
           paid_at = coalesce(paid_at, now()),
           stripe_payment_intent_id = coalesce(p_payment_intent, stripe_payment_intent_id),
           stripe_subscription_id   = coalesce(p_subscription, stripe_subscription_id),
           amount_minor = coalesce(p_amount_minor, amount_minor),
           tax_minor    = coalesce(p_tax_minor, tax_minor),
           currency     = coalesce(upper(p_currency), currency)
     where id = p_purchase;
    v_changed := true;
  end if;

  v_source := case p.kind when 'workbook' then 'purchase' else 'membership' end;

  select id into v_id from public.entitlements
   where user_id = p.user_id and tenant_id = p.tenant_id
     and workbook_id is not distinct from p.workbook_id and source = v_source;

  if v_id is null then
    insert into public.entitlements (user_id, tenant_id, workbook_id, source, status, starts_at, ends_at, purchase_id)
    values (p.user_id, p.tenant_id, p.workbook_id, v_source, 'active', now(), null, p_purchase)
    returning id into v_id;
    v_changed := true;
  elsif exists (select 1 from public.entitlements e where e.id = v_id
                 and (e.status <> 'active' or e.purchase_id is distinct from p_purchase or e.ends_at is not null)) then
    -- a lapsed or revoked row comes back to life on a new paid purchase
    update public.entitlements
       set status = 'active', purchase_id = p_purchase, starts_at = least(starts_at, now()), ends_at = null
     where id = v_id;
    v_changed := true;
  end if;

  if v_changed then
    perform app.audit('commerce.grant_entitlement', 'purchase:' || p_purchase::text, null, p.tenant_id, null,
      jsonb_build_object('status', p.status),
      jsonb_build_object('status', 'paid', 'entitlement_id', v_id, 'workbook_id', p.workbook_id, 'kind', p.kind));
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Revoke: charge.refunded. Marks the purchase refunded and every entitlement
-- it granted revoked, with one audit row. Idempotent. Same callers as grant.
-- ---------------------------------------------------------------------------
create or replace function app.revoke_purchase_entitlement(p_purchase uuid, p_reason text default 'refund') returns int
language plpgsql security definer set search_path = '' as $$
declare
  p public.purchases%rowtype;
  n int := 0;
begin
  if not (app.is_service_role() or app.is_platform(array['owner','editor'])) then
    raise exception 'only the service role or platform owners and editors revoke entitlements' using errcode = 'insufficient_privilege';
  end if;

  select * into p from public.purchases where id = p_purchase for update;
  if not found then
    raise exception 'purchase % not found', p_purchase using errcode = 'no_data_found';
  end if;

  update public.entitlements set status = 'revoked'
   where purchase_id = p_purchase and status <> 'revoked';
  get diagnostics n = row_count;

  if p.status <> 'refunded' or n > 0 then
    update public.purchases set status = 'refunded', refunded_at = coalesce(refunded_at, now()) where id = p_purchase;
    perform app.audit('commerce.revoke_entitlement', 'purchase:' || p_purchase::text, p_reason, p.tenant_id, null,
      jsonb_build_object('status', p.status),
      jsonb_build_object('status', 'refunded', 'entitlements_revoked', n));
  end if;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- RPC wrappers. PostgREST exposes the public schema only, so the webhook's
-- admin client calls these and they call the app functions, which do the
-- authorisation. Execute is for the service role alone; anon and
-- authenticated have no reason to reach them.
-- ---------------------------------------------------------------------------
create or replace function public.grant_purchase_entitlement(
  p_purchase uuid,
  p_payment_intent text default null,
  p_subscription text default null,
  p_amount_minor int default null,
  p_tax_minor int default null,
  p_currency text default null
) returns uuid
language sql security invoker set search_path = '' as $$
  select app.grant_purchase_entitlement(p_purchase, p_payment_intent, p_subscription, p_amount_minor, p_tax_minor, p_currency)
$$;
create or replace function public.revoke_purchase_entitlement(p_purchase uuid, p_reason text default 'refund') returns int
language sql security invoker set search_path = '' as $$
  select app.revoke_purchase_entitlement(p_purchase, p_reason)
$$;
revoke execute on function public.grant_purchase_entitlement(uuid, text, text, int, int, text) from public, anon, authenticated;
revoke execute on function public.revoke_purchase_entitlement(uuid, text) from public, anon, authenticated;
grant execute on function public.grant_purchase_entitlement(uuid, text, text, int, int, text) to service_role;
grant execute on function public.revoke_purchase_entitlement(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.price_points enable row level security;
alter table public.purchases    enable row level security;
alter table public.entitlements enable row level security;

revoke all on public.price_points, public.purchases, public.entitlements from anon, authenticated;

-- price_points: read by everyone, prices are not secret. Written by
-- migrations and the service role only.
grant select on public.price_points to anon, authenticated;
create policy price_points_read on public.price_points for select to anon, authenticated using (true);

-- purchases: the reader reads their own; staff read all. No client writes.
-- The service role grant is what Supabase gives by default; plain Postgres
-- (the test harness) needs it said.
grant select on public.purchases to authenticated;
grant select, insert, update on public.purchases to service_role;
create policy purchases_read on public.purchases for select to authenticated
  using (user_id = (select app.uid()) or (select app.is_staff()));

-- entitlements: same shape. Written only through the functions above.
grant select on public.entitlements to authenticated;
grant select, insert, update on public.entitlements to service_role;
create policy entitlements_read on public.entitlements for select to authenticated
  using (user_id = (select app.uid()) or (select app.is_staff()));
