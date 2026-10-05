-- 008: owner funnel as saved views (decision: dashboard audience is both).
-- Counts only. No answers, names or emails. Any count from 1 to 4 shows as null,
-- so a small group can never be picked out.
-- The views live in a private "owner" schema. The API never exposes it, and
-- anon and authenticated readers get no access. Read them in the SQL editor.

create schema if not exists owner;
revoke all on schema owner from public, anon, authenticated;

create or replace function owner.sup(n bigint) returns bigint
language sql immutable as $$ select case when n between 1 and 4 then null else n end $$;

-- Free weeks started, readers who reached week 2, and paid orders, per week and workbook.
create or replace view owner.funnel_weekly as
with starts as (
  select date_trunc('week', started_at)::date as week, workbook_id,
         count(*) as started,
         count(*) filter (where current_week >= 2) as reached_week_2,
         count(*) filter (where current_week >= 12) as reached_week_12
  from public.enrolments group by 1, 2
), paid as (
  select date_trunc('week', o.created_at)::date as week, w as workbook_id, count(*) as orders
  from public.orders o, unnest(o.workbook_ids) w
  where o.status = 'paid' group by 1, 2
)
select coalesce(s.week, p.week) as week, coalesce(s.workbook_id, p.workbook_id) as workbook_id,
       owner.sup(coalesce(s.started, 0)) as free_weeks_started,
       owner.sup(coalesce(s.reached_week_2, 0)) as reached_week_2,
       owner.sup(coalesce(s.reached_week_12, 0)) as reached_week_12,
       owner.sup(coalesce(p.orders, 0)) as paid_orders
from starts s full join paid p on p.week = s.week and p.workbook_id = s.workbook_id
order by 1 desc, 2;

-- Paid orders and refunds by offer type and month.
create or replace view owner.orders_by_offer as
select date_trunc('month', o.created_at)::date as month, pr.kind as offer, o.currency,
       owner.sup(count(*) filter (where o.status = 'paid')) as paid,
       owner.sup(count(*) filter (where coalesce(o.refunded_minor, 0) > 0)) as refunded
from public.orders o left join public.products pr on pr.id = o.product_id
group by 1, 2, 3 order by 1 desc, 2;

-- Books tab and link clicks by title, store and placement, last 90 days.
create or replace view owner.book_clicks as
select b.book_id, b.format, b.store, b.placement, owner.sup(sum(b.clicks)) as clicks
from public.book_click_counts b
where b.day >= current_date - 90
group by 1, 2, 3, 4 order by 5 desc nulls last;

-- Readers who started a second workbook, by month of the second start.
create or replace view owner.second_workbook_starts as
with ranked as (
  select user_id, started_at, row_number() over (partition by user_id order by started_at) as n
  from public.enrolments
)
select date_trunc('month', started_at)::date as month, owner.sup(count(*)) as second_starts
from ranked where n = 2 group by 1 order by 1 desc;

-- Emails sent and failed, by kind and week.
create or replace view owner.email_weekly as
select date_trunc('week', sent_at)::date as week, kind,
       owner.sup(count(*) filter (where status = 'sent')) as sent,
       owner.sup(count(*) filter (where status <> 'sent')) as not_sent
from public.email_sends group by 1, 2 order by 1 desc, 2;

revoke all on all tables in schema owner from public, anon, authenticated;
revoke all on function owner.sup(bigint) from public, anon, authenticated;
