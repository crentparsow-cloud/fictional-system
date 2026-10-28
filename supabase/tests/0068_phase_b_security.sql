-- Phase B security fixes (0068). Each block raises unless the fix holds. On the
-- code before 0068 these fail: a reader could verify their own student price,
-- a church band had 10,000 seats, a send told a member who had paid, a
-- refunded first payment kept its referral reward, a reopened title stayed
-- open after a bundle refund, rail_signals and title requests were open to
-- readers, and a "finished" event alone made a certificate.
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('68680000-0000-0000-0000-000000000001', 'student68@uni.ac.uk'),
  ('68680000-0000-0000-0000-000000000002', 'giver68@test'),
  ('68680000-0000-0000-0000-000000000003', 'payer68@test'),
  ('68680000-0000-0000-0000-000000000004', 'friend68@test'),
  ('68680000-0000-0000-0000-000000000005', 'referrer68@test'),
  ('68680000-0000-0000-0000-000000000006', 'vicar68@church68.example'),
  ('68680000-0000-0000-0000-000000000007', 'editor68@akana.example'),
  ('68680000-0000-0000-0000-000000000008', 'friend68b@test'),
  ('68680000-0000-0000-0000-000000000009', 'friend68c@test');
insert into public.profiles (user_id)
select ('68680000-0000-0000-0000-00000000000' || n)::uuid from generate_series(1, 9) n on conflict do nothing;
insert into public.platform_roles (user_id, role) values ('68680000-0000-0000-0000-000000000007', 'editor');

insert into public.organisations (id, kind, legal_name, display_name, slug, country) values
  ('68680000-0000-0000-0000-0000000000a1', 'publisher', 'Pub 68 Ltd', 'Pub 68', 'pub-68', 'GB');
insert into public.books (id, org_id, slug, title) values
  ('68680000-0000-0000-0000-0000000000b1', '68680000-0000-0000-0000-0000000000a1', 'book-68', 'Book 68');
insert into public.themes (id, name, clearance_status) values ('theme68', 'Theme 68', 'cleared');
insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, depth, status, badge, safety_tier, theme_id) values
  ('68680000-0000-0000-0000-0000000000c1', 'AK-T68A0', '68680000-0000-0000-0000-0000000000b1', '68680000-0000-0000-0000-0000000000a1',
   'wb-68a', 'Workbook 68 A', 'Card', 'productivity', 'full', 'live', 'official', 'none', 'theme68'),
  ('68680000-0000-0000-0000-0000000000c2', 'AK-T68B0', '68680000-0000-0000-0000-0000000000b1', '68680000-0000-0000-0000-0000000000a1',
   'wb-68b', 'Workbook 68 B', 'Card', 'productivity', 'full', 'live', 'official', 'none', 'theme68');
insert into public.workbook_versions (id, workbook_id, semver, content, content_hash) values
  ('68680000-0000-0000-0000-0000000000d1', '68680000-0000-0000-0000-0000000000c1', '1.0.0',
   '{"units": [{"number": 1, "exercise_ids": ["ex_one"]}, {"number": 2, "exercise_ids": ["ex_two", "ex_three"]}]}'::jsonb, repeat('d', 64));

insert into public.subscriptions (user_id, tenant_id, stripe_customer_id, stripe_subscription_id, plan, status, observed_at) values
  ('68680000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'cus_68g', 'sub_68g', 'member_month', 'active', now()),
  ('68680000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000a', 'cus_68p', 'sub_68p', 'member_month', 'active', now());

create or replace function pg_temp.as_service() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "service_role"}'::text, true);
  execute 'set local role service_role';
end $$;
create or replace function pg_temp.as_anon() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "anon"}'::text, true);
  execute 'set local role anon';
end $$;
create or replace function pg_temp.h(p text) returns text language sql as $$ select md5(p) || md5(p || 'x') $$;

-- ---------------------------------------------------------------------------
-- 1. Student price: readers cannot ask or confirm with hashes they choose.
-- ---------------------------------------------------------------------------
select test_as('68680000-0000-0000-0000-000000000001');
do $$ begin
  begin perform public.student_request(repeat('a', 64), 'uni.ac.uk', repeat('b', 64));
    raise exception 'a reader asked with a chosen hash'; exception when insufficient_privilege then null; end;
  begin perform public.student_verify(repeat('b', 64));
    raise exception 'a reader verified with a chosen hash'; exception when insufficient_privilege then null; end;
  begin perform public.student_request_for('68680000-0000-0000-0000-000000000001', 'student68@uni.ac.uk', repeat('t', 40));
    raise exception 'a reader called the server function'; exception when insufficient_privilege then null; end;
  begin perform public.student_verify_for('68680000-0000-0000-0000-000000000001', repeat('t', 40));
    raise exception 'a reader called the server confirm'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select pg_temp.as_service();
do $$ begin
  begin perform public.student_request_for('68680000-0000-0000-0000-000000000001', 'not an address', repeat('t', 40));
    raise exception 'a bad address was accepted'; exception when sqlstate 'AKX24' then null; end;
  begin perform public.student_request_for('68680000-0000-0000-0000-000000000001', 'student68@uni.ac.uk', 'short');
    raise exception 'a short token was accepted'; exception when sqlstate 'AKX24' then null; end;
  perform public.student_request_for('68680000-0000-0000-0000-000000000001', ' Student68@Uni.ac.uk ', repeat('t', 40));
end $$;
reset role;
do $$ begin
  -- The hashes are the database's own: SHA-256 of the raw token and the lower-case address.
  if (select token_hash from public.student_verifications where user_id = '68680000-0000-0000-0000-000000000001')
     <> encode(sha256(convert_to(repeat('t', 40), 'UTF8')), 'hex') then raise exception 'token hash'; end if;
  if (select email_hash || '/' || email_domain from public.student_verifications where user_id = '68680000-0000-0000-0000-000000000001')
     <> encode(sha256(convert_to('student68@uni.ac.uk', 'UTF8')), 'hex') || '/uni.ac.uk' then raise exception 'email hash or domain'; end if;
end $$;
select pg_temp.as_service();
do $$ begin
  if public.student_verify_for('68680000-0000-0000-0000-000000000002', repeat('t', 40)) <> 'invalid' then raise exception 'another reader used the link'; end if;
  if public.student_verify_for('68680000-0000-0000-0000-000000000001', repeat('t', 40)) <> 'verified' then raise exception 'verify'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 2. Church bands: seats are the band's upper bound; the standing link follows the licence.
-- ---------------------------------------------------------------------------
update public.feature_flags set enabled = true where key = 'org_self_serve' and scope = 'global';
create table public.t68_ids (key_name text primary key, v uuid);
grant all on public.t68_ids to service_role, authenticated;
select pg_temp.as_service();
do $$ declare v uuid; begin
  v := public.org_self_serve_provision('68680000-0000-0000-0000-000000000006', 'church_band_1', 'church', 'St Small 68', 'GB', null, 'sub_C68a', 1);
  if (select seats_purchased from public.org_licences where id = v) <> 50 then raise exception 'band 1 should have 50 seats'; end if;
  insert into public.t68_ids values ('lic', v);
  v := public.org_self_serve_provision('68680000-0000-0000-0000-000000000006', 'church_band_2', 'church', 'St Mid 68', 'GB', null, 'sub_C68b', 1);
  if (select seats_purchased from public.org_licences where id = v) <> 150 then raise exception 'band 2 should have 150 seats'; end if;
  v := public.org_self_serve_provision('68680000-0000-0000-0000-000000000006', 'church_band_4', 'church', 'St Big 68', 'GB', null, 'sub_C68d', 1);
  if (select seats_purchased from public.org_licences where id = v) <> 1000 then raise exception 'band 4 should have 1000 seats'; end if;
end $$;
reset role;
-- The fourth band's cap is configurable.
update public.app_config set value = '1500' where key = 'org_church_band_4_seats';
do $$ begin
  if app.org_band_seats('church_band_4') <> 1500 then raise exception 'band 4 cap should follow the config'; end if;
end $$;
-- The mirror sets the licence end from the subscription period.
select pg_temp.as_service();
do $$ begin
  perform public.org_billing_apply('sub_C68a', 'cus_C68a', null, 'active', 'church_band_1', 'price_c68', 1, 'charge_automatically', null,
    now() - interval '1 day', now() + interval '364 days', false, null, null, null, false, now());
end $$;
reset role;
select test_as('68680000-0000-0000-0000-000000000006');
do $$ declare k uuid; begin
  k := public.org_standing_link_rotate((select v from public.t68_ids where key_name = 'lic'), pg_temp.h('standing68'));
  insert into public.t68_ids values ('link', k);
end $$;
reset role;
do $$ declare k public.org_join_links; l public.org_licences; begin
  select * into k from public.org_join_links where id = (select v from public.t68_ids where key_name = 'link');
  select * into l from public.org_licences where id = (select v from public.t68_ids where key_name = 'lic');
  if k.max_uses <> 50 then raise exception 'the standing link should allow 50 uses, has %', k.max_uses; end if;
  if k.expires_at <> l.ends_at or k.expires_at > now() + interval '400 days' then raise exception 'the standing link should end with the licence'; end if;
end $$;
-- Staff raise the seats in the admin console; the link follows.
select test_as('68680000-0000-0000-0000-000000000007', array['editor']);
do $$ declare l public.org_licences; begin
  select * into l from public.org_licences where id = (select v from public.t68_ids where key_name = 'lic');
  perform public.org_licence_update(l.id, 80, l.starts_at, l.ends_at, null, 'active', 'Congregation grew');
end $$;
reset role;
do $$ begin
  if (select max_uses from public.org_join_links where id = (select v from public.t68_ids where key_name = 'link')) <> 80 then
    raise exception 'the link should follow the raised seats';
  end if;
end $$;
-- A renewal moves the link's end; the end of the licence closes it.
select pg_temp.as_service();
do $$ begin
  perform public.org_billing_apply('sub_C68a', 'cus_C68a', null, 'active', 'church_band_1', 'price_c68', 1, 'charge_automatically', null,
    now(), now() + interval '729 days', false, null, null, null, false, now() + interval '1 second');
end $$;
reset role;
do $$ begin
  if (select seats_purchased from public.org_licences where id = (select v from public.t68_ids where key_name = 'lic')) <> 80 then
    raise exception 'the billing mirror should keep the seats staff set';
  end if;
  if (select expires_at from public.org_join_links where id = (select v from public.t68_ids where key_name = 'link')) < now() + interval '700 days' then
    raise exception 'the link should follow the renewal';
  end if;
end $$;
select pg_temp.as_service();
do $$ begin
  perform public.org_billing_apply('sub_C68a', 'cus_C68a', null, 'canceled', 'church_band_1', 'price_c68', 1, 'charge_automatically', null,
    now(), now() + interval '729 days', false, null, now(), now(), false, now() + interval '2 seconds');
end $$;
reset role;
do $$ begin
  if (select revoked_at from public.org_join_links where id = (select v from public.t68_ids where key_name = 'link')) is null then
    raise exception 'the link should close with the licence';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Send this workbook: one answer for every address, eligibility at the claim.
-- ---------------------------------------------------------------------------
insert into public.entitlements (user_id, tenant_id, workbook_id, source, status) values
  ('68680000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-00000000000a', '68680000-0000-0000-0000-0000000000c1', 'purchase', 'active');
select test_as('68680000-0000-0000-0000-000000000002');
do $$ begin
  begin perform * from public.gift_send('68680000-0000-0000-0000-0000000000c1', 'payer68@test', pg_temp.h('g0'));
    raise exception 'a reader called the send directly'; exception when insufficient_privilege then null; end;
  begin perform * from public.gift_send_for('68680000-0000-0000-0000-000000000002', '68680000-0000-0000-0000-0000000000c1', 'payer68@test', pg_temp.h('g0'));
    raise exception 'a reader called the server send'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select pg_temp.as_service();
do $$ declare r record; begin
  -- A payer's address gets the same answer as anyone's.
  select * into r from public.gift_send_for('68680000-0000-0000-0000-000000000002', '68680000-0000-0000-0000-0000000000c1', 'payer68@test', pg_temp.h('g1'));
  if r.status <> 'sent' or r.gift_id is null then raise exception 'the send should not say who has paid: %', r.status; end if;
  -- The payer claims: refused with a neutral answer, and the slot goes back.
  if public.gift_claim('68680000-0000-0000-0000-000000000003', pg_temp.h('g1'), false) <> 'not_eligible' then raise exception 'a payer claimed'; end if;
  if (select status from public.workbook_gifts where token_hash = pg_temp.h('g1')) <> 'returned' then raise exception 'the slot should go back'; end if;
  -- So the giver can send again this quarter; to someone who holds the workbook, the same answer.
  select * into r from public.gift_send_for('68680000-0000-0000-0000-000000000002', '68680000-0000-0000-0000-0000000000c1', 'friend68b@test', pg_temp.h('g2'));
  if r.status <> 'sent' then raise exception 'the returned slot should be usable: %', r.status; end if;
  if public.gift_claim('68680000-0000-0000-0000-000000000008', pg_temp.h('g2'), false) <> 'not_eligible' then raise exception 'a holder claimed'; end if;
  if (select status from public.workbook_gifts where token_hash = pg_temp.h('g2')) <> 'returned' then raise exception 'holder slot should go back'; end if;
  -- A forwarded link claimed by someone else who is not eligible leaves the gift waiting.
  select * into r from public.gift_send_for('68680000-0000-0000-0000-000000000002', '68680000-0000-0000-0000-0000000000c1', 'friend68@test', pg_temp.h('g3'));
  if r.status <> 'sent' then raise exception 'third send (still within the day): %', r.status; end if;
  if public.gift_claim('68680000-0000-0000-0000-000000000003', pg_temp.h('g3'), false) <> 'not_eligible' then raise exception 'payer claimed a forwarded link'; end if;
  if (select status from public.workbook_gifts where token_hash = pg_temp.h('g3')) <> 'sent' then raise exception 'a forwarded link should not cost the recipient the gift'; end if;
  -- The daily limit: three sends a day, whatever happened to them.
  update public.workbook_gifts set status = 'cancelled' where token_hash = pg_temp.h('g3');
  select * into r from public.gift_send_for('68680000-0000-0000-0000-000000000002', '68680000-0000-0000-0000-0000000000c1', 'friend68c@test', pg_temp.h('g4'));
  if r.status <> 'busy' then raise exception 'a fourth send in a day: %', r.status; end if;
end $$;
reset role;
select test_as('68680000-0000-0000-0000-000000000003');
do $$ begin
  if (select can_claim from public.workbook_gift_preview(pg_temp.h('g3'))) then raise exception 'preview offered a claim to a payer'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. Referral rewards: disputes, retries and reversals.
-- ---------------------------------------------------------------------------
insert into public.referrals (id, referrer_id, referred_id, code) values
  ('68680000-0000-0000-0000-0000000000e1', '68680000-0000-0000-0000-000000000005', '68680000-0000-0000-0000-000000000004', 'ABCDEF6801'),
  ('68680000-0000-0000-0000-0000000000e2', '68680000-0000-0000-0000-000000000005', '68680000-0000-0000-0000-000000000008', 'ABCDEF6801'),
  ('68680000-0000-0000-0000-0000000000e3', '68680000-0000-0000-0000-000000000005', '68680000-0000-0000-0000-000000000009', 'ABCDEF6801'),
  ('68680000-0000-0000-0000-0000000000e4', '68680000-0000-0000-0000-000000000005', '68680000-0000-0000-0000-000000000001', 'ABCDEF6801');
select pg_temp.as_service();
do $$ declare r record; t timestamptz := date_trunc('second', now()) + interval '5 days'; begin
  -- A disputed first payment earns nothing.
  if exists (select 1 from public.referral_claim_reward('68680000-0000-0000-0000-000000000004', 'fp_a', '{}', false, 'GBP',
               'in_68a', 'pi_68a', true, null)) then raise exception 'a disputed payment was rewarded'; end if;
  if (select status || '/' || block_reason from public.referrals where id = '68680000-0000-0000-0000-0000000000e1') <> 'blocked/disputed' then
    raise exception 'a disputed payment should block the referral';
  end if;
  -- Trial days: the target is stored at the claim and a retry returns the same date.
  select * into r from public.referral_claim_reward('68680000-0000-0000-0000-000000000008', 'fp_b', '{}', true, 'GBP', 'in_68b', 'pi_68b', false, t);
  if r.reward_kind <> 'trial_days' or r.trial_end_target <> t + interval '14 days' then raise exception 'trial target: %', r.trial_end_target; end if;
  select * into r from public.referral_claim_reward('68680000-0000-0000-0000-000000000008', 'fp_b', '{}', true, 'GBP', 'in_68b', 'pi_68b', false, t + interval '14 days');
  if r.trial_end_target <> t + interval '14 days' then raise exception 'a retry moved the target: %', r.trial_end_target; end if;
  perform public.referral_reward_given('68680000-0000-0000-0000-0000000000e2', null);
  -- A credit that reached Stripe: the reversal asks for a debit, once.
  perform * from public.referral_claim_reward('68680000-0000-0000-0000-000000000009', 'fp_c', '{}', false, 'GBP', 'in_68c', 'pi_68c', false, null);
  perform public.referral_reward_given('68680000-0000-0000-0000-0000000000e3', 'cbtxn_68c');
  select * into r from public.referral_reverse('pi_68c', 'refunded');
  if r.action <> 'debit' or r.reward_value <> 500 or r.balance_txn <> 'cbtxn_68c' then raise exception 'credit reversal: %', r.action; end if;
  select * into r from public.referral_reverse('pi_68c', 'refunded');
  if r.action <> 'debit' then raise exception 'a retry should return the same reversal'; end if;
  if public.referral_reversed('68680000-0000-0000-0000-0000000000e3', 'cbtxn_68c_back') <> 'reversed' then raise exception 'reversed'; end if;
  if exists (select 1 from public.referral_reverse('pi_68c', 'refunded')) then raise exception 'reversed twice'; end if;
  if (select status from public.account_credits where referral_id = '68680000-0000-0000-0000-0000000000e3') <> 'reversed' then raise exception 'credit row'; end if;
  -- Trial days: the reversal shortens the trial with the stored target.
  select * into r from public.referral_reverse('pi_68b', 'disputed');
  if r.action <> 'shorten_trial' or r.trial_end_target <> t + interval '14 days' or r.reward_value <> 14 then raise exception 'trial reversal'; end if;
  perform public.referral_reversed('68680000-0000-0000-0000-0000000000e2', null);
  -- Credit still waiting for a Stripe customer is simply cancelled.
  perform * from public.referral_claim_reward('68680000-0000-0000-0000-000000000001', 'fp_d', '{}', false, 'GBP', 'in_68d', 'pi_68d', false, null);
  perform public.referral_reward_given('68680000-0000-0000-0000-0000000000e4', null);
  if exists (select 1 from public.referral_reverse('pi_68d', 'refunded')) then raise exception 'a pending credit needs no Stripe step'; end if;
  if (select status from public.referrals where id = '68680000-0000-0000-0000-0000000000e4') <> 'reversed' then raise exception 'pending credit referral'; end if;
  if exists (select 1 from public.credits_pending('68680000-0000-0000-0000-000000000005')) then raise exception 'a reversed credit is still pending'; end if;
end $$;
reset role;
select test_as('68680000-0000-0000-0000-000000000005');
do $$ begin
  if (select credit_minor from public.my_referral_summary()) <> 0 then raise exception 'reversed credit is still shown'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 5. A bundle reopening a revoked title owns it, so its refund closes it.
-- ---------------------------------------------------------------------------
insert into public.entitlements (user_id, tenant_id, workbook_id, source, status) values
  ('68680000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000a', '68680000-0000-0000-0000-0000000000c2', 'purchase', 'revoked');
select pg_temp.as_service();
do $$ begin
  perform public.bundle_create('00000000-0000-0000-0000-00000000000a', '68680000-0000-0000-0000-000000000004', 'theme68',
    array['68680000-0000-0000-0000-0000000000c1', '68680000-0000-0000-0000-0000000000c2']::uuid[], 'cs_b68', 'GBP', 999);
  perform public.bundle_mark_paid('cs_b68', 'pi_b68', 999, 0);
end $$;
reset role;
do $$ begin
  if (select status from public.entitlements where user_id = '68680000-0000-0000-0000-000000000004' and workbook_id = '68680000-0000-0000-0000-0000000000c2') <> 'active'
     or (select bundle_purchase_id from public.entitlements where user_id = '68680000-0000-0000-0000-000000000004' and workbook_id = '68680000-0000-0000-0000-0000000000c2') is null then
    raise exception 'the reopened title should belong to the bundle';
  end if;
end $$;
select pg_temp.as_service();
do $$ begin perform public.bundle_refund('pi_b68'); end $$;
reset role;
do $$ begin
  if (select status from public.entitlements where user_id = '68680000-0000-0000-0000-000000000004' and workbook_id = '68680000-0000-0000-0000-0000000000c2') <> 'revoked' then
    raise exception 'a bundle refund left the reopened title open';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6 and 7. rail_signals and title requests are for the server only.
-- ---------------------------------------------------------------------------
select pg_temp.as_anon();
do $$ begin
  begin perform * from public.rail_signals('00000000-0000-0000-0000-00000000000a');
    raise exception 'a visitor read rail signals'; exception when insufficient_privilege then null; end;
  begin perform public.submit_title_request('A title', null, null, repeat('a', 64));
    raise exception 'a visitor chose their own address hash'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select test_as('68680000-0000-0000-0000-000000000004');
do $$ begin
  begin perform * from public.rail_signals('00000000-0000-0000-0000-00000000000a');
    raise exception 'a reader read rail signals'; exception when insufficient_privilege then null; end;
  begin perform public.submit_title_request_as('68680000-0000-0000-0000-000000000004', 'A title', null, null, repeat('a', 64));
    raise exception 'a reader called the server request'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select pg_temp.as_service();
do $$ declare v uuid; begin
  perform * from public.rail_signals('00000000-0000-0000-0000-00000000000a');
  v := public.submit_title_request_as('68680000-0000-0000-0000-000000000004', 'Server Title 68', null, null, repeat('f', 64));
  if v is null then raise exception 'the request should be stored'; end if;
end $$;
reset role;
do $$ begin
  if (select user_id from public.title_requests where title = 'Server Title 68') <> '68680000-0000-0000-0000-000000000004' then raise exception 'the reader should be kept'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Certificates: every step done, and access beyond the free units.
-- ---------------------------------------------------------------------------
insert into public.enrolments (id, user_id, tenant_id, workbook_id, version_id) values
  ('68680000-0000-0000-0000-0000000000f1', '68680000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-00000000000a',
   '68680000-0000-0000-0000-0000000000c1', '68680000-0000-0000-0000-0000000000d1');
insert into public.progress_events (enrolment_id, kind, ref) values
  ('68680000-0000-0000-0000-0000000000f1', 'finished', null),
  ('68680000-0000-0000-0000-0000000000f1', 'step_done', 'ex_one');
update public.enrolments set status = 'finished' where id = '68680000-0000-0000-0000-0000000000f1';
select test_as('68680000-0000-0000-0000-000000000009');
do $$ begin
  begin perform public.make_certificate('68680000-0000-0000-0000-0000000000f1', 'Pat');
    raise exception 'a finished flag alone made a certificate'; exception when object_not_in_prerequisite_state then null; end;
end $$;
reset role;
insert into public.progress_events (enrolment_id, kind, ref) values
  ('68680000-0000-0000-0000-0000000000f1', 'step_done', 'ex_two'),
  ('68680000-0000-0000-0000-0000000000f1', 'step_done', 'ex_three');
insert into public.entitlements (user_id, tenant_id, workbook_id, source, status) values
  ('68680000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-00000000000a', '68680000-0000-0000-0000-0000000000c1', 'free_unit', 'active');
select test_as('68680000-0000-0000-0000-000000000009');
do $$ begin
  begin perform public.make_certificate('68680000-0000-0000-0000-0000000000f1', 'Pat');
    raise exception 'a free sample made a certificate'; exception when object_not_in_prerequisite_state then null; end;
end $$;
reset role;
insert into public.entitlements (user_id, tenant_id, workbook_id, source, status) values
  ('68680000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-00000000000a', '68680000-0000-0000-0000-0000000000c1', 'purchase', 'active');
select test_as('68680000-0000-0000-0000-000000000009');
do $$ begin
  if public.make_certificate('68680000-0000-0000-0000-0000000000f1', 'Pat') is null then raise exception 'a real finish should make a certificate'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 9. A gift refund takes back only that gift's time (also in 0054's test).
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
do $$ begin
  perform public.gift_create('00000000-0000-0000-0000-00000000000a', '68680000-0000-0000-0000-000000000002', 'cs_g68a',
    'tok68aaxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 6, 'friend68@gift.test', null, null, null, 'GBP', 4794);
  perform public.gift_mark_paid('cs_g68a', 'pi_g68a', 4794, 0, 'GBP');
  perform public.gift_create('00000000-0000-0000-0000-00000000000a', '68680000-0000-0000-0000-000000000003', 'cs_g68b',
    'tok68bbxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 1, 'friend68@gift.test', null, null, null, 'GBP', 799);
  perform public.gift_mark_paid('cs_g68b', 'pi_g68b', 799, 0, 'GBP');
end $$;
reset role;
select test_as('68680000-0000-0000-0000-000000000004');
do $$ begin
  perform public.claim_gift('tok68aaxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
  perform public.claim_gift('tok68bbxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
end $$;
reset role;
-- Refund the first (six months): one month is left.
select pg_temp.as_service();
do $$ begin perform public.gift_refund('pi_g68a'); end $$;
reset role;
do $$ declare e public.entitlements; begin
  select * into e from public.entitlements where user_id = '68680000-0000-0000-0000-000000000004' and source = 'gift' and workbook_id is null;
  if e.status <> 'active' or e.ends_at > now() + interval '32 days' or e.ends_at < now() + interval '27 days' then
    raise exception 'one month should remain: % %', e.status, e.ends_at;
  end if;
  if (select ends_at from public.gift_memberships where stripe_checkout_session_id = 'cs_g68b') <> e.ends_at then
    raise exception 'the later gift should move up with the entitlement';
  end if;
end $$;
select pg_temp.as_service();
do $$ begin perform public.gift_refund('pi_g68b'); end $$;
reset role;
do $$ begin
  if (select status from public.entitlements where user_id = '68680000-0000-0000-0000-000000000004' and source = 'gift' and workbook_id is null) <> 'revoked' then
    raise exception 'refunding both gifts should close the entitlement';
  end if;
end $$;

rollback;
