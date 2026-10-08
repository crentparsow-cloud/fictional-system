-- 0029 Demo money (F-045, finishing it).
--
-- The demo publisher's logins (Quillmoor Demo Press, 0023) should see test-mode
-- sales, a sample statement and a populated dashboard after "Reset the demo".
-- Demo titles cannot be bought (0004) and the demo organisation earns nothing
-- (app.org_earns, 0021), so the real ledger can never hold these figures. This
-- migration adds a separate, demo-only path and walls it off in the database.
--
-- Same rules as 0001 to 0018. Every new table has RLS on, grants to anon and
-- authenticated are revoked and given back narrowly, functions are security
-- definer with search_path pinned to '', and every function a client may reach
-- has execute revoked from public first. Nothing earlier is edited. Depends on
-- 0001, 0004, 0016, 0021, 0022 and 0023 only.
--
-- What it adds:
--   * public.demo_royalty_lines, public.demo_statements and
--     public.demo_funnel_months. Separate tables, not flagged rows in the real
--     ones, so no real statement close, payout run, reconciliation, balance or
--     staff report can read them by accident: those all read 0021's tables,
--     which never hold a demo row. Every demo row has is_demo = true (a check),
--     livemode = false (a check, money only), and a trigger refuses any row
--     whose organisation or workbook is not a demo one.
--   * Guards on the real tables. A trigger refuses any royalty line,
--     statement or payout for a demo organisation, any royalty line or receipt
--     for a demo workbook, and any receipt or pool month for a demo tenant
--     (error AKQ01), for every role, service role and staff included.
--   * organisations.is_demo is Akana's: a client cannot change it, an
--     organisation that holds real money cannot become a demo, and one that
--     holds demo money cannot stop being one (AKQ01).
--   * public.demo_royalty_balances, a security invoker view for the earnings
--     page, shaped like public.royalty_balances.
--   * app.org_ledger_months and app.dashboard_raw (0022) read the demo tables
--     for a demo organisation and the real ones for every other. The bodies
--     for real organisations are 0022's, unchanged, with a "not a demo" test
--     added. So org_earnings, org_dashboard and the publisher roll-up show the
--     demo figures to the demo logins with no change to those functions, and
--     a real organisation never sees a demo row.
--   * app.rebuild_demo_money rebuilds the demo money from fixed figures,
--     relative to today: six months of test-mode sales for AK-DEM01 (live) and
--     AK-DEM02 (paused two months ago), three refunds, a test-mode payout of
--     each closed month on the payout day, a statement for every month whose
--     refund window has passed, and monthly dashboard counts with some below
--     the threshold so suppression shows. Rates are the configured ones
--     (placeholders today), so statements say provisional like real ones.
--   * app.reset_demo_state is 0023's body, unchanged, plus one call to the
--     rebuild before the audit row. Every reset, staff or nightly, puts the
--     demo money back.
--
-- The figures are invented for the demo. The price (GBP 7.99 including 20%
-- VAT) and the fee are stand-ins; nothing here is a price decision.
--
-- Error codes:
--   AKQ01  demo money refused (a demo row in a real table, a real row in a
--          demo table, or a change to organisations.is_demo that would mix them)

-- ===========================================================================
-- 1. Helpers
-- ===========================================================================

create or replace function app.org_is_demo(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select o.is_demo from public.organisations o where o.id = p_org), false)
$$;

create or replace function app.workbook_is_demo(p_workbook uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select w.is_demo from public.workbooks w where w.id = p_workbook), false)
$$;

create or replace function app.tenant_is_demo(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select t.is_demo from public.tenants t where t.id = p_tenant), false)
$$;

revoke execute on function app.org_is_demo(uuid), app.workbook_is_demo(uuid), app.tenant_is_demo(uuid) from public, anon;
grant execute on function app.org_is_demo(uuid), app.workbook_is_demo(uuid), app.tenant_is_demo(uuid) to authenticated, service_role;

-- ===========================================================================
-- 2. Demo tables
-- ===========================================================================

-- Shaped like public.royalty_lines (0021) for the columns a statement reads.
-- Not append-only: the reset deletes and rebuilds them.
create table public.demo_royalty_lines (
  id                  uuid primary key default gen_random_uuid(),
  seq                 bigint generated always as identity unique,
  org_id              uuid not null references public.organisations(id),
  workbook_id         uuid references public.workbooks(id),
  kind                text not null check (kind in ('sale','refund','payout')),
  period              text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  currency            char(3) not null check (currency ~ '^[A-Z]{3}$'),
  livemode            boolean not null default false check (livemode = false),
  units               int not null default 0,
  gross_minor         bigint not null default 0,
  tax_minor           bigint not null default 0,
  fee_minor           bigint not null default 0,
  net_base_minor      bigint not null default 0,
  rate                numeric(5,4),
  author_minor        bigint not null,
  akana_minor         bigint not null default 0,
  is_placeholder_rate boolean not null default false,
  is_demo             boolean not null default true check (is_demo),
  note                text check (note is null or char_length(note) <= 300),
  occurred_at         timestamptz not null,
  created_at          timestamptz not null default now()
);
create index demo_royalty_lines_org_idx on public.demo_royalty_lines(org_id, currency, livemode, period);

-- Shaped like public.statements (0021).
create table public.demo_statements (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organisations(id),
  period              text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  currency            char(3) not null check (currency ~ '^[A-Z]{3}$'),
  livemode            boolean not null default false check (livemode = false),
  opening_minor       bigint not null,
  sales_minor         bigint not null,
  refunds_minor       bigint not null,
  pool_minor          bigint not null,
  adjustments_minor   bigint not null,
  payouts_minor       bigint not null,
  closing_minor       bigint not null,
  units               int not null,
  line_count          int not null,
  is_placeholder_rate boolean not null,
  is_demo             boolean not null default true check (is_demo),
  closed_at           timestamptz not null default now(),
  unique (org_id, period, currency, livemode)
);

-- Monthly counts per workbook, the five metrics of app.dashboard_raw (0022).
create table public.demo_funnel_months (
  org_id      uuid not null references public.organisations(id),
  workbook_id uuid not null references public.workbooks(id),
  month       date not null check (extract(day from month) = 1),
  metric      text not null check (metric in ('listing_views','free_weeks_started','purchases','finished_week_one','finished_final_week')),
  n           bigint not null check (n >= 0),
  is_demo     boolean not null default true check (is_demo),
  primary key (workbook_id, month, metric)
);
create index demo_funnel_months_org_idx on public.demo_funnel_months(org_id, month);

-- A demo table holds demo organisations and their own demo workbooks only.
create or replace function app.guard_demo_money_row() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not app.org_is_demo(new.org_id) then
    raise exception 'demo money is for demo organisations only' using errcode = 'AKQ01';
  end if;
  -- Nested ifs: PL/pgSQL resolves every field in one condition, and
  -- demo_statements has no workbook_id.
  if tg_table_name <> 'demo_statements' then
    if new.workbook_id is not null
       and not exists (select 1 from public.workbooks w where w.id = new.workbook_id and w.is_demo and w.org_id = new.org_id) then
      raise exception 'demo money names only the demo organisation''s own demo workbooks' using errcode = 'AKQ01';
    end if;
  end if;
  return new;
end $$;
create trigger demo_royalty_lines_guard before insert or update on public.demo_royalty_lines
  for each row execute function app.guard_demo_money_row();
create trigger demo_statements_guard before insert or update on public.demo_statements
  for each row execute function app.guard_demo_money_row();
create trigger demo_funnel_months_guard before insert or update on public.demo_funnel_months
  for each row execute function app.guard_demo_money_row();

-- ===========================================================================
-- 3. The wall: no demo row in the real money tables, for any role.
-- ===========================================================================

create or replace function app.refuse_demo_in_real_money() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Nested ifs: PL/pgSQL resolves every field in one condition, and the
  -- tables do not all have the same columns.
  if tg_table_name in ('royalty_lines','statements','payouts') then
    if app.org_is_demo(new.org_id) then
      raise exception '% cannot hold a demo organisation', tg_table_name using errcode = 'AKQ01';
    end if;
  end if;
  if tg_table_name in ('royalty_lines','royalty_receipts') then
    if new.workbook_id is not null and app.workbook_is_demo(new.workbook_id) then
      raise exception '% cannot hold a demo workbook', tg_table_name using errcode = 'AKQ01';
    end if;
  end if;
  if tg_table_name in ('royalty_receipts','pool_periods') then
    if app.tenant_is_demo(new.tenant_id) then
      raise exception '% cannot hold a demo tenant', tg_table_name using errcode = 'AKQ01';
    end if;
  end if;
  return new;
end $$;

create trigger royalty_lines_no_demo before insert on public.royalty_lines
  for each row execute function app.refuse_demo_in_real_money();
create trigger statements_no_demo before insert on public.statements
  for each row execute function app.refuse_demo_in_real_money();
create trigger payouts_no_demo before insert or update on public.payouts
  for each row execute function app.refuse_demo_in_real_money();
create trigger royalty_receipts_no_demo before insert on public.royalty_receipts
  for each row execute function app.refuse_demo_in_real_money();
create trigger pool_periods_no_demo before insert or update on public.pool_periods
  for each row execute function app.refuse_demo_in_real_money();

-- organisations.is_demo is Akana's. Clients cannot change it at all. Nobody
-- can turn an organisation with real money into a demo, or a demo holding
-- demo money into a real one (the reset clears it only by being reset).
-- Runs as the caller, like 0014's payout guard, so the security definer
-- reset (which runs as the owner) and the service role pass the first test.
create or replace function app.guard_org_demo_flag() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.is_demo is distinct from old.is_demo then
    if current_user in ('anon', 'authenticated') then
      raise exception 'only Akana changes whether an organisation is a demo' using errcode = 'AKQ01';
    end if;
    if new.is_demo and (exists (select 1 from public.royalty_lines l where l.org_id = new.id)
                        or exists (select 1 from public.statements s where s.org_id = new.id)
                        or exists (select 1 from public.payouts p where p.org_id = new.id)) then
      raise exception 'an organisation with real money cannot become a demo' using errcode = 'AKQ01';
    end if;
    if not new.is_demo and (exists (select 1 from public.demo_royalty_lines l where l.org_id = new.id)
                            or exists (select 1 from public.demo_statements s where s.org_id = new.id)
                            or exists (select 1 from public.demo_funnel_months f where f.org_id = new.id)) then
      raise exception 'an organisation holding demo money cannot stop being a demo' using errcode = 'AKQ01';
    end if;
  end if;
  return new;
end $$;
create trigger organisations_demo_flag_guard before update of is_demo on public.organisations
  for each row execute function app.guard_org_demo_flag();

revoke execute on function app.guard_demo_money_row(), app.refuse_demo_in_real_money(), app.guard_org_demo_flag() from public, anon, authenticated;

-- ===========================================================================
-- 4. Reading the demo money
-- ===========================================================================

-- Balances for the earnings page, like public.royalty_balances. No pending
-- payouts: a demo payout is a ledger line only, never a public.payouts row.
create or replace view public.demo_royalty_balances with (security_invoker = true) as
select l.org_id, l.currency, l.livemode,
       sum(l.author_minor)::bigint as balance_minor,
       coalesce(sum(l.author_minor) filter (where l.kind = 'payout' or s.id is not null), 0)::bigint as settled_minor,
       0::bigint as pending_payout_minor,
       greatest(0, least(sum(l.author_minor),
         coalesce(sum(l.author_minor) filter (where l.kind = 'payout' or s.id is not null), 0)))::bigint as payable_minor,
       max(s.period) as last_closed_period,
       bool_or(l.is_placeholder_rate) as has_placeholder_rate,
       true as is_demo
  from public.demo_royalty_lines l
  left join public.demo_statements s
    on s.org_id = l.org_id and s.period = l.period and s.currency = l.currency and s.livemode = l.livemode
 group by l.org_id, l.currency, l.livemode;

-- 0022's ledger read, with the demo branch. Real organisations: 0022's query,
-- unchanged, plus "not a demo". Demo organisations: the same columns from
-- public.demo_royalty_lines.
create or replace function app.org_ledger_months(p_org uuid, p_from date, p_to date)
returns table (
  period               date,
  workbook_id          uuid,
  currency             text,
  livemode             boolean,
  units                bigint,
  gross_minor          bigint,
  tax_minor            bigint,
  fee_minor            bigint,
  refunded_gross_minor bigint,
  sales_author_minor   bigint,
  refunds_author_minor bigint,
  pool_author_minor    bigint,
  author_minor         bigint,
  sale_rate            numeric,
  has_placeholder_rate boolean
)
language sql stable security definer set search_path = '' as $$
  select to_date(m.period || '-01', 'YYYY-MM-DD'), m.workbook_id, m.currency::text, m.livemode,
         m.units::bigint, m.gross_minor, m.tax_minor, m.fee_minor, m.refunded_gross_minor,
         m.sales_author_minor, m.refunds_author_minor, m.pool_author_minor, m.author_minor,
         m.sale_rate, m.has_placeholder_rate
    from public.royalty_title_months m
   where m.org_id = p_org
     and not app.org_is_demo(p_org)
     and m.period >= to_char(p_from, 'YYYY-MM')
     and m.period <= to_char(p_to, 'YYYY-MM')
  union all
  select to_date(d.period || '-01', 'YYYY-MM-DD'), d.workbook_id, d.currency::text, d.livemode,
         sum(d.units)::bigint,
         coalesce(sum(d.gross_minor) filter (where d.kind = 'sale'), 0)::bigint,
         coalesce(sum(d.tax_minor) filter (where d.kind = 'sale'), 0)::bigint,
         coalesce(sum(d.fee_minor) filter (where d.kind = 'sale'), 0)::bigint,
         coalesce(-sum(d.gross_minor) filter (where d.kind = 'refund'), 0)::bigint,
         coalesce(sum(d.author_minor) filter (where d.kind = 'sale'), 0)::bigint,
         coalesce(sum(d.author_minor) filter (where d.kind = 'refund'), 0)::bigint,
         0::bigint,
         sum(d.author_minor)::bigint,
         max(d.rate) filter (where d.kind = 'sale'),
         bool_or(d.is_placeholder_rate)
    from public.demo_royalty_lines d
   where d.org_id = p_org
     and app.org_is_demo(p_org)
     and d.workbook_id is not null
     and d.period >= to_char(p_from, 'YYYY-MM')
     and d.period <= to_char(p_to, 'YYYY-MM')
   group by d.period, d.workbook_id, d.currency, d.livemode
$$;
revoke execute on function app.org_ledger_months(uuid, date, date) from public, anon, authenticated;

-- 0022's raw counts, with the demo branch. Real organisations: 0022's three
-- sources, unchanged, plus "not a demo". Demo organisations: the stored demo
-- counts. Either way every workbook and metric gets a row for every month.
create or replace function app.dashboard_raw(p_org uuid, p_from date, p_to date)
returns table (month date, workbook_id uuid, metric text, n bigint)
language sql stable security definer set search_path = '' as $$
  with bounds as (
    select date_trunc('month', p_from)::date as first_day,
           (date_trunc('month', p_to) + interval '1 month')::date as end_day,
           app.org_is_demo(p_org) as demo
  ),
  months as (
    select g::date as month
      from bounds, generate_series(bounds.first_day, (bounds.end_day - 1), interval '1 month') g
  ),
  wbs as (select w.id from public.workbooks w where w.org_id = p_org and w.status <> 'draft'),
  metrics as (
    select unnest(array['listing_views','free_weeks_started','purchases','finished_week_one','finished_final_week']) as metric
  ),
  raw as (
    select date_trunc('month', f.day)::date as m, f.workbook_id as wb,
           case f.event when 'page_view' then 'listing_views' else 'free_weeks_started' end as metric,
           sum(f.n)::bigint as n
      from public.funnel_counts f, bounds
     where not bounds.demo
       and f.workbook_id in (select id from wbs)
       and f.event in ('page_view','free_week_started')
       and f.day >= bounds.first_day and f.day < bounds.end_day
     group by 1, 2, 3
    union all
    select date_trunc('month', p.paid_at at time zone 'utc')::date, p.workbook_id, 'purchases', count(*)::bigint
      from public.purchases p, bounds
     where not bounds.demo
       and p.workbook_id in (select id from wbs)
       and p.kind = 'workbook' and p.status = 'paid' and p.paid_at is not null
       and (p.paid_at at time zone 'utc')::date >= bounds.first_day
       and (p.paid_at at time zone 'utc')::date < bounds.end_day
     group by 1, 2
    union all
    select date_trunc('month', x.first_at at time zone 'utc')::date, x.workbook_id,
           case x.kind when 'checkin_done' then 'finished_week_one' else 'finished_final_week' end,
           count(*)::bigint
      from (
        select e.id, e.workbook_id, pe.kind, min(pe.at) as first_at
          from public.progress_events pe
          join public.enrolments e on e.id = pe.enrolment_id
         where e.workbook_id in (select id from wbs)
           and ((pe.kind = 'checkin_done' and pe.ref = '1') or pe.kind = 'finished')
         group by e.id, e.workbook_id, pe.kind
      ) x, bounds
     where not bounds.demo
       and (x.first_at at time zone 'utc')::date >= bounds.first_day
       and (x.first_at at time zone 'utc')::date < bounds.end_day
     group by 1, 2, 3
    union all
    select d.month, d.workbook_id, d.metric, d.n
      from public.demo_funnel_months d, bounds
     where bounds.demo
       and d.org_id = p_org
       and d.workbook_id in (select id from wbs)
       and d.month >= bounds.first_day and d.month < bounds.end_day
  )
  select months.month, wbs.id, metrics.metric, coalesce(sum(raw.n), 0)::bigint
    from months cross join wbs cross join metrics
    left join raw on raw.m = months.month and raw.wb = wbs.id and raw.metric = metrics.metric
   group by months.month, wbs.id, metrics.metric
$$;
revoke execute on function app.dashboard_raw(uuid, date, date) from public, anon, authenticated;

-- ===========================================================================
-- 5. Rebuilding the demo money
-- ===========================================================================

-- Fixed figures, relative to today, oldest month first. Deterministic for a
-- given day. Returns what it wrote.
create or replace function app.rebuild_demo_money(p_org uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  c_wb1     constant uuid := '00000000-0000-0000-0000-0000000000f1';  -- AK-DEM01, live
  c_wb2     constant uuid := '00000000-0000-0000-0000-0000000000f2';  -- AK-DEM02, paused
  c_wb3     constant uuid := '00000000-0000-0000-0000-0000000000f3';  -- AK-DEM03, in review
  c_cur     constant text := 'GBP';
  c_gross   constant bigint := 799;   -- GBP 7.99, a stand-in price
  c_tax     constant bigint := 133;   -- 20% VAT inside the price
  c_fee     constant bigint := 32;    -- a stand-in card fee
  -- units sold per month, oldest first; AK-DEM02 was paused two months ago
  c_units1  constant int[] := array[18, 24, 31, 27, 35, 22];
  c_units2  constant int[] := array[12, 15, 9, 6, 0, 0];
  -- listing views per month for a whole month, oldest first
  c_views1  constant int[] := array[520, 610, 760, 690, 840, 560];
  c_views2  constant int[] := array[300, 340, 260, 180, 9, 6];
  cfg       public.royalty_config := app.royalty_config();
  v_now     timestamptz := now();
  v_this    text := app.money_month(now());
  v_base    bigint;
  v_author  bigint;
  v_period  text;
  v_start   timestamptz;
  v_end     timestamptz;
  v_secs    double precision;
  v_frac    double precision;
  v_at      timestamptz;
  v_open    bigint := 0;
  v_close   bigint;
  v_prev    bigint;
  v_wb      uuid;
  v_units   int;
  v_views   int;
  v_sold    int;
  v_free    bigint;
  v_lines   int;
  v_stmts   int;
  v_funnel  int;
begin
  if not app.org_is_demo(p_org) then
    raise exception 'demo money is for demo organisations only' using errcode = 'AKQ01';
  end if;

  delete from public.demo_funnel_months where org_id = p_org;
  delete from public.demo_statements where org_id = p_org;
  delete from public.demo_royalty_lines where org_id = p_org;

  v_base := app.royalty_base(c_gross, c_tax, c_fee, cfg.fee_treatment);
  v_author := floor(v_base * cfg.sale_rate_author);

  for i in 1..6 loop
    v_period := to_char(to_date(v_this || '-01', 'YYYY-MM-DD') - make_interval(months => 6 - i), 'YYYY-MM');
    v_start := app.month_start(v_period);
    v_end := app.month_start(app.month_after(v_period));
    v_secs := extract(epoch from (v_end - v_start));
    v_frac := least(1.0, greatest(0.0, extract(epoch from (v_now - v_start)) / v_secs));

    -- The previous month's closing balance, paid out (test mode) on the payout day.
    if v_prev is not null and v_prev > 0
       and v_start + make_interval(days => cfg.payout_day - 1, hours => 10) <= v_now then
      insert into public.demo_royalty_lines (org_id, kind, period, currency, author_minor, note, occurred_at)
      values (p_org, 'payout', v_period, c_cur, -v_prev, 'Demo payout in test mode. No money moved.',
              v_start + make_interval(days => cfg.payout_day - 1, hours => 10));
    end if;

    -- Sales, spread evenly through the month, none in the future.
    foreach v_wb in array array[c_wb1, c_wb2] loop
      v_units := case v_wb when c_wb1 then c_units1[i] else c_units2[i] end;
      for k in 1..v_units loop
        v_at := v_start + make_interval(secs => floor((k - 0.5) * v_secs / v_units));
        exit when v_at > v_now;
        insert into public.demo_royalty_lines (org_id, workbook_id, kind, period, currency, units, gross_minor, tax_minor, fee_minor,
          net_base_minor, rate, author_minor, akana_minor, is_placeholder_rate, note, occurred_at)
        values (p_org, v_wb, 'sale', v_period, c_cur, 1, c_gross, c_tax, c_fee, v_base, cfg.sale_rate_author, v_author,
          v_base - v_author, cfg.is_placeholder, 'Demo sale in test mode', v_at);
      end loop;
    end loop;

    -- Three full refunds: AK-DEM02 in month 3, AK-DEM01 in months 4 and 6.
    foreach v_wb in array array[c_wb1, c_wb2] loop
      if (v_wb = c_wb1 and i in (4, 6)) or (v_wb = c_wb2 and i = 3) then
        v_at := v_start + interval '20 days 11 hours';
        if v_at <= v_now and exists (select 1 from public.demo_royalty_lines l
                                      where l.org_id = p_org and l.workbook_id = v_wb and l.period = v_period and l.kind = 'sale') then
          insert into public.demo_royalty_lines (org_id, workbook_id, kind, period, currency, units, gross_minor, tax_minor, fee_minor,
            net_base_minor, rate, author_minor, akana_minor, is_placeholder_rate, note, occurred_at)
          values (p_org, v_wb, 'refund', v_period, c_cur, -1, -c_gross, -c_tax, 0, -v_base, cfg.sale_rate_author, -v_author,
            -(v_base - v_author), cfg.is_placeholder, 'Demo refund in test mode', v_at);
        end if;
      end if;
    end loop;

    -- The statement, once the month and its refund window have passed.
    if v_now >= v_end + make_interval(days => cfg.refund_window_days) then
      insert into public.demo_statements (org_id, period, currency, opening_minor, sales_minor, refunds_minor, pool_minor,
        adjustments_minor, payouts_minor, closing_minor, units, line_count, is_placeholder_rate, closed_at)
      select p_org, v_period, c_cur, v_open,
             coalesce(sum(l.author_minor) filter (where l.kind = 'sale'), 0),
             coalesce(sum(l.author_minor) filter (where l.kind = 'refund'), 0),
             0, 0,
             coalesce(sum(l.author_minor) filter (where l.kind = 'payout'), 0),
             v_open + coalesce(sum(l.author_minor), 0),
             coalesce(sum(l.units), 0), count(*), coalesce(bool_or(l.is_placeholder_rate), false),
             v_end + make_interval(days => cfg.refund_window_days)
        from public.demo_royalty_lines l
       where l.org_id = p_org and l.period = v_period and l.currency = c_cur
      returning closing_minor into v_close;
      v_open := v_close;
      v_prev := v_close;
    else
      v_prev := null;
    end if;

    -- Dashboard counts. The current month counts only the part gone by.
    foreach v_wb in array array[c_wb1, c_wb2, c_wb3] loop
      v_views := case v_wb when c_wb1 then floor(c_views1[i] * v_frac) when c_wb2 then floor(c_views2[i] * v_frac) else 0 end;
      select coalesce(sum(l.units), 0) into v_sold from public.demo_royalty_lines l
       where l.org_id = p_org and l.workbook_id = v_wb and l.period = v_period and l.kind in ('sale','refund');
      v_free := floor(v_views * 0.12);
      insert into public.demo_funnel_months (org_id, workbook_id, month, metric, n) values
        (p_org, v_wb, to_date(v_period || '-01', 'YYYY-MM-DD'), 'listing_views', v_views),
        (p_org, v_wb, to_date(v_period || '-01', 'YYYY-MM-DD'), 'free_weeks_started', v_free),
        (p_org, v_wb, to_date(v_period || '-01', 'YYYY-MM-DD'), 'purchases', greatest(v_sold, 0)),
        (p_org, v_wb, to_date(v_period || '-01', 'YYYY-MM-DD'), 'finished_week_one', floor(v_free * 0.55)),
        (p_org, v_wb, to_date(v_period || '-01', 'YYYY-MM-DD'), 'finished_final_week', floor(greatest(v_sold, 0) * 0.35));
    end loop;
  end loop;

  select count(*) into v_lines from public.demo_royalty_lines where org_id = p_org;
  select count(*) into v_stmts from public.demo_statements where org_id = p_org;
  select count(*) into v_funnel from public.demo_funnel_months where org_id = p_org;
  return jsonb_build_object('lines', v_lines, 'statements', v_stmts, 'funnel_rows', v_funnel,
    'last_statement', (select max(s.period) from public.demo_statements s where s.org_id = p_org));
end $$;
revoke execute on function app.rebuild_demo_money(uuid) from public, anon, authenticated;

-- ===========================================================================
-- 6. The reset (0023), now rebuilding the demo money too. The body is 0023's
-- as it was, with the rebuild added before the audit row and its result in
-- the audit row and the return value.
-- ===========================================================================

create or replace function app.reset_demo_state(p_look text, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  c_org    constant uuid := '00000000-0000-0000-0000-0000000000d0';
  c_tenant constant uuid := '00000000-0000-0000-0000-0000000000d1';
  c_imp_a  constant uuid := '00000000-0000-0000-0000-0000000000d2';
  c_imp_b  constant uuid := '00000000-0000-0000-0000-0000000000d3';
  c_au_a   constant uuid := '00000000-0000-0000-0000-0000000000d4';
  c_au_b   constant uuid := '00000000-0000-0000-0000-0000000000d5';
  v_look   text;
  v_wb     record;
  v_n      int;
  v_listed int;
  v_members int;
  v_retired int;
  v_publisher uuid;
  v_author uuid;
  v_money  jsonb;
begin
  v_look := coalesce(nullif(p_look, ''), (select c.value #>> '{}' from public.app_config c where c.key = 'demo_tenant_look'), 'a');
  if v_look not in ('a','b') then
    raise exception 'look must be a or b' using errcode = 'invalid_parameter_value';
  end if;
  insert into public.app_config (key, value) values ('demo_tenant_look', to_jsonb(v_look))
  on conflict (key) do update set value = excluded.value, updated_at = now();

  perform app.ensure_demo_tenant();

  -- The publisher.
  insert into public.organisations (id, code, kind, legal_name, display_name, slug, country, status, is_demo)
  values (c_org, 'PB-DEM00', 'publisher', 'Quillmoor Demo Press (invented for the Akana demo)', 'Quillmoor Demo Press',
          'quillmoor-demo-press', 'GB', 'active', true)
  on conflict (id) do update set code = excluded.code, kind = excluded.kind, legal_name = excluded.legal_name,
    display_name = excluded.display_name, slug = excluded.slug, country = excluded.country,
    status = excluded.status, is_demo = true;

  insert into public.imprints (id, org_id, name) values
    (c_imp_a, c_org, 'Quillmoor Everyday'),
    (c_imp_b, c_org, 'Quillmoor Small Hours')
  on conflict (id) do update set org_id = excluded.org_id, name = excluded.name;
  delete from public.imprints where org_id = c_org and id not in (c_imp_a, c_imp_b);

  insert into public.authors (id, code, org_id, slug, display_name, bio, country, is_demo, status) values
    (c_au_a, 'AU-DEM01', c_org, 'odalys-penhaligon-reyes-demo', 'Odalys Penhaligon-Reyes',
     'An invented author for the Akana demo. Not a real person.', 'GB', true, 'active'),
    (c_au_b, 'AU-DEM02', c_org, 'bram-okonkwo-lindqvist-demo', 'Bram Okonkwo-Lindqvist',
     'An invented author for the Akana demo. Not a real person.', 'GB', true, 'active')
  on conflict (id) do update set code = excluded.code, org_id = excluded.org_id, slug = excluded.slug,
    display_name = excluded.display_name, bio = excluded.bio, country = excluded.country,
    is_demo = true, status = 'active', user_id = null;

  -- Four books and four workbooks, one in each state the portal shows.
  for v_wb in
    select * from (values
      ('00000000-0000-0000-0000-0000000000e1'::uuid, '00000000-0000-0000-0000-0000000000f1'::uuid, 'AK-DEM01',
       'quillmoor-ten-minute-desk', 'The Quillmoor Ten-Minute Desk', 'The Ten-Minute Desk',
       'A demo workbook for small daily planning habits. Invented for show.', 'productivity', c_imp_a, c_au_a, 'live'),
      ('00000000-0000-0000-0000-0000000000e2'::uuid, '00000000-0000-0000-0000-0000000000f2'::uuid, 'AK-DEM02',
       'quillmoor-notes-on-tidy-rooms', 'Quillmoor Notes on Tidy Rooms', 'Notes on Tidy Rooms',
       'A demo workbook about keeping a home easy to live in. Invented for show.', 'life_skills', c_imp_a, c_au_a, 'paused'),
      ('00000000-0000-0000-0000-0000000000e3'::uuid, '00000000-0000-0000-0000-0000000000f3'::uuid, 'AK-DEM03',
       'quillmoor-letters-to-next-year', 'Quillmoor Letters to Next Year', 'Letters to Next Year',
       'A demo workbook for writing down what you want next year to hold. Invented for show.', 'personal_development', c_imp_b, c_au_b, 'in_review'),
      ('00000000-0000-0000-0000-0000000000e4'::uuid, '00000000-0000-0000-0000-0000000000f4'::uuid, 'AK-DEM04',
       'quillmoor-study-lanterns', 'Quillmoor Study Lanterns', 'Study Lanterns',
       'A demo workbook for steady study habits. Invented for show.', 'education', c_imp_b, c_au_b, 'draft')
    ) as x(book_id, wb_id, code, slug, title, book_title, card_line, genre, imprint, author, status)
  loop
    insert into public.books (id, org_id, slug, title, language, rights_status, publisher, is_demo, imprint_id, genre_id)
    values (v_wb.book_id, c_org, v_wb.slug || '-book', v_wb.book_title, 'en', 'own_work', 'Quillmoor Demo Press', true, v_wb.imprint, v_wb.genre)
    on conflict (id) do update set org_id = excluded.org_id, slug = excluded.slug, title = excluded.title,
      language = excluded.language, rights_status = excluded.rights_status, publisher = excluded.publisher,
      is_demo = true, imprint_id = excluded.imprint_id, genre_id = excluded.genre_id;

    delete from public.book_contributors where book_id = v_wb.book_id;
    insert into public.book_contributors (book_id, author_id, role, sort) values (v_wb.book_id, v_wb.author, 'author', 0);

    insert into public.workbooks (id, code, book_id, org_id, tenant_id, slug, title, card_line, genre_id,
                                  safety_tier, depth, badge, is_demo, status, price_point_id)
    values (v_wb.wb_id, v_wb.code, v_wb.book_id, c_org, c_tenant, v_wb.slug, v_wb.title, v_wb.card_line, v_wb.genre,
            'none', 'listing', 'demo', true, v_wb.status, null)
    on conflict (id) do update set code = excluded.code, book_id = excluded.book_id, org_id = excluded.org_id,
      tenant_id = excluded.tenant_id, slug = excluded.slug, title = excluded.title, card_line = excluded.card_line,
      genre_id = excluded.genre_id, safety_tier = excluded.safety_tier, depth = excluded.depth, badge = 'demo',
      is_demo = true, status = excluded.status, price_point_id = null;
  end loop;

  -- Workbooks a demo user added since the last reset leave the demo.
  update public.workbooks set status = 'retired'
  where org_id = c_org and status <> 'retired'
    and id not in ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2',
                   '00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f4');
  get diagnostics v_retired = row_count;

  -- The tenant (created up front by app.ensure_demo_tenant, because the
  -- workbooks above reference it), back to its demo settings and chosen look.
  update public.tenants set name = 'Quillmoor Demo Press', brand = app.demo_brand(v_look), status = 'active',
    kind = 'white_label', org_id = c_org, is_demo = true, plan = 'demo', seller_of_record = 'akana'
  where id = c_tenant;

  -- The catalogue: the demo publisher's live title first, then up to eleven
  -- live demo titles from the marketplace catalogue, in code order. Two carry
  -- their own listing price to show the setting; it is display only.
  delete from public.tenant_listings where tenant_id = c_tenant;
  insert into public.tenant_listings (tenant_id, workbook_id, visible, sort, featured, price_point_id)
  values (c_tenant, '00000000-0000-0000-0000-0000000000f1', true, 0, true, 'p2');
  insert into public.tenant_listings (tenant_id, workbook_id, visible, sort, featured, price_point_id)
  select c_tenant, w.id, true, row_number() over (order by w.code)::int, false,
         case when row_number() over (order by w.code) = 1 then 'p3' else null end
  from public.workbooks w
  where w.is_demo and w.status = 'live' and w.org_id <> c_org
  order by w.code
  limit 11;
  select count(*) into v_listed from public.tenant_listings where tenant_id = c_tenant;

  -- Members: the registered demo accounts and nobody else. Owners first, so
  -- the last-owner guard (0001) is never tripped while others leave.
  insert into public.org_members (org_id, user_id, role)
  select c_org, d.user_id, case d.kind when 'publisher' then 'owner' else 'author' end
  from public.demo_accounts d
  on conflict (org_id, user_id) do update set role = excluded.role;

  if exists (select 1 from public.demo_accounts d where d.kind = 'publisher') then
    delete from public.org_members m where m.org_id = c_org and m.user_id not in (select d.user_id from public.demo_accounts d);
  else
    delete from public.org_members m where m.org_id = c_org and m.role <> 'owner'
      and m.user_id not in (select d.user_id from public.demo_accounts d);
  end if;
  select count(*) into v_members from public.org_members where org_id = c_org;

  delete from public.tenant_members where tenant_id = c_tenant and role <> 'reader';
  insert into public.tenant_members (tenant_id, user_id, role)
  select c_tenant, d.user_id, 'tenant_admin' from public.demo_accounts d where d.kind = 'publisher'
  on conflict (tenant_id, user_id) do update set role = 'tenant_admin';

  -- The first registered demo author is the login behind Odalys's profile.
  select d.user_id into v_author from public.demo_accounts d where d.kind = 'author' order by d.created_at limit 1;
  if v_author is not null then
    update public.authors set user_id = v_author where id = c_au_a;
  end if;
  select d.user_id into v_publisher from public.demo_accounts d where d.kind = 'publisher' order by d.created_at limit 1;

  -- Demo money (0029): test-mode sales, statements and dashboard counts.
  v_money := app.rebuild_demo_money(c_org);

  perform app.audit('demo.reset', 'organisation:' || c_org::text, p_reason, c_tenant, c_org, null,
    jsonb_build_object('look', v_look, 'listed', v_listed, 'members', v_members, 'retired', v_retired, 'money', v_money));

  return jsonb_build_object('look', v_look, 'workbooks', 4, 'listed', v_listed, 'members', v_members,
                            'retired', v_retired, 'publisher_login', v_publisher is not null, 'author_login', v_author is not null,
                            'money', v_money);
end $$;
revoke execute on function app.reset_demo_state(text, text) from public, anon, authenticated;

-- ===========================================================================
-- 7. Row level security
-- ===========================================================================
alter table public.demo_royalty_lines enable row level security;
alter table public.demo_statements    enable row level security;
alter table public.demo_funnel_months enable row level security;

revoke all on public.demo_royalty_lines, public.demo_statements, public.demo_funnel_months, public.demo_royalty_balances
  from anon, authenticated;

-- The demo organisation's own members whose role may read statements, and
-- money staff, like 0021. Writes only through the reset.
grant select on public.demo_royalty_lines, public.demo_statements, public.demo_royalty_balances to authenticated;
create policy demo_royalty_lines_read on public.demo_royalty_lines for select to authenticated
  using ((select app.is_money_staff()) or (select app.org_can(org_id, 'statements', 'read')));
create policy demo_statements_read on public.demo_statements for select to authenticated
  using ((select app.is_money_staff()) or (select app.org_can(org_id, 'statements', 'read')));
-- Counts reach clients only through org_dashboard and the roll-up (0022),
-- which suppress small numbers. No direct read.

grant select on public.demo_royalty_lines, public.demo_statements, public.demo_funnel_months, public.demo_royalty_balances
  to service_role;
