-- 0067 Account deletion covers everything Phase B added (0049 to 0066).
-- A reader with a row in every Phase B table asks for deletion. After the job
-- and the removal of the auth user, nothing personal is left, the tables that
-- outlive the user hold no personal data, and the other reader loses nothing.
-- Each block must raise or return the expected value; a failure aborts the script.
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('a6700000-0000-0000-0000-00000000000d', 'gone67@test'),
  ('a6700000-0000-0000-0000-00000000000f', 'friend67@test'),
  ('a6700000-0000-0000-0000-000000000009', 'giver67@test');

insert into public.organisations (id, code, kind, legal_name, display_name, slug, country) values
  ('a6700000-0000-0000-0000-0000000000a1', 'PB-TD067', 'publisher', 'Org 67 Ltd', 'Org 67', 'org-67', 'GB');
insert into public.authors (id, code, org_id, slug, display_name, country) values
  ('a6700000-0000-0000-0000-0000000000a9', 'AU-TEST7', 'a6700000-0000-0000-0000-0000000000a1', 'author-67', 'Author 67', 'GB');
insert into public.books (id, org_id, slug, title, rights_status) values
  ('a6700000-0000-0000-0000-0000000000b1', 'a6700000-0000-0000-0000-0000000000a1', 'book-67', 'Book 67', 'public_domain');
insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, safety_tier, depth, status) values
  ('a6700000-0000-0000-0000-0000000000c1', 'AK-T67A0', 'a6700000-0000-0000-0000-0000000000b1', 'a6700000-0000-0000-0000-0000000000a1', 'wb-67', 'Workbook 67', 'Card', 'productivity', 'none', 'full', 'live');
insert into public.workbook_versions (id, workbook_id, semver, content, content_hash) values
  ('a6700000-0000-0000-0000-0000000000d1', 'a6700000-0000-0000-0000-0000000000c1', '1.0.0', '{}'::jsonb, repeat('a', 64));
insert into public.enrolments (id, user_id, tenant_id, workbook_id, version_id) values
  ('a6700000-0000-0000-0000-0000000000e1', 'a6700000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-00000000000a', 'a6700000-0000-0000-0000-0000000000c1', 'a6700000-0000-0000-0000-0000000000d1'),
  ('a6700000-0000-0000-0000-0000000000e2', 'a6700000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-00000000000a', 'a6700000-0000-0000-0000-0000000000c1', 'a6700000-0000-0000-0000-0000000000d1');

-- 0049 to 0050: habit, milestones, marks
insert into public.habit_settings (user_id, companion_high_water) values
  ('a6700000-0000-0000-0000-00000000000d', 5), ('a6700000-0000-0000-0000-00000000000f', 7);
insert into public.milestone_marks (user_id, kind) values
  ('a6700000-0000-0000-0000-00000000000d', 'first_step'), ('a6700000-0000-0000-0000-00000000000f', 'first_step');
insert into public.reader_marks (user_id, enrolment_id, ref, colour, sealed, key_id) values
  ('a6700000-0000-0000-0000-00000000000d', 'a6700000-0000-0000-0000-0000000000e1', 'p1', 'yellow', 'v2.k1.AAAA', 'k1'),
  ('a6700000-0000-0000-0000-00000000000f', 'a6700000-0000-0000-0000-0000000000e2', 'p1', 'yellow', 'v2.k1.BBBB', 'k1');
insert into public.then_now_entries (user_id, enrolment_id, step_ref, sealed, key_id) values
  ('a6700000-0000-0000-0000-00000000000d', 'a6700000-0000-0000-0000-0000000000e1', 's1', 'v2.k1.CCCC', 'k1'),
  ('a6700000-0000-0000-0000-00000000000f', 'a6700000-0000-0000-0000-0000000000e2', 's1', 'v2.k1.DDDD', 'k1');

-- 0051: the gone reader refers the friend (a credit for them), and was referred by the giver
insert into public.referral_codes (user_id, code) values
  ('a6700000-0000-0000-0000-00000000000d', 'AAAAAAAAAA'), ('a6700000-0000-0000-0000-00000000000f', 'BBBBBBBBBB');
insert into public.referrals (id, referrer_id, referred_id, code, status) values
  ('a6700000-0000-0000-0000-000000000501', 'a6700000-0000-0000-0000-00000000000f', 'a6700000-0000-0000-0000-00000000000d', 'BBBBBBBBBB', 'rewarded'),
  ('a6700000-0000-0000-0000-000000000502', 'a6700000-0000-0000-0000-00000000000d', 'a6700000-0000-0000-0000-000000000009', 'AAAAAAAAAA', 'rewarded');
insert into public.account_credits (user_id, amount_minor, currency, referral_id) values
  ('a6700000-0000-0000-0000-00000000000f', 500, 'GBP', 'a6700000-0000-0000-0000-000000000501'),
  ('a6700000-0000-0000-0000-00000000000d', 500, 'GBP', 'a6700000-0000-0000-0000-000000000502');

-- 0052
insert into public.member_attributions (user_id, org_id, code) values
  ('a6700000-0000-0000-0000-00000000000d', 'a6700000-0000-0000-0000-0000000000a1', 'abcdef0123'),
  ('a6700000-0000-0000-0000-00000000000f', 'a6700000-0000-0000-0000-0000000000a1', 'abcdef0123');

-- 0053: the gone reader gave one gift (claimed, so the ledger points at it), gave a second that
-- nobody claimed, and received one from the giver
insert into public.workbook_gifts (id, giver_id, workbook_id, recipient_email, recipient_norm, token_hash, quarter, status, expires_at, claimed_by, claimed_at) values
  ('a6700000-0000-0000-0000-000000000531', 'a6700000-0000-0000-0000-00000000000d', 'a6700000-0000-0000-0000-0000000000c1', 'pal67@test', 'pal67@test', repeat('1', 64), '2026-Q3', 'claimed', now() + interval '30 days', 'a6700000-0000-0000-0000-00000000000f', now()),
  ('a6700000-0000-0000-0000-000000000532', 'a6700000-0000-0000-0000-00000000000d', 'a6700000-0000-0000-0000-0000000000c1', 'waiting67@test', 'waiting67@test', repeat('2', 64), '2026-Q4', 'sent', now() + interval '30 days', null, null),
  ('a6700000-0000-0000-0000-000000000533', 'a6700000-0000-0000-0000-000000000009', 'a6700000-0000-0000-0000-0000000000c1', 'gone67@test', 'gone67@test', repeat('3', 64), '2026-Q4', 'claimed', now() + interval '30 days', 'a6700000-0000-0000-0000-00000000000d', now()),
  ('a6700000-0000-0000-0000-000000000534', 'a6700000-0000-0000-0000-00000000000f', 'a6700000-0000-0000-0000-0000000000c1', 'keep67@test', 'keep67@test', repeat('4', 64), '2026-Q4', 'sent', now() + interval '30 days', null, null);
insert into public.marketing_pool_ledger (entry_kind, gift_id, org_id, workbook_id, currency, amount_minor, livemode) values
  ('gift_author_payment', 'a6700000-0000-0000-0000-000000000531', 'a6700000-0000-0000-0000-0000000000a1', 'a6700000-0000-0000-0000-0000000000c1', 'GBP', -100, false);

-- 0054: gift memberships bought and claimed, a student verification
insert into public.gift_memberships (id, tenant_id, buyer_id, recipient_email, recipient_name, sender_name, message, months, status, stripe_checkout_session_id, currency, claim_token, claimed_by) values
  ('a6700000-0000-0000-0000-000000000541', '00000000-0000-0000-0000-00000000000a', 'a6700000-0000-0000-0000-00000000000d', 'sam67@test.com', 'Sam', 'Gone', 'Enjoy', 3, 'claimed', 'cs_67_1', 'GBP', repeat('a', 40), 'a6700000-0000-0000-0000-00000000000f'),
  ('a6700000-0000-0000-0000-000000000542', '00000000-0000-0000-0000-00000000000a', 'a6700000-0000-0000-0000-000000000009', 'gone67@test.com', 'Gone', 'Giver', 'For you', 1, 'claimed', 'cs_67_2', 'GBP', repeat('b', 40), 'a6700000-0000-0000-0000-00000000000d'),
  ('a6700000-0000-0000-0000-000000000543', '00000000-0000-0000-0000-00000000000a', 'a6700000-0000-0000-0000-00000000000d', 'wait67@test.com', 'Wait', 'Gone', 'Still coming', 2, 'paid', 'cs_67_3', 'GBP', repeat('c', 40), null),
  ('a6700000-0000-0000-0000-000000000544', '00000000-0000-0000-0000-00000000000a', 'a6700000-0000-0000-0000-00000000000f', 'other67@test.com', 'Other', 'Friend', 'Keep me', 1, 'paid', 'cs_67_4', 'GBP', repeat('d', 40), null);
insert into public.student_verifications (user_id, email_hash, email_domain) values
  ('a6700000-0000-0000-0000-00000000000d', repeat('5', 64), 'uni.ac.uk'), ('a6700000-0000-0000-0000-00000000000f', repeat('6', 64), 'uni.ac.uk');

-- 0055: bundle purchase (a tax record), opt-out, win-back
insert into public.bundle_purchases (id, user_id, tenant_id, theme_id, workbook_ids, stripe_checkout_session_id, currency)
  select 'a6700000-0000-0000-0000-000000000551', 'a6700000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-00000000000a', (select id from public.themes limit 1),
         array['a6700000-0000-0000-0000-0000000000c1'::uuid, 'a6700000-0000-0000-0000-0000000000c1'::uuid], 'cs_67_bundle', 'GBP';
insert into public.marketing_optouts (user_id) values ('a6700000-0000-0000-0000-00000000000d'), ('a6700000-0000-0000-0000-00000000000f');
insert into public.winback_log (user_id, kind, season, unsub_token_hash) values
  ('a6700000-0000-0000-0000-00000000000d', 'monthly', '2026-autumn', repeat('7', 64)),
  ('a6700000-0000-0000-0000-00000000000f', 'monthly', '2026-autumn', repeat('8', 64));

-- 0056: follows and title requests
insert into public.author_follows (user_id, author_id) values
  ('a6700000-0000-0000-0000-00000000000d', 'a6700000-0000-0000-0000-0000000000a9'), ('a6700000-0000-0000-0000-00000000000f', 'a6700000-0000-0000-0000-0000000000a9');
insert into public.title_requests (id, title, title_key, note, user_id, ip_hash) values
  ('a6700000-0000-0000-0000-000000000561', 'A book', 'a book', 'please', 'a6700000-0000-0000-0000-00000000000d', repeat('9', 64)),
  ('a6700000-0000-0000-0000-000000000562', 'Another', 'another', null, 'a6700000-0000-0000-0000-00000000000f', repeat('9', 64));

-- 0063: newsletter, keyed by address
insert into public.newsletter_subscribers (email, status) values ('gone67@test', 'confirmed'), ('friend67@test', 'confirmed');

-- 0064 to 0065: prompts, push, certificates
insert into public.reader_prompts (user_id, prompt) values
  ('a6700000-0000-0000-0000-00000000000d', 'passkey'), ('a6700000-0000-0000-0000-00000000000f', 'passkey');
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values
  ('a6700000-0000-0000-0000-00000000000d', 'https://push.example/gone', 'k', 'a'), ('a6700000-0000-0000-0000-00000000000f', 'https://push.example/friend', 'k', 'a');
insert into public.push_log (user_id, local_date) values
  ('a6700000-0000-0000-0000-00000000000d', current_date), ('a6700000-0000-0000-0000-00000000000f', current_date);
insert into public.certificates (user_id, enrolment_id, holder_name) values
  ('a6700000-0000-0000-0000-00000000000d', 'a6700000-0000-0000-0000-0000000000e1', 'Gone'), ('a6700000-0000-0000-0000-00000000000f', 'a6700000-0000-0000-0000-0000000000e2', 'Friend');

-- 0066: a pair between the two, with a finish and a nudge each way
insert into public.programme_pairs (id, workbook_id, tenant_id, inviter_id, friend_id, inviter_label, friend_label, status, accepted_at) values
  ('a6700000-0000-0000-0000-000000000661', 'a6700000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000a', 'a6700000-0000-0000-0000-00000000000d', 'a6700000-0000-0000-0000-00000000000f', 'Gone', 'Friend', 'active', now());
insert into public.pair_finishes (pair_id, user_id, local_date) values
  ('a6700000-0000-0000-0000-000000000661', 'a6700000-0000-0000-0000-00000000000d', current_date), ('a6700000-0000-0000-0000-000000000661', 'a6700000-0000-0000-0000-00000000000f', current_date);
insert into public.pair_nudges (pair_id, from_user, to_user, code, local_date) values
  ('a6700000-0000-0000-0000-000000000661', 'a6700000-0000-0000-0000-00000000000d', 'a6700000-0000-0000-0000-00000000000f', 'nice_one', current_date),
  ('a6700000-0000-0000-0000-000000000661', 'a6700000-0000-0000-0000-00000000000f', 'a6700000-0000-0000-0000-00000000000d', 'no_rush', current_date);

-- The reader asks to be deleted and the undo window passes.
insert into public.account_deletion_requests (user_id, requested_at) values ('a6700000-0000-0000-0000-00000000000d', now() - interval '8 days');
update public.account_deletion_requests set requested_at = now() - interval '8 days' where user_id = 'a6700000-0000-0000-0000-00000000000d';

create or replace function pg_temp.as_service() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "service_role"}'::text, true);
  execute 'set local role service_role';
end $$;

-- ---------------------------------------------------------------------------
-- 1. Only the service role may run the eraser
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role": "authenticated"}', true);
do $$ begin
  begin
    perform app.erase_phase_b('a6700000-0000-0000-0000-00000000000d', null);
    raise exception 'the eraser ran without the service role';
  exception when insufficient_privilege then null; end;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The job, then the auth user (as auth.admin.deleteUser would)
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
do $$ declare ids uuid[]; begin
  select array_agg(user_id) into ids from public.complete_due_deletions();
  if ids is distinct from array['a6700000-0000-0000-0000-00000000000d'::uuid] then
    raise exception 'job should return only the gone reader, returned %', ids;
  end if;
end $$;
reset role;

-- Phase B records are already gone when the job finishes, before the auth user is removed.
do $$
declare t text; n int;
begin
  foreach t in array array['reader_marks','then_now_entries','habit_settings','milestone_marks','referral_codes','member_attributions','author_follows',
                           'push_subscriptions','push_log','certificates','reader_prompts','marketing_optouts','winback_log','student_verifications'] loop
    execute format('select count(*) from public.%I where user_id = %L', t, 'a6700000-0000-0000-0000-00000000000d') into n;
    if n <> 0 then raise exception '% still holds % row(s) for the deleted reader after the job', t, n; end if;
  end loop;
  if exists (select 1 from public.referrals where referrer_id = 'a6700000-0000-0000-0000-00000000000d' or referred_id = 'a6700000-0000-0000-0000-00000000000d') then
    raise exception 'referrals survived the job'; end if;
  if exists (select 1 from public.account_credits where user_id = 'a6700000-0000-0000-0000-00000000000d') then raise exception 'credits survived the job'; end if;
  if exists (select 1 from public.programme_pairs where inviter_id = 'a6700000-0000-0000-0000-00000000000d' or friend_id = 'a6700000-0000-0000-0000-00000000000d') then
    raise exception 'pairs survived the job'; end if;
  if exists (select 1 from public.pair_finishes) or exists (select 1 from public.pair_nudges) then raise exception 'pair finishes or nudges survived'; end if;
  if exists (select 1 from public.newsletter_subscribers where email = 'gone67@test') then raise exception 'the newsletter subscription survived'; end if;
end $$;

-- The audit row counts the Phase B records.
do $$ begin
  if not exists (select 1 from public.audit_log where action = 'account.deletion_completed' and (after ->> 'phase_b_deleted')::int > 0) then
    raise exception 'the audit row does not count Phase B records';
  end if;
end $$;

-- The auth user goes. This used to fail on two foreign keys.
delete from auth.users where id = 'a6700000-0000-0000-0000-00000000000d';

-- ---------------------------------------------------------------------------
-- 3. What outlives the user holds nothing personal
-- ---------------------------------------------------------------------------
do $$ begin
  -- The claimed gift stays for the ledger, with no giver and no address.
  if not exists (select 1 from public.workbook_gifts where id = 'a6700000-0000-0000-0000-000000000531' and giver_id is null and recipient_email is null and recipient_norm like 'erased:%') then
    raise exception 'the claimed gift kept personal data or was lost'; end if;
  -- The unclaimed gift is gone.
  if exists (select 1 from public.workbook_gifts where id = 'a6700000-0000-0000-0000-000000000532') then raise exception 'an unclaimed gift survived'; end if;
  -- A gift the reader received no longer carries the address or the link.
  if not exists (select 1 from public.workbook_gifts where id = 'a6700000-0000-0000-0000-000000000533' and claimed_by is null and recipient_email is null) then
    raise exception 'a received gift kept the address'; end if;
  -- The friend's own gift is untouched.
  if not exists (select 1 from public.workbook_gifts where id = 'a6700000-0000-0000-0000-000000000534' and recipient_email = 'keep67@test') then
    raise exception 'another reader''s gift was changed'; end if;

  -- Gift memberships stay as purchase records without names, messages or addresses.
  if exists (select 1 from public.gift_memberships where id in ('a6700000-0000-0000-0000-000000000541', 'a6700000-0000-0000-0000-000000000542')
             and (recipient_email is not null or recipient_name is not null or sender_name is not null or message is not null or claim_token is not null)) then
    raise exception 'a gift membership kept personal data'; end if;
  -- A paid gift still waiting to be claimed stays claimable, without the buyer's name.
  if not exists (select 1 from public.gift_memberships where id = 'a6700000-0000-0000-0000-000000000543' and buyer_id is null and sender_name is null and claim_token is not null) then
    raise exception 'a waiting gift was broken or kept the buyer''s name'; end if;
  if not exists (select 1 from public.gift_memberships where id = 'a6700000-0000-0000-0000-000000000544' and message = 'Keep me' and recipient_email = 'other67@test.com') then
    raise exception 'another reader''s gift membership was changed'; end if;

  -- Title requests stay as demand, unlinked and without the IP hash.
  if not exists (select 1 from public.title_requests where id = 'a6700000-0000-0000-0000-000000000561' and user_id is null and ip_hash is null) then
    raise exception 'a title request still points at the reader'; end if;
  if not exists (select 1 from public.title_requests where id = 'a6700000-0000-0000-0000-000000000562' and user_id is not null and ip_hash is not null) then
    raise exception 'another reader''s title request was changed'; end if;

  -- The bundle purchase is a tax record: kept, no longer linked.
  if not exists (select 1 from public.bundle_purchases where id = 'a6700000-0000-0000-0000-000000000551' and user_id is null) then
    raise exception 'the bundle purchase was lost or still linked'; end if;

  -- The referrer's credit stays, with no link to the friend who left.
  if not exists (select 1 from public.account_credits where user_id = 'a6700000-0000-0000-0000-00000000000f' and referral_id is null and amount_minor = 500) then
    raise exception 'the referrer''s credit was lost or still linked'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. The other reader loses nothing of their own
-- ---------------------------------------------------------------------------
do $$
declare t text; n int;
begin
  foreach t in array array['reader_marks','then_now_entries','habit_settings','milestone_marks','referral_codes','member_attributions','author_follows',
                           'push_subscriptions','push_log','certificates','reader_prompts','marketing_optouts','winback_log','student_verifications'] loop
    execute format('select count(*) from public.%I where user_id = %L', t, 'a6700000-0000-0000-0000-00000000000f') into n;
    if n <> 1 then raise exception '% lost or gained rows for the other reader, now %', t, n; end if;
  end loop;
  if not exists (select 1 from public.newsletter_subscribers where email = 'friend67@test') then raise exception 'another subscriber was removed'; end if;
  if (select count(*) from public.enrolments where user_id = 'a6700000-0000-0000-0000-00000000000f') <> 1 then raise exception 'another reader lost an enrolment'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. The funnel counter takes the Phase B events and nothing else
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
select public.record_funnel_event('streak_turned_on', '00000000-0000-0000-0000-00000000000a');
select public.record_funnel_event('quote_image_made', '00000000-0000-0000-0000-00000000000a', 'a6700000-0000-0000-0000-0000000000c1', null, repeat('a', 64));
select public.record_funnel_event('quote_image_made', '00000000-0000-0000-0000-00000000000a', 'a6700000-0000-0000-0000-0000000000c1', null, repeat('a', 64));
select public.record_funnel_event('page_view', '00000000-0000-0000-0000-00000000000a');
do $$ begin
  begin
    perform public.record_funnel_event('answer_text_was_here', '00000000-0000-0000-0000-00000000000a');
    raise exception 'an unknown event was counted';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;
do $$
declare cnt int; u int;
begin
  select f.n, f.uniques into cnt, u from public.funnel_counts f where f.event = 'quote_image_made' and f.day = (now() at time zone 'utc')::date;
  if cnt <> 2 or u <> 1 then raise exception 'quote_image_made counted % with % uniques', cnt, u; end if;
  if (select count(*) from public.funnel_counts where event in ('streak_turned_on', 'page_view')) <> 2 then raise exception 'events were lost'; end if;
  begin
    insert into public.funnel_counts (day, event, tenant_id) values (current_date, 'not_an_event', '00000000-0000-0000-0000-00000000000a');
    raise exception 'the table took an unknown event';
  exception when check_violation then null; end;
  -- Every name the app knows is accepted: 11 from before plus 35 new.
  if cardinality(app.funnel_event_names()) <> 46 then raise exception 'expected 46 events, found %', cardinality(app.funnel_event_names()); end if;
end $$;

rollback;
