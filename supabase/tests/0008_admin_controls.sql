-- Admin controls (0008): tenant column grants, the audited kill switch,
-- staff-created organisations, the free toolkit and the tenant lookup. Each
-- block must raise or return the expected count; a failure aborts the script
-- and the CI step.
\set ON_ERROR_STOP on

begin;

-- An editor, an owner, a support member of staff and a reader with no role.
insert into auth.users (id, email) values
  ('a8000000-0000-0000-0000-000000000001', 'editor@test'),
  ('a8000000-0000-0000-0000-000000000002', 'owner@test'),
  ('a8000000-0000-0000-0000-000000000003', 'support@test'),
  ('a8000000-0000-0000-0000-000000000004', 'reader@test');

insert into public.organisations (id, code, kind, legal_name, display_name, slug, country) values
  ('a8000000-0000-0000-0000-0000000000a1', 'PB-TESTH', 'publisher', 'Org H Ltd', 'Org H', 'org-h', 'GB');
insert into public.tenants (id, slug, kind, org_id, name, stripe_account_id, plan) values
  ('a8000000-0000-0000-0000-0000000000b1', 'org-h', 'white_label', 'a8000000-0000-0000-0000-0000000000a1', 'Org H Books', 'acct_secret_h', 'pro'),
  ('a8000000-0000-0000-0000-0000000000b2', 'org-h-closed', 'white_label', 'a8000000-0000-0000-0000-0000000000a1', 'Org H Closed', null, 'demo');
update public.tenants set status = 'closed' where id = 'a8000000-0000-0000-0000-0000000000b2';
insert into public.tenant_domains (host, tenant_id, verified_at) values
  ('books.org-h.example', 'a8000000-0000-0000-0000-0000000000b1', now()),
  ('pending.org-h.example', 'a8000000-0000-0000-0000-0000000000b1', null),
  ('closed.org-h.example', 'a8000000-0000-0000-0000-0000000000b2', now());

insert into public.books (id, org_id, slug, title) values
  ('a8000000-0000-0000-0000-0000000000c1', 'a8000000-0000-0000-0000-0000000000a1', 'book-h', 'Book H');
insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, depth, status) values
  ('a8000000-0000-0000-0000-0000000000d1', 'AK-TESTH', 'a8000000-0000-0000-0000-0000000000c1', 'a8000000-0000-0000-0000-0000000000a1',
   'workbook-h', 'Workbook H', 'Card', 'productivity', 'full', 'live'),
  ('a8000000-0000-0000-0000-0000000000d2', 'AK-TESTJ', 'a8000000-0000-0000-0000-0000000000c1', 'a8000000-0000-0000-0000-0000000000a1',
   'workbook-j', 'Workbook J', 'Card', 'productivity', 'full', 'draft'),
  ('a8000000-0000-0000-0000-0000000000d3', 'AK-TESTK', 'a8000000-0000-0000-0000-0000000000c1', 'a8000000-0000-0000-0000-0000000000a1',
   'workbook-k', 'Workbook K', 'Card', 'productivity', 'full', 'live');
insert into public.workbook_versions (id, workbook_id, semver, content, content_hash) values
  ('a8000000-0000-0000-0000-0000000000e3', 'a8000000-0000-0000-0000-0000000000d3', '1.0.0',
   '{"schema_version": "3.0", "title": "Workbook K", "structure": {"unit": "week", "count": 2, "free_units": 1},
     "units": [{"number": 1, "stage": "a", "focus": "One", "exercise_ids": []}, {"number": 2, "stage": "a", "focus": "Two", "exercise_ids": []}],
     "exercises": [], "toolkit": [{"id": "tk_one", "title": "Card"}], "finish": {"summary": "s", "book_bridge": "b"}}'::jsonb,
   repeat('f', 64));

create or replace function pg_temp.as_anon() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "anon"}'::text, true);
  execute 'set local role anon';
end $$;

-- ---------------------------------------------------------------------------
-- 1. Tenants: anon and authenticated read the safe columns, never
-- stripe_account_id or plan, and select * is refused.
-- ---------------------------------------------------------------------------
select pg_temp.as_anon();
do $$ declare n int; r record; begin
  select count(*) into n from public.tenants where slug = 'org-h';
  if n <> 1 then raise exception 'anon should read the tenant row by safe columns, saw %', n; end if;
  select id, slug, kind, org_id, name, brand, default_locale, default_currency, seller_of_record, status, is_demo, created_at, updated_at
    into r from public.tenants where slug = 'org-h';
  if r.name <> 'Org H Books' then raise exception 'anon read the wrong tenant name'; end if;
  begin
    perform stripe_account_id from public.tenants;
    raise exception 'anon read stripe_account_id';
  exception when insufficient_privilege then null; end;
  begin
    perform plan from public.tenants;
    raise exception 'anon read plan';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.tenants;
    raise exception 'anon ran select * on tenants';
  exception when insufficient_privilege then null; end;
  begin
    perform host from public.tenant_domains;
    raise exception 'anon listed tenant domains';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select test_as('a8000000-0000-0000-0000-000000000004');
do $$ begin
  perform id, slug, kind, status from public.tenants;
  begin
    perform stripe_account_id from public.tenants;
    raise exception 'a signed-in reader read stripe_account_id';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 2. resolve_tenant: exact verified host only, case-insensitive, safe fields.
-- ---------------------------------------------------------------------------
select pg_temp.as_anon();
do $$ declare n int; r record; begin
  select * into r from public.resolve_tenant('BOOKS.Org-H.example');
  if r.tenant_id is distinct from 'a8000000-0000-0000-0000-0000000000b1'::uuid or r.slug <> 'org-h'
     or r.kind <> 'white_label' or r.status <> 'active' then
    raise exception 'resolve_tenant returned the wrong row: %', r; end if;
  select count(*) into n from public.resolve_tenant('pending.org-h.example');
  if n <> 0 then raise exception 'an unverified domain resolved'; end if;
  select count(*) into n from public.resolve_tenant('nobody.example');
  if n <> 0 then raise exception 'an unknown host resolved'; end if;
  select count(*) into n from public.resolve_tenant('org-h.example');
  if n <> 0 then raise exception 'a suffix matched'; end if;
  select count(*) into n from public.resolve_tenant(null);
  if n <> 0 then raise exception 'a null host resolved'; end if;
  select status into r from public.resolve_tenant('closed.org-h.example');
  if r.status <> 'closed' then raise exception 'a closed tenant should come back with its status'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. Kill switch: an editor pauses and resumes, with an audit row each time.
-- ---------------------------------------------------------------------------
select test_as('a8000000-0000-0000-0000-000000000001', array['editor']);
do $$ declare s text; n int; begin
  s := public.set_workbook_paused('a8000000-0000-0000-0000-0000000000d1', true, '  Complaint about chapter 3  ');
  if s <> 'paused' then raise exception 'pause returned %', s; end if;
  begin
    perform public.set_workbook_paused('a8000000-0000-0000-0000-0000000000d1', true, 'again');
    raise exception 'a paused workbook was paused again';
  exception when object_not_in_prerequisite_state then null; end;
  begin
    perform public.set_workbook_paused('a8000000-0000-0000-0000-0000000000d1', false, '   ');
    raise exception 'resumed without a reason';
  exception when check_violation then null; end;
  begin
    perform public.set_workbook_paused('a8000000-0000-0000-0000-0000000000d1', false, repeat('x', 501));
    raise exception 'resumed with an over-long reason';
  exception when check_violation then null; end;
  s := public.set_workbook_paused('a8000000-0000-0000-0000-0000000000d1', false, 'Fixed and checked');
  if s <> 'live' then raise exception 'resume returned %', s; end if;
  begin
    perform public.set_workbook_paused('a8000000-0000-0000-0000-0000000000d1', false, 'again');
    raise exception 'a live workbook was resumed';
  exception when object_not_in_prerequisite_state then null; end;
  begin
    perform public.set_workbook_paused('a8000000-0000-0000-0000-0000000000d2', true, 'draft');
    raise exception 'a draft workbook was paused';
  exception when object_not_in_prerequisite_state then null; end;
  begin
    perform public.set_workbook_paused('a8000000-0000-0000-0000-0000000000ff', true, 'missing');
    raise exception 'a missing workbook was paused';
  exception when no_data_found then null; end;
end $$;
reset role;
do $$ declare n int; r public.audit_log; begin
  if (select status from public.workbooks where id = 'a8000000-0000-0000-0000-0000000000d1') <> 'live' then
    raise exception 'workbook H should be live after resume'; end if;
  if (select status from public.workbooks where id = 'a8000000-0000-0000-0000-0000000000d2') <> 'draft' then
    raise exception 'workbook J changed status'; end if;
  select count(*) into n from public.audit_log where target = 'workbook:a8000000-0000-0000-0000-0000000000d1';
  if n <> 2 then raise exception 'expected 2 kill switch audit rows, saw %', n; end if;
  select * into r from public.audit_log where action = 'workbook.paused' and target = 'workbook:a8000000-0000-0000-0000-0000000000d1';
  if r.reason <> 'Complaint about chapter 3' or r.actor <> 'a8000000-0000-0000-0000-000000000001'
     or r.before->>'status' <> 'live' or r.after->>'status' <> 'paused' or r.after->>'code' <> 'AK-TESTH'
     or r.org_id <> 'a8000000-0000-0000-0000-0000000000a1' or r.actor_role <> 'editor' then
    raise exception 'pause audit row is wrong: %', row_to_json(r); end if;
  select * into r from public.audit_log where action = 'workbook.resumed' and target = 'workbook:a8000000-0000-0000-0000-0000000000d1';
  if r.reason <> 'Fixed and checked' or r.before->>'status' <> 'paused' or r.after->>'status' <> 'live' then
    raise exception 'resume audit row is wrong: %', row_to_json(r); end if;
end $$;

-- An owner may pause too.
select test_as('a8000000-0000-0000-0000-000000000002', array['owner']);
do $$ begin
  if public.set_workbook_paused('a8000000-0000-0000-0000-0000000000d1', true, 'Owner pause') <> 'paused' then
    raise exception 'owner could not pause'; end if;
  if public.set_workbook_paused('a8000000-0000-0000-0000-0000000000d1', false, 'Owner resume') <> 'live' then
    raise exception 'owner could not resume'; end if;
end $$;
reset role;

-- Support staff and readers cannot pause or resume, and nothing is audited.
select test_as('a8000000-0000-0000-0000-000000000003', array['support']);
do $$ begin
  begin
    perform public.set_workbook_paused('a8000000-0000-0000-0000-0000000000d1', true, 'support tries');
    raise exception 'support paused a workbook';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select test_as('a8000000-0000-0000-0000-000000000004');
do $$ begin
  begin
    perform public.set_workbook_paused('a8000000-0000-0000-0000-0000000000d1', true, 'reader tries');
    raise exception 'a reader paused a workbook';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select pg_temp.as_anon();
do $$ begin
  begin
    perform public.set_workbook_paused('a8000000-0000-0000-0000-0000000000d1', true, 'anon tries');
    raise exception 'anon paused a workbook';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ declare n int; begin
  if (select status from public.workbooks where id = 'a8000000-0000-0000-0000-0000000000d1') <> 'live' then
    raise exception 'a refused call changed the status'; end if;
  select count(*) into n from public.audit_log where target = 'workbook:a8000000-0000-0000-0000-0000000000d1';
  if n <> 4 then raise exception 'expected 4 audit rows after the owner pair, saw %', n; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Organisations: codes match packages/schema mintCode(), staff owners and
-- editors create, akana_house is refused, and each creation is audited.
-- ---------------------------------------------------------------------------
do $$ begin
  -- Reference values from mintCode() in packages/schema/src/codes.ts.
  if app.mint_code('PB', 'organisation:abc', 0) <> 'PB-BGZ82' then raise exception 'mint_code PB differs from mintCode'; end if;
  if app.mint_code('AU', 'focus', 0) <> 'AU-6JXZ0' then raise exception 'mint_code AU differs from mintCode'; end if;
  if app.mint_code('AK', 'focus', 3) <> 'AK-181J2' then raise exception 'mint_code with n differs from mintCode'; end if;
end $$;

select test_as('a8000000-0000-0000-0000-000000000001', array['editor']);
create temp table created_orgs (id uuid, code text, slug text) on commit drop;
grant all on created_orgs to authenticated;
do $$ declare r record; begin
  select * into r from public.create_organisation('publisher', ' Kestrel Books ', 'Kestrel Books Ltd', 'gb', 'kestrel-books');
  insert into created_orgs values (r.organisation_id, r.organisation_code, r.organisation_slug);
  if r.organisation_code !~ '^PB-[0-9A-HJKMNP-TV-Z]{5}$' then raise exception 'publisher code is %', r.organisation_code; end if;
  select * into r from public.create_organisation('individual', 'Ada Writer', 'Ada Writer', 'IE', 'ada-writer');
  insert into created_orgs values (r.organisation_id, r.organisation_code, r.organisation_slug);
  if r.organisation_code !~ '^AU-' then raise exception 'individual code is %', r.organisation_code; end if;
  select * into r from public.create_organisation('author_company', 'Ada Co', 'Ada Co Ltd', 'IE', 'ada-co');
  if r.organisation_code !~ '^PB-' then raise exception 'author company code is %', r.organisation_code; end if;
  begin
    perform public.create_organisation('akana_house', 'Akana Two', 'Akana Two Ltd', 'GB', 'akana-two');
    raise exception 'a second house organisation was created';
  exception when check_violation then null; end;
  begin
    perform public.create_organisation('publisher', 'Kestrel Again', 'Kestrel Again Ltd', 'GB', 'kestrel-books');
    raise exception 'a duplicate slug was accepted';
  exception when unique_violation then null; end;
  begin
    perform public.create_organisation('publisher', 'No Country', 'No Country Ltd', 'GBR', 'no-country');
    raise exception 'a three-letter country was accepted';
  exception when check_violation then null; end;
  begin
    perform public.create_organisation('publisher', '', 'Blank Ltd', 'GB', 'blank');
    raise exception 'a blank display name was accepted';
  exception when check_violation then null; end;
  -- Direct inserts stay closed: the function is the only path.
  begin
    insert into public.organisations (kind, legal_name, display_name, slug) values ('publisher', 'Direct Ltd', 'Direct', 'direct');
    raise exception 'an editor inserted an organisation directly';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ declare n int; r record; begin
  select o.* into r from public.organisations o join created_orgs c on c.id = o.id where c.slug = 'kestrel-books';
  if r.display_name <> 'Kestrel Books' or r.country <> 'GB' or r.kind <> 'publisher' or r.status <> 'active' then
    raise exception 'publisher row is wrong: %', row_to_json(r); end if;
  if r.code <> app.mint_code('PB', 'organisation:' || r.id::text, 0) then
    raise exception 'publisher code was not minted from its id: %', r.code; end if;
  select count(*) into n from public.audit_log where action = 'organisation.created';
  if n <> 3 then raise exception 'expected 3 organisation audit rows, saw %', n; end if;
  select count(*) into n from public.audit_log a join created_orgs c on a.org_id = c.id
   where a.action = 'organisation.created' and a.after->>'code' = c.code and a.actor = 'a8000000-0000-0000-0000-000000000001';
  if n <> 2 then raise exception 'audit rows do not match the created organisations, %', n; end if;
end $$;

select test_as('a8000000-0000-0000-0000-000000000003', array['support']);
do $$ begin
  begin
    perform public.create_organisation('publisher', 'Support Books', 'Support Books Ltd', 'GB', 'support-books');
    raise exception 'support created an organisation';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select test_as('a8000000-0000-0000-0000-000000000004');
do $$ begin
  begin
    perform public.create_organisation('publisher', 'Reader Books', 'Reader Books Ltd', 'GB', 'reader-books');
    raise exception 'a reader created an organisation';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select pg_temp.as_anon();
do $$ begin
  begin
    perform public.create_organisation('publisher', 'Anon Books', 'Anon Books Ltd', 'GB', 'anon-books');
    raise exception 'anon created an organisation';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 5. The toolkit is free at publish, so a reader with no purchase loads it.
-- ---------------------------------------------------------------------------
select test_as('a8000000-0000-0000-0000-000000000001', array['editor']);
select app.publish_version('a8000000-0000-0000-0000-0000000000e3');
reset role;
do $$ begin
  if not (select free from public.workbook_sections where version_id = 'a8000000-0000-0000-0000-0000000000e3' and kind = 'toolkit') then
    raise exception 'toolkit should be free after publish'; end if;
  if (select free from public.workbook_sections where version_id = 'a8000000-0000-0000-0000-0000000000e3' and kind = 'unit' and unit_number = 2) then
    raise exception 'unit 2 should still be paid'; end if;
  if (select free from public.workbook_sections where version_id = 'a8000000-0000-0000-0000-0000000000e3' and kind = 'finish') then
    raise exception 'finish should still be paid'; end if;
end $$;

select test_as('a8000000-0000-0000-0000-000000000004');
do $$ declare n int; begin
  select count(*) into n from public.workbook_sections where version_id = 'a8000000-0000-0000-0000-0000000000e3' and kind = 'toolkit';
  if n <> 1 then raise exception 'a reader without a purchase should load the toolkit, saw %', n; end if;
  select count(*) into n from public.workbook_sections where version_id = 'a8000000-0000-0000-0000-0000000000e3' and kind in ('finish') or (kind = 'unit' and unit_number = 2 and version_id = 'a8000000-0000-0000-0000-0000000000e3');
  if n <> 0 then raise exception 'a reader without a purchase loaded paid sections, %', n; end if;
end $$;
reset role;
select pg_temp.as_anon();
do $$ declare n int; begin
  select count(*) into n from public.workbook_sections where version_id = 'a8000000-0000-0000-0000-0000000000e3' and kind = 'toolkit';
  if n <> 1 then raise exception 'anon should load the free toolkit, saw %', n; end if;
end $$;
reset role;

rollback;
\echo PASS 0008_admin_controls
