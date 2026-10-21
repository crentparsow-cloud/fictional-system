-- 0055 Conversion, part 2: true social proof, Theme bundles and win-back
-- email (build list 5.12, 5.8 and the Phase B win-back line).
--
-- Same rules as 0001 to 0054. Nothing earlier is edited. RLS is on for every
-- new table and every function is security definer with search_path pinned to
-- '' and a public wrapper. Depends on 0004, 0007, 0041 and 0054.
--
-- 1. Social proof. public.social_proof_counts holds only counts that are
--    real and above the threshold in app_config (social_proof_min, 100). The
--    refresh is computed on the server by app.refresh_social_proof(), run by
--    the daily job, and a count that falls to the threshold or below is
--    deleted, so a page can never show it. Wellbeing titles (safety tier
--    standard or higher) and demo titles never get a row.
-- 2. Theme bundles. public.theme_bundles holds one price per Theme, blank
--    until staff set it. A bundle is every live, purchasable title on the
--    Theme. public.bundle_purchases records one payment and the titles it
--    opened. Nothing about a bundle is written to the royalty ledger yet:
--    see the note in docs and the build report.
-- 3. Win-back. public.marketing_optouts is the unsubscribe list.
--    public.winback_log holds at most one row per reader per season.
--    app.due_winback lists lapsed monthly members and one-off buyers only.
--    A reader who ever held a yearly membership is never listed. Nobody with
--    a wellbeing title in their enrolments is listed.

-- ---------------------------------------------------------------------------
-- 1. Social proof
-- ---------------------------------------------------------------------------
insert into public.app_config (key, value) values
  ('social_proof_min', '100'),
  ('social_proof_ttl_hours', '26'),
  ('winback_min_days', '30'),
  ('winback_max_days', '365'),
  ('winback_max_per_run', '200')
on conflict (key) do nothing;

create table public.social_proof_counts (
  scope       text not null check (scope in ('readers_started', 'readers_total')),
  tenant_id   uuid not null references public.tenants(id),
  workbook_id uuid references public.workbooks(id) on delete cascade,
  readers     int not null check (readers > 0),
  computed_at timestamptz not null default now(),
  constraint social_proof_scope_shape check ((scope = 'readers_started') = (workbook_id is not null)),
  unique nulls not distinct (scope, tenant_id, workbook_id)
);
create index social_proof_workbook_idx on public.social_proof_counts(workbook_id);

alter table public.social_proof_counts enable row level security;
revoke all on public.social_proof_counts from anon, authenticated;
grant select on public.social_proof_counts to anon, authenticated;
grant select, insert, update, delete on public.social_proof_counts to service_role;
create policy social_proof_counts_read on public.social_proof_counts for select to anon, authenticated using (true);

-- Recompute every count. Only rows strictly above the threshold are kept.
-- Returns the number of rows held. Service role only.
create or replace function app.refresh_social_proof() returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_min int := app.conv_config_int('social_proof_min', 100);
  n int;
begin
  if not app.is_service_role() then
    raise exception 'only the service role refreshes social proof' using errcode = 'insufficient_privilege';
  end if;
  drop table if exists pg_temp.sp_new;
  create temp table pg_temp.sp_new (scope text, tenant_id uuid, workbook_id uuid, readers int) on commit drop;

  insert into pg_temp.sp_new
  select 'readers_started', e.tenant_id, e.workbook_id, count(distinct e.user_id)::int
    from public.enrolments e
    join public.workbooks w on w.id = e.workbook_id
   where w.status = 'live' and not w.is_demo and w.safety_tier = 'none'
   group by e.tenant_id, e.workbook_id
  having count(distinct e.user_id) > v_min;

  insert into pg_temp.sp_new
  select 'readers_total', e.tenant_id, null, count(distinct e.user_id)::int
    from public.enrolments e
    join public.workbooks w on w.id = e.workbook_id
   where w.status = 'live' and not w.is_demo
   group by e.tenant_id
  having count(distinct e.user_id) > v_min;

  delete from public.social_proof_counts c
   where not exists (select 1 from pg_temp.sp_new x
                      where x.scope = c.scope and x.tenant_id = c.tenant_id and x.workbook_id is not distinct from c.workbook_id);
  insert into public.social_proof_counts (scope, tenant_id, workbook_id, readers, computed_at)
  select scope, tenant_id, workbook_id, readers, now() from pg_temp.sp_new
  on conflict (scope, tenant_id, workbook_id) do update set readers = excluded.readers, computed_at = excluded.computed_at;
  select count(*) into n from public.social_proof_counts;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Theme bundles
-- ---------------------------------------------------------------------------
create table public.theme_bundles (
  theme_id   text primary key references public.themes(id),
  amounts    jsonb not null default '{}'::jsonb,
  active     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint theme_bundles_amounts_object check (jsonb_typeof(amounts) = 'object'),
  constraint theme_bundles_active_needs_amounts check (not active or amounts <> '{}'::jsonb)
);
create trigger theme_bundles_touch before update on public.theme_bundles for each row execute function app.touch_updated_at();
alter table public.theme_bundles enable row level security;
revoke all on public.theme_bundles from anon, authenticated;
grant select on public.theme_bundles to anon, authenticated;
grant select, insert, update, delete on public.theme_bundles to service_role;
-- A bundle price is public once it is switched on. Staff write it through the service role.
create policy theme_bundles_read on public.theme_bundles for select to anon, authenticated using (active);
create policy theme_bundles_staff_read on public.theme_bundles for select to authenticated using (app.is_platform(array['owner','editor','finance']));

create table public.bundle_purchases (
  id                         uuid primary key default gen_random_uuid(),
  user_id                    uuid references auth.users(id) on delete set null,
  tenant_id                  uuid not null references public.tenants(id),
  theme_id                   text not null references public.themes(id),
  workbook_ids               uuid[] not null check (cardinality(workbook_ids) >= 2),
  stripe_checkout_session_id text not null unique,
  stripe_payment_intent_id   text,
  currency                   char(3) not null,
  amount_minor               integer not null default 0 check (amount_minor >= 0),
  tax_minor                  integer not null default 0 check (tax_minor >= 0),
  status                     text not null default 'pending' check (status in ('pending','paid','refunded','failed')),
  created_at                 timestamptz not null default now(),
  paid_at                    timestamptz,
  refunded_at                timestamptz
);
create index bundle_purchases_user_idx on public.bundle_purchases(user_id);
create index bundle_purchases_pi_idx on public.bundle_purchases(stripe_payment_intent_id);
create index bundle_purchases_theme_idx on public.bundle_purchases(theme_id);
alter table public.bundle_purchases enable row level security;
revoke all on public.bundle_purchases from anon, authenticated;
grant select (id, user_id, tenant_id, theme_id, workbook_ids, currency, amount_minor, status, created_at, paid_at, refunded_at)
  on public.bundle_purchases to authenticated;
grant select, insert, update on public.bundle_purchases to service_role;
create policy bundle_purchases_own_read on public.bundle_purchases for select to authenticated using (user_id = app.uid());
create policy bundle_purchases_staff_read on public.bundle_purchases for select to authenticated using (app.is_platform(array['owner','support','finance']));

alter table public.entitlements add column bundle_purchase_id uuid references public.bundle_purchases(id);
create index entitlements_bundle_idx on public.entitlements(bundle_purchase_id) where bundle_purchase_id is not null;

create or replace function app.bundle_create(p_tenant uuid, p_user uuid, p_theme text, p_workbooks uuid[], p_session text, p_currency text, p_amount_minor int) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not app.is_service_role() then
    raise exception 'only the service role creates bundle purchases' using errcode = 'insufficient_privilege';
  end if;
  insert into public.bundle_purchases (user_id, tenant_id, theme_id, workbook_ids, stripe_checkout_session_id, currency, amount_minor)
  values (p_user, p_tenant, p_theme, p_workbooks, p_session, upper(p_currency), p_amount_minor)
  returning id into v_id;
  return v_id;
end $$;

-- The payment cleared: open each title for the buyer. A title they already own
-- keeps its own entitlement and is not tied to the bundle. Safe to repeat.
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
      set status = 'active', starts_at = least(public.entitlements.starts_at, now()), ends_at = null
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

create or replace function app.bundle_mark_failed(p_session text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not app.is_service_role() then
    raise exception 'only the service role records bundle payments' using errcode = 'insufficient_privilege';
  end if;
  update public.bundle_purchases set status = 'failed' where stripe_checkout_session_id = p_session and status = 'pending';
  get diagnostics n = row_count;
  return n = 1;
end $$;

-- A refund of the payment ends the access the bundle gave. Titles the buyer
-- owned another way are untouched.
create or replace function app.bundle_refund(p_payment_intent text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  b public.bundle_purchases%rowtype;
  n int;
begin
  if not app.is_service_role() then
    raise exception 'only the service role records bundle refunds' using errcode = 'insufficient_privilege';
  end if;
  select * into b from public.bundle_purchases where stripe_payment_intent_id = p_payment_intent for update;
  if not found then return jsonb_build_object('found', false); end if;
  if b.status = 'refunded' then return jsonb_build_object('found', true, 'changed', false, 'id', b.id); end if;
  update public.entitlements set status = 'revoked', ends_at = least(coalesce(ends_at, now()), now())
   where bundle_purchase_id = b.id and status = 'active';
  get diagnostics n = row_count;
  update public.bundle_purchases set status = 'refunded', refunded_at = now() where id = b.id;
  perform app.audit('commerce.bundle_refunded', 'bundle:' || b.id::text, null, b.tenant_id, null, null, jsonb_build_object('revoked', n));
  return jsonb_build_object('found', true, 'changed', true, 'id', b.id, 'revoked', n);
end $$;

-- ---------------------------------------------------------------------------
-- 3. Win-back
-- ---------------------------------------------------------------------------
create table public.marketing_optouts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  at      timestamptz not null default now()
);
alter table public.marketing_optouts enable row level security;
revoke all on public.marketing_optouts from anon, authenticated;
grant select on public.marketing_optouts to authenticated;
grant select, insert, delete on public.marketing_optouts to service_role;
create policy marketing_optouts_own_read on public.marketing_optouts for select to authenticated using (user_id = app.uid());

create table public.winback_log (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  kind             text not null check (kind in ('monthly', 'one_off')),
  season           text not null check (season ~ '^[0-9]{4}-(winter|spring|summer|autumn)$'),
  unsub_token_hash text not null unique check (unsub_token_hash ~ '^[0-9a-f]{64}$'),
  sent_at          timestamptz not null default now(),
  unique (user_id, season)
);
alter table public.winback_log enable row level security;
revoke all on public.winback_log from anon, authenticated;
grant select, insert, delete on public.winback_log to service_role;
create policy winback_log_staff_read on public.winback_log for select to authenticated using (app.is_platform(array['owner','support']));

-- Who may be written to this season. Lapsed monthly members and one-off
-- buyers only, on the Akana marketplace tenant, and none of:
--   * a reader with a live membership, a gift, a seat, or a yearly plan ever
--   * a reader who opted out, or has a deletion in progress
--   * a reader with a wellbeing title in their enrolments
--   * a reader already written to this season
create or replace function app.due_winback(p_now timestamptz, p_season text, p_limit int) returns table (user_id uuid, email text, kind text)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_min interval := make_interval(days => app.conv_config_int('winback_min_days', 30));
  v_max interval := make_interval(days => app.conv_config_int('winback_max_days', 365));
  v_tenant constant uuid := '00000000-0000-0000-0000-00000000000a';
begin
  if not app.is_service_role() then
    raise exception 'only the service role lists win-back email' using errcode = 'insufficient_privilege';
  end if;
  return query
  with monthly as (
    select s.user_id as uid, max(coalesce(s.ended_at, s.canceled_at)) as lapsed_at
      from public.subscriptions s
     where s.tenant_id = v_tenant and s.plan in ('member_month', 'member_two_month')
       and s.status in ('canceled', 'unpaid', 'incomplete_expired')
     group by s.user_id
  ),
  oneoff as (
    select p.user_id as uid, max(p.paid_at) as last_paid
      from public.purchases p
     where p.tenant_id = v_tenant and p.kind = 'workbook' and p.status = 'paid' and p.user_id is not null
     group by p.user_id
  ),
  cand as (
    select m.uid, 'monthly'::text as k from monthly m
     where m.lapsed_at is not null and m.lapsed_at <= p_now - v_min and m.lapsed_at >= p_now - v_max
    union
    select o.uid, 'one_off'::text from oneoff o
     where o.last_paid <= p_now - v_min and o.last_paid >= p_now - v_max
       and not exists (select 1 from public.subscriptions s2 where s2.user_id = o.uid)
  )
  select c.uid, u.email::text, c.k
    from cand c
    join auth.users u on u.id = c.uid
   where u.email is not null
     -- never to anyone who ever held a yearly plan, lapsed or not
     and not exists (select 1 from public.subscriptions y where y.user_id = c.uid and y.plan in ('member_year', 'member_two_year'))
     -- never to anyone with a membership, gift or seat running now
     and not exists (select 1 from public.subscriptions l where l.user_id = c.uid and l.status in ('active', 'trialing', 'past_due', 'paused', 'incomplete'))
     and not exists (select 1 from public.entitlements e
                      where e.user_id = c.uid and e.workbook_id is null and e.source in ('membership', 'gift', 'team_seat')
                        and e.status = 'active' and (e.ends_at is null or e.ends_at > p_now))
     and not exists (select 1 from public.membership_seats ms where ms.member_user_id = c.uid and ms.status = 'active')
     and not exists (select 1 from public.marketing_optouts o2 where o2.user_id = c.uid)
     and not exists (select 1 from public.account_deletion_requests d where d.user_id = c.uid and d.cancelled_at is null)
     and not exists (select 1 from public.enrolments en join public.workbooks w on w.id = en.workbook_id
                      where en.user_id = c.uid and w.safety_tier <> 'none')
     and not exists (select 1 from public.winback_log l2 where l2.user_id = c.uid and l2.season = p_season)
   order by c.uid
   limit greatest(coalesce(p_limit, app.conv_config_int('winback_max_per_run', 200)), 0);
end $$;

-- Claim the season for a reader before the email goes. False when they were
-- already written to this season, so a repeat run sends nothing new.
create or replace function app.winback_claim(p_user uuid, p_kind text, p_season text, p_token_hash text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not app.is_service_role() then
    raise exception 'only the service role records win-back email' using errcode = 'insufficient_privilege';
  end if;
  insert into public.winback_log (user_id, kind, season, unsub_token_hash) values (p_user, p_kind, p_season, p_token_hash)
  on conflict (user_id, season) do nothing;
  get diagnostics n = row_count;
  return n = 1;
end $$;

-- The send failed: give the season back so the next run can try again.
create or replace function app.winback_release(p_user uuid, p_season text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not app.is_service_role() then
    raise exception 'only the service role records win-back email' using errcode = 'insufficient_privilege';
  end if;
  delete from public.winback_log where user_id = p_user and season = p_season;
  get diagnostics n = row_count;
  return n = 1;
end $$;

-- The unsubscribe link. The token proves the message was sent to this reader,
-- so no sign-in is needed. Safe to repeat. True when the token was known.
create or replace function app.marketing_unsubscribe(p_token_hash text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then return false; end if;
  select l.user_id into v_user from public.winback_log l where l.unsub_token_hash = p_token_hash;
  if v_user is null then return false; end if;
  insert into public.marketing_optouts (user_id) values (v_user) on conflict (user_id) do nothing;
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- Public wrappers and grants
-- ---------------------------------------------------------------------------
create or replace function public.refresh_social_proof() returns int
language sql volatile security invoker set search_path = '' as $$ select app.refresh_social_proof() $$;
create or replace function public.bundle_create(p_tenant uuid, p_user uuid, p_theme text, p_workbooks uuid[], p_session text, p_currency text, p_amount_minor int) returns uuid
language sql volatile security invoker set search_path = '' as $$ select app.bundle_create(p_tenant, p_user, p_theme, p_workbooks, p_session, p_currency, p_amount_minor) $$;
create or replace function public.bundle_mark_paid(p_session text, p_payment_intent text, p_amount_minor int, p_tax_minor int) returns jsonb
language sql volatile security invoker set search_path = '' as $$ select app.bundle_mark_paid(p_session, p_payment_intent, p_amount_minor, p_tax_minor) $$;
create or replace function public.bundle_mark_failed(p_session text) returns boolean
language sql volatile security invoker set search_path = '' as $$ select app.bundle_mark_failed(p_session) $$;
create or replace function public.bundle_refund(p_payment_intent text) returns jsonb
language sql volatile security invoker set search_path = '' as $$ select app.bundle_refund(p_payment_intent) $$;
create or replace function public.due_winback(p_now timestamptz, p_season text, p_limit int) returns table (user_id uuid, email text, kind text)
language sql stable security invoker set search_path = '' as $$ select * from app.due_winback(p_now, p_season, p_limit) $$;
create or replace function public.winback_claim(p_user uuid, p_kind text, p_season text, p_token_hash text) returns boolean
language sql volatile security invoker set search_path = '' as $$ select app.winback_claim(p_user, p_kind, p_season, p_token_hash) $$;
create or replace function public.winback_release(p_user uuid, p_season text) returns boolean
language sql volatile security invoker set search_path = '' as $$ select app.winback_release(p_user, p_season) $$;
create or replace function public.marketing_unsubscribe(p_token_hash text) returns boolean
language sql volatile security invoker set search_path = '' as $$ select app.marketing_unsubscribe(p_token_hash) $$;

revoke execute on function
  app.refresh_social_proof(), public.refresh_social_proof(),
  app.bundle_create(uuid, uuid, text, uuid[], text, text, int), public.bundle_create(uuid, uuid, text, uuid[], text, text, int),
  app.bundle_mark_paid(text, text, int, int), public.bundle_mark_paid(text, text, int, int),
  app.bundle_mark_failed(text), public.bundle_mark_failed(text),
  app.bundle_refund(text), public.bundle_refund(text),
  app.due_winback(timestamptz, text, int), public.due_winback(timestamptz, text, int),
  app.winback_claim(uuid, text, text, text), public.winback_claim(uuid, text, text, text),
  app.winback_release(uuid, text), public.winback_release(uuid, text)
  from public, anon, authenticated;
grant execute on function
  app.refresh_social_proof(), public.refresh_social_proof(),
  app.bundle_create(uuid, uuid, text, uuid[], text, text, int), public.bundle_create(uuid, uuid, text, uuid[], text, text, int),
  app.bundle_mark_paid(text, text, int, int), public.bundle_mark_paid(text, text, int, int),
  app.bundle_mark_failed(text), public.bundle_mark_failed(text),
  app.bundle_refund(text), public.bundle_refund(text),
  app.due_winback(timestamptz, text, int), public.due_winback(timestamptz, text, int),
  app.winback_claim(uuid, text, text, text), public.winback_claim(uuid, text, text, text),
  app.winback_release(uuid, text), public.winback_release(uuid, text)
  to service_role;
-- One-click unsubscribe works without a session.
revoke execute on function app.marketing_unsubscribe(text), public.marketing_unsubscribe(text) from public;
grant execute on function app.marketing_unsubscribe(text), public.marketing_unsubscribe(text) to anon, authenticated, service_role;
