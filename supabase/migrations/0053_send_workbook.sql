-- 0053 "Send this workbook" (build list 14.14).
--
-- A paying member gives one full workbook a quarter (calendar quarters in
-- London, no rollover) to someone who has never paid Akana. The recipient
-- claims it from an email link, signed in, with no card. The author is paid
-- half the workbook's list price. That payment is a marketing pool ledger
-- entry (public.marketing_pool_ledger, a debit) matched by a royalty_lines
-- row of kind 'gift_share' for the author's organisation, so it appears on
-- their statement and is paid out like any other earning.
--
-- Values are in public.app_config under 'gift': author_share 0.5, claim
-- window 30 days. The token in the email link is never stored: only its
-- SHA-256 hash is. The recipient's address is kept only until the gift is
-- claimed or cancelled, then cleared.
--
-- Same rules as 0051. Depends on 0004, 0021, 0051 and 0052.

insert into public.app_config (key, value) values
  ('gift', jsonb_build_object('author_share', 0.5, 'claim_days', 30))
on conflict (key) do nothing;

alter table public.royalty_lines drop constraint if exists royalty_lines_kind_check;
alter table public.royalty_lines add constraint royalty_lines_kind_check
  check (kind in ('sale','refund','dispute','dispute_reversal','pool','fee_correction','adjustment','payout','payout_reversal','withholding','referral_share','gift_share'));

create table public.workbook_gifts (
  id              uuid primary key default gen_random_uuid(),
  giver_id        uuid not null references auth.users(id) on delete cascade,
  workbook_id     uuid not null references public.workbooks(id),
  recipient_email text check (recipient_email is null or char_length(recipient_email) between 5 and 254),
  recipient_norm  text not null,
  token_hash      text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  quarter         text not null check (quarter ~ '^[0-9]{4}-Q[1-4]$'),
  status          text not null default 'sent' check (status in ('sent','claimed','cancelled','expired')),
  expires_at      timestamptz not null,
  claimed_by      uuid references auth.users(id) on delete set null,
  claimed_at      timestamptz,
  created_at      timestamptz not null default now()
);
create index workbook_gifts_giver_idx on public.workbook_gifts(giver_id, created_at desc);
create index workbook_gifts_workbook_idx on public.workbook_gifts(workbook_id);
create index workbook_gifts_claimed_by_idx on public.workbook_gifts(claimed_by);
-- One gift a quarter for each giver. A cancelled gift gives the slot back; an
-- expired one does not (no rollover).
create unique index workbook_gifts_one_a_quarter on public.workbook_gifts(giver_id, quarter) where status in ('sent','claimed','expired');
-- One waiting gift for an address at a time.
create unique index workbook_gifts_one_waiting on public.workbook_gifts(recipient_norm) where status = 'sent';

-- The marketing pool ledger. Append-only. A negative amount is paid out of
-- the pool to an author. Staff read it; nobody writes it but the claim.
create table public.marketing_pool_ledger (
  id           uuid primary key default gen_random_uuid(),
  seq          bigint generated always as identity unique,
  entry_kind   text not null check (entry_kind in ('gift_author_payment','top_up')),
  gift_id      uuid unique references public.workbook_gifts(id),
  org_id       uuid references public.organisations(id),
  workbook_id  uuid references public.workbooks(id),
  currency     char(3) not null,
  amount_minor bigint not null check (amount_minor <> 0),
  livemode     boolean not null,
  note         text check (note is null or char_length(note) <= 300),
  created_at   timestamptz not null default now()
);
create index marketing_pool_ledger_org_idx on public.marketing_pool_ledger(org_id);
create index marketing_pool_ledger_workbook_idx on public.marketing_pool_ledger(workbook_id);
create trigger marketing_pool_ledger_append_only before update or delete on public.marketing_pool_ledger
  for each row execute function app.refuse_change();

alter table public.workbook_gifts enable row level security;
alter table public.marketing_pool_ledger enable row level security;
revoke all on public.workbook_gifts, public.marketing_pool_ledger from public, anon, authenticated;
grant select, insert, update on public.workbook_gifts to service_role;
grant select, insert on public.marketing_pool_ledger to service_role;
grant select on public.marketing_pool_ledger to authenticated;
create policy marketing_pool_ledger_staff on public.marketing_pool_ledger for select to authenticated
  using ((select app.is_money_staff()));

-- ---------------------------------------------------------------------------
-- Helpers.
-- ---------------------------------------------------------------------------
create or replace function app.gift_quarter(p_at timestamptz default now()) returns text
language sql stable set search_path = '' as $$
  select to_char(p_at at time zone 'Europe/London', 'YYYY') || '-Q' || to_char(p_at at time zone 'Europe/London', 'Q')
$$;

create or replace function app.has_ever_paid(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.subscriptions s where s.user_id = p_user)
      or exists (select 1 from public.subscription_invoices i where i.user_id = p_user and i.status = 'paid')
      or exists (select 1 from public.purchases p where p.user_id = p_user and p.status in ('paid','refunded'))
$$;

create or replace function app.is_paying_member(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.subscriptions s where s.user_id = p_user and s.status = 'active')
$$;

-- ---------------------------------------------------------------------------
-- The giver's side.
-- ---------------------------------------------------------------------------
create or replace function public.gift_status()
returns table (paying boolean, used boolean, quarter text)
language sql stable security definer set search_path = '' as $$
  select app.is_paying_member(app.uid()),
         exists (select 1 from public.workbook_gifts g where g.giver_id = app.uid() and g.quarter = app.gift_quarter() and g.status in ('sent','claimed','expired')),
         app.gift_quarter()
  where app.uid() is not null
$$;
revoke execute on function public.gift_status() from public, anon;
grant execute on function public.gift_status() to authenticated;

-- status is one of: sent, not_member, used_this_quarter, not_giftable,
-- not_eligible (the recipient has paid before, or has this workbook, or is
-- the giver) and waiting (a gift to this address is already waiting).
create or replace function public.gift_send(p_workbook uuid, p_email text, p_token_hash text)
returns table (status text, gift_id uuid)
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user  uuid := app.uid();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_norm  text := app.norm_email(lower(btrim(coalesce(p_email, ''))));
  v_days  int := coalesce((select (value ->> 'claim_days')::int from public.app_config where key = 'gift'), 30);
  v_rcpt  uuid;
  v_id    uuid;
  w       public.workbooks%rowtype;
begin
  if v_user is null then
    raise exception 'sign in first' using errcode = 'insufficient_privilege';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+$' or char_length(v_email) > 254 or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid gift' using errcode = 'check_violation';
  end if;
  -- A gift nobody claimed in time is closed, and the address is free again.
  update public.workbook_gifts x set status = 'expired', recipient_email = null where x.status = 'sent' and x.expires_at < now() and x.recipient_norm = v_norm;
  if not app.is_paying_member(v_user) then return query select 'not_member'::text, null::uuid; return; end if;
  if exists (select 1 from public.workbook_gifts g where g.giver_id = v_user and g.quarter = app.gift_quarter() and g.status in ('sent','claimed','expired')) then
    return query select 'used_this_quarter'::text, null::uuid; return;
  end if;
  select * into w from public.workbooks x where x.id = p_workbook;
  if not found or w.is_demo or not app.workbook_is_public(w.id) then
    return query select 'not_giftable'::text, null::uuid; return;
  end if;
  if v_norm = (select app.norm_email(u.email) from auth.users u where u.id = v_user) then
    return query select 'not_eligible'::text, null::uuid; return;
  end if;
  select u.id into v_rcpt from auth.users u where app.norm_email(u.email) = v_norm limit 1;
  if v_rcpt is not null and (app.has_ever_paid(v_rcpt)
       or exists (select 1 from public.entitlements e where e.user_id = v_rcpt and e.workbook_id = p_workbook and e.status = 'active' and e.source <> 'free_unit')) then
    return query select 'not_eligible'::text, null::uuid; return;
  end if;
  if exists (select 1 from public.workbook_gifts g where g.recipient_norm = v_norm and g.status = 'sent') then
    return query select 'waiting'::text, null::uuid; return;
  end if;
  insert into public.workbook_gifts (giver_id, workbook_id, recipient_email, recipient_norm, token_hash, quarter, expires_at)
  values (v_user, p_workbook, v_email, v_norm, p_token_hash, app.gift_quarter(), now() + make_interval(days => v_days))
  returning id into v_id;
  return query select 'sent'::text, v_id;
end $$;
revoke execute on function public.gift_send(uuid, text, text) from public, anon;
grant execute on function public.gift_send(uuid, text, text) to authenticated;

create or replace function public.gift_cancel(p_gift uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
begin
  update public.workbook_gifts set status = 'cancelled', recipient_email = null
   where id = p_gift and giver_id = app.uid() and status = 'sent';
  return case when found then 'cancelled' else 'unchanged' end;
end $$;
revoke execute on function public.gift_cancel(uuid) from public, anon;
grant execute on function public.gift_cancel(uuid) to authenticated;

create or replace function public.my_gifts()
returns table (id uuid, status text, quarter text, recipient_email text, workbook_title text, created_at timestamptz, expires_at timestamptz, expired boolean)
language sql stable security definer set search_path = '' as $$
  select g.id, g.status, g.quarter, g.recipient_email, w.title, g.created_at, g.expires_at, (g.status = 'sent' and g.expires_at < now())
    from public.workbook_gifts g join public.workbooks w on w.id = g.workbook_id
   where g.giver_id = app.uid()
   order by g.created_at desc
   limit 20
$$;
revoke execute on function public.my_gifts() from public, anon;
grant execute on function public.my_gifts() to authenticated;

-- ---------------------------------------------------------------------------
-- The recipient's side.
-- ---------------------------------------------------------------------------
-- What the claim page shows to a signed-in person holding the link.
create or replace function public.workbook_gift_preview(p_token_hash text)
returns table (status text, workbook_slug text, workbook_title text, expired boolean, can_claim boolean)
language sql stable security definer set search_path = '' as $$
  select g.status, w.slug, w.title, (g.expires_at < now()),
         (g.status = 'sent' and g.expires_at >= now() and g.giver_id <> app.uid() and not app.has_ever_paid(app.uid()))
    from public.workbook_gifts g join public.workbooks w on w.id = g.workbook_id
   where g.token_hash = p_token_hash and app.uid() is not null
$$;
revoke execute on function public.workbook_gift_preview(text) from public, anon;
grant execute on function public.workbook_gift_preview(text) to authenticated;

-- The claim. Service role only: the server decides livemode and passes the
-- signed-in reader. Returns claimed, unchanged (already theirs), unknown,
-- expired, not_available (cancelled or claimed by someone else) or
-- not_eligible (they have paid before, or they are the giver).
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
  if g.giver_id = p_user or app.has_ever_paid(p_user) then return 'not_eligible'; end if;

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

  -- The author's half, from the marketing pool.
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
revoke execute on function public.gift_claim(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.gift_claim(uuid, text, boolean) to service_role;
