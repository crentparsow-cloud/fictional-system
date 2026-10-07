-- 0010 Membership settings: the product owner's decisions on the grace
-- period, demo titles, interim membership prices and renewal reminder
-- idempotency (F-097, F-114, F-093, F-098).
--
-- Same rules as 0001 to 0009. Every new table has RLS on, with grants to
-- anon and authenticated revoked. Depends on 0001 to 0009. Nothing in 0001
-- to 0009 is edited: where an earlier rule changes, it is replaced here.
--
-- What changes:
--   1. The grace period after a failed renewal is 14 days. Stripe Smart
--      Retries' recommended setting is 8 tries within 2 weeks, and Stripe is
--      set to cancel the subscription when the retries end, so access and
--      billing stop together.
--   2. Demo titles are not in the membership. Demo titles cannot be bought
--      (F-114), and a membership is a way of buying. Existing demo rows are
--      taken out, and a trigger keeps every demo workbook out on insert and
--      update. The paywall on a demo title is unchanged: no buy buttons.
--   3. Interim membership prices, test mode, until Crent confirms them:
--      GBP 7.99 a month and GBP 69.99 a year, VAT inclusive, no free trial
--      (every workbook already has a free first unit). The membership's
--      Stripe price ids live in the environment (STRIPE_PRICE_MEMBERSHIP_*,
--      apps/web/lib/membership.ts), not in price_points, so the 0004 rule
--      that an active point needs a stripe_price_id now applies to workbook
--      points only.
--   5. app.due_deletion_customers(): every Stripe customer linked to a
--      reader whose deletion is due, live membership or not, so the
--      deletion job can redact each one before the rows that link them go.
--   4. public.email_claims: one row per email that must go once only, such
--      as the renewal reminder for one subscription and one renewal date.
--      The webhook's mailer claims the key before it sends and releases it
--      if the send fails, so a repeated Stripe delivery sends nothing new
--      and a failed send can be retried. Keys carry Stripe ids and dates
--      only, never an address or a title.

-- ---------------------------------------------------------------------------
-- 1. Grace: 14 days. The fallback in app.membership_grace() follows, so a
-- missing row gives the same answer as the seeded one.
-- ---------------------------------------------------------------------------
insert into public.app_config (key, value) values ('membership_grace_days', '14')
on conflict (key) do update set value = excluded.value, updated_at = now();

create or replace function app.membership_grace() returns interval
language sql stable security definer set search_path = '' as $$
  select make_interval(days => greatest(0, coalesce(
    (select (value #>> '{}')::int from public.app_config where key = 'membership_grace_days'), 14)))
$$;

-- ---------------------------------------------------------------------------
-- 2. Demo titles are never in the membership.
-- ---------------------------------------------------------------------------
update public.workbooks set in_membership = false where is_demo and in_membership;

-- Runs before insert and before any update that touches is_demo or
-- in_membership. It corrects rather than refuses, so a content import that
-- leaves in_membership at its default still lands a demo title correctly.
-- It sorts before workbooks_membership_guard, so the guard sees the
-- corrected value.
create or replace function app.demo_not_in_membership() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.is_demo then
    new.in_membership := false;
  end if;
  return new;
end $$;
create trigger workbooks_demo_not_in_membership before insert or update of is_demo, in_membership on public.workbooks
  for each row execute function app.demo_not_in_membership();

-- ---------------------------------------------------------------------------
-- 3. Interim membership prices for the GBP market, in minor units, VAT
-- inclusive. PLACEHOLDER until Crent confirms the figures: change the rows,
-- not the code. Other currencies stay empty, so a reader outside the GBP
-- market sees "Price to be confirmed" (F-094).
-- ---------------------------------------------------------------------------
alter table public.price_points drop constraint price_points_active_needs_amounts;
alter table public.price_points add constraint price_points_active_needs_amounts
  check (not active or (amounts <> '{}'::jsonb and (stripe_price_id is not null or kind = 'membership')));

insert into public.price_points (id, kind, amounts, active) values
  ('member_month', 'membership', '{"GBP": 799}'::jsonb,  true),
  ('member_year',  'membership', '{"GBP": 6999}'::jsonb, true)
on conflict (id) do update
  set kind = excluded.kind,
      amounts = public.price_points.amounts || excluded.amounts,
      active = true;

-- ---------------------------------------------------------------------------
-- 4. Email claims. Service role only, through the two functions below.
-- ---------------------------------------------------------------------------
create table public.email_claims (
  dedupe_key text primary key check (length(dedupe_key) between 1 and 200 and dedupe_key !~ '@'),
  claimed_at timestamptz not null default now()
);

-- True when this call took the key, false when it was already taken.
create or replace function app.claim_email(p_key text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  if not app.is_service_role() then
    raise exception 'only the service role claims emails' using errcode = 'insufficient_privilege';
  end if;
  insert into public.email_claims (dedupe_key) values (p_key) on conflict (dedupe_key) do nothing;
  get diagnostics n = row_count;
  return n = 1;
end $$;

-- Frees a key after a failed send so a later delivery can try again.
create or replace function app.release_email(p_key text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  if not app.is_service_role() then
    raise exception 'only the service role releases emails' using errcode = 'insufficient_privilege';
  end if;
  delete from public.email_claims where dedupe_key = p_key;
  get diagnostics n = row_count;
  return n = 1;
end $$;

create or replace function public.claim_email(p_key text) returns boolean
language sql security invoker set search_path = '' as $$
  select app.claim_email(p_key)
$$;
create or replace function public.release_email(p_key text) returns boolean
language sql security invoker set search_path = '' as $$
  select app.release_email(p_key)
$$;

revoke execute on function app.claim_email(text), app.release_email(text) from public;
revoke execute on function public.claim_email(text), public.release_email(text) from public, anon, authenticated;
grant execute on function app.claim_email(text), app.release_email(text),
  public.claim_email(text), public.release_email(text) to service_role;

alter table public.email_claims enable row level security;
revoke all on public.email_claims from anon, authenticated;
-- No policy for anon or authenticated: nobody reads or writes this from a
-- client. The service role grant is what Supabase gives by default; plain
-- Postgres (the test harness) needs it said.
grant select, insert, delete on public.email_claims to service_role;

-- ---------------------------------------------------------------------------
-- 5. The Stripe customers of readers whose deletion is due, whatever the
-- state of their subscriptions. Read by the deletion job before
-- complete_due_deletions(), so it can redact each customer in Stripe.
-- ---------------------------------------------------------------------------
create or replace function app.due_deletion_customers()
returns table (user_id uuid, stripe_customer_id text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_service_role() then
    raise exception 'only the service role reads due deletions' using errcode = 'insufficient_privilege';
  end if;
  return query
    select distinct s.user_id, s.stripe_customer_id
      from public.account_deletion_requests d
      join public.subscriptions s on s.user_id = d.user_id
     where d.cancelled_at is null and d.completed_at is null and d.cancel_before <= now()
     order by s.user_id, s.stripe_customer_id;
end $$;
create or replace function public.due_deletion_customers()
returns table (user_id uuid, stripe_customer_id text)
language sql security invoker set search_path = '' as $$
  select * from app.due_deletion_customers()
$$;
revoke execute on function app.due_deletion_customers() from public;
revoke execute on function public.due_deletion_customers() from public, anon, authenticated;
grant execute on function app.due_deletion_customers(), public.due_deletion_customers() to service_role;
