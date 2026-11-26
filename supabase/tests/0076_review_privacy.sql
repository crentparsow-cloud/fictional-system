-- 0076 Privacy fixes from the November 2026 review.
--   M17 bounces and complaints are recorded once, as salted hashes.
--   M18 a person who invited, submitted and uploaded can be erased.
--   M20 consent history is append only and outlives the account as a hash.
--   M21 the retention prune removes what is old, by count, and can run twice.
--   L12 newsletter and gift tokens are stored as hashes; old links still work.
--   RX-2 a file uploaded by someone who was never a member is never removed.
--   RX-3 the audit period spares money, consent, deletion and staff-privilege
--        entries and anything unknown; a legal hold stops every prune.
--   RX-4 consent history cannot be truncated.
-- Every new table is also read signed out (anon) and refused.
-- Each block must raise or return the expected value; a failure aborts the script.
\set ON_ERROR_STOP on

begin;

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

insert into auth.users (id, email) values
  ('a7600000-0000-0000-0000-00000000000d', 'gone76@test.example'),
  ('a7600000-0000-0000-0000-00000000000c', 'colleague76@test.example'),
  ('a7600000-0000-0000-0000-00000000000f', 'other76@test.example'),
  ('a7600000-0000-0000-0000-00000000000e', 'direct76@test.example');
insert into public.profiles (user_id)
select u.id from auth.users u where u.email like '%76@test.example' on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 1. M17: provider events and suppressions
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '', true);
select test_as('a7600000-0000-0000-0000-00000000000f');
do $$ begin
  begin
    perform public.email_webhook_record('msg_76_x', 'email.bounced', 'bounced', array['x@test.example']);
    raise exception 'a signed-in reader recorded an email event';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.email_suppression_state('x@test.example');
    raise exception 'a signed-in reader read suppressions';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from public.email_suppressions;
    raise exception 'a signed-in reader read the suppression table';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from public.email_webhook_events;
    raise exception 'a signed-in reader read the event table';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- Signed out: every new table and every new function is refused.
select pg_temp.as_anon();
do $$ declare t text; begin
  foreach t in array array['email_webhook_events', 'email_suppressions', 'storage_erasure_queue', 'retention_periods',
                           'consent_history', 'newsletter_link_tokens'] loop
    begin
      execute format('select 1 from public.%I limit 1', t);
      raise exception 'a signed-out visitor read %', t;
    exception when insufficient_privilege then null; end;
    begin
      execute format('delete from public.%I', t);
      raise exception 'a signed-out visitor deleted from %', t;
    exception when insufficient_privilege then null; end;
  end loop;
  begin
    perform 1 from app.private_keys;
    raise exception 'a signed-out visitor read the private keys';
  exception when insufficient_privilege then null; end;
  begin
    perform public.email_webhook_record('msg_76_anon', 'email.bounced', 'bounced', array['x@test.example']);
    raise exception 'a signed-out visitor recorded an email event';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.email_suppression_state('x@test.example');
    raise exception 'a signed-out visitor read suppressions';
  exception when insufficient_privilege then null; end;
  begin
    perform public.prune_retention();
    raise exception 'a signed-out visitor ran the prune';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.storage_erasure_due(10);
    raise exception 'a signed-out visitor read the removal queue';
  exception when insufficient_privilege then null; end;
  begin
    perform public.storage_erasure_mark(array[1]::bigint[], true);
    raise exception 'a signed-out visitor marked a removal';
  exception when insufficient_privilege then null; end;
  begin
    perform public.gift_link_register(gen_random_uuid(), repeat('a', 64));
    raise exception 'a signed-out visitor registered a gift link';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
do $$ declare t text; begin
  foreach t in array array['email_webhook_events', 'email_suppressions', 'storage_erasure_queue', 'retention_periods',
                           'consent_history', 'newsletter_link_tokens'] loop
    if not (select relrowsecurity from pg_class where oid = format('public.%I', t)::regclass) then raise exception 'RLS is off on %', t; end if;
  end loop;
  if not (select relrowsecurity from pg_class where oid = 'app.private_keys'::regclass) then raise exception 'RLS is off on the private keys'; end if;
  -- The service role cannot read the keys either.
  if has_table_privilege('service_role', 'app.private_keys', 'select') then raise exception 'the service role can read the private keys'; end if;
end $$;

-- A subscriber who then bounces is taken off the newsletter.
insert into public.newsletter_subscribers (email, status, confirmed_at, token_hash) values
  ('bounce76@test.example', 'confirmed', now(), app.sha256_hex(repeat('6', 64)));

select pg_temp.as_service();
do $$ declare r text; n int; begin
  r := public.email_webhook_record('msg_76_1', 'email.bounced', 'bounced', array[' Bounce76@Test.example ']);
  if r <> 'recorded' then raise exception 'first delivery should be recorded, got %', r; end if;
  r := public.email_webhook_record('msg_76_1', 'email.bounced', 'bounced', array['second76@test.example']);
  if r <> 'replay' then raise exception 'a replay should be refused, got %', r; end if;
  select count(*) into n from public.email_suppression_state('second76@test.example');
  if n <> 0 then raise exception 'a replay suppressed an address'; end if;
  -- Found whatever the case or spacing.
  select count(*) into n from public.email_suppression_state('bounce76@test.example') where reason = 'bounced';
  if n <> 1 then raise exception 'the bounced address should be suppressed'; end if;
  if (select status from public.newsletter_subscribers where email = 'bounce76@test.example') <> 'unsubscribed' then
    raise exception 'a bounced address should come off the newsletter';
  end if;
  r := public.email_webhook_record('msg_76_2', 'email.complained', 'complained', array['bounce76@test.example']);
  select count(*) into n from public.email_suppression_state('BOUNCE76@test.example');
  if n <> 2 then raise exception 'a complaint is kept beside the bounce, found %', n; end if;
  -- An event that suppresses nobody is still stored once.
  r := public.email_webhook_record('msg_76_3', 'email.delivered', null, array['fine76@test.example']);
  if r <> 'recorded' then raise exception 'a delivered event should be recorded'; end if;
  select count(*) into n from public.email_suppression_state('fine76@test.example');
  if n <> 0 then raise exception 'a delivered event suppressed an address'; end if;
  begin
    perform public.email_webhook_record('msg_76_4', 'email.bounced', 'because', array['x@test.example']);
    raise exception 'an unknown reason was accepted';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
do $$ begin
  -- Hashes only, and salted: not the plain SHA-256 of the address.
  if exists (select 1 from public.email_suppressions where address_hash !~ '^[0-9a-f]{64}$') then raise exception 'not a hash'; end if;
  if exists (select 1 from public.email_suppressions where address_hash = app.sha256_hex('bounce76@test.example')) then
    raise exception 'the suppression hash is not salted';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.email_suppressions'::regclass) then raise exception 'RLS is off'; end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('email_suppressions', 'email_webhook_events', 'storage_erasure_queue', 'newsletter_link_tokens')) then
    raise exception 'a service-only table has a client policy';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. M18: no key to auth.users is left without a delete action
-- ---------------------------------------------------------------------------
do $$ declare v text; begin
  select string_agg(c.conrelid::regclass::text || '.' || c.conname, ', ') into v
    from pg_constraint c
   where c.contype = 'f' and c.confrelid = 'auth.users'::regclass and c.confdeltype in ('a', 'r')
     and c.conrelid::regclass::text <> 'health_consent_withdrawals';
  if v is not null then raise exception 'keys to auth.users with no delete action: %', v; end if;
end $$;

-- All seventeen now set null, and running the migration again left them alone
-- (the suite applies 0076 twice when asked; either way each key exists once).
do $$ declare n int; begin
  select count(*) into n from pg_constraint c
   where c.contype = 'f' and c.confrelid = 'auth.users'::regclass and c.confdeltype = 'n' and c.convalidated
     and (c.conrelid::regclass::text, (select a.attname::text from pg_attribute a where a.attrelid = c.conrelid and a.attnum = c.conkey[1])) in (
       ('org_members', 'invited_by'), ('platform_roles', 'granted_by'), ('feature_flags', 'updated_by'), ('authors', 'bio_reviewed_by'),
       ('workbook_versions', 'author_approved_by'), ('workbook_versions', 'editor_approved_by'), ('workbook_versions', 'safety_approved_by'),
       ('book_rights', 'updated_by'), ('org_invitations', 'invited_by'), ('licence_texts', 'approved_by'), ('licences', 'verified_by'),
       ('workbook_submissions', 'submitted_by'), ('workbook_submissions', 'status_changed_by'), ('submission_files', 'uploaded_by'),
       ('release_overrides', 'requested_by'), ('release_overrides', 'approved_by'), ('demo_accounts', 'added_by'));
  if n <> 17 then raise exception 'seventeen validated set-null keys expected, found %', n; end if;
end $$;

-- The gone person: an owner who invited, submitted and uploaded.
--   org A has a colleague too. org B and org C are theirs alone.
--   B's workbook is a draft (their own unpublished manuscript). C's is live.
insert into public.organisations (id, code, kind, legal_name, display_name, slug, country) values
  ('a7600000-0000-0000-0000-0000000000a1', 'PB-TD76A', 'publisher', 'Org 76 A Ltd', 'Org 76 A', 'org-76-a', 'GB'),
  ('a7600000-0000-0000-0000-0000000000a2', 'PB-TD76B', 'publisher', 'Org 76 B Ltd', 'Org 76 B', 'org-76-b', 'GB'),
  ('a7600000-0000-0000-0000-0000000000a3', 'PB-TD76C', 'publisher', 'Org 76 C Ltd', 'Org 76 C', 'org-76-c', 'GB');
insert into public.org_members (org_id, user_id, role, invited_by) values
  ('a7600000-0000-0000-0000-0000000000a1', 'a7600000-0000-0000-0000-00000000000d', 'owner', null),
  ('a7600000-0000-0000-0000-0000000000a1', 'a7600000-0000-0000-0000-00000000000c', 'owner', 'a7600000-0000-0000-0000-00000000000d'),
  ('a7600000-0000-0000-0000-0000000000a2', 'a7600000-0000-0000-0000-00000000000d', 'owner', null),
  ('a7600000-0000-0000-0000-0000000000a3', 'a7600000-0000-0000-0000-00000000000d', 'owner', null);
insert into public.org_invitations (org_id, email, role, token_hash, invited_by, expires_at) values
  ('a7600000-0000-0000-0000-0000000000a1', 'invitee76@test.example', 'editor', repeat('7', 64), 'a7600000-0000-0000-0000-00000000000d', now() + interval '7 days');
insert into public.books (id, org_id, slug, title, rights_status) values
  ('a7600000-0000-0000-0000-0000000000b1', 'a7600000-0000-0000-0000-0000000000a1', 'book-76-a', 'Book 76 A', 'public_domain'),
  ('a7600000-0000-0000-0000-0000000000b2', 'a7600000-0000-0000-0000-0000000000a2', 'book-76-b', 'Book 76 B', 'public_domain'),
  ('a7600000-0000-0000-0000-0000000000b3', 'a7600000-0000-0000-0000-0000000000a3', 'book-76-c', 'Book 76 C', 'public_domain');
insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, safety_tier, depth, status) values
  ('a7600000-0000-0000-0000-0000000000c1', 'AK-T76A0', 'a7600000-0000-0000-0000-0000000000b1', 'a7600000-0000-0000-0000-0000000000a1', 'wb-76-a', 'Workbook 76 A', 'Card', 'productivity', 'none', 'full', 'draft'),
  ('a7600000-0000-0000-0000-0000000000c2', 'AK-T76B0', 'a7600000-0000-0000-0000-0000000000b2', 'a7600000-0000-0000-0000-0000000000a2', 'wb-76-b', 'Workbook 76 B', 'Card', 'productivity', 'none', 'full', 'draft'),
  ('a7600000-0000-0000-0000-0000000000c3', 'AK-T76C0', 'a7600000-0000-0000-0000-0000000000b3', 'a7600000-0000-0000-0000-0000000000a3', 'wb-76-c', 'Workbook 76 C', 'Card', 'productivity', 'none', 'full', 'live');
insert into public.workbook_submissions (id, org_id, book_id, workbook_id, route, brief, submitted_by, status_changed_by) values
  ('a7600000-0000-0000-0000-000000000051', 'a7600000-0000-0000-0000-0000000000a1', 'a7600000-0000-0000-0000-0000000000b1', 'a7600000-0000-0000-0000-0000000000c1', 'upload', 'Brief A', 'a7600000-0000-0000-0000-00000000000d', 'a7600000-0000-0000-0000-00000000000d'),
  ('a7600000-0000-0000-0000-000000000052', 'a7600000-0000-0000-0000-0000000000a2', 'a7600000-0000-0000-0000-0000000000b2', 'a7600000-0000-0000-0000-0000000000c2', 'upload', 'Brief B', 'a7600000-0000-0000-0000-00000000000d', null),
  ('a7600000-0000-0000-0000-000000000053', 'a7600000-0000-0000-0000-0000000000a3', 'a7600000-0000-0000-0000-0000000000b3', 'a7600000-0000-0000-0000-0000000000c3', 'upload', 'Brief C', 'a7600000-0000-0000-0000-00000000000d', null);
insert into public.submission_files (submission_id, org_id, kind, storage_path, file_name, mime, size_bytes, sha256, uploaded_by) values
  ('a7600000-0000-0000-0000-000000000051', 'a7600000-0000-0000-0000-0000000000a1', 'manuscript', 'a7600000-0000-0000-0000-0000000000a1/manuscripts/00000000-0000-0000-0000-000000000001.pdf', 'a.pdf', 'application/pdf', 10, repeat('a', 64), 'a7600000-0000-0000-0000-00000000000d'),
  ('a7600000-0000-0000-0000-000000000052', 'a7600000-0000-0000-0000-0000000000a2', 'manuscript', 'a7600000-0000-0000-0000-0000000000a2/manuscripts/00000000-0000-0000-0000-000000000002.pdf', 'b.pdf', 'application/pdf', 10, repeat('b', 64), 'a7600000-0000-0000-0000-00000000000d'),
  ('a7600000-0000-0000-0000-000000000053', 'a7600000-0000-0000-0000-0000000000a3', 'manuscript', 'a7600000-0000-0000-0000-0000000000a3/manuscripts/00000000-0000-0000-0000-000000000003.pdf', 'c.pdf', 'application/pdf', 10, repeat('c', 64), 'a7600000-0000-0000-0000-00000000000d');
insert into storage.objects (bucket_id, name, owner) values
  ('org-files', 'a7600000-0000-0000-0000-0000000000a1/manuscripts/00000000-0000-0000-0000-000000000001.pdf', 'a7600000-0000-0000-0000-00000000000d'),
  ('org-files', 'a7600000-0000-0000-0000-0000000000a2/manuscripts/00000000-0000-0000-0000-000000000002.pdf', 'a7600000-0000-0000-0000-00000000000d'),
  ('org-files', 'a7600000-0000-0000-0000-0000000000a3/manuscripts/00000000-0000-0000-0000-000000000003.pdf', 'a7600000-0000-0000-0000-00000000000d'),
  -- uploaded and never attached to anything
  ('org-files', 'a7600000-0000-0000-0000-0000000000a1/manuscripts/00000000-0000-0000-0000-000000000009.pdf', 'a7600000-0000-0000-0000-00000000000d'),
  -- the colleague's own abandoned upload is not touched
  ('org-files', 'a7600000-0000-0000-0000-0000000000a1/manuscripts/00000000-0000-0000-0000-000000000008.pdf', 'a7600000-0000-0000-0000-00000000000c');
-- Marks the same person left on platform records.
insert into public.workbook_versions (id, workbook_id, semver, content, content_hash, editor_approved_by) values
  ('a7600000-0000-0000-0000-0000000000d1', 'a7600000-0000-0000-0000-0000000000c1', '1.0.0', '{}'::jsonb, repeat('a', 64), 'a7600000-0000-0000-0000-00000000000d');
insert into public.release_overrides (id, version_id, content_hash, unmet, reason, requested_by) values
  ('a7600000-0000-0000-0000-000000000061', 'a7600000-0000-0000-0000-0000000000d1', repeat('d', 64), array['licence'], 'Test override for 0076', 'a7600000-0000-0000-0000-00000000000d');
insert into public.demo_accounts (user_id, kind, added_by) values
  ('a7600000-0000-0000-0000-00000000000c', 'author', 'a7600000-0000-0000-0000-00000000000d');
-- An override the colleague asked for and the gone person approved. The old
-- check (approver and approval time set together) would have blocked erasure.
insert into public.release_overrides (id, version_id, content_hash, unmet, reason, requested_by, approved_by, approved_at) values
  ('a7600000-0000-0000-0000-000000000062', 'a7600000-0000-0000-0000-0000000000d1', repeat('e', 64), array['licence'], 'Approved override for 0076',
   'a7600000-0000-0000-0000-00000000000c', 'a7600000-0000-0000-0000-00000000000d', now());
insert into public.platform_roles (user_id, role, granted_by) values
  ('a7600000-0000-0000-0000-00000000000c', 'support', 'a7600000-0000-0000-0000-00000000000d');
insert into public.feature_flags (key, scope, scope_id, enabled, updated_by) values
  ('test_flag_76', 'global', '', true, 'a7600000-0000-0000-0000-00000000000d');
insert into public.book_rights (book_id, org_id, updated_by) values
  ('a7600000-0000-0000-0000-0000000000b1', 'a7600000-0000-0000-0000-0000000000a1', 'a7600000-0000-0000-0000-00000000000d');

-- Consent given before deletion, so section 3 can follow it through.
select test_as('a7600000-0000-0000-0000-00000000000d');
do $$ begin
  perform public.set_health_consent('v1');
  perform public.set_faith_consent('v1');
  perform public.clear_faith_consent();
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- The last-owner guard still holds for a live account.
do $$ begin
  begin
    delete from public.org_members where org_id = 'a7600000-0000-0000-0000-0000000000a2' and user_id = 'a7600000-0000-0000-0000-00000000000d';
    raise exception 'the last owner of a live organisation was removed';
  exception when check_violation then null; end;
end $$;

insert into public.account_deletion_requests (user_id, requested_at) values ('a7600000-0000-0000-0000-00000000000d', now() - interval '8 days');
update public.account_deletion_requests set requested_at = now() - interval '8 days' where user_id = 'a7600000-0000-0000-0000-00000000000d';

select pg_temp.as_service();
do $$ declare ids uuid[]; begin
  select array_agg(user_id) into ids from public.complete_due_deletions();
  if not ('a7600000-0000-0000-0000-00000000000d'::uuid = any (coalesce(ids, '{}'))) then
    raise exception 'the job should return the gone person, returned %', ids;
  end if;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- This is the step that used to fail: auth.admin.deleteUser().
delete from auth.users where id = 'a7600000-0000-0000-0000-00000000000d';

do $$ declare n int; begin
  -- The records stay. The name on them is gone.
  if not exists (select 1 from public.org_members where user_id = 'a7600000-0000-0000-0000-00000000000c' and invited_by is null) then raise exception 'org_members.invited_by not cleared'; end if;
  if not exists (select 1 from public.org_invitations where email = 'invitee76@test.example' and invited_by is null) then raise exception 'the invitation should stay with no inviter'; end if;
  select count(*) into n from public.workbook_submissions where org_id in ('a7600000-0000-0000-0000-0000000000a1', 'a7600000-0000-0000-0000-0000000000a2', 'a7600000-0000-0000-0000-0000000000a3') and submitted_by is null and status_changed_by is null;
  if n <> 3 then raise exception 'three submissions should stay with no submitter, found %', n; end if;
  if not exists (select 1 from public.release_overrides where id = 'a7600000-0000-0000-0000-000000000061' and requested_by is null) then raise exception 'the override should stay with no requester'; end if;
  if not exists (select 1 from public.workbook_versions where id = 'a7600000-0000-0000-0000-0000000000d1' and editor_approved_by is null) then raise exception 'the version should stay with no approver'; end if;
  if not exists (select 1 from public.demo_accounts where user_id = 'a7600000-0000-0000-0000-00000000000c' and added_by is null) then raise exception 'the demo account row should stay'; end if;
  if exists (select 1 from public.org_members where user_id = 'a7600000-0000-0000-0000-00000000000d') then raise exception 'memberships survived'; end if;
  if not exists (select 1 from public.release_overrides where id = 'a7600000-0000-0000-0000-000000000062' and approved_by is null and approved_at is not null) then
    raise exception 'the approved override should stay with its time and no approver';
  end if;
  if not exists (select 1 from public.platform_roles where user_id = 'a7600000-0000-0000-0000-00000000000c' and role = 'support' and granted_by is null) then raise exception 'the role grant should stay'; end if;
  if not exists (select 1 from public.feature_flags where key = 'test_flag_76' and updated_by is null) then raise exception 'the flag should stay'; end if;
  if not exists (select 1 from public.book_rights where book_id = 'a7600000-0000-0000-0000-0000000000b1' and updated_by is null) then raise exception 'the rights row should stay'; end if;

  -- Files. Their own unpublished manuscript (org B) and the abandoned upload are queued and the row is gone.
  if exists (select 1 from public.submission_files where submission_id = 'a7600000-0000-0000-0000-000000000052') then raise exception 'their own manuscript row survived'; end if;
  select count(*) into n from public.storage_erasure_queue where removed_at is null and path in (
    'a7600000-0000-0000-0000-0000000000a2/manuscripts/00000000-0000-0000-0000-000000000002.pdf',
    'a7600000-0000-0000-0000-0000000000a1/manuscripts/00000000-0000-0000-0000-000000000009.pdf');
  if n <> 2 then raise exception 'two files should be waiting for removal, found %', n; end if;
  -- The shared organisation's file and the published workbook's file stay, with no uploader.
  select count(*) into n from public.submission_files where submission_id in ('a7600000-0000-0000-0000-000000000051', 'a7600000-0000-0000-0000-000000000053') and uploaded_by is null;
  if n <> 2 then raise exception 'two organisation files should stay with no uploader, found %', n; end if;
  select count(*) into n from public.storage_erasure_queue where path like 'a7600000-0000-0000-0000-0000000000a%';
  if n <> 2 then raise exception 'only the two personal files should be queued, found %', n; end if;
  if exists (select 1 from storage.objects where owner = 'a7600000-0000-0000-0000-00000000000d') then raise exception 'an object still names the deleted uploader'; end if;
  if not exists (select 1 from storage.objects where owner = 'a7600000-0000-0000-0000-00000000000c') then raise exception 'the colleague lost their upload link'; end if;
  -- The queue holds no user id at all.
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'storage_erasure_queue' and data_type = 'uuid') then
    raise exception 'the removal queue holds an id';
  end if;
end $$;

-- An approver with no approval time is still refused.
do $$ begin
  begin
    update public.release_overrides set approved_by = 'a7600000-0000-0000-0000-00000000000f', approved_at = null where id = 'a7600000-0000-0000-0000-000000000061';
    raise exception 'an approver was recorded with no approval time';
  exception when check_violation then null; end;
end $$;

-- The job reads the queue, removes the files and marks them. A failure is tried again.
select test_as('a7600000-0000-0000-0000-00000000000f');
do $$ begin
  begin
    perform * from public.storage_erasure_due(10);
    raise exception 'a reader read the removal queue';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
select pg_temp.as_service();
do $$ declare ids bigint[]; n int; begin
  select array_agg(id) into ids from public.storage_erasure_due(10) where path like 'a7600000-0000-0000-0000-0000000000a%';
  if cardinality(ids) <> 2 then raise exception 'two files due, found %', cardinality(ids); end if;
  n := public.storage_erasure_mark(ids[1:1], false);
  select count(*) into n from public.storage_erasure_due(10) where path like 'a7600000-0000-0000-0000-0000000000a%';
  if n <> 2 then raise exception 'a failed removal should still be due'; end if;
  n := public.storage_erasure_mark(ids, true);
  if n <> 2 then raise exception 'two marked, got %', n; end if;
  select count(*) into n from public.storage_erasure_due(10) where path like 'a7600000-0000-0000-0000-0000000000a%';
  if n <> 0 then raise exception 'nothing should be due after marking'; end if;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- RX-2. Org Z has no members at all. A member of staff (never a member of it)
-- uploaded its manuscript and left another upload in its folder. Erasing the
-- staff account must remove neither. Org W has no members now, but its one
-- author, since removed, uploaded an unpublished manuscript: that is theirs.
-- Rolled back to a savepoint so the sections below see the queue as it was.
savepoint rx2;
insert into public.organisations (id, code, kind, legal_name, display_name, slug, country) values
  ('a7600000-0000-0000-0000-0000000000a8', 'PB-TD76Z', 'publisher', 'Org 76 Z Ltd', 'Org 76 Z', 'org-76-z', 'GB'),
  ('a7600000-0000-0000-0000-0000000000a9', 'PB-TD76W', 'publisher', 'Org 76 W Ltd', 'Org 76 W', 'org-76-w', 'GB');
insert into public.books (id, org_id, slug, title, rights_status) values
  ('a7600000-0000-0000-0000-0000000000b8', 'a7600000-0000-0000-0000-0000000000a8', 'book-76-z', 'Book 76 Z', 'public_domain'),
  ('a7600000-0000-0000-0000-0000000000b9', 'a7600000-0000-0000-0000-0000000000a9', 'book-76-w', 'Book 76 W', 'public_domain');
insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, safety_tier, depth, status) values
  ('a7600000-0000-0000-0000-0000000000c8', 'AK-T76Z0', 'a7600000-0000-0000-0000-0000000000b8', 'a7600000-0000-0000-0000-0000000000a8', 'wb-76-z', 'Workbook 76 Z', 'Card', 'productivity', 'none', 'full', 'draft'),
  ('a7600000-0000-0000-0000-0000000000c9', 'AK-T76W0', 'a7600000-0000-0000-0000-0000000000b9', 'a7600000-0000-0000-0000-0000000000a9', 'wb-76-w', 'Workbook 76 W', 'Card', 'productivity', 'none', 'full', 'draft');
insert into public.workbook_submissions (id, org_id, book_id, workbook_id, route, brief, submitted_by) values
  ('a7600000-0000-0000-0000-000000000058', 'a7600000-0000-0000-0000-0000000000a8', 'a7600000-0000-0000-0000-0000000000b8', 'a7600000-0000-0000-0000-0000000000c8', 'upload', 'Brief Z', 'a7600000-0000-0000-0000-00000000000f'),
  ('a7600000-0000-0000-0000-000000000059', 'a7600000-0000-0000-0000-0000000000a9', 'a7600000-0000-0000-0000-0000000000b9', 'a7600000-0000-0000-0000-0000000000c9', 'upload', 'Brief W', 'a7600000-0000-0000-0000-00000000000c');
insert into public.submission_files (submission_id, org_id, kind, storage_path, file_name, mime, size_bytes, sha256, uploaded_by) values
  ('a7600000-0000-0000-0000-000000000058', 'a7600000-0000-0000-0000-0000000000a8', 'manuscript', 'a7600000-0000-0000-0000-0000000000a8/manuscripts/00000000-0000-0000-0000-000000000081.pdf', 'z.pdf', 'application/pdf', 10, repeat('8', 64), 'a7600000-0000-0000-0000-00000000000f'),
  ('a7600000-0000-0000-0000-000000000059', 'a7600000-0000-0000-0000-0000000000a9', 'manuscript', 'a7600000-0000-0000-0000-0000000000a9/manuscripts/00000000-0000-0000-0000-000000000091.pdf', 'w.pdf', 'application/pdf', 10, repeat('9', 64), 'a7600000-0000-0000-0000-00000000000c');
insert into storage.objects (bucket_id, name, owner) values
  ('org-files', 'a7600000-0000-0000-0000-0000000000a8/manuscripts/00000000-0000-0000-0000-000000000081.pdf', 'a7600000-0000-0000-0000-00000000000f'),
  -- left in Org Z's folder by the staff account and attached to nothing
  ('org-files', 'a7600000-0000-0000-0000-0000000000a8/manuscripts/00000000-0000-0000-0000-000000000082.pdf', 'a7600000-0000-0000-0000-00000000000f'),
  ('org-files', 'a7600000-0000-0000-0000-0000000000a9/manuscripts/00000000-0000-0000-0000-000000000091.pdf', 'a7600000-0000-0000-0000-00000000000c');
-- The former member of Org W, as app.org_member_remove (0013) records it.
insert into public.audit_log (action, target, org_id) values
  ('org.member_removed', 'user:a7600000-0000-0000-0000-00000000000c', 'a7600000-0000-0000-0000-0000000000a9');
do $$ declare n int; begin
  if app.is_or_was_org_member('a7600000-0000-0000-0000-00000000000f', 'a7600000-0000-0000-0000-0000000000a8') then raise exception 'the staff account never belonged to Org Z'; end if;
  if not app.is_or_was_org_member('a7600000-0000-0000-0000-00000000000c', 'a7600000-0000-0000-0000-0000000000a9') then raise exception 'a removed member was one'; end if;
  if not app.is_or_was_org_member('a7600000-0000-0000-0000-00000000000c', 'a7600000-0000-0000-0000-0000000000a1') then raise exception 'a current member is one'; end if;
  if app.is_or_was_org_member('a7600000-0000-0000-0000-00000000000c', 'a7600000-0000-0000-0000-0000000000a8') then raise exception 'membership of one organisation is not membership of another'; end if;
  if app.is_or_was_org_member(null, 'a7600000-0000-0000-0000-0000000000a8') then raise exception 'nobody is not a member'; end if;

  -- The staff account goes. Org Z keeps its manuscript and the stray upload.
  n := app.erase_personal_files('a7600000-0000-0000-0000-00000000000f');
  if n <> 0 then raise exception 'erasing a staff account queued % file(s)', n; end if;
  if exists (select 1 from public.storage_erasure_queue where path like 'a7600000-0000-0000-0000-0000000000a8/%') then
    raise exception 'a memberless organisation''s file was queued for removal';
  end if;
  if not exists (select 1 from public.submission_files where submission_id = 'a7600000-0000-0000-0000-000000000058') then
    raise exception 'the memberless organisation lost its manuscript record';
  end if;
  if exists (select 1 from storage.objects where owner = 'a7600000-0000-0000-0000-00000000000f') then raise exception 'the uploader link should still be cleared'; end if;

  -- The former sole author of Org W goes. Their unpublished manuscript is theirs and is removed.
  n := app.erase_personal_files('a7600000-0000-0000-0000-00000000000c');
  if not exists (select 1 from public.storage_erasure_queue where path = 'a7600000-0000-0000-0000-0000000000a9/manuscripts/00000000-0000-0000-0000-000000000091.pdf') then
    raise exception 'a former sole member''s own manuscript should be queued';
  end if;
  if exists (select 1 from public.submission_files where submission_id = 'a7600000-0000-0000-0000-000000000059') then raise exception 'their manuscript row should be gone'; end if;
  if exists (select 1 from public.storage_erasure_queue where path like 'a7600000-0000-0000-0000-0000000000a8/%') then raise exception 'Org Z was touched'; end if;
end $$;
-- An accepted invitation is the other record of a past membership.
insert into public.org_invitations (org_id, email, role, token_hash, expires_at, accepted_at, accepted_by) values
  ('a7600000-0000-0000-0000-0000000000a8', 'other76@test.example', 'author', repeat('6', 64), now() + interval '7 days', now(), 'a7600000-0000-0000-0000-00000000000f');
do $$ begin
  if not app.is_or_was_org_member('a7600000-0000-0000-0000-00000000000f', 'a7600000-0000-0000-0000-0000000000a8') then raise exception 'an accepted invitation shows a past membership'; end if;
  if has_function_privilege('service_role', 'app.is_or_was_org_member(uuid, uuid)', 'execute') or has_function_privilege('authenticated', 'app.is_or_was_org_member(uuid, uuid)', 'execute') then
    raise exception 'the membership check is not for API roles';
  end if;
end $$;
rollback to savepoint rx2;
release savepoint rx2;

-- ---------------------------------------------------------------------------
-- 3. M20: consent history
-- ---------------------------------------------------------------------------
do $$ declare n int; r record; begin
  -- The deleted person's rows stay, with a keyed hash where the id was.
  select count(*) into n from public.consent_history where subject_hash = app.keyed_hash('consent_subject', 'a7600000-0000-0000-0000-00000000000d');
  -- health given, faith given, faith withdrawn, then health withdrawn by the deletion job.
  if n <> 4 then raise exception 'four consent rows should outlive the account, found %', n; end if;
  if exists (select 1 from public.consent_history
              where subject_hash = app.keyed_hash('consent_subject', 'a7600000-0000-0000-0000-00000000000d')
                and (user_id is not null or erased_at is null)) then
    raise exception 'a kept consent row still points at the person, or has no erasure date';
  end if;
  if exists (select 1 from public.consent_history where user_id = 'a7600000-0000-0000-0000-00000000000d') then raise exception 'a row still holds the id'; end if;
  select * into r from public.consent_history
   where subject_hash = app.keyed_hash('consent_subject', 'a7600000-0000-0000-0000-00000000000d') and kind = 'health' and action = 'withdrawn';
  if r.source <> 'account_deletion' or r.version <> 'v1' then raise exception 'the deletion should be recorded as the end of health consent, got % %', r.source, r.version; end if;
  select count(*) into n from public.consent_history
   where subject_hash = app.keyed_hash('consent_subject', 'a7600000-0000-0000-0000-00000000000d') and source = 'reader';
  if n <> 3 then raise exception 'three rows were the reader''s own acts, found %', n; end if;
  -- Not the plain hash of the id.
  if app.keyed_hash('consent_subject', 'a7600000-0000-0000-0000-00000000000d') = app.sha256_hex('a7600000-0000-0000-0000-00000000000d') then
    raise exception 'the subject hash is not keyed';
  end if;
end $$;

select test_as('a7600000-0000-0000-0000-00000000000f');
do $$ declare n int; begin
  perform public.set_health_consent('v1');
  perform public.set_health_consent('v2');
  perform public.clear_health_consent();
  select count(*) into n from public.consent_history;
  if n <> 3 then raise exception 'a reader sees their own three rows and nobody else''s, saw %', n; end if;
  if (select array_agg(action || ':' || version order by id) from public.consent_history) is distinct from array['given:v1', 'given:v2', 'withdrawn:v2'] then
    raise exception 'history out of order: %', (select array_agg(action || ':' || version order by id) from public.consent_history);
  end if;
  begin
    update public.consent_history set action = 'given';
    raise exception 'a reader changed consent history';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.consent_history;
    raise exception 'a reader deleted consent history';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.consent_history (user_id, kind, version, action, source) values ('a7600000-0000-0000-0000-00000000000f', 'health', 'v9', 'given', 'reader');
    raise exception 'a reader wrote consent history directly';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- Not even the table owner or the service role can rewrite or remove a live row.
do $$ begin
  begin
    update public.consent_history set version = 'v3' where user_id = 'a7600000-0000-0000-0000-00000000000f';
    raise exception 'history was rewritten';
  exception when insufficient_privilege then null; end;
  begin
    update public.consent_history set user_id = 'a7600000-0000-0000-0000-00000000000c' where user_id = 'a7600000-0000-0000-0000-00000000000f';
    raise exception 'history was moved to another person';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.consent_history where user_id = 'a7600000-0000-0000-0000-00000000000f';
    raise exception 'history was deleted';
  exception when insufficient_privilege then null; end;
end $$;

-- RX-4. TRUNCATE skips row triggers, so it has its own refusal, for the owner
-- as much as anyone. No API role holds any write privilege on the table.
do $$ declare r text; p text; begin
  begin
    truncate public.consent_history;
    raise exception 'history was truncated by the owner';
  exception when insufficient_privilege then null; end;
  begin
    truncate public.consent_history cascade;
    raise exception 'history was truncated with cascade';
  exception when insufficient_privilege then null; end;
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    foreach p in array array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
      if has_table_privilege(r, 'public.consent_history', p) then raise exception '% holds % on consent_history', r, p; end if;
    end loop;
  end loop;
  if not has_table_privilege('service_role', 'public.consent_history', 'SELECT') then raise exception 'the service role should still read consent history'; end if;
end $$;
select pg_temp.as_service();
do $$ begin
  begin
    truncate public.consent_history;
    raise exception 'history was truncated by the service role';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
do $$ begin
  if not exists (select 1 from public.consent_history where user_id = 'a7600000-0000-0000-0000-00000000000f') then raise exception 'the history should be untouched'; end if;
end $$;

-- An auth user removed with no deletion job (the dashboard, say) while consent is held.
select test_as('a7600000-0000-0000-0000-00000000000e');
do $$ begin perform public.set_faith_consent('v1'); end $$;
reset role;
select set_config('request.jwt.claims', '', true);
delete from auth.users where id = 'a7600000-0000-0000-0000-00000000000e';
do $$ declare n int; begin
  select count(*) into n from public.consent_history where subject_hash = app.keyed_hash('consent_subject', 'a7600000-0000-0000-0000-00000000000e') and user_id is null and erased_at is not null;
  if n <> 2 then raise exception 'given and the closing withdrawn row should both be kept as hashes, found %', n; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. M21: the retention prune
-- ---------------------------------------------------------------------------
insert into public.leads (kind, name, email, consent_contact, created_at) values
  ('author', 'Old Lead', 'oldlead76@test.example', true, now() - interval '25 months'),
  ('author', 'New Lead', 'newlead76@test.example', true, now() - interval '23 months');
insert into public.support_messages (topic, name, email, message, consent_contact, created_at) values
  ('other', 'Old Msg', 'oldmsg76@test.example', 'Hello', true, now() - interval '25 months'),
  ('other', 'New Msg', 'newmsg76@test.example', 'Hello', true, now() - interval '23 months');
insert into public.takedown_notices (id, reference, kind, basis, name, email, address, phone, relationship, location, explanation, good_faith, accurate, signature, status, decided_at, ip_hash, created_at) values
  ('a7600000-0000-0000-0000-000000000071', 'TN-76000000A1', 'notice', 'copyright', 'Old Claimant', 'oldclaim76@test.example', '1 Old Street', '0123', 'owner', 'somewhere', 'Mine', true, true, 'Old Claimant', 'rejected', now() - interval '73 months', repeat('e', 64), now() - interval '74 months'),
  ('a7600000-0000-0000-0000-000000000072', 'TN-76000000A2', 'notice', 'copyright', 'Open Claimant', 'openclaim76@test.example', '2 Old Street', null, 'owner', 'somewhere', 'Mine', true, true, 'Open Claimant', 'received', null, null, now() - interval '74 months'),
  ('a7600000-0000-0000-0000-000000000073', 'TN-76000000A3', 'notice', 'copyright', 'New Claimant', 'newclaim76@test.example', '3 New Street', null, 'owner', 'somewhere', 'Mine', true, true, 'New Claimant', 'rejected', now() - interval '2 months', null, now() - interval '3 months');
-- Ordinary entries (RX-3: the audit period covers these and nothing else).
insert into public.audit_log (action, target, at) values
  ('workbook.version_saved', 'test76-old', now() - interval '73 months'), ('workbook.version_saved', 'test76-new', now() - interval '71 months');
insert into public.newsletter_subscribers (email, status, unsubscribed_at, created_at) values
  ('oldunsub76@test.example', 'unsubscribed', now() - interval '13 months', now() - interval '20 months'),
  ('newunsub76@test.example', 'unsubscribed', now() - interval '11 months', now() - interval '20 months'),
  ('oldconfirmed76@test.example', 'confirmed', null, now() - interval '20 months');
-- A consent row whose account went more than six years ago. Only the guard's
-- own path can stamp erased_at, so the date is moved with the trigger off.
alter table public.consent_history disable trigger consent_history_append_only;
update public.consent_history set erased_at = now() - interval '73 months'
 where subject_hash = app.keyed_hash('consent_subject', 'a7600000-0000-0000-0000-00000000000e');
alter table public.consent_history enable trigger consent_history_append_only;
update public.email_webhook_events set received_at = now() - interval '4 months' where event_id = 'msg_76_3';

-- The defaults. The audit log and takedown notices start switched off.
do $$ begin
  if (select count(*) from public.retention_periods where key in ('leads', 'support_messages', 'takedown_notices', 'audit_log', 'org_roster_archive', 'newsletter_unsubscribed', 'consent_history_after_deletion')) <> 7 then
    raise exception 'a retention period is missing';
  end if;
  if (select months from public.retention_periods where key = 'leads') <> 24 or (select months from public.retention_periods where key = 'support_messages') <> 24
     or (select months from public.retention_periods where key = 'org_roster_archive') <> 12 or (select months from public.retention_periods where key = 'newsletter_unsubscribed') <> 12
     or (select months from public.retention_periods where key = 'consent_history_after_deletion') <> 72 then
    raise exception 'a default period is not the one set';
  end if;
  if (select months from public.retention_periods where key = 'audit_log') is not null or (select months from public.retention_periods where key = 'takedown_notices') is not null then
    raise exception 'the audit log and takedown prunes must start off';
  end if;
end $$;
select pg_temp.as_service();
do $$ declare a jsonb; begin
  a := public.prune_retention();
  if (a->>'audit_log')::int <> 0 or (a->>'takedown_notices_redacted')::int <> 0 then raise exception 'a switched-off prune ran: %', a; end if;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
do $$ begin
  if not exists (select 1 from public.audit_log where target = 'test76-old') then raise exception 'the audit log was pruned while off'; end if;
  if (select name from public.takedown_notices where id = 'a7600000-0000-0000-0000-000000000071') <> 'Old Claimant' then raise exception 'a notice was redacted while off'; end if;
  -- The first run pruned the rest; put the old rows back so the full run below is checked in one place.
end $$;
insert into public.leads (kind, name, email, consent_contact, created_at) values ('author', 'Old Lead', 'oldlead76@test.example', true, now() - interval '25 months');
insert into public.support_messages (topic, name, email, message, consent_contact, created_at) values ('other', 'Old Msg', 'oldmsg76@test.example', 'Hello', true, now() - interval '25 months');
insert into public.newsletter_subscribers (email, status, unsubscribed_at, created_at) values ('oldunsub76@test.example', 'unsubscribed', now() - interval '13 months', now() - interval '20 months');
insert into public.email_webhook_events (event_id, type, received_at) values ('msg_76_old', 'email.delivered', now() - interval '4 months');
delete from public.audit_log where action = 'retention.pruned';
-- The owner sets the two periods (six years here, for the test).
update public.retention_periods set months = 72 where key in ('audit_log', 'takedown_notices');

select test_as('a7600000-0000-0000-0000-00000000000f');
do $$ begin
  begin
    perform public.prune_retention();
    raise exception 'a reader ran the prune';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

select pg_temp.as_service();
do $$ declare a jsonb; b jsonb; k text; begin
  a := public.prune_retention();
  if (a->>'leads')::int < 1 or (a->>'support_messages')::int < 1 or (a->>'takedown_notices_redacted')::int < 1 or (a->>'audit_log')::int < 1
     or (a->>'newsletter_unsubscribed')::int < 1 or (a->>'email_webhook_events')::int < 1 then
    raise exception 'the prune missed something: %', a;
  end if;
  -- Counts only.
  for k in select jsonb_object_keys(a) loop
    if jsonb_typeof(a->k) <> 'number' then raise exception 'the prune returned something that is not a count: %', k; end if;
  end loop;
  -- Run again: nothing left to do.
  b := public.prune_retention();
  for k in select jsonb_object_keys(b) loop
    if (b->>k)::int <> 0 then raise exception 'the second run pruned % again (%)', k, b->>k; end if;
  end loop;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

do $$ declare r record; begin
  if exists (select 1 from public.leads where email = 'oldlead76@test.example') then raise exception 'the old lead stayed'; end if;
  if not exists (select 1 from public.leads where email = 'newlead76@test.example') then raise exception 'a lead inside the period went'; end if;
  if exists (select 1 from public.support_messages where email = 'oldmsg76@test.example') then raise exception 'the old message stayed'; end if;
  if not exists (select 1 from public.support_messages where email = 'newmsg76@test.example') then raise exception 'a message inside the period went'; end if;
  -- The old decided notice is kept as a record with nobody's details on it.
  select * into r from public.takedown_notices where id = 'a7600000-0000-0000-0000-000000000071';
  if r.reference is null or r.name <> 'removed' or r.email <> 'removed' or r.address <> 'removed' or r.signature <> 'removed' or r.phone is not null or r.ip_hash is not null then
    raise exception 'the old decided notice should be redacted and kept';
  end if;
  if (select name from public.takedown_notices where id = 'a7600000-0000-0000-0000-000000000072') <> 'Open Claimant' then raise exception 'an open notice was redacted'; end if;
  if (select name from public.takedown_notices where id = 'a7600000-0000-0000-0000-000000000073') <> 'New Claimant' then raise exception 'a recent notice was redacted'; end if;
  if exists (select 1 from public.audit_log where target = 'test76-old') then raise exception 'the old audit row stayed'; end if;
  if not exists (select 1 from public.audit_log where target = 'test76-new') then raise exception 'an audit row inside the period went'; end if;
  if exists (select 1 from public.newsletter_subscribers where email = 'oldunsub76@test.example') then raise exception 'the old unsubscribed address stayed'; end if;
  if not exists (select 1 from public.newsletter_subscribers where email = 'newunsub76@test.example') then raise exception 'a recent unsubscribe went'; end if;
  if not exists (select 1 from public.newsletter_subscribers where email = 'oldconfirmed76@test.example') then raise exception 'a confirmed subscriber went'; end if;
  -- Nothing is left behind for a pruned unsubscribe.
  if exists (select 1 from public.email_suppressions where address_hash = app.email_address_hash('oldunsub76@test.example')) then
    raise exception 'a pruned unsubscribe left a hash';
  end if;
  if exists (select 1 from public.consent_history where subject_hash = app.keyed_hash('consent_subject', 'a7600000-0000-0000-0000-00000000000e')) then
    raise exception 'consent rows past six years after deletion stayed';
  end if;
  if not exists (select 1 from public.consent_history where subject_hash = app.keyed_hash('consent_subject', 'a7600000-0000-0000-0000-00000000000d')) then
    raise exception 'consent rows inside six years went';
  end if;
  -- One audit row for the run that pruned, holding counts and nothing else.
  if (select count(*) from public.audit_log where action = 'retention.pruned') <> 1 then raise exception 'expected one audit row for the prune'; end if;
end $$;

-- The prune never reaches the records that must be kept.
do $$ declare v text; begin
  v := pg_get_functiondef('app.prune_retention()'::regprocedure);
  if v ~* '(answers|purchases|entitlements|ledger|payout|invoice|terms_accept|enrolments|progress)' then
    raise exception 'the prune names a table it must never touch';
  end if;
end $$;

update public.retention_periods set months = null where key = 'leads';
insert into public.leads (kind, name, email, consent_contact, created_at) values ('author', 'Kept Lead', 'keptlead76@test.example', true, now() - interval '40 months');
select pg_temp.as_service();
do $$ begin perform public.prune_retention(); end $$;
reset role;
select set_config('request.jwt.claims', '', true);
do $$ begin
  if not exists (select 1 from public.leads where email = 'keptlead76@test.example') then raise exception 'a switched-off prune still ran'; end if;
end $$;

-- RX-3. The audit period is set (72 months above). Entries far older than it:
-- only the ordinary one goes. Money, commerce, refund, tax, royalty, payout,
-- consent, deletion, staff-privilege and unknown actions all stay.
do $$ begin
  if not app.audit_action_prunable('workbook.version_saved') or not app.audit_action_prunable('support.status') or not app.audit_action_prunable('tenant_domain.verified') then
    raise exception 'an ordinary action should be prunable';
  end if;
  if app.audit_action_prunable('money.payout_approved') or app.audit_action_prunable('commerce.bundle_refunded') or app.audit_action_prunable('payout.tax_details_changed')
     or app.audit_action_prunable('price.chosen') or app.audit_action_prunable('referral.reversed') or app.audit_action_prunable('org.invoice_paid')
     or app.audit_action_prunable('org.cooling_off_cancelled') or app.audit_action_prunable('org.member_role_changed') or app.audit_action_prunable('terms.accept')
     or app.audit_action_prunable('account.deletion_completed') or app.audit_action_prunable('account.lookup') or app.audit_action_prunable('mfa_recovery.issued')
     or app.audit_action_prunable('flag.changed') or app.audit_action_prunable('demo.account_added') or app.audit_action_prunable('legal_hold.placed')
     or app.audit_action_prunable('retention.pruned') or app.audit_action_prunable('takedown.actioned') or app.audit_action_prunable('release.override_approved')
     or app.audit_action_prunable('licence.verified') or app.audit_action_prunable('partner.forgotten') or app.audit_action_prunable('workbook.royalty_split')
     or app.audit_action_prunable('support.refund_note') or app.audit_action_prunable('author.consent_recorded') then
    raise exception 'an action that must be kept is prunable';
  end if;
  -- unknown, odd or missing: keep
  if app.audit_action_prunable('brand_new_area.something') or app.audit_action_prunable('test.old76') or app.audit_action_prunable('Workbook.Saved')
     or app.audit_action_prunable('workbook') or app.audit_action_prunable('') or coalesce(app.audit_action_prunable(null), false) then
    raise exception 'an unknown action must default to keep';
  end if;
end $$;
insert into public.audit_log (action, target, at)
select a, 'rx3-76', now() - interval '100 months'
  from unnest(array['money.payout_approved', 'commerce.bundle_refunded', 'payout.tax_details_changed', 'account.deletion_completed',
                    'terms.accept', 'mfa_recovery.issued', 'org.invoice_paid', 'brand_new_area.something', 'support.status']) a;
select pg_temp.as_service();
do $$ declare a jsonb; begin
  a := public.prune_retention();
  if (a->>'audit_log')::int <> 1 then raise exception 'only the ordinary old entry should go, saw %', a; end if;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
do $$ declare n int; begin
  select count(*) into n from public.audit_log where target = 'rx3-76';
  if n <> 8 then raise exception 'eight kept entries expected, found %', n; end if;
  if exists (select 1 from public.audit_log where target = 'rx3-76' and action = 'support.status') then raise exception 'the ordinary old entry stayed'; end if;
  if not exists (select 1 from public.audit_log where target = 'rx3-76' and action = 'money.payout_approved') then raise exception 'a money audit entry was pruned'; end if;
end $$;

-- RX-3. The legal hold. Placed and released by a platform owner under the
-- staff rule of 0074, each with a reason and an audit entry. While it is in
-- place the sweep removes and redacts nothing.
insert into public.leads (kind, name, email, consent_contact, created_at) values ('author', 'Held Lead', 'heldlead76@test.example', true, now() - interval '30 months');
insert into public.support_messages (topic, name, email, message, consent_contact, created_at) values ('other', 'Held Msg', 'heldmsg76@test.example', 'Hello', true, now() - interval '30 months');
insert into public.newsletter_subscribers (email, status, unsubscribed_at, created_at) values ('heldunsub76@test.example', 'unsubscribed', now() - interval '14 months', now() - interval '20 months');
insert into public.audit_log (action, target, at) values ('support.status', 'rx3-76-held', now() - interval '100 months');
insert into public.takedown_notices (id, reference, kind, basis, name, email, address, phone, relationship, location, explanation, good_faith, accurate, signature, status, decided_at, ip_hash, created_at) values
  ('a7600000-0000-0000-0000-000000000074', 'TN-76000000A4', 'notice', 'copyright', 'Held Claimant', 'heldclaim76@test.example', '4 Old Street', null, 'owner', 'somewhere', 'Mine', true, true, 'Held Claimant', 'rejected', now() - interval '80 months', null, now() - interval '81 months');
update public.retention_periods set months = 24 where key = 'leads';

-- A reader, the service role and a signed-out caller cannot place one.
select test_as('a7600000-0000-0000-0000-00000000000f');
do $$ begin
  begin
    perform public.legal_hold_set('A reader tries to stop the sweep');
    raise exception 'a reader placed a legal hold';
  exception when insufficient_privilege then null; end;
  if exists (select 1 from public.legal_hold) then raise exception 'a reader reads the legal hold table'; end if;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
select pg_temp.as_service();
do $$ begin
  begin
    perform public.legal_hold_set('The service role tries to place one');
    raise exception 'the service role placed a legal hold';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.legal_hold (reason) values ('Written straight into the table');
    raise exception 'the service role wrote the legal hold table';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
select pg_temp.as_anon();
do $$ begin
  begin
    perform public.legal_hold_set('Signed out and trying anyway');
    raise exception 'a signed-out caller placed a legal hold';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- An owner whose session has no second factor is refused (0074).
select test_as('a7600000-0000-0000-0000-00000000000f', array['owner']);
select set_config('request.jwt.claims', jsonb_build_object('sub', 'a7600000-0000-0000-0000-00000000000f', 'role', 'authenticated', 'aal', 'aal1',
  'amr', jsonb_build_array(jsonb_build_object('method', 'otp', 'timestamp', 1)),
  'app_metadata', jsonb_build_object('platform_roles', jsonb_build_array('owner')))::text, true);
do $$ begin
  begin
    perform public.legal_hold_set('An owner with no second factor');
    raise exception 'an owner at aal1 placed a legal hold';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
-- A support role is not enough either.
select test_as('a7600000-0000-0000-0000-00000000000f', array['support']);
do $$ begin
  begin
    perform public.legal_hold_set('Support staff are not the owner');
    raise exception 'support staff placed a legal hold';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

select test_as('a7600000-0000-0000-0000-00000000000f', array['owner']);
do $$ declare v bigint; begin
  begin
    perform public.legal_hold_set('short');
    raise exception 'a hold with no real reason was placed';
  exception when check_violation then null; end;
  begin
    perform public.legal_hold_clear('There is nothing to release yet');
    raise exception 'a hold that is not there was released';
  exception when object_not_in_prerequisite_state then null; end;
  v := public.legal_hold_set('Solicitor letter of 26 November: keep everything');
  if v is null then raise exception 'the hold was not placed'; end if;
  begin
    perform public.legal_hold_set('A second hold on top of the first');
    raise exception 'two holds were open at once';
  exception when object_not_in_prerequisite_state then null; end;
  if (select count(*) from public.legal_hold where released_at is null and placed_by = 'a7600000-0000-0000-0000-00000000000f') <> 1 then
    raise exception 'the owner should read the open hold';
  end if;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
do $$ begin
  if (select count(*) from public.audit_log where action = 'legal_hold.placed' and actor = 'a7600000-0000-0000-0000-00000000000f' and reason like 'Solicitor letter%') <> 1 then
    raise exception 'placing the hold should be audited once, with the reason and the owner';
  end if;
end $$;

-- The sweep under the hold: every count nought, every row still there.
select pg_temp.as_service();
do $$ declare a jsonb; k text; begin
  a := public.prune_retention();
  if a->'legal_hold' is distinct from 'true'::jsonb then raise exception 'the answer should say a hold is in place: %', a; end if;
  for k in select jsonb_object_keys(a - 'legal_hold') loop
    if (a->>k)::int <> 0 then raise exception 'the sweep pruned % under a legal hold', k; end if;
  end loop;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
do $$ begin
  if not exists (select 1 from public.leads where email = 'heldlead76@test.example') then raise exception 'a lead was pruned under the hold'; end if;
  if not exists (select 1 from public.support_messages where email = 'heldmsg76@test.example') then raise exception 'a message was pruned under the hold'; end if;
  if not exists (select 1 from public.newsletter_subscribers where email = 'heldunsub76@test.example') then raise exception 'a newsletter address was pruned under the hold'; end if;
  if not exists (select 1 from public.audit_log where target = 'rx3-76-held') then raise exception 'an audit entry was pruned under the hold'; end if;
  if (select name from public.takedown_notices where id = 'a7600000-0000-0000-0000-000000000074') <> 'Held Claimant' then raise exception 'a notice was redacted under the hold'; end if;
  -- The roster archive, consent history and the rest sit behind the same early return:
  -- the hold is checked before the first prune in the function.
  if position('legal_hold_active' in pg_get_functiondef('app.prune_retention()'::regprocedure))
     > position('delete from' in pg_get_functiondef('app.prune_retention()'::regprocedure)) then
    raise exception 'the hold must be checked before anything is pruned';
  end if;
end $$;

-- Released: audited, and the sweep works again.
select test_as('a7600000-0000-0000-0000-00000000000f', array['owner']);
do $$ begin
  perform public.legal_hold_clear('Matter closed, confirmed by the solicitor');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
do $$ begin
  if (select count(*) from public.audit_log where action = 'legal_hold.released' and actor = 'a7600000-0000-0000-0000-00000000000f') <> 1 then
    raise exception 'releasing the hold should be audited once';
  end if;
  if exists (select 1 from public.legal_hold where released_at is null) then raise exception 'the hold should be closed'; end if;
  if (select count(*) from public.legal_hold) <> 1 then raise exception 'the closed hold is kept as a record'; end if;
end $$;
select pg_temp.as_service();
do $$ declare a jsonb; begin
  a := public.prune_retention();
  if a ? 'legal_hold' then raise exception 'no hold is in place: %', a; end if;
  if (a->>'leads')::int < 1 or (a->>'support_messages')::int < 1 or (a->>'newsletter_unsubscribed')::int < 1 or (a->>'audit_log')::int < 1 or (a->>'takedown_notices_redacted')::int < 1 then
    raise exception 'the sweep should run again once the hold is released: %', a;
  end if;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
do $$ begin
  -- the hold's own audit entries are in an area the audit prune never touches
  if app.audit_action_prunable('legal_hold.placed') or app.audit_action_prunable('legal_hold.released') then raise exception 'legal hold entries must be kept'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. L12: newsletter tokens
-- ---------------------------------------------------------------------------
-- A subscriber from before this migration: only the hash of their old token is left.
insert into public.newsletter_subscribers (email, status, confirmed_at, token_hash) values
  ('legacy76@test.example', 'confirmed', now(), app.sha256_hex(repeat('9', 64)));

select pg_temp.as_service();
do $$ declare t text; link text; n int; begin
  t := public.newsletter_subscribe('fresh76@test.example', repeat('a', 64));
  if t is null or char_length(t) <> 64 then raise exception 'a new address should get a token'; end if;
  if exists (select 1 from public.newsletter_subscribers where token is not null) then raise exception 'a plain token was stored'; end if;
  if (select token_hash from public.newsletter_subscribers where email = 'fresh76@test.example') <> app.sha256_hex(t) then raise exception 'the hash of the token should be stored'; end if;
  if public.newsletter_confirm(app.sha256_hex(t)) then raise exception 'the stored hash must not work as a token'; end if;
  if not public.newsletter_confirm(t) then raise exception 'the token should confirm'; end if;

  -- An issue mints a link token for each recipient and keeps the hash.
  select token into link from public.newsletter_next_recipients(gen_random_uuid(), 10) where email = 'fresh76@test.example';
  if link is null or char_length(link) <> 64 or link = t then raise exception 'each recipient should get a fresh link token'; end if;
  if not exists (select 1 from public.newsletter_link_tokens where token_hash = app.sha256_hex(link)) then raise exception 'the link token hash was not kept'; end if;
  if exists (select 1 from public.newsletter_link_tokens where token_hash = link) then raise exception 'a plain link token was stored'; end if;
  if public.newsletter_confirm(repeat('5', 64)) then raise exception 'an unknown token confirmed'; end if;
  if not public.newsletter_unsubscribe(link) then raise exception 'the link in the issue should unsubscribe'; end if;
  if public.newsletter_confirm(link) then raise exception 'a link token from an issue must not confirm a sign-up'; end if;
  if (select status from public.newsletter_subscribers where email = 'fresh76@test.example') <> 'unsubscribed' then raise exception 'should be unsubscribed'; end if;

  -- A link sent before this migration still works.
  if not public.newsletter_unsubscribe(repeat('9', 64)) then raise exception 'an old link stopped working'; end if;
  if (select status from public.newsletter_subscribers where email = 'legacy76@test.example') <> 'unsubscribed' then raise exception 'the old link should unsubscribe'; end if;
  if public.newsletter_unsubscribe(repeat('8', 64)) then raise exception 'an unknown token unsubscribed someone'; end if;
  if public.newsletter_unsubscribe(null) then raise exception 'a null token unsubscribed someone'; end if;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- 6. L12: gift claim tokens
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
do $$ declare paid jsonb; begin
  perform public.gift_create('00000000-0000-0000-0000-00000000000a', 'a7600000-0000-0000-0000-00000000000c', 'cs_g76a',
    'tok76aaxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 3, 'friend76@gift.test', null, null, null, 'GBP', 2397);
  paid := public.gift_mark_paid('cs_g76a', 'pi_g76a', 2397, 0, 'GBP');
  if paid->>'token' is not null then raise exception 'the database handed back a plain token'; end if;
  perform public.gift_create('00000000-0000-0000-0000-00000000000a', 'a7600000-0000-0000-0000-00000000000c', 'cs_g76b',
    'tok76bbxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 1, 'friend76@gift.test', null, null, null, 'GBP', 799);
  perform public.gift_mark_paid('cs_g76b', 'pi_g76b', 799, 0, 'GBP');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
do $$ begin
  if exists (select 1 from public.gift_memberships where claim_token is not null) then raise exception 'a plain claim token was stored'; end if;
  if (select claim_token_hash from public.gift_memberships where stripe_checkout_session_id = 'cs_g76a') <> app.sha256_hex('tok76aaxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx') then
    raise exception 'the hash of the claim token should be stored';
  end if;
  -- The link works for someone who is not signed in, by the token alone.
  if (select count(*) from public.gift_preview('tok76aaxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')) <> 1 then raise exception 'the claim link should preview'; end if;
  if (select count(*) from public.gift_preview(app.sha256_hex('tok76aaxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'))) <> 0 then raise exception 'the stored hash must not work as a token'; end if;
end $$;

-- The server registers the hash of a link it derives (a gift from before this migration).
select test_as('a7600000-0000-0000-0000-00000000000f');
do $$ begin
  begin
    perform public.gift_link_register((select id from public.gift_memberships limit 1), repeat('a', 64));
    raise exception 'a reader registered a gift link';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
select pg_temp.as_service();
do $$ declare v_id uuid; begin
  select id into v_id from public.gift_memberships where stripe_checkout_session_id = 'cs_g76b';
  if not public.gift_link_register(v_id, app.sha256_hex('derived76bxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')) then raise exception 'the derived link should register'; end if;
  if not public.gift_link_register(v_id, app.sha256_hex('derived76bxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')) then raise exception 'registering twice is fine'; end if;
  if not public.gift_link_register(v_id, app.sha256_hex('tok76bbxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')) then raise exception 'the first link is already registered'; end if;
  if (select claim_token_hash from public.gift_memberships where id = v_id) <> app.sha256_hex('tok76bbxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx') then
    raise exception 'registering a derived link must not replace the link already sent';
  end if;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

select test_as('a7600000-0000-0000-0000-00000000000f');
do $$ begin
  if public.claim_gift('nopenopenopenopenopenopenopenopenopenope') <> 'invalid' then raise exception 'an unknown token claimed a gift'; end if;
  -- The link already sent opens the first gift. The derived link opens the second.
  if public.claim_gift('tok76aaxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx') <> 'claimed' then raise exception 'the sent link should claim'; end if;
  if public.claim_gift('tok76aaxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx') <> 'invalid' then raise exception 'a link should work once'; end if;
  if public.claim_gift('derived76bxxxxxxxxxxxxxxxxxxxxxxxxxxxxx') <> 'claimed' then raise exception 'the derived link should claim'; end if;
  if public.claim_gift('tok76bbxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx') <> 'invalid' then raise exception 'the other link to a claimed gift should be dead'; end if;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
do $$ begin
  if exists (select 1 from public.gift_memberships where stripe_checkout_session_id in ('cs_g76a', 'cs_g76b')
              and (claim_token is not null or claim_token_hash is not null or claim_token_hash_alt is not null)) then
    raise exception 'a claimed gift kept a token or a hash';
  end if;
  -- A reader's column grant never reaches the hashes.
  if has_column_privilege('authenticated', 'public.gift_memberships', 'claim_token_hash', 'select')
     or has_column_privilege('authenticated', 'public.gift_memberships', 'claim_token_hash_alt', 'select') then
    raise exception 'readers can read the gift token hashes';
  end if;
end $$;

rollback;
