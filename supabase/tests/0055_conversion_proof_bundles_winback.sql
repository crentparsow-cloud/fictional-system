-- Conversion part 2 (0055): social proof only above the threshold, Theme
-- bundles that open their titles and are undone by a refund, and win-back
-- email that reaches lapsed monthly members and one-off buyers only.
-- Each block must raise or return the expected value; a failure aborts the script.
\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.as_service() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "service_role"}'::text, true);
  execute 'set local role service_role';
end $$;

-- Readers: 120 for the busy workbook, 100 exactly for the one on the line, 3 for a quiet one.
insert into auth.users (id, email)
select ('55000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'r' || g || '@proof55.test' from generate_series(1, 130) g;
insert into auth.users (id, email) values
  ('55550000-0000-0000-0000-000000000001', 'monthly55@wb.test'),
  ('55550000-0000-0000-0000-000000000002', 'yearly55@wb.test'),
  ('55550000-0000-0000-0000-000000000003', 'oneoff55@wb.test'),
  ('55550000-0000-0000-0000-000000000004', 'live55@wb.test'),
  ('55550000-0000-0000-0000-000000000005', 'optout55@wb.test'),
  ('55550000-0000-0000-0000-000000000006', 'wellbeing55@wb.test'),
  ('55550000-0000-0000-0000-000000000007', 'both55@wb.test'),
  ('55550000-0000-0000-0000-000000000008', 'recent55@wb.test'),
  ('55550000-0000-0000-0000-000000000009', 'gift55@wb.test'),
  ('55550000-0000-0000-0000-00000000000a', 'bundle55@wb.test');

insert into public.organisations (id, code, kind, legal_name, display_name, slug, country, tax_residence, stripe_connect_id, connect_status) values
  ('55550000-0000-0000-0000-0000000000b1', 'PB-TQD55', 'publisher', 'Proof One Ltd', 'Proof One', 'proof-one', 'GB', 'GB', 'acct_proof55', 'verified');
insert into public.books (id, org_id, slug, title) values
  ('55550000-0000-0000-0000-0000000000c1', '55550000-0000-0000-0000-0000000000b1', 'proof-book', 'Proof Book');
insert into public.themes (id, name, clearance_status) values ('proof-theme55', 'Proof Theme', 'cleared');
insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, depth, status, badge, theme_id, safety_tier) values
  ('55550000-0000-0000-0000-0000000000d1', 'AK-TQD56', '55550000-0000-0000-0000-0000000000c1', '55550000-0000-0000-0000-0000000000b1', 'proof-busy', 'Proof Busy', 'Card', 'productivity', 'full', 'live', 'official', 'proof-theme55', 'none'),
  ('55550000-0000-0000-0000-0000000000d2', 'AK-TQD57', '55550000-0000-0000-0000-0000000000c1', '55550000-0000-0000-0000-0000000000b1', 'proof-line', 'Proof Line', 'Card', 'productivity', 'full', 'live', 'official', 'proof-theme55', 'none'),
  ('55550000-0000-0000-0000-0000000000d3', 'AK-TQD58', '55550000-0000-0000-0000-0000000000c1', '55550000-0000-0000-0000-0000000000b1', 'proof-quiet', 'Proof Quiet', 'Card', 'productivity', 'full', 'live', 'official', 'proof-theme55', 'none'),
  ('55550000-0000-0000-0000-0000000000d4', 'AK-TQD59', '55550000-0000-0000-0000-0000000000c1', '55550000-0000-0000-0000-0000000000b1', 'proof-wellbeing', 'Proof Wellbeing', 'Card', 'productivity', 'full', 'live', 'official', 'proof-theme55', 'standard');
insert into public.workbook_versions (id, workbook_id, semver, content, content_hash)
select ('55550000-0000-0000-0000-0000000000e' || g)::uuid, ('55550000-0000-0000-0000-0000000000d' || g)::uuid, '1.0.0', '{}'::jsonb, repeat('0', 64) from generate_series(1, 4) g;

-- 120 readers on busy, 100 on the line, 3 on quiet, 130 on wellbeing.
insert into public.enrolments (user_id, tenant_id, workbook_id, version_id)
select ('55000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, '00000000-0000-0000-0000-00000000000a',
       '55550000-0000-0000-0000-0000000000d1', '55550000-0000-0000-0000-0000000000e1' from generate_series(1, 120) g;
insert into public.enrolments (user_id, tenant_id, workbook_id, version_id)
select ('55000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, '00000000-0000-0000-0000-00000000000a',
       '55550000-0000-0000-0000-0000000000d2', '55550000-0000-0000-0000-0000000000e2' from generate_series(1, 100) g;
insert into public.enrolments (user_id, tenant_id, workbook_id, version_id)
select ('55000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, '00000000-0000-0000-0000-00000000000a',
       '55550000-0000-0000-0000-0000000000d3', '55550000-0000-0000-0000-0000000000e3' from generate_series(1, 3) g;
insert into public.enrolments (user_id, tenant_id, workbook_id, version_id)
select ('55000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, '00000000-0000-0000-0000-00000000000a',
       '55550000-0000-0000-0000-0000000000d4', '55550000-0000-0000-0000-0000000000e4' from generate_series(1, 130) g;

-- 1. Social proof: strictly above 100, never wellbeing, and removed when it falls.
select pg_temp.as_service();
do $$ begin
  perform public.refresh_social_proof();
end $$;
reset role;
do $$ begin
  if (select readers from public.social_proof_counts where workbook_id = '55550000-0000-0000-0000-0000000000d1') <> 120 then raise exception 'busy'; end if;
  if exists (select 1 from public.social_proof_counts where workbook_id = '55550000-0000-0000-0000-0000000000d2') then raise exception 'exactly 100 must not show'; end if;
  if exists (select 1 from public.social_proof_counts where workbook_id = '55550000-0000-0000-0000-0000000000d3') then raise exception 'a quiet title showed'; end if;
  if exists (select 1 from public.social_proof_counts where workbook_id = '55550000-0000-0000-0000-0000000000d4') then raise exception 'a wellbeing title showed'; end if;
  if (select readers from public.social_proof_counts where scope = 'readers_total') <> 130 then raise exception 'total readers: %', (select readers from public.social_proof_counts where scope = 'readers_total'); end if;
end $$;
delete from public.enrolments where workbook_id = '55550000-0000-0000-0000-0000000000d1' and user_id in
  (select user_id from public.enrolments where workbook_id = '55550000-0000-0000-0000-0000000000d1' limit 25);
select pg_temp.as_service();
do $$ begin perform public.refresh_social_proof(); end $$;
reset role;
do $$ begin
  if exists (select 1 from public.social_proof_counts where workbook_id = '55550000-0000-0000-0000-0000000000d1') then raise exception 'a count that fell to 95 stayed'; end if;
end $$;
-- Readable by anyone, writable by no reader.
set local role anon;
do $$ begin
  perform 1 from public.social_proof_counts;
  begin
    perform public.refresh_social_proof();
    raise exception 'anon refreshed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- 2. Bundles: a price, a payment, three titles, and a refund that undoes it.
insert into public.theme_bundles (theme_id, amounts, active) values ('proof-theme55', '{"GBP": 2499}'::jsonb, true);
do $$ begin
  begin
    insert into public.theme_bundles (theme_id, amounts, active) values ('proof-theme55', '{"GBP": 1}'::jsonb, true);
    raise exception 'duplicate bundle';
  exception when unique_violation then null; end;
end $$;
select test_as('55550000-0000-0000-0000-00000000000a');
do $$ begin
  if (select count(*) from public.theme_bundles) <> 1 then raise exception 'the bundle price should be public'; end if;
  begin
    perform public.bundle_create('00000000-0000-0000-0000-00000000000a', '55550000-0000-0000-0000-00000000000a', 'proof-theme55',
      array['55550000-0000-0000-0000-0000000000d1', '55550000-0000-0000-0000-0000000000d2']::uuid[], 'cs_b55', 'GBP', 2499);
    raise exception 'a reader created a bundle purchase';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.theme_bundles set active = false where theme_id = 'proof-theme55';
set local role anon;
do $$ begin
  if (select count(*) from public.theme_bundles) <> 0 then raise exception 'an inactive bundle price was public'; end if;
end $$;
reset role;

select pg_temp.as_service();
do $$ declare r jsonb; begin
  perform public.bundle_create('00000000-0000-0000-0000-00000000000a', '55550000-0000-0000-0000-00000000000a', 'proof-theme55',
    array['55550000-0000-0000-0000-0000000000d1', '55550000-0000-0000-0000-0000000000d2', '55550000-0000-0000-0000-0000000000d3']::uuid[], 'cs_b55', 'GBP', 2499);
  -- the buyer already owns one title another way
  insert into public.entitlements (user_id, tenant_id, workbook_id, source, status) values
    ('55550000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', '55550000-0000-0000-0000-0000000000d3', 'purchase', 'active');
  r := public.bundle_mark_paid('cs_b55', 'pi_b55', 2499, 0);
  if not (r ->> 'changed')::boolean or (r ->> 'titles')::int <> 3 then raise exception 'bundle paid: %', r; end if;
  if (public.bundle_mark_paid('cs_b55', 'pi_b55', 2499, 0) ->> 'changed')::boolean then raise exception 'paid twice'; end if;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.entitlements where user_id = '55550000-0000-0000-0000-00000000000a' and source = 'purchase' and status = 'active') <> 3 then
    raise exception 'three titles should be open';
  end if;
end $$;
select pg_temp.as_service();
do $$ declare r jsonb; begin
  r := public.bundle_refund('pi_b55');
  if (r ->> 'revoked')::int <> 2 then raise exception 'refund should revoke the two bundle titles: %', r; end if;
  if (public.bundle_refund('pi_b55') ->> 'changed')::boolean then raise exception 'refunded twice'; end if;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.entitlements where user_id = '55550000-0000-0000-0000-00000000000a' and source = 'purchase' and status = 'active') <> 1 then
    raise exception 'the title owned another way should stay';
  end if;
end $$;

-- 3. Win-back. Build the cast with the service role.
select pg_temp.as_service();
do $$ begin
  perform public.upsert_subscription('sub_wbmonthly', 'cus_wb1', '55550000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
    'canceled', 'member_month', 'price_m', null, false, null, now() - interval '60 days', now() - interval '60 days', now());
  perform public.upsert_subscription('sub_wbyearly', 'cus_wb2', '55550000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a',
    'canceled', 'member_year', 'price_y', null, false, null, now() - interval '60 days', now() - interval '60 days', now());
  perform public.upsert_subscription('sub_wblive', 'cus_wb4', '55550000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000a',
    'active', 'member_month', 'price_m', now() + interval '10 days', false, null, null, null, now());
  perform public.upsert_subscription('sub_wboptout', 'cus_wb5', '55550000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000a',
    'canceled', 'member_month', 'price_m', null, false, null, now() - interval '60 days', now() - interval '60 days', now());
  perform public.upsert_subscription('sub_wbboth', 'cus_wb7', '55550000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-00000000000a',
    'canceled', 'member_month', 'price_m', null, false, null, now() - interval '70 days', now() - interval '70 days', now());
  perform public.upsert_subscription('sub_wbbothx', 'cus_wb7', '55550000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-00000000000a',
    'canceled', 'member_year', 'price_y', null, false, null, now() - interval '300 days', now() - interval '200 days', now());
  perform public.upsert_subscription('sub_wbrecent', 'cus_wb8', '55550000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-00000000000a',
    'canceled', 'member_month', 'price_m', null, false, null, now() - interval '5 days', now() - interval '5 days', now());
  perform public.upsert_subscription('sub_wbwb', 'cus_wb6', '55550000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-00000000000a',
    'canceled', 'member_month', 'price_m', null, false, null, now() - interval '60 days', now() - interval '60 days', now());
end $$;
reset role;
insert into public.purchases (user_id, tenant_id, workbook_id, kind, stripe_checkout_session_id, currency, amount_minor, status, paid_at) values
  ('55550000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000a', '55550000-0000-0000-0000-0000000000d3', 'workbook', 'cs_wb_oneoff', 'GBP', 999, 'paid', now() - interval '90 days'),
  ('55550000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-00000000000a', '55550000-0000-0000-0000-0000000000d3', 'workbook', 'cs_wb_gift', 'GBP', 999, 'paid', now() - interval '90 days');
insert into public.entitlements (user_id, tenant_id, workbook_id, source, status, ends_at) values
  ('55550000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-00000000000a', null, 'gift', 'active', now() + interval '20 days');
insert into public.enrolments (user_id, tenant_id, workbook_id, version_id) values
  ('55550000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-00000000000a', '55550000-0000-0000-0000-0000000000d4', '55550000-0000-0000-0000-0000000000e4');
insert into public.marketing_optouts (user_id) values ('55550000-0000-0000-0000-000000000005');

select pg_temp.as_service();
create temp table wb_due on commit drop as select * from public.due_winback(now(), '2026-autumn', 50);
reset role;
do $$ declare n int; begin
  select count(*) into n from wb_due;
  if (select kind from wb_due where user_id = '55550000-0000-0000-0000-000000000001') <> 'monthly' then raise exception 'lapsed monthly member missing'; end if;
  if (select kind from wb_due where user_id = '55550000-0000-0000-0000-000000000003') <> 'one_off' then raise exception 'one-off buyer missing'; end if;
  if exists (select 1 from wb_due where user_id = '55550000-0000-0000-0000-000000000002') then raise exception 'lapsed annual member listed'; end if;
  if exists (select 1 from wb_due where user_id = '55550000-0000-0000-0000-000000000007') then raise exception 'someone who once held a yearly plan was listed'; end if;
  if exists (select 1 from wb_due where user_id = '55550000-0000-0000-0000-000000000004') then raise exception 'a live member was listed'; end if;
  if exists (select 1 from wb_due where user_id = '55550000-0000-0000-0000-000000000005') then raise exception 'an opt-out was listed'; end if;
  if exists (select 1 from wb_due where user_id = '55550000-0000-0000-0000-000000000006') then raise exception 'a wellbeing reader was listed'; end if;
  if exists (select 1 from wb_due where user_id = '55550000-0000-0000-0000-000000000008') then raise exception 'a lapse of five days was listed'; end if;
  if exists (select 1 from wb_due where user_id = '55550000-0000-0000-0000-000000000009') then raise exception 'a gifted member was listed'; end if;
  if n <> 2 then raise exception 'expected exactly two, got %', n; end if;
end $$;

-- One per season: claim, and the same reader is gone from the list; a new season brings them back.
select pg_temp.as_service();
do $$ begin
  if not public.winback_claim('55550000-0000-0000-0000-000000000001', 'monthly', '2026-autumn', repeat('1', 64)) then raise exception 'claim'; end if;
  if public.winback_claim('55550000-0000-0000-0000-000000000001', 'monthly', '2026-autumn', repeat('2', 64)) then raise exception 'second claim in a season'; end if;
  if exists (select 1 from public.due_winback(now(), '2026-autumn', 50) where user_id = '55550000-0000-0000-0000-000000000001') then raise exception 'listed twice in a season'; end if;
  if not exists (select 1 from public.due_winback(now(), '2026-winter', 50) where user_id = '55550000-0000-0000-0000-000000000001') then raise exception 'not back next season'; end if;
  if not public.winback_release('55550000-0000-0000-0000-000000000001', '2026-autumn') then raise exception 'release'; end if;
  if not exists (select 1 from public.due_winback(now(), '2026-autumn', 50) where user_id = '55550000-0000-0000-0000-000000000001') then raise exception 'a failed send should be retried'; end if;
  perform public.winback_claim('55550000-0000-0000-0000-000000000001', 'monthly', '2026-autumn', repeat('1', 64));
  -- the limit holds
  if (select count(*) from public.due_winback(now(), '2026-spring', 1)) <> 1 then raise exception 'limit'; end if;
end $$;
reset role;

-- The unsubscribe link needs no sign-in and only works with a real token.
set local role anon;
do $$ begin
  if public.marketing_unsubscribe(repeat('9', 64)) then raise exception 'unknown token accepted'; end if;
  if public.marketing_unsubscribe('short') then raise exception 'malformed token accepted'; end if;
  if not public.marketing_unsubscribe(repeat('1', 64)) then raise exception 'unsubscribe'; end if;
  if not public.marketing_unsubscribe(repeat('1', 64)) then raise exception 'unsubscribe twice'; end if;
  begin
    perform * from public.due_winback(now(), '2026-autumn', 5);
    raise exception 'anon listed win-back email';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select pg_temp.as_service();
do $$ begin
  if exists (select 1 from public.due_winback(now(), '2026-winter', 50) where user_id = '55550000-0000-0000-0000-000000000001') then raise exception 'listed after unsubscribing'; end if;
end $$;
reset role;

rollback;
