-- Conversion part 1 (0054): gift memberships, the student price and the
-- offer-timing counts. A gift is paid for once, claimed with a link, opens the
-- membership catalogue for its length and then ends. Each block must raise or
-- return the expected value; a failure aborts the script and the CI step.
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('54540000-0000-0000-0000-000000000001', 'buyer54@test'),
  ('54540000-0000-0000-0000-000000000002', 'friend54@test'),
  ('54540000-0000-0000-0000-000000000003', 'other54@test'),
  ('54540000-0000-0000-0000-000000000004', 'student54@test'),
  ('54540000-0000-0000-0000-000000000005', 'student54b@test'),
  ('54540000-0000-0000-0000-0000000000a1', 'support54@test');
insert into public.platform_roles (user_id, role) values ('54540000-0000-0000-0000-0000000000a1', 'support');

insert into public.organisations (id, code, kind, legal_name, display_name, slug, country, tax_residence, stripe_connect_id, connect_status) values
  ('54540000-0000-0000-0000-0000000000b1', 'PB-TQD54', 'publisher', 'Gift One Ltd', 'Gift One', 'gift-one', 'GB', 'GB', 'acct_gift54', 'verified');
insert into public.books (id, org_id, slug, title) values
  ('54540000-0000-0000-0000-0000000000c1', '54540000-0000-0000-0000-0000000000b1', 'gift-book', 'Gift Book');
insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, depth, status, badge, in_membership) values
  ('54540000-0000-0000-0000-0000000000d1', 'AK-TQD54', '54540000-0000-0000-0000-0000000000c1', '54540000-0000-0000-0000-0000000000b1',
   'gift-wb-in', 'Gift WB In', 'Card', 'productivity', 'full', 'live', 'official', true),
  ('54540000-0000-0000-0000-0000000000d2', 'AK-TQD55', '54540000-0000-0000-0000-0000000000c1', '54540000-0000-0000-0000-0000000000b1',
   'gift-wb-out', 'Gift WB Out', 'Card', 'productivity', 'full', 'live', 'official', false);

create or replace function pg_temp.as_service() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "service_role"}'::text, true);
  execute 'set local role service_role';
end $$;

-- 1. The config rows are there.
do $$ begin
  if (select value::text from public.app_config where key = 'gift_months') <> '[1, 3, 6, 12]' then raise exception 'gift_months'; end if;
  if (select value::text from public.app_config where key = 'student_discount_percent') <> '50' then raise exception 'student pc'; end if;
end $$;

-- 2. Creating a gift: only the service role, only an offered length, a message of limited size.
select test_as('54540000-0000-0000-0000-000000000001');
do $$ begin
  begin
    perform public.gift_create('00000000-0000-0000-0000-00000000000a', '54540000-0000-0000-0000-000000000001', 'cs_g54_x',
      'tok54xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 3, 'friend54@gift.test', null, null, null, 'GBP', 2397);
    raise exception 'a reader created a gift';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select pg_temp.as_service();
do $$ begin
  begin
    perform public.gift_create('00000000-0000-0000-0000-00000000000a', '54540000-0000-0000-0000-000000000001', 'cs_g54_bad',
      'tok54badxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 2, 'friend54@gift.test', null, null, null, 'GBP', 1598);
    raise exception 'a two month gift was accepted';
  exception when sqlstate 'AKX21' then null; end;
  begin
    perform public.gift_create('00000000-0000-0000-0000-00000000000a', '54540000-0000-0000-0000-000000000001', 'cs_g54_long',
      'tok54longxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 3, 'friend54@gift.test', null, null, repeat('x', 301), 'GBP', 2397);
    raise exception 'a long message was accepted';
  exception when sqlstate 'AKX22' then null; end;
  perform public.gift_create('00000000-0000-0000-0000-00000000000a', '54540000-0000-0000-0000-000000000001', 'cs_g54_ok',
    'tok54okxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 3, ' Friend54@Gift.Test ', 'Fran', 'Sam', 'Happy reading', 'gbp', 2397);
end $$;
reset role;
do $$ begin
  if (select recipient_email from public.gift_memberships where stripe_checkout_session_id = 'cs_g54_ok') <> 'friend54@gift.test' then raise exception 'email not normalised'; end if;
  if (select status from public.gift_memberships where stripe_checkout_session_id = 'cs_g54_ok') <> 'pending' then raise exception 'should be pending'; end if;
end $$;

-- 3. A pending gift cannot be claimed or previewed.
select test_as('54540000-0000-0000-0000-000000000002');
do $$ begin
  if public.claim_gift('tok54okxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx') <> 'invalid' then raise exception 'a pending gift was claimable'; end if;
  if exists (select 1 from public.gift_preview('tok54okxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')) then raise exception 'a pending gift was previewed'; end if;
end $$;
reset role;

-- 4. Payment clears. Idempotent. The claim window opens.
select pg_temp.as_service();
do $$ declare r jsonb; begin
  r := public.gift_mark_paid('cs_g54_ok', 'pi_g54_ok', 2397, 0, 'GBP');
  if not (r ->> 'changed')::boolean or r ->> 'status' <> 'paid' or r ->> 'delivered' <> 'false' then raise exception 'paid: %', r; end if;
  r := public.gift_mark_paid('cs_g54_ok', 'pi_g54_ok', 2397, 0, 'GBP');
  if (r ->> 'changed')::boolean then raise exception 'a repeat delivery changed the gift'; end if;
  if not public.gift_mark_delivered((r ->> 'id')::uuid) then raise exception 'delivered'; end if;
  if public.gift_mark_delivered((r ->> 'id')::uuid) then raise exception 'delivered twice'; end if;
  if (public.gift_mark_paid('cs_nope54', 'pi', 1, 0, 'GBP') ->> 'found')::boolean then raise exception 'unknown session'; end if;
end $$;
reset role;
do $$ begin
  if (select claim_by from public.gift_memberships where stripe_checkout_session_id = 'cs_g54_ok') < now() + interval '364 days' then raise exception 'claim window'; end if;
end $$;

-- 5. Anyone with the link can preview. Nothing returns for a guess.
set local role anon;
do $$ declare r record; begin
  select * into r from public.gift_preview('tok54okxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
  if r.months <> 3 or r.sender_name <> 'Sam' or r.message <> 'Happy reading' then raise exception 'preview: %', r; end if;
  if exists (select 1 from public.gift_preview('tok54guessxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')) then raise exception 'a guess returned a gift'; end if;
  begin
    perform public.claim_gift('tok54okxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
    raise exception 'a signed-out visitor claimed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- 6. The buyer sees their own gift (with the link), another reader does not.
select test_as('54540000-0000-0000-0000-000000000001');
do $$ begin
  if (select count(*) from public.gift_memberships) <> 1 then raise exception 'buyer should see one gift'; end if;
  begin
    perform stripe_checkout_session_id from public.gift_memberships;
    raise exception 'the buyer read a Stripe id';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select test_as('54540000-0000-0000-0000-000000000003');
do $$ begin
  if (select count(*) from public.gift_memberships) <> 0 then raise exception 'a stranger saw a gift'; end if;
end $$;
reset role;

-- 7. The friend claims. The catalogue opens for three months and no more.
select test_as('54540000-0000-0000-0000-000000000002');
do $$ begin
  if public.claim_gift('tok54okxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx') <> 'claimed' then raise exception 'claim'; end if;
  if public.claim_gift('tok54okxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx') <> 'invalid' then raise exception 'the link worked twice'; end if;
  if not app.has_entitlement('54540000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', '54540000-0000-0000-0000-0000000000d1') then
    raise exception 'a gift should open a membership title';
  end if;
  if app.has_entitlement('54540000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', '54540000-0000-0000-0000-0000000000d2') then
    raise exception 'a gift should not open a title outside the membership';
  end if;
end $$;
reset role;
do $$ declare e record; begin
  select * into e from public.entitlements where user_id = '54540000-0000-0000-0000-000000000002' and source = 'gift';
  if e.workbook_id is not null or e.status <> 'active' then raise exception 'entitlement shape'; end if;
  if e.ends_at < now() + interval '89 days' or e.ends_at > now() + interval '93 days' then raise exception 'three months: %', e.ends_at; end if;
  if (select claim_token from public.gift_memberships where stripe_checkout_session_id = 'cs_g54_ok') is not null then raise exception 'token kept after claim'; end if;
  if (select recipient_email from public.gift_memberships where stripe_checkout_session_id = 'cs_g54_ok') is not null then raise exception 'address kept after claim'; end if;
  if (select status from public.gift_memberships where stripe_checkout_session_id = 'cs_g54_ok') <> 'claimed' then raise exception 'status'; end if;
  if not exists (select 1 from public.audit_log where action = 'commerce.gift_claimed') then raise exception 'claim not audited'; end if;
end $$;

-- 8. A second gift claimed while the first runs is added to the end.
select pg_temp.as_service();
do $$ declare r jsonb; begin
  perform public.gift_create('00000000-0000-0000-0000-00000000000a', '54540000-0000-0000-0000-000000000003', 'cs_g54_two',
    'tok54twoxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 1, 'friend54@gift.test', null, null, null, 'GBP', 799);
  perform public.gift_mark_paid('cs_g54_two', 'pi_g54_two', 799, 0, 'GBP');
end $$;
reset role;
select test_as('54540000-0000-0000-0000-000000000002');
do $$ begin
  if public.claim_gift('tok54twoxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx') <> 'claimed' then raise exception 'second claim'; end if;
end $$;
reset role;
do $$ begin
  if (select ends_at from public.entitlements where user_id = '54540000-0000-0000-0000-000000000002' and source = 'gift') < now() + interval '118 days' then
    raise exception 'the second gift should extend the first';
  end if;
end $$;

-- 9. A refund ends the gift, claimed or not. 0068: only the refunded gift's
-- time comes off the shared entitlement; the first gift's three months stay.
select pg_temp.as_service();
do $$ declare r jsonb; begin
  r := public.gift_refund('pi_g54_two');
  if not (r ->> 'changed')::boolean or not (r ->> 'was_claimed')::boolean then raise exception 'refund: %', r; end if;
  if (public.gift_refund('pi_g54_two') ->> 'changed')::boolean then raise exception 'refunded twice'; end if;
  if (public.gift_refund('pi_unknown54') ->> 'found')::boolean then raise exception 'unknown refund'; end if;
end $$;
reset role;
do $$ begin
  if (select status from public.entitlements where user_id = '54540000-0000-0000-0000-000000000002' and source = 'gift') <> 'active'
     or (select ends_at from public.entitlements where user_id = '54540000-0000-0000-0000-000000000002' and source = 'gift') > now() + interval '93 days'
     or (select ends_at from public.entitlements where user_id = '54540000-0000-0000-0000-000000000002' and source = 'gift') < now() + interval '88 days' then
    raise exception 'a refund should take back only the refunded gift''s month';
  end if;
end $$;

-- 10. Expiry: an unclaimed gift past its window, and a claimed one past its end.
select pg_temp.as_service();
do $$ declare r jsonb; begin
  perform public.gift_create('00000000-0000-0000-0000-00000000000a', '54540000-0000-0000-0000-000000000001', 'cs_g54_old',
    'tok54oldxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 6, 'old54@gift.test', null, null, null, 'GBP', 4794);
  perform public.gift_mark_paid('cs_g54_old', 'pi_g54_old', 4794, 0, 'GBP');
  update public.gift_memberships set claim_by = now() - interval '1 day' where stripe_checkout_session_id = 'cs_g54_old';
  r := public.gifts_expire();
  if (r ->> 'unclaimed')::int <> 1 then raise exception 'unclaimed expiry: %', r; end if;
end $$;
reset role;
do $$ begin
  if (select claim_token from public.gift_memberships where stripe_checkout_session_id = 'cs_g54_old') is not null then raise exception 'token kept'; end if;
  if (select recipient_email from public.gift_memberships where stripe_checkout_session_id = 'cs_g54_old') is not null then raise exception 'address kept'; end if;
end $$;
select test_as('54540000-0000-0000-0000-000000000003');
do $$ begin
  if public.claim_gift('tok54oldxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx') <> 'invalid' then raise exception 'an expired gift was claimable'; end if;
end $$;
reset role;
-- A gift that has run its course lapses and the account is back to the free state.
select pg_temp.as_service();
do $$ declare r jsonb; begin
  perform public.gift_create('00000000-0000-0000-0000-00000000000a', '54540000-0000-0000-0000-000000000001', 'cs_g54_run',
    'tok54runxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 1, 'run54@gift.test', null, null, null, 'GBP', 799);
  perform public.gift_mark_paid('cs_g54_run', 'pi_g54_run', 799, 0, 'GBP');
end $$;
reset role;
select test_as('54540000-0000-0000-0000-000000000003');
do $$ begin
  if public.claim_gift('tok54runxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx') <> 'claimed' then raise exception 'claim run'; end if;
end $$;
reset role;
update public.entitlements set starts_at = now() - interval '40 days', ends_at = now() - interval '1 day' where user_id = '54540000-0000-0000-0000-000000000003' and source = 'gift';
update public.gift_memberships set ends_at = now() - interval '1 day' where stripe_checkout_session_id = 'cs_g54_run';
select pg_temp.as_service();
do $$ declare r jsonb; begin
  r := public.gifts_expire();
  if (r ->> 'ended')::int <> 1 then raise exception 'ended: %', r; end if;
end $$;
reset role;
do $$ begin
  if app.has_entitlement('54540000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000a', '54540000-0000-0000-0000-0000000000d1') then
    raise exception 'an ended gift should open nothing';
  end if;
  if (select status from public.entitlements where user_id = '54540000-0000-0000-0000-000000000003' and source = 'gift') <> 'lapsed' then raise exception 'lapse'; end if;
  if (select status from public.gift_memberships where stripe_checkout_session_id = 'cs_g54_run') <> 'expired' then raise exception 'gift status'; end if;
end $$;

-- 11. Failed sessions leave nothing behind.
select pg_temp.as_service();
do $$ begin
  perform public.gift_create('00000000-0000-0000-0000-00000000000a', '54540000-0000-0000-0000-000000000001', 'cs_g54_fail',
    'tok54failxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 12, 'fail54@gift.test', null, null, null, 'GBP', 6999);
  if not public.gift_mark_failed('cs_g54_fail') then raise exception 'mark failed'; end if;
  if public.gift_mark_failed('cs_g54_fail') then raise exception 'failed twice'; end if;
end $$;
reset role;
do $$ begin
  if (select recipient_email from public.gift_memberships where stripe_checkout_session_id = 'cs_g54_fail') is not null then raise exception 'address kept'; end if;
end $$;

-- 12. The student price. A link, a one-use token, one address for one account, a year.
-- 0068: the server asks and confirms for the signed-in reader (service role);
-- the address and token are hashed in the database.
select pg_temp.as_service();
do $$ begin
  perform public.student_request_for('54540000-0000-0000-0000-000000000004', 'Sam@Uni.ac.uk', repeat('b', 40));
  if public.student_verify_for('54540000-0000-0000-0000-000000000004', repeat('c', 40)) <> 'invalid' then raise exception 'wrong token verified'; end if;
  if public.student_verify_for('54540000-0000-0000-0000-000000000004', repeat('b', 40)) <> 'verified' then raise exception 'verify'; end if;
  if public.student_verify_for('54540000-0000-0000-0000-000000000004', repeat('b', 40)) <> 'invalid' then raise exception 'token used twice'; end if;
end $$;
reset role;
select test_as('54540000-0000-0000-0000-000000000004');
do $$ begin
  if (select count(*) from public.student_verifications) <> 1 then raise exception 'own row'; end if;
  begin
    perform token_hash from public.student_verifications;
    raise exception 'the reader read the token hash';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  if (select expires_at from public.student_verifications where user_id = '54540000-0000-0000-0000-000000000004') < now() + interval '364 days' then raise exception 'a year'; end if;
  if (select email_domain from public.student_verifications where user_id = '54540000-0000-0000-0000-000000000004') <> 'uni.ac.uk' then raise exception 'domain'; end if;
end $$;
select test_as('54540000-0000-0000-0000-000000000005');
do $$ begin
  if (select count(*) from public.student_verifications) <> 0 then raise exception 'another reader saw a row'; end if;
end $$;
reset role;
select pg_temp.as_service();
do $$ begin
  perform public.student_request_for('54540000-0000-0000-0000-000000000005', 'sam@uni.ac.uk', repeat('d', 40));
  if public.student_verify_for('54540000-0000-0000-0000-000000000005', repeat('d', 40)) <> 'email_in_use' then raise exception 'one address, two accounts'; end if;
end $$;
reset role;

-- An expired link.
update public.student_verifications set token_expires_at = now() - interval '1 minute' where user_id = '54540000-0000-0000-0000-000000000005';
select pg_temp.as_service();
do $$ begin
  if public.student_verify_for('54540000-0000-0000-0000-000000000005', repeat('d', 40)) <> 'expired' then raise exception 'an old link verified'; end if;
end $$;
reset role;

-- The yearly check: due 30 days before, and the discount comes off at the end.
select pg_temp.as_service();
do $$ declare n int; begin
  select count(*) into n from public.student_due(now());
  if n <> 0 then raise exception 'nothing is due yet: %', n; end if;
  update public.student_verifications set expires_at = now() + interval '10 days' where user_id = '54540000-0000-0000-0000-000000000004';
  if (select due from public.student_due(now()) where user_id = '54540000-0000-0000-0000-000000000004') <> 'recheck' then raise exception 'recheck'; end if;
  perform public.student_mark('54540000-0000-0000-0000-000000000004', 'recheck_sent');
  if exists (select 1 from public.student_due(now())) then raise exception 'recheck due twice'; end if;
  update public.student_verifications set expires_at = now() - interval '1 day' where user_id = '54540000-0000-0000-0000-000000000004';
  if (select due from public.student_due(now()) where user_id = '54540000-0000-0000-0000-000000000004') <> 'expired' then raise exception 'expired'; end if;
  perform public.student_mark('54540000-0000-0000-0000-000000000004', 'discount_removed');
  if exists (select 1 from public.student_due(now())) then raise exception 'expired due twice'; end if;
end $$;
reset role;
select test_as('54540000-0000-0000-0000-000000000004');
do $$ begin
  begin
    perform * from public.student_due(now());
    raise exception 'a reader listed student checks';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- 13. Offer timing: the counts, under the reader's own rows.
insert into public.workbook_versions (id, workbook_id, semver, content, content_hash) values
  ('54540000-0000-0000-0000-0000000000e1', '54540000-0000-0000-0000-0000000000d1', '1.0.0', '{}'::jsonb, repeat('0', 64)),
  ('54540000-0000-0000-0000-0000000000e2', '54540000-0000-0000-0000-0000000000d2', '1.0.0', '{}'::jsonb, repeat('0', 64));
insert into public.enrolments (id, user_id, tenant_id, workbook_id, version_id, started_at) values
  ('54540000-0000-0000-0000-0000000000f1', '54540000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000a',
   '54540000-0000-0000-0000-0000000000d1', '54540000-0000-0000-0000-0000000000e1', now() - interval '10 days'),
  ('54540000-0000-0000-0000-0000000000f2', '54540000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000a',
   '54540000-0000-0000-0000-0000000000d2', '54540000-0000-0000-0000-0000000000e2', now() - interval '1 day'),
  ('54540000-0000-0000-0000-0000000000f3', '54540000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000a',
   '54540000-0000-0000-0000-0000000000d1', '54540000-0000-0000-0000-0000000000e1', now() - interval '10 days');
insert into public.progress_events (enrolment_id, kind, ref) values
  ('54540000-0000-0000-0000-0000000000f1', 'step_done', 'a'), ('54540000-0000-0000-0000-0000000000f1', 'step_done', 'b'),
  ('54540000-0000-0000-0000-0000000000f1', 'step_done', 'c'), ('54540000-0000-0000-0000-0000000000f1', 'unit_opened', 'u1'),
  ('54540000-0000-0000-0000-0000000000f2', 'step_done', 'a'), ('54540000-0000-0000-0000-0000000000f2', 'step_done', 'b'),
  ('54540000-0000-0000-0000-0000000000f2', 'step_done', 'c'), ('54540000-0000-0000-0000-0000000000f2', 'step_done', 'd'),
  ('54540000-0000-0000-0000-0000000000f2', 'step_done', 'e'), ('54540000-0000-0000-0000-0000000000f2', 'step_done', 'f'),
  ('54540000-0000-0000-0000-0000000000f3', 'step_done', 'z');
select test_as('54540000-0000-0000-0000-000000000005');
do $$ declare r record; begin
  select * into r from public.my_offer_use('00000000-0000-0000-0000-00000000000a', 7);
  -- two workbooks begun; the older one has 3 finished steps, the newer one is under a week old
  if r.samples <> 2 then raise exception 'samples: %', r.samples; end if;
  if r.steps_aged <> 3 then raise exception 'steps_aged: %', r.steps_aged; end if;
  select * into r from public.my_offer_use('00000000-0000-0000-0000-00000000000a', 0);
  if r.steps_aged <> 6 then raise exception 'steps_aged at 0 days: %', r.steps_aged; end if;
end $$;
reset role;
select test_as('54540000-0000-0000-0000-000000000003');
do $$ declare r record; begin
  select * into r from public.my_offer_use('00000000-0000-0000-0000-00000000000a', 7);
  if r.samples <> 1 or r.steps_aged <> 1 then raise exception 'another reader sees only their own rows: %', r; end if;
end $$;
reset role;

rollback;
