-- 0036 First-party analytics (build list 10.4 and 13.20, extending F-141).
--
-- What changes
--   1. public.funnel_counts learns five events (field_answered, step_finished,
--      trial_started, trial_cancelled, membership_cancelled), a nullable unit
--      number so partial answers can be read per unit (the drop-off signal),
--      and a `uniques` column: how many distinct daily visitor hashes sent
--      the event that day.
--   2. public.funnel_visitors holds the daily-rotating visitor hash for the
--      current and previous UTC day only, so a repeat event from the same
--      visitor on the same day is not counted twice as a unique. Nothing
--      reads it from a client. The daily sweep deletes rows older than
--      yesterday (public.prune_funnel_visitors).
--   3. public.record_funnel_event gains p_unit and p_visitor. The three
--      argument form is dropped so the call stays unambiguous; existing
--      callers pass the same three named arguments and get the same result.
--   4. Three read functions for the staff page at /admin/analytics, open to
--      owners, editors and finance as funnel_summary is:
--        analytics_funnel     per event, workbook and unit: n and uniques
--        analytics_retention  finished steps per week by cohort of first
--                             purchase week, with the cohort size
--        analytics_membership day-zero trial cancels and first-month annual
--                             cancels, from public.subscriptions
--
-- The identity rule. The visitor hash is sha256(salt : UTC date : subject),
-- computed in apps/web/lib/funnel.ts with LEAD_HASH_SALT. The subject is the
-- reader's user id when signed in (so the hash is an opaque reader id that is
-- never their auth id and changes every day) and the IP address with the user
-- agent when signed out. No cookie is set for it. Because the date is in the
-- hash, no two days can be joined, and the table is pruned after a day in
-- any case. Suppression below 5 is applied where counts are shown per
-- workbook or per cohort (lib/admin/analytics.ts), as elsewhere.
--
-- Nothing here stores or reads a reader answer. field_answered is a count of
-- fields saved, never a field name or a value.

-- ===========================================================================
-- 1. funnel_counts: more events, a unit, uniques
-- ===========================================================================
alter table public.funnel_counts add column if not exists unit smallint check (unit is null or unit between 1 and 999);
alter table public.funnel_counts add column if not exists uniques bigint not null default 0 check (uniques >= 0);

do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.funnel_counts'::regclass and contype in ('u', 'c')
       and (conname like '%event%' or contype = 'u')
  loop
    execute format('alter table public.funnel_counts drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.funnel_counts add constraint funnel_counts_event_check check (event in (
  'page_view','sample_view','free_week_started','checkout_started','purchase','week_completed',
  'field_answered','step_finished','trial_started','trial_cancelled','membership_cancelled'));
alter table public.funnel_counts add constraint funnel_counts_cell_key
  unique nulls not distinct (day, event, tenant_id, workbook_id, unit);

-- ===========================================================================
-- 2. funnel_visitors: today's and yesterday's hashes, nothing older
-- ===========================================================================
create table public.funnel_visitors (
  id          bigint generated always as identity primary key,
  day         date not null,
  event       text not null,
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  workbook_id uuid references public.workbooks(id) on delete cascade,
  unit        smallint check (unit is null or unit between 1 and 999),
  visitor     text not null check (visitor ~ '^[0-9a-f]{64}$'),
  unique nulls not distinct (day, event, tenant_id, workbook_id, unit, visitor)
);
create index funnel_visitors_day_idx on public.funnel_visitors(day);
alter table public.funnel_visitors enable row level security;
revoke all on public.funnel_visitors from public, anon, authenticated;

create or replace function public.prune_funnel_visitors() returns bigint
language plpgsql volatile security definer set search_path = '' as $$
declare n bigint;
begin
  delete from public.funnel_visitors where day < (now() at time zone 'utc')::date - 1;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.prune_funnel_visitors() from public, anon, authenticated;
grant execute on function public.prune_funnel_visitors() to service_role;

-- ===========================================================================
-- 3. record_funnel_event with a unit and a visitor hash
-- ===========================================================================
drop function if exists public.record_funnel_event(text, uuid, uuid);

create or replace function public.record_funnel_event(
  p_event text, p_tenant uuid, p_workbook uuid default null, p_unit int default null, p_visitor text default null
) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_day date := (now() at time zone 'utc')::date;
  v_new boolean := false;
begin
  if p_event is null or p_event not in (
    'page_view','sample_view','free_week_started','checkout_started','purchase','week_completed',
    'field_answered','step_finished','trial_started','trial_cancelled','membership_cancelled') then
    raise exception 'unknown funnel event' using errcode = 'invalid_parameter_value';
  end if;
  if p_tenant is null or not exists (select 1 from public.tenants where id = p_tenant) then
    raise exception 'unknown tenant' using errcode = 'invalid_parameter_value';
  end if;
  if p_workbook is not null and not exists (select 1 from public.workbooks where id = p_workbook) then
    raise exception 'unknown workbook' using errcode = 'invalid_parameter_value';
  end if;
  if p_unit is not null and (p_unit < 1 or p_unit > 999) then
    raise exception 'unit out of range' using errcode = 'invalid_parameter_value';
  end if;
  if p_visitor is not null and p_visitor !~ '^[0-9a-f]{64}$' then
    raise exception 'visitor must be a sha256 hex digest' using errcode = 'invalid_parameter_value';
  end if;

  if p_visitor is not null then
    insert into public.funnel_visitors (day, event, tenant_id, workbook_id, unit, visitor)
    values (v_day, p_event, p_tenant, p_workbook, p_unit, p_visitor)
    on conflict (day, event, tenant_id, workbook_id, unit, visitor) do nothing;
    v_new := found;
  end if;

  insert into public.funnel_counts (day, event, tenant_id, workbook_id, unit, n, uniques)
  values (v_day, p_event, p_tenant, p_workbook, p_unit, 1, case when v_new then 1 else 0 end)
  on conflict (day, event, tenant_id, workbook_id, unit) do update
    set n = public.funnel_counts.n + 1,
        uniques = public.funnel_counts.uniques + case when v_new then 1 else 0 end;
end $$;

revoke execute on function public.record_funnel_event(text, uuid, uuid, int, text) from public;
grant execute on function public.record_funnel_event(text, uuid, uuid, int, text) to anon, authenticated, service_role;

-- ===========================================================================
-- 4. Reads for /admin/analytics
-- ===========================================================================

-- Per event, workbook and unit between two days. Counts only.
create or replace function public.analytics_funnel(p_from date, p_to date)
returns table (event text, workbook_id uuid, workbook_code text, unit smallint, n bigint, uniques bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_platform(array['owner','editor','finance']) then
    raise exception 'only owners, editors and finance read analytics' using errcode = 'insufficient_privilege';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then
    raise exception 'a date range of up to 400 days is required' using errcode = 'invalid_parameter_value';
  end if;
  return query
    select f.event, f.workbook_id, w.code, f.unit, sum(f.n)::bigint, sum(f.uniques)::bigint
    from public.funnel_counts f left join public.workbooks w on w.id = f.workbook_id
    where f.day between p_from and p_to
    group by f.event, f.workbook_id, w.code, f.unit
    order by f.event, w.code nulls first, f.unit nulls first;
end $$;

-- Finished steps per week by cohort. A reader's cohort is the ISO week
-- (Monday, UTC) of their first paid purchase, workbook or membership. Week 1
-- is the cohort week itself. Only steps on or after the cohort week count.
-- cohort_size is the number of readers in the cohort; the page suppresses a
-- cohort smaller than 5 before it shows anything about it.
create or replace function public.analytics_retention(p_weeks int default 26)
returns table (cohort_week date, week_offset int, steps bigint, cohort_size bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_platform(array['owner','editor','finance']) then
    raise exception 'only owners, editors and finance read analytics' using errcode = 'insufficient_privilege';
  end if;
  if p_weeks is null or p_weeks < 1 or p_weeks > 104 then
    raise exception 'between 1 and 104 weeks' using errcode = 'invalid_parameter_value';
  end if;
  return query
    with firsts as (
      select p.user_id, date_trunc('week', min(p.paid_at at time zone 'utc'))::date as cw
        from public.purchases p
       where p.status = 'paid' and p.paid_at is not null
       group by p.user_id
    ),
    cohorts as (
      select * from firsts f
       where f.cw >= date_trunc('week', (now() at time zone 'utc') - (p_weeks || ' weeks')::interval)::date
    ),
    sizes as (select c.cw, count(*)::bigint as readers from cohorts c group by c.cw),
    steps as (
      select c.cw,
             (floor(extract(epoch from ((pe.at at time zone 'utc') - c.cw::timestamp)) / 604800))::int + 1 as wk,
             count(*)::bigint as n
        from cohorts c
        join public.enrolments e on e.user_id = c.user_id
        join public.progress_events pe on pe.enrolment_id = e.id
       where pe.kind = 'step_done' and (pe.at at time zone 'utc') >= c.cw::timestamp
       group by c.cw, 2
    )
    select s.cw, st.wk, st.n, s.readers
      from sizes s join steps st on st.cw = s.cw
     order by s.cw, st.wk;
end $$;

-- Membership cancels, by the day the cancel was asked for (canceled_at).
--   trials_started          subscriptions that started as a trial in the range
--                           (first observed as trialing, or with a trial_end
--                           after they began)
--   day_zero_trial_cancels  trial subscriptions cancelled within a day of
--                           starting
--   annual_first_month_cancels  member_year subscriptions cancelled within 31
--                           days of starting
--   cancels                 every cancel asked for in the range
-- public.subscriptions has no trial_end, so "was a trial" is read from the
-- row's status at the time of the cancel: a sub that is cancelled while still
-- trialing has status trialing with cancel_at_period_end, or was deleted
-- straight from trialing (status canceled, never invoiced). A row with a paid
-- invoice counts as a paid membership, not a trial.
create or replace function public.analytics_membership(p_from date, p_to date)
returns table (metric text, n bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_platform(array['owner','editor','finance']) then
    raise exception 'only owners, editors and finance read analytics' using errcode = 'insufficient_privilege';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then
    raise exception 'a date range of up to 400 days is required' using errcode = 'invalid_parameter_value';
  end if;
  return query
    with subs as (
      select s.id, s.plan, s.status, s.created_at, s.canceled_at, s.cancel_at_period_end,
             exists (select 1 from public.subscription_invoices i
                      where i.stripe_subscription_id = s.stripe_subscription_id and i.status = 'paid' and i.amount_minor > 0) as paid
        from public.subscriptions s
    ),
    cancelled as (
      select * from subs s
       where s.canceled_at is not null
         and (s.canceled_at at time zone 'utc')::date between p_from and p_to
    )
    select 'trials_started'::text, count(*)::bigint from subs s
     where (s.created_at at time zone 'utc')::date between p_from and p_to
       and (s.status = 'trialing' or (s.status = 'canceled' and not s.paid))
    union all
    select 'day_zero_trial_cancels', count(*)::bigint from cancelled c
     where not c.paid and c.canceled_at < c.created_at + interval '1 day'
    union all
    select 'annual_first_month_cancels', count(*)::bigint from cancelled c
     where c.plan = 'member_year' and c.canceled_at < c.created_at + interval '31 days'
    union all
    select 'cancels', count(*)::bigint from cancelled;
end $$;

revoke execute on function public.analytics_funnel(date, date) from public, anon;
revoke execute on function public.analytics_retention(int) from public, anon;
revoke execute on function public.analytics_membership(date, date) from public, anon;
grant execute on function public.analytics_funnel(date, date) to authenticated;
grant execute on function public.analytics_retention(int) to authenticated;
grant execute on function public.analytics_membership(date, date) to authenticated;
