-- 0031 Akana Business: what 0030 left open in organisation billing (F-220,
-- F-226). Consumer organisers and the DMCC Act subscription duties, billing
-- emails to the owner and finance contacts, church band changes, and an
-- optional seat for the self-serve organiser.
--
-- Depends on 0001 to 0030 only. Nothing earlier is edited and no earlier
-- function is replaced: every new behaviour hangs off new functions and new
-- triggers, so 0032 and 0033, written at the same time, can replace 0030's
-- functions without losing anything here. Same rules as before: every table
-- has RLS on, grants to anon and authenticated are revoked and given back
-- narrowly, helpers are security definer with search_path pinned to '', and
-- PostgREST sees thin public wrappers that run as the caller.
--
-- STRIPE TEST MODE ONLY. The org_self_serve flag stays off (0030); nothing
-- here turns it on. Every figure seeded here is a placeholder for Crent.
--
-- ===========================================================================
-- FOR OTHER BUILDERS
-- ===========================================================================
-- public.org_profiles.buyer_type  'consumer' or 'business'. Default
--   'business'. A self-serve Group licence (bought by an individual organiser
--   with a card) marks its organisation 'consumer' when the licence is made;
--   staff can change it with app.org_set_buyer_type and a reason. Teams,
--   church and invoiced customers stay 'business': B2B contracts sit outside
--   the consumer subscription rules [check legal].
--
-- Consumer duties (UK DMCC Act subscription regime, expected 2027, the same
-- rules lib/membership-reminders.ts and lib/membership-refund.ts apply to
-- reader memberships):
--   * Reminder notices. app.due_org_terms_reminders(now) lists consumer
--     subscriptions due one: a monthly plan once in every six months, 3 to 14
--     days before a payment (as 0011); a yearly plan before each renewal, 3 to
--     30 days before it, once per period. The daily job claims
--     org_terms_reminder:<sub>:<date>:<user> in email_claims, sends, then
--     calls app.mark_org_terms_reminder_sent.
--   * Cooling-off. 14 days from the start, and 14 days from each yearly
--     renewal payment. app.org_cooling_off_state says whether it is open;
--     the server refunds the unused days pro rata in Stripe
--     (lib/membership-refund.ts refundCoolingOff), cancels the subscription
--     and then calls app.org_cooling_off_done, which ends the licence now.
--   * Cancelling in the same place they bought: /org/billing, owner only.
--
-- public.org_billing_mail  an outbox. Triggers on org_invoices,
--   org_licences and org_subscriptions add one row per billing event:
--     invoice_sent       an invoice to pay by transfer was issued (send_invoice)
--     payment_failed     a payment on an invoice failed (first failure only)
--     invoice_overdue    an open invoice passed its due date (queued daily by
--                        app.org_billing_queue_overdue)
--     licence_suspended  billing paused access (unpaid, paused, incomplete)
--     licence_ending     the owner asked to end, or the subscription is set to
--                        cancel at the period end
--     licence_ended      the licence ended
--   unique (kind, ref), so an event is queued once. The mail job reads
--   app.org_billing_mail_due(), sends to app.org_billing_contacts() (owners,
--   finance and the profile's billing address, nobody else), claiming
--   org_billing_mail:<row id>:<recipient> in email_claims, then marks the row
--   with app.org_billing_mail_done. Rows hold ids, amounts and dates only:
--   never a member, never a title. No client reads it.
--
-- Church bands. app.org_billing_band_change_check(licence, plan, reason)
--   checks a band change before the server swaps the Stripe price. The
--   organisation's owner or finance may move between bands while the
--   licence is active and not ending, and never to a band smaller than the
--   seats taken and invited. Staff (platform owner, editor, finance) may
--   override those limits with a reason. When the mirror sees the new band,
--   a trigger sets seats_purchased to the band's size (app_config
--   org_church_band_<n>_seats, placeholders), never below the places used.
--
-- Auto-seat. app.org_self_serve_seat_organiser(licence, user): the webhook
--   gives the self-serve organiser a seat on their own licence when they
--   ticked the box at sign-up (off by default). Adults only: the organiser's
--   profile must carry the 18 or over confirmation.
--
-- Error codes (0024 and 0030's, plus):
--   AKO31  not a consumer organisation, or the cooling-off period is not open
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Config. Placeholders, from docs/research/akana-business.md (bands up to
-- 50, 51 to 150, 151 to 400 adults; the active-reader cap is the band's top).
-- ---------------------------------------------------------------------------
insert into public.app_config (key, value) values
  ('org_church_band_1_seats', '50'),
  ('org_church_band_2_seats', '150'),
  ('org_church_band_3_seats', '400'),
  ('org_cooling_off_days', '14')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Consumer or business.
-- ---------------------------------------------------------------------------
alter table public.org_profiles add column buyer_type text not null default 'business'
  check (buyer_type in ('consumer','business'));

create or replace function app.org_is_consumer(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.buyer_type = 'consumer' from public.org_profiles p where p.org_id = p_org), false)
$$;

-- A self-serve Group licence is bought by an individual: its organisation is
-- a consumer. Runs after 0030's provisioning inserts the licence.
create or replace function app.org_licences_mark_consumer() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.self_serve and new.kind = 'group' then
    insert into public.org_profiles (org_id, buyer_type) values (new.org_id, 'consumer')
    on conflict (org_id) do update set buyer_type = 'consumer' where public.org_profiles.buyer_type <> 'consumer';
    perform app.audit('org.buyer_type_set', 'organisation:' || new.org_id::text, 'self_serve_group', null, new.org_id, null,
      jsonb_build_object('buyer_type', 'consumer'));
  end if;
  return new;
end $$;
create trigger org_licences_mark_consumer after insert on public.org_licences
  for each row execute function app.org_licences_mark_consumer();

-- Organisations that already hold a self-serve Group licence (none while the
-- flag has been off, but the rule should hold for every row).
update public.org_profiles p set buyer_type = 'consumer'
 where p.buyer_type <> 'consumer'
   and exists (select 1 from public.org_licences l where l.org_id = p.org_id and l.self_serve and l.kind = 'group');

-- Staff correct the record, with a reason.
create or replace function app.org_set_buyer_type(p_org uuid, p_type text, p_reason text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_reason text := app.clean_text(p_reason, 500);
  v_old    text;
begin
  if not app.is_platform(array['owner','editor']) then
    raise exception 'only platform owners and editors change the buyer type' using errcode = 'AKO01';
  end if;
  if p_type is null or p_type not in ('consumer','business') then
    raise exception 'org_invalid: buyer_type' using errcode = 'AKO02';
  end if;
  if v_reason is null then
    raise exception 'org_invalid: reason' using errcode = 'AKO02';
  end if;
  if not app.is_customer_org(p_org) then
    raise exception 'org_invalid: organisation' using errcode = 'AKO02';
  end if;
  select p.buyer_type into v_old from public.org_profiles p where p.org_id = p_org for update;
  if v_old is not distinct from p_type then return false; end if;
  insert into public.org_profiles (org_id, buyer_type) values (p_org, p_type)
  on conflict (org_id) do update set buyer_type = excluded.buyer_type;
  perform app.audit('org.buyer_type_set', 'organisation:' || p_org::text, v_reason, null, p_org,
    jsonb_build_object('buyer_type', v_old), jsonb_build_object('buyer_type', p_type));
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Who hears about billing: the owners, the finance contacts and the
-- profile's billing address. Never a seat holder. Service role only.
-- ---------------------------------------------------------------------------
create or replace function app.org_billing_contacts(p_org uuid)
returns table (user_id uuid, email text, role text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_service_role() then
    raise exception 'only the service role reads billing contacts' using errcode = 'AKO01';
  end if;
  return query
    with members as (
      select m.user_id, lower(u.email::text) as email, m.role, m.created_at
        from public.org_members m join auth.users u on u.id = m.user_id
       where m.org_id = p_org and m.role in ('owner','finance') and u.email is not null)
    select x.user_id, x.email, x.role from members x
    union all
    select null::uuid, p.billing_email, 'billing'::text
      from public.org_profiles p
     where p.org_id = p_org and p.billing_email is not null
       and not exists (select 1 from members x where x.email = p.billing_email)
    order by 3, 2;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Reminder notices for consumer subscriptions.
-- ---------------------------------------------------------------------------
alter table public.org_subscriptions add column last_terms_reminder_at timestamptz;

create or replace function app.org_plan_yearly(p_plan text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p_plan = 'teams_seat_year', false)
$$;

create or replace function app.due_org_terms_reminders(p_now timestamptz default now())
returns table (
  stripe_subscription_id text,
  org_id                 uuid,
  organisation_name      text,
  plan                   text,
  yearly                 boolean,
  seats                  int,
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
    select s.stripe_subscription_id, s.org_id, o.display_name, s.plan, app.org_plan_yearly(s.plan), s.quantity,
           s.current_period_end, coalesce(s.last_terms_reminder_at, s.created_at), i.amount_paid_minor, i.currency
      from public.org_subscriptions s
      join public.org_licences l on l.id = s.licence_id
      join public.organisations o on o.id = s.org_id
      left join lateral (
        select x.amount_paid_minor, x.currency from public.org_invoices x
         where x.stripe_subscription_id = s.stripe_subscription_id and x.status = 'paid' and x.amount_paid_minor > 0
           and coalesce(x.billing_reason, 'subscription_cycle') in ('subscription_cycle','subscription_create')
         order by coalesce(x.paid_at, x.created_at) desc
         limit 1) i on true
     where app.org_is_consumer(s.org_id)
       and s.status in ('active','trialing')
       and not s.cancel_at_period_end and s.cancel_at is null and s.ended_at is null
       and l.status = 'active' and l.end_requested_at is null
       and o.status not in ('suspended','closed')
       and s.current_period_end >= v_now + interval '3 days'
       and ((not app.org_plan_yearly(s.plan)
             and s.current_period_end <= v_now + interval '14 days'
             and coalesce(s.last_terms_reminder_at, s.created_at) <= v_now - interval '6 months')
         or (app.org_plan_yearly(s.plan)
             and s.current_period_end <= v_now + interval '30 days'
             and (s.last_terms_reminder_at is null or s.last_terms_reminder_at < s.current_period_end - interval '60 days')))
     order by s.current_period_end, s.stripe_subscription_id;
end $$;

create or replace function app.mark_org_terms_reminder_sent(p_subscription text, p_at timestamptz default now())
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  s public.org_subscriptions;
begin
  if not app.is_service_role() then
    raise exception 'only the service role records reminders' using errcode = 'insufficient_privilege';
  end if;
  update public.org_subscriptions x
     set last_terms_reminder_at = coalesce(p_at, now())
   where x.stripe_subscription_id = p_subscription
     and (x.last_terms_reminder_at is null or x.last_terms_reminder_at < coalesce(p_at, now()))
   returning * into s;
  if not found then return false; end if;
  perform app.audit('org.terms_reminder_sent', 'org_licence:' || s.licence_id::text, null, null, s.org_id, null,
    jsonb_build_object('at', s.last_terms_reminder_at));
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- 5. The billing email outbox.
-- ---------------------------------------------------------------------------
create table public.org_billing_mail (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organisations(id) on delete cascade,
  licence_id      uuid references public.org_licences(id) on delete cascade,
  kind            text not null check (kind in ('invoice_sent','payment_failed','invoice_overdue','licence_suspended','licence_ending','licence_ended')),
  ref             text not null check (ref ~ '^[A-Za-z0-9:_-]{1,120}$'),
  invoice_id      text check (invoice_id is null or invoice_id ~ '^in_[A-Za-z0-9]+$'),
  happens_at      timestamptz,
  refund_minor    integer check (refund_minor is null or refund_minor >= 0),
  refund_currency char(3) check (refund_currency is null or refund_currency ~ '^[A-Z]{3}$'),
  refund_state    text check (refund_state is null or refund_state in ('pending','succeeded','failed')),
  created_at      timestamptz not null default now(),
  attempts        int not null default 0,
  last_attempt_at timestamptz,
  done_at         timestamptz,
  constraint org_billing_mail_once unique (kind, ref)
);
create index org_billing_mail_pending_idx on public.org_billing_mail(created_at) where done_at is null;
create index org_billing_mail_org_idx on public.org_billing_mail(org_id);

create or replace function app.org_billing_mail_queue(p_org uuid, p_licence uuid, p_kind text, p_ref text,
  p_invoice text default null, p_happens_at timestamptz default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.org_billing_mail (org_id, licence_id, kind, ref, invoice_id, happens_at)
  values (p_org, p_licence, p_kind, p_ref, p_invoice, p_happens_at)
  on conflict (kind, ref) do nothing;
end $$;

create or replace function app.org_invoices_queue_mail() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'open' and new.collection_method = 'send_invoice' and new.amount_due_minor > 0
     and (tg_op = 'INSERT' or old.status is distinct from 'open') then
    perform app.org_billing_mail_queue(new.org_id, new.licence_id, 'invoice_sent', new.stripe_invoice_id, new.stripe_invoice_id, new.due_at);
  end if;
  if new.payment_failed_at is not null and new.status not in ('paid','void')
     and (tg_op = 'INSERT' or old.payment_failed_at is null) then
    perform app.org_billing_mail_queue(new.org_id, new.licence_id, 'payment_failed', new.stripe_invoice_id, new.stripe_invoice_id, new.payment_failed_at);
  end if;
  return new;
end $$;
create trigger org_invoices_queue_mail after insert or update on public.org_invoices
  for each row execute function app.org_invoices_queue_mail();

create or replace function app.org_licences_queue_mail() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_end timestamptz;
begin
  if old.status = 'active' and new.status = 'suspended' and new.billing_state in ('unpaid','paused','incomplete') then
    perform app.org_billing_mail_queue(new.org_id, new.id, 'licence_suspended',
      new.id::text || ':' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD'), null, now());
  end if;
  if old.end_requested_at is null and new.end_requested_at is not null and new.status <> 'ended' then
    select s.current_period_end into v_end from public.org_subscriptions s where s.licence_id = new.id;
    v_end := coalesce(v_end, new.ends_at);
    perform app.org_billing_mail_queue(new.org_id, new.id, 'licence_ending',
      new.id::text || ':' || to_char(v_end at time zone 'UTC', 'YYYY-MM-DD'), null, v_end);
  end if;
  if old.status <> 'ended' and new.status = 'ended' then
    perform app.org_billing_mail_queue(new.org_id, new.id, 'licence_ended', new.id::text, null, coalesce(new.ended_at, now()));
  end if;
  return new;
end $$;
create trigger org_licences_queue_mail after update on public.org_licences
  for each row execute function app.org_licences_queue_mail();

-- Cancel at the period end, set in Stripe (by the owner through the app, or
-- by staff in the dashboard). The same key as the owner's request, so the
-- two paths queue one email.
create or replace function app.org_subscriptions_queue_mail() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.cancel_at_period_end and (tg_op = 'INSERT' or not old.cancel_at_period_end)
     and new.status not in ('canceled','incomplete_expired') and new.current_period_end is not null
     and exists (select 1 from public.org_licences l where l.id = new.licence_id and l.status <> 'ended') then
    perform app.org_billing_mail_queue(new.org_id, new.licence_id, 'licence_ending',
      new.licence_id::text || ':' || to_char(new.current_period_end at time zone 'UTC', 'YYYY-MM-DD'), null, new.current_period_end);
  end if;
  return new;
end $$;
create trigger org_subscriptions_queue_mail after insert or update of cancel_at_period_end on public.org_subscriptions
  for each row execute function app.org_subscriptions_queue_mail();

-- Daily, and after an invoice.overdue event: open invoices to pay by
-- transfer that are past their due date. Recent ones only.
create or replace function app.org_billing_queue_overdue(p_now timestamptz default now()) returns int
language plpgsql volatile security definer set search_path = '' as $$
declare
  n int;
begin
  if not app.is_service_role() then
    raise exception 'only the service role queues billing emails' using errcode = 'AKO01';
  end if;
  insert into public.org_billing_mail (org_id, licence_id, kind, ref, invoice_id, happens_at)
  select i.org_id, i.licence_id, 'invoice_overdue', i.stripe_invoice_id, i.stripe_invoice_id, i.due_at
    from public.org_invoices i
   where i.status = 'open' and i.collection_method = 'send_invoice' and i.amount_due_minor > i.amount_paid_minor
     and i.due_at is not null and i.due_at < coalesce(p_now, now()) and i.due_at > coalesce(p_now, now()) - interval '60 days'
  on conflict (kind, ref) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- What the mail job sends. relevant is false when the event no longer
-- holds (the invoice was paid, the licence came back or already ended):
-- the job marks that row done and sends nothing.
create or replace function app.org_billing_mail_due(p_limit int default 100)
returns table (
  id                uuid,
  kind              text,
  org_id            uuid,
  organisation_name text,
  consumer          boolean,
  licence_kind      text,
  relevant          boolean,
  invoice_number    text,
  amount_minor      integer,
  currency          char(3),
  due_at            timestamptz,
  pay_url           text,
  grace_until       timestamptz,
  happens_at        timestamptz,
  refund_minor      integer,
  refund_currency   char(3),
  refund_state      text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_service_role() then
    raise exception 'only the service role reads the billing outbox' using errcode = 'AKO01';
  end if;
  return query
    select m.id, m.kind, m.org_id, o.display_name, app.org_is_consumer(m.org_id), l.kind,
           case m.kind
             when 'invoice_sent'      then i.status = 'open'
             when 'payment_failed'    then i.status in ('open','uncollectible')
             when 'invoice_overdue'   then i.status = 'open'
             when 'licence_suspended' then l.status = 'suspended'
             when 'licence_ending'    then l.status <> 'ended'
             else true end,
           i.number, greatest(coalesce(i.amount_due_minor, 0) - coalesce(i.amount_paid_minor, 0), 0), i.currency, i.due_at,
           i.hosted_invoice_url, l.grace_until, m.happens_at, m.refund_minor, m.refund_currency, m.refund_state
      from public.org_billing_mail m
      join public.organisations o on o.id = m.org_id
      left join public.org_licences l on l.id = m.licence_id
      left join public.org_invoices i on i.stripe_invoice_id = m.invoice_id
     where m.done_at is null and m.attempts < 10 and m.created_at > now() - interval '14 days'
       and (m.invoice_id is null or i.stripe_invoice_id is not null)
     order by m.created_at, m.id
     limit greatest(1, least(coalesce(p_limit, 100), 500));
end $$;

-- p_done true: every recipient was sent (or had it already), or the row no
-- longer applies. False: count the attempt; a later run tries again.
create or replace function app.org_billing_mail_done(p_id uuid, p_done boolean) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare n int;
begin
  if not app.is_service_role() then
    raise exception 'only the service role marks the billing outbox' using errcode = 'AKO01';
  end if;
  update public.org_billing_mail x
     set done_at = case when p_done then now() end,
         attempts = x.attempts + case when p_done then 0 else 1 end,
         last_attempt_at = now()
   where x.id = p_id and x.done_at is null;
  get diagnostics n = row_count;
  return n = 1;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Cooling-off for consumer organisations.
-- ---------------------------------------------------------------------------

-- Where the cooling-off stands for a licence. For the billing page (owner,
-- finance and staff) and as the check before the server touches Stripe.
--   state: 'business' (not a consumer), 'not_billed', 'ended', 'open', 'closed'
--   reason: 'start' or 'renewal' when open
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
  if not app.org_is_consumer(l.org_id) then
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
create or replace function app.org_cooling_off_done(p_licence uuid, p_refund_minor int, p_currency text, p_refund_state text)
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
  if not app.org_is_consumer(l.org_id) then
    raise exception 'the cooling-off period is for personal plans' using errcode = 'AKO31';
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

-- ---------------------------------------------------------------------------
-- 7. Church bands.
-- ---------------------------------------------------------------------------
create or replace function app.org_band_number(p_plan text) returns int
language sql immutable set search_path = '' as $$
  select case p_plan when 'church_band_1' then 1 when 'church_band_2' then 2 when 'church_band_3' then 3 end
$$;

create or replace function app.org_band_seats(p_plan text) returns int
language sql stable security definer set search_path = '' as $$
  select case when app.org_band_number(p_plan) is null then null
              else greatest(1, least(10000, app.org_config_int('org_' || p_plan || '_seats',
                     case p_plan when 'church_band_1' then 50 when 'church_band_2' then 150 else 400 end))) end
$$;

-- Before the server swaps the band's price in Stripe. Returns 'up', 'down'
-- or 'same'. p_reason marks a staff override.
create or replace function app.org_billing_band_change_check(p_licence uuid, p_plan text, p_reason text default null) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  l        public.org_licences;
  s        public.org_subscriptions;
  v_reason text := app.clean_text(p_reason, 500);
  v_staff  boolean := v_reason is not null;
  v_from   int;
  v_to     int := app.org_band_number(p_plan);
begin
  select * into l from public.org_licences x where x.id = p_licence for update;
  if not found or app.uid() is null then
    raise exception 'not allowed' using errcode = 'AKO01';
  end if;
  if v_staff then
    if not app.is_platform(array['owner','editor','finance']) then
      raise exception 'only platform owners, editors and finance override a band change' using errcode = 'AKO01';
    end if;
  elsif not app.org_can(l.org_id, 'billing', 'write') then
    raise exception 'not allowed' using errcode = 'AKO01';
  end if;
  select * into s from public.org_subscriptions x where x.licence_id = l.id;
  if not found or app.org_band_number(s.plan) is null then
    raise exception 'this licence is not billed by band in Stripe' using errcode = 'AKO14';
  end if;
  if v_to is null then
    raise exception 'org_invalid: band' using errcode = 'AKO02';
  end if;
  if l.status = 'ended' or s.status in ('canceled','incomplete_expired') then
    raise exception 'this licence has ended' using errcode = 'AKO08';
  end if;
  v_from := app.org_band_number(s.plan);
  if not v_staff then
    if l.status <> 'active' or s.status not in ('active','trialing') or s.cancel_at_period_end or l.end_requested_at is not null then
      raise exception 'the band cannot change on this licence now' using errcode = 'AKO08';
    end if;
    if app.org_band_seats(p_plan) < app.org_licence_places_used(l.id) then
      raise exception 'that band is smaller than the % places already taken or invited', app.org_licence_places_used(l.id) using errcode = 'AKO08';
    end if;
  end if;
  if v_to = v_from then return 'same'; end if;
  perform app.audit(case when v_staff then 'org.band_change_override' else 'org.band_change_requested' end,
    'org_licence:' || l.id::text, v_reason, null, l.org_id,
    jsonb_build_object('plan', s.plan), jsonb_build_object('plan', p_plan, 'override', v_staff));
  return case when v_to > v_from then 'up' else 'down' end;
end $$;

-- When the mirror sees a new band, the licence takes the band's size. Never
-- below the places used: a staff override that lands a smaller band keeps
-- every seat taken.
create or replace function app.org_subscriptions_band_seats() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_seats int;
begin
  if app.org_band_number(new.plan) is not null and app.org_band_number(old.plan) is not null and new.plan <> old.plan then
    v_seats := greatest(app.org_band_seats(new.plan), app.org_licence_places_used(new.licence_id), 1);
    update public.org_licences x set seats_purchased = v_seats where x.id = new.licence_id and x.status <> 'ended';
    perform app.audit('org.band_changed', 'org_licence:' || new.licence_id::text, null, null, new.org_id,
      jsonb_build_object('plan', old.plan), jsonb_build_object('plan', new.plan, 'seats', v_seats));
  end if;
  return new;
end $$;
create trigger org_subscriptions_band_seats after update of plan on public.org_subscriptions
  for each row execute function app.org_subscriptions_band_seats();

-- ---------------------------------------------------------------------------
-- 8. A seat for the self-serve organiser, when they asked for one. The
-- webhook calls this after 0030 provisions the licence. Idempotent: a second
-- call returns the open seat. Returns null, and does nothing, when the
-- organiser has not confirmed they are 18 or over, is set for deletion, or
-- the licence has no place left.
-- ---------------------------------------------------------------------------
create or replace function app.org_self_serve_seat_organiser(p_licence uuid, p_user uuid) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  l       public.org_licences;
  v_email text;
  v_seat  uuid;
  v_ent   uuid;
begin
  if not app.is_service_role() then
    raise exception 'only the service role seats the organiser' using errcode = 'AKO01';
  end if;
  select * into l from public.org_licences x where x.id = p_licence for update;
  if not found or not l.self_serve then
    raise exception 'org_invalid: licence' using errcode = 'AKO02';
  end if;
  if p_user is null or not exists (select 1 from public.org_members m where m.org_id = l.org_id and m.user_id = p_user and m.role = 'owner') then
    raise exception 'org_invalid: organiser' using errcode = 'AKO02';
  end if;
  select s.id into v_seat from public.org_seats s where s.licence_id = l.id and s.user_id = p_user and s.released_at is null;
  if v_seat is not null then return v_seat; end if;
  if l.status <> 'active' or l.ends_at <= now() then return null; end if;
  if not exists (select 1 from public.profiles p where p.user_id = p_user and p.adult_confirmed_at is not null) then return null; end if;
  if exists (select 1 from public.account_deletion_requests d where d.user_id = p_user and d.cancelled_at is null and d.completed_at is null) then
    return null;
  end if;
  if app.org_licence_places_used(l.id) >= l.seats_purchased then return null; end if;
  select lower(u.email) into v_email from auth.users u where u.id = p_user;

  select e.id into v_ent from public.entitlements e
   where e.user_id = p_user and e.tenant_id = l.tenant_id and e.workbook_id is null
     and e.source = 'team_seat' and e.org_licence_id = l.id
   for update;
  if v_ent is null then
    insert into public.entitlements (user_id, tenant_id, workbook_id, source, status, starts_at, ends_at, org_licence_id)
    values (p_user, l.tenant_id, null, 'team_seat', 'active', l.starts_at, l.ends_at, l.id)
    returning id into v_ent;
  else
    update public.entitlements e set status = 'active', starts_at = l.starts_at, ends_at = l.ends_at where e.id = v_ent;
  end if;
  insert into public.org_seats (licence_id, org_id, user_id, invitation_id, entitlement_id, roster_email)
  values (l.id, l.org_id, p_user, null, v_ent, v_email)
  returning id into v_seat;
  insert into public.tenant_members (tenant_id, user_id, role) values (l.tenant_id, p_user, 'reader') on conflict do nothing;
  perform app.audit('org.seat_claimed', 'org_seat:' || v_seat::text, 'organiser', null, l.org_id, null,
    jsonb_build_object('licence', l.id, 'organiser', true, 'entitlement', v_ent));
  return v_seat;
end $$;

-- ---------------------------------------------------------------------------
-- 9. RPC wrappers. Security invoker: the app functions do the checks.
-- ---------------------------------------------------------------------------
create or replace function public.org_set_buyer_type(p_org uuid, p_type text, p_reason text) returns boolean
language sql volatile security invoker set search_path = '' as $$ select app.org_set_buyer_type(p_org, p_type, p_reason) $$;
create or replace function public.org_billing_contacts(p_org uuid)
returns table (user_id uuid, email text, role text)
language sql stable security invoker set search_path = '' as $$ select * from app.org_billing_contacts(p_org) $$;
create or replace function public.due_org_terms_reminders(p_now timestamptz default now())
returns table (stripe_subscription_id text, org_id uuid, organisation_name text, plan text, yearly boolean, seats int,
               current_period_end timestamptz, reminder_anchor_at timestamptz, amount_minor integer, currency char(3))
language sql stable security invoker set search_path = '' as $$ select * from app.due_org_terms_reminders(p_now) $$;
create or replace function public.mark_org_terms_reminder_sent(p_subscription text, p_at timestamptz default now()) returns boolean
language sql volatile security invoker set search_path = '' as $$ select app.mark_org_terms_reminder_sent(p_subscription, p_at) $$;
create or replace function public.org_billing_queue_overdue(p_now timestamptz default now()) returns int
language sql volatile security invoker set search_path = '' as $$ select app.org_billing_queue_overdue(p_now) $$;
create or replace function public.org_billing_mail_due(p_limit int default 100)
returns table (id uuid, kind text, org_id uuid, organisation_name text, consumer boolean, licence_kind text, relevant boolean,
               invoice_number text, amount_minor integer, currency char(3), due_at timestamptz, pay_url text, grace_until timestamptz,
               happens_at timestamptz, refund_minor integer, refund_currency char(3), refund_state text)
language sql stable security invoker set search_path = '' as $$ select * from app.org_billing_mail_due(p_limit) $$;
create or replace function public.org_billing_mail_done(p_id uuid, p_done boolean) returns boolean
language sql volatile security invoker set search_path = '' as $$ select app.org_billing_mail_done(p_id, p_done) $$;
create or replace function public.org_cooling_off_state(p_licence uuid)
returns table (state text, reason text, stripe_subscription_id text, opened_at timestamptz, closes_at timestamptz)
language sql stable security invoker set search_path = '' as $$ select * from app.org_cooling_off_state(p_licence) $$;
create or replace function public.org_cooling_off_done(p_licence uuid, p_refund_minor int, p_currency text, p_refund_state text) returns boolean
language sql volatile security invoker set search_path = '' as $$ select app.org_cooling_off_done(p_licence, p_refund_minor, p_currency, p_refund_state) $$;
create or replace function public.org_billing_band_change_check(p_licence uuid, p_plan text, p_reason text default null) returns text
language sql volatile security invoker set search_path = '' as $$ select app.org_billing_band_change_check(p_licence, p_plan, p_reason) $$;
create or replace function public.org_self_serve_seat_organiser(p_licence uuid, p_user uuid) returns uuid
language sql volatile security invoker set search_path = '' as $$ select app.org_self_serve_seat_organiser(p_licence, p_user) $$;

-- Execute: revoke from everyone, then give back to the roles that need it.
revoke execute on function
  app.org_is_consumer(uuid), app.org_licences_mark_consumer(), app.org_set_buyer_type(uuid, text, text),
  app.org_billing_contacts(uuid), app.org_plan_yearly(text), app.due_org_terms_reminders(timestamptz),
  app.mark_org_terms_reminder_sent(text, timestamptz), app.org_billing_mail_queue(uuid, uuid, text, text, text, timestamptz),
  app.org_invoices_queue_mail(), app.org_licences_queue_mail(), app.org_subscriptions_queue_mail(),
  app.org_billing_queue_overdue(timestamptz), app.org_billing_mail_due(int), app.org_billing_mail_done(uuid, boolean),
  app.org_cooling_off_state(uuid), app.org_cooling_off_done(uuid, int, text, text),
  app.org_band_number(text), app.org_band_seats(text), app.org_billing_band_change_check(uuid, text, text),
  app.org_subscriptions_band_seats(), app.org_self_serve_seat_organiser(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function
  public.org_set_buyer_type(uuid, text, text), public.org_billing_contacts(uuid), public.due_org_terms_reminders(timestamptz),
  public.mark_org_terms_reminder_sent(text, timestamptz), public.org_billing_queue_overdue(timestamptz),
  public.org_billing_mail_due(int), public.org_billing_mail_done(uuid, boolean),
  public.org_cooling_off_state(uuid), public.org_cooling_off_done(uuid, int, text, text),
  public.org_billing_band_change_check(uuid, text, text), public.org_self_serve_seat_organiser(uuid, uuid)
  from public, anon, authenticated;

-- The server (service role) alone: contacts, reminders, the outbox, the organiser's seat.
grant execute on function
  app.org_billing_contacts(uuid), app.due_org_terms_reminders(timestamptz), app.mark_org_terms_reminder_sent(text, timestamptz),
  app.org_billing_queue_overdue(timestamptz), app.org_billing_mail_due(int), app.org_billing_mail_done(uuid, boolean),
  app.org_self_serve_seat_organiser(uuid, uuid),
  public.org_billing_contacts(uuid), public.due_org_terms_reminders(timestamptz), public.mark_org_terms_reminder_sent(text, timestamptz),
  public.org_billing_queue_overdue(timestamptz), public.org_billing_mail_due(int), public.org_billing_mail_done(uuid, boolean),
  public.org_self_serve_seat_organiser(uuid, uuid)
  to service_role;
-- Signed-in callers. Each function checks the caller's role itself.
grant execute on function
  app.org_set_buyer_type(uuid, text, text), app.org_cooling_off_state(uuid), app.org_cooling_off_done(uuid, int, text, text),
  app.org_billing_band_change_check(uuid, text, text),
  public.org_set_buyer_type(uuid, text, text), public.org_cooling_off_state(uuid), public.org_cooling_off_done(uuid, int, text, text),
  public.org_billing_band_change_check(uuid, text, text)
  to authenticated;
-- Pure helpers the pages may ask about.
grant execute on function app.org_band_number(text), app.org_plan_yearly(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 10. Row level security. The outbox has no client access at all.
-- ---------------------------------------------------------------------------
alter table public.org_billing_mail enable row level security;
revoke all on public.org_billing_mail from anon, authenticated;
grant select, insert, update, delete on public.org_billing_mail to service_role;
