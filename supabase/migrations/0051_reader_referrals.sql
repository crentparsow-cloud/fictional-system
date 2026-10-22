-- 0051 Reader referrals (build list 6.3 and 13.11).
--
-- Double sided and built to the referral law spec in the build list:
--   * Each reader has one unique link. Akana never emails the friend.
--   * The friend gets extra trial days, or a fixed amount off the first
--     payment on a plan with no trial. Neither is called free.
--   * The referrer is rewarded only when the friend's first payment clears:
--     an account credit, or extra trial days if the referrer is still on a
--     trial. At most `annual_cap` rewards in any rolling year. Credit never
--     becomes cash: there is no function here or anywhere that pays it out.
--   * Guards: no self referral (same account, or the same address once dots
--     and plus tags are removed) and no duplicate card (the friend's card
--     fingerprint may not match the referrer's, and one referrer cannot be
--     rewarded twice for the same card).
--
-- Values live in public.app_config under the key 'referral' (placeholders
-- from docs/planning/AK_Phase_B_Decisions_2026-10-21.md, on the review list).
-- Same rules as 0001 to 0048: security definer with search_path pinned to '',
-- execute revoked from public before any grant, nothing earlier edited.
-- Depends on 0001, 0004, 0009 and 0042.

-- ---------------------------------------------------------------------------
-- 1. Settings. Amounts are minor units by currency; a currency with no figure
-- gets no money reward or discount (the days still apply).
-- ---------------------------------------------------------------------------
insert into public.app_config (key, value) values
  ('referral', jsonb_build_object(
    'friend_trial_days', 14,
    'friend_off_minor', jsonb_build_object('GBP', 500),
    'referrer_credit_minor', jsonb_build_object('GBP', 500),
    'referrer_trial_days', 14,
    'annual_cap', 12))
on conflict (key) do nothing;

create or replace function app.referral_config() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select value from public.app_config where key = 'referral'), '{}'::jsonb)
$$;

-- Addresses compared without dots and plus tags (and the gmail alias), so a
-- person cannot refer themselves with a variant of their own address.
create or replace function app.norm_email(p_email text) returns text
language sql immutable set search_path = '' as $$
  select case when p_email is null or position('@' in p_email) = 0 then lower(coalesce(p_email, ''))
    else
      case when split_part(lower(p_email), '@', 2) in ('gmail.com', 'googlemail.com')
        then replace(split_part(split_part(lower(p_email), '@', 1), '+', 1), '.', '') || '@gmail.com'
        else split_part(split_part(lower(p_email), '@', 1), '+', 1) || '@' || split_part(lower(p_email), '@', 2)
      end
    end
$$;

-- ---------------------------------------------------------------------------
-- 2. Tables. No client grants: readers reach their own figures through the
-- functions below, which return counts and never another person's identity.
-- ---------------------------------------------------------------------------
create table public.referral_codes (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  code       text not null unique check (code ~ '^[0-9A-F]{10}$'),
  created_at timestamptz not null default now()
);

create table public.referrals (
  id                   uuid primary key default gen_random_uuid(),
  referrer_id          uuid not null references auth.users(id) on delete cascade,
  referred_id          uuid not null references auth.users(id) on delete cascade,
  code                 text not null,
  status               text not null default 'pending' check (status in ('pending','qualified','rewarding','rewarded','blocked')),
  block_reason         text check (block_reason is null or block_reason in ('same_card','duplicate_card','cap_reached')),
  friend_benefit       text check (friend_benefit is null or friend_benefit in ('trial_days','first_payment_off')),
  friend_benefit_value int,
  checkout_session_id  text,
  card_fingerprint     text,
  reward_kind          text check (reward_kind is null or reward_kind in ('credit','trial_days')),
  reward_value         int,
  reward_currency      char(3),
  created_at           timestamptz not null default now(),
  qualified_at         timestamptz,
  rewarded_at          timestamptz,
  -- one referral per friend: the first link used wins
  constraint referrals_one_per_friend unique (referred_id),
  constraint referrals_not_self check (referrer_id <> referred_id)
);
create index referrals_referrer_idx on public.referrals(referrer_id, status);
-- One reward per card for a referrer (duplicate card guard).
create unique index referrals_card_once_idx on public.referrals(referrer_id, card_fingerprint)
  where status in ('rewarding','rewarded') and card_fingerprint is not null;

create table public.account_credits (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  kind                  text not null default 'referral' check (kind in ('referral')),
  amount_minor          int not null check (amount_minor > 0),
  currency              char(3) not null,
  referral_id           uuid unique references public.referrals(id),
  status                text not null default 'pending' check (status in ('pending','applied')),
  stripe_balance_txn_id text,
  created_at            timestamptz not null default now(),
  applied_at            timestamptz
);
create index account_credits_user_idx on public.account_credits(user_id, status);

alter table public.referral_codes enable row level security;
alter table public.referrals enable row level security;
alter table public.account_credits enable row level security;
revoke all on public.referral_codes, public.referrals, public.account_credits from public, anon, authenticated;
grant select, insert, update on public.referral_codes, public.referrals, public.account_credits to service_role;

-- ---------------------------------------------------------------------------
-- 3. The reader's own link and figures.
-- ---------------------------------------------------------------------------
create or replace function public.my_referral_code() returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := app.uid();
  v_code text;
begin
  if v_user is null then
    raise exception 'sign in first' using errcode = 'insufficient_privilege';
  end if;
  select code into v_code from public.referral_codes where user_id = v_user;
  if v_code is not null then return v_code; end if;
  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    begin
      insert into public.referral_codes (user_id, code) values (v_user, v_code)
        on conflict (user_id) do nothing;
      exit;
    exception when unique_violation then
      -- a code clash with someone else: try another
      null;
    end;
  end loop;
  select code into v_code from public.referral_codes where user_id = v_user;
  return v_code;
end $$;
revoke execute on function public.my_referral_code() from public, anon;
grant execute on function public.my_referral_code() to authenticated;

-- Counts only. Rewards used are counted over the rolling year.
create or replace function public.my_referral_summary()
returns table (invited int, rewarded_this_year int, cap int, credit_minor bigint, credit_currency text)
language sql stable security definer set search_path = '' as $$
  select
    (select count(*)::int from public.referrals r where r.referrer_id = app.uid()),
    (select count(*)::int from public.referrals r where r.referrer_id = app.uid()
        and r.status in ('rewarding','rewarded') and r.qualified_at > now() - interval '1 year'),
    coalesce((app.referral_config() ->> 'annual_cap')::int, 12),
    coalesce((select sum(c.amount_minor) from public.account_credits c where c.user_id = app.uid()), 0)::bigint,
    (select c.currency::text from public.account_credits c where c.user_id = app.uid() order by c.created_at desc limit 1)
  where app.uid() is not null
$$;
revoke execute on function public.my_referral_summary() from public, anon;
grant execute on function public.my_referral_summary() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Using a link. The friend, signed in, chooses to use the invitation. The
-- decision is recorded before any payment. Returns 'attached', 'already',
-- 'self', 'unknown_code' or 'not_new' (the friend has paid Akana before).
-- ---------------------------------------------------------------------------
create or replace function public.referral_use(p_code text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user     uuid := app.uid();
  v_referrer uuid;
  v_mine     text;
  v_theirs   text;
begin
  if v_user is null then
    raise exception 'sign in first' using errcode = 'insufficient_privilege';
  end if;
  select user_id into v_referrer from public.referral_codes where code = upper(btrim(coalesce(p_code, '')));
  if v_referrer is null then return 'unknown_code'; end if;
  if v_referrer = v_user then return 'self'; end if;
  select app.norm_email(email) into v_mine from auth.users where id = v_user;
  select app.norm_email(email) into v_theirs from auth.users where id = v_referrer;
  if v_mine is not null and v_mine = v_theirs then return 'self'; end if;
  if exists (select 1 from public.subscriptions s where s.user_id = v_user)
     or exists (select 1 from public.purchases p where p.user_id = v_user and p.status in ('paid','refunded')) then
    return 'not_new';
  end if;
  insert into public.referrals (referrer_id, referred_id, code) values (v_referrer, v_user, upper(btrim(p_code)))
    on conflict (referred_id) do nothing;
  return case when found then 'attached' else 'already' end;
end $$;
revoke execute on function public.referral_use(text) from public, anon;
grant execute on function public.referral_use(text) to authenticated;

-- The pending referral for a friend about to check out, with the values to
-- offer. Service role (the checkout route).
create or replace function public.referral_for_checkout(p_user uuid) returns table (referral_id uuid, config jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_service_role() then
    raise exception 'only the service role reads referrals' using errcode = 'insufficient_privilege';
  end if;
  return query
    select r.id, app.referral_config()
      from public.referrals r
     where r.referred_id = p_user and r.status = 'pending'
       and not exists (select 1 from public.subscriptions s where s.user_id = p_user);
end $$;
revoke execute on function public.referral_for_checkout(uuid) from public, anon, authenticated;
grant execute on function public.referral_for_checkout(uuid) to service_role;

-- Records what the friend was offered and the Checkout Session it went into.
create or replace function public.referral_offer_recorded(p_referral uuid, p_benefit text, p_value int, p_session text) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not app.is_service_role() then
    raise exception 'only the service role records referrals' using errcode = 'insufficient_privilege';
  end if;
  update public.referrals set friend_benefit = p_benefit, friend_benefit_value = p_value, checkout_session_id = p_session
   where id = p_referral and status = 'pending';
end $$;
revoke execute on function public.referral_offer_recorded(uuid, text, int, text) from public, anon, authenticated;
grant execute on function public.referral_offer_recorded(uuid, text, int, text) to service_role;

-- ---------------------------------------------------------------------------
-- 5. The friend's first payment clears. Service role (the webhook).
-- Returns the reward to give, or no row when there is nothing to do (no
-- referral, already rewarded, blocked, or over the cap). Calling it again
-- while a reward is still being given returns the same reward, so a retried
-- webhook never gives a second one.
-- ---------------------------------------------------------------------------
create or replace function public.referral_claim_reward(
  p_referred uuid, p_fingerprint text, p_referrer_fingerprints text[], p_referrer_trialing boolean, p_currency text
) returns table (referral_id uuid, referrer_id uuid, reward_kind text, reward_value int, reward_currency text)
language plpgsql volatile security definer set search_path = '' as $$
declare
  r      public.referrals%rowtype;
  cfg    jsonb := app.referral_config();
  v_cap  int := coalesce((cfg ->> 'annual_cap')::int, 12);
  v_cur  text := upper(coalesce(p_currency, 'GBP'));
  v_kind text;
  v_val  int;
begin
  if not app.is_service_role() then
    raise exception 'only the service role claims rewards' using errcode = 'insufficient_privilege';
  end if;
  select * into r from public.referrals where referred_id = p_referred for update;
  if not found then return; end if;
  if r.status = 'rewarding' then
    return query select r.id, r.referrer_id, r.reward_kind, r.reward_value, r.reward_currency::text;
    return;
  end if;
  if r.status <> 'pending' then return; end if;

  if p_fingerprint is not null and p_referrer_fingerprints is not null and p_fingerprint = any (p_referrer_fingerprints) then
    update public.referrals set status = 'blocked', block_reason = 'same_card', card_fingerprint = p_fingerprint, qualified_at = now() where id = r.id;
    return;
  end if;
  if p_fingerprint is not null and exists (
       select 1 from public.referrals o
        where o.referrer_id = r.referrer_id and o.card_fingerprint = p_fingerprint
          and o.status in ('rewarding','rewarded') and o.id <> r.id) then
    update public.referrals set status = 'blocked', block_reason = 'duplicate_card', card_fingerprint = p_fingerprint, qualified_at = now() where id = r.id;
    return;
  end if;
  if (select count(*) from public.referrals o
       where o.referrer_id = r.referrer_id and o.status in ('rewarding','rewarded')
         and o.qualified_at > now() - interval '1 year') >= v_cap then
    update public.referrals set status = 'blocked', block_reason = 'cap_reached', card_fingerprint = p_fingerprint, qualified_at = now() where id = r.id;
    return;
  end if;

  if p_referrer_trialing then
    v_kind := 'trial_days';
    v_val := coalesce((cfg ->> 'referrer_trial_days')::int, 14);
  else
    v_kind := 'credit';
    v_val := coalesce((cfg -> 'referrer_credit_minor' ->> v_cur)::int, 0);
  end if;
  if v_val <= 0 then
    -- no figure for this currency: the referral is recorded, nothing is given
    update public.referrals set status = 'qualified', card_fingerprint = p_fingerprint, qualified_at = now() where id = r.id;
    return;
  end if;
  update public.referrals
     set status = 'rewarding', card_fingerprint = p_fingerprint, qualified_at = now(),
         reward_kind = v_kind, reward_value = v_val, reward_currency = case when v_kind = 'credit' then v_cur end
   where id = r.id;
  return query select r.id, r.referrer_id, v_kind, v_val, case when v_kind = 'credit' then v_cur end;
end $$;
revoke execute on function public.referral_claim_reward(uuid, text, text[], boolean, text) from public, anon, authenticated;
grant execute on function public.referral_claim_reward(uuid, text, text[], boolean, text) to service_role;

-- The reward has been given in Stripe. For a credit this writes the ledger
-- row (applied when the Stripe balance transaction id is given, otherwise
-- pending until the referrer has a Stripe customer).
create or replace function public.referral_reward_given(p_referral uuid, p_balance_txn text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare r public.referrals%rowtype;
begin
  if not app.is_service_role() then
    raise exception 'only the service role records rewards' using errcode = 'insufficient_privilege';
  end if;
  select * into r from public.referrals where id = p_referral for update;
  if not found then return 'missing'; end if;
  if r.status = 'rewarded' then return 'unchanged'; end if;
  if r.status <> 'rewarding' then return 'not_rewarding'; end if;
  if r.reward_kind = 'credit' then
    insert into public.account_credits (user_id, amount_minor, currency, referral_id, status, stripe_balance_txn_id, applied_at)
    values (r.referrer_id, r.reward_value, r.reward_currency, r.id,
            case when p_balance_txn is null then 'pending' else 'applied' end, p_balance_txn,
            case when p_balance_txn is null then null else now() end)
    on conflict (referral_id) do nothing;
  end if;
  update public.referrals set status = 'rewarded', rewarded_at = now() where id = r.id;
  return 'rewarded';
end $$;
revoke execute on function public.referral_reward_given(uuid, text) from public, anon, authenticated;
grant execute on function public.referral_reward_given(uuid, text) to service_role;

-- Credit still waiting for a Stripe customer, and the call that closes it.
create or replace function public.credits_pending(p_user uuid) returns table (id uuid, amount_minor int, currency text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_service_role() then
    raise exception 'only the service role reads credits' using errcode = 'insufficient_privilege';
  end if;
  return query select c.id, c.amount_minor, c.currency::text from public.account_credits c
    where c.user_id = p_user and c.status = 'pending' order by c.created_at;
end $$;
revoke execute on function public.credits_pending(uuid) from public, anon, authenticated;
grant execute on function public.credits_pending(uuid) to service_role;

create or replace function public.credit_applied(p_credit uuid, p_balance_txn text) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not app.is_service_role() then
    raise exception 'only the service role applies credits' using errcode = 'insufficient_privilege';
  end if;
  update public.account_credits set status = 'applied', stripe_balance_txn_id = p_balance_txn, applied_at = now()
   where id = p_credit and status = 'pending';
end $$;
revoke execute on function public.credit_applied(uuid, text) from public, anon, authenticated;
grant execute on function public.credit_applied(uuid, text) to service_role;
