-- Reader referrals (0051): one link each, the friend must be new, self and
-- duplicate card guards, the reward only after the first payment, the yearly
-- cap, a trialling referrer gets days not credit, retries never double up.
-- Each block must raise or return the expected value; a failure aborts the script.
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('51510000-0000-0000-0000-00000000000a', 'Pat.Ref@gmail.com'),
  ('51510000-0000-0000-0000-00000000000b', 'friend51@test'),
  ('51510000-0000-0000-0000-00000000000c', 'patref+alt@googlemail.com'),
  ('51510000-0000-0000-0000-00000000000d', 'paid51@test'),
  ('51510000-0000-0000-0000-00000000000e', 'friend51b@test');

create or replace function pg_temp.as_service() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "service_role"}'::text, true);
  execute 'set local role service_role';
end $$;

-- 1. The email normaliser.
do $$ begin
  if app.norm_email('Pat.Ref+x@Gmail.com') <> 'patref@gmail.com' then raise exception 'gmail: %', app.norm_email('Pat.Ref+x@Gmail.com'); end if;
  if app.norm_email('a.b+c@example.org') <> 'a.b@example.org' then raise exception 'other: %', app.norm_email('a.b+c@example.org'); end if;
end $$;

-- 2. One code each, stable, ten hex characters. Readers cannot read the tables.
select test_as('51510000-0000-0000-0000-00000000000a');
do $$ declare c1 text; c2 text; begin
  c1 := public.my_referral_code();
  c2 := public.my_referral_code();
  if c1 <> c2 or c1 !~ '^[0-9A-F]{10}$' then raise exception 'code: % %', c1, c2; end if;
  begin
    perform 1 from public.referrals;
    raise exception 'a reader read the referrals table';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from public.account_credits;
    raise exception 'a reader read the credits table';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('akana.code', (select code from public.referral_codes where user_id = '51510000-0000-0000-0000-00000000000a'), false);

-- 3. Using a link: unknown, self, the same address in disguise, already paid.
select test_as('51510000-0000-0000-0000-00000000000a');
do $$ begin
  if public.referral_use(current_setting('akana.code')) <> 'self' then raise exception 'self referral allowed'; end if;
end $$;
reset role;
select test_as('51510000-0000-0000-0000-00000000000c');
do $$ begin
  if public.referral_use(current_setting('akana.code')) <> 'self' then raise exception 'disguised self referral allowed'; end if;
  if public.referral_use('NOPE') <> 'unknown_code' then raise exception 'unknown code'; end if;
end $$;
reset role;
insert into public.purchases (user_id, tenant_id, kind, price_point_id, stripe_checkout_session_id, currency, amount_minor, status, paid_at)
values ('51510000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-00000000000a', 'membership', 'member_month', 'cs_test_51_paid', 'GBP', 799, 'paid', now());
select test_as('51510000-0000-0000-0000-00000000000d');
do $$ begin
  if public.referral_use(current_setting('akana.code')) <> 'not_new' then raise exception 'someone who has paid used a link'; end if;
end $$;
reset role;

-- 4. A new friend attaches once; the first link wins.
select test_as('51510000-0000-0000-0000-00000000000b');
do $$ begin
  if public.referral_use(current_setting('akana.code')) <> 'attached' then raise exception 'attach'; end if;
  if public.referral_use(current_setting('akana.code')) <> 'already' then raise exception 'second use'; end if;
end $$;
reset role;

-- 5. Checkout reads it; readers cannot.
select pg_temp.as_service();
do $$ declare n int; begin
  select count(*) into n from public.referral_for_checkout('51510000-0000-0000-0000-00000000000b');
  if n <> 1 then raise exception 'checkout should see one pending referral, saw %', n; end if;
  perform public.referral_offer_recorded((select referral_id from public.referral_for_checkout('51510000-0000-0000-0000-00000000000b')),
    'trial_days', 14, 'cs_test_51_b');
end $$;
reset role;
select test_as('51510000-0000-0000-0000-00000000000b');
do $$ begin
  begin
    perform * from public.referral_for_checkout('51510000-0000-0000-0000-00000000000b');
    raise exception 'a reader called referral_for_checkout';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.referral_claim_reward('51510000-0000-0000-0000-00000000000b', 'fp', array['x'], false, 'GBP');
    raise exception 'a reader claimed a reward';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- 6. Same card as the referrer: blocked, nothing given.
select pg_temp.as_service();
do $$ declare n int; begin
  select count(*) into n from public.referral_claim_reward('51510000-0000-0000-0000-00000000000b', 'fp_same', array['fp_same','fp_other'], false, 'GBP');
  if n <> 0 then raise exception 'same card was rewarded'; end if;
end $$;
reset role;
do $$ begin
  if (select block_reason from public.referrals where referred_id = '51510000-0000-0000-0000-00000000000b') <> 'same_card' then
    raise exception 'same card should block';
  end if;
end $$;

-- 7. A fresh friend, different card, referrer not on trial: a 500 credit.
select test_as('51510000-0000-0000-0000-00000000000e');
select public.referral_use(current_setting('akana.code'));
reset role;
select pg_temp.as_service();
do $$ declare r record; begin
  select * into r from public.referral_claim_reward('51510000-0000-0000-0000-00000000000e', 'fp_e', array['fp_ref'], false, 'GBP');
  if r.reward_kind <> 'credit' or r.reward_value <> 500 or r.reward_currency <> 'GBP' then raise exception 'reward: % % %', r.reward_kind, r.reward_value, r.reward_currency; end if;
  -- a retried webhook gets the same reward and no second one
  select * into r from public.referral_claim_reward('51510000-0000-0000-0000-00000000000e', 'fp_e', array['fp_ref'], false, 'GBP');
  if r.reward_value is distinct from 500 then raise exception 'retry should return the same reward'; end if;
  if public.referral_reward_given(r.referral_id, 'txn_51_e') <> 'rewarded' then raise exception 'reward given'; end if;
  if public.referral_reward_given(r.referral_id, 'txn_51_e') <> 'unchanged' then raise exception 'reward given twice'; end if;
  if (select count(*) from public.referral_claim_reward('51510000-0000-0000-0000-00000000000e', 'fp_e', array['fp_ref'], false, 'GBP')) <> 0 then
    raise exception 'a rewarded referral was claimed again';
  end if;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.account_credits where user_id = '51510000-0000-0000-0000-00000000000a' and amount_minor = 500 and status = 'applied') <> 1 then
    raise exception 'one applied credit expected';
  end if;
end $$;

-- 8. The summary shows counts for the referrer only.
select test_as('51510000-0000-0000-0000-00000000000a');
do $$ declare s record; begin
  select * into s from public.my_referral_summary();
  if s.invited <> 2 or s.rewarded_this_year <> 1 or s.cap <> 12 or s.credit_minor <> 500 then
    raise exception 'summary: % % % %', s.invited, s.rewarded_this_year, s.cap, s.credit_minor;
  end if;
end $$;
reset role;

-- 9. Duplicate card: the same card for another friend of the same referrer.
insert into auth.users (id, email) values ('51510000-0000-0000-0000-0000000000f1', 'dup51@test');
insert into public.referrals (referrer_id, referred_id, code) values ('51510000-0000-0000-0000-00000000000a', '51510000-0000-0000-0000-0000000000f1', 'X');
select pg_temp.as_service();
do $$ begin
  if (select count(*) from public.referral_claim_reward('51510000-0000-0000-0000-0000000000f1', 'fp_e', array['fp_ref'], false, 'GBP')) <> 0 then
    raise exception 'duplicate card was rewarded';
  end if;
end $$;
reset role;
do $$ begin
  if (select block_reason from public.referrals where referred_id = '51510000-0000-0000-0000-0000000000f1') <> 'duplicate_card' then raise exception 'duplicate card'; end if;
end $$;

-- 10. A referrer still on trial gets trial days, not credit.
insert into auth.users (id, email) values ('51510000-0000-0000-0000-0000000000f2', 'trialfriend51@test');
insert into public.referrals (referrer_id, referred_id, code) values ('51510000-0000-0000-0000-00000000000a', '51510000-0000-0000-0000-0000000000f2', 'X');
select pg_temp.as_service();
do $$ declare r record; begin
  select * into r from public.referral_claim_reward('51510000-0000-0000-0000-0000000000f2', 'fp_f2', array['fp_ref'], true, 'GBP');
  if r.reward_kind <> 'trial_days' or r.reward_value <> 14 or r.reward_currency is not null then raise exception 'trial reward: % % %', r.reward_kind, r.reward_value, r.reward_currency; end if;
  perform public.referral_reward_given(r.referral_id, null);
end $$;
reset role;
do $$ begin
  if exists (select 1 from public.account_credits where referral_id = (select id from public.referrals where referred_id = '51510000-0000-0000-0000-0000000000f2')) then
    raise exception 'trial days must not write a credit';
  end if;
end $$;

-- 11. The cap: with the cap set to 2 the next qualifying friend gets nothing.
update public.app_config set value = jsonb_set(value, '{annual_cap}', '2') where key = 'referral';
insert into auth.users (id, email) values ('51510000-0000-0000-0000-0000000000f3', 'capfriend51@test');
insert into public.referrals (referrer_id, referred_id, code) values ('51510000-0000-0000-0000-00000000000a', '51510000-0000-0000-0000-0000000000f3', 'X');
select pg_temp.as_service();
do $$ begin
  if (select count(*) from public.referral_claim_reward('51510000-0000-0000-0000-0000000000f3', 'fp_f3', array['fp_ref'], false, 'GBP')) <> 0 then
    raise exception 'the cap was ignored';
  end if;
end $$;
reset role;
do $$ begin
  if (select block_reason from public.referrals where referred_id = '51510000-0000-0000-0000-0000000000f3') <> 'cap_reached' then raise exception 'cap reason'; end if;
end $$;

-- 12. A currency with no figure gives no credit.
update public.app_config set value = jsonb_set(value, '{annual_cap}', '12') where key = 'referral';
insert into auth.users (id, email) values ('51510000-0000-0000-0000-0000000000f4', 'usdfriend51@test');
insert into public.referrals (referrer_id, referred_id, code) values ('51510000-0000-0000-0000-00000000000a', '51510000-0000-0000-0000-0000000000f4', 'X');
select pg_temp.as_service();
do $$ begin
  if (select count(*) from public.referral_claim_reward('51510000-0000-0000-0000-0000000000f4', 'fp_f4', array['fp_ref'], false, 'USD')) <> 0 then
    raise exception 'a currency with no figure was rewarded';
  end if;
end $$;
reset role;

rollback;
