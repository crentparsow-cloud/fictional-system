-- Author and publisher onboarding (0013): invitations, members, author
-- profiles and roster, imprints, books, licences, the live gate and
-- submissions. Each block must raise or return what is expected; a failure
-- aborts the script and the CI step.
\set ON_ERROR_STOP on

begin;

-- Staff: an editor and an owner. People: an author invited to a new sole
-- author organisation, a publisher owner, a publisher editor, an outsider.
insert into auth.users (id, email) values
  ('a1300000-0000-0000-0000-000000000001', 'editor@akana.test'),
  ('a1300000-0000-0000-0000-000000000002', 'owner@akana.test'),
  ('a1300000-0000-0000-0000-000000000011', 'ada@author.test'),
  ('a1300000-0000-0000-0000-000000000012', 'pat@publisher.test'),
  ('a1300000-0000-0000-0000-000000000013', 'ed@publisher.test'),
  ('a1300000-0000-0000-0000-000000000014', 'out@sider.test'),
  ('a1300000-0000-0000-0000-000000000015', 'demo@demo.test');

insert into public.organisations (id, code, kind, legal_name, display_name, slug, country, is_demo) values
  ('a1300000-0000-0000-0000-0000000000a1', 'AU-T13AA', 'individual', 'Ada Lane', 'Ada Lane', 'ada-lane-t13', 'GB', false),
  ('a1300000-0000-0000-0000-0000000000a2', 'PB-T13BB', 'publisher', 'Pat Books Ltd', 'Pat Books', 'pat-books-t13', 'GB', false),
  ('a1300000-0000-0000-0000-0000000000a3', 'PB-T13CC', 'publisher', 'Demo House Ltd', 'Demo House', 'demo-house-t13', 'GB', true);
insert into public.org_members (org_id, user_id, role) values
  ('a1300000-0000-0000-0000-0000000000a2', 'a1300000-0000-0000-0000-000000000012', 'owner'),
  ('a1300000-0000-0000-0000-0000000000a3', 'a1300000-0000-0000-0000-000000000015', 'owner');

create temporary table t13 (k text primary key, val text);
grant select, insert, update on t13 to authenticated;

create or replace function pg_temp.as_anon() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "anon"}'::text, true);
  execute 'set local role anon';
end $$;

-- ---------------------------------------------------------------------------
-- 1. Invitations: only staff invite an owner; outsiders and editors cannot invite.
-- ---------------------------------------------------------------------------
select test_as('a1300000-0000-0000-0000-000000000001', array['editor']);
do $$ declare v uuid; begin
  v := public.org_invite('a1300000-0000-0000-0000-0000000000a1', '  Ada@Author.TEST ', 'owner', null, repeat('a', 64));
  insert into t13 values ('ada_invite', v::text);
  begin
    perform public.org_invite('a1300000-0000-0000-0000-0000000000a1', 'ada@author.test', 'owner', null, repeat('a', 64));
    raise exception 'a reused token hash was accepted';
  exception when unique_violation then null; end;
  begin
    perform public.org_invite('a1300000-0000-0000-0000-0000000000a1', 'not-an-email', 'owner', null, repeat('b', 64));
    raise exception 'a bad address was accepted';
  exception when sqlstate 'AKS02' then null; end;
  begin
    perform public.org_invite('00000000-0000-0000-0000-000000000001', 'x@y.test', 'editor', null, repeat('c', 64));
    raise exception 'staff invited someone to the Akana house organisation';
  exception when sqlstate 'AKS02' then null; end;
end $$;
reset role;

select test_as('a1300000-0000-0000-0000-000000000014');
do $$ begin
  begin
    perform public.org_invite('a1300000-0000-0000-0000-0000000000a2', 'friend@x.test', 'editor', null, repeat('d', 64));
    raise exception 'an outsider invited someone';
  exception when sqlstate 'AKS01' then null; end;
end $$;
reset role;

select test_as('a1300000-0000-0000-0000-000000000012');
do $$ declare v uuid; begin
  begin
    perform public.org_invite('a1300000-0000-0000-0000-0000000000a2', 'co@publisher.test', 'owner', null, repeat('e', 64));
    raise exception 'an organisation owner invited a second owner';
  exception when sqlstate 'AKS01' then null; end;
  v := public.org_invite('a1300000-0000-0000-0000-0000000000a2', 'ed@publisher.test', 'editor', null, repeat('f', 64));
  insert into t13 values ('ed_invite', v::text);
  -- The owner sees the invitation, but never the token hash.
  perform id, email, role, expires_at from public.org_invitations where id = v;
  begin
    perform token_hash from public.org_invitations;
    raise exception 'token_hash was readable';
  exception when insufficient_privilege then null; end;
  -- A second invitation to the same address replaces the first.
  v := public.org_invite('a1300000-0000-0000-0000-0000000000a2', 'ed@publisher.test', 'editor', null, repeat('0', 64));
  if (select count(*) from public.org_invitations where email = 'ed@publisher.test' and revoked_at is null) <> 1 then
    raise exception 'two open invitations to one address';
  end if;
  update t13 set val = v::text where k = 'ed_invite';
end $$;
reset role;

-- The outsider cannot see another organisation's invitations.
select test_as('a1300000-0000-0000-0000-000000000014');
do $$ begin
  if (select count(*) from public.org_invitations) <> 0 then raise exception 'an outsider read invitations'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 2. View and accept: masked address, email-bound, single use.
-- ---------------------------------------------------------------------------
select pg_temp.as_anon();
do $$ declare r record; begin
  select * into r from public.org_invite_view(repeat('a', 64));
  if r.state <> 'ok' or r.organisation_name <> 'Ada Lane' or r.role <> 'owner' or r.email_hint <> 'a***@author.test' then
    raise exception 'view returned %', r; end if;
  select * into r from public.org_invite_view(repeat('9', 64));
  if r.state <> 'unknown' then raise exception 'an unknown token said %', r.state; end if;
  select * into r from public.org_invite_view('not a hash');
  if r.state <> 'unknown' then raise exception 'a malformed token said %', r.state; end if;
  begin
    perform public.org_invite_accept(repeat('a', 64));
    raise exception 'anon accepted an invitation';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select test_as('a1300000-0000-0000-0000-000000000014');
do $$ begin
  begin
    perform public.org_invite_accept(repeat('a', 64));
    raise exception 'the wrong person accepted';
  exception when sqlstate 'AKS03' then null; end;
end $$;
reset role;

select test_as('a1300000-0000-0000-0000-000000000011');
do $$ declare r record; begin
  select * into r from public.org_invite_accept(repeat('a', 64));
  if r.org_id <> 'a1300000-0000-0000-0000-0000000000a1' or r.role <> 'owner' then raise exception 'accept returned %', r; end if;
  if not app.is_org_member('a1300000-0000-0000-0000-0000000000a1', array['owner']) then raise exception 'Ada is not an owner'; end if;
  begin
    perform public.org_invite_accept(repeat('a', 64));
    raise exception 'an invitation worked twice';
  exception when sqlstate 'AKS04' then null; end;
end $$;
reset role;

-- An expired link says so and cannot be used.
update public.org_invitations set expires_at = now() - interval '1 minute', created_at = now() - interval '15 days'
 where id = (select val::uuid from t13 where k = 'ed_invite');
select test_as('a1300000-0000-0000-0000-000000000013');
do $$ declare r record; begin
  select * into r from public.org_invite_view(repeat('0', 64));
  if r.state <> 'expired' then raise exception 'an expired link said %', r.state; end if;
  begin
    perform public.org_invite_accept(repeat('0', 64));
    raise exception 'an expired invitation was accepted';
  exception when sqlstate 'AKS04' then null; end;
end $$;
reset role;

-- Resend gives a fresh link and window; the old hash stops working.
select test_as('a1300000-0000-0000-0000-000000000012');
do $$ begin
  perform public.org_invite_resend((select val::uuid from t13 where k = 'ed_invite'), repeat('1', 64));
end $$;
reset role;
select test_as('a1300000-0000-0000-0000-000000000013');
do $$ declare r record; begin
  select * into r from public.org_invite_view(repeat('0', 64));
  if r.state <> 'unknown' then raise exception 'the old hash still resolves: %', r.state; end if;
  select * into r from public.org_invite_accept(repeat('1', 64));
  if r.role <> 'editor' then raise exception 'Ed joined as %', r.role; end if;
end $$;
reset role;

-- Revoke closes a link.
select test_as('a1300000-0000-0000-0000-000000000012');
do $$ declare v uuid; begin
  v := public.org_invite('a1300000-0000-0000-0000-0000000000a2', 'gone@publisher.test', 'viewer', null, repeat('2', 64));
  if not public.org_invite_revoke(v) then raise exception 'revoke returned false'; end if;
  if (select state from public.org_invite_view(repeat('2', 64))) <> 'revoked' then raise exception 'a revoked link still works'; end if;
  -- Inviting an existing member is refused.
  begin
    perform public.org_invite('a1300000-0000-0000-0000-0000000000a2', 'ed@publisher.test', 'viewer', null, repeat('3', 64));
    raise exception 'a member was invited again';
  exception when sqlstate 'AKS05' then null; end;
end $$;
reset role;

-- Rate limit: 20 invitations and resends per organisation a day.
insert into public.audit_log (action, target, org_id) select 'org.invited', 'x', 'a1300000-0000-0000-0000-0000000000a2' from generate_series(1, 20);
select test_as('a1300000-0000-0000-0000-000000000012');
do $$ begin
  begin
    perform public.org_invite('a1300000-0000-0000-0000-0000000000a2', 'more@publisher.test', 'viewer', null, repeat('4', 64));
    raise exception 'the daily invitation limit did not hold';
  exception when sqlstate 'AKS29' then null; end;
end $$;
reset role;
delete from public.audit_log where target = 'x' and org_id = 'a1300000-0000-0000-0000-0000000000a2';

-- ---------------------------------------------------------------------------
-- 3. Members: roster, role changes, removal, the last owner.
-- ---------------------------------------------------------------------------
select test_as('a1300000-0000-0000-0000-000000000012');
do $$ declare n int; begin
  select count(*) into n from public.org_roster('a1300000-0000-0000-0000-0000000000a2');
  if n <> 2 then raise exception 'roster should list 2, saw %', n; end if;
  if (select email from public.org_roster('a1300000-0000-0000-0000-0000000000a2') where role = 'editor') <> 'ed@publisher.test' then
    raise exception 'roster email wrong'; end if;
  perform public.org_member_set_role('a1300000-0000-0000-0000-0000000000a2', 'a1300000-0000-0000-0000-000000000013', 'finance');
  begin
    perform public.org_member_set_role('a1300000-0000-0000-0000-0000000000a2', 'a1300000-0000-0000-0000-000000000013', 'owner');
    raise exception 'an owner made a second owner';
  exception when sqlstate 'AKS01' then null; end;
  begin
    perform public.org_member_set_role('a1300000-0000-0000-0000-0000000000a2', 'a1300000-0000-0000-0000-000000000012', 'editor');
    raise exception 'an owner stepped down without staff';
  exception when sqlstate 'AKS01' then null; end;
  perform public.org_member_set_role('a1300000-0000-0000-0000-0000000000a2', 'a1300000-0000-0000-0000-000000000013', 'editor');
end $$;
reset role;

select test_as('a1300000-0000-0000-0000-000000000013');
do $$ begin
  begin
    perform public.org_member_remove('a1300000-0000-0000-0000-0000000000a2', 'a1300000-0000-0000-0000-000000000012');
    raise exception 'an editor removed the owner';
  exception when sqlstate 'AKS01' then null; end;
end $$;
reset role;

-- Staff (platform owner) may transfer ownership, but the last owner stays.
select test_as('a1300000-0000-0000-0000-000000000002', array['owner']);
do $$ begin
  begin
    perform public.org_member_remove('a1300000-0000-0000-0000-0000000000a1', 'a1300000-0000-0000-0000-000000000011');
    raise exception 'the last owner was removed';
  exception when check_violation then null; end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. Authors: roster entries, profile, legal name, bio review.
-- ---------------------------------------------------------------------------
select test_as('a1300000-0000-0000-0000-000000000011');
do $$ declare v uuid; n int; begin
  v := public.author_save('a1300000-0000-0000-0000-0000000000a1', null, 'Ada Lane', 'Adeline Lane', 'gb',
         'https://adalane.example', '["https://social.example/ada"]'::jsonb, 'en-GB', true, true);
  insert into t13 values ('ada_author', v::text);
  if not (select is_me from public.studio_authors('a1300000-0000-0000-0000-0000000000a1') where id = v) then
    raise exception 'the profile was not linked to Ada'; end if;
  select count(*) into n from public.studio_authors('a1300000-0000-0000-0000-0000000000a1') where legal_name = 'Adeline Lane' and country = 'GB';
  if n <> 1 then raise exception 'Ada cannot see her own legal name'; end if;
  begin
    perform public.author_save('a1300000-0000-0000-0000-0000000000a1', v, 'Ada', null, null, 'http://insecure.example', '[]'::jsonb, 'en-GB', false);
    raise exception 'an http website was accepted';
  exception when sqlstate 'AKS02' then null; end;
  -- The public bio cannot be written directly.
  begin
    update public.authors set bio = 'Straight in' where id = v;
    raise exception 'an author wrote the public bio directly';
  exception when insufficient_privilege then null; end;
  perform public.author_bio_submit(v, E'I write about calm.\nThis cures anxiety.', '[{"phrase": "cures anxiety"}]'::jsonb);
  if (select bio_status from public.studio_authors('a1300000-0000-0000-0000-0000000000a1') where id = v) <> 'pending' then
    raise exception 'bio not pending'; end if;
  if (select bio_draft from public.studio_authors('a1300000-0000-0000-0000-0000000000a1') where id = v) not like E'%\n%' then
    raise exception 'the line break in the bio was lost'; end if;
  begin
    perform public.author_bio_review(v, true, 1, 'mine');
    raise exception 'an author approved their own bio';
  exception when sqlstate 'AKS01' then null; end;
end $$;
reset role;

-- The outsider cannot read the roster; legal_name is never selectable by clients.
select test_as('a1300000-0000-0000-0000-000000000014');
do $$ begin
  begin
    perform * from public.studio_authors('a1300000-0000-0000-0000-0000000000a1');
    raise exception 'an outsider read the roster';
  exception when sqlstate 'AKS01' then null; end;
  begin
    perform legal_name from public.authors;
    raise exception 'legal_name was selectable';
  exception when insufficient_privilege then null; end;
  begin
    perform bio_draft from public.authors;
    raise exception 'bio_draft was selectable';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.staff_pending_bios();
    raise exception 'an outsider listed pending bios';
  exception when sqlstate 'AKS01' then null; end;
end $$;
reset role;

select test_as('a1300000-0000-0000-0000-000000000001', array['editor']);
do $$ declare v uuid := (select val::uuid from t13 where k = 'ada_author'); begin
  if not exists (select 1 from public.staff_pending_bios() where author_id = v) then raise exception 'staff cannot see the pending bio'; end if;
  begin
    perform public.author_bio_review(v, true, 1, null);
    raise exception 'a flagged bio was approved without a reason';
  exception when sqlstate 'AKS02' then null; end;
  if public.author_bio_review(v, true, 1, 'Context reads as a personal story, not a claim') <> 'approved' then
    raise exception 'approve failed'; end if;
  if (select bio from public.authors where id = v) is null then raise exception 'the approved bio did not go public'; end if;
end $$;
reset role;
do $$ declare v uuid := (select val::uuid from t13 where k = 'ada_author'); begin
  if not exists (select 1 from public.audit_log where action = 'author.bio_approved' and target = 'author:' || v::text
                 and (after ->> 'override')::boolean and reason is not null) then
    raise exception 'the override was not logged'; end if;
end $$;

-- A publisher roster entry without a login, invited later and linked on accept.
select test_as('a1300000-0000-0000-0000-000000000012');
do $$ declare v uuid; i uuid; begin
  v := public.author_save('a1300000-0000-0000-0000-0000000000a2', null, 'Sam Field', null, 'GB', null, '[]'::jsonb, 'en-GB', false);
  insert into t13 values ('sam_author', v::text);
  perform public.imprint_save('a1300000-0000-0000-0000-0000000000a2', 'Quiet Press');
  insert into t13 values ('imprint', (select id::text from public.imprints where name = 'Quiet Press'));
  i := public.org_invite('a1300000-0000-0000-0000-0000000000a2', 'out@sider.test', 'author', v, repeat('5', 64));
end $$;
reset role;
select test_as('a1300000-0000-0000-0000-000000000014');
do $$ declare r record; begin
  select * into r from public.org_invite_accept(repeat('5', 64));
  if (select is_me from public.studio_authors('a1300000-0000-0000-0000-0000000000a2') where display_name = 'Sam Field') is not true then
    raise exception 'the roster entry was not linked on accept'; end if;
  -- An author role member edits their own profile, not anyone else's.
  perform public.author_save(null, (select val::uuid from t13 where k = 'sam_author'), 'Sam Field', 'Samuel Field', 'GB', null, '[]'::jsonb, 'en-GB', false);
end $$;
reset role;
select test_as('a1300000-0000-0000-0000-000000000012');
do $$ begin
  perform public.org_member_remove('a1300000-0000-0000-0000-0000000000a2', 'a1300000-0000-0000-0000-000000000014');
  if (select has_login from public.studio_authors('a1300000-0000-0000-0000-0000000000a2') where display_name = 'Sam Field') then
    raise exception 'the roster entry kept the login after removal'; end if;
end $$;
reset role;
select test_as('a1300000-0000-0000-0000-000000000014');
do $$ begin
  if app.is_org_member('a1300000-0000-0000-0000-0000000000a2') then raise exception 'a removed member still has access'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 5. Books: ISBNs, rights record, contributors.
-- ---------------------------------------------------------------------------
select test_as('a1300000-0000-0000-0000-000000000011');
do $$ declare v uuid; begin
  v := public.book_save('a1300000-0000-0000-0000-0000000000a1', null, 'Quiet Mornings', 'A short guide', 'Calm', 1,
         '2nd', 'en', '["978-0-306-40615-7"]'::jsonb, null, 'Self', null, 2021, 'wellbeing', 'own_work',
         'https://shop.example/quiet', true, 'no');
  insert into t13 values ('ada_book', v::text);
  if (select isbns from public.books where id = v) <> '["9780306406157"]'::jsonb then raise exception 'ISBN not normalised'; end if;
  if (select kdp_select from public.book_rights where book_id = v) is not false then raise exception 'KDP declaration not stored'; end if;
  perform public.book_contributor_set(v, (select val::uuid from t13 where k = 'ada_author'), 'author', null, 0, false);
  begin
    perform public.book_save('a1300000-0000-0000-0000-0000000000a1', null, 'Bad', null, null, null, null, 'en',
            '["12345"]'::jsonb, null, null, null, null, null, 'own_work', null, false, null);
    raise exception 'a bad ISBN was accepted';
  exception when sqlstate 'AKS02' then null; end;
  begin
    perform public.book_contributor_set(v, (select val::uuid from t13 where k = 'sam_author'), 'author', null, 0, false);
    raise exception 'another organisation''s author was credited';
  exception when sqlstate 'AKS02' then null; end;
end $$;
reset role;

select test_as('a1300000-0000-0000-0000-000000000012');
do $$ declare v uuid; begin
  begin
    perform public.book_save('a1300000-0000-0000-0000-0000000000a2', null, 'Copy', null, null, null, null, 'en',
            '["9780306406157"]'::jsonb, null, null, null, null, null, 'licensed', null, false, null);
    raise exception 'a duplicate ISBN was accepted';
  exception when sqlstate 'AKS05' then null; end;
  v := public.book_save('a1300000-0000-0000-0000-0000000000a2', null, 'Field Notes', null, null, null, null, 'en',
         '[]'::jsonb, null, 'Pat Books', (select val::uuid from t13 where k = 'imprint'), 2019, 'productivity', 'licensed', null, false, 'yes');
  insert into t13 values ('pat_book', v::text);
  if (select count(*) from public.book_rights where book_id = (select val::uuid from t13 where k = 'ada_book')) <> 0 then
    raise exception 'another organisation''s rights record was readable'; end if;
  begin
    perform public.book_save(null, (select val::uuid from t13 where k = 'ada_book'), 'Taken', null, null, null, null, 'en',
            '[]'::jsonb, null, null, null, null, null, 'licensed', null, false, null);
    raise exception 'another organisation''s book was edited';
  exception when sqlstate 'AKS01' then null; end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 6. Licences on the draft text.
-- ---------------------------------------------------------------------------
create or replace function pg_temp.sign(p_book uuid, p_version text, p_sha text, p_rights boolean default true)
returns void language plpgsql as $$
begin
  perform * from public.licence_accept(p_book, p_version, p_sha, array['WORLD'], '{}', 60, 12, true, true, false,
          p_rights, true, true, 'Ada Lane', 'Author and rights holder', repeat('c', 64));
end $$;
select test_as('a1300000-0000-0000-0000-000000000011');
do $$ declare b uuid := (select val::uuid from t13 where k = 'ada_book'); sha text := (select content_sha256 from public.licence_texts where version = '0.1.0-draft'); begin
  if (select status from public.licence_texts where version = '0.1.0-draft') <> 'draft' then raise exception 'licence text not draft'; end if;
  begin
    perform pg_temp.sign(b, '0.1.0-draft', sha);
    raise exception 'a real organisation signed the draft licence';
  exception when sqlstate 'AKS06' then null; end;
end $$;
reset role;

-- The demo organisation can sign the draft as a test. It never counts.
insert into public.books (id, org_id, slug, title) values
  ('a1300000-0000-0000-0000-0000000000c3', 'a1300000-0000-0000-0000-0000000000a3', 'demo-book-t13', 'Demo Book');
select test_as('a1300000-0000-0000-0000-000000000015');
do $$ declare r record; sha text := (select content_sha256 from public.licence_texts where version = '0.1.0-draft'); begin
  begin
    perform pg_temp.sign('a1300000-0000-0000-0000-0000000000c3', '0.1.0-draft', repeat('0', 64));
    raise exception 'a mismatched text hash was accepted';
  exception when sqlstate 'AKS08' then null; end;
  begin
    perform pg_temp.sign('a1300000-0000-0000-0000-0000000000c3', '0.1.0-draft', sha, false);
    raise exception 'a licence was signed without the rights warranty';
  exception when sqlstate 'AKS02' then null; end;
  select * into r from public.licence_accept('a1300000-0000-0000-0000-0000000000c3', '0.1.0-draft', sha, array['WORLD'], '{}', 60, 12,
    true, true, false, true, true, true, 'Demo Owner', 'Director', null);
  if r.licence_status <> 'test_only' or r.licence_ref !~ '^LIC-' then raise exception 'demo signature returned %', r; end if;
  if app.book_has_active_licence('a1300000-0000-0000-0000-0000000000c3') then raise exception 'a test signature counted'; end if;
end $$;
reset role;

-- Placeholder text can never be approved, even by a platform owner.
select test_as('a1300000-0000-0000-0000-000000000002', array['owner']);
do $$ begin
  begin
    perform public.licence_text_approve('0.1.0-draft', 'Lawyer said yes');
    raise exception 'the placeholder licence was approved';
  exception when sqlstate 'AKS06' then null; end;
end $$;
reset role;

-- A signed upload on the draft cannot be made active for a real organisation.
select test_as('a1300000-0000-0000-0000-000000000012');
do $$ declare r record; begin
  select * into r from public.licence_upload((select val::uuid from t13 where k = 'pat_book'), '0.1.0-draft',
    'a1300000-0000-0000-0000-0000000000a2/licences/a1300000-0000-0000-0000-00000000f001.pdf', repeat('d', 64),
    array['GB','IE'], '{}', 36, null, false, true, false, 'Pat Owner', 'Managing Director', null);
  if r.licence_status <> 'pending_verification' then raise exception 'upload returned %', r; end if;
  insert into t13 values ('pat_upload', r.licence_id::text);
  begin
    perform public.licence_upload((select val::uuid from t13 where k = 'pat_book'), '0.1.0-draft',
      'a1300000-0000-0000-0000-0000000000a1/licences/a1300000-0000-0000-0000-00000000f001.pdf', repeat('d', 64),
      array['GB'], '{}', 36, null, false, true, false, 'Pat Owner', 'MD', null);
    raise exception 'an upload path outside the organisation was accepted';
  exception when sqlstate 'AKS02' then null; end;
end $$;
reset role;
select test_as('a1300000-0000-0000-0000-000000000013');
do $$ begin
  begin
    perform pg_temp.sign((select val::uuid from t13 where k = 'pat_book'), '0.1.0-draft', repeat('0', 64));
    raise exception 'an editor signed a licence';
  exception when sqlstate 'AKS01' then null; end;
end $$;
reset role;
select test_as('a1300000-0000-0000-0000-000000000001', array['editor']);
do $$ begin
  begin
    perform public.licence_verify((select val::uuid from t13 where k = 'pat_upload'), true, 'Signed copy matches');
    raise exception 'staff made a draft licence active';
  exception when sqlstate 'AKS06' then null; end;
  if public.licence_verify((select val::uuid from t13 where k = 'pat_upload'), false, 'Unsigned page 3') <> 'rejected' then
    raise exception 'reject failed'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 7. The live gate, then an approved text.
-- ---------------------------------------------------------------------------
insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, depth, status) values
  ('a1300000-0000-0000-0000-0000000000d1', 'AK-T13D1', (select val::uuid from t13 where k = 'ada_book'), 'a1300000-0000-0000-0000-0000000000a1',
   'quiet-t13', 'Quiet', 'Card', 'wellbeing', 'full', 'approved'),
  ('a1300000-0000-0000-0000-0000000000d3', 'AK-T13D3', 'a1300000-0000-0000-0000-0000000000c3', 'a1300000-0000-0000-0000-0000000000a3',
   'demo-t13', 'Demo', 'Card', 'productivity', 'full', 'approved');
update public.workbooks set is_demo = true, badge = 'demo' where id = 'a1300000-0000-0000-0000-0000000000d3';

-- Run as the table owner, as a security definer release function would.
-- Payouts are verified so only the licence gate is in play.
update public.organisations set connect_status = 'verified' where id = 'a1300000-0000-0000-0000-0000000000a1';
do $$ begin
  begin
    update public.workbooks set status = 'live' where id = 'a1300000-0000-0000-0000-0000000000d1';
    raise exception 'a workbook went live without a licence';
  exception when sqlstate 'AKS08' then null; end;
  update public.workbooks set status = 'live' where id = 'a1300000-0000-0000-0000-0000000000d3';
end $$;

-- The lawyer's text lands as a new version, then a platform owner approves it.
insert into public.licence_texts (version, title, status, is_placeholder, content_sha256, source_file)
values ('1.0.0', 'Interactive workbook licence', 'draft', false, repeat('e', 64), 'docs/legal/author-licence-1.0.0.md');
select test_as('a1300000-0000-0000-0000-000000000001', array['editor']);
do $$ begin
  begin
    perform public.licence_text_approve('1.0.0', 'Lawyer approved');
    raise exception 'an editor approved a licence text';
  exception when sqlstate 'AKS01' then null; end;
end $$;
reset role;
select test_as('a1300000-0000-0000-0000-000000000002', array['owner']);
do $$ begin
  perform public.licence_text_approve('1.0.0', 'Lawyer approved on 16 October');
end $$;
reset role;

select test_as('a1300000-0000-0000-0000-000000000011');
do $$ declare r record; r2 record; b uuid := (select val::uuid from t13 where k = 'ada_book'); begin
  select * into r from public.licence_accept(b, '1.0.0', repeat('e', 64), array['WORLD'], '{}', 60, 12,
    true, true, false, true, true, true, 'Adeline Lane', 'Author', repeat('c', 64));
  if r.licence_status <> 'active' then raise exception 'approved signature returned %', r; end if;
  insert into t13 values ('ada_ref', r.licence_ref);
  select * into r2 from public.licence_accept(b, '1.0.0', repeat('e', 64), array['GB'], '{}', 24, null,
    false, true, false, true, true, true, 'Adeline Lane', 'Author', null);
  if (select status from public.licences where id = r.licence_id) <> 'superseded' then raise exception 'the older licence was not superseded'; end if;
  update t13 set val = r2.licence_ref where k = 'ada_ref';
  if (select count(*) from public.licences where book_id = b) <> 2 then raise exception 'Ada should see her two licences'; end if;
end $$;
reset role;

select test_as('a1300000-0000-0000-0000-000000000014');
do $$ begin
  if (select count(*) from public.licences) <> 0 then raise exception 'an outsider read licences'; end if;
end $$;
reset role;

do $$ begin
  update public.workbooks set status = 'live' where id = 'a1300000-0000-0000-0000-0000000000d1';
  if (select licence_ref from public.workbooks where id = 'a1300000-0000-0000-0000-0000000000d1') <> (select val from t13 where k = 'ada_ref') then
    raise exception 'licence_ref was not set on going live'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Submissions: both routes create a Draft workbook; the status column is readable.
-- ---------------------------------------------------------------------------
select test_as('a1300000-0000-0000-0000-000000000011');
do $$ declare r record; r2 record; begin
  select * into r from public.submission_create((select val::uuid from t13 where k = 'ada_book'), 'upload', null, 'wellbeing',
    E'Twelve weeks.\nGentle tone.');
  if r.workbook_code !~ '^AK-[0-9A-HJKMNP-TV-Z]{5}$' then raise exception 'bad code %', r.workbook_code; end if;
  if (select status from public.workbooks where id = r.workbook_id) <> 'draft' then raise exception 'workbook not draft'; end if;
  if (select title from public.workbooks where id = r.workbook_id) <> 'Quiet Mornings' then raise exception 'title not taken from the book'; end if;
  if (select status from public.workbook_submissions where id = r.submission_id) <> 'submitted' then raise exception 'not submitted'; end if;
  insert into t13 values ('sub', r.submission_id::text);
  perform public.submission_add_file(r.submission_id, 'manuscript',
    'a1300000-0000-0000-0000-0000000000a1/manuscripts/a1300000-0000-0000-0000-00000000f002.docx',
    'Quiet Mornings.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 2048, repeat('a', 64));
  begin
    perform public.submission_add_file(r.submission_id, 'manuscript', '../../etc/passwd', 'x.pdf', 'application/pdf', 1, repeat('a', 64));
    raise exception 'a bad path was recorded';
  exception when sqlstate 'AKS02' then null; end;
  begin
    perform public.submission_add_file(r.submission_id, 'manuscript',
      'a1300000-0000-0000-0000-0000000000a1/manuscripts/a1300000-0000-0000-0000-00000000f003.pdf',
      'x.pdf', 'application/zip', 1, repeat('a', 64));
    raise exception 'a zip was recorded';
  exception when check_violation then null; end;
  select * into r2 from public.submission_create((select val::uuid from t13 where k = 'ada_book'), 'develop', 'Quiet Evenings', 'wellbeing', 'Please build it');
  insert into t13 values ('sub2', r2.submission_id::text);
  begin
    perform public.submission_set_status(r.submission_id, 'accepted', null);
    raise exception 'an author moved their own submission';
  exception when sqlstate 'AKS01' then null; end;
end $$;
reset role;

select test_as('a1300000-0000-0000-0000-000000000014');
do $$ begin
  if (select count(*) from public.workbook_submissions) <> 0 then raise exception 'an outsider read submissions'; end if;
  if (select count(*) from public.submission_files) <> 0 then raise exception 'an outsider read submission files'; end if;
  begin
    perform public.submission_create((select val::uuid from t13 where k = 'ada_book'), 'upload', null, 'wellbeing', 'x');
    raise exception 'an outsider submitted';
  exception when sqlstate 'AKS01' then null; end;
end $$;
reset role;

select test_as('a1300000-0000-0000-0000-000000000001', array['editor']);
do $$ declare n int; begin
  select count(*) into n from public.workbook_submissions where status = 'submitted';
  if n < 2 then raise exception 'staff should see the submitted queue, saw %', n; end if;
  begin
    perform public.submission_set_status((select val::uuid from t13 where k = 'sub'), 'changes_requested', null);
    raise exception 'changes were requested without a reason';
  exception when sqlstate 'AKS02' then null; end;
  perform public.submission_set_status((select val::uuid from t13 where k = 'sub'), 'accepted', null);
  begin
    perform public.submission_set_quote((select val::uuid from t13 where k = 'sub'), 50000, 'GBP', 10000, null);
    raise exception 'an upload route took a quote';
  exception when sqlstate 'AKS08' then null; end;
  perform public.submission_set_quote((select val::uuid from t13 where k = 'sub2'), 50000, 'gbp', 10000, 'https://buy.stripe.com/test_abc');
  begin
    perform public.submission_set_quote((select val::uuid from t13 where k = 'sub2'), 50000, 'GBP', 10000, 'https://evil.example/pay');
    raise exception 'a non-Stripe payment link was stored';
  exception when check_violation then null; end;
end $$;
reset role;

select test_as('a1300000-0000-0000-0000-000000000011');
do $$ begin
  if (select quote_currency from public.workbook_submissions where id = (select val::uuid from t13 where k = 'sub2')) <> 'GBP' then
    raise exception 'quote not visible to the author'; end if;
  if public.submission_withdraw((select val::uuid from t13 where k = 'sub2')) <> 'withdrawn' then raise exception 'withdraw failed'; end if;
  begin
    perform public.submission_withdraw((select val::uuid from t13 where k = 'sub2'));
    raise exception 'a closed submission was withdrawn again';
  exception when sqlstate 'AKS08' then null; end;
end $$;
reset role;

-- Every step left an audit row, and none of them holds an email address.
do $$ declare n int; begin
  select count(*) into n from public.audit_log where action in ('org.invited','org.invite_accepted','licence.accepted','submission.created');
  if n < 6 then raise exception 'expected audit rows, saw %', n; end if;
  select count(*) into n from public.audit_log where (coalesce(after::text, '') || coalesce(before::text, '')) like '%@%';
  if n <> 0 then raise exception 'an audit row holds an email address'; end if;
end $$;

rollback;
\echo PASS 0013_author_onboarding
