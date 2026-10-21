-- 0066 Do a programme with a friend: opt-in invitation, status only, fixed
-- nudges, tier rule, flag rule, privacy between pairs, ending deletes.
-- Each block must raise or return the expected value; a failure aborts the script.
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('a6600000-0000-0000-0000-000000000001', 'inviter66@test'),
  ('a6600000-0000-0000-0000-000000000002', 'friend66@test'),
  ('a6600000-0000-0000-0000-000000000003', 'stranger66@test'),
  ('a6600000-0000-0000-0000-000000000004', 'noflag66@test');

insert into public.organisations (id, code, kind, legal_name, display_name, slug, country) values
  ('a6600000-0000-0000-0000-0000000000a1', 'PB-TD066', 'publisher', 'Org 66 Ltd', 'Org 66', 'org-66', 'GB');
insert into public.books (id, org_id, slug, title, rights_status) values
  ('a6600000-0000-0000-0000-0000000000b1', 'a6600000-0000-0000-0000-0000000000a1', 'book-66', 'Book 66', 'public_domain');
insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, safety_tier, depth, status) values
  ('a6600000-0000-0000-0000-0000000000c1', 'AK-T66A0', 'a6600000-0000-0000-0000-0000000000b1', 'a6600000-0000-0000-0000-0000000000a1', 'wb-66a', 'Plain Workbook 66', 'Card', 'productivity', 'none', 'full', 'live'),
  ('a6600000-0000-0000-0000-0000000000c2', 'AK-T66B0', 'a6600000-0000-0000-0000-0000000000b1', 'a6600000-0000-0000-0000-0000000000a1', 'wb-66b', 'Careful Workbook 66', 'Card', 'productivity', 'higher', 'full', 'live');
insert into public.workbook_versions (id, workbook_id, semver, content, content_hash) values
  ('a6600000-0000-0000-0000-0000000000d1', 'a6600000-0000-0000-0000-0000000000c1', '1.0.0', '{}'::jsonb, repeat('a', 64)),
  ('a6600000-0000-0000-0000-0000000000d2', 'a6600000-0000-0000-0000-0000000000c2', '1.0.0', '{}'::jsonb, repeat('b', 64));
insert into public.enrolments (id, user_id, tenant_id, workbook_id, version_id) values
  ('a6600000-0000-0000-0000-0000000000e1', 'a6600000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'a6600000-0000-0000-0000-0000000000c1', 'a6600000-0000-0000-0000-0000000000d1'),
  ('a6600000-0000-0000-0000-0000000000e2', 'a6600000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'a6600000-0000-0000-0000-0000000000c1', 'a6600000-0000-0000-0000-0000000000d1'),
  ('a6600000-0000-0000-0000-0000000000e3', 'a6600000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000a', 'a6600000-0000-0000-0000-0000000000c1', 'a6600000-0000-0000-0000-0000000000d1'),
  ('a6600000-0000-0000-0000-0000000000e4', 'a6600000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'a6600000-0000-0000-0000-0000000000c2', 'a6600000-0000-0000-0000-0000000000d2'),
  ('a6600000-0000-0000-0000-0000000000e5', 'a6600000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000a', 'a6600000-0000-0000-0000-0000000000c1', 'a6600000-0000-0000-0000-0000000000d1');

create or replace function pg_temp.as_service() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "service_role"}'::text, true);
  execute 'set local role service_role';
end $$;

-- ---------------------------------------------------------------------------
-- 1. Flags default off: nobody can make or accept a pairing
-- ---------------------------------------------------------------------------
select test_as('a6600000-0000-0000-0000-000000000001');
do $$ begin
  begin
    perform public.create_pair_invite('a6600000-0000-0000-0000-0000000000e1', repeat('a', 64), 'Sam');
    raise exception 'a pairing was made with the flag off';
  exception when feature_not_supported then null;
  end;
end $$;
reset role;
update public.feature_flags set enabled = true, rollout_percent = 100 where key = 'programme_friends';

-- ---------------------------------------------------------------------------
-- 2. Invite: own programme, tier none only, one per programme
-- ---------------------------------------------------------------------------
select test_as('a6600000-0000-0000-0000-000000000001');
do $$ begin
  begin perform public.create_pair_invite('a6600000-0000-0000-0000-0000000000e2', repeat('a', 64), 'Sam'); raise exception 'invited on someone else''s programme'; exception when insufficient_privilege then null; end;
  begin perform public.create_pair_invite('a6600000-0000-0000-0000-0000000000e4', repeat('a', 64), 'Sam'); raise exception 'a pairing on a higher tier title'; exception when object_not_in_prerequisite_state then null; end;
  begin perform public.create_pair_invite('a6600000-0000-0000-0000-0000000000e1', 'nothash', 'Sam'); raise exception 'accepted a bad hash'; exception when invalid_parameter_value then null; end;
  begin perform public.create_pair_invite('a6600000-0000-0000-0000-0000000000e1', repeat('a', 64), '<b>x</b>'); raise exception 'markup in a label'; exception when check_violation then null; end;
  perform public.create_pair_invite('a6600000-0000-0000-0000-0000000000e1', repeat('a', 64), 'Sam');
  begin perform public.create_pair_invite('a6600000-0000-0000-0000-0000000000e1', repeat('c', 64), 'Sam'); raise exception 'a second pairing on one programme'; exception when unique_violation then null; end;
  if (select count(*) from public.my_pairs()) <> 1 then raise exception 'the inviter should see the open invitation'; end if;
  if (select status from public.my_pairs()) <> 'invited' then raise exception 'wrong status'; end if;
end $$;
-- The tables cannot be read or written directly.
do $$ begin
  begin perform 1 from public.programme_pairs; raise exception 'a reader read the pairs table'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.pair_finishes; raise exception 'a reader read finishes'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.pair_nudges; raise exception 'a reader read nudges'; exception when insufficient_privilege then null; end;
  begin insert into public.pair_finishes (pair_id, user_id, local_date) values (gen_random_uuid(), 'a6600000-0000-0000-0000-000000000001', current_date); raise exception 'a reader wrote a finish'; exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. The accept page's lookup is service only, and tells nothing about the account
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
do $$ begin
  if (select state from public.pair_invite_state(repeat('a', 64))) <> 'open' then raise exception 'the invitation should be open'; end if;
  if (select inviter_label from public.pair_invite_state(repeat('a', 64))) <> 'Sam' then raise exception 'wrong label'; end if;
  if exists (select 1 from public.pair_invite_state(repeat('f', 64))) then raise exception 'an unknown token matched'; end if;
end $$;
reset role;
select test_as('a6600000-0000-0000-0000-000000000003');
do $$ begin
  begin perform public.pair_invite_state(repeat('a', 64)); raise exception 'a reader called the service lookup'; exception when insufficient_privilege then null; end;
  begin perform public.pair_channels_for('a6600000-0000-0000-0000-000000000001', 'a6600000-0000-0000-0000-0000000000c1'); raise exception 'a reader read pair channels'; exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. Accept: not yourself, not without the programme, not with the flag off, then joined
-- ---------------------------------------------------------------------------
select test_as('a6600000-0000-0000-0000-000000000001');
do $$ begin
  if public.accept_pair_invite(repeat('a', 64), 'Me') <> 'self' then raise exception 'accepted own invitation'; end if;
end $$;
reset role;
-- A reader with no enrolment in the programme.
insert into auth.users (id, email) values ('a6600000-0000-0000-0000-000000000005', 'unenrolled66@test');
select test_as('a6600000-0000-0000-0000-000000000005');
do $$ begin
  if public.accept_pair_invite(repeat('a', 64), 'Me') <> 'not_enrolled' then raise exception 'joined without starting the programme'; end if;
  if public.accept_pair_invite(repeat('9', 64), 'Me') <> 'invalid' then raise exception 'an unknown token was accepted'; end if;
  if public.accept_pair_invite('nope', 'Me') <> 'invalid' then raise exception 'a malformed token was accepted'; end if;
end $$;
reset role;

select test_as('a6600000-0000-0000-0000-000000000002');
do $$ begin
  if public.accept_pair_invite(repeat('a', 64), 'My sister') <> 'joined' then raise exception 'the friend could not join'; end if;
  if public.accept_pair_invite(repeat('a', 64), 'My sister') <> 'invalid' then raise exception 'the invitation worked twice'; end if;
  if (select friend_label from public.my_pairs()) <> 'Sam' then raise exception 'the friend should see the inviter''s label'; end if;
end $$;
reset role;
select test_as('a6600000-0000-0000-0000-000000000001');
do $$ begin
  if (select friend_label from public.my_pairs()) <> 'My sister' then raise exception 'the inviter should see the friend''s label'; end if;
  if (select status from public.my_pairs()) <> 'active' then raise exception 'the pair should be active'; end if;
end $$;
reset role;
-- A third reader sees nothing of the pair.
select test_as('a6600000-0000-0000-0000-000000000003');
do $$ begin
  if exists (select 1 from public.my_pairs()) then raise exception 'a stranger saw a pair'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 5. Status: a finished step marks the finisher only, and only the friend sees it
-- ---------------------------------------------------------------------------
select test_as('a6600000-0000-0000-0000-000000000002');
insert into public.progress_events (enrolment_id, kind, ref) values ('a6600000-0000-0000-0000-0000000000e2', 'unit_opened', '1');
do $$ begin
  if (select friend_finished_today from public.my_pairs()) then raise exception 'opening a unit is not a finished step'; end if;
end $$;
insert into public.progress_events (enrolment_id, kind, ref) values ('a6600000-0000-0000-0000-0000000000e2', 'step_done', 'plan_first_step~r');
do $$ begin
  if (select i_finished_today from public.my_pairs()) then raise exception 'a repeat should not count as a finished step'; end if;
end $$;
insert into public.progress_events (enrolment_id, kind, ref) values ('a6600000-0000-0000-0000-0000000000e2', 'step_done', 'plan_first_step');
-- A second finish the same day is still one mark.
insert into public.progress_events (enrolment_id, kind, ref) values ('a6600000-0000-0000-0000-0000000000e2', 'step_done', 'second_step');
do $$ begin
  if not (select i_finished_today from public.my_pairs()) then raise exception 'the finisher should see their own mark'; end if;
  if (select friend_finished_today from public.my_pairs()) then raise exception 'the finisher saw their own step as the friend''s'; end if;
end $$;
reset role;
select test_as('a6600000-0000-0000-0000-000000000001');
do $$ begin
  if not (select friend_finished_today from public.my_pairs()) then raise exception 'the inviter should see the friend finished'; end if;
  if (select i_finished_today from public.my_pairs()) then raise exception 'the inviter has not finished'; end if;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.pair_finishes) <> 1 then raise exception 'expected one finish row, got %', (select count(*) from public.pair_finishes); end if;
end $$;

-- A finish on a different programme, or by a non-member, marks nothing.
insert into public.progress_events (enrolment_id, kind, ref) values ('a6600000-0000-0000-0000-0000000000e3', 'step_done', 'plan_first_step');
insert into public.progress_events (enrolment_id, kind, ref) values ('a6600000-0000-0000-0000-0000000000e4', 'step_done', 'plan_first_step');
do $$ begin
  if (select count(*) from public.pair_finishes) <> 1 then raise exception 'a non-member''s step marked the pair'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Nudges: fixed codes, one a day, not to someone who has finished, from the sender
-- ---------------------------------------------------------------------------
select test_as('a6600000-0000-0000-0000-000000000001');
do $$ declare pid uuid; begin
  select pair_id into pid from public.my_pairs();
  if public.send_nudge(pid, 'free text here') <> 'invalid' then raise exception 'a free-text nudge was accepted'; end if;
  if public.send_nudge(pid, 'ready_when_you_are') <> 'already_finished' then raise exception 'nudged someone who has finished'; end if;
  if public.send_nudge(pid, 'nice_one') <> 'sent' then raise exception 'could not cheer a finish'; end if;
  if public.send_nudge(pid, 'nice_one') <> 'limit' then raise exception 'a second nudge on one day'; end if;
  if not (select nudge_sent_today from public.my_pairs()) then raise exception 'the sender should see that a nudge went'; end if;
end $$;
reset role;
select test_as('a6600000-0000-0000-0000-000000000002');
do $$ declare pid uuid; begin
  select pair_id into pid from public.my_pairs();
  if (select nudge_code from public.my_pairs()) <> 'nice_one' then raise exception 'the friend should receive the nudge code'; end if;
  -- The friend has not seen the sender's account, only the code.
  if public.send_nudge(pid, 'nice_one') <> 'not_yet' then raise exception 'cheered someone who has not finished'; end if;
  if public.send_nudge(pid, 'thinking_of_you') <> 'sent' then raise exception 'the friend could not nudge back'; end if;
end $$;
reset role;
-- A stranger cannot nudge into someone else's pair (the pair id is read as the superuser).
select test_as('a6600000-0000-0000-0000-000000000003');
do $$ declare pid uuid; begin
  reset role;
  select id into pid from public.programme_pairs where status = 'active';
  perform test_as('a6600000-0000-0000-0000-000000000003');
  if public.send_nudge(pid, 'no_rush') <> 'inactive' then raise exception 'a stranger nudged a pair'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 7. The server can find the channels to announce on, for members only
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
do $$ begin
  if (select count(*) from public.pair_channels_for('a6600000-0000-0000-0000-000000000002', 'a6600000-0000-0000-0000-0000000000c1')) <> 1 then raise exception 'channel not found for a member'; end if;
  if exists (select 1 from public.pair_channels_for('a6600000-0000-0000-0000-000000000003', 'a6600000-0000-0000-0000-0000000000c1')) then raise exception 'channel found for a non-member'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 8. Either side can end it; ending deletes the finishes and nudges
-- ---------------------------------------------------------------------------
select test_as('a6600000-0000-0000-0000-000000000003');
do $$ declare pid uuid; begin
  reset role;
  select id into pid from public.programme_pairs where status = 'active';
  perform test_as('a6600000-0000-0000-0000-000000000003');
  begin perform public.end_pair(pid); raise exception 'a stranger ended a pair'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select test_as('a6600000-0000-0000-0000-000000000002');
do $$ declare pid uuid; begin
  select pair_id into pid from public.my_pairs();
  perform public.end_pair(pid);
  if exists (select 1 from public.my_pairs()) then raise exception 'an ended pair still shows'; end if;
end $$;
reset role;
do $$ begin
  if exists (select 1 from public.pair_finishes) then raise exception 'finishes survived the end of a pair'; end if;
  if exists (select 1 from public.pair_nudges) then raise exception 'nudges survived the end of a pair'; end if;
  if (select status from public.programme_pairs) <> 'ended' then raise exception 'the pair should be ended'; end if;
end $$;
-- After ending, new steps mark nothing.
insert into public.progress_events (enrolment_id, kind, ref) values ('a6600000-0000-0000-0000-0000000000e2', 'step_done', 'third_step');
do $$ begin
  if exists (select 1 from public.pair_finishes) then raise exception 'a finished step marked an ended pair'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 9. A reader outside the flag cannot join (flag percent 0 means nobody)
-- ---------------------------------------------------------------------------
select test_as('a6600000-0000-0000-0000-000000000001');
select public.create_pair_invite('a6600000-0000-0000-0000-0000000000e1', repeat('d', 64), 'Sam');
reset role;
update public.feature_flags set rollout_percent = 0 where key = 'programme_friends';
select test_as('a6600000-0000-0000-0000-000000000004');
do $$ begin
  if public.accept_pair_invite(repeat('d', 64), 'Me') <> 'off' then raise exception 'joined with the flag off'; end if;
end $$;
reset role;

select set_config('request.jwt.claims', '', true);
rollback;
