-- 0075 Review fixes, money (review of 21 November 2026: M8, M9, M10, M11, L7).
--
-- Safe to run twice. Nothing here deletes a row.
--
--  1. M11. subscriptions.started_at and trial_end, written from Stripe by
--     public.record_subscription_window. The cancel page reads them so it
--     counts the cooling-off period from the same day the webhook does.
--  2. M9. One live membership per reader and tenant: a partial unique index
--     over the statuses the app treats as live (trialing, active, past_due).
--     Stripe's own status "paused" is left out because the app shows it as
--     ended and offers a new membership; incomplete is left out so a failed
--     first payment can be tried again. Before the index is made, any later
--     live duplicate is marked canceled here (the oldest is kept) and
--     audited. The row stays, and the reader keeps access through the older
--     one. When the duplicate's next Stripe event arrives the webhook finds
--     the index in its way, cancels it at Stripe and refunds its latest
--     payment (lib/duplicate-subscription.ts).
--  3. M10. Disputes. public.payment_disputes holds one row per Stripe
--     dispute. Opening one suspends the access the payment gave: a workbook
--     purchase has its entitlement revoked (the ids are kept so it can come
--     back), a membership payment stamps subscriptions.dispute_suspended_at
--     and the entitlement sync treats that subscription as not live. Won:
--     access comes back. Lost: the purchase is marked refunded, or the
--     membership stays closed.
--  4. L7. A failed refund puts back the access a full refund took
--     (public.restore_after_failed_refund). A failed bank payout on an
--     author's Connect account is recorded, stamped on their latest payout
--     and holds further payouts (public.note_connect_payout_failed).
--  5. M8. public.referral_first_payment_intent, so a cooling-off cancel can
--     find the payment whose reward must go back.

-- ---------------------------------------------------------------------------
-- 1. The cooling-off window's inputs (M11), and the dispute stamp (M10).
-- ---------------------------------------------------------------------------
alter table public.subscriptions
  add column if not exists started_at timestamptz,
  add column if not exists trial_end timestamptz,
  add column if not exists dispute_suspended_at timestamptz;

create or replace function app.record_subscription_window(p_subscription text, p_started_at timestamptz, p_trial_end timestamptz) returns text
language plpgsql security definer set search_path = '' as $$
declare s public.subscriptions%rowtype;
begin
  if not app.is_service_role() then
    raise exception 'only the service role records subscriptions' using errcode = 'insufficient_privilege';
  end if;
  select * into s from public.subscriptions where stripe_subscription_id = p_subscription for update;
  if not found then return 'unknown'; end if;
  -- Stripe drops trial_end from nothing once set, so a null never clears a stored date.
  if s.started_at is not distinct from coalesce(p_started_at, s.started_at)
     and s.trial_end is not distinct from coalesce(p_trial_end, s.trial_end) then
    return 'unchanged';
  end if;
  update public.subscriptions
     set started_at = coalesce(p_started_at, started_at), trial_end = coalesce(p_trial_end, trial_end)
   where id = s.id;
  return 'set';
end $$;
create or replace function public.record_subscription_window(p_subscription text, p_started_at timestamptz, p_trial_end timestamptz) returns text
language sql volatile security invoker set search_path = '' as $$
  select app.record_subscription_window(p_subscription, p_started_at, p_trial_end)
$$;
revoke execute on function app.record_subscription_window(text, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.record_subscription_window(text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function app.record_subscription_window(text, timestamptz, timestamptz) to service_role;
grant execute on function public.record_subscription_window(text, timestamptz, timestamptz) to service_role;

-- Rows written before these columns existed (retest RX-6). Until Stripe sends
-- another event for such a row the cancel page counted the 14 days from the
-- row's created_at, while the webhook counts from the later of the start and
-- the trial's end. The dates are filled from what the database already holds,
-- in the webhook's order:
--   trial_end   the current period end while the row is still trialing (what
--               the trial reminder already reads); else the period start of
--               the first invoice that took money, when that is more than an
--               hour after the row began (a first payment after a trial
--               starts its period at the trial's end);
--   started_at  the period start of the first invoice of any amount (Stripe
--               bills at the start), and the row's created_at as the last
--               resort.
-- Only null columns are filled, so a date Stripe has sent is never replaced
-- and a second run changes nothing. Returns the number of rows touched.
create or replace function app.backfill_subscription_window() returns int
language plpgsql volatile security definer set search_path = '' as $$
declare n int;
begin
  with inv as (
    select i.stripe_subscription_id,
           min(i.period_start) as first_start,
           min(i.period_start) filter (where i.status = 'paid' and i.amount_minor > 0) as first_paid_start
      from public.subscription_invoices i
     where i.period_start is not null
     group by i.stripe_subscription_id
  ), want as (
    select s.id,
           coalesce(s.started_at, least(inv.first_start, s.created_at), s.created_at) as started_at,
           coalesce(s.trial_end,
             case
               when s.status = 'trialing' then s.current_period_end
               when inv.first_paid_start > coalesce(s.started_at, least(inv.first_start, s.created_at), s.created_at) + interval '1 hour'
                 then inv.first_paid_start
             end) as trial_end
      from public.subscriptions s
      left join inv on inv.stripe_subscription_id = s.stripe_subscription_id
     where s.started_at is null or s.trial_end is null
  )
  update public.subscriptions s
     set started_at = want.started_at, trial_end = want.trial_end
    from want
   where want.id = s.id
     and (s.started_at is distinct from want.started_at or s.trial_end is distinct from want.trial_end);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function app.backfill_subscription_window() from public, anon, authenticated, service_role;
select app.backfill_subscription_window();

-- ---------------------------------------------------------------------------
-- 2. One live membership per reader and tenant (M9).
-- ---------------------------------------------------------------------------
-- The clean-up and the index are one statement, under a lock that keeps new
-- subscription rows out while it runs, so a duplicate cannot slip in between
-- the two and stop the index from building. The lock is short: the table
-- has one row per membership.
do $$
declare
  r record;
  n int := 0;
begin
  if exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'subscriptions_one_live_idx') then
    return;
  end if;
  lock table public.subscriptions in share row exclusive mode;
  -- The audit helper reads the request claims as JSON. A session that once
  -- held claims can leave an empty string behind, which is not JSON, so the
  -- clean-up gives it an empty object for this transaction. No role is set.
  if coalesce(current_setting('request.jwt.claims', true), '') = '' then
    perform set_config('request.jwt.claims', '{}', true);
  end if;
  for r in
    select s.id, s.stripe_subscription_id, s.tenant_id, s.status
      from (select x.*, row_number() over (partition by x.user_id, x.tenant_id order by x.created_at, x.id) as pos
              from public.subscriptions x
             where x.status in ('trialing','active','past_due')) s
     where s.pos > 1
  loop
    update public.subscriptions set status = 'canceled', ended_at = coalesce(ended_at, now()) where id = r.id;
    perform app.audit('commerce.subscription_duplicate_closed', 'subscription:' || r.stripe_subscription_id,
      'second live membership for one reader (0075)', r.tenant_id, null,
      jsonb_build_object('status', r.status), jsonb_build_object('status', 'canceled', 'needs_stripe_cancel', true));
    n := n + 1;
  end loop;
  if n > 0 then
    raise notice '0075: % duplicate live subscription(s) marked canceled. Cancel them in Stripe: audit_log action commerce.subscription_duplicate_closed.', n;
  end if;
  create unique index if not exists subscriptions_one_live_idx on public.subscriptions(user_id, tenant_id)
    where status in ('trialing','active','past_due');
end $$;

-- ---------------------------------------------------------------------------
-- 3. The entitlement sync. Body from 0045, with one change (M10): a
--    subscription under an open or lost dispute is not live, for its owner
--    and for a person holding a seat on it.
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
             -- live: the status says so, no pause is running now, and no dispute holds it (0075)
             (app.subscription_is_live(y.status, y.past_due_since) and not y.paused_now and not y.disputed) as live,
             -- open ended: running with no pause ahead
             (y.status in ('active','trialing') and not y.paused_now and not y.pause_ahead and not y.disputed) as open_ended,
             case
               when y.status = 'past_due' then coalesce(y.past_due_since, now()) + app.membership_grace()
               when y.pause_ahead then y.paused_from
               else null
             end as ends
        from (
          select s.status, s.past_due_since, s.paused_from,
                 coalesce(s.paused_from <= now() and s.paused_until > now(), false) as paused_now,
                 coalesce(s.paused_from > now() and s.paused_until > now(), false) as pause_ahead,
                 (s.dispute_suspended_at is not null) as disputed
            from public.subscriptions s
           where s.user_id = p_user and s.tenant_id = p_tenant
          union all
          -- 0041: a seat on someone else's subscription
          select case when m.status = 'active' then s.status else 'canceled' end,
                 case when m.status = 'active' then s.past_due_since end,
                 s.paused_from,
                 coalesce(m.status = 'active' and s.paused_from <= now() and s.paused_until > now(), false),
                 coalesce(m.status = 'active' and s.paused_from > now() and s.paused_until > now(), false),
                 (s.dispute_suspended_at is not null)
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
-- 4. Disputes (M10). Service role only: the webhook is the one caller.
-- ---------------------------------------------------------------------------
create table if not exists public.payment_disputes (
  stripe_dispute_id      text primary key check (stripe_dispute_id ~ '^[A-Za-z0-9_]{3,255}$'),
  payment_intent_id      text not null check (payment_intent_id ~ '^pi_[A-Za-z0-9_]+$'),
  kind                   text not null check (kind in ('workbook','membership','unmatched')),
  purchase_id            uuid references public.purchases(id) on delete set null,
  subscription_id        uuid references public.subscriptions(id) on delete set null,
  user_id                uuid references auth.users(id) on delete set null,
  tenant_id              uuid references public.tenants(id),
  status                 text not null default 'open' check (status in ('open','won','lost')),
  suspended_entitlements uuid[] not null default '{}',
  opened_at              timestamptz not null default now(),
  closed_at              timestamptz
);
create index if not exists payment_disputes_purchase_idx on public.payment_disputes(purchase_id);
create index if not exists payment_disputes_subscription_idx on public.payment_disputes(subscription_id);
create index if not exists payment_disputes_user_idx on public.payment_disputes(user_id);
create index if not exists payment_disputes_tenant_idx on public.payment_disputes(tenant_id);
create index if not exists payment_disputes_pi_idx on public.payment_disputes(payment_intent_id);
alter table public.payment_disputes enable row level security;
revoke all on public.payment_disputes from public, anon, authenticated;
grant select, insert, update on public.payment_disputes to service_role;

-- Open a dispute and suspend what the payment gave. Idempotent: a dispute
-- already matched changes nothing. p_invoice is the Stripe invoice, for a
-- membership payment the ledger has not tied to its payment intent.
create or replace function app.dispute_open(p_dispute text, p_payment_intent text, p_invoice text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  d      public.payment_disputes%rowtype;
  p      public.purchases%rowtype;
  s      public.subscriptions%rowtype;
  v_sub  text;
  v_ids  uuid[] := '{}';
begin
  if not app.is_service_role() then
    raise exception 'only the service role records disputes' using errcode = 'insufficient_privilege';
  end if;
  if p_dispute is null or p_payment_intent is null then
    raise exception 'dispute and payment intent are required' using errcode = 'null_value_not_allowed';
  end if;
  -- One at a time per dispute, so two deliveries cannot both suspend.
  perform pg_advisory_xact_lock(hashtextextended('akana_dispute:' || p_dispute, 0));
  select * into d from public.payment_disputes where stripe_dispute_id = p_dispute for update;
  if found and d.kind <> 'unmatched' then
    return jsonb_build_object('kind', d.kind, 'status', d.status, 'changed', false,
      'subscription', (select x.stripe_subscription_id from public.subscriptions x where x.id = d.subscription_id));
  end if;

  select * into p from public.purchases
   where stripe_payment_intent_id = p_payment_intent and kind = 'workbook'
   order by created_at limit 1 for update;
  if found then
    if p.status = 'paid' then
      with x as (
        update public.entitlements set status = 'revoked'
         where purchase_id = p.id and status = 'active' returning id
      ) select coalesce(array_agg(id), '{}') into v_ids from x;
    end if;
    insert into public.payment_disputes (stripe_dispute_id, payment_intent_id, kind, purchase_id, user_id, tenant_id, suspended_entitlements)
    values (p_dispute, p_payment_intent, 'workbook', p.id, p.user_id, p.tenant_id, v_ids)
    on conflict (stripe_dispute_id) do update
      set kind = 'workbook', purchase_id = excluded.purchase_id, user_id = excluded.user_id,
          tenant_id = excluded.tenant_id, suspended_entitlements = excluded.suspended_entitlements;
    perform app.audit('commerce.dispute_suspended', 'purchase:' || p.id::text, 'dispute opened', p.tenant_id, null, null,
      jsonb_build_object('dispute', p_dispute, 'entitlements_suspended', cardinality(v_ids)));
    return jsonb_build_object('kind', 'workbook', 'status', 'open', 'changed', true, 'subscription', null);
  end if;

  select si.stripe_subscription_id into v_sub
    from public.royalty_receipts rc
    join public.subscription_invoices si on si.id = rc.subscription_invoice_id
   where rc.kind = 'membership' and rc.payment_intent_id = p_payment_intent
   limit 1;
  if v_sub is null and p_invoice is not null then
    select si.stripe_subscription_id into v_sub from public.subscription_invoices si where si.stripe_invoice_id = p_invoice;
  end if;
  if v_sub is not null then
    select * into s from public.subscriptions where stripe_subscription_id = v_sub for update;
  end if;
  if v_sub is not null and s.id is not null then
    -- The seat trigger on subscriptions re-syncs anyone holding a seat.
    update public.subscriptions set dispute_suspended_at = coalesce(dispute_suspended_at, now()) where id = s.id;
    perform app.membership_entitlement_apply(s.user_id, s.tenant_id);
    insert into public.payment_disputes (stripe_dispute_id, payment_intent_id, kind, subscription_id, user_id, tenant_id)
    values (p_dispute, p_payment_intent, 'membership', s.id, s.user_id, s.tenant_id)
    on conflict (stripe_dispute_id) do update
      set kind = 'membership', subscription_id = excluded.subscription_id, user_id = excluded.user_id, tenant_id = excluded.tenant_id;
    perform app.audit('commerce.dispute_suspended', 'subscription:' || s.stripe_subscription_id, 'dispute opened', s.tenant_id, null, null,
      jsonb_build_object('dispute', p_dispute));
    return jsonb_build_object('kind', 'membership', 'status', 'open', 'changed', true, 'subscription', s.stripe_subscription_id);
  end if;

  insert into public.payment_disputes (stripe_dispute_id, payment_intent_id, kind)
  values (p_dispute, p_payment_intent, 'unmatched')
  on conflict (stripe_dispute_id) do nothing;
  return jsonb_build_object('kind', 'unmatched', 'status', 'open', 'changed', false, 'subscription', null);
end $$;

-- Close a dispute. Won: what was suspended comes back. Lost: a workbook
-- purchase is marked refunded and stays closed; a membership stays closed
-- (the webhook ends it at Stripe). A close that arrives before the open
-- still ends in the right place, and a repeat changes nothing.
create or replace function app.dispute_close(p_dispute text, p_payment_intent text, p_outcome text, p_invoice text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  d     public.payment_disputes%rowtype;
  s     public.subscriptions%rowtype;
  v_n   int := 0;
begin
  if not app.is_service_role() then
    raise exception 'only the service role records disputes' using errcode = 'insufficient_privilege';
  end if;
  if p_outcome is null or p_outcome not in ('won','lost') then
    raise exception 'unknown outcome' using errcode = 'check_violation';
  end if;
  perform app.dispute_open(p_dispute, p_payment_intent, p_invoice);
  select * into d from public.payment_disputes where stripe_dispute_id = p_dispute for update;
  if d.subscription_id is not null then
    select * into s from public.subscriptions where id = d.subscription_id for update;
  end if;
  if d.status <> 'open' then
    return jsonb_build_object('kind', d.kind, 'status', d.status, 'changed', false, 'subscription', s.stripe_subscription_id);
  end if;

  update public.payment_disputes set status = p_outcome, closed_at = now() where stripe_dispute_id = p_dispute;

  if d.kind = 'workbook' and d.purchase_id is not null then
    if p_outcome = 'won' then
      update public.entitlements e set status = 'active'
       where e.id = any(d.suspended_entitlements) and e.status = 'revoked'
         and exists (select 1 from public.purchases p where p.id = d.purchase_id and p.status = 'paid');
      get diagnostics v_n = row_count;
    else
      perform app.revoke_purchase_entitlement(d.purchase_id, 'dispute lost');
    end if;
    perform app.audit(case when p_outcome = 'won' then 'commerce.dispute_restored' else 'commerce.dispute_lost' end,
      'purchase:' || d.purchase_id::text, 'dispute ' || p_outcome, d.tenant_id, null, null,
      jsonb_build_object('dispute', p_dispute, 'entitlements_restored', v_n));
  elsif d.kind = 'membership' and s.id is not null then
    if p_outcome = 'won' and not exists (
         select 1 from public.payment_disputes o
          where o.subscription_id = s.id and o.status in ('open','lost') and o.stripe_dispute_id <> p_dispute) then
      update public.subscriptions set dispute_suspended_at = null where id = s.id;
      perform app.membership_entitlement_apply(s.user_id, s.tenant_id);
    end if;
    perform app.audit(case when p_outcome = 'won' then 'commerce.dispute_restored' else 'commerce.dispute_lost' end,
      'subscription:' || s.stripe_subscription_id, 'dispute ' || p_outcome, s.tenant_id, null, null,
      jsonb_build_object('dispute', p_dispute));
  end if;
  return jsonb_build_object('kind', d.kind, 'status', p_outcome, 'changed', d.kind <> 'unmatched', 'subscription', s.stripe_subscription_id);
end $$;

create or replace function public.dispute_open(p_dispute text, p_payment_intent text, p_invoice text default null) returns jsonb
language sql volatile security invoker set search_path = '' as $$ select app.dispute_open(p_dispute, p_payment_intent, p_invoice) $$;
create or replace function public.dispute_close(p_dispute text, p_payment_intent text, p_outcome text, p_invoice text default null) returns jsonb
language sql volatile security invoker set search_path = '' as $$ select app.dispute_close(p_dispute, p_payment_intent, p_outcome, p_invoice) $$;
revoke execute on function app.dispute_open(text, text, text), app.dispute_close(text, text, text, text) from public, anon, authenticated;
revoke execute on function public.dispute_open(text, text, text), public.dispute_close(text, text, text, text) from public, anon, authenticated;
grant execute on function app.dispute_open(text, text, text), app.dispute_close(text, text, text, text) to service_role;
grant execute on function public.dispute_open(text, text, text), public.dispute_close(text, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 5. A failed refund (L7). The reader did not get the money, so a workbook
--    a full refund closed is opened again while staff sort the refund out.
--    p_still_refunded_minor is what Stripe still holds as refunded on the
--    payment; when that still covers the price, nothing is restored.
-- ---------------------------------------------------------------------------
create or replace function app.restore_after_failed_refund(p_payment_intent text, p_refund text, p_still_refunded_minor bigint) returns text
language plpgsql security definer set search_path = '' as $$
declare
  p public.purchases%rowtype;
  n int := 0;
begin
  if not app.is_service_role() then
    raise exception 'only the service role restores a purchase' using errcode = 'insufficient_privilege';
  end if;
  if p_payment_intent is null then return 'none'; end if;
  select * into p from public.purchases
   where stripe_payment_intent_id = p_payment_intent and kind = 'workbook'
   order by created_at limit 1 for update;
  if not found then return 'none'; end if;
  if p.status <> 'refunded' then return 'unchanged'; end if;
  if p.amount_minor > 0 and coalesce(p_still_refunded_minor, 0) >= p.amount_minor then return 'still_refunded'; end if;
  if exists (select 1 from public.payment_disputes d where d.purchase_id = p.id and d.status in ('open','lost')) then
    return 'disputed';
  end if;
  update public.purchases set status = 'paid', refunded_at = null where id = p.id;
  update public.entitlements set status = 'active' where purchase_id = p.id and status = 'revoked';
  get diagnostics n = row_count;
  perform app.audit('commerce.refund_failed_restored', 'purchase:' || p.id::text, 'refund failed', p.tenant_id, null,
    jsonb_build_object('status', 'refunded'),
    jsonb_build_object('status', 'paid', 'refund', left(coalesce(p_refund, ''), 80), 'entitlements_restored', n));
  return 'restored';
end $$;
create or replace function public.restore_after_failed_refund(p_payment_intent text, p_refund text, p_still_refunded_minor bigint) returns text
language sql volatile security invoker set search_path = '' as $$ select app.restore_after_failed_refund(p_payment_intent, p_refund, p_still_refunded_minor) $$;
revoke execute on function app.restore_after_failed_refund(text, text, bigint) from public, anon, authenticated;
revoke execute on function public.restore_after_failed_refund(text, text, bigint) from public, anon, authenticated;
grant execute on function app.restore_after_failed_refund(text, text, bigint) to service_role;
grant execute on function public.restore_after_failed_refund(text, text, bigint) to service_role;

-- ---------------------------------------------------------------------------
-- 6. A failed bank payout on an author's Connect account (L7). The Akana
--    payout row is a transfer that did reach the Connect account, and its
--    ledger line stands, so its status stays paid. The failure is recorded
--    here, stamped on the organisation's latest paid payout, and a hold
--    stops further payouts until owner or finance staff release it
--    (public.release_payout_hold, as for any hold).
-- ---------------------------------------------------------------------------
alter table public.payouts
  add column if not exists bank_failed_at timestamptz,
  add column if not exists bank_failure_code text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'payouts_bank_failure_code_len') then
    alter table public.payouts add constraint payouts_bank_failure_code_len
      check (bank_failure_code is null or char_length(bank_failure_code) <= 80);
  end if;
end $$;

create table if not exists public.payout_bank_failures (
  stripe_payout_id  text primary key check (stripe_payout_id ~ '^po_[A-Za-z0-9_]+$'),
  org_id            uuid not null references public.organisations(id),
  stripe_account_id text not null check (stripe_account_id ~ '^acct_[A-Za-z0-9]+$'),
  payout_id         uuid references public.payouts(id),
  hold_id           uuid references public.payout_holds(id),
  amount_minor      bigint,
  currency          char(3),
  livemode          boolean not null,
  failure_code      text check (failure_code is null or char_length(failure_code) <= 80),
  created_at        timestamptz not null default now()
);
create index if not exists payout_bank_failures_org_idx on public.payout_bank_failures(org_id);
create index if not exists payout_bank_failures_payout_idx on public.payout_bank_failures(payout_id);
create index if not exists payout_bank_failures_hold_idx on public.payout_bank_failures(hold_id);
alter table public.payout_bank_failures enable row level security;
revoke all on public.payout_bank_failures from public, anon, authenticated;
grant select on public.payout_bank_failures to authenticated;
grant select, insert, update on public.payout_bank_failures to service_role;
drop policy if exists payout_bank_failures_read on public.payout_bank_failures;
create policy payout_bank_failures_read on public.payout_bank_failures for select to authenticated using ((select app.is_money_staff()));

create or replace function public.note_connect_payout_failed(
  p_account text, p_payout text, p_code text, p_amount_minor bigint, p_currency text, p_livemode boolean
) returns table (org_id uuid, recorded boolean)
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_org    uuid;
  v_code   text := left(coalesce(nullif(btrim(p_code), ''), 'unknown'), 80);
  v_cur    text := upper(left(coalesce(p_currency, ''), 3));
  v_payout uuid;
  v_hold   uuid;
  v_new    int;
begin
  if not app.is_service_role() then
    raise exception 'only the service role records payout failures' using errcode = 'insufficient_privilege';
  end if;
  select o.id into v_org from public.organisations o where o.stripe_connect_id = p_account;
  if v_org is null then
    return query select null::uuid, false;
    return;
  end if;
  insert into public.payout_bank_failures (stripe_payout_id, org_id, stripe_account_id, amount_minor, currency, livemode, failure_code)
  values (p_payout, v_org, p_account, p_amount_minor, case when v_cur ~ '^[A-Z]{3}$' then v_cur end, coalesce(p_livemode, false), v_code)
  on conflict (stripe_payout_id) do nothing;
  get diagnostics v_new = row_count;
  if v_new = 0 then
    return query select v_org, false;
    return;
  end if;

  select p.id into v_payout from public.payouts p
   where p.org_id = v_org and p.status = 'paid' and p.livemode = coalesce(p_livemode, false)
     and (v_cur !~ '^[A-Z]{3}$' or p.currency = v_cur)
   order by p.paid_at desc nulls last, p.created_at desc limit 1;
  if v_payout is not null then
    update public.payouts set bank_failed_at = now(), bank_failure_code = v_code where id = v_payout;
  end if;

  select h.id into v_hold from public.payout_holds h
   where h.org_id = v_org and h.released_at is null and h.reason like 'Bank payout failed%' limit 1;
  if v_hold is null then
    insert into public.payout_holds (org_id, reason, placed_by)
    values (v_org, 'Bank payout failed (' || v_code || '). Check the bank details with the author, then release.', null)
    returning id into v_hold;
    -- as place_payout_hold does: a payout not yet sent is cancelled; the hold decides
    update public.payouts set status = 'cancelled', failure_code = 'held'
     where payouts.org_id = v_org and status in ('awaiting_approval','pending') and stripe_transfer_id is null;
  end if;
  update public.payout_bank_failures set payout_id = v_payout, hold_id = v_hold where stripe_payout_id = p_payout;
  perform app.audit('money.bank_payout_failed', 'organisation:' || v_org::text, v_code, null, v_org, null,
    jsonb_build_object('stripe_payout', p_payout, 'payout_id', v_payout, 'hold_id', v_hold, 'amount_minor', p_amount_minor, 'currency', v_cur));
  return query select v_org, true;
end $$;
revoke execute on function public.note_connect_payout_failed(text, text, text, bigint, text, boolean) from public, anon, authenticated;
grant execute on function public.note_connect_payout_failed(text, text, text, bigint, text, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- 7. The friend's first payment, for a cooling-off cancel (M8). The reward
--    itself goes back through public.referral_reverse (0068), unchanged.
-- ---------------------------------------------------------------------------
create or replace function public.referral_first_payment_intent(p_friend uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_service_role() then
    raise exception 'only the service role reads referral payments' using errcode = 'insufficient_privilege';
  end if;
  return (select r.first_payment_intent from public.referrals r
           where r.referred_id = p_friend and r.first_payment_intent is not null
           order by r.created_at desc limit 1);
end $$;
revoke execute on function public.referral_first_payment_intent(uuid) from public, anon, authenticated;
grant execute on function public.referral_first_payment_intent(uuid) to service_role;
