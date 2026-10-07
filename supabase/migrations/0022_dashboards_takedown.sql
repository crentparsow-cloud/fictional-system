-- 0022 Dashboards, account lookup and notice and takedown (M6):
--   F-041 earnings view, F-042 privacy-safe author dashboard, F-058 publisher
--   roll-up, F-087 staff account lookup, F-123 notice and takedown.
--
-- Depends on 0001 to 0018, and on 0021 for the ledger view
-- public.royalty_title_months (applied first, by number). Same rules as
-- before: every new table has RLS on, grants to anon and authenticated are revoked and given back narrowly,
-- every function is security definer with search_path pinned to '', and
-- PostgREST reaches thin public functions. Nothing earlier is edited.
--
-- What this adds:
--   * The author dashboard (F-042). Monthly counts per workbook, never daily:
--     listing views, free weeks started, purchases, readers finishing week
--     one and readers finishing the final week. A count below the author
--     threshold already in app_config (suppression_threshold_author, seeded
--     10 in 0001) comes back as null with suppressed = true. Suppression
--     happens here, in the database, so a client never receives a small
--     number. Zero is suppressed too. There is no daily view, no reader id,
--     no answer, no check-in value and no location finer than nothing at all
--     (no location is stored).
--   * The publisher roll-up (F-058). The same counts summed per author and
--     for the whole organisation, optionally for one imprint. A sum is
--     hidden when it is under the threshold OR when any workbook inside it
--     is between 1 and the threshold less one. Without the second rule the
--     difference between a total and the workbook rows the author can see
--     would give back a hidden count.
--   * Earnings (F-041, F-058). Read from the 0021 royalty ledger through
--     the view it offers dashboards, public.royalty_title_months, in one
--     place (app.org_ledger_months). Statements and balances are read by the
--     pages directly under 0021's own RLS. Money is exact, never thresholded
--     (question D7, recommended answer).
--   * The staff account lookup (F-087). Find a reader by email. Shows account
--     status, purchases, membership, entitlements, consents and deletion
--     state. Never answers, enrolments, progress, check-ins or titles (codes
--     only, because a wellbeing title says something about the reader). A
--     reason is required and every lookup writes an audit row, found or not.
--     Sixty lookups an hour per member of staff at most.
--   * Notice and takedown (F-123). A public notice form with the DMCA
--     512(c)(3) and DSA Article 16 fields, a counter-notice (DMCA 512(g)(3)),
--     a staff queue, a decision that takes the title off sale through the
--     same pause the kill switch uses, a stored statement of reasons (DSA
--     Article 17), reinstatement, and a repeat infringer flag per
--     organisation.
--
-- What buyers keep (question D9 is open). The feature flag
-- takedown_buyers_keep_access, global, defaults to true:
--   true   the title goes off sale and out of the library and the
--          membership. Readers who bought it keep reading it (a narrow extra
--          read policy below), and keep their answers.
--   false  the same, and every per-workbook entitlement is revoked. The
--          revoked rows are recorded so a reinstatement gives them back.
-- Either way a takedown takes the title out of the membership, because the
-- membership is a way of selling it. Readers always keep their own answers
-- and their export. The flag is read when the decision is made and stored on
-- the takedown row, so changing it later does not change past takedowns.
--
-- Error codes, for the server to map:
--   AKD01  not allowed (wrong role, or not signed in)
--   AKD02  a field failed validation (the message names the field)
--   AKD29  rate limited
--   AKN01  not allowed
--   AKN02  a notice field failed validation (the message names the field)
--   AKN04  unknown notice reference, or it cannot take a counter-notice
--   AKN08  the notice or takedown is not in a state that allows this
--   AKN29  rate limited

-- ===========================================================================
-- 0. Config
-- ===========================================================================

-- D9 placeholder. Owners and safety reviewers change it in feature_flags.
insert into public.feature_flags (key, scope, enabled, reason) values
  ('takedown_buyers_keep_access', 'global', true, 'Placeholder until question D9 is answered: buyers keep access after a takedown')
on conflict (key, scope, scope_id) do nothing;

-- Takedowns in the last 12 months, not reinstated, that flag an organisation
-- as a repeat infringer for staff to review. Nothing happens automatically.
insert into public.app_config (key, value) values ('takedown_repeat_threshold', '3')
on conflict (key) do nothing;

create or replace function app.author_threshold() returns int
language sql stable security definer set search_path = '' as $$
  select greatest(1, coalesce(
    (select (value #>> '{}')::int from public.app_config where key = 'suppression_threshold_author'), 10))
$$;

create or replace function app.takedown_repeat_threshold() returns int
language sql stable security definer set search_path = '' as $$
  select greatest(1, coalesce(
    (select (value #>> '{}')::int from public.app_config where key = 'takedown_repeat_threshold'), 3))
$$;

-- ===========================================================================
-- 1. Earnings: read from the 0021 ledger
-- ===========================================================================

-- The one place this migration reads the ledger: public.royalty_title_months,
-- the per organisation, workbook, month, currency and livemode view that
-- 0021 offers to dashboards. It is security invoker, but every caller here
-- is a security definer function that checks the role first. Periods are
-- 'YYYY-MM' London months in 0021; they come out here as the first day of
-- the month. Non-workbook lines (adjustments, payouts) are on the statements
-- and the balances, which the pages read directly under 0021's RLS.
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
     and m.period >= to_char(p_from, 'YYYY-MM')
     and m.period <= to_char(p_to, 'YYYY-MM')
$$;
revoke execute on function app.org_ledger_months(uuid, date, date) from public, anon, authenticated;

-- Who reads an organisation's money: the statements permission from 0001
-- (owner, finance, author), and money staff (0021: owner and finance).
create or replace function app.can_read_earnings(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.org_can(p_org, 'statements', 'read') or app.is_platform(array['owner','finance'])
$$;

-- Who reads the counts: everyone in the organisation except viewers, and
-- the staff who read the funnel.
create or replace function app.can_read_dashboard(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_org_member(p_org, array['owner','editor','finance','author'])
      or app.is_platform(array['owner','editor','finance'])
$$;

-- Who reads the roll-up across authors: owners, editors and finance in the
-- organisation, and the same staff.
create or replace function app.can_read_rollup(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_org_member(p_org, array['owner','editor','finance'])
      or app.is_platform(array['owner','editor','finance'])
$$;

-- A month range: whole months, at most 24 of them.
create or replace function app.check_month_range(p_from date, p_to date) returns void
language plpgsql stable set search_path = '' as $$
begin
  if p_from is null or p_to is null or p_to < p_from
     or (date_trunc('month', p_to) - date_trunc('month', p_from)) > interval '730 days' then
    raise exception 'dashboard_invalid: range (whole months, up to 24)' using errcode = 'AKD02';
  end if;
end $$;

-- Earnings per month, workbook, currency and livemode (F-041). Exact.
create or replace function public.org_earnings(p_org uuid, p_from date, p_to date)
returns table (
  period               date,
  workbook_id          uuid,
  workbook_code        text,
  workbook_title       text,
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
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_org is null or not app.can_read_earnings(p_org) then
    raise exception 'not allowed to read earnings for this organisation' using errcode = 'AKD01';
  end if;
  perform app.check_month_range(p_from, p_to);
  return query
    select l.period, l.workbook_id, w.code, w.title, l.currency, l.livemode, l.units, l.gross_minor, l.tax_minor,
           l.fee_minor, l.refunded_gross_minor, l.sales_author_minor, l.refunds_author_minor, l.pool_author_minor,
           l.author_minor, l.sale_rate, l.has_placeholder_rate
      from app.org_ledger_months(p_org, p_from, p_to) l
      left join public.workbooks w on w.id = l.workbook_id
     order by l.period desc, l.livemode desc, w.code, l.currency;
end $$;

-- Earnings per author and for the whole organisation per month, for the
-- roll-up (F-058). A workbook whose book has two authors appears under each
-- of them, so author rows can add up to more than the total row. Exact.
create or replace function public.publisher_rollup_earnings(p_org uuid, p_from date, p_to date, p_imprint uuid default null)
returns table (
  period               date,
  scope                text,
  author_id            uuid,
  author_name          text,
  currency             text,
  livemode             boolean,
  units                bigint,
  author_minor         bigint,
  has_placeholder_rate boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_org is null or not (app.can_read_rollup(p_org) and app.can_read_earnings(p_org)) then
    raise exception 'not allowed to read the roll-up for this organisation' using errcode = 'AKD01';
  end if;
  perform app.check_month_range(p_from, p_to);
  if p_imprint is not null and not exists (select 1 from public.imprints i where i.id = p_imprint and i.org_id = p_org) then
    raise exception 'dashboard_invalid: imprint' using errcode = 'AKD02';
  end if;
  return query
    with l as (
      select x.period, x.workbook_id, x.currency, x.livemode, x.units, x.author_minor, x.has_placeholder_rate, w.book_id
        from app.org_ledger_months(p_org, p_from, p_to) x
        join public.workbooks w on w.id = x.workbook_id
        join public.books b on b.id = w.book_id
       where p_imprint is null or b.imprint_id = p_imprint
    ),
    by_author as (
      select l.period, 'author'::text as scope, bc.author_id, a.display_name as author_name, l.currency, l.livemode,
             sum(l.units)::bigint as units, sum(l.author_minor)::bigint as amount, bool_or(l.has_placeholder_rate) as ph
        from l
        join public.book_contributors bc on bc.book_id = l.book_id and bc.role = 'author'
        join public.authors a on a.id = bc.author_id
       group by l.period, bc.author_id, a.display_name, l.currency, l.livemode
    ),
    total as (
      select l.period, 'total'::text as scope, null::uuid as author_id, 'All authors'::text as author_name, l.currency, l.livemode,
             sum(l.units)::bigint as units, sum(l.author_minor)::bigint as amount, bool_or(l.has_placeholder_rate) as ph
        from l group by l.period, l.currency, l.livemode
    ),
    both_ as (select * from by_author union all select * from total)
    select b.period, b.scope, b.author_id, b.author_name, b.currency, b.livemode, b.units, b.amount, b.ph
      from both_ b
     order by b.period desc, b.livemode desc, b.scope, b.author_name, b.currency;
end $$;

-- ===========================================================================
-- 2. Counts for the dashboard and the roll-up
-- ===========================================================================

-- Raw monthly counts per workbook of one organisation. Internal only: no
-- client can execute it, and every public function below suppresses first.
--   listing_views       funnel page_view (respects the visitor's opt-out)
--   free_weeks_started  funnel free_week_started (the same)
--   purchases           paid single-workbook purchases, by month paid
--   finished_week_one   enrolments whose first check-in on unit 1 fell in the month
--   finished_final_week enrolments whose first 'finished' event fell in the month
-- Every workbook and metric gets a row for every month, zeros included, so
-- a missing row never says anything.
create or replace function app.dashboard_raw(p_org uuid, p_from date, p_to date)
returns table (month date, workbook_id uuid, metric text, n bigint)
language sql stable security definer set search_path = '' as $$
  with bounds as (
    select date_trunc('month', p_from)::date as first_day,
           (date_trunc('month', p_to) + interval '1 month')::date as end_day
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
     where f.workbook_id in (select id from wbs)
       and f.event in ('page_view','free_week_started')
       and f.day >= bounds.first_day and f.day < bounds.end_day
     group by 1, 2, 3
    union all
    select date_trunc('month', p.paid_at at time zone 'utc')::date, p.workbook_id, 'purchases', count(*)::bigint
      from public.purchases p, bounds
     where p.workbook_id in (select id from wbs)
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
     where (x.first_at at time zone 'utc')::date >= bounds.first_day
       and (x.first_at at time zone 'utc')::date < bounds.end_day
     group by 1, 2, 3
  )
  select months.month, wbs.id, metrics.metric, coalesce(sum(raw.n), 0)::bigint
    from months cross join wbs cross join metrics
    left join raw on raw.m = months.month and raw.wb = wbs.id and raw.metric = metrics.metric
   group by months.month, wbs.id, metrics.metric
$$;
revoke execute on function app.dashboard_raw(uuid, date, date) from public, anon, authenticated;

-- The author dashboard (F-042). n is null and suppressed is true below the
-- threshold, zero included.
create or replace function public.org_dashboard(p_org uuid, p_from date, p_to date)
returns table (
  month          date,
  workbook_id    uuid,
  workbook_code  text,
  workbook_title text,
  metric         text,
  n              bigint,
  suppressed     boolean
)
language plpgsql stable security definer set search_path = '' as $$
declare t int := app.author_threshold();
begin
  if p_org is null or not app.can_read_dashboard(p_org) then
    raise exception 'not allowed to read the dashboard for this organisation' using errcode = 'AKD01';
  end if;
  perform app.check_month_range(p_from, p_to);
  return query
    select r.month, r.workbook_id, w.code, w.title, r.metric,
           case when r.n >= t then r.n end, r.n < t
      from app.dashboard_raw(p_org, p_from, p_to) r
      join public.workbooks w on w.id = r.workbook_id
     order by r.month desc, w.code, r.metric;
end $$;

-- The publisher roll-up of counts (F-058): per author and for the whole
-- organisation, per month and metric. Hidden when the sum is under the
-- threshold, or when any workbook in it sits between 1 and the threshold
-- less one (see the header).
create or replace function public.publisher_rollup_counts(p_org uuid, p_from date, p_to date, p_imprint uuid default null)
returns table (
  month       date,
  scope       text,
  author_id   uuid,
  author_name text,
  metric      text,
  workbooks   bigint,
  n           bigint,
  suppressed  boolean
)
language plpgsql stable security definer set search_path = '' as $$
declare t int := app.author_threshold();
begin
  if p_org is null or not app.can_read_rollup(p_org) then
    raise exception 'not allowed to read the roll-up for this organisation' using errcode = 'AKD01';
  end if;
  perform app.check_month_range(p_from, p_to);
  if p_imprint is not null and not exists (select 1 from public.imprints i where i.id = p_imprint and i.org_id = p_org) then
    raise exception 'dashboard_invalid: imprint' using errcode = 'AKD02';
  end if;
  return query
    with r as (
      select x.month, x.workbook_id, x.metric, x.n, w.book_id
        from app.dashboard_raw(p_org, p_from, p_to) x
        join public.workbooks w on w.id = x.workbook_id
        join public.books b on b.id = w.book_id
       where p_imprint is null or b.imprint_id = p_imprint
    ),
    by_author as (
      select r.month, 'author'::text as scope, bc.author_id, a.display_name as author_name, r.metric,
             count(*)::bigint as workbooks, sum(r.n)::bigint as total,
             bool_or(r.n between 1 and t - 1) as small_part
        from r
        join public.book_contributors bc on bc.book_id = r.book_id and bc.role = 'author'
        join public.authors a on a.id = bc.author_id
       group by r.month, bc.author_id, a.display_name, r.metric
    ),
    total as (
      select r.month, 'total'::text as scope, null::uuid as author_id, 'All authors'::text as author_name, r.metric,
             count(*)::bigint as workbooks, sum(r.n)::bigint as total,
             bool_or(r.n between 1 and t - 1) as small_part
        from r group by r.month, r.metric
    ),
    both_ as (select * from by_author union all select * from total)
    select b.month, b.scope, b.author_id, b.author_name, b.metric, b.workbooks,
           case when b.total >= t and not b.small_part then b.total end,
           not (b.total >= t and not b.small_part)
      from both_ b
     order by b.month desc, b.scope, b.author_name, b.metric;
end $$;

-- Imprints and authors to filter by, for the roll-up page.
create or replace function public.publisher_rollup_filters(p_org uuid)
returns table (kind text, id uuid, name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_org is null or not app.can_read_rollup(p_org) then
    raise exception 'not allowed to read the roll-up for this organisation' using errcode = 'AKD01';
  end if;
  return query
    select 'imprint'::text, i.id, i.name from public.imprints i where i.org_id = p_org
    union all
    select distinct 'author'::text, a.id, a.display_name
      from public.workbooks w
      join public.book_contributors bc on bc.book_id = w.book_id and bc.role = 'author'
      join public.authors a on a.id = bc.author_id
     where w.org_id = p_org
    order by 1, 3;
end $$;

-- ===========================================================================
-- 3. Staff account lookup (F-087)
-- ===========================================================================

create or replace function app.can_lookup_accounts() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_platform(array['owner','editor','support'])
$$;

-- One lookup. Returns a jsonb document: found, user, profile, consents,
-- terms, deletion, purchases, subscriptions, entitlements and the last ten
-- lookups of this account. Nothing about enrolments, answers, progress,
-- check-ins or partners. Workbooks appear by AK code, never by title.
create or replace function app.lookup_account(p_email text, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_hash   text;
  v_user   jsonb;
  v_uid    uuid;
  v_recent int;
  v_out    jsonb;
begin
  if app.uid() is null or not app.can_lookup_accounts() then
    raise exception 'only owners, editors and support look up accounts' using errcode = 'AKD01';
  end if;
  if v_email = '' or char_length(v_email) > 254 or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'lookup_invalid: email' using errcode = 'AKD02';
  end if;
  if v_reason is null or char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception 'lookup_invalid: reason (5 to 500 characters)' using errcode = 'AKD02';
  end if;

  perform pg_advisory_xact_lock(hashtext('lookup:' || app.uid()::text));
  select count(*) into v_recent from public.audit_log
   where actor = app.uid() and action = 'account.lookup' and at > now() - interval '1 hour';
  if v_recent >= 60 then
    raise exception 'rate_limited: too many lookups this hour' using errcode = 'AKD29';
  end if;

  v_hash := encode(pg_catalog.sha256(pg_catalog.convert_to(v_email, 'UTF8')), 'hex');

  -- to_jsonb keeps this working on plain Postgres, where auth.users has only
  -- a few columns; on Supabase the sign-in and ban columns come through.
  select u.id, jsonb_build_object(
           'id', u.id,
           'email', u.email,
           'created_at', u.created_at,
           'email_confirmed_at', to_jsonb(u) -> 'email_confirmed_at',
           'last_sign_in_at', to_jsonb(u) -> 'last_sign_in_at',
           'banned_until', to_jsonb(u) -> 'banned_until',
           'staff', exists (select 1 from public.platform_roles pr where pr.user_id = u.id))
    into v_uid, v_user
    from auth.users u
   where lower(u.email::text) = v_email
   limit 1;

  perform app.audit('account.lookup',
    case when v_uid is null then 'lookup:no_match' else 'user:' || v_uid::text end,
    v_reason, null, null, null,
    jsonb_build_object('found', v_uid is not null, 'email_sha256', v_hash));

  if v_uid is null then
    return jsonb_build_object('found', false);
  end if;

  select jsonb_build_object(
    'found', true,
    'user', v_user,
    'profile', (select jsonb_build_object(
        'display_name', p.display_name, 'locale', p.locale, 'country', p.country,
        'adult_confirmed_at', p.adult_confirmed_at, 'created_at', p.created_at)
      from public.profiles p where p.user_id = v_uid),
    'consents', (select jsonb_build_object(
        'health_at', p.health_consent_at, 'health_version', p.health_consent_version,
        'faith_at', p.faith_consent_at, 'faith_version', p.faith_consent_version)
      from public.profiles p where p.user_id = v_uid),
    'terms', coalesce((select jsonb_agg(jsonb_build_object(
        'doc', t.doc, 'version', t.version, 'context', t.context, 'was_draft', t.was_draft, 'accepted_at', t.accepted_at)
        order by t.doc)
      from (select distinct on (a.doc) a.doc, a.version, a.context, a.was_draft, a.accepted_at
              from public.terms_acceptances a where a.user_id = v_uid
             order by a.doc, a.accepted_at desc, a.id desc) t), '[]'::jsonb),
    'deletion', (select jsonb_build_object(
        'requested_at', d.requested_at, 'cancel_before', d.cancel_before,
        'cancelled_at', d.cancelled_at, 'completed_at', d.completed_at, 'auth_removed_at', d.auth_removed_at,
        'state', case when d.completed_at is not null then 'completed'
                      when d.cancelled_at is not null then 'cancelled'
                      else 'pending' end)
      from public.account_deletion_requests d where d.user_id = v_uid),
    'purchases', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'kind', p.kind, 'workbook_code', w.code, 'currency', p.currency,
        'amount_minor', p.amount_minor, 'tax_minor', p.tax_minor, 'status', p.status,
        'created_at', p.created_at, 'paid_at', p.paid_at, 'refunded_at', p.refunded_at,
        'stripe_payment_intent_id', p.stripe_payment_intent_id) order by p.created_at desc)
      from public.purchases p left join public.workbooks w on w.id = p.workbook_id
     where p.user_id = v_uid), '[]'::jsonb),
    'subscriptions', coalesce((select jsonb_agg(jsonb_build_object(
        'plan', s.plan, 'status', s.status, 'current_period_end', s.current_period_end,
        'cancel_at_period_end', s.cancel_at_period_end, 'cancel_at', s.cancel_at,
        'canceled_at', s.canceled_at, 'ended_at', s.ended_at, 'past_due_since', s.past_due_since,
        'created_at', s.created_at, 'stripe_subscription_id', s.stripe_subscription_id) order by s.created_at desc)
      from public.subscriptions s where s.user_id = v_uid), '[]'::jsonb),
    'entitlements', coalesce((select jsonb_agg(jsonb_build_object(
        'workbook_code', w.code, 'source', e.source, 'status', e.status,
        'starts_at', e.starts_at, 'ends_at', e.ends_at) order by e.created_at desc)
      from public.entitlements e left join public.workbooks w on w.id = e.workbook_id
     where e.user_id = v_uid), '[]'::jsonb),
    'lookups', coalesce((select jsonb_agg(jsonb_build_object('at', l.at, 'actor_role', l.actor_role, 'reason', l.reason) order by l.at desc)
      from (select a.at, a.actor_role, a.reason from public.audit_log a
             where a.action = 'account.lookup' and a.target = 'user:' || v_uid::text
             order by a.at desc limit 10) l), '[]'::jsonb)
  ) into v_out;
  return v_out;
end $$;

create or replace function public.staff_lookup_account(p_email text, p_reason text) returns jsonb
language sql volatile security invoker set search_path = '' as $$
  select app.lookup_account(p_email, p_reason)
$$;

-- ===========================================================================
-- 4. Notice and takedown (F-123)
-- ===========================================================================

create table public.takedown_notices (
  id                  uuid primary key default gen_random_uuid(),
  reference           text not null unique check (reference ~ '^(TN|CN)-[0-9A-F]{10}$'),
  kind                text not null check (kind in ('notice','counter_notice')),
  parent_id           uuid references public.takedown_notices(id),
  basis               text not null check (basis in ('copyright','trade_mark','other_illegal')),
  name                text not null check (char_length(name) between 1 and 200),
  email               text not null check (char_length(email) between 3 and 254),
  address             text not null check (char_length(address) between 1 and 500),
  phone               text check (phone is null or char_length(phone) <= 40),
  relationship        text not null check (relationship in ('owner','agent','uploader')),
  acting_for          text check (acting_for is null or char_length(acting_for) <= 200),
  work                text check (work is null or char_length(work) <= 2000),
  location            text not null check (char_length(location) between 1 and 1000),
  explanation         text not null check (char_length(explanation) between 1 and 4000),
  good_faith          boolean not null check (good_faith),
  accurate            boolean not null check (accurate),
  jurisdiction        boolean,
  signature           text not null check (char_length(signature) between 1 and 200),
  workbook_id         uuid references public.workbooks(id),
  status              text not null default 'received' check (status in ('received','reviewing','actioned','rejected','withdrawn')),
  takedown_id         uuid,
  decided_by          uuid references auth.users(id) on delete set null,
  decided_at          timestamptz,
  decision_reason     text check (decision_reason is null or char_length(decision_reason) <= 2000),
  ip_hash             text check (ip_hash ~ '^[0-9a-f]{64}$'),
  created_at          timestamptz not null default now(),
  constraint takedown_notices_parent check ((kind = 'counter_notice') = (parent_id is not null)),
  constraint takedown_notices_counter_jurisdiction check (kind <> 'counter_notice' or jurisdiction is true),
  constraint takedown_notices_agent check (relationship <> 'agent' or acting_for is not null)
);
create index takedown_notices_status_idx on public.takedown_notices(status, created_at desc);
create index takedown_notices_ip_recent_idx on public.takedown_notices(ip_hash, created_at desc);
create index takedown_notices_workbook_idx on public.takedown_notices(workbook_id);
create index takedown_notices_parent_idx on public.takedown_notices(parent_id);

-- One row per title taken down. Only one active (not reinstated) per workbook.
create table public.takedowns (
  id                  uuid primary key default gen_random_uuid(),
  workbook_id         uuid not null references public.workbooks(id),
  org_id              uuid not null references public.organisations(id),
  notice_id           uuid not null references public.takedown_notices(id),
  prior_status        text not null,
  prior_in_membership boolean not null,
  buyers_keep_access  boolean not null,
  statement_of_reasons text not null check (char_length(statement_of_reasons) between 20 and 8000),
  taken_down_at       timestamptz not null default now(),
  taken_down_by       uuid references auth.users(id) on delete set null,
  reinstated_at       timestamptz,
  reinstated_by       uuid references auth.users(id) on delete set null,
  reinstate_reason    text check (reinstate_reason is null or char_length(reinstate_reason) <= 2000),
  constraint takedowns_reinstate_pair check ((reinstated_at is null) = (reinstate_reason is null))
);
create unique index takedowns_one_active_idx on public.takedowns(workbook_id) where reinstated_at is null;
create index takedowns_org_idx on public.takedowns(org_id, taken_down_at desc);

alter table public.takedown_notices
  add constraint takedown_notices_takedown_fk foreign key (takedown_id) references public.takedowns(id);

-- Entitlements a takedown revoked (only when buyers do not keep access), so
-- a reinstatement can give exactly those back.
create table public.takedown_revocations (
  takedown_id    uuid not null references public.takedowns(id),
  entitlement_id uuid not null references public.entitlements(id) on delete cascade,
  restored_at    timestamptz,
  primary key (takedown_id, entitlement_id)
);

-- Is there an active takedown on this workbook?
create or replace function app.workbook_taken_down(p_workbook uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.takedowns t where t.workbook_id = p_workbook and t.reinstated_at is null)
$$;

-- A buyer may still read the workbook row of a title taken down while
-- buyers keep access. has_entitlement still decides which sections open.
create or replace function app.takedown_buyer_can_read(p_workbook uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.takedowns t
    join public.workbooks w on w.id = t.workbook_id
    where t.workbook_id = p_workbook and t.reinstated_at is null and t.buyers_keep_access
      and app.has_entitlement(app.uid(), w.tenant_id, w.id))
$$;

create policy workbooks_read_takedown_buyers on public.workbooks for select to authenticated
  using ((select app.takedown_buyer_can_read(id)));

-- A title under an active takedown cannot go back on sale by any route
-- (kill switch resume, release) until it is reinstated here. Runs for every
-- caller, server code included.
create or replace function app.guard_takedown_live() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('live','approved') and new.status is distinct from old.status
     and app.workbook_taken_down(new.id) then
    raise exception 'workbook % is taken down after a notice; reinstate it from the takedown queue first', new.code
      using errcode = 'AKN08';
  end if;
  if new.in_membership and not old.in_membership and app.workbook_taken_down(new.id) then
    raise exception 'workbook % is taken down after a notice and cannot rejoin the membership', new.code
      using errcode = 'AKN08';
  end if;
  return new;
end $$;
create trigger workbooks_takedown_guard before update of status, in_membership on public.workbooks
  for each row execute function app.guard_takedown_live();

-- Find a workbook named in a notice: an AK code, or a /w/<slug> link.
create or replace function app.notice_workbook(p_location text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_code text := (regexp_match(upper(coalesce(p_location, '')), 'AK-[0-9A-HJKMNP-TV-Z]{5}'))[1];
  v_slug text := (regexp_match(lower(coalesce(p_location, '')), '/w/([a-z0-9]+(?:-[a-z0-9]+)*)'))[1];
  v_id   uuid;
begin
  if v_code is not null then
    select id into v_id from public.workbooks where code = v_code;
  end if;
  if v_id is null and v_slug is not null then
    select id into v_id from public.workbooks where slug = v_slug;
  end if;
  return v_id;
end $$;

-- Submit a notice or a counter-notice. Public: anon and signed in. Checks
-- every field, then rate limits as the leads form does (0005): 5 an hour
-- from one ip_hash, 100 an hour in total. Returns the reference.
create or replace function app.submit_takedown_notice(
  p_kind         text,
  p_basis        text,
  p_name         text,
  p_email        text,
  p_address      text,
  p_phone        text,
  p_relationship text,
  p_acting_for   text,
  p_work         text,
  p_location     text,
  p_explanation  text,
  p_good_faith   boolean,
  p_accurate     boolean,
  p_jurisdiction boolean,
  p_signature    text,
  p_parent_reference text,
  p_ip_hash      text
) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_name   text := nullif(btrim(coalesce(p_name, '')), '');
  v_email  text := lower(nullif(btrim(coalesce(p_email, '')), ''));
  v_addr   text := nullif(btrim(coalesce(p_address, '')), '');
  v_phone  text := nullif(btrim(coalesce(p_phone, '')), '');
  v_for    text := nullif(btrim(coalesce(p_acting_for, '')), '');
  v_work   text := nullif(btrim(coalesce(p_work, '')), '');
  v_loc    text := nullif(btrim(coalesce(p_location, '')), '');
  v_expl   text := nullif(btrim(coalesce(p_explanation, '')), '');
  v_sig    text := nullif(btrim(coalesce(p_signature, '')), '');
  v_basis  text := p_basis;
  v_parent public.takedown_notices%rowtype;
  v_ref    text;
  v_wb     uuid;
  v_recent int;
begin
  if p_kind is null or p_kind not in ('notice','counter_notice') then
    raise exception 'notice_invalid: kind' using errcode = 'AKN02';
  end if;
  if p_kind = 'counter_notice' then
    select * into v_parent from public.takedown_notices
     where reference = upper(btrim(coalesce(p_parent_reference, ''))) and kind = 'notice';
    if not found or v_parent.status <> 'actioned' then
      raise exception 'notice_unknown: that reference is not a notice we acted on' using errcode = 'AKN04';
    end if;
    v_basis := v_parent.basis;
    if p_relationship is distinct from 'uploader' and p_relationship is distinct from 'agent' then
      raise exception 'notice_invalid: relationship' using errcode = 'AKN02';
    end if;
    if p_jurisdiction is distinct from true then
      raise exception 'notice_invalid: jurisdiction' using errcode = 'AKN02';
    end if;
  else
    if v_basis is null or v_basis not in ('copyright','trade_mark','other_illegal') then
      raise exception 'notice_invalid: basis' using errcode = 'AKN02';
    end if;
    if p_relationship is null or p_relationship not in ('owner','agent') then
      raise exception 'notice_invalid: relationship' using errcode = 'AKN02';
    end if;
    if v_basis in ('copyright','trade_mark') and (v_work is null) then
      raise exception 'notice_invalid: work' using errcode = 'AKN02';
    end if;
  end if;

  if v_name is null or char_length(v_name) > 200 then
    raise exception 'notice_invalid: name' using errcode = 'AKN02';
  end if;
  if v_email is null or char_length(v_email) > 254 or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'notice_invalid: email' using errcode = 'AKN02';
  end if;
  if v_addr is null or char_length(v_addr) > 500 then
    raise exception 'notice_invalid: address' using errcode = 'AKN02';
  end if;
  if (v_basis = 'copyright' or p_kind = 'counter_notice') and v_phone is null then
    raise exception 'notice_invalid: phone' using errcode = 'AKN02';
  end if;
  if v_phone is not null and (char_length(v_phone) > 40 or v_phone !~ '^[0-9 +()./-]{5,40}$') then
    raise exception 'notice_invalid: phone' using errcode = 'AKN02';
  end if;
  if p_relationship = 'agent' and (v_for is null or char_length(v_for) > 200) then
    raise exception 'notice_invalid: acting_for' using errcode = 'AKN02';
  end if;
  if char_length(v_work) > 2000 then
    raise exception 'notice_invalid: work' using errcode = 'AKN02';
  end if;
  if v_loc is null or char_length(v_loc) > 1000 then
    raise exception 'notice_invalid: location' using errcode = 'AKN02';
  end if;
  if v_expl is null or char_length(v_expl) > 4000 then
    raise exception 'notice_invalid: explanation' using errcode = 'AKN02';
  end if;
  if p_good_faith is distinct from true then
    raise exception 'notice_invalid: good_faith' using errcode = 'AKN02';
  end if;
  if p_accurate is distinct from true then
    raise exception 'notice_invalid: accurate' using errcode = 'AKN02';
  end if;
  if v_sig is null or char_length(v_sig) > 200 then
    raise exception 'notice_invalid: signature' using errcode = 'AKN02';
  end if;
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'notice_invalid: ip_hash' using errcode = 'AKN02';
  end if;

  perform pg_advisory_xact_lock(hashtext('notice:' || p_ip_hash));
  select count(*) into v_recent from public.takedown_notices
   where ip_hash = p_ip_hash and created_at > now() - interval '1 hour';
  if v_recent >= 5 then
    raise exception 'rate_limited: too many notices from this address, try again later' using errcode = 'AKN29';
  end if;
  select count(*) into v_recent from public.takedown_notices where created_at > now() - interval '1 hour';
  if v_recent >= 100 then
    raise exception 'rate_limited: too many notices, try again later' using errcode = 'AKN29';
  end if;

  v_wb := case when p_kind = 'counter_notice' then v_parent.workbook_id else app.notice_workbook(v_loc) end;
  v_ref := (case when p_kind = 'counter_notice' then 'CN-' else 'TN-' end)
           || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.takedown_notices (reference, kind, parent_id, basis, name, email, address, phone, relationship,
    acting_for, work, location, explanation, good_faith, accurate, jurisdiction, signature, workbook_id, ip_hash)
  values (v_ref, p_kind, case when p_kind = 'counter_notice' then v_parent.id end, v_basis, v_name, v_email, v_addr, v_phone,
    p_relationship, v_for, v_work, v_loc, v_expl, true, true,
    case when p_kind = 'counter_notice' then true else null end, v_sig, v_wb, p_ip_hash);

  perform app.audit(case when p_kind = 'counter_notice' then 'takedown.counter_received' else 'takedown.notice_received' end,
    'notice:' || v_ref, null, null, null, null,
    jsonb_build_object('basis', v_basis, 'workbook_id', v_wb));
  return v_ref;
end $$;

create or replace function public.submit_takedown_notice(
  p_kind text, p_basis text, p_name text, p_email text, p_address text, p_phone text,
  p_relationship text, p_acting_for text, p_work text, p_location text, p_explanation text,
  p_good_faith boolean, p_accurate boolean, p_jurisdiction boolean, p_signature text,
  p_parent_reference text, p_ip_hash text
) returns text
language sql volatile security invoker set search_path = '' as $$
  select app.submit_takedown_notice(p_kind, p_basis, p_name, p_email, p_address, p_phone, p_relationship, p_acting_for,
    p_work, p_location, p_explanation, p_good_faith, p_accurate, p_jurisdiction, p_signature, p_parent_reference, p_ip_hash)
$$;

create or replace function app.can_read_takedowns() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_platform(array['owner','editor','support'])
$$;

create or replace function app.can_decide_takedowns() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_platform(array['owner','editor'])
$$;

-- Move a notice to reviewing, or mark it withdrawn by the sender.
create or replace function public.takedown_mark(p_notice uuid, p_status text, p_reason text default null) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  n public.takedown_notices%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not app.can_read_takedowns() then
    raise exception 'only owners, editors and support handle notices' using errcode = 'AKN01';
  end if;
  if p_status is null or p_status not in ('reviewing','withdrawn') then
    raise exception 'notice_invalid: status' using errcode = 'AKN02';
  end if;
  if char_length(v_reason) > 2000 then
    raise exception 'notice_invalid: reason' using errcode = 'AKN02';
  end if;
  select * into n from public.takedown_notices where id = p_notice for update;
  if not found or n.status not in ('received','reviewing') then
    raise exception 'notice is not open' using errcode = 'AKN08';
  end if;
  update public.takedown_notices
     set status = p_status,
         decided_by = case when p_status = 'withdrawn' then app.uid() else decided_by end,
         decided_at = case when p_status = 'withdrawn' then now() else decided_at end,
         decision_reason = coalesce(v_reason, decision_reason)
   where id = n.id;
  perform app.audit('takedown.' || p_status, 'notice:' || n.reference, v_reason, null, null,
    jsonb_build_object('status', n.status), jsonb_build_object('status', p_status));
  return p_status;
end $$;

-- Decide a notice. 'reject' closes it with a reason. 'action' takes the
-- workbook off sale: live becomes paused, the title leaves the membership,
-- and when buyers do not keep access every per-workbook entitlement is
-- revoked and recorded. A statement of reasons (DSA Article 17) is required
-- for an action and is kept on the takedown. A second valid notice about a
-- title already taken down joins the existing takedown.
create or replace function public.takedown_decide(
  p_notice    uuid,
  p_decision  text,
  p_reason    text,
  p_statement text default null,
  p_workbook  uuid default null
) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  n        public.takedown_notices%rowtype;
  w        public.workbooks%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_stmt   text := nullif(btrim(coalesce(p_statement, '')), '');
  v_td     uuid;
  v_keep   boolean;
  v_revoked int := 0;
begin
  if not app.can_decide_takedowns() then
    raise exception 'only owners and editors decide notices' using errcode = 'AKN01';
  end if;
  if p_decision is null or p_decision not in ('action','reject') then
    raise exception 'notice_invalid: decision' using errcode = 'AKN02';
  end if;
  if v_reason is null or char_length(v_reason) > 2000 then
    raise exception 'notice_invalid: reason' using errcode = 'AKN02';
  end if;

  select * into n from public.takedown_notices where id = p_notice for update;
  if not found or n.kind <> 'notice' or n.status not in ('received','reviewing') then
    raise exception 'notice is not open' using errcode = 'AKN08';
  end if;

  if p_decision = 'reject' then
    update public.takedown_notices
       set status = 'rejected', decided_by = app.uid(), decided_at = now(), decision_reason = v_reason
     where id = n.id;
    perform app.audit('takedown.rejected', 'notice:' || n.reference, v_reason, null, null,
      jsonb_build_object('status', n.status), jsonb_build_object('status', 'rejected'));
    return null;
  end if;

  if v_stmt is null or char_length(v_stmt) < 20 or char_length(v_stmt) > 8000 then
    raise exception 'notice_invalid: statement' using errcode = 'AKN02';
  end if;
  select * into w from public.workbooks where id = coalesce(p_workbook, n.workbook_id) for update;
  if not found then
    raise exception 'notice_invalid: workbook' using errcode = 'AKN02';
  end if;

  select t.id into v_td from public.takedowns t where t.workbook_id = w.id and t.reinstated_at is null;
  if v_td is null then
    v_keep := app.flag('takedown_buyers_keep_access', w.tenant_id, w.id);
    insert into public.takedowns (workbook_id, org_id, notice_id, prior_status, prior_in_membership, buyers_keep_access,
                                  statement_of_reasons, taken_down_by)
    values (w.id, w.org_id, n.id, w.status, w.in_membership, v_keep, v_stmt, app.uid())
    returning id into v_td;

    update public.workbooks
       set status = case when w.status = 'live' then 'paused' else w.status end,
           in_membership = false
     where id = w.id;

    if not v_keep then
      with revoked as (
        update public.entitlements e set status = 'revoked'
         where e.workbook_id = w.id and e.status = 'active'
        returning e.id
      )
      insert into public.takedown_revocations (takedown_id, entitlement_id)
      select v_td, r.id from revoked r;
      get diagnostics v_revoked = row_count;
    end if;

    perform app.audit('takedown.actioned', 'workbook:' || w.id::text, v_reason, w.tenant_id, w.org_id,
      jsonb_build_object('code', w.code, 'status', w.status, 'in_membership', w.in_membership),
      jsonb_build_object('code', w.code, 'status', case when w.status = 'live' then 'paused' else w.status end,
                         'in_membership', false, 'buyers_keep_access', v_keep, 'entitlements_revoked', v_revoked,
                         'notice', n.reference, 'takedown_id', v_td));
  else
    perform app.audit('takedown.joined', 'workbook:' || w.id::text, v_reason, w.tenant_id, w.org_id, null,
      jsonb_build_object('notice', n.reference, 'takedown_id', v_td));
  end if;

  update public.takedown_notices
     set status = 'actioned', decided_by = app.uid(), decided_at = now(), decision_reason = v_reason,
         workbook_id = w.id, takedown_id = v_td
   where id = n.id;
  return v_td;
end $$;

-- Reinstate a title: after a counter-notice that stands, or a mistake.
-- Restores the prior status (a paused title that was live goes live again),
-- the membership setting and any entitlements the takedown revoked whose
-- purchase was not refunded since.
create or replace function public.takedown_reinstate(p_takedown uuid, p_reason text, p_counter uuid default null) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  t        public.takedowns%rowtype;
  w        public.workbooks%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_status text;
  v_back   int := 0;
begin
  if not app.can_decide_takedowns() then
    raise exception 'only owners and editors reinstate a title' using errcode = 'AKN01';
  end if;
  if v_reason is null or char_length(v_reason) > 2000 then
    raise exception 'notice_invalid: reason' using errcode = 'AKN02';
  end if;
  select * into t from public.takedowns where id = p_takedown for update;
  if not found or t.reinstated_at is not null then
    raise exception 'takedown is not active' using errcode = 'AKN08';
  end if;
  if p_counter is not null and not exists (
       select 1 from public.takedown_notices c
        join public.takedown_notices p on p.id = c.parent_id
       where c.id = p_counter and c.kind = 'counter_notice' and p.takedown_id = t.id
         and c.status in ('received','reviewing')) then
    raise exception 'notice_invalid: counter' using errcode = 'AKN02';
  end if;

  update public.takedowns set reinstated_at = now(), reinstated_by = app.uid(), reinstate_reason = v_reason
   where id = t.id;

  select * into w from public.workbooks where id = t.workbook_id for update;
  v_status := case when t.prior_status = 'live' and w.status = 'paused' then 'live' else w.status end;
  update public.workbooks
     set status = v_status,
         in_membership = t.prior_in_membership and not w.is_demo
   where id = w.id;

  with back as (
    update public.entitlements e set status = 'active'
      from public.takedown_revocations r
     where r.takedown_id = t.id and r.restored_at is null and r.entitlement_id = e.id
       and e.status = 'revoked'
       and (e.purchase_id is null or exists (select 1 from public.purchases p where p.id = e.purchase_id and p.status = 'paid'))
    returning e.id
  )
  update public.takedown_revocations r set restored_at = now()
    from back where r.takedown_id = t.id and r.entitlement_id = back.id;
  get diagnostics v_back = row_count;

  if p_counter is not null then
    update public.takedown_notices
       set status = 'actioned', decided_by = app.uid(), decided_at = now(), decision_reason = v_reason, takedown_id = t.id
     where id = p_counter;
  end if;

  perform app.audit('takedown.reinstated', 'workbook:' || w.id::text, v_reason, w.tenant_id, w.org_id,
    jsonb_build_object('status', w.status, 'takedown_id', t.id),
    jsonb_build_object('status', v_status, 'in_membership', t.prior_in_membership and not w.is_demo,
                       'entitlements_restored', v_back, 'counter_notice', p_counter));
  return v_status;
end $$;

-- The staff queue: every notice with its workbook, its organisation and the
-- organisation's takedown count for the repeat infringer flag.
create or replace function public.takedown_queue()
returns table (
  id               uuid,
  reference        text,
  kind             text,
  parent_reference text,
  basis            text,
  status           text,
  name             text,
  email            text,
  address          text,
  phone            text,
  relationship     text,
  acting_for       text,
  work             text,
  location         text,
  explanation      text,
  signature        text,
  created_at       timestamptz,
  decided_at       timestamptz,
  decision_reason  text,
  workbook_id      uuid,
  workbook_code    text,
  workbook_title   text,
  workbook_status  text,
  org_id           uuid,
  org_name         text,
  takedown_id      uuid,
  takedown_active  boolean,
  buyers_keep_access boolean,
  statement_of_reasons text,
  org_takedowns_12m bigint,
  repeat_infringer boolean
)
language plpgsql stable security definer set search_path = '' as $$
declare v_t int := app.takedown_repeat_threshold();
begin
  if not app.can_read_takedowns() then
    raise exception 'only owners, editors and support read notices' using errcode = 'AKN01';
  end if;
  return query
    with counts as (
      select t.org_id, count(*)::bigint as n from public.takedowns t
       where t.reinstated_at is null and t.taken_down_at > now() - interval '12 months'
       group by t.org_id
    )
    select n.id, n.reference, n.kind, p.reference, n.basis, n.status, n.name, n.email, n.address, n.phone,
           n.relationship, n.acting_for, n.work, n.location, n.explanation, n.signature, n.created_at,
           n.decided_at, n.decision_reason, w.id, w.code, w.title, w.status, o.id, o.display_name,
           coalesce(n.takedown_id, p.takedown_id) as tid,
           td.id is not null and td.reinstated_at is null, td.buyers_keep_access, td.statement_of_reasons,
           coalesce(c.n, 0), coalesce(c.n, 0) >= v_t
      from public.takedown_notices n
      left join public.takedown_notices p on p.id = n.parent_id
      left join public.workbooks w on w.id = n.workbook_id
      left join public.organisations o on o.id = w.org_id
      left join public.takedowns td on td.id = coalesce(n.takedown_id, p.takedown_id)
      left join counts c on c.org_id = o.id
     order by (n.status in ('received','reviewing')) desc, n.created_at desc
     limit 500;
end $$;

-- What an organisation sees about takedowns of its own titles: the
-- statement of reasons and whether a counter-notice is open. Never the
-- sender's contact details.
create or replace function public.org_takedowns(p_org uuid)
returns table (
  takedown_id          uuid,
  workbook_code        text,
  workbook_title       text,
  notice_reference     text,
  basis                text,
  taken_down_at        timestamptz,
  statement_of_reasons text,
  buyers_keep_access   boolean,
  reinstated_at        timestamptz,
  counter_notice_open  boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_org is null or not (app.is_org_member(p_org) or app.can_read_takedowns()) then
    raise exception 'not allowed to read takedowns for this organisation' using errcode = 'AKN01';
  end if;
  return query
    select t.id, w.code, w.title, n.reference, n.basis, t.taken_down_at, t.statement_of_reasons,
           t.buyers_keep_access, t.reinstated_at,
           exists (select 1 from public.takedown_notices c where c.parent_id = n.id and c.status in ('received','reviewing'))
      from public.takedowns t
      join public.workbooks w on w.id = t.workbook_id
      join public.takedown_notices n on n.id = t.notice_id
     where t.org_id = p_org
     order by t.taken_down_at desc;
end $$;

-- ===========================================================================
-- 5. Row level security and grants
-- ===========================================================================
alter table public.takedown_notices     enable row level security;
alter table public.takedowns            enable row level security;
alter table public.takedown_revocations enable row level security;
revoke all on public.takedown_notices, public.takedowns, public.takedown_revocations from anon, authenticated;

-- Staff who handle notices read them. Nobody writes except through the
-- functions above. Organisations read their takedowns through
-- public.org_takedowns, which leaves out the sender's details.
grant select on public.takedown_notices, public.takedowns, public.takedown_revocations to authenticated;
grant select, insert, update on public.takedown_notices, public.takedowns, public.takedown_revocations to service_role;
create policy takedown_notices_staff_read on public.takedown_notices for select to authenticated
  using ((select app.can_read_takedowns()));
create policy takedowns_staff_read on public.takedowns for select to authenticated
  using ((select app.can_read_takedowns()));
create policy takedown_revocations_staff_read on public.takedown_revocations for select to authenticated
  using ((select app.can_read_takedowns()));

-- Internal helpers: no direct execute from clients.
revoke execute on function app.author_threshold() from public, anon;
revoke execute on function app.takedown_repeat_threshold() from public, anon;
revoke execute on function app.lookup_account(text, text) from public, anon;
revoke execute on function app.submit_takedown_notice(text, text, text, text, text, text, text, text, text, text, text, boolean, boolean, boolean, text, text, text) from public;
revoke execute on function app.notice_workbook(text) from public, anon, authenticated;
grant execute on function app.author_threshold() to authenticated, service_role;
grant execute on function app.takedown_repeat_threshold() to authenticated, service_role;
grant execute on function app.lookup_account(text, text) to authenticated;
grant execute on function app.submit_takedown_notice(text, text, text, text, text, text, text, text, text, text, text, boolean, boolean, boolean, text, text, text) to anon, authenticated, service_role;

-- Public functions: signed-in callers only, each checks the role itself.
revoke execute on function public.org_earnings(uuid, date, date) from public, anon;
revoke execute on function public.publisher_rollup_earnings(uuid, date, date, uuid) from public, anon;
revoke execute on function public.org_dashboard(uuid, date, date) from public, anon;
revoke execute on function public.publisher_rollup_counts(uuid, date, date, uuid) from public, anon;
revoke execute on function public.publisher_rollup_filters(uuid) from public, anon;
revoke execute on function public.staff_lookup_account(text, text) from public, anon;
revoke execute on function public.takedown_mark(uuid, text, text) from public, anon;
revoke execute on function public.takedown_decide(uuid, text, text, text, uuid) from public, anon;
revoke execute on function public.takedown_reinstate(uuid, text, uuid) from public, anon;
revoke execute on function public.takedown_queue() from public, anon;
revoke execute on function public.org_takedowns(uuid) from public, anon;
grant execute on function public.org_earnings(uuid, date, date) to authenticated;
grant execute on function public.publisher_rollup_earnings(uuid, date, date, uuid) to authenticated;
grant execute on function public.org_dashboard(uuid, date, date) to authenticated;
grant execute on function public.publisher_rollup_counts(uuid, date, date, uuid) to authenticated;
grant execute on function public.publisher_rollup_filters(uuid) to authenticated;
grant execute on function public.staff_lookup_account(text, text) to authenticated;
grant execute on function public.takedown_mark(uuid, text, text) to authenticated;
grant execute on function public.takedown_decide(uuid, text, text, text, uuid) to authenticated;
grant execute on function public.takedown_reinstate(uuid, text, uuid) to authenticated;
grant execute on function public.takedown_queue() to authenticated;
grant execute on function public.org_takedowns(uuid) to authenticated;

-- The public form: anyone, through the server action, which hashes the IP.
revoke execute on function public.submit_takedown_notice(text, text, text, text, text, text, text, text, text, text, text, boolean, boolean, boolean, text, text, text) from public;
grant execute on function public.submit_takedown_notice(text, text, text, text, text, text, text, text, text, text, text, boolean, boolean, boolean, text, text, text) to anon, authenticated, service_role;
