-- 0052 Author growth (build list 14.12, 14.13 and 6.4).
--
-- 1. Author affiliate links (6.4). Each organisation has one link code. A
--    signed-in reader who chooses to use the link is attributed to that
--    organisation, first link wins, and only if they have never paid Akana.
--    No cookie is set: the choice is a button on the landing page, recorded
--    here before any payment.
-- 2. Referred-membership share (14.13). For 12 months from the member's first
--    paid invoice, 25 percent of the membership revenue base from a member an
--    author referred goes to that author as a royalty_lines row of kind
--    'referral_share'. Figures are in public.app_config under 'author_share'.
--    The ledger stays append-only: a refund adds a proportional reversal line.
--    The share is paid by Akana (akana_minor carries the opposite sign), so
--    the membership pool is not reduced.
-- 3. Author-to-author recommendations (14.12). Up to three per organisation,
--    only to authors with a public workbook, shown at the end of a programme
--    and on author pages, with the recommenders shown back.
-- 4. The sale channel (0039): author_link_channel says whether a buyer came
--    from the seller's own link.
--
-- Same rules as 0051. Depends on 0001, 0002, 0021, 0039 and 0051.

-- ---------------------------------------------------------------------------
-- 1. Links and attribution.
-- ---------------------------------------------------------------------------
create table public.author_links (
  org_id     uuid primary key references public.organisations(id) on delete cascade,
  code       text not null unique check (code ~ '^[0-9a-f]{10}$'),
  created_at timestamptz not null default now()
);

create table public.member_attributions (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  org_id        uuid not null references public.organisations(id),
  code          text not null,
  created_at    timestamptz not null default now(),
  first_paid_at timestamptz
);
create index member_attributions_org_idx on public.member_attributions(org_id);

alter table public.author_links enable row level security;
alter table public.member_attributions enable row level security;
revoke all on public.author_links, public.member_attributions from public, anon, authenticated;
grant select, insert, update on public.author_links, public.member_attributions to service_role;

insert into public.app_config (key, value) values
  ('author_share', jsonb_build_object('rate', 0.25, 'months', 12))
on conflict (key) do nothing;

create or replace function public.my_author_link(p_org uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare v_code text;
begin
  if app.uid() is null or not app.org_can(p_org, 'books', 'write') then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;
  select code into v_code from public.author_links where org_id = p_org;
  if v_code is not null then return v_code; end if;
  loop
    v_code := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    begin
      insert into public.author_links (org_id, code) values (p_org, v_code) on conflict (org_id) do nothing;
      exit;
    exception when unique_violation then
      null;
    end;
  end loop;
  select code into v_code from public.author_links where org_id = p_org;
  return v_code;
end $$;
revoke execute on function public.my_author_link(uuid) from public, anon;
grant execute on function public.my_author_link(uuid) to authenticated;

-- What the landing page may say about a link: the public author's name and
-- page. Nothing is returned for an organisation with no public author.
create or replace function public.author_link_lookup(p_code text) returns table (display_name text, slug text)
language sql stable security definer set search_path = '' as $$
  select a.display_name, a.slug
    from public.author_links l
    join public.authors a on a.org_id = l.org_id
   where l.code = lower(btrim(coalesce(p_code, ''))) and a.status = 'active' and app.author_is_public(a.id)
   order by a.created_at
   limit 1
$$;
revoke execute on function public.author_link_lookup(text) from public;
grant execute on function public.author_link_lookup(text) to anon, authenticated;

-- Use an author's link. 'attached', 'already', 'unknown_code', 'own_link' or 'not_new'.
create or replace function public.author_link_use(p_code text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := app.uid();
  v_org  uuid;
begin
  if v_user is null then
    raise exception 'sign in first' using errcode = 'insufficient_privilege';
  end if;
  select org_id into v_org from public.author_links where code = lower(btrim(coalesce(p_code, '')));
  if v_org is null then return 'unknown_code'; end if;
  if app.is_org_member(v_org) then return 'own_link'; end if;
  if exists (select 1 from public.member_attributions where user_id = v_user) then return 'already'; end if;
  if exists (select 1 from public.subscriptions s where s.user_id = v_user)
     or exists (select 1 from public.purchases p where p.user_id = v_user and p.status in ('paid','refunded')) then
    return 'not_new';
  end if;
  insert into public.member_attributions (user_id, org_id, code) values (v_user, v_org, lower(btrim(p_code)))
    on conflict (user_id) do nothing;
  return 'attached';
end $$;
revoke execute on function public.author_link_use(text) from public, anon;
grant execute on function public.author_link_use(text) to authenticated;

-- Did this buyer come through this organisation's link? Service role (checkout).
create or replace function public.author_link_channel(p_user uuid, p_org uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_service_role() then
    raise exception 'only the service role reads attributions' using errcode = 'insufficient_privilege';
  end if;
  return exists (select 1 from public.member_attributions m where m.user_id = p_user and m.org_id = p_org);
end $$;
revoke execute on function public.author_link_channel(uuid, uuid) from public, anon, authenticated;
grant execute on function public.author_link_channel(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 2. The referred-membership share in the ledger.
-- ---------------------------------------------------------------------------
alter table public.royalty_lines drop constraint if exists royalty_lines_kind_check;
alter table public.royalty_lines add constraint royalty_lines_kind_check
  check (kind in ('sale','refund','dispute','dispute_reversal','pool','fee_correction','adjustment','payout','payout_reversal','withholding','referral_share'));

-- A paid membership invoice from an attributed member. Idempotent on the
-- invoice. Returns 'recorded', 'unchanged', 'none' (no attribution or not a
-- paid invoice), 'expired' (past the window) or 'no_royalty' (house or demo).
create or replace function app.record_author_referral_share(p_invoice text, p_livemode boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare
  i      public.subscription_invoices%rowtype;
  a      public.member_attributions%rowtype;
  rc     public.royalty_receipts%rowtype;
  cfg    public.royalty_config;
  sc     jsonb := coalesce((select value from public.app_config where key = 'author_share'), '{}'::jsonb);
  v_rate numeric(5,4) := coalesce((sc ->> 'rate')::numeric, 0.25);
  v_months int := coalesce((sc ->> 'months')::int, 12);
  v_base bigint;
  v_share bigint;
  v_at   timestamptz;
begin
  if not (app.is_service_role() or app.is_money_staff()) then
    raise exception 'only the service role records shares' using errcode = 'insufficient_privilege';
  end if;
  select * into i from public.subscription_invoices where stripe_invoice_id = p_invoice;
  if not found or i.status <> 'paid' or i.amount_minor <= 0 or i.user_id is null then return 'none'; end if;
  select * into a from public.member_attributions where user_id = i.user_id for update;
  if not found then return 'none'; end if;
  v_at := coalesce(i.paid_at, now());
  if a.first_paid_at is null then
    update public.member_attributions set first_paid_at = v_at where user_id = a.user_id;
    a.first_paid_at := v_at;
  end if;
  if v_at >= a.first_paid_at + make_interval(months => v_months) then return 'expired'; end if;
  if not app.org_earns(a.org_id) then return 'no_royalty'; end if;
  if exists (select 1 from public.royalty_lines where idem_key = 'refshare:' || p_invoice) then return 'unchanged'; end if;

  select * into rc from public.royalty_receipts where kind = 'membership' and stripe_ref = p_invoice;
  cfg := app.royalty_config();
  v_base := app.royalty_base(i.amount_minor, i.tax_minor, rc.fee_minor, cfg.fee_treatment);
  v_share := floor(v_base * v_rate);
  if v_share <= 0 then return 'none'; end if;
  insert into public.royalty_lines (org_id, tenant_id, kind, period, currency, livemode, units, gross_minor, tax_minor, fee_minor,
    net_base_minor, rate, author_minor, akana_minor, is_placeholder_rate, receipt_id, idem_key, note, occurred_at, channel)
  values (a.org_id, i.tenant_id, 'referral_share', app.money_month(v_at), upper(i.currency), coalesce(p_livemode, false), 0,
    i.amount_minor, i.tax_minor, coalesce(rc.fee_minor, 0), v_base, v_rate, v_share, -v_share, cfg.is_placeholder, rc.id,
    'refshare:' || p_invoice, 'Share of membership revenue from a member you referred', v_at, 'author_link')
  on conflict (idem_key) do nothing;
  return 'recorded';
end $$;

-- A refund on that payment: a proportional reversal, once per refunded total.
create or replace function app.reverse_author_referral_share(p_payment_intent text, p_refunded_minor int, p_livemode boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare
  rc      public.royalty_receipts%rowtype;
  l       public.royalty_lines%rowtype;
  v_done  bigint;
  v_target bigint;
  v_delta bigint;
begin
  if not (app.is_service_role() or app.is_money_staff()) then
    raise exception 'only the service role records shares' using errcode = 'insufficient_privilege';
  end if;
  select * into rc from public.royalty_receipts where kind = 'membership' and payment_intent_id = p_payment_intent;
  if not found then return 'none'; end if;
  select * into l from public.royalty_lines where idem_key = 'refshare:' || rc.stripe_ref;
  if not found then return 'none'; end if;
  v_target := least(l.author_minor, floor(l.author_minor::numeric * least(p_refunded_minor, rc.gross_minor) / nullif(rc.gross_minor, 0)))::bigint;
  select coalesce(-sum(x.author_minor), 0) into v_done from public.royalty_lines x where x.reverses_line_id = l.id;
  v_delta := v_target - v_done;
  if v_delta <= 0 then return 'unchanged'; end if;
  insert into public.royalty_lines (org_id, tenant_id, kind, period, currency, livemode, units, rate, author_minor, akana_minor,
    is_placeholder_rate, receipt_id, reverses_line_id, idem_key, note, occurred_at, channel)
  values (l.org_id, l.tenant_id, 'referral_share', app.money_month(now()), l.currency, l.livemode, 0, l.rate, -v_delta, v_delta,
    l.is_placeholder_rate, l.receipt_id, l.id, 'refshare_rev:' || rc.stripe_ref || ':' || v_target::text,
    'Reversal after a refund', now(), 'author_link')
  on conflict (idem_key) do nothing;
  return 'recorded';
end $$;

create or replace function public.record_author_referral_share(p_invoice text, p_livemode boolean) returns text
language sql security invoker set search_path = '' as $$ select app.record_author_referral_share(p_invoice, p_livemode) $$;
create or replace function public.reverse_author_referral_share(p_payment_intent text, p_refunded_minor int, p_livemode boolean) returns text
language sql security invoker set search_path = '' as $$ select app.reverse_author_referral_share(p_payment_intent, p_refunded_minor, p_livemode) $$;
revoke execute on function public.record_author_referral_share(text, boolean), public.reverse_author_referral_share(text, int, boolean) from public, anon, authenticated;
grant execute on function public.record_author_referral_share(text, boolean), public.reverse_author_referral_share(text, int, boolean) to service_role;
revoke execute on function app.record_author_referral_share(text, boolean), app.reverse_author_referral_share(text, int, boolean) from public;
grant execute on function app.record_author_referral_share(text, boolean), app.reverse_author_referral_share(text, int, boolean) to service_role;

-- The Studio figures: counts and money, never a member's identity.
create or replace function public.author_referral_summary(p_org uuid)
returns table (referred int, paying int, earned_minor bigint, currency text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if app.uid() is null or not (app.org_can(p_org, 'statements', 'read') or app.is_money_staff()) then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;
  return query
    select (select count(*)::int from public.member_attributions m where m.org_id = p_org),
           (select count(*)::int from public.member_attributions m where m.org_id = p_org and m.first_paid_at is not null),
           coalesce((select sum(l.author_minor) from public.royalty_lines l where l.org_id = p_org and l.kind = 'referral_share'), 0)::bigint,
           coalesce((select l.currency::text from public.royalty_lines l where l.org_id = p_org and l.kind = 'referral_share' order by l.occurred_at desc limit 1), 'GBP');
end $$;
revoke execute on function public.author_referral_summary(uuid) from public, anon;
grant execute on function public.author_referral_summary(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Author-to-author recommendations.
-- ---------------------------------------------------------------------------
create table public.author_recommendations (
  from_org   uuid not null references public.organisations(id) on delete cascade,
  to_org     uuid not null references public.organisations(id) on delete cascade,
  position   smallint not null check (position between 1 and 3),
  created_at timestamptz not null default now(),
  primary key (from_org, to_org),
  unique (from_org, position),
  constraint author_recommendations_not_self check (from_org <> to_org)
);
create index author_recommendations_to_idx on public.author_recommendations(to_org);
alter table public.author_recommendations enable row level security;
revoke all on public.author_recommendations from public, anon, authenticated;
grant select, insert, delete on public.author_recommendations to service_role;

-- Replace an organisation's list (at most three). The target must have an
-- author with a public workbook.
create or replace function public.set_author_recommendations(p_org uuid, p_to uuid[]) returns int
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_to  uuid[] := coalesce(p_to, '{}');
  v_n   int;
  t     uuid;
  v_pos int := 0;
begin
  if app.uid() is null or not app.org_can(p_org, 'books', 'write') then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;
  v_n := cardinality(v_to);
  if v_n > 3 then
    raise exception 'at most three recommendations' using errcode = 'check_violation';
  end if;
  if (select count(distinct x) from unnest(v_to) x) <> v_n then
    raise exception 'each author once' using errcode = 'check_violation';
  end if;
  foreach t in array v_to loop
    if t = p_org then
      raise exception 'you cannot recommend yourself' using errcode = 'check_violation';
    end if;
    if not exists (select 1 from public.authors a where a.org_id = t and a.status = 'active' and app.author_is_public(a.id)) then
      raise exception 'that author has no public workbook' using errcode = 'check_violation';
    end if;
  end loop;
  delete from public.author_recommendations where from_org = p_org;
  foreach t in array v_to loop
    v_pos := v_pos + 1;
    insert into public.author_recommendations (from_org, to_org, position) values (p_org, t, v_pos);
  end loop;
  perform app.audit('author.recommendations_set', 'org:' || p_org::text, null, null, p_org, null, jsonb_build_object('count', v_n));
  return v_n;
end $$;
revoke execute on function public.set_author_recommendations(uuid, uuid[]) from public, anon;
grant execute on function public.set_author_recommendations(uuid, uuid[]) to authenticated;

-- For the Studio: who you recommend, and who recommends you (so you can
-- recommend them back). Only authors who are public are named.
create or replace function public.my_author_recommendations(p_org uuid)
returns table (direction text, org_id uuid, display_name text, slug text, place int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if app.uid() is null or not app.org_can(p_org, 'books', 'write') then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;
  return query
    select 'recommends'::text, r.to_org, a.display_name, a.slug, r.position::int
      from public.author_recommendations r
      join lateral (select x.display_name, x.slug from public.authors x
                     where x.org_id = r.to_org and x.status = 'active' and app.author_is_public(x.id)
                     order by x.created_at limit 1) a on true
     where r.from_org = p_org
    union all
    select 'recommended_by'::text, r.from_org, a.display_name, a.slug, 0
      from public.author_recommendations r
      join lateral (select x.display_name, x.slug from public.authors x
                     where x.org_id = r.from_org and x.status = 'active' and app.author_is_public(x.id)
                     order by x.created_at limit 1) a on true
     where r.to_org = p_org
    order by 1 desc, 5;
end $$;
revoke execute on function public.my_author_recommendations(uuid) from public, anon;
grant execute on function public.my_author_recommendations(uuid) to authenticated;

-- The public side: both directions for an author page.
create or replace function public.author_recommendations_for(p_slug text)
returns table (direction text, display_name text, slug text, place int)
language sql stable security definer set search_path = '' as $$
  with me as (
    select a.org_id from public.authors a
     where a.slug = p_slug and a.status = 'active' and a.org_id is not null and app.author_is_public(a.id)
  )
  select 'recommends'::text, a.display_name, a.slug, r.position::int
    from me join public.author_recommendations r on r.from_org = me.org_id
    join lateral (select x.display_name, x.slug from public.authors x
                   where x.org_id = r.to_org and x.status = 'active' and app.author_is_public(x.id)
                   order by x.created_at limit 1) a on true
  union all
  select 'recommended_by'::text, a.display_name, a.slug, 0
    from me join public.author_recommendations r on r.to_org = me.org_id
    join lateral (select x.display_name, x.slug from public.authors x
                   where x.org_id = r.from_org and x.status = 'active' and app.author_is_public(x.id)
                   order by x.created_at limit 1) a on true
  order by 1 desc, 4, 2
$$;
revoke execute on function public.author_recommendations_for(text) from public;
grant execute on function public.author_recommendations_for(text) to anon, authenticated;

-- The programme end: the recommendations of the organisation that published
-- the workbook. A reader sees the same list as an author page shows.
create or replace function public.workbook_recommendations(p_workbook_slug text)
returns table (display_name text, slug text, place int)
language sql stable security definer set search_path = '' as $$
  select a.display_name, a.slug, r.position::int
    from public.workbooks w
    join public.author_recommendations r on r.from_org = w.org_id
    join lateral (select x.display_name, x.slug from public.authors x
                   where x.org_id = r.to_org and x.status = 'active' and app.author_is_public(x.id)
                   order by x.created_at limit 1) a on true
   where w.slug = p_workbook_slug and app.workbook_is_public(w.id)
   order by r.position
$$;
revoke execute on function public.workbook_recommendations(text) from public;
grant execute on function public.workbook_recommendations(text) to anon, authenticated;
