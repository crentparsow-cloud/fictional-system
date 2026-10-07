-- Account deletion with a 7-day undo (F-025) and the staff request list
-- (F-091). Each block must raise or return the expected count; a failure
-- aborts the script and the CI step.
\set ON_ERROR_STOP on

begin;

-- Readers A, B and C, and a support member of staff.
insert into auth.users (id, email) values
  ('55555555-5555-5555-5555-555555555555', 'reader-a@test'),
  ('66666666-6666-6666-6666-666666666666', 'reader-b@test'),
  ('88888888-8888-8888-8888-888888888888', 'reader-c@test'),
  ('77777777-7777-7777-7777-777777777777', 'staff@test');
update public.profiles set display_name = 'Reader A', country = 'GB', adult_confirmed_at = now(),
  health_consent_at = now(), health_consent_version = 'v1'
 where user_id = '55555555-5555-5555-5555-555555555555';
update public.profiles set display_name = 'Reader B', adult_confirmed_at = now()
 where user_id = '66666666-6666-6666-6666-666666666666';

insert into public.organisations (id, kind, legal_name, display_name, slug, country) values
  ('abababab-0000-0000-0000-000000000001', 'publisher', 'Org G Ltd', 'Org G', 'org-g', 'GB');
insert into public.authors (id, code, org_id, slug, display_name, country) values
  ('abababab-0000-0000-0000-0000000000a1', 'AU-TESTG', 'abababab-0000-0000-0000-000000000001', 'author-g', 'Author G', 'GB');
insert into public.books (id, org_id, slug, title) values
  ('abababab-0000-0000-0000-0000000000a2', 'abababab-0000-0000-0000-000000000001', 'book-g', 'Book G');
insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, depth, status) values
  ('abababab-0000-0000-0000-0000000000a4', 'AK-TESTG', 'abababab-0000-0000-0000-0000000000a2', 'abababab-0000-0000-0000-000000000001',
   'workbook-g', 'Workbook G', 'Card', 'productivity', 'full', 'live');
insert into public.workbook_versions (id, workbook_id, semver, content, content_hash, published_at) values
  ('abababab-0000-0000-0000-0000000000a6', 'abababab-0000-0000-0000-0000000000a4', '1.0.0', '{"schema_version": "3.0"}'::jsonb, repeat('e', 64), now());
update public.workbooks set current_version_id = 'abababab-0000-0000-0000-0000000000a6' where id = 'abababab-0000-0000-0000-0000000000a4';

-- A and B each have an enrolment, answers, progress, an entitlement and a
-- paid purchase. Written as the table owner, the way the server would.
insert into public.enrolments (id, user_id, tenant_id, workbook_id, version_id) values
  ('abababab-0000-0000-0000-0000000000e1', '55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-00000000000a',
   'abababab-0000-0000-0000-0000000000a4', 'abababab-0000-0000-0000-0000000000a6'),
  ('abababab-0000-0000-0000-0000000000e2', '66666666-6666-6666-6666-666666666666', '00000000-0000-0000-0000-00000000000a',
   'abababab-0000-0000-0000-0000000000a4', 'abababab-0000-0000-0000-0000000000a6');
insert into public.answers (enrolment_id, field, sealed, key_id) values
  ('abababab-0000-0000-0000-0000000000e1', 'exercise:ex_one.f_one', 'v2.k1.AAAA', 'k1'),
  ('abababab-0000-0000-0000-0000000000e1', 'checkin:1.mood', 'v2.k1.BBBB', 'k1'),
  ('abababab-0000-0000-0000-0000000000e2', 'exercise:ex_one.f_one', 'v2.k1.CCCC', 'k1');
insert into public.progress_events (enrolment_id, kind, ref) values
  ('abababab-0000-0000-0000-0000000000e1', 'unit_opened', '1'),
  ('abababab-0000-0000-0000-0000000000e2', 'unit_opened', '1');
insert into public.purchases (id, user_id, tenant_id, workbook_id, kind, stripe_checkout_session_id, currency, amount_minor, tax_minor, status) values
  ('abababab-0000-0000-0000-0000000000f1', '55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-00000000000a',
   'abababab-0000-0000-0000-0000000000a4', 'workbook', 'cs_test_del_a', 'GBP', 1200, 200, 'paid'),
  ('abababab-0000-0000-0000-0000000000f2', '66666666-6666-6666-6666-666666666666', '00000000-0000-0000-0000-00000000000a',
   'abababab-0000-0000-0000-0000000000a4', 'workbook', 'cs_test_del_b', 'GBP', 1200, 200, 'paid');
insert into public.entitlements (user_id, tenant_id, workbook_id, source, purchase_id) values
  ('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-00000000000a', 'abababab-0000-0000-0000-0000000000a4', 'purchase', 'abababab-0000-0000-0000-0000000000f1'),
  ('66666666-6666-6666-6666-666666666666', '00000000-0000-0000-0000-00000000000a', 'abababab-0000-0000-0000-0000000000a4', 'purchase', 'abababab-0000-0000-0000-0000000000f2');
insert into public.tenant_members (tenant_id, user_id) values
  ('00000000-0000-0000-0000-00000000000a', '55555555-5555-5555-5555-555555555555'),
  ('00000000-0000-0000-0000-00000000000a', '66666666-6666-6666-6666-666666666666');

create or replace function pg_temp.as_service() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "service_role"}'::text, true);
  execute 'set local role service_role';
end $$;

-- ---------------------------------------------------------------------------
-- Request, cancel, request again. The window is 7 days and is not extended
-- by asking twice. The client has no write grant on the table.
-- ---------------------------------------------------------------------------
select test_as('55555555-5555-5555-5555-555555555555');
do $$ declare r public.account_deletion_requests; r2 public.account_deletion_requests; n int; begin
  select * into r from public.request_account_deletion('moving on');
  if r.user_id <> '55555555-5555-5555-5555-555555555555' then raise exception 'request made for the wrong user'; end if;
  if r.cancel_before <> r.requested_at + interval '7 days' then raise exception 'window is not 7 days: % to %', r.requested_at, r.cancel_before; end if;
  if r.cancelled_at is not null or r.completed_at is not null then raise exception 'a new request is already ended'; end if;
  select * into r2 from public.request_account_deletion();
  if r2.id <> r.id or r2.cancel_before <> r.cancel_before then raise exception 'asking twice moved the window'; end if;

  select * into r2 from public.cancel_account_deletion();
  if r2.cancelled_at is null then raise exception 'cancel did not stamp cancelled_at'; end if;
  begin
    perform public.cancel_account_deletion();
    raise exception 'cancelled a request that was already cancelled';
  exception when no_data_found then null; end;

  select * into r2 from public.request_account_deletion();
  if r2.id <> r.id then raise exception 're-request should reuse the row'; end if;
  if r2.cancelled_at is not null then raise exception 're-request left cancelled_at set'; end if;

  select count(*) into n from public.account_deletion_requests;
  if n <> 1 then raise exception 'reader A should see 1 request, saw %', n; end if;

  begin
    insert into public.account_deletion_requests (user_id) values ('55555555-5555-5555-5555-555555555555');
    raise exception 'reader A inserted a request directly';
  exception when insufficient_privilege then null; end;
  begin
    update public.account_deletion_requests set cancel_before = now() + interval '1 year';
    raise exception 'reader A moved their window directly';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.account_deletion_requests;
    raise exception 'reader A deleted their request';
  exception when insufficient_privilege then null; end;
end $$;

-- ---------------------------------------------------------------------------
-- Reader B cannot see or cancel A's request. B's own cancel finds nothing.
-- C asks and cancels, so C has a cancelled row.
-- ---------------------------------------------------------------------------
select test_as('66666666-6666-6666-6666-666666666666');
do $$ declare n int; begin
  select count(*) into n from public.account_deletion_requests;
  if n <> 0 then raise exception 'reader B saw another reader''s request, %', n; end if;
  begin
    perform public.cancel_account_deletion();
    raise exception 'reader B cancelled something';
  exception when no_data_found then null; end;
  perform public.request_account_deletion();
end $$;
select test_as('88888888-8888-8888-8888-888888888888');
do $$ begin
  perform public.request_account_deletion();
  perform public.cancel_account_deletion();
end $$;

-- A's request still stands after B's cancel attempt.
reset role;
do $$ declare n int; begin
  select count(*) into n from public.account_deletion_requests
   where user_id = '55555555-5555-5555-5555-555555555555' and cancelled_at is null;
  if n <> 1 then raise exception 'reader A''s request was changed by someone else'; end if;
end $$;

-- Staff with support read every request; a reader with no platform role does not.
select test_as('77777777-7777-7777-7777-777777777777', array['support']);
do $$ declare n int; begin
  select count(*) into n from public.account_deletion_requests;
  if n <> 3 then raise exception 'support should see 3 requests, saw %', n; end if;
end $$;
select test_as('77777777-7777-7777-7777-777777777777', array['finance']);
do $$ declare n int; begin
  select count(*) into n from public.account_deletion_requests;
  if n <> 0 then raise exception 'finance staff saw deletion requests, %', n; end if;
end $$;

-- Anonymous callers can do nothing.
reset role;
select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
set local role anon;
do $$ begin
  begin
    perform count(*) from public.account_deletion_requests;
    raise exception 'anon read deletion requests';
  exception when insufficient_privilege then null; end;
  begin
    perform public.request_account_deletion();
    raise exception 'anon asked for a deletion';
  exception when insufficient_privilege then null; end;
end $$;

-- ---------------------------------------------------------------------------
-- complete_due_deletions refuses everyone but the service role, including an
-- authenticated caller who forges nothing and one who calls the app function.
-- ---------------------------------------------------------------------------
reset role;
select test_as('55555555-5555-5555-5555-555555555555', array['owner']);
do $$ begin
  begin
    perform public.complete_due_deletions();
    raise exception 'an authenticated caller completed deletions';
  exception when insufficient_privilege then null; end;
  begin
    perform app.complete_due_deletions();
    raise exception 'an authenticated caller reached the app function';
  exception when insufficient_privilege then null; end;
  begin
    perform public.mark_auth_removed('55555555-5555-5555-5555-555555555555');
    raise exception 'an authenticated caller marked auth removal';
  exception when insufficient_privilege then null; end;
end $$;
-- The table owner without the service role claim is refused by the function itself.
reset role;
select set_config('request.jwt.claims', '{"role": "authenticated"}', true);
do $$ begin
  begin
    perform app.complete_due_deletions();
    raise exception 'a caller without the service role claim completed deletions';
  exception when insufficient_privilege then null; end;
end $$;

-- ---------------------------------------------------------------------------
-- Nothing is due yet, so the job does nothing.
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
do $$ declare n int; begin
  select count(*) into n from public.complete_due_deletions();
  if n <> 0 then raise exception 'job returned % users before anything was due', n; end if;
end $$;
reset role;
do $$ declare n int; begin
  select count(*) into n from public.answers;
  if n <> 3 then raise exception 'answers removed before they were due, % left', n; end if;
end $$;

-- Move A and C past their window. B stays inside it. C is cancelled.
update public.account_deletion_requests set requested_at = now() - interval '8 days'
 where user_id in ('55555555-5555-5555-5555-555555555555', '88888888-8888-8888-8888-888888888888');
do $$ declare n int; begin
  select count(*) into n from public.account_deletion_requests
   where user_id = '55555555-5555-5555-5555-555555555555' and cancel_before = requested_at + interval '7 days' and cancel_before < now();
  if n <> 1 then raise exception 'window did not follow requested_at'; end if;
end $$;

-- Too late to cancel once the window has passed.
select test_as('55555555-5555-5555-5555-555555555555');
do $$ begin
  begin
    perform public.cancel_account_deletion();
    raise exception 'reader A cancelled after the window';
  exception when no_data_found then null; end;
end $$;

-- ---------------------------------------------------------------------------
-- The job removes A's data only. B (not due) and C (cancelled) keep theirs.
-- Purchases are untouched.
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.as_service();
do $$ declare ids uuid[]; begin
  select array_agg(user_id) into ids from public.complete_due_deletions();
  if ids is distinct from array['55555555-5555-5555-5555-555555555555'::uuid] then
    raise exception 'job should return only reader A, returned %', ids;
  end if;
end $$;
reset role;
do $$ declare n int; p record; begin
  select count(*) into n from public.enrolments where user_id = '55555555-5555-5555-5555-555555555555';
  if n <> 0 then raise exception 'reader A still has % enrolments', n; end if;
  select count(*) into n from public.answers where enrolment_id = 'abababab-0000-0000-0000-0000000000e1';
  if n <> 0 then raise exception 'reader A still has % answers', n; end if;
  select count(*) into n from public.progress_events where enrolment_id = 'abababab-0000-0000-0000-0000000000e1';
  if n <> 0 then raise exception 'reader A still has % progress events', n; end if;
  select count(*) into n from public.entitlements where user_id = '55555555-5555-5555-5555-555555555555';
  if n <> 0 then raise exception 'reader A still has % entitlements', n; end if;
  select count(*) into n from public.tenant_members where user_id = '55555555-5555-5555-5555-555555555555';
  if n <> 0 then raise exception 'reader A still has % memberships', n; end if;
  select count(*) into n from public.profiles
   where user_id = '55555555-5555-5555-5555-555555555555' and display_name is null and country is null and adult_confirmed_at is null
     and health_consent_at is null and health_consent_version is null;
  if n <> 1 then raise exception 'reader A''s profile was not cleared'; end if;

  select count(*) into n from public.answers where enrolment_id = 'abababab-0000-0000-0000-0000000000e2';
  if n <> 1 then raise exception 'reader B lost answers before their window ended, % left', n; end if;
  select count(*) into n from public.enrolments where user_id = '66666666-6666-6666-6666-666666666666';
  if n <> 1 then raise exception 'reader B lost their enrolment'; end if;
  select count(*) into n from public.profiles where user_id = '66666666-6666-6666-6666-666666666666' and display_name = 'Reader B';
  if n <> 1 then raise exception 'reader B''s profile was cleared'; end if;
  select count(*) into n from public.account_deletion_requests
   where user_id = '88888888-8888-8888-8888-888888888888' and completed_at is null and cancelled_at is not null;
  if n <> 1 then raise exception 'reader C''s cancelled request was completed'; end if;

  select * into p from public.purchases where id = 'abababab-0000-0000-0000-0000000000f1';
  if p.user_id is distinct from '55555555-5555-5555-5555-555555555555'::uuid or p.status <> 'paid' or p.amount_minor <> 1200 or p.tax_minor <> 200 then
    raise exception 'reader A''s purchase was changed by the job';
  end if;
  select count(*) into n from public.purchases;
  if n <> 2 then raise exception 'purchases changed, % left', n; end if;

  select count(*) into n from public.audit_log where action = 'account.deletion_completed' and target = 'user:55555555-5555-5555-5555-555555555555';
  if n <> 1 then raise exception 'expected one completion audit row, saw %', n; end if;
  select count(*) into n from public.audit_log where action in ('account.deletion_requested', 'account.deletion_cancelled');
  if n < 5 then raise exception 'request and cancel were not audited, % rows', n; end if;
end $$;

-- A completed account cannot ask again, and the job is idempotent: A comes
-- back until the auth user is marked removed, but nothing is deleted twice.
select test_as('55555555-5555-5555-5555-555555555555');
do $$ begin
  begin
    perform public.request_account_deletion();
    raise exception 'a completed account asked again';
  exception when check_violation then null; end;
end $$;
reset role;
select pg_temp.as_service();
do $$ declare n int; begin
  select count(*) into n from public.complete_due_deletions();
  if n <> 1 then raise exception 'unremoved auth user should be returned again, saw %', n; end if;
  if not public.mark_auth_removed('55555555-5555-5555-5555-555555555555') then raise exception 'mark_auth_removed found nothing'; end if;
  select count(*) into n from public.complete_due_deletions();
  if n <> 0 then raise exception 'job returned % users after auth removal', n; end if;
end $$;

-- The server job then deletes the auth user. The purchase stays, unlinked;
-- the request row stays as the record of what was done.
reset role;
delete from auth.users where id = '55555555-5555-5555-5555-555555555555';
do $$ declare n int; begin
  select count(*) into n from public.purchases where id = 'abababab-0000-0000-0000-0000000000f1' and user_id is null and status = 'paid';
  if n <> 1 then raise exception 'purchase did not survive the auth user removal'; end if;
  select count(*) into n from public.account_deletion_requests where user_id = '55555555-5555-5555-5555-555555555555' and completed_at is not null;
  if n <> 1 then raise exception 'deletion record did not survive'; end if;
end $$;

rollback;
\echo PASS 0007_account_rights
