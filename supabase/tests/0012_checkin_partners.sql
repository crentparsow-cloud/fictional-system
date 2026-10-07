-- Check-in partners (0012): RLS, token links, share levels, the wellbeing
-- choice, rate limits and stopping. Each block must raise or return the
-- expected value; a failure aborts the script and the CI step.
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('a0120000-0000-0000-0000-000000000001', 'reader-12a@test.example'),
  ('a0120000-0000-0000-0000-000000000002', 'reader-12b@test.example'),
  ('a0120000-0000-0000-0000-000000000003', 'reader-12c@test.example'),
  ('a0120000-0000-0000-0000-000000000004', 'reader-12d@test.example');

insert into public.organisations (id, kind, legal_name, display_name, slug, country) values
  ('a0120000-0000-0000-0000-0000000000f1', 'publisher', 'Org Twelve Ltd', 'Org Twelve', 'org-twelve', 'GB');
insert into public.books (id, org_id, slug, title, rights_status, is_demo) values
  ('a0120000-0000-0000-0000-0000000000b1', 'a0120000-0000-0000-0000-0000000000f1', 'book-twelve', 'Book Twelve', 'licensed', false),
  ('a0120000-0000-0000-0000-0000000000b2', 'a0120000-0000-0000-0000-0000000000f1', 'book-twelve-w', 'Book Twelve W', 'licensed', false);

-- A productivity title (tier none) and a wellbeing title (tier standard).
-- Two stages: stage one is units 1 and 2, stage two is unit 3.
insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, depth, badge, is_demo, status, safety_tier) values
  ('a0120000-0000-0000-0000-0000000000c1', 'AK-PRTN1', 'a0120000-0000-0000-0000-0000000000b1', 'a0120000-0000-0000-0000-0000000000f1',
   'workbook-twelve', 'Workbook Twelve', 'Card', 'productivity', 'full', 'official', false, 'live', 'none'),
  ('a0120000-0000-0000-0000-0000000000c2', 'AK-PRTW1', 'a0120000-0000-0000-0000-0000000000b2', 'a0120000-0000-0000-0000-0000000000f1',
   'workbook-twelve-w', 'Workbook Twelve W', 'Card', 'wellbeing', 'full', 'official', false, 'live', 'standard');
insert into public.workbook_versions (id, workbook_id, semver, content, content_hash, published_at) values
  ('a0120000-0000-0000-0000-0000000000d1', 'a0120000-0000-0000-0000-0000000000c1', '1.0.0',
   '{"schema_version": "3.0",
     "structure": {"unit": "week", "count": 3, "stages": [
        {"id": "begin", "number": 1, "name": "Begin", "units": [1, 2]},
        {"id": "keep", "number": 2, "name": "Keep", "units": [3]}]},
     "units": [
        {"number": 1, "stage": "begin", "focus": "f", "exercise_ids": ["ex_a", "ex_b"]},
        {"number": 2, "stage": "begin", "focus": "f", "exercise_ids": ["ex_c"]},
        {"number": 3, "stage": "keep", "focus": "f", "exercise_ids": ["ex_d"]}]}'::jsonb, repeat('c', 64), now()),
  ('a0120000-0000-0000-0000-0000000000d2', 'a0120000-0000-0000-0000-0000000000c2', '1.0.0',
   '{"schema_version": "3.0",
     "structure": {"unit": "week", "count": 1},
     "units": [{"number": 1, "focus": "f", "exercise_ids": ["ex_w"]}]}'::jsonb, repeat('d', 64), now());
update public.workbooks set current_version_id = 'a0120000-0000-0000-0000-0000000000d1' where id = 'a0120000-0000-0000-0000-0000000000c1';
update public.workbooks set current_version_id = 'a0120000-0000-0000-0000-0000000000d2' where id = 'a0120000-0000-0000-0000-0000000000c2';

insert into public.enrolments (id, user_id, tenant_id, workbook_id, version_id) values
  ('a0120000-0000-0000-0000-0000000000e1', 'a0120000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   'a0120000-0000-0000-0000-0000000000c1', 'a0120000-0000-0000-0000-0000000000d1'),
  ('a0120000-0000-0000-0000-0000000000e2', 'a0120000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a',
   'a0120000-0000-0000-0000-0000000000c2', 'a0120000-0000-0000-0000-0000000000d2');

create or replace function pg_temp.as_service() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "service_role"}'::text, true);
  execute 'set local role service_role';
end $$;

-- sha256 hex of a test token, the way the server hashes them.
create or replace function pg_temp.h(p text) returns text
language sql immutable as $$ select encode(sha256(convert_to(p, 'UTF8')), 'hex') $$;
grant execute on function pg_temp.h(text) to public;

-- ---------------------------------------------------------------------------
-- 1. Clients cannot reach the tables or the server functions.
-- ---------------------------------------------------------------------------
select test_as('a0120000-0000-0000-0000-000000000001');
do $$ begin
  begin perform 1 from public.partner_tokens; raise exception 'reader read partner_tokens';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.partner_sends; raise exception 'reader read partner_sends';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.partner_blocks; raise exception 'reader read partner_blocks';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.partners (user_id, reader_name, partner_name, partner_email, email_hash, share_level, invite_expires_at)
    values ('a0120000-0000-0000-0000-000000000001', 'Sam', 'Jo', 'jo@test.example', repeat('a', 64), 1, now() + interval '1 day');
    raise exception 'reader inserted a partner row';
  exception when insufficient_privilege then null; end;
  begin
    perform public.partner_invite('a0120000-0000-0000-0000-000000000001', 'Sam', 'Jo', 'jo@test.example', 1, false, repeat('a', 64), repeat('b', 64));
    raise exception 'reader called partner_invite';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.partner_link_act(repeat('a', 64), 'accept');
    raise exception 'reader called partner_link_act';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.partner_stage_update('a0120000-0000-0000-0000-0000000000e1', repeat('a', 64), repeat('b', 64));
    raise exception 'reader called partner_stage_update';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role anon;
do $$ begin
  begin perform 1 from public.partners; raise exception 'anon read partners';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.partner_replies; raise exception 'anon read partner_replies';
  exception when insufficient_privilege then null; end;
  begin perform public.partner_stop(); raise exception 'anon called partner_stop';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 2. Invite: validation, self, and one active partner.
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
do $$ declare v uuid; begin
  begin
    perform public.partner_invite('a0120000-0000-0000-0000-000000000001', 'Sam', 'Jo', 'not-an-email', 1, false, pg_temp.h('x1'), pg_temp.h('x2'));
    raise exception 'bad email accepted';
  exception when sqlstate 'AKP02' then null; end;
  begin
    perform public.partner_invite('a0120000-0000-0000-0000-000000000001', 'Sam', 'Jo <b>', 'jo@test.example', 1, false, pg_temp.h('x1'), pg_temp.h('x2'));
    raise exception 'markup in a name accepted';
  exception when sqlstate 'AKP02' then null; end;
  begin
    perform public.partner_invite('a0120000-0000-0000-0000-000000000001', 'Sam', 'Jo', 'jo@test.example', 4, false, pg_temp.h('x1'), pg_temp.h('x2'));
    raise exception 'share level 4 accepted';
  exception when sqlstate 'AKP02' then null; end;
  begin
    perform public.partner_invite('a0120000-0000-0000-0000-000000000001', 'Sam', 'Me', 'Reader-12A@test.example', 1, false, pg_temp.h('x1'), pg_temp.h('x2'));
    raise exception 'self invite accepted';
  exception when sqlstate 'AKP03' then null; end;

  v := public.partner_invite('a0120000-0000-0000-0000-000000000001', 'Sam', 'Jo', ' Jo@Test.Example ', 2, false, pg_temp.h('a-respond'), pg_temp.h('a-report'));
  if v is null then raise exception 'invite returned null'; end if;
  if (select partner_email from public.partners where id = v) <> 'jo@test.example' then
    raise exception 'address not stored lower case'; end if;
  if (select count(*) from public.partner_tokens where partner_id = v) <> 2 then
    raise exception 'invite did not store two token hashes'; end if;
  if exists (select 1 from public.partner_tokens where token_hash = 'a-respond') then
    raise exception 'a plain token was stored'; end if;

  begin
    perform public.partner_invite('a0120000-0000-0000-0000-000000000001', 'Sam', 'Kit', 'kit@test.example', 1, false, pg_temp.h('x3'), pg_temp.h('x4'));
    raise exception 'second active partner accepted';
  exception when sqlstate 'AKP05' then null; end;
end $$;
reset role;
do $$ begin
  if not exists (select 1 from public.audit_log where action = 'partner.invited') then
    raise exception 'the invitation was not audited'; end if;
  if exists (select 1 from public.audit_log where action like 'partner.%' and (coalesce(after::text, '') || coalesce(before::text, '')) ~* '(jo@|Jo"|Sam")') then
    raise exception 'an audit row holds an address or a name'; end if;
end $$;

-- The reader sees their own row; another reader sees nothing.
select test_as('a0120000-0000-0000-0000-000000000001');
do $$ begin
  if (select count(*) from public.partners) <> 1 then raise exception 'reader cannot see own partner'; end if;
end $$;
reset role;
select test_as('a0120000-0000-0000-0000-000000000002');
do $$ begin
  if (select count(*) from public.partners) <> 0 then raise exception 'reader sees another reader''s partner'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. Links: view by anyone holding one; act by the server; single purpose.
-- ---------------------------------------------------------------------------
set local role anon;
do $$ declare r record; begin
  select * into r from public.partner_link_view(pg_temp.h('nothing'));
  if r.state <> 'unknown' or r.partner_name is not null then raise exception 'unknown link view %', r.state; end if;
  select * into r from public.partner_link_view('not-hex');
  if r.state <> 'unknown' then raise exception 'malformed link view %', r.state; end if;
  select * into r from public.partner_link_view(pg_temp.h('a-respond'));
  if r.state <> 'ok' or r.purpose <> 'respond' or r.partner_status <> 'invited' or r.reader_name <> 'Sam' or r.share_level <> 2 then
    raise exception 'respond link view wrong: % % % %', r.state, r.purpose, r.partner_status, r.reader_name; end if;
end $$;
reset role;

select pg_temp.as_service();
do $$ declare r record; begin
  -- A report token cannot accept.
  select * into r from public.partner_link_act(pg_temp.h('a-report'), 'accept');
  if r.outcome <> 'unknown' then raise exception 'report token accepted: %', r.outcome; end if;
  -- An unknown action does nothing.
  select * into r from public.partner_link_act(pg_temp.h('a-respond'), 'delete');
  if r.outcome <> 'unknown' then raise exception 'unknown action: %', r.outcome; end if;

  select * into r from public.partner_link_act(pg_temp.h('a-respond'), 'accept');
  if r.outcome <> 'accepted' or r.reader_email <> 'reader-12a@test.example' or r.partner_name <> 'Jo' then
    raise exception 'accept wrong: % %', r.outcome, r.reader_email; end if;
  if r.partner_email is not null then raise exception 'accept returned the partner address'; end if;
  select * into r from public.partner_link_act(pg_temp.h('a-respond'), 'accept');
  if r.outcome <> 'already' then raise exception 'second accept: %', r.outcome; end if;
  select * into r from public.partner_link_act(pg_temp.h('a-respond'), 'decline');
  if r.outcome <> 'inactive' then raise exception 'decline after accept: %', r.outcome; end if;
end $$;
reset role;

set local role anon;
do $$ declare r record; begin
  select * into r from public.partner_link_view(pg_temp.h('a-respond'));
  if r.state <> 'used' or r.partner_status <> 'accepted' then raise exception 'used link view: % %', r.state, r.partner_status; end if;
end $$;
reset role;

-- An expired link does nothing.
update public.partner_tokens set created_at = now() - interval '70 days', expires_at = now() - interval '1 minute'
 where token_hash = pg_temp.h('a-report');
select pg_temp.as_service();
do $$ declare r record; begin
  select * into r from public.partner_link_act(pg_temp.h('a-report'), 'report');
  if r.outcome <> 'expired' then raise exception 'expired report: %', r.outcome; end if;
  if exists (select 1 from public.partner_blocks) then raise exception 'expired report blocked an address'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. Stage updates: computed from progress, once per stage, capped weekly.
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
do $$ declare r record; begin
  select * into r from public.partner_stage_update('a0120000-0000-0000-0000-0000000000e1', pg_temp.h('s1-stop'), pg_temp.h('s1-reply'));
  if r.outcome <> 'no_stage' then raise exception 'no progress gave %', r.outcome; end if;
end $$;
reset role;

-- Unit 1 fully done and unit 2 by its check-in: stage one is complete.
insert into public.progress_events (enrolment_id, kind, ref) values
  ('a0120000-0000-0000-0000-0000000000e1', 'step_done', 'ex_a'),
  ('a0120000-0000-0000-0000-0000000000e1', 'step_done', 'ex_b'),
  ('a0120000-0000-0000-0000-0000000000e1', 'step_done', 'ex_d');
do $$ begin
  if exists (select 1 from app.partner_stage_reached('a0120000-0000-0000-0000-0000000000e1')) then
    raise exception 'stage reached with unit 2 undone'; end if;
end $$;
insert into public.progress_events (enrolment_id, kind, ref) values
  ('a0120000-0000-0000-0000-0000000000e1', 'checkin_done', '2');

select pg_temp.as_service();
do $$ declare r record; begin
  -- Stage two (ex_d) counted only once stage one was done too. Both are
  -- done now, so stage two is the one reported.
  select * into r from public.partner_stage_update('a0120000-0000-0000-0000-0000000000e1', pg_temp.h('s1-stop'), pg_temp.h('s1-reply'));
  if r.outcome <> 'send' or r.stage_number <> 2 or r.stage_count <> 2 or r.share_level <> 2 or r.partner_email <> 'jo@test.example' then
    raise exception 'first update wrong: % % % %', r.outcome, r.stage_number, r.stage_count, r.share_level; end if;
  if r.note is not null then raise exception 'level 2 got a note'; end if;
  select * into r from public.partner_stage_update('a0120000-0000-0000-0000-0000000000e1', pg_temp.h('s2-stop'), pg_temp.h('s2-reply'));
  if r.outcome <> 'duplicate' then raise exception 'repeat stage gave %', r.outcome; end if;
end $$;
reset role;

-- The update row carries ids only, never a stage name.
do $$ begin
  if exists (select 1 from public.partner_sends where dedupe_key ilike '%keep%' or dedupe_key ilike '%begin%') then
    raise exception 'a stage name reached partner_sends'; end if;
end $$;

-- Weekly cap: a new stage within 7 days is held back.
delete from public.partner_sends where kind = 'update';
insert into public.partner_sends (partner_id, kind, sent_at)
  select id, 'update', now() - interval '2 days' from public.partners where user_id = 'a0120000-0000-0000-0000-000000000001';
select pg_temp.as_service();
do $$ declare r record; begin
  select * into r from public.partner_stage_update('a0120000-0000-0000-0000-0000000000e1', pg_temp.h('s3-stop'), pg_temp.h('s3-reply'));
  if r.outcome <> 'capped' then raise exception 'weekly cap gave %', r.outcome; end if;
end $$;
reset role;
update public.partner_sends set sent_at = now() - interval '8 days' where kind = 'update';

-- ---------------------------------------------------------------------------
-- 5. Share level 3 and the note: sent once, with the next update.
-- ---------------------------------------------------------------------------
select test_as('a0120000-0000-0000-0000-000000000001');
do $$ declare p public.partners; begin
  begin
    perform public.partner_settings(3, false, 'See https://example.com');
    raise exception 'a note with a link was accepted';
  exception when sqlstate 'AKP02' then null; end;
  begin
    perform public.partner_settings(3, false, 'mail me at x@y.z');
    raise exception 'a note with an address was accepted';
  exception when sqlstate 'AKP02' then null; end;
  p := public.partner_settings(3, false, 'Thank you for asking how I am.');
  if p.share_level <> 3 or p.note is null or p.note_sent_at is not null then raise exception 'settings not saved'; end if;
end $$;
reset role;

select pg_temp.as_service();
do $$ declare r record; begin
  select * into r from public.partner_stage_update('a0120000-0000-0000-0000-0000000000e1', pg_temp.h('s4-stop'), pg_temp.h('s4-reply'));
  if r.outcome <> 'send' or r.note is distinct from 'Thank you for asking how I am.' then
    raise exception 'level 3 update wrong: % %', r.outcome, r.note; end if;
end $$;
reset role;
do $$ begin
  if (select note_sent_at from public.partners where user_id = 'a0120000-0000-0000-0000-000000000001') is null then
    raise exception 'note not marked sent'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Replies: one per reply link, the reader reads them, nobody else does.
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
do $$ declare r record; begin
  select * into r from public.partner_link_act(pg_temp.h('s4-stop'), 'reply', 'hello');
  if r.outcome <> 'unknown' then raise exception 'stop token replied: %', r.outcome; end if;
  select * into r from public.partner_link_act(pg_temp.h('s4-reply'), 'reply', '   ');
  if r.outcome <> 'invalid_message' then raise exception 'empty reply: %', r.outcome; end if;
  select * into r from public.partner_link_act(pg_temp.h('s4-reply'), 'reply', repeat('a', 281));
  if r.outcome <> 'invalid_message' then raise exception 'long reply: %', r.outcome; end if;
  select * into r from public.partner_link_act(pg_temp.h('s4-reply'), 'reply', 'Proud of you. Coffee on Friday?');
  if r.outcome <> 'replied' then raise exception 'reply: %', r.outcome; end if;
  select * into r from public.partner_link_act(pg_temp.h('s4-reply'), 'reply', 'Again');
  if r.outcome <> 'already' then raise exception 'second reply on one link: %', r.outcome; end if;
end $$;
reset role;

select test_as('a0120000-0000-0000-0000-000000000001');
do $$ begin
  if (select count(*) from public.partner_replies) <> 1 then raise exception 'reader cannot read the reply'; end if;
end $$;
reset role;
select test_as('a0120000-0000-0000-0000-000000000002');
do $$ begin
  if (select count(*) from public.partner_replies) <> 0 then raise exception 'another reader read the reply'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 7. The reader stops sharing: every link dies and the partner is told.
-- ---------------------------------------------------------------------------
select test_as('a0120000-0000-0000-0000-000000000001');
do $$ declare r record; begin
  begin
    perform public.partner_forget();
    if (select count(*) from public.partners) <> 1 then raise exception 'forget removed an active partner'; end if;
  end;
  select * into r from public.partner_stop();
  if not r.notify or r.partner_email <> 'jo@test.example' then raise exception 'stop wrong: %', r.notify; end if;
  select * into r from public.partner_stop();
  if found and r.partner_id is not null then raise exception 'second stop returned a row'; end if;
end $$;
reset role;
do $$ begin
  if exists (select 1 from public.partner_tokens t join public.partners p on p.id = t.partner_id
              where p.user_id = 'a0120000-0000-0000-0000-000000000001' and t.revoked_at is null) then
    raise exception 'a token survived stop'; end if;
  if (select status || ':' || stopped_by from public.partners where user_id = 'a0120000-0000-0000-0000-000000000001') <> 'stopped:reader' then
    raise exception 'stop not recorded'; end if;
end $$;

set local role anon;
do $$ declare r record; begin
  select * into r from public.partner_link_view(pg_temp.h('s1-reply'));
  if r.state <> 'revoked' then raise exception 'revoked link view: %', r.state; end if;
end $$;
reset role;
select pg_temp.as_service();
do $$ declare r record; begin
  select * into r from public.partner_link_act(pg_temp.h('s1-stop'), 'stop');
  if r.outcome <> 'inactive' then raise exception 'revoked stop link acted: %', r.outcome; end if;
  select * into r from public.partner_link_act(pg_temp.h('s1-reply'), 'reply', 'hi');
  if r.outcome <> 'inactive' then raise exception 'revoked reply link acted: %', r.outcome; end if;
  select * into r from public.partner_stage_update('a0120000-0000-0000-0000-0000000000e1', pg_temp.h('s5-stop'), pg_temp.h('s5-reply'));
  if r.outcome <> 'no_partner' then raise exception 'stopped partner got an update: %', r.outcome; end if;
end $$;
reset role;

-- Removing the details afterwards deletes the row and the replies.
select test_as('a0120000-0000-0000-0000-000000000001');
do $$ begin
  if not public.partner_forget() then raise exception 'forget refused a stopped partner'; end if;
  if (select count(*) from public.partners) <> 0 then raise exception 'forget left the row'; end if;
end $$;
reset role;
do $$ begin
  if exists (select 1 from public.partner_replies) then raise exception 'replies outlived the partner'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Wellbeing titles need the reader's explicit choice. The partner stops.
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
do $$ declare r record; begin
  perform public.partner_invite('a0120000-0000-0000-0000-000000000002', 'Ali', 'Rae', 'rae@test.example', 1, false, pg_temp.h('b-respond'), pg_temp.h('b-report'));
  select * into r from public.partner_link_act(pg_temp.h('b-respond'), 'accept');
  if r.outcome <> 'accepted' then raise exception 'b accept: %', r.outcome; end if;
end $$;
reset role;
insert into public.progress_events (enrolment_id, kind, ref) values ('a0120000-0000-0000-0000-0000000000e2', 'step_done', 'ex_w');
select pg_temp.as_service();
do $$ declare r record; begin
  select * into r from public.partner_stage_update('a0120000-0000-0000-0000-0000000000e2', pg_temp.h('b1-stop'), pg_temp.h('b1-reply'));
  if r.outcome <> 'not_shared' then raise exception 'wellbeing shared without the choice: %', r.outcome; end if;
end $$;
reset role;
select test_as('a0120000-0000-0000-0000-000000000002');
do $$ declare p public.partners; begin
  p := public.partner_settings(1, true, null);
  if not p.include_wellbeing or p.wellbeing_chosen_at is null then raise exception 'wellbeing choice not recorded'; end if;
end $$;
reset role;
select pg_temp.as_service();
do $$ declare r record; begin
  select * into r from public.partner_stage_update('a0120000-0000-0000-0000-0000000000e2', pg_temp.h('b1-stop'), pg_temp.h('b1-reply'));
  if r.outcome <> 'send' or r.stage_number <> 1 or r.stage_count <> 1 then raise exception 'wellbeing after the choice: % %', r.outcome, r.stage_number; end if;
  select * into r from public.partner_link_act(pg_temp.h('b1-stop'), 'stop');
  if r.outcome <> 'stopped' or r.partner_email <> 'rae@test.example' then raise exception 'partner stop: %', r.outcome; end if;
  select * into r from public.partner_link_act(pg_temp.h('b1-stop'), 'stop');
  if r.outcome <> 'already' then raise exception 'second partner stop: %', r.outcome; end if;
end $$;
reset role;
do $$ begin
  if (select status || ':' || stopped_by from public.partners where user_id = 'a0120000-0000-0000-0000-000000000002') <> 'stopped:partner' then
    raise exception 'partner stop not recorded'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 9. Decline blocks the address for everyone. Report works too.
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
do $$ declare r record; begin
  perform public.partner_invite('a0120000-0000-0000-0000-000000000003', 'Cal', 'Noor', 'noor@test.example', 1, false, pg_temp.h('c-respond'), pg_temp.h('c-report'));
  select * into r from public.partner_link_act(pg_temp.h('c-respond'), 'decline');
  if r.outcome <> 'declined' then raise exception 'decline: %', r.outcome; end if;
  if not exists (select 1 from public.partner_blocks where email_hash = pg_temp.h('noor@test.example') and reason = 'declined') then
    raise exception 'decline did not block'; end if;
  begin
    perform public.partner_invite('a0120000-0000-0000-0000-000000000004', 'Dee', 'Noor', 'NOOR@test.example', 1, false, pg_temp.h('d-x1'), pg_temp.h('d-x2'));
    raise exception 'a declined address was invited again';
  exception when sqlstate 'AKP04' then null; end;
  -- The reader can invite someone else after a no.
  perform public.partner_invite('a0120000-0000-0000-0000-000000000003', 'Cal', 'Ola', 'ola@test.example', 1, false, pg_temp.h('c2-respond'), pg_temp.h('c2-report'));
  select * into r from public.partner_link_act(pg_temp.h('c2-report'), 'report');
  if r.outcome <> 'reported' then raise exception 'report: %', r.outcome; end if;
  if (select reason from public.partner_blocks where email_hash = pg_temp.h('ola@test.example')) <> 'reported' then
    raise exception 'report did not block'; end if;
  select * into r from public.partner_link_act(pg_temp.h('c2-respond'), 'accept');
  if r.outcome <> 'inactive' then raise exception 'accept after report: %', r.outcome; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 10. Rate limit: three invitations per reader in 30 days.
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
do $$ begin
  -- Reader 3 has sent two. A lapsed third is allowed, the fourth is not.
  update public.partners set status = 'invited', invite_expires_at = now() - interval '1 minute', responded_at = null
   where user_id = 'a0120000-0000-0000-0000-000000000003';
  perform public.partner_invite('a0120000-0000-0000-0000-000000000003', 'Cal', 'Pat', 'pat@test.example', 1, false, pg_temp.h('c3-respond'), pg_temp.h('c3-report'));
  update public.partners set invite_expires_at = now() - interval '1 minute' where user_id = 'a0120000-0000-0000-0000-000000000003';
  begin
    perform public.partner_invite('a0120000-0000-0000-0000-000000000003', 'Cal', 'Lou', 'lou@test.example', 1, false, pg_temp.h('c4-respond'), pg_temp.h('c4-report'));
    raise exception 'a fourth invitation in 30 days was sent';
  exception when sqlstate 'AKP29' then null; end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 11. Deletion: no invitations while pending; details go when it completes.
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
do $$ begin
  perform public.partner_invite('a0120000-0000-0000-0000-000000000004', 'Dee', 'Max', 'max@test.example', 1, false, pg_temp.h('d-respond'), pg_temp.h('d-report'));
end $$;
reset role;
insert into public.account_deletion_requests (user_id, requested_at) values ('a0120000-0000-0000-0000-000000000004', now());
select pg_temp.as_service();
do $$ begin
  begin
    perform public.partner_invite('a0120000-0000-0000-0000-000000000004', 'Dee', 'Una', 'una@test.example', 1, false, pg_temp.h('d2-respond'), pg_temp.h('d2-report'));
    raise exception 'invitation while deletion pending';
  exception when sqlstate 'AKP05' or sqlstate 'AKP06' then null; end;
end $$;
reset role;
update public.account_deletion_requests set completed_at = now() where user_id = 'a0120000-0000-0000-0000-000000000004';
do $$ begin
  if exists (select 1 from public.partners where user_id = 'a0120000-0000-0000-0000-000000000004') then
    raise exception 'partner details outlived the deletion'; end if;
end $$;

rollback;
\echo PASS 0012_checkin_partners
