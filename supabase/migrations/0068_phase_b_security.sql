-- 0068 Phase B security fixes, from the independent review of the live code.
--
-- Depends on 0001 to 0066. Nothing earlier is edited. Where an earlier
-- function has to change it is replaced here, its body copied, and each
-- change is marked "0068". Nothing here touches a price.
--
-- 1. Student price (0054). student_request and student_verify took hashes the
--    caller chose, so a reader could verify themselves. Both are now closed to
--    readers. app.student_request_for and app.student_verify_for are service
--    role only: the server passes the signed-in reader, the raw address and
--    the raw token, and the hashes and the domain are worked out here. Tokens
--    still expire after student_verify_hours.
-- 2. Church bands (0060). Each band had 10,000 seats and the standing link
--    10,000 uses for ten years. A band's seats are now its upper bound: 50,
--    150 and 400, and org_church_band_4_seats (default 1000) for 400 or more.
--    Staff raise a licence's seats in the admin console (org_licence_update,
--    0024, owners and editors), and the billing mirror keeps that number. The
--    standing link ends with the licence and its uses are capped at the
--    seats. A trigger keeps both in step when the licence changes. Licences
--    and links made before this are brought down to the cap, never below the
--    places already taken.
-- 3. Send this workbook (0053). gift_send told a member when an address had
--    paid or held the workbook. It is now closed to readers. The server calls
--    app.gift_send_for, which answers the same way whoever the address
--    belongs to. Eligibility is decided at the claim: an intended recipient
--    who cannot take the gift sees a neutral message and the slot goes back
--    to the giver (status 'returned'). Sends are limited per giver per day
--    (app_config 'gift' sends_per_day, 3). Several givers may now send to one
--    address; the first claim decides.
-- 4. Referral rewards (0051). The claim records the friend's first invoice
--    and payment, declines when that payment is disputed, and stores the
--    target trial end for a trial reward so a retry sets the same date.
--    public.referral_reverse and public.referral_reversed take a reward back
--    when that first payment is fully refunded or disputed, once.
-- 5. Bundles (0055). A title the bundle reopened is now tied to the bundle,
--    so a refund of the bundle closes it.
-- 6. rail_signals (0056) is service role only. The rails read it on the server.
-- 7. Title requests (0056). The address hash is the server's: the reader-facing
--    function is closed and app.submit_title_request_as is service role only.
-- 8. Certificates (0065). Finished is worked out here from the steps done in
--    every unit of the pinned version, and the reader must hold the workbook
--    beyond its free units.
-- 9. Gift memberships (0054). A refund takes back only the refunded gift's
--    remaining time from the shared gift entitlement.
--
-- Not changed here, for a decision first:
--   * Bundle royalties. A Theme bundle still writes nothing to the royalty
--     ledger (0055). How a bundle payment is split between its authors is a
--     product decision for Crent; nothing is built until it is made.
--   * app.studio_save_draft_version (0057) still takes the validator counts
--     and the content hash from the caller. A version saved that way goes to
--     review, not live. Moving it to the service role needs the author kept
--     as the audit actor, so it is left for a follow-up.
--   * A dispute on a single purchase records the ledger lines but does not
--     close the title (0021). Gifts and bundles now close on a dispute.

-- ---------------------------------------------------------------------------
-- 1. Student price
-- ---------------------------------------------------------------------------
create or replace function app.sha256_hex(p text) returns text
language sql immutable set search_path = '' as $$
  select encode(pg_catalog.sha256(pg_catalog.convert_to(p, 'UTF8')), 'hex')
$$;

create or replace function app.student_request_for(p_user uuid, p_email text, p_token text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_domain text;
begin
  if not app.is_service_role() then
    raise exception 'only the service role asks for a student link' using errcode = 'insufficient_privilege';
  end if;
  if p_user is null or not exists (select 1 from auth.users u where u.id = p_user) then
    raise exception 'unknown reader' using errcode = 'AKX24';
  end if;
  if char_length(v_email) > 254 or v_email !~ '^[^[:space:]@<>"]+@[a-z0-9.-]+[.][a-z0-9-]+$' then
    raise exception 'not an email address' using errcode = 'AKX24';
  end if;
  if p_token is null or char_length(p_token) < 32 or char_length(p_token) > 128 then
    raise exception 'token too short' using errcode = 'AKX24';
  end if;
  v_domain := split_part(v_email, '@', 2);
  insert into public.student_verifications (user_id, email_hash, email_domain, token_hash, token_expires_at)
  values (p_user, app.sha256_hex(v_email), v_domain, app.sha256_hex(p_token),
          now() + make_interval(hours => app.conv_config_int('student_verify_hours', 24)))
  on conflict (user_id) do update
    set token_hash = excluded.token_hash, token_expires_at = excluded.token_expires_at,
        email_hash = case when public.student_verifications.verified_at is null then excluded.email_hash else public.student_verifications.email_hash end,
        email_domain = case when public.student_verifications.verified_at is null then excluded.email_domain else public.student_verifications.email_domain end;
  return true;
end $$;

-- Body from 0054 app.student_verify; the reader is passed in and the token is hashed here (0068).
create or replace function app.student_verify_for(p_user uuid, p_token text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  s public.student_verifications%rowtype;
begin
  if not app.is_service_role() then
    raise exception 'only the service role confirms a student link' using errcode = 'insufficient_privilege';
  end if;
  if p_user is null or p_token is null or char_length(p_token) < 32 then return 'invalid'; end if;
  select * into s from public.student_verifications where user_id = p_user for update;
  if not found or s.token_hash is null or s.token_hash <> app.sha256_hex(p_token) then return 'invalid'; end if;
  if s.token_expires_at is null or s.token_expires_at <= now() then return 'expired'; end if;
  if exists (select 1 from public.student_verifications o
              where o.user_id <> p_user and o.email_hash = s.email_hash and o.verified_at is not null and o.expires_at > now()) then
    return 'email_in_use';
  end if;
  update public.student_verifications
     set verified_at = now(), expires_at = now() + make_interval(days => app.conv_config_int('student_valid_days', 365)),
         token_hash = null, token_expires_at = null, recheck_sent_at = null, discount_removed_at = null
   where id = s.id;
  perform app.audit('account.student_verified', 'user:' || p_user::text, null, null, null, null,
    jsonb_build_object('domain', s.email_domain));
  return 'verified';
end $$;

create or replace function public.student_request_for(p_user uuid, p_email text, p_token text) returns boolean
language sql volatile security invoker set search_path = '' as $$ select app.student_request_for(p_user, p_email, p_token) $$;
create or replace function public.student_verify_for(p_user uuid, p_token text) returns text
language sql volatile security invoker set search_path = '' as $$ select app.student_verify_for(p_user, p_token) $$;

revoke execute on function app.student_request(text, text, text), public.student_request(text, text, text),
  app.student_verify(text), public.student_verify(text) from public, anon, authenticated;
revoke execute on function app.student_request_for(uuid, text, text), public.student_request_for(uuid, text, text),
  app.student_verify_for(uuid, text), public.student_verify_for(uuid, text), app.sha256_hex(text) from public, anon, authenticated;
grant execute on function app.student_request_for(uuid, text, text), public.student_request_for(uuid, text, text),
  app.student_verify_for(uuid, text), public.student_verify_for(uuid, text), app.sha256_hex(text) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Church band seats and the standing link
-- ---------------------------------------------------------------------------
insert into public.app_config (key, value) values
  ('org_church_band_1_seats', '50'),
  ('org_church_band_2_seats', '150'),
  ('org_church_band_3_seats', '400'),
  ('org_church_band_4_seats', '1000')
on conflict (key) do update set value = excluded.value, updated_at = now()
  where public.app_config.value::text = '10000';

-- Body from 0060; the fourth band's default is 1000 (0068).
create or replace function app.org_band_seats(p_plan text) returns int
language sql stable security definer set search_path = '' as $$
  select case when app.org_band_number(p_plan) is null then null
              else greatest(1, least(10000, app.org_config_int('org_' || p_plan || '_seats',
                     case p_plan when 'church_band_1' then 50 when 'church_band_2' then 150 when 'church_band_3' then 400 else 1000 end))) end  -- 0068
$$;

update public.org_plan_prices set note = 'Up to 50 members. Staff can raise the seats if the church grows.' where plan_id = 'church_band_1' and note = 'Unlimited members within the band.';
update public.org_plan_prices set note = 'Up to 150 members. Staff can raise the seats if the church grows.' where plan_id = 'church_band_2' and note = 'Unlimited members within the band.';
update public.org_plan_prices set note = 'Up to 400 members. Staff can raise the seats if the church grows.' where plan_id = 'church_band_3' and note = 'Unlimited members within the band.';
update public.org_plan_prices set note = 'Up to 1,000 members to begin with. Staff can raise the seats.' where plan_id = 'church_band_4' and note = 'Unlimited members within the band.';

-- Licences already on a band come down to the cap, never below the places taken.
update public.org_licences l
   set seats_purchased = greatest(app.org_band_seats(s.plan), app.org_licence_places_used(l.id), 1)
  from public.org_subscriptions s
 where s.licence_id = l.id and app.org_plan_is_band(s.plan) and l.status <> 'ended'
   and l.seats_purchased > greatest(app.org_band_seats(s.plan), app.org_licence_places_used(l.id), 1);

-- The standing link follows its licence: it ends when the licence ends and is
-- used at most as many times as the licence has seats.
create or replace function app.org_standing_link_follow() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'ended' then
    update public.org_join_links k set revoked_at = now()
     where k.licence_id = new.id and k.standing and k.revoked_at is null;
    return new;
  end if;
  update public.org_join_links k
     set expires_at = greatest(new.ends_at, k.created_at + interval '1 second'),
         max_uses = greatest(k.uses, least(10000, greatest(1, new.seats_purchased)))
   where k.licence_id = new.id and k.standing and k.revoked_at is null
     and (k.expires_at is distinct from greatest(new.ends_at, k.created_at + interval '1 second')
          or k.max_uses is distinct from greatest(k.uses, least(10000, greatest(1, new.seats_purchased))));
  return new;
end $$;
drop trigger if exists org_licences_standing_link_follow on public.org_licences;
create trigger org_licences_standing_link_follow after update of ends_at, seats_purchased, status on public.org_licences
  for each row execute function app.org_standing_link_follow();

-- Links made before this.
update public.org_join_links k
   set expires_at = greatest(l.ends_at, k.created_at + interval '1 second'),
       max_uses = greatest(k.uses, least(10000, greatest(1, l.seats_purchased)))
  from public.org_licences l
 where l.id = k.licence_id and k.standing and k.revoked_at is null;

-- Body from 0060; the new link's uses and end come from the licence (0068).
create or replace function app.org_standing_link_rotate(p_licence uuid, p_token_hash text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  l    public.org_licences;
  v_id uuid;
  n    int;
  v_had boolean;
begin
  select * into l from public.org_licences x where x.id = p_licence for update;
  if not found or app.uid() is null or not app.org_can_manage_seats(l.org_id) then
    raise exception 'not allowed to make links for this licence' using errcode = 'AKO01';
  end if;
  perform app.require_role_mfa(l.org_id);
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'org_invalid: token' using errcode = 'AKO02';
  end if;
  if l.status <> 'active' or l.ends_at <= now()
     or exists (select 1 from public.organisations o where o.id = l.org_id and o.status in ('suspended','closed')) then
    raise exception 'this licence is not open' using errcode = 'AKO08';
  end if;
  select count(*) into n from public.audit_log a
   where a.action = 'org.standing_link_rotated' and a.org_id = l.org_id and a.at > now() - interval '1 day';
  if n >= app.org_config_int('org_join_links_per_day', 10) then
    raise exception 'too many links today' using errcode = 'AKO29';
  end if;
  update public.org_join_links k set revoked_at = now() where k.licence_id = l.id and k.standing and k.revoked_at is null;
  v_had := found;
  insert into public.org_join_links (org_id, licence_id, token_hash, email_domain, max_uses, uses, expires_at, created_by, standing)
  values (l.org_id, l.id, p_token_hash, null, least(10000, greatest(1, l.seats_purchased)), 0, l.ends_at, app.uid(), true)  -- 0068
  returning id into v_id;
  perform app.audit('org.standing_link_rotated', 'org_join_link:' || v_id::text, null, null, l.org_id, null,
    jsonb_build_object('licence', l.id, 'replaced', v_had));
  return v_id;
end $$;

revoke execute on function app.org_standing_link_follow() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Send this workbook
-- ---------------------------------------------------------------------------
update public.app_config set value = value || jsonb_build_object('sends_per_day', 3)
 where key = 'gift' and not (value ? 'sends_per_day');

alter table public.workbook_gifts drop constraint if exists workbook_gifts_status_check;
alter table public.workbook_gifts add constraint workbook_gifts_status_check
  check (status in ('sent','claimed','cancelled','expired','returned'));
-- Several givers may send to one address; the first claim decides.
drop index if exists public.workbook_gifts_one_waiting;
create index if not exists workbook_gifts_recipient_idx on public.workbook_gifts(recipient_norm) where status = 'sent';

-- Whether a reader already holds a workbook outside its free units.
create or replace function app.holds_workbook(p_user uuid, p_workbook uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.entitlements e
                  where e.user_id = p_user and e.workbook_id = p_workbook and e.status = 'active' and e.source <> 'free_unit'
                    and (e.ends_at is null or e.ends_at > now()))
$$;

-- The send, made by the server for the signed-in member. Returns sent,
-- not_member, used_this_quarter, not_giftable, self or busy. Nothing in the
-- answer depends on who owns the address.
create or replace function app.gift_send_for(p_user uuid, p_workbook uuid, p_email text, p_token_hash text)
returns table (status text, gift_id uuid)
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_norm  text := app.norm_email(lower(btrim(coalesce(p_email, ''))));
  cfg     jsonb := coalesce((select value from public.app_config where key = 'gift'), '{}'::jsonb);
  v_days  int := coalesce((cfg ->> 'claim_days')::int, 30);
  v_per_day int := coalesce((cfg ->> 'sends_per_day')::int, 3);
  v_id    uuid;
  w       public.workbooks%rowtype;
begin
  if not app.is_service_role() then
    raise exception 'only the service role sends gifts' using errcode = 'insufficient_privilege';
  end if;
  if p_user is null or not exists (select 1 from auth.users u where u.id = p_user) then
    raise exception 'unknown member' using errcode = 'check_violation';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+$' or char_length(v_email) > 254 or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid gift' using errcode = 'check_violation';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('gift_send:' || p_user::text, 0));
  if (select count(*) from public.workbook_gifts g where g.giver_id = p_user and g.created_at > now() - interval '1 day') >= v_per_day then
    return query select 'busy'::text, null::uuid; return;
  end if;
  update public.workbook_gifts x set status = 'expired', recipient_email = null
   where x.giver_id = p_user and x.status = 'sent' and x.expires_at < now();
  if not app.is_paying_member(p_user) then return query select 'not_member'::text, null::uuid; return; end if;
  if exists (select 1 from public.workbook_gifts g where g.giver_id = p_user and g.quarter = app.gift_quarter() and g.status in ('sent','claimed','expired')) then
    return query select 'used_this_quarter'::text, null::uuid; return;
  end if;
  select * into w from public.workbooks x where x.id = p_workbook;
  if not found or w.is_demo or not app.workbook_is_public(w.id) then
    return query select 'not_giftable'::text, null::uuid; return;
  end if;
  -- The member's own address tells them nothing about anyone else.
  if v_norm = (select app.norm_email(u.email) from auth.users u where u.id = p_user) then
    return query select 'self'::text, null::uuid; return;
  end if;
  insert into public.workbook_gifts (giver_id, workbook_id, recipient_email, recipient_norm, token_hash, quarter, expires_at)
  values (p_user, p_workbook, v_email, v_norm, p_token_hash, app.gift_quarter(), now() + make_interval(days => v_days))
  returning id into v_id;
  return query select 'sent'::text, v_id;
end $$;
create or replace function public.gift_send_for(p_user uuid, p_workbook uuid, p_email text, p_token_hash text)
returns table (status text, gift_id uuid)
language sql volatile security invoker set search_path = '' as $$ select * from app.gift_send_for(p_user, p_workbook, p_email, p_token_hash) $$;

revoke execute on function public.gift_send(uuid, text, text) from public, anon, authenticated;
revoke execute on function app.gift_send_for(uuid, uuid, text, text), public.gift_send_for(uuid, uuid, text, text),
  app.holds_workbook(uuid, uuid) from public, anon, authenticated;
grant execute on function app.gift_send_for(uuid, uuid, text, text), public.gift_send_for(uuid, uuid, text, text),
  app.holds_workbook(uuid, uuid) to service_role;

-- Body from 0053; can_claim also asks whether the viewer already holds it (0068).
create or replace function public.workbook_gift_preview(p_token_hash text)
returns table (status text, workbook_slug text, workbook_title text, expired boolean, can_claim boolean)
language sql stable security definer set search_path = '' as $$
  select g.status, w.slug, w.title, (g.expires_at < now()),
         (g.status = 'sent' and g.expires_at >= now() and g.giver_id <> app.uid() and not app.has_ever_paid(app.uid())
          and not app.holds_workbook(app.uid(), g.workbook_id))
    from public.workbook_gifts g join public.workbooks w on w.id = g.workbook_id
   where g.token_hash = p_token_hash and app.uid() is not null
$$;

-- Body from 0053; eligibility is decided here, and an intended recipient who
-- cannot take the gift gives the slot back to the giver (0068).
create or replace function public.gift_claim(p_user uuid, p_token_hash text, p_livemode boolean) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  g       public.workbook_gifts%rowtype;
  w       public.workbooks%rowtype;
  cfg     jsonb := coalesce((select value from public.app_config where key = 'gift'), '{}'::jsonb);
  v_rate  numeric := coalesce((cfg ->> 'author_share')::numeric, 0.5);
  v_price bigint;
  v_pay   bigint := 0;
  v_ent   uuid;
begin
  if not app.is_service_role() then
    raise exception 'only the service role claims gifts' using errcode = 'insufficient_privilege';
  end if;
  select * into g from public.workbook_gifts where token_hash = p_token_hash for update;
  if not found then return 'unknown'; end if;
  if g.status = 'claimed' then return case when g.claimed_by = p_user then 'unchanged' else 'not_available' end; end if;
  if g.status <> 'sent' then return 'not_available'; end if;
  if g.expires_at < now() then return 'expired'; end if;
  if g.giver_id = p_user or app.has_ever_paid(p_user) or app.holds_workbook(p_user, g.workbook_id) then  -- 0068
    if g.giver_id <> p_user and g.recipient_norm = (select app.norm_email(u.email) from auth.users u where u.id = p_user) then
      update public.workbook_gifts set status = 'returned', recipient_email = null where id = g.id;
    end if;
    return 'not_eligible';
  end if;

  select * into w from public.workbooks where id = g.workbook_id;
  select e.id into v_ent from public.entitlements e
   where e.user_id = p_user and e.tenant_id = w.tenant_id and e.workbook_id = w.id and e.source = 'gift';
  if v_ent is null then
    insert into public.entitlements (user_id, tenant_id, workbook_id, source, status, starts_at, ends_at)
    values (p_user, w.tenant_id, w.id, 'gift', 'active', now(), null);
  else
    update public.entitlements set status = 'active', ends_at = null where id = v_ent;
  end if;

  update public.workbook_gifts set status = 'claimed', claimed_by = p_user, claimed_at = now(), recipient_email = null where id = g.id;

  if not w.is_demo and app.org_earns(w.org_id) and w.price_point_id is not null then
    select nullif(pp.amounts ->> 'GBP', '')::bigint into v_price from public.price_points pp where pp.id = w.price_point_id;
    v_pay := floor(coalesce(v_price, 0) * v_rate);
    if v_pay > 0 then
      insert into public.marketing_pool_ledger (entry_kind, gift_id, org_id, workbook_id, currency, amount_minor, livemode, note)
      values ('gift_author_payment', g.id, w.org_id, w.id, 'GBP', -v_pay, coalesce(p_livemode, false), 'Author share of a gifted workbook');
      insert into public.royalty_lines (org_id, workbook_id, tenant_id, kind, period, currency, livemode, units, gross_minor, net_base_minor,
        rate, author_minor, akana_minor, is_placeholder_rate, idem_key, note, occurred_at, channel)
      values (w.org_id, w.id, w.tenant_id, 'gift_share', app.money_month(now()), 'GBP', coalesce(p_livemode, false), 1, v_price, v_price,
        v_rate, v_pay, -v_pay, (app.royalty_config()).is_placeholder, 'gift:' || g.id::text,
        'Gifted workbook, paid from the marketing pool', now(), 'marketplace')
      on conflict (idem_key) do nothing;
    end if;
  end if;
  return 'claimed';
end $$;

-- ---------------------------------------------------------------------------
-- 4. Referral rewards: retry-safe trial days, disputes and reversals
-- ---------------------------------------------------------------------------
alter table public.referrals add column if not exists first_invoice_id text;
alter table public.referrals add column if not exists first_payment_intent text;
alter table public.referrals add column if not exists trial_end_target timestamptz;
alter table public.referrals add column if not exists reversed_at timestamptz;
alter table public.referrals add column if not exists reversal_reason text check (reversal_reason is null or reversal_reason in ('refunded','disputed'));
alter table public.referrals add column if not exists reversal_txn text;
create index if not exists referrals_first_pi_idx on public.referrals(first_payment_intent) where first_payment_intent is not null;

alter table public.referrals drop constraint if exists referrals_status_check;
alter table public.referrals add constraint referrals_status_check
  check (status in ('pending','qualified','rewarding','rewarded','blocked','reversing','reversed'));
alter table public.referrals drop constraint if exists referrals_block_reason_check;
alter table public.referrals add constraint referrals_block_reason_check
  check (block_reason is null or block_reason in ('same_card','duplicate_card','cap_reached','disputed'));
alter table public.account_credits drop constraint if exists account_credits_status_check;
alter table public.account_credits add constraint account_credits_status_check check (status in ('pending','applied','reversed'));

-- Body from 0051, with the first payment recorded, a disputed payment
-- declined and the trial target stored (0068). The new arguments default, so
-- a caller that does not send them gets the 0051 behaviour.
drop function if exists public.referral_claim_reward(uuid, text, text[], boolean, text);
create function public.referral_claim_reward(
  p_referred uuid, p_fingerprint text, p_referrer_fingerprints text[], p_referrer_trialing boolean, p_currency text,
  p_invoice text default null, p_payment_intent text default null, p_disputed boolean default false,
  p_referrer_trial_end timestamptz default null
) returns table (referral_id uuid, referrer_id uuid, reward_kind text, reward_value int, reward_currency text, trial_end_target timestamptz)
language plpgsql volatile security definer set search_path = '' as $$
declare
  r      public.referrals%rowtype;
  cfg    jsonb := app.referral_config();
  v_cap  int := coalesce((cfg ->> 'annual_cap')::int, 12);
  v_cur  text := upper(coalesce(p_currency, 'GBP'));
  v_kind text;
  v_val  int;
  v_target timestamptz;
begin
  if not app.is_service_role() then
    raise exception 'only the service role claims rewards' using errcode = 'insufficient_privilege';
  end if;
  select * into r from public.referrals where referred_id = p_referred for update;
  if not found then return; end if;
  if r.status = 'rewarding' then
    return query select r.id, r.referrer_id, r.reward_kind, r.reward_value, r.reward_currency::text, r.trial_end_target;
    return;
  end if;
  if r.status <> 'pending' then return; end if;
  update public.referrals set first_invoice_id = p_invoice, first_payment_intent = p_payment_intent where id = r.id;  -- 0068
  if coalesce(p_disputed, false) then  -- 0068
    update public.referrals set status = 'blocked', block_reason = 'disputed', card_fingerprint = p_fingerprint, qualified_at = now() where id = r.id;
    return;
  end if;
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
    v_target := p_referrer_trial_end + make_interval(days => v_val);  -- 0068: null when the caller sent no trial end
  else
    v_kind := 'credit';
    v_val := coalesce((cfg -> 'referrer_credit_minor' ->> v_cur)::int, 0);
  end if;
  if v_val <= 0 then
    update public.referrals set status = 'qualified', card_fingerprint = p_fingerprint, qualified_at = now() where id = r.id;
    return;
  end if;
  update public.referrals
     set status = 'rewarding', card_fingerprint = p_fingerprint, qualified_at = now(),
         reward_kind = v_kind, reward_value = v_val, reward_currency = case when v_kind = 'credit' then v_cur end,
         trial_end_target = v_target
   where id = r.id;
  return query select r.id, r.referrer_id, v_kind, v_val, case when v_kind = 'credit' then v_cur end, v_target;
end $$;
revoke execute on function public.referral_claim_reward(uuid, text, text[], boolean, text, text, text, boolean, timestamptz) from public, anon, authenticated;
grant execute on function public.referral_claim_reward(uuid, text, text[], boolean, text, text, text, boolean, timestamptz) to service_role;

-- The friend's first payment was fully refunded or disputed. Returns what is
-- left to undo in Stripe, or no row when nothing is (no referral on that
-- payment, nothing was given, or it is already reversed). action is
--   none          nothing in Stripe: the referral is closed here
--   debit         take back credit that reached the Stripe balance
--   shorten_trial take the extra days off the referrer's trial, if still running
-- Calling it again while a reversal is under way returns the same row.
create or replace function public.referral_reverse(p_payment_intent text, p_reason text)
returns table (referral_id uuid, referrer_id uuid, action text, reward_kind text, reward_value int, reward_currency text,
               balance_txn text, trial_end_target timestamptz)
language plpgsql volatile security definer set search_path = '' as $$
declare
  r public.referrals%rowtype;
  c public.account_credits%rowtype;
begin
  if not app.is_service_role() then
    raise exception 'only the service role reverses rewards' using errcode = 'insufficient_privilege';
  end if;
  if p_reason is null or p_reason not in ('refunded','disputed') then
    raise exception 'unknown reason' using errcode = 'check_violation';
  end if;
  if p_payment_intent is null then return; end if;
  select * into r from public.referrals x where x.first_payment_intent = p_payment_intent for update;
  if not found then return; end if;
  if r.status in ('reversed','blocked') then return; end if;
  if r.status in ('pending','qualified','rewarding') then
    -- Nothing reached the referrer, or a half-given reward: close it so a retry gives nothing.
    update public.referrals set status = 'reversed', reversed_at = now(), reversal_reason = p_reason where id = r.id;
    perform app.audit('referral.reversed', 'referral:' || r.id::text, p_reason, null, null, null, jsonb_build_object('given', false));
    return;
  end if;
  if r.status = 'rewarded' then
    if r.reward_kind = 'credit' then
      select * into c from public.account_credits x where x.referral_id = r.id for update;
      if not found or c.status = 'pending' then
        update public.account_credits ac set status = 'reversed' where ac.referral_id = r.id;
        update public.referrals set status = 'reversed', reversed_at = now(), reversal_reason = p_reason where id = r.id;
        perform app.audit('referral.reversed', 'referral:' || r.id::text, p_reason, null, null, null, jsonb_build_object('given', false));
        return;
      end if;
    end if;
    update public.referrals set status = 'reversing', reversal_reason = p_reason where id = r.id;
    r.status := 'reversing';
  end if;
  -- reversing
  select * into c from public.account_credits x where x.referral_id = r.id;
  return query select r.id, r.referrer_id,
    case when r.reward_kind = 'credit' then 'debit' else 'shorten_trial' end,
    r.reward_kind, r.reward_value, r.reward_currency::text, c.stripe_balance_txn_id, r.trial_end_target;
end $$;

create or replace function public.referral_reversed(p_referral uuid, p_txn text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare r public.referrals%rowtype;
begin
  if not app.is_service_role() then
    raise exception 'only the service role reverses rewards' using errcode = 'insufficient_privilege';
  end if;
  select * into r from public.referrals where id = p_referral for update;
  if not found then return 'missing'; end if;
  if r.status = 'reversed' then return 'unchanged'; end if;
  if r.status <> 'reversing' then return 'not_reversing'; end if;
  update public.account_credits set status = 'reversed' where referral_id = r.id;
  update public.referrals set status = 'reversed', reversed_at = now(), reversal_txn = p_txn where id = r.id;
  perform app.audit('referral.reversed', 'referral:' || r.id::text, r.reversal_reason, null, null, null,
    jsonb_build_object('given', true, 'kind', r.reward_kind));
  return 'reversed';
end $$;
revoke execute on function public.referral_reverse(text, text), public.referral_reversed(uuid, text) from public, anon, authenticated;
grant execute on function public.referral_reverse(text, text), public.referral_reversed(uuid, text) to service_role;

-- Body from 0051; credit taken back is not shown as credit (0068).
create or replace function public.my_referral_summary()
returns table (invited int, rewarded_this_year int, cap int, credit_minor bigint, credit_currency text)
language sql stable security definer set search_path = '' as $$
  select
    (select count(*)::int from public.referrals r where r.referrer_id = app.uid()),
    (select count(*)::int from public.referrals r where r.referrer_id = app.uid()
        and r.status in ('rewarding','rewarded') and r.qualified_at > now() - interval '1 year'),
    coalesce((app.referral_config() ->> 'annual_cap')::int, 12),
    coalesce((select sum(c.amount_minor) from public.account_credits c where c.user_id = app.uid() and c.status <> 'reversed'), 0)::bigint,
    (select c.currency::text from public.account_credits c where c.user_id = app.uid() and c.status <> 'reversed' order by c.created_at desc limit 1)
  where app.uid() is not null
$$;

-- Credit still waiting for a customer is never applied once reversed: 0051's
-- credits_pending already reads status 'pending' only.

-- ---------------------------------------------------------------------------
-- 5. Bundles: a reopened title belongs to the bundle
-- ---------------------------------------------------------------------------
-- Body from 0055; the on-conflict branch ties the title to the bundle (0068).
create or replace function app.bundle_mark_paid(p_session text, p_payment_intent text, p_amount_minor int, p_tax_minor int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  b public.bundle_purchases%rowtype;
  w uuid;
  n int := 0;
begin
  if not app.is_service_role() then
    raise exception 'only the service role records bundle payments' using errcode = 'insufficient_privilege';
  end if;
  select * into b from public.bundle_purchases where stripe_checkout_session_id = p_session for update;
  if not found then return jsonb_build_object('found', false); end if;
  if b.status <> 'pending' then return jsonb_build_object('found', true, 'changed', false, 'id', b.id, 'user_id', b.user_id); end if;
  if b.user_id is null then return jsonb_build_object('found', true, 'changed', false, 'id', b.id, 'user_id', null); end if;
  foreach w in array b.workbook_ids loop
    insert into public.entitlements (user_id, tenant_id, workbook_id, source, status, starts_at, ends_at, bundle_purchase_id)
    values (b.user_id, b.tenant_id, w, 'purchase', 'active', now(), null, b.id)
    on conflict (user_id, tenant_id, workbook_id, source, org_licence_id) do update
      set status = 'active', starts_at = least(public.entitlements.starts_at, now()), ends_at = null,
          bundle_purchase_id = excluded.bundle_purchase_id  -- 0068
      where public.entitlements.status <> 'active';
    n := n + 1;
  end loop;
  update public.bundle_purchases
     set status = 'paid', paid_at = now(), stripe_payment_intent_id = p_payment_intent,
         amount_minor = coalesce(p_amount_minor, amount_minor), tax_minor = coalesce(p_tax_minor, 0)
   where id = b.id;
  perform app.audit('commerce.bundle_paid', 'bundle:' || b.id::text, null, b.tenant_id, null, null,
    jsonb_build_object('theme', b.theme_id, 'titles', n));
  return jsonb_build_object('found', true, 'changed', true, 'id', b.id, 'user_id', b.user_id, 'titles', n);
end $$;

-- ---------------------------------------------------------------------------
-- 6. rail_signals: service role only
-- ---------------------------------------------------------------------------
revoke execute on function public.rail_signals(uuid) from public, anon, authenticated;
grant execute on function public.rail_signals(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 7. Title requests: the server passes the reader and the address hash
-- ---------------------------------------------------------------------------
-- Body from 0056 app.submit_title_request; service role only, the reader passed in (0068).
create or replace function app.submit_title_request_as(p_user uuid, p_title text, p_author text, p_note text, p_ip_hash text)
returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_title  text := app.clean_text(p_title, 200);
  v_author text := app.clean_text(p_author, 200);
  v_note   text := app.clean_multiline(p_note, 1000);
  v_key    text;
  v_uid    uuid := p_user;
  v_recent int;
  v_id     uuid;
begin
  if not app.is_service_role() then
    raise exception 'only the service role records title requests' using errcode = 'insufficient_privilege';
  end if;
  if v_uid is not null and not exists (select 1 from auth.users u where u.id = v_uid) then
    v_uid := null;
  end if;
  if v_title is null then
    raise exception 'request_invalid: title' using errcode = 'AKZ01';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) > 200 then
    raise exception 'request_invalid: title too long' using errcode = 'AKZ01';
  end if;
  if char_length(btrim(coalesce(p_author, ''))) > 200 or char_length(btrim(coalesce(p_note, ''))) > 1000 then
    raise exception 'request_invalid: author or note too long' using errcode = 'AKZ02';
  end if;
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'request_invalid: ip_hash' using errcode = 'AKZ03';
  end if;
  v_key := app.title_key(v_title);
  if v_key = '' then
    raise exception 'request_invalid: title' using errcode = 'AKZ01';
  end if;

  if not app.rate_hit('title_request_ip', p_ip_hash) then
    raise exception 'rate_limited: too many requests from this address' using errcode = 'AKZ29';
  end if;
  if v_uid is not null and not app.rate_hit('title_request_user',
       encode(pg_catalog.sha256(pg_catalog.convert_to('title_request_user:' || v_uid::text, 'UTF8')), 'hex')) then
    raise exception 'rate_limited: too many requests from this reader' using errcode = 'AKZ29';
  end if;
  select count(*) into v_recent from public.title_requests where created_at > now() - interval '1 hour';
  if v_recent >= 300 then
    raise exception 'rate_limited: too many requests' using errcode = 'AKZ29';
  end if;

  insert into public.title_requests (title, title_key, author_name, note, user_id, ip_hash)
  values (v_title, v_key, v_author, v_note, v_uid, p_ip_hash)
  returning id into v_id;
  return v_id;
end $$;
create or replace function public.submit_title_request_as(p_user uuid, p_title text, p_author text, p_note text, p_ip_hash text)
returns uuid
language sql volatile security invoker set search_path = '' as $$
  select app.submit_title_request_as(p_user, p_title, p_author, p_note, p_ip_hash)
$$;
revoke execute on function app.submit_title_request(text, text, text, text), public.submit_title_request(text, text, text, text)
  from public, anon, authenticated;
revoke execute on function app.submit_title_request_as(uuid, text, text, text, text), public.submit_title_request_as(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function app.submit_title_request_as(uuid, text, text, text, text), public.submit_title_request_as(uuid, text, text, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 8. Certificates: finished is worked out here
-- ---------------------------------------------------------------------------
-- Every step of every unit in the pinned version has a step_done event.
create or replace function app.enrolment_all_steps_done(p_enrolment uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  with ex as (
    select distinct x.id
      from public.enrolments e
      join public.workbook_versions v on v.id = e.version_id
      cross join lateral jsonb_array_elements(case when jsonb_typeof(v.content -> 'units') = 'array' then v.content -> 'units' else '[]'::jsonb end) u
      cross join lateral jsonb_array_elements_text(case when jsonb_typeof(u -> 'exercise_ids') = 'array' then u -> 'exercise_ids' else '[]'::jsonb end) as x(id)
     where e.id = p_enrolment and jsonb_typeof(u) = 'object'
  )
  select exists (select 1 from ex)
     and not exists (select 1 from ex where not exists (
           select 1 from public.progress_events p where p.enrolment_id = p_enrolment and p.kind = 'step_done' and p.ref = ex.id))
$$;

-- The reader holds the workbook beyond its free units: an entitlement that
-- opens it (has_entitlement's rules) other than a free-unit one, or a version
-- whose every unit is free.
create or replace function app.enrolment_paid_access(p_enrolment uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.enrolments en
      join public.entitlements e on e.user_id = en.user_id and e.tenant_id = en.tenant_id
     where en.id = p_enrolment
       and e.source <> 'free_unit'
       and (e.workbook_id = en.workbook_id
            or (e.workbook_id is null
                and (e.source not in ('membership', 'gift') or app.workbook_in_membership(en.workbook_id))))
       and (e.source <> 'team_seat' or app.team_seat_covers(e.org_licence_id, en.workbook_id))
       and e.status = 'active' and e.starts_at <= now() and (e.ends_at is null or e.ends_at > now()))
  or exists (
    select 1 from public.enrolments en
     where en.id = p_enrolment
       and exists (select 1 from public.workbook_sections s where s.version_id = en.version_id and s.kind = 'unit')
       and not exists (select 1 from public.workbook_sections s where s.version_id = en.version_id and s.kind = 'unit' and not s.free))
$$;

-- Body from 0065; the finish test is the database's own (0068).
create or replace function public.make_certificate(p_enrolment uuid, p_name text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid  uuid := app.uid();
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_id   uuid;
begin
  if v_uid is null or not app.enrolment_owner(p_enrolment) then
    raise exception 'not your programme' using errcode = 'insufficient_privilege';
  end if;
  if not app.enrolment_all_steps_done(p_enrolment) or not app.enrolment_paid_access(p_enrolment) then  -- 0068
    raise exception 'the programme is not finished yet' using errcode = 'object_not_in_prerequisite_state';
  end if;
  if v_name is not null and (char_length(v_name) > 60 or v_name ~ '[<>[:cntrl:]]') then
    raise exception 'the name must be plain text of up to 60 characters' using errcode = 'check_violation';
  end if;
  insert into public.certificates (user_id, enrolment_id, holder_name)
  values (v_uid, p_enrolment, v_name)
  on conflict (enrolment_id) do update set holder_name = excluded.holder_name
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function app.enrolment_all_steps_done(uuid), app.enrolment_paid_access(uuid) from public, anon, authenticated;
grant execute on function app.enrolment_all_steps_done(uuid), app.enrolment_paid_access(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 9. Gift memberships: a refund takes back only that gift's time
-- ---------------------------------------------------------------------------
-- Body from 0054; the shared entitlement loses only the refunded gift's
-- remaining time, and later gifts on it move up by the same amount (0068).
create or replace function app.gift_refund(p_payment_intent text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  g public.gift_memberships%rowtype;
  e public.entitlements%rowtype;
  v_was_claimed boolean;
  v_cut interval := interval '0';
  v_end timestamptz;
begin
  if not app.is_service_role() then
    raise exception 'only the service role records gift refunds' using errcode = 'insufficient_privilege';
  end if;
  select * into g from public.gift_memberships where stripe_payment_intent_id = p_payment_intent for update;
  if not found then return jsonb_build_object('found', false); end if;
  if g.status = 'refunded' then return jsonb_build_object('found', true, 'changed', false, 'id', g.id); end if;
  v_was_claimed := g.status = 'claimed';
  if g.entitlement_id is not null and v_was_claimed and g.ends_at is not null then
    select * into e from public.entitlements where id = g.entitlement_id for update;
    if found and e.status = 'active' then
      -- This gift's slice is the last g.months before its own end date.
      v_cut := greatest(interval '0', g.ends_at - greatest(now(), g.ends_at - make_interval(months => g.months)));
      if v_cut > interval '0' then
        v_end := coalesce(e.ends_at, now()) - v_cut;
        if v_end <= now() then
          update public.entitlements set status = 'revoked', ends_at = now() where id = e.id;
        else
          update public.entitlements set ends_at = v_end where id = e.id;
        end if;
        update public.gift_memberships o set ends_at = o.ends_at - v_cut
         where o.entitlement_id = e.id and o.id <> g.id and o.status = 'claimed' and o.ends_at > g.ends_at;
      end if;
    end if;
  end if;
  update public.gift_memberships set status = 'refunded', claim_token = null, recipient_email = null where id = g.id;
  perform app.audit('commerce.gift_refunded', 'gift:' || g.id::text, null, g.tenant_id, null,
    jsonb_build_object('status', g.status), jsonb_build_object('status', 'refunded', 'days_taken_back', extract(epoch from v_cut) / 86400));
  return jsonb_build_object('found', true, 'changed', true, 'id', g.id, 'was_claimed', v_was_claimed);
end $$;
