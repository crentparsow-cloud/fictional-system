-- 0046 Pricing decisions, 15 October 2026 (Crent).
--
-- Depends on 0001 to 0045. Nothing earlier is edited. Four earlier functions
-- are replaced with their bodies copied from 0041 and one change each, marked
-- "0046". The royalty_balances view is replaced with one change, marked too.
--
-- 1. Membership prices (public.price_points, GBP, VAT inclusive):
--      member_month      GBP 7.99 a month
--      member_year       GBP 69.99 a year (shown as GBP 5.83 a month, billed yearly)
--      member_two_month  GBP 11.99 a month, two people
--      member_two_year   GBP 104.99 a year, two people (new point)
--    The workbook ladder (p1 to p6, GBP 7.99 to GBP 14.99) is untouched.
--    The new point is accepted by subscriptions.plan, checkout_consents.plan,
--    the seat functions, the checkout consent and the subscription upsert.
--    The six-month terms reminder stays on the monthly plans only, as before.
-- 2. Trials: 14 days monthly and 21 days annual, card required, in app_config.
--    The two-person plans have no trial (set in the checkout route, not here).
-- 3. Author shares, in a new royalty_config row (the table is append-only):
--      sale_rate_author_link  0.80  sales through the author's own link
--      sale_rate_author       0.65  marketplace sales
--      pool_share_author      0.50  of net membership revenue, per period
--    Shares are of the net sale value after card processing: fee_treatment
--    stays 'deduct'. Two-person plan income counts once (0041, unchanged).
--    The pool basis (finished steps) is unchanged.
-- 4. Payouts: weekly, on Fridays, GBP 10.00 floor carried forward
--    (min_payout_minor GBP 1000). is_placeholder is false, so the Studio and
--    the console stop saying "placeholder". Live payouts stay locked in the
--    route until the go-live meeting, whatever this row says.
-- 5. Weekly settlement. Until now only money in a closed month was payable,
--    which made a weekly run pay monthly. When the config says weekly, a
--    ledger line is payable once it is older than refund_window_days (14);
--    when it says monthly, the closed-statement rule of 0021 stands. The
--    change is in public.royalty_balances, which payout_candidates reads.

-- ---------------------------------------------------------------------------
-- 1. Prices
-- ---------------------------------------------------------------------------
insert into public.price_points (id, kind, amounts, active) values
  ('member_month',     'membership', '{"GBP": 799}'::jsonb,   true),
  ('member_year',      'membership', '{"GBP": 6999}'::jsonb,  true),
  ('member_two_month', 'membership', '{"GBP": 1199}'::jsonb,  true),
  ('member_two_year',  'membership', '{"GBP": 10499}'::jsonb, true)
on conflict (id) do update
  set kind = excluded.kind,
      amounts = public.price_points.amounts || excluded.amounts,
      active = true;

alter table public.subscriptions drop constraint subscriptions_plan_is_membership;
alter table public.subscriptions add constraint subscriptions_plan_is_membership
  check (plan is null or plan in ('member_month','member_year','member_two_month','member_two_year'));

alter table public.checkout_consents drop constraint checkout_consents_plan_check;
alter table public.checkout_consents add constraint checkout_consents_plan_check
  check (plan is null or plan in ('member_month','member_year','member_two_month','member_two_year'));

-- ---------------------------------------------------------------------------
-- 2. Trials
-- ---------------------------------------------------------------------------
insert into public.app_config (key, value) values
  ('membership_trial_days_monthly', '14'),
  ('membership_trial_days_yearly', '21')
on conflict (key) do update set value = excluded.value, updated_at = now();

-- ---------------------------------------------------------------------------
-- 3 and 4. Royalty figures and the payout calendar
-- ---------------------------------------------------------------------------
insert into public.royalty_config (effective_from, is_placeholder, sale_rate_author, sale_rate_author_link, pool_share_author,
  pool_step_cap, pool_activity_floor, fee_treatment, refund_window_days, first_payout_hold_days,
  min_payout_minor, approval_above_minor, payout_day, payout_cadence, payout_weekday, note)
select now(), false, 0.6500, 0.8000, 0.5000,
  c.pool_step_cap, c.pool_activity_floor, 'deduct', c.refund_window_days, c.first_payout_hold_days,
  c.min_payout_minor || '{"GBP": 1000}'::jsonb, c.approval_above_minor, c.payout_day, 'weekly', 5,
  'Decided 15 October 2026. Author 80% on own-link sales, 65% on marketplace sales, of net after card processing. Pool 50% of net membership revenue. Weekly on Fridays, GBP 10.00 floor carried forward.'
from app.royalty_config() c;

-- ---------------------------------------------------------------------------
-- 5. Balances. Same columns as 0021. 0046: what counts as settled depends on
-- the cadence in force.
-- ---------------------------------------------------------------------------
create or replace view public.royalty_balances with (security_invoker = true) as
select l.org_id, l.currency, l.livemode,
       sum(l.author_minor)::bigint as balance_minor,
       coalesce(sum(l.author_minor) filter (where l.kind in ('payout','payout_reversal')
         or case (select c.payout_cadence from app.royalty_config() c)
              when 'weekly' then l.occurred_at <= now() - make_interval(days => (select c.refund_window_days from app.royalty_config() c))
              else s.id is not null end), 0)::bigint as settled_minor,
       coalesce((select sum(p.amount_minor) from public.payouts p
                  where p.org_id = l.org_id and p.currency = l.currency and p.livemode = l.livemode
                    and p.status in ('awaiting_approval','pending')), 0)::bigint as pending_payout_minor,
       greatest(0, least(sum(l.author_minor),
         coalesce(sum(l.author_minor) filter (where l.kind in ('payout','payout_reversal')
           or case (select c.payout_cadence from app.royalty_config() c)
                when 'weekly' then l.occurred_at <= now() - make_interval(days => (select c.refund_window_days from app.royalty_config() c))
                else s.id is not null end), 0))
         - coalesce((select sum(p.amount_minor) from public.payouts p
                  where p.org_id = l.org_id and p.currency = l.currency and p.livemode = l.livemode
                    and p.status in ('awaiting_approval','pending')), 0))::bigint as payable_minor,
       max(s.period) as last_closed_period,
       bool_or(l.is_placeholder_rate) as has_placeholder_rate
  from public.royalty_lines l
  left join public.statements s
    on s.org_id = l.org_id and s.period = l.period and s.currency = l.currency and s.livemode = l.livemode
 group by l.org_id, l.currency, l.livemode;

-- ---------------------------------------------------------------------------
-- 6. Replaced functions (bodies from 0041, "member_two_year" added)
-- ---------------------------------------------------------------------------
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
    if p_plan is null or p_plan not in ('member_month','member_year','member_two_month','member_two_year') then
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
  v_plan   text := case when p_plan in ('member_month','member_year','member_two_month','member_two_year') then p_plan else null end;
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
   where user_id = v_uid and tenant_id = p_tenant and plan in ('member_two_month','member_two_year') and status in ('active','trialing')
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
     where s.user_id = v_uid and s.tenant_id = p_tenant and s.plan in ('member_two_month','member_two_year') and s.status in ('active','trialing','past_due')
     order by s.created_at desc limit 1;
end $$;
