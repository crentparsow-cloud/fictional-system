-- First-party analytics (0036, build list 10.4 and 13.20). Counting with a
-- unit and a daily visitor hash, uniques that do not double count, the
-- visitor prune, and the three staff reads with their role gate. Each block
-- must raise or return the expected value; a failure aborts the script.
\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('a3600000-0000-0000-0000-000000000001', 'finance36@test'),
  ('a3600000-0000-0000-0000-000000000004', 'support36@test');
insert into public.platform_roles (user_id, role) values
  ('a3600000-0000-0000-0000-000000000001', 'finance'),
  ('a3600000-0000-0000-0000-000000000004', 'support');

insert into public.organisations (id, code, kind, legal_name, display_name, slug, country, connect_status) values
  ('a3600000-0000-0000-0000-0000000000a1', 'PB-TST36', 'publisher', 'Org 36 Ltd', 'Org 36', 'org-36', 'GB', 'verified');
insert into public.books (id, org_id, slug, title, rights_status) values
  ('a3600000-0000-0000-0000-0000000000b1', 'a3600000-0000-0000-0000-0000000000a1', 'book-36', 'Book 36', 'public_domain');
insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, safety_tier, depth, status) values
  ('a3600000-0000-0000-0000-0000000000c1', 'AK-T36A0', 'a3600000-0000-0000-0000-0000000000b1', 'a3600000-0000-0000-0000-0000000000a1',
   'wb-36', 'Workbook 36', 'Card', 'productivity', 'none', 'full', 'live');
insert into public.workbook_versions (id, workbook_id, semver, content, content_hash) values
  ('a3600000-0000-0000-0000-0000000000d1', 'a3600000-0000-0000-0000-0000000000c1', '1.0.0', '{}'::jsonb, repeat('b', 64));

-- Six readers bought in the week of Monday 7 September 2026. Readers 1 to 3
-- did two steps in week 1 and one in week 2; readers 4 to 6 did one step in
-- week 1. A seventh reader bought a week earlier, alone in that cohort.
insert into auth.users (id, email)
select ('a3600000-0000-0000-0001-' || lpad(g::text, 12, '0'))::uuid, 'r' || g || '@t36' from generate_series(1, 7) g;
insert into public.purchases (id, user_id, tenant_id, workbook_id, kind, stripe_checkout_session_id, currency, amount_minor, status, paid_at)
select ('a3600000-0000-0000-0003-' || lpad(g::text, 12, '0'))::uuid, ('a3600000-0000-0000-0001-' || lpad(g::text, 12, '0'))::uuid,
       '00000000-0000-0000-0000-00000000000a', 'a3600000-0000-0000-0000-0000000000c1', 'workbook', 'cs_test_36_' || g, 'GBP', 999, 'paid',
       case when g = 7 then '2026-09-02 10:00+00'::timestamptz else '2026-09-09 10:00+00'::timestamptz end
  from generate_series(1, 7) g;
insert into public.enrolments (id, user_id, tenant_id, workbook_id, version_id)
select ('a3600000-0000-0000-0002-' || lpad(g::text, 12, '0'))::uuid, ('a3600000-0000-0000-0001-' || lpad(g::text, 12, '0'))::uuid,
       '00000000-0000-0000-0000-00000000000a', 'a3600000-0000-0000-0000-0000000000c1', 'a3600000-0000-0000-0000-0000000000d1'
  from generate_series(1, 7) g;
insert into public.progress_events (enrolment_id, kind, ref, at)
select ('a3600000-0000-0000-0002-' || lpad(g::text, 12, '0'))::uuid, 'step_done', 'ex_a', '2026-09-10 12:00+00' from generate_series(1, 6) g;
insert into public.progress_events (enrolment_id, kind, ref, at)
select ('a3600000-0000-0000-0002-' || lpad(g::text, 12, '0'))::uuid, 'step_done', 'ex_b', '2026-09-12 12:00+00' from generate_series(1, 3) g;
insert into public.progress_events (enrolment_id, kind, ref, at)
select ('a3600000-0000-0000-0002-' || lpad(g::text, 12, '0'))::uuid, 'step_done', 'ex_c', '2026-09-16 12:00+00' from generate_series(1, 3) g;
-- A step before the purchase does not count towards retention. Reader 7's
-- one step falls in the second week of the earlier cohort.
insert into public.progress_events (enrolment_id, kind, ref, at) values
  ('a3600000-0000-0000-0002-000000000001', 'step_done', 'ex_0', '2026-08-30 12:00+00'),
  ('a3600000-0000-0000-0002-000000000007', 'step_done', 'ex_a', '2026-09-10 12:00+00');
-- A check-in is not a step.
insert into public.progress_events (enrolment_id, kind, ref, at) values
  ('a3600000-0000-0000-0002-000000000001', 'checkin_done', '1', '2026-09-10 13:00+00');

-- Subscriptions, as the webhook mirrors them. s1 a trial cancelled the same
-- day; s2 an annual cancelled on day 20 after a paid invoice; s3 an annual
-- cancelled after two months; s4 a monthly still running.
insert into public.subscriptions (id, user_id, tenant_id, stripe_customer_id, stripe_subscription_id, plan, status, cancel_at_period_end, canceled_at, created_at, observed_at) values
  ('a3600000-0000-0000-0004-000000000001', 'a3600000-0000-0000-0001-000000000001', '00000000-0000-0000-0000-00000000000a', 'cus_36a', 'sub_36a', 'member_month', 'canceled', false, '2026-09-20 18:00+00', '2026-09-20 09:00+00', now()),
  ('a3600000-0000-0000-0004-000000000002', 'a3600000-0000-0000-0001-000000000002', '00000000-0000-0000-0000-00000000000a', 'cus_36b', 'sub_36b', 'member_year', 'active', true, '2026-09-25 10:00+00', '2026-09-05 10:00+00', now()),
  ('a3600000-0000-0000-0004-000000000003', 'a3600000-0000-0000-0001-000000000003', '00000000-0000-0000-0000-00000000000a', 'cus_36c', 'sub_36c', 'member_year', 'canceled', false, '2026-09-28 10:00+00', '2026-07-01 10:00+00', now()),
  ('a3600000-0000-0000-0004-000000000004', 'a3600000-0000-0000-0001-000000000004', '00000000-0000-0000-0000-00000000000a', 'cus_36d', 'sub_36d', 'member_month', 'active', false, null, '2026-09-15 10:00+00', now());
insert into public.subscription_invoices (user_id, tenant_id, stripe_invoice_id, stripe_subscription_id, status, currency, amount_minor, paid_at) values
  ('a3600000-0000-0000-0001-000000000002', '00000000-0000-0000-0000-00000000000a', 'in_36b', 'sub_36b', 'paid', 'GBP', 4900, '2026-09-05 10:01+00'),
  ('a3600000-0000-0000-0001-000000000003', '00000000-0000-0000-0000-00000000000a', 'in_36c', 'sub_36c', 'paid', 'GBP', 4900, '2026-07-01 10:01+00');

create or replace function pg_temp.as_anon() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "anon"}'::text, true);
  execute 'set local role anon';
end $$;

create or replace function pg_temp.as_service() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "service_role"}'::text, true);
  execute 'set local role service_role';
end $$;

-- ---------------------------------------------------------------------------
-- 1. Counting: the old three-argument call still works; units and visitors
-- ---------------------------------------------------------------------------
select pg_temp.as_anon();
select public.record_funnel_event('page_view', '00000000-0000-0000-0000-00000000000a');
select public.record_funnel_event('page_view', '00000000-0000-0000-0000-00000000000a', 'a3600000-0000-0000-0000-0000000000c1');
-- Two field answers in unit 2 by the same visitor hash, one by another.
select public.record_funnel_event('field_answered', '00000000-0000-0000-0000-00000000000a', 'a3600000-0000-0000-0000-0000000000c1', 2, repeat('a', 64));
select public.record_funnel_event('field_answered', '00000000-0000-0000-0000-00000000000a', 'a3600000-0000-0000-0000-0000000000c1', 2, repeat('a', 64));
select public.record_funnel_event('field_answered', '00000000-0000-0000-0000-00000000000a', 'a3600000-0000-0000-0000-0000000000c1', 2, repeat('b', 64));
select public.record_funnel_event('step_finished', '00000000-0000-0000-0000-00000000000a', 'a3600000-0000-0000-0000-0000000000c1', 2, repeat('a', 64));
do $$ begin
  begin
    perform public.record_funnel_event('answer_saved', '00000000-0000-0000-0000-00000000000a');
    raise exception 'an unknown event was counted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.record_funnel_event('page_view', '00000000-0000-0000-0000-00000000000a', null, 1000, null);
    raise exception 'a unit over 999 was counted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.record_funnel_event('page_view', '00000000-0000-0000-0000-00000000000a', null, null, 'not-a-hash');
    raise exception 'a visitor that is not a digest was counted';
  exception when invalid_parameter_value then null; end;
  begin
    perform count(*) from public.funnel_visitors;
    raise exception 'anon read visitor hashes';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

do $$
declare r record;
begin
  select n, uniques into r from public.funnel_counts
   where event = 'field_answered' and workbook_id = 'a3600000-0000-0000-0000-0000000000c1' and unit = 2;
  if r.n <> 3 then raise exception 'field_answered n should be 3, saw %', r.n; end if;
  if r.uniques <> 2 then raise exception 'field_answered uniques should be 2, saw %', r.uniques; end if;
  select n, uniques into r from public.funnel_counts where event = 'page_view' and workbook_id is null;
  if r.n <> 1 or r.uniques <> 0 then raise exception 'a count without a visitor has no uniques'; end if;
  if (select count(*) from public.funnel_visitors) <> 3 then raise exception 'expected 3 visitor rows'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The reads: finance may, support may not
-- ---------------------------------------------------------------------------
select test_as('a3600000-0000-0000-0000-000000000004', array['support']);
do $$ begin
  begin
    perform * from public.analytics_funnel(current_date - 30, current_date);
    raise exception 'support read the analytics funnel';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.analytics_retention(26);
    raise exception 'support read retention';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.analytics_membership(current_date - 30, current_date);
    raise exception 'support read membership analytics';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select test_as('a3600000-0000-0000-0000-000000000001', array['finance']);
do $$
declare r record; n bigint;
begin
  select f.n, f.uniques into r from public.analytics_funnel(current_date - 30, current_date) f
   where f.event = 'field_answered' and f.workbook_code = 'AK-T36A0' and f.unit = 2;
  if r.n <> 3 or r.uniques <> 2 then raise exception 'analytics_funnel unit row wrong: % %', r.n, r.uniques; end if;
  begin
    perform * from public.analytics_funnel(current_date - 500, current_date);
    raise exception 'an over-long range was allowed';
  exception when invalid_parameter_value then null; end;

  -- Retention: the 7 September cohort has 6 readers, 9 steps in week 1 and 3 in week 2.
  select r2.steps, r2.cohort_size into r from public.analytics_retention(104) r2
   where r2.cohort_week = '2026-09-07' and r2.week_offset = 1;
  if r.steps <> 9 or r.cohort_size <> 6 then raise exception 'week 1 should be 9 steps by 6 readers, saw % %', r.steps, r.cohort_size; end if;
  select r2.steps into n from public.analytics_retention(104) r2 where r2.cohort_week = '2026-09-07' and r2.week_offset = 2;
  if n <> 3 then raise exception 'week 2 should be 3 steps, saw %', n; end if;
  -- The lone 31 August cohort: one reader, its one step in week 2 (10 September). The step before buying is not there.
  select count(*) into n from public.analytics_retention(104) r2 where r2.cohort_week = '2026-08-31';
  if n <> 1 then raise exception 'the lone cohort should have one row, saw %', n; end if;
  select r2.steps, r2.cohort_size, r2.week_offset into r from public.analytics_retention(104) r2 where r2.cohort_week = '2026-08-31';
  if r.steps <> 1 or r.cohort_size <> 1 or r.week_offset <> 2 then raise exception 'lone cohort wrong: % %', r.steps, r.cohort_size; end if;
  begin
    perform * from public.analytics_retention(0);
    raise exception 'zero weeks was allowed';
  exception when invalid_parameter_value then null; end;

  -- Membership: September has 1 trial start (s1), 1 day-zero trial cancel, 1 first-month annual cancel (s2, not s3), 3 cancels.
  select m.n into n from public.analytics_membership('2026-09-01', '2026-09-30') m where m.metric = 'trials_started';
  if n <> 1 then raise exception 'trials_started should be 1, saw %', n; end if;
  select m.n into n from public.analytics_membership('2026-09-01', '2026-09-30') m where m.metric = 'day_zero_trial_cancels';
  if n <> 1 then raise exception 'day_zero_trial_cancels should be 1, saw %', n; end if;
  select m.n into n from public.analytics_membership('2026-09-01', '2026-09-30') m where m.metric = 'annual_first_month_cancels';
  if n <> 1 then raise exception 'annual_first_month_cancels should be 1, saw %', n; end if;
  select m.n into n from public.analytics_membership('2026-09-01', '2026-09-30') m where m.metric = 'cancels';
  if n <> 3 then raise exception 'cancels should be 3, saw %', n; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. Prune: yesterday's hashes stay, older ones go. Service role only.
-- ---------------------------------------------------------------------------
insert into public.funnel_visitors (day, event, tenant_id, visitor) values
  (current_date - 1, 'page_view', '00000000-0000-0000-0000-00000000000a', repeat('c', 64)),
  (current_date - 2, 'page_view', '00000000-0000-0000-0000-00000000000a', repeat('d', 64));
select test_as('a3600000-0000-0000-0000-000000000001', array['finance']);
do $$ begin
  begin
    perform public.prune_funnel_visitors();
    raise exception 'finance pruned visitor hashes';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select pg_temp.as_service();
do $$ begin
  if public.prune_funnel_visitors() <> 1 then raise exception 'prune should remove the two-day-old row only'; end if;
end $$;
reset role;

rollback;
\echo PASS 0036_analytics
