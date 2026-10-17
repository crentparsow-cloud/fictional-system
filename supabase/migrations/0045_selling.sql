-- 0045 Selling: pause a membership, and the staff cancel (build list 14.24,
-- 14.25).
--
-- Same rules as 0001 to 0043. Nothing earlier is edited. RLS stays on, every
-- function is security definer with search_path pinned to '', and the guards
-- read the caller the way 0027 does. Depends on 0009, 0027 and 0041.
--
-- 1. subscriptions.paused_from and paused_until. A pause is a Stripe
--    pause_collection (invoices are voided, nothing is charged), set to start
--    at the end of the period the member has already paid for. The member
--    keeps access to that date. Between the two dates the membership is
--    suspended: the entitlement lapses, the answers stay readable (a lapsed
--    membership always leaves them readable), and nothing is charged. At
--    paused_until the next payment is taken and access carries on.
-- 2. app.membership_entitlement_apply (0041) learns the pause window. It is
--    the one place that decides whether a membership entitlement is open.
-- 3. app.record_subscription_pause: the webhook writes the window from the
--    Stripe subscription. Service role only. Idempotent.
-- 4. app.staff_cancel_membership: the check and the audit row for a cancel
--    that support makes for a reader who wrote in. The Stripe call is made by
--    the app after this returns the subscription id. Owner and support only.

-- ---------------------------------------------------------------------------
-- 1. The pause window
-- ---------------------------------------------------------------------------
alter table public.subscriptions
  add column paused_from  timestamptz,
  add column paused_until timestamptz,
  add constraint subscriptions_pause_window check (
    (paused_from is null and paused_until is null)
    or (paused_from is not null and paused_until is not null and paused_until > paused_from)
  );

-- ---------------------------------------------------------------------------
-- 2. The entitlement core, with the pause window. The body is 0041's.
--    For each subscription (and each seat on someone else's) the state is:
--      running      active or trialing, no pause in view: open ended
--      pause ahead  paused_until is in the future and paused_from is too:
--                   open until paused_from
--      paused now   paused_from has passed and paused_until has not: not live
--      past due     inside the grace period, as before
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
         bool_or(x.live),
         bool_or(x.open_ended),
         max(x.ends) filter (where x.live)
    into v_any, v_live, v_open, v_ends
    from (
      select y.status,
             -- live: the status says so, and no pause is running now
             (app.subscription_is_live(y.status, y.past_due_since) and not y.paused_now) as live,
             -- open ended: running with no pause ahead
             (y.status in ('active','trialing') and not y.paused_now and not y.pause_ahead) as open_ended,
             case
               when y.status = 'past_due' then coalesce(y.past_due_since, now()) + app.membership_grace()
               when y.pause_ahead then y.paused_from
               else null
             end as ends
        from (
          select s.status, s.past_due_since, s.paused_from,
                 coalesce(s.paused_from <= now() and s.paused_until > now(), false) as paused_now,
                 coalesce(s.paused_from > now() and s.paused_until > now(), false) as pause_ahead
            from public.subscriptions s
           where s.user_id = p_user and s.tenant_id = p_tenant
          union all
          -- 0041: a seat on someone else's subscription
          select case when m.status = 'active' then s.status else 'canceled' end,
                 case when m.status = 'active' then s.past_due_since end,
                 s.paused_from,
                 coalesce(m.status = 'active' and s.paused_from <= now() and s.paused_until > now(), false),
                 coalesce(m.status = 'active' and s.paused_from > now() and s.paused_until > now(), false)
            from public.membership_seats m
            join public.subscriptions s on s.id = m.subscription_id
           where m.member_user_id = p_user and m.tenant_id = p_tenant
        ) y
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

-- ---------------------------------------------------------------------------
-- 3. Record the pause window from Stripe. Both dates or neither. A window
--    that is not forward of now and already over is stored as none. Returns
--    'set', 'cleared', 'unchanged' or 'unknown' (no such subscription).
-- ---------------------------------------------------------------------------
create or replace function app.record_subscription_pause(p_subscription text, p_from timestamptz, p_until timestamptz) returns text
language plpgsql security definer set search_path = '' as $$
declare
  s      public.subscriptions%rowtype;
  v_from timestamptz := p_from;
  v_until timestamptz := p_until;
begin
  if not app.is_service_role() then
    raise exception 'only the service role records subscriptions' using errcode = 'insufficient_privilege';
  end if;
  if (v_from is null) <> (v_until is null) or (v_until is not null and v_until <= v_from) or (v_until is not null and v_until <= now()) then
    v_from := null;
    v_until := null;
  end if;
  select * into s from public.subscriptions where stripe_subscription_id = p_subscription for update;
  if not found then return 'unknown'; end if;
  if s.paused_from is not distinct from v_from and s.paused_until is not distinct from v_until then
    return 'unchanged';
  end if;
  update public.subscriptions set paused_from = v_from, paused_until = v_until where id = s.id;
  perform app.audit(case when v_from is null then 'commerce.subscription_resumed' else 'commerce.subscription_paused' end,
    'subscription:' || p_subscription, null, s.tenant_id, null,
    jsonb_build_object('paused_from', s.paused_from, 'paused_until', s.paused_until),
    jsonb_build_object('paused_from', v_from, 'paused_until', v_until));
  perform app.membership_entitlement_apply(s.user_id, s.tenant_id);
  return case when v_from is null then 'cleared' else 'set' end;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Staff cancel. Support, owner. The reader wrote to the support inbox and
--    asked to stop; any clear written statement counts, so this is one click
--    in the lookup. Returns the Stripe subscription id to cancel, and whether
--    the reader is in the 14-day window (the webhook does the refund). Raises
--    AKX08 when there is nothing to cancel.
-- ---------------------------------------------------------------------------
create or replace function app.staff_cancel_membership(p_user uuid, p_subscription text, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_reason text;
  s        public.subscriptions%rowtype;
begin
  v_reason := app.support_action_checks(p_user, p_reason, app.can_support_act());
  select * into s from public.subscriptions
   where stripe_subscription_id = p_subscription and user_id = p_user;
  if not found then
    raise exception 'that membership does not belong to this reader' using errcode = 'AKX04';
  end if;
  if s.status not in ('active', 'trialing', 'past_due') or s.cancel_at_period_end or s.cancel_at is not null then
    raise exception 'this membership is not running, or is already ending' using errcode = 'AKX08';
  end if;
  perform app.audit('account.membership_cancel_requested', 'user:' || p_user::text, v_reason, s.tenant_id, null,
    jsonb_build_object('status', s.status, 'plan', s.plan, 'cancel_at_period_end', s.cancel_at_period_end),
    jsonb_build_object('subscription', p_subscription, 'requested_by', 'support'));
  return jsonb_build_object('subscription', s.stripe_subscription_id, 'plan', s.plan, 'status', s.status,
                            'paused_from', s.paused_from, 'paused_until', s.paused_until);
end $$;

-- ---------------------------------------------------------------------------
-- Public wrappers and grants
-- ---------------------------------------------------------------------------
create or replace function public.record_subscription_pause(p_subscription text, p_from timestamptz, p_until timestamptz) returns text
language sql volatile security invoker set search_path = '' as $$
  select app.record_subscription_pause(p_subscription, p_from, p_until)
$$;
create or replace function public.staff_cancel_membership(p_user uuid, p_subscription text, p_reason text) returns jsonb
language sql volatile security invoker set search_path = '' as $$
  select app.staff_cancel_membership(p_user, p_subscription, p_reason)
$$;

revoke execute on function app.record_subscription_pause(text, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.record_subscription_pause(text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function app.record_subscription_pause(text, timestamptz, timestamptz) to service_role;
grant execute on function public.record_subscription_pause(text, timestamptz, timestamptz) to service_role;

revoke execute on function app.staff_cancel_membership(uuid, text, text) from public, anon;
revoke execute on function public.staff_cancel_membership(uuid, text, text) from public, anon;
grant execute on function app.staff_cancel_membership(uuid, text, text) to authenticated;
grant execute on function public.staff_cancel_membership(uuid, text, text) to authenticated;
