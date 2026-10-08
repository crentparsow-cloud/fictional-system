-- Support operations (0027): the lookup actions (restore access, cancel a
-- deletion, resend context), the workbook comment thread, and the rate
-- limit counters. Each block must raise or return the expected value; a
-- failure aborts the script and the CI step.
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('a2700000-0000-0000-0000-000000000001', 'owner27@test'),
  ('a2700000-0000-0000-0000-000000000002', 'support27@test'),
  ('a2700000-0000-0000-0000-000000000003', 'editor27@test'),
  ('a2700000-0000-0000-0000-000000000004', 'finance27@test'),
  ('a2700000-0000-0000-0000-000000000005', 'reader27@test.example'),
  ('a2700000-0000-0000-0000-000000000006', 'orgowner27@test'),
  ('a2700000-0000-0000-0000-000000000007', 'orgviewer27@test'),
  ('a2700000-0000-0000-0000-000000000008', 'outsider27@test'),
  ('a2700000-0000-0000-0000-000000000009', 'safety27@test'),
  ('a2700000-0000-0000-0000-00000000000a', 'orgauthor27@test');
insert into public.platform_roles (user_id, role) values
  ('a2700000-0000-0000-0000-000000000001', 'owner'),
  ('a2700000-0000-0000-0000-000000000002', 'support'),
  ('a2700000-0000-0000-0000-000000000003', 'editor'),
  ('a2700000-0000-0000-0000-000000000004', 'finance'),
  ('a2700000-0000-0000-0000-000000000009', 'safety_reviewer');
update public.profiles set display_name = 'Rae Reader' where user_id = 'a2700000-0000-0000-0000-000000000005';
update public.profiles set display_name = 'Ola Owner' where user_id = 'a2700000-0000-0000-0000-000000000006';
update public.profiles set display_name = 'Ed Editor' where user_id = 'a2700000-0000-0000-0000-000000000003';

insert into public.organisations (id, code, kind, legal_name, display_name, slug, country, connect_status) values
  ('a2700000-0000-0000-0000-0000000000a1', 'PB-TST27', 'publisher', 'Org 27 Ltd', 'Org 27', 'org-27', 'GB', 'verified'),
  ('a2700000-0000-0000-0000-0000000000a2', 'PB-TSW27', 'publisher', 'Other 27 Ltd', 'Other 27', 'other-27', 'GB', 'verified');
insert into public.org_members (org_id, user_id, role) values
  ('a2700000-0000-0000-0000-0000000000a1', 'a2700000-0000-0000-0000-000000000006', 'owner'),
  ('a2700000-0000-0000-0000-0000000000a1', 'a2700000-0000-0000-0000-000000000007', 'viewer'),
  ('a2700000-0000-0000-0000-0000000000a1', 'a2700000-0000-0000-0000-00000000000a', 'author'),
  ('a2700000-0000-0000-0000-0000000000a2', 'a2700000-0000-0000-0000-000000000008', 'owner');
insert into public.books (id, org_id, slug, title, rights_status) values
  ('a2700000-0000-0000-0000-0000000000b1', 'a2700000-0000-0000-0000-0000000000a1', 'book-27a', 'Book 27A', 'public_domain'),
  ('a2700000-0000-0000-0000-0000000000b2', 'a2700000-0000-0000-0000-0000000000a1', 'book-27b', 'Book 27B', 'public_domain');
insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, safety_tier, depth, status) values
  ('a2700000-0000-0000-0000-0000000000c1', 'AK-T27A0', 'a2700000-0000-0000-0000-0000000000b1', 'a2700000-0000-0000-0000-0000000000a1',
   'wb-27a', 'Workbook 27A', 'Card', 'productivity', 'none', 'full', 'live'),
  ('a2700000-0000-0000-0000-0000000000c2', 'AK-T27B0', 'a2700000-0000-0000-0000-0000000000b2', 'a2700000-0000-0000-0000-0000000000a1',
   'wb-27b', 'Workbook 27B', 'Card', 'productivity', 'none', 'full', 'draft');
insert into public.workbook_versions (id, workbook_id, semver, content, content_hash) values
  ('a2700000-0000-0000-0000-0000000000d1', 'a2700000-0000-0000-0000-0000000000c1', '1.0.0', '{}'::jsonb, repeat('b', 64));
insert into public.review_assignments (version_id, assignee) values
  ('a2700000-0000-0000-0000-0000000000d1', 'a2700000-0000-0000-0000-000000000003');

-- The reader: a refunded purchase of 27A with its revoked entitlement, a
-- membership row, an active subscription with a paid invoice, a pending
-- deletion request.
insert into public.purchases (id, user_id, tenant_id, workbook_id, kind, stripe_checkout_session_id, currency, amount_minor, status, paid_at, refunded_at) values
  ('a2700000-0000-0000-0000-000000000901', 'a2700000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000a',
   'a2700000-0000-0000-0000-0000000000c1', 'workbook', 'cs_test_27a', 'GBP', 999, 'refunded', now() - interval '3 days', now() - interval '1 day');
insert into public.purchases (id, user_id, tenant_id, workbook_id, kind, stripe_checkout_session_id, currency, amount_minor, status, paid_at) values
  ('a2700000-0000-0000-0000-000000000902', 'a2700000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000a',
   'a2700000-0000-0000-0000-0000000000c1', 'workbook', 'cs_test_27b', 'GBP', 1299, 'paid', now() - interval '2 days');
insert into public.entitlements (id, user_id, tenant_id, workbook_id, source, status, purchase_id) values
  ('a2700000-0000-0000-0000-000000000911', 'a2700000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000a',
   'a2700000-0000-0000-0000-0000000000c1', 'purchase', 'revoked', 'a2700000-0000-0000-0000-000000000901');
insert into public.entitlements (id, user_id, tenant_id, workbook_id, source, status) values
  ('a2700000-0000-0000-0000-000000000912', 'a2700000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000a',
   null, 'membership', 'lapsed');
insert into public.subscriptions (id, user_id, tenant_id, stripe_customer_id, stripe_subscription_id, plan, status, current_period_end, observed_at) values
  ('a2700000-0000-0000-0000-000000000921', 'a2700000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000a',
   'cus_test27', 'sub_test27', 'member_month', 'active', now() + interval '20 days', now());
insert into public.subscription_invoices (user_id, tenant_id, stripe_invoice_id, stripe_subscription_id, status, currency, amount_minor, paid_at) values
  ('a2700000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000a', 'in_test27', 'sub_test27', 'paid', 'GBP', 799, now() - interval '10 days');
insert into public.account_deletion_requests (user_id, requested_at) values
  ('a2700000-0000-0000-0000-000000000005', now() - interval '1 day');

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

-- ---------------------------------------------------------------------------
-- 1. The lookup returns entitlement ids and the deletion's cancel state.
-- ---------------------------------------------------------------------------
select test_as('a2700000-0000-0000-0000-000000000002', array['support']);
do $$ declare j jsonb; begin
  j := public.staff_lookup_account('reader27@test.example', 'Ticket 27-1');
  if not (j -> 'entitlements' @> '[{"id": "a2700000-0000-0000-0000-000000000911", "status": "revoked"}]'::jsonb) then
    raise exception 'lookup should list the entitlement id: %', j -> 'entitlements';
  end if;
  if (j -> 'deletion' ->> 'can_cancel')::boolean is not true then raise exception 'the deletion should be cancellable'; end if;
  if j::text ~ 'Workbook 27A' then raise exception 'the lookup named a title'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 2. Restore access: roles, reason, rules.
-- ---------------------------------------------------------------------------
-- Editors and finance cannot restore.
select test_as('a2700000-0000-0000-0000-000000000003', array['editor']);
do $$ begin
  begin
    perform public.staff_restore_access('a2700000-0000-0000-0000-000000000005', 'a2700000-0000-0000-0000-000000000911', null, null, 'Ticket 27-2');
    raise exception 'an editor restored access';
  exception when sqlstate 'AKX01' then null; end;
end $$;
reset role;
select test_as('a2700000-0000-0000-0000-000000000004', array['finance']);
do $$ begin
  begin
    perform public.staff_restore_access('a2700000-0000-0000-0000-000000000005', 'a2700000-0000-0000-0000-000000000911', null, null, 'Ticket 27-2');
    raise exception 'finance restored access';
  exception when sqlstate 'AKX01' then null; end;
end $$;
reset role;

select test_as('a2700000-0000-0000-0000-000000000002', array['support']);
do $$ declare v uuid; r record; begin
  -- a reason is required
  begin
    perform public.staff_restore_access('a2700000-0000-0000-0000-000000000005', 'a2700000-0000-0000-0000-000000000911', null, null, 'no');
    raise exception 'a short reason was accepted';
  exception when sqlstate 'AKX02' then null; end;
  -- one of an access row or a code, not both
  begin
    perform public.staff_restore_access('a2700000-0000-0000-0000-000000000005', 'a2700000-0000-0000-0000-000000000911', 'AK-T27A0', null, 'Ticket 27-2');
    raise exception 'both an access row and a code were accepted';
  exception when sqlstate 'AKX02' then null; end;
  -- a membership row follows its own record
  begin
    perform public.staff_restore_access('a2700000-0000-0000-0000-000000000005', 'a2700000-0000-0000-0000-000000000912', null, null, 'Ticket 27-2');
    raise exception 'a membership row was restored';
  exception when sqlstate 'AKX08' then null; end;
  -- another reader's row is not found
  begin
    perform public.staff_restore_access('a2700000-0000-0000-0000-000000000008', 'a2700000-0000-0000-0000-000000000911', null, null, 'Ticket 27-2');
    raise exception 'a row was restored for the wrong reader';
  exception when sqlstate 'AKX04' then null; end;
  -- the revoked purchase row comes back, lifetime
  v := public.staff_restore_access('a2700000-0000-0000-0000-000000000005', 'a2700000-0000-0000-0000-000000000911', null, null, 'Ticket 27-2 goodwill');
  select * into r from public.entitlements where id = v;
  if r.status <> 'active' or r.ends_at is not null then raise exception 'restore did not reactivate: % %', r.status, r.ends_at; end if;
  -- the second time it is already active
  begin
    perform public.staff_restore_access('a2700000-0000-0000-0000-000000000005', 'a2700000-0000-0000-0000-000000000911', null, null, 'Ticket 27-2');
    raise exception 'an active row was restored again';
  exception when sqlstate 'AKX08' then null; end;
  -- a gift for a draft title is refused, for a live one it is granted
  begin
    perform public.staff_restore_access('a2700000-0000-0000-0000-000000000005', null, 'AK-T27B0', null, 'Ticket 27-3');
    raise exception 'a draft title was given';
  exception when sqlstate 'AKX08' then null; end;
  begin
    perform public.staff_restore_access('a2700000-0000-0000-0000-000000000005', null, 'AK-T27A0', now() - interval '1 day', 'Ticket 27-3');
    raise exception 'a gift ending in the past was accepted';
  exception when sqlstate 'AKX02' then null; end;
  v := public.staff_restore_access('a2700000-0000-0000-0000-000000000005', null, 'ak-t27a0', now() + interval '30 days', 'Ticket 27-3 charged no access');
  select * into r from public.entitlements where id = v;
  if r.source <> 'gift' or r.status <> 'active' or r.ends_at is null then raise exception 'gift wrong: % % %', r.source, r.status, r.ends_at; end if;
end $$;
reset role;

-- the audit rows carry the reason and no title (read as the table owner)
do $$ begin
  if (select count(*) from public.audit_log where action = 'account.access_restored'
        and target = 'user:a2700000-0000-0000-0000-000000000005') <> 2 then
    raise exception 'expected two access_restored audit rows';
  end if;
  if exists (select 1 from public.audit_log where action = 'account.access_restored' and (after::text ~ 'Workbook 27A' or reason is null)) then
    raise exception 'an audit row named a title or had no reason';
  end if;
  if not exists (select 1 from public.audit_log where action = 'account.access_restored' and (after ->> 'purchase_refunded')::boolean) then
    raise exception 'restoring a refunded purchase should be flagged in the audit row';
  end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. Resend context: lookup roles, the reader's own rows, five a day.
-- ---------------------------------------------------------------------------
select test_as('a2700000-0000-0000-0000-000000000004', array['finance']);
do $$ begin
  begin
    perform public.staff_resend_context('a2700000-0000-0000-0000-000000000005', 'purchase', 'a2700000-0000-0000-0000-000000000902', 'Ticket 27-4');
    raise exception 'finance resent an email';
  exception when sqlstate 'AKX01' then null; end;
end $$;
reset role;
select test_as('a2700000-0000-0000-0000-000000000003', array['editor']);
do $$ declare j jsonb; begin
  j := public.staff_resend_context('a2700000-0000-0000-0000-000000000005', 'purchase', 'a2700000-0000-0000-0000-000000000902', 'Ticket 27-4');
  if j ->> 'email' <> 'reader27@test.example' or (j ->> 'amount_minor')::int <> 1299 or j ->> 'currency' <> 'GBP' then
    raise exception 'purchase context wrong: %', j;
  end if;
  if j::text ~ 'Workbook 27A' then raise exception 'the resend context named a title'; end if;
  -- a refunded purchase has no purchase email to resend
  begin
    perform public.staff_resend_context('a2700000-0000-0000-0000-000000000005', 'purchase', 'a2700000-0000-0000-0000-000000000901', 'Ticket 27-4');
    raise exception 'a refunded purchase was resent';
  exception when sqlstate 'AKX08' then null; end;
  -- someone else's subscription is not found
  begin
    perform public.staff_resend_context('a2700000-0000-0000-0000-000000000008', 'membership', 'sub_test27', 'Ticket 27-4');
    raise exception 'another reader''s membership was resent';
  exception when sqlstate 'AKX04' then null; end;
  j := public.staff_resend_context('a2700000-0000-0000-0000-000000000005', 'membership', 'sub_test27', 'Ticket 27-5');
  if j ->> 'plan' <> 'member_month' or (j ->> 'amount_minor')::int <> 799 or j ->> 'current_period_end' is null then
    raise exception 'membership context wrong: %', j;
  end if;
  perform public.staff_resend_context('a2700000-0000-0000-0000-000000000005', 'membership', 'sub_test27', 'Ticket 27-5');
  perform public.staff_resend_context('a2700000-0000-0000-0000-000000000005', 'membership', 'sub_test27', 'Ticket 27-5');
  perform public.staff_resend_context('a2700000-0000-0000-0000-000000000005', 'membership', 'sub_test27', 'Ticket 27-5');
  begin
    perform public.staff_resend_context('a2700000-0000-0000-0000-000000000005', 'membership', 'sub_test27', 'Ticket 27-5');
    raise exception 'a sixth resend in a day was allowed';
  exception when sqlstate 'AKX29' then null; end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. Cancel a deletion on the reader's behalf.
-- ---------------------------------------------------------------------------
select test_as('a2700000-0000-0000-0000-000000000003', array['editor']);
do $$ begin
  begin
    perform public.staff_cancel_deletion('a2700000-0000-0000-0000-000000000005', 'Ticket 27-6');
    raise exception 'an editor cancelled a deletion';
  exception when sqlstate 'AKX01' then null; end;
end $$;
reset role;
select test_as('a2700000-0000-0000-0000-000000000001', array['owner']);
do $$ declare j jsonb; begin
  j := public.staff_cancel_deletion('a2700000-0000-0000-0000-000000000005', 'Ticket 27-6 reader asked by phone');
  if j ->> 'email' <> 'reader27@test.example' or j ->> 'name' <> 'Rae Reader' then raise exception 'cancel returned %', j; end if;
  if not exists (select 1 from public.account_deletion_requests where user_id = 'a2700000-0000-0000-0000-000000000005' and cancelled_at is not null) then
    raise exception 'the deletion was not cancelled';
  end if;
  begin
    perform public.staff_cancel_deletion('a2700000-0000-0000-0000-000000000005', 'Ticket 27-6');
    raise exception 'a cancelled deletion was cancelled again';
  exception when sqlstate 'AKX08' then null; end;
  if not exists (select 1 from public.audit_log where action = 'account.deletion_cancelled_by_staff'
                  and reason = 'Ticket 27-6 reader asked by phone' and actor = 'a2700000-0000-0000-0000-000000000001') then
    raise exception 'the cancel was not audited';
  end if;
  -- the lookup now lists the staff actions taken on the account
  j := public.staff_lookup_account('reader27@test.example', 'Ticket 27-7');
  if jsonb_array_length(j -> 'actions') < 3 then raise exception 'lookup should list staff actions: %', j -> 'actions'; end if;
end $$;
reset role;

-- Readers cannot call the staff actions at all.
select test_as('a2700000-0000-0000-0000-000000000005');
do $$ begin
  begin
    perform public.staff_cancel_deletion('a2700000-0000-0000-0000-000000000005', 'Ticket 27-8');
    raise exception 'a reader called a staff action';
  exception when sqlstate 'AKX01' then null; end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 5. Comments: who posts, who reads, notify, append-only, recipients.
-- ---------------------------------------------------------------------------
create temp table c27 (k text primary key, id uuid, notify boolean);
grant all on c27 to authenticated, service_role, anon;

select test_as('a2700000-0000-0000-0000-000000000006');
do $$ declare r record; begin
  select * into r from public.workbook_comment_post('a2700000-0000-0000-0000-0000000000c1', E'  Could the card line be shorter?\nThanks.  ');
  if r.side <> 'org' or not r.notify then raise exception 'first org comment should notify: % %', r.side, r.notify; end if;
  insert into c27 values ('org1', r.comment_id, r.notify);
  select * into r from public.workbook_comment_post('a2700000-0000-0000-0000-0000000000c1', 'One more thing.');
  if r.notify then raise exception 'a second org comment within 10 minutes should not notify'; end if;
  begin
    perform public.workbook_comment_post('a2700000-0000-0000-0000-0000000000c1', '   ');
    raise exception 'an empty comment was accepted';
  exception when sqlstate 'AKX02' then null; end;
  begin
    perform public.workbook_comment_post('a2700000-0000-0000-0000-0000000000c1', repeat('x', 2001));
    raise exception 'a long comment was accepted';
  exception when sqlstate 'AKX02' then null; end;
  if (select body from public.workbook_comments where id = (select id from c27 where k = 'org1')) <> E'Could the card line be shorter?\nThanks.' then
    raise exception 'the body was not trimmed';
  end if;
  -- append-only for the author too
  begin
    update public.workbook_comments set body = 'changed' where id = (select id from c27 where k = 'org1');
    raise exception 'a comment was edited';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- A viewer reads but cannot post. An outsider neither reads nor posts.
select test_as('a2700000-0000-0000-0000-000000000007');
do $$ begin
  if (select count(*) from public.workbook_comments where workbook_id = 'a2700000-0000-0000-0000-0000000000c1') <> 2 then
    raise exception 'a viewer should read the thread';
  end if;
  begin
    perform public.workbook_comment_post('a2700000-0000-0000-0000-0000000000c1', 'Hello');
    raise exception 'a viewer posted';
  exception when sqlstate 'AKX01' then null; end;
end $$;
reset role;
select test_as('a2700000-0000-0000-0000-000000000008');
do $$ begin
  if exists (select 1 from public.workbook_comments) then raise exception 'an outsider read comments'; end if;
  begin
    perform public.workbook_comment_post('a2700000-0000-0000-0000-0000000000c1', 'Hello');
    raise exception 'an outsider posted';
  exception when sqlstate 'AKX04' then null; end;
end $$;
reset role;
-- Support staff are not reviewers: no thread.
select test_as('a2700000-0000-0000-0000-000000000002', array['support']);
do $$ begin
  if exists (select 1 from public.workbook_comments) then raise exception 'support read comments'; end if;
end $$;
reset role;

-- A reviewer posts for Akana.
select test_as('a2700000-0000-0000-0000-000000000009', array['safety_reviewer']);
do $$ declare r record; begin
  if (select count(*) from public.workbook_comments) <> 2 then raise exception 'a reviewer should read the thread'; end if;
  select * into r from public.workbook_comment_post('a2700000-0000-0000-0000-0000000000c1', 'Yes, we can shorten it.');
  if r.side <> 'staff' or not r.notify then raise exception 'first staff comment should notify'; end if;
  insert into c27 values ('staff1', r.comment_id, r.notify);
end $$;
reset role;

-- Audit rows carry no comment text.
do $$ begin
  if (select count(*) from public.audit_log where action = 'workbook.comment' and target = 'workbook:a2700000-0000-0000-0000-0000000000c1') <> 3 then
    raise exception 'expected three comment audit rows';
  end if;
  if exists (select 1 from public.audit_log where action = 'workbook.comment' and (coalesce(after::text, '') ~ 'shorten' or coalesce(reason, '') ~ 'shorten')) then
    raise exception 'an audit row carried comment text';
  end if;
end $$;

-- Recipients: service role only. Staff comment -> org owner and author, not
-- the viewer. Org comment -> the assigned editor and the reviewer who posted,
-- not the commenter.
select test_as('a2700000-0000-0000-0000-000000000009', array['safety_reviewer']);
do $$ begin
  begin
    perform public.workbook_comment_recipients((select id from c27 where k = 'staff1'));
    raise exception 'a reviewer read the recipients';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select pg_temp.as_service();
do $$ declare n int; begin
  select count(*) into n from public.workbook_comment_recipients((select id from c27 where k = 'staff1'))
   where audience = 'org' and email in ('orgowner27@test', 'orgauthor27@test');
  if n <> 2 then raise exception 'staff comment should reach the org owner and author, got %', n; end if;
  if exists (select 1 from public.workbook_comment_recipients((select id from c27 where k = 'staff1')) where email = 'orgviewer27@test') then
    raise exception 'a viewer was emailed';
  end if;
  select count(*) into n from public.workbook_comment_recipients((select id from c27 where k = 'org1'))
   where audience = 'staff' and email in ('editor27@test', 'safety27@test');
  if n <> 2 then raise exception 'org comment should reach the assigned editor and the posting reviewer, got %', n; end if;
  if exists (select 1 from public.workbook_comment_recipients((select id from c27 where k = 'org1')) where workbook_title is not null) then
    raise exception 'a staff recipient row carried the title';
  end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 6. Rate limits.
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
do $$ declare i int; ok boolean; begin
  for i in 1..5 loop
    if not public.rate_limit_hit('signin_email', repeat('a', 64)) then raise exception 'hit % should be allowed', i; end if;
  end loop;
  if public.rate_limit_hit('signin_email', repeat('a', 64)) then raise exception 'the sixth sign-in should be refused'; end if;
  -- a blocked hit is not counted
  if (select count(*) from public.rate_hits where bucket = 'signin_email' and key_hash = repeat('a', 64)) <> 5 then
    raise exception 'a refused hit was counted';
  end if;
  -- another key is separate
  if not public.rate_limit_hit('signin_email', repeat('b', 64)) then raise exception 'a fresh key was refused'; end if;
  begin
    perform public.rate_limit_hit('nope', repeat('a', 64));
    raise exception 'an unknown bucket was accepted';
  exception when sqlstate 'AKX02' then null; end;
  begin
    perform public.rate_limit_hit('signin_ip', 'not-a-hash');
    raise exception 'a bad key was accepted';
  exception when sqlstate 'AKX02' then null; end;
end $$;
reset role;

-- Readers count against themselves, only for self-service buckets.
select test_as('a2700000-0000-0000-0000-000000000005');
do $$ declare i int; begin
  for i in 1..10 loop
    if not public.rate_limit_self('checkout_user') then raise exception 'checkout % should be allowed', i; end if;
  end loop;
  if public.rate_limit_self('checkout_user') then raise exception 'the eleventh checkout should be refused'; end if;
  if not public.rate_limit_self('export_user') then raise exception 'export has its own count'; end if;
  begin
    perform public.rate_limit_self('signin_email');
    raise exception 'a reader counted a server bucket';
  exception when sqlstate 'AKX02' then null; end;
  begin
    perform public.rate_limit_hit('signin_email', repeat('c', 64));
    raise exception 'a reader called the keyed limiter';
  exception when insufficient_privilege then null; end;
  begin
    perform count(*) from public.rate_hits;
    raise exception 'a reader read the rate table';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select test_as('a2700000-0000-0000-0000-000000000006');
do $$ begin
  if not public.rate_limit_self('checkout_user') then raise exception 'another reader has their own count'; end if;
end $$;
reset role;

select pg_temp.as_anon();
do $$ begin
  begin
    perform public.rate_limit_self('checkout_user');
    raise exception 'anon counted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

update public.rate_hits set at = now() - interval '2 days' where key_hash = repeat('a', 64);
select pg_temp.as_service();
do $$ begin
  if public.prune_rate_hits() < 5 then raise exception 'prune should remove old hits'; end if;
  if not public.rate_limit_hit('signin_email', repeat('a', 64)) then raise exception 'after the window the key is free again'; end if;
end $$;
reset role;

rollback;
\echo PASS 0027_support_ops
