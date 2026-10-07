-- 0011 Membership reminders: the six-monthly terms reminder for monthly
-- members (UK DMCC Act subscription regime, expected January 2027).
--
-- Same rules as 0001 to 0010. Depends on 0001 to 0010. Nothing in 0001 to
-- 0010 is edited.
--
-- The rule. A contract that renews more often than every six months needs a
-- reminder notice once in every six-month period, sent before a renewal
-- payment. Annual members already get renewal_notice from the webhook
-- (invoice.upcoming). For monthly members a daily job
-- (apps/web/app/api/membership/reminders, lib/membership-reminders.ts) asks
-- app.due_terms_reminders() which subscriptions are due, sends the
-- membership_terms_reminder email and records it here. A subscription is due
-- when all of these hold:
--   * the plan is member_month and the status is active or trialing;
--   * nothing is set to end it: no cancel at period end, no cancel_at, no
--     ended_at, and the reader has no account deletion in progress;
--   * the last terms reminder, or the start of the membership when there
--     has been none, was six months ago or more;
--   * the next renewal is between 3 and 14 days away, so the reminder always
--     arrives before a payment and with time to cancel.
-- The start of the membership is when the subscription row was first
-- recorded (created_at), which is when checkout completed.
--
-- Twice-never: the job claims a key in public.email_claims (0010) before it
-- sends, made of the subscription id and the next payment date, then calls
-- app.mark_terms_reminder_sent(). Once stamped, the subscription drops out
-- of the due list for another six months. If the stamp fails after a send,
-- the claim stops a second email and the next run stamps it.
--
-- The price shown is what the member last paid for this subscription, from
-- public.subscription_invoices. A subscription with no paid invoice on
-- record is still listed, with a null amount, and the job leaves it for a
-- later run rather than send a reminder without a price.

alter table public.subscriptions add column last_terms_reminder_at timestamptz;

create index subscriptions_terms_reminder_idx on public.subscriptions(current_period_end)
  where plan = 'member_month' and status in ('active','trialing');

-- ---------------------------------------------------------------------------
-- Which monthly subscriptions are due a terms reminder at p_now.
-- Returns the reader's sign-in address so the job needs no second lookup.
-- Service role only. The window figures match lib/membership-reminders.ts.
-- ---------------------------------------------------------------------------
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
     where s.plan = 'member_month'
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

-- ---------------------------------------------------------------------------
-- Record that a terms reminder went for this subscription at p_at. Never
-- moves the stamp backwards. Returns true when it changed the row. Writes
-- one audit row, with the subscription id only.
-- ---------------------------------------------------------------------------
create or replace function app.mark_terms_reminder_sent(p_subscription text, p_at timestamptz default now())
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  s public.subscriptions%rowtype;
begin
  if not app.is_service_role() then
    raise exception 'only the service role records reminders' using errcode = 'insufficient_privilege';
  end if;
  update public.subscriptions
     set last_terms_reminder_at = coalesce(p_at, now())
   where stripe_subscription_id = p_subscription
     and (last_terms_reminder_at is null or last_terms_reminder_at < coalesce(p_at, now()))
   returning * into s;
  if not found then return false; end if;
  perform app.audit('commerce.terms_reminder_sent', 'subscription:' || p_subscription, null, s.tenant_id, null,
    null, jsonb_build_object('at', s.last_terms_reminder_at));
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- RPC wrappers. Security invoker: the app functions do the checks.
-- ---------------------------------------------------------------------------
create or replace function public.due_terms_reminders(p_now timestamptz default now())
returns table (
  stripe_subscription_id text,
  user_id                uuid,
  email                  text,
  current_period_end     timestamptz,
  reminder_anchor_at     timestamptz,
  amount_minor           integer,
  currency               char(3)
)
language sql security invoker set search_path = '' as $$
  select * from app.due_terms_reminders(p_now)
$$;
create or replace function public.mark_terms_reminder_sent(p_subscription text, p_at timestamptz default now())
returns boolean
language sql security invoker set search_path = '' as $$
  select app.mark_terms_reminder_sent(p_subscription, p_at)
$$;

revoke execute on function app.due_terms_reminders(timestamptz), app.mark_terms_reminder_sent(text, timestamptz) from public;
revoke execute on function public.due_terms_reminders(timestamptz), public.mark_terms_reminder_sent(text, timestamptz)
  from public, anon, authenticated;
grant execute on function
  app.due_terms_reminders(timestamptz), app.mark_terms_reminder_sent(text, timestamptz),
  public.due_terms_reminders(timestamptz), public.mark_terms_reminder_sent(text, timestamptz)
  to service_role;
