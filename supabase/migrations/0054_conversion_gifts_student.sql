-- 0054 Conversion, part 1: gift memberships, the student price and the timing
-- of the membership offer (build list 5.5, 5.6, 5.7, 14.22).
--
-- Same rules as 0001 to 0048. Nothing earlier is edited. RLS is on for every
-- new table, every function is security definer with search_path pinned to
-- '' and a public wrapper, and server-only functions answer to the service
-- role alone. Depends on 0004, 0009, 0024 and 0045.
--
-- 1. Config rows. Every limit below is a row in public.app_config, so each
--    can change without a release. Nothing here is a price: gift prices are
--    worked out from the membership price points at checkout.
-- 2. public.gift_memberships. A buyer pays once through Stripe Checkout in
--    payment mode. The recipient claims with an emailed link and needs no
--    card. Nothing renews. The gift is an entitlement with source 'gift'
--    (reserved in 0004) that ends on its own date and then the account is in
--    the normal free state. The claim token is kept only while the gift is
--    unclaimed, so the buyer can be shown the link if the email goes astray,
--    and is cleared when the gift is claimed, refunded or expires.
-- 3. app.has_entitlement learns that a gift opens the membership catalogue
--    only, exactly as a membership does. The body is 0024's.
-- 4. public.student_verifications. A student price needs an academic email
--    address. Only a hash of the address and its domain are kept. A
--    verification lasts a year and is then checked again.
-- 5. public.my_offer_use: the two counts the membership offer's timing reads
--    (5.5), under the reader's own row level security.

-- ---------------------------------------------------------------------------
-- 1. Config
-- ---------------------------------------------------------------------------
insert into public.app_config (key, value) values
  ('gift_months', '[1,3,6,12]'),
  ('gift_claim_days', '365'),
  ('gift_message_max', '300'),
  ('student_discount_percent', '50'),
  ('student_verify_hours', '24'),
  ('student_valid_days', '365'),
  ('student_recheck_days', '30'),
  ('offer_after_steps', '5'),
  ('offer_after_days', '7'),
  ('offer_after_samples', '2')
on conflict (key) do nothing;

create or replace function app.conv_config_int(p_key text, p_default int) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce((select (c.value #>> '{}')::int from public.app_config c where c.key = p_key), p_default)
$$;

-- ---------------------------------------------------------------------------
-- 2. Gift memberships
-- ---------------------------------------------------------------------------
create table public.gift_memberships (
  id                         uuid primary key default gen_random_uuid(),
  tenant_id                  uuid not null references public.tenants(id),
  buyer_id                   uuid references auth.users(id) on delete set null,
  recipient_email            text check (recipient_email is null or recipient_email ~ '^[^[:space:]@<>"]+@[^[:space:]@<>"]+[.][^[:space:]@<>"]+$'),
  recipient_name             text check (recipient_name is null or char_length(recipient_name) <= 60),
  sender_name                text check (sender_name is null or char_length(sender_name) <= 60),
  message                    text check (message is null or char_length(message) <= 1000),
  months                     int not null check (months between 1 and 24),
  status                     text not null default 'pending' check (status in ('pending','paid','claimed','expired','refunded','failed')),
  stripe_checkout_session_id text not null unique,
  stripe_payment_intent_id   text,
  currency                   char(3) not null,
  amount_minor               integer not null default 0 check (amount_minor >= 0),
  tax_minor                  integer not null default 0 check (tax_minor >= 0),
  claim_token                text unique check (claim_token is null or claim_token ~ '^[A-Za-z0-9_-]{32,64}$'),
  paid_at                    timestamptz,
  delivered_at               timestamptz,
  claim_by                   timestamptz,
  claimed_by                 uuid references auth.users(id) on delete set null,
  claimed_at                 timestamptz,
  starts_at                  timestamptz,
  ends_at                    timestamptz,
  entitlement_id             uuid references public.entitlements(id) on delete set null,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);
create index gift_memberships_buyer_idx on public.gift_memberships(buyer_id);
create index gift_memberships_claimed_by_idx on public.gift_memberships(claimed_by);
create index gift_memberships_pi_idx on public.gift_memberships(stripe_payment_intent_id);
create index gift_memberships_tenant_idx on public.gift_memberships(tenant_id);
create index gift_memberships_open_idx on public.gift_memberships(claim_by) where status = 'paid';
create trigger gift_memberships_touch before update on public.gift_memberships for each row execute function app.touch_updated_at();

alter table public.gift_memberships enable row level security;
revoke all on public.gift_memberships from anon, authenticated;
-- A buyer reads their own gifts, without the Stripe ids. Nobody writes except through the functions below.
grant select (id, tenant_id, recipient_email, recipient_name, sender_name, message, months, status, currency, amount_minor,
              claim_token, paid_at, delivered_at, claim_by, claimed_at, ends_at, created_at)
  on public.gift_memberships to authenticated;
grant select, insert, update on public.gift_memberships to service_role;
create policy gift_memberships_buyer_read on public.gift_memberships for select to authenticated
  using (buyer_id = app.uid());
create policy gift_memberships_staff_read on public.gift_memberships for select to authenticated
  using (app.is_platform(array['owner','support','finance']));

-- Create the pending row when the Checkout Session exists. Service role only.
create or replace function app.gift_create(
  p_tenant uuid, p_buyer uuid, p_session text, p_token text, p_months int, p_recipient_email text,
  p_recipient_name text, p_sender_name text, p_message text, p_currency text, p_amount_minor int
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_allowed boolean;
  v_max int := app.conv_config_int('gift_message_max', 300);
begin
  if not app.is_service_role() then
    raise exception 'only the service role creates gifts' using errcode = 'insufficient_privilege';
  end if;
  select exists (
    select 1 from public.app_config c, jsonb_array_elements_text(c.value) m
     where c.key = 'gift_months' and jsonb_typeof(c.value) = 'array' and m = p_months::text
  ) into v_allowed;
  if not coalesce(v_allowed, false) then
    raise exception 'that gift length is not on offer' using errcode = 'AKX21';
  end if;
  if p_message is not null and char_length(p_message) > v_max then
    raise exception 'the message is too long' using errcode = 'AKX22';
  end if;
  insert into public.gift_memberships (tenant_id, buyer_id, stripe_checkout_session_id, claim_token, months,
    recipient_email, recipient_name, sender_name, message, currency, amount_minor)
  values (p_tenant, p_buyer, p_session, p_token, p_months,
    lower(btrim(p_recipient_email)), nullif(btrim(coalesce(p_recipient_name, '')), ''), nullif(btrim(coalesce(p_sender_name, '')), ''),
    nullif(btrim(coalesce(p_message, '')), ''), upper(p_currency), p_amount_minor)
  returning id into v_id;
  return v_id;
end $$;

-- The payment cleared. Pending becomes paid and the claim window opens. Safe to
-- run again: a repeat delivery returns the same row with changed = false, and
-- delivered tells the caller whether the email still has to go.
create or replace function app.gift_mark_paid(p_session text, p_payment_intent text, p_amount_minor int, p_tax_minor int, p_currency text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  g public.gift_memberships%rowtype;
  v_changed boolean := false;
begin
  if not app.is_service_role() then
    raise exception 'only the service role records gift payments' using errcode = 'insufficient_privilege';
  end if;
  select * into g from public.gift_memberships where stripe_checkout_session_id = p_session for update;
  if not found then return jsonb_build_object('found', false); end if;
  if g.status = 'pending' then
    update public.gift_memberships
       set status = 'paid', paid_at = now(), stripe_payment_intent_id = p_payment_intent,
           amount_minor = coalesce(p_amount_minor, amount_minor), tax_minor = coalesce(p_tax_minor, 0),
           currency = coalesce(upper(p_currency), currency),
           claim_by = now() + make_interval(days => app.conv_config_int('gift_claim_days', 365))
     where id = g.id
     returning * into g;
    v_changed := true;
    perform app.audit('commerce.gift_paid', 'gift:' || g.id::text, null, g.tenant_id, null, null,
      jsonb_build_object('months', g.months, 'amount_minor', g.amount_minor));
  end if;
  return jsonb_build_object('found', true, 'changed', v_changed, 'id', g.id, 'status', g.status, 'tenant_id', g.tenant_id,
    'buyer_id', g.buyer_id, 'months', g.months, 'recipient_email', g.recipient_email, 'recipient_name', g.recipient_name,
    'sender_name', g.sender_name, 'message', g.message, 'token', g.claim_token, 'delivered', g.delivered_at is not null,
    'amount_minor', g.amount_minor, 'currency', g.currency);
end $$;

create or replace function app.gift_mark_delivered(p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not app.is_service_role() then
    raise exception 'only the service role records gift delivery' using errcode = 'insufficient_privilege';
  end if;
  update public.gift_memberships set delivered_at = now() where id = p_id and delivered_at is null and status = 'paid';
  get diagnostics n = row_count;
  return n = 1;
end $$;

-- The session failed or expired before payment.
create or replace function app.gift_mark_failed(p_session text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not app.is_service_role() then
    raise exception 'only the service role records gift payments' using errcode = 'insufficient_privilege';
  end if;
  update public.gift_memberships set status = 'failed', claim_token = null, recipient_email = null
   where stripe_checkout_session_id = p_session and status = 'pending';
  get diagnostics n = row_count;
  return n = 1;
end $$;

-- A refund of the payment. The gift ends at once, claimed or not.
create or replace function app.gift_refund(p_payment_intent text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  g public.gift_memberships%rowtype;
  v_was_claimed boolean;
begin
  if not app.is_service_role() then
    raise exception 'only the service role records gift refunds' using errcode = 'insufficient_privilege';
  end if;
  select * into g from public.gift_memberships where stripe_payment_intent_id = p_payment_intent for update;
  if not found then return jsonb_build_object('found', false); end if;
  if g.status = 'refunded' then return jsonb_build_object('found', true, 'changed', false, 'id', g.id); end if;
  v_was_claimed := g.status = 'claimed';
  if g.entitlement_id is not null and v_was_claimed then
    update public.entitlements set status = 'revoked', ends_at = least(coalesce(ends_at, now()), now())
     where id = g.entitlement_id and status = 'active';
  end if;
  update public.gift_memberships set status = 'refunded', claim_token = null, recipient_email = null where id = g.id;
  perform app.audit('commerce.gift_refunded', 'gift:' || g.id::text, null, g.tenant_id, null,
    jsonb_build_object('status', g.status), jsonb_build_object('status', 'refunded'));
  return jsonb_build_object('found', true, 'changed', true, 'id', g.id, 'was_claimed', v_was_claimed);
end $$;

-- What the claim page shows before anyone signs in: how long, from whom, the
-- message. The token is the secret. Nothing is returned for an unknown one.
create or replace function app.gift_preview(p_token text) returns table (months int, sender_name text, message text, status text, claim_by timestamptz)
language sql stable security definer set search_path = '' as $$
  select g.months, g.sender_name, g.message, g.status, g.claim_by
    from public.gift_memberships g
   where p_token is not null and char_length(p_token) >= 32 and g.claim_token = p_token and g.status in ('paid', 'claimed')
$$;

-- The recipient claims. Returns 'claimed', 'invalid' or 'expired'. The token is
-- cleared on a claim, so a second use of the link is 'invalid'.
-- The membership catalogue opens for the length of the gift. A second gift
-- claimed while one is running is added to the end of it.
create or replace function app.claim_gift(p_token text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  g public.gift_memberships%rowtype;
  e public.entitlements%rowtype;
  v_user uuid := app.uid();
  v_start timestamptz;
  v_end timestamptz;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'sign in to claim a gift' using errcode = 'insufficient_privilege';
  end if;
  if p_token is null or char_length(p_token) < 32 then return 'invalid'; end if;
  select * into g from public.gift_memberships where claim_token = p_token for update;
  if not found then return 'invalid'; end if;
  if g.status <> 'paid' then return 'invalid'; end if;
  if g.claim_by is not null and g.claim_by <= now() then return 'expired'; end if;

  select * into e from public.entitlements
   where user_id = v_user and tenant_id = g.tenant_id and workbook_id is null and source = 'gift' and org_licence_id is null
   for update;
  if not found then
    v_start := now();
    v_end := v_start + make_interval(months => g.months);
    insert into public.entitlements (user_id, tenant_id, workbook_id, source, status, starts_at, ends_at)
    values (v_user, g.tenant_id, null, 'gift', 'active', v_start, v_end) returning id into v_id;
  else
    v_start := case when e.status = 'active' and coalesce(e.ends_at, now()) > now() then e.starts_at else now() end;
    v_end := greatest(coalesce(e.ends_at, now()), now()) + make_interval(months => g.months);
    update public.entitlements set status = 'active', starts_at = v_start, ends_at = v_end where id = e.id;
    v_id := e.id;
  end if;

  update public.gift_memberships
     set status = 'claimed', claimed_by = v_user, claimed_at = now(), starts_at = v_start, ends_at = v_end,
         entitlement_id = v_id, claim_token = null, recipient_email = null
   where id = g.id;
  perform app.audit('commerce.gift_claimed', 'gift:' || g.id::text, null, g.tenant_id, null, null,
    jsonb_build_object('months', g.months, 'ends_at', v_end));
  return 'claimed';
end $$;

-- Housekeeping, run daily. A claimed gift whose end has passed becomes
-- expired and its entitlement lapses (read only, answers kept). A paid gift
-- nobody claimed inside the window expires and its token and address go.
create or replace function app.gifts_expire() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  n_ended int;
  n_unclaimed int;
begin
  if not app.is_service_role() then
    raise exception 'only the service role expires gifts' using errcode = 'insufficient_privilege';
  end if;
  update public.entitlements en set status = 'lapsed'
   where en.source = 'gift' and en.status = 'active' and en.ends_at is not null and en.ends_at <= now();
  update public.gift_memberships set status = 'expired'
   where status = 'claimed' and ends_at is not null and ends_at <= now();
  get diagnostics n_ended = row_count;
  update public.gift_memberships set status = 'expired', claim_token = null, recipient_email = null
   where status = 'paid' and claim_by is not null and claim_by <= now();
  get diagnostics n_unclaimed = row_count;
  return jsonb_build_object('ended', n_ended, 'unclaimed', n_unclaimed);
end $$;

-- ---------------------------------------------------------------------------
-- 3. has_entitlement: a gift opens the membership catalogue, no more
-- ---------------------------------------------------------------------------
create or replace function app.has_entitlement(p_user uuid, p_tenant uuid, p_workbook uuid, p_unit int default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user is not null and p_tenant is not null and exists (
    select 1 from public.entitlements e
    where e.user_id = p_user
      and e.tenant_id = p_tenant
      and (e.workbook_id = p_workbook
           or (e.workbook_id is null
               and (e.source not in ('membership', 'gift') or p_workbook is null or app.workbook_in_membership(p_workbook))))
      and (e.source <> 'team_seat' or app.team_seat_covers(e.org_licence_id, p_workbook))
      and e.status = 'active'
      and e.starts_at <= now()
      and (e.ends_at is null or e.ends_at > now()))
$$;

-- ---------------------------------------------------------------------------
-- 4. The student price
-- ---------------------------------------------------------------------------
create table public.student_verifications (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null unique references auth.users(id) on delete cascade,
  email_hash         text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  email_domain       text not null check (char_length(email_domain) between 3 and 120),
  token_hash         text check (token_hash is null or token_hash ~ '^[0-9a-f]{64}$'),
  token_expires_at   timestamptz,
  verified_at        timestamptz,
  expires_at         timestamptz,
  recheck_sent_at    timestamptz,
  discount_removed_at timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index student_verifications_email_idx on public.student_verifications(email_hash) where verified_at is not null;
create index student_verifications_expiry_idx on public.student_verifications(expires_at) where verified_at is not null;
create trigger student_verifications_touch before update on public.student_verifications for each row execute function app.touch_updated_at();

alter table public.student_verifications enable row level security;
revoke all on public.student_verifications from anon, authenticated;
grant select (id, user_id, email_domain, verified_at, expires_at, created_at) on public.student_verifications to authenticated;
grant select, insert, update, delete on public.student_verifications to service_role;
create policy student_verifications_own_read on public.student_verifications for select to authenticated
  using (user_id = app.uid());

-- The reader asks for a link. Replaces any earlier pending token. An earlier
-- verification stays valid until the new one replaces it.
create or replace function app.student_request(p_email_hash text, p_domain text, p_token_hash text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := app.uid();
begin
  if v_user is null then
    raise exception 'sign in to ask for the student price' using errcode = 'insufficient_privilege';
  end if;
  insert into public.student_verifications (user_id, email_hash, email_domain, token_hash, token_expires_at)
  values (v_user, p_email_hash, lower(p_domain), p_token_hash,
          now() + make_interval(hours => app.conv_config_int('student_verify_hours', 24)))
  on conflict (user_id) do update
    set token_hash = excluded.token_hash, token_expires_at = excluded.token_expires_at,
        email_hash = case when public.student_verifications.verified_at is null then excluded.email_hash else public.student_verifications.email_hash end,
        email_domain = case when public.student_verifications.verified_at is null then excluded.email_domain else public.student_verifications.email_domain end;
  return true;
end $$;

-- The reader follows the link while signed in. One academic address verifies
-- one account at a time. Returns 'verified', 'invalid', 'expired' or 'email_in_use'.
create or replace function app.student_verify(p_token_hash text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := app.uid();
  s public.student_verifications%rowtype;
begin
  if v_user is null then
    raise exception 'sign in to confirm the student price' using errcode = 'insufficient_privilege';
  end if;
  select * into s from public.student_verifications where user_id = v_user for update;
  if not found or s.token_hash is null or s.token_hash <> p_token_hash then return 'invalid'; end if;
  if s.token_expires_at is null or s.token_expires_at <= now() then return 'expired'; end if;
  if exists (select 1 from public.student_verifications o
              where o.user_id <> v_user and o.email_hash = s.email_hash and o.verified_at is not null and o.expires_at > now()) then
    return 'email_in_use';
  end if;
  update public.student_verifications
     set verified_at = now(), expires_at = now() + make_interval(days => app.conv_config_int('student_valid_days', 365)),
         token_hash = null, token_expires_at = null, recheck_sent_at = null, discount_removed_at = null
   where id = s.id;
  perform app.audit('account.student_verified', 'user:' || v_user::text, null, null, null, null,
    jsonb_build_object('domain', s.email_domain));
  return 'verified';
end $$;

-- Who is due a re-check email, and whose discount has run out. Service role only.
create or replace function app.student_due(p_now timestamptz) returns table (user_id uuid, email text, expires_at timestamptz, due text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_service_role() then
    raise exception 'only the service role lists student checks' using errcode = 'insufficient_privilege';
  end if;
  return query
    select s.user_id, u.email::text, s.expires_at,
           case when s.expires_at <= p_now then 'expired' else 'recheck' end
      from public.student_verifications s
      join auth.users u on u.id = s.user_id
     where s.verified_at is not null and s.expires_at is not null
       and ((s.expires_at <= p_now and s.discount_removed_at is null)
         or (s.expires_at > p_now and s.expires_at <= p_now + make_interval(days => app.conv_config_int('student_recheck_days', 30)) and s.recheck_sent_at is null));
end $$;

create or replace function app.student_mark(p_user uuid, p_what text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not app.is_service_role() then
    raise exception 'only the service role records student checks' using errcode = 'insufficient_privilege';
  end if;
  if p_what = 'recheck_sent' then
    update public.student_verifications set recheck_sent_at = now() where user_id = p_user and recheck_sent_at is null;
  elsif p_what = 'discount_removed' then
    update public.student_verifications set discount_removed_at = now() where user_id = p_user and discount_removed_at is null;
  else
    raise exception 'unknown student mark' using errcode = 'AKX23';
  end if;
  get diagnostics n = row_count;
  return n = 1;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Offer timing (5.5)
-- ---------------------------------------------------------------------------
-- samples: how many different workbooks the reader has begun. steps_aged: the
-- most finished steps on any one workbook that was begun at least p_days ago.
-- Plain counts under the reader's own row level security. No dates leave.
create or replace function public.my_offer_use(p_tenant uuid, p_days int)
returns table (samples int, steps_aged int)
language sql stable security invoker set search_path = '' as $$
  with mine as (
    select e.id, e.workbook_id, e.started_at
      from public.enrolments e
     where e.user_id = app.uid() and e.tenant_id = p_tenant
  ),
  steps as (
    select m.id, m.started_at, count(pe.id) filter (where pe.kind = 'step_done') as n
      from mine m
      left join public.progress_events pe on pe.enrolment_id = m.id
     group by m.id, m.started_at
  )
  select (select count(distinct workbook_id) from mine)::int,
         coalesce((select max(n) from steps where started_at <= now() - make_interval(days => greatest(p_days, 0))), 0)::int
$$;

-- ---------------------------------------------------------------------------
-- Public wrappers and grants
-- ---------------------------------------------------------------------------
create or replace function public.gift_create(p_tenant uuid, p_buyer uuid, p_session text, p_token text, p_months int, p_recipient_email text,
  p_recipient_name text, p_sender_name text, p_message text, p_currency text, p_amount_minor int) returns uuid
language sql volatile security invoker set search_path = '' as $$
  select app.gift_create(p_tenant, p_buyer, p_session, p_token, p_months, p_recipient_email, p_recipient_name, p_sender_name, p_message, p_currency, p_amount_minor)
$$;
create or replace function public.gift_mark_paid(p_session text, p_payment_intent text, p_amount_minor int, p_tax_minor int, p_currency text) returns jsonb
language sql volatile security invoker set search_path = '' as $$
  select app.gift_mark_paid(p_session, p_payment_intent, p_amount_minor, p_tax_minor, p_currency)
$$;
create or replace function public.gift_mark_delivered(p_id uuid) returns boolean
language sql volatile security invoker set search_path = '' as $$ select app.gift_mark_delivered(p_id) $$;
create or replace function public.gift_mark_failed(p_session text) returns boolean
language sql volatile security invoker set search_path = '' as $$ select app.gift_mark_failed(p_session) $$;
create or replace function public.gift_refund(p_payment_intent text) returns jsonb
language sql volatile security invoker set search_path = '' as $$ select app.gift_refund(p_payment_intent) $$;
create or replace function public.gift_preview(p_token text) returns table (months int, sender_name text, message text, status text, claim_by timestamptz)
language sql stable security invoker set search_path = '' as $$ select * from app.gift_preview(p_token) $$;
create or replace function public.claim_gift(p_token text) returns text
language sql volatile security invoker set search_path = '' as $$ select app.claim_gift(p_token) $$;
create or replace function public.gifts_expire() returns jsonb
language sql volatile security invoker set search_path = '' as $$ select app.gifts_expire() $$;
create or replace function public.student_request(p_email_hash text, p_domain text, p_token_hash text) returns boolean
language sql volatile security invoker set search_path = '' as $$ select app.student_request(p_email_hash, p_domain, p_token_hash) $$;
create or replace function public.student_verify(p_token_hash text) returns text
language sql volatile security invoker set search_path = '' as $$ select app.student_verify(p_token_hash) $$;
create or replace function public.student_due(p_now timestamptz) returns table (user_id uuid, email text, expires_at timestamptz, due text)
language sql stable security invoker set search_path = '' as $$ select * from app.student_due(p_now) $$;
create or replace function public.student_mark(p_user uuid, p_what text) returns boolean
language sql volatile security invoker set search_path = '' as $$ select app.student_mark(p_user, p_what) $$;

-- Service role only.
revoke execute on function
  app.gift_create(uuid, uuid, text, text, int, text, text, text, text, text, int),
  app.gift_mark_paid(text, text, int, int, text), app.gift_mark_delivered(uuid), app.gift_mark_failed(text),
  app.gift_refund(text), app.gifts_expire(), app.student_due(timestamptz), app.student_mark(uuid, text),
  public.gift_create(uuid, uuid, text, text, int, text, text, text, text, text, int),
  public.gift_mark_paid(text, text, int, int, text), public.gift_mark_delivered(uuid), public.gift_mark_failed(text),
  public.gift_refund(text), public.gifts_expire(), public.student_due(timestamptz), public.student_mark(uuid, text)
  from public, anon, authenticated;
grant execute on function
  app.gift_create(uuid, uuid, text, text, int, text, text, text, text, text, int),
  app.gift_mark_paid(text, text, int, int, text), app.gift_mark_delivered(uuid), app.gift_mark_failed(text),
  app.gift_refund(text), app.gifts_expire(), app.student_due(timestamptz), app.student_mark(uuid, text),
  public.gift_create(uuid, uuid, text, text, int, text, text, text, text, text, int),
  public.gift_mark_paid(text, text, int, int, text), public.gift_mark_delivered(uuid), public.gift_mark_failed(text),
  public.gift_refund(text), public.gifts_expire(), public.student_due(timestamptz), public.student_mark(uuid, text)
  to service_role;

-- The claim page may preview with a token before sign-in; claiming needs a session.
revoke execute on function app.gift_preview(text), public.gift_preview(text) from public;
grant execute on function app.gift_preview(text), public.gift_preview(text) to anon, authenticated, service_role;
revoke execute on function app.claim_gift(text), public.claim_gift(text), app.student_request(text, text, text), public.student_request(text, text, text),
  app.student_verify(text), public.student_verify(text) from public, anon;
grant execute on function app.claim_gift(text), public.claim_gift(text), app.student_request(text, text, text), public.student_request(text, text, text),
  app.student_verify(text), public.student_verify(text) to authenticated;
revoke execute on function public.my_offer_use(uuid, int) from public, anon;
grant execute on function public.my_offer_use(uuid, int) to authenticated;
revoke execute on function app.conv_config_int(text, int) from public, anon;
grant execute on function app.conv_config_int(text, int) to authenticated, service_role;
