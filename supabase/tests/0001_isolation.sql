-- Cross-organisation isolation (F-131, first cut). Each block must raise or
-- return the expected count; a failure aborts the script and the CI step.
\set ON_ERROR_STOP on

begin;

-- Two organisations, two owners, one reader.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner-a@test'),
  ('22222222-2222-2222-2222-222222222222', 'owner-b@test'),
  ('33333333-3333-3333-3333-333333333333', 'reader@test'),
  ('44444444-4444-4444-4444-444444444444', 'staff@test');

insert into public.organisations (id, kind, legal_name, display_name, slug, country) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'publisher', 'Org A Ltd', 'Org A', 'org-a', 'GB'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'publisher', 'Org B Ltd', 'Org B', 'org-b', 'US');
insert into public.org_members (org_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'owner');
insert into public.tenants (id, slug, kind, org_id, name) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'org-a', 'white_label', 'aaaaaaaa-0000-0000-0000-000000000001', 'Org A Books'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'org-b', 'white_label', 'bbbbbbbb-0000-0000-0000-000000000002', 'Org B Books');
insert into public.tenant_members (tenant_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', '33333333-3333-3333-3333-333333333333', 'reader');

-- Owner A sees only organisation A
savepoint s1;
select test_as('11111111-1111-1111-1111-111111111111');
do $$ declare n int; begin
  select count(*) into n from public.organisations where kind = 'publisher';
  if n <> 1 then raise exception 'owner A should see 1 publisher organisation, saw %', n; end if;
  select count(*) into n from public.org_members;
  if n <> 1 then raise exception 'owner A should see 1 membership row, saw %', n; end if;
end $$;
-- Owner A cannot write organisation B (update touches 0 rows under RLS)
do $$ declare n int; begin
  update public.organisations set display_name = 'pwned' where id = 'bbbbbbbb-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'owner A updated organisation B'; end if;
end $$;
-- Owner A cannot add themselves to organisation B
do $$ begin
  begin
    insert into public.org_members (org_id, user_id, role) values ('bbbbbbbb-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'owner');
    raise exception 'owner A joined organisation B';
  exception when insufficient_privilege or check_violation then null; end;
end $$;
rollback to savepoint s1;

-- Reader sees their own tenant membership only, never tenant B's roster
savepoint s2;
select test_as('33333333-3333-3333-3333-333333333333');
do $$ declare n int; begin
  select count(*) into n from public.tenant_members;
  if n <> 1 then raise exception 'reader should see 1 tenant membership, saw %', n; end if;
  select count(*) into n from public.organisations;
  if n <> 0 then raise exception 'reader should see no organisations, saw %', n; end if;
  select count(*) into n from public.audit_log;
  if n <> 0 then raise exception 'reader should not read the audit log'; end if;
end $$;
rollback to savepoint s2;

-- Staff owner sees both organisations and the audit log; nobody can update or delete audit rows
savepoint s3;
select test_as('44444444-4444-4444-4444-444444444444', array['owner']);
do $$ declare n int; v bigint; begin
  select count(*) into n from public.organisations where kind = 'publisher';
  if n <> 2 then raise exception 'staff should see 2 publisher organisations, saw %', n; end if;
  v := app.audit('test.action', 'org:a', 'isolation test');
  select count(*) into n from public.audit_log where id = v;
  if n <> 1 then raise exception 'staff should read the audit row'; end if;
  begin
    update public.audit_log set reason = 'tampered' where id = v;
    raise exception 'audit log was updated';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.audit_log where id = v;
    raise exception 'audit log row was deleted';
  exception when insufficient_privilege then null; end;
end $$;
rollback to savepoint s3;

-- Last owner guard
savepoint s4;
reset role;
do $$ begin
  begin
    delete from public.org_members where org_id = 'aaaaaaaa-0000-0000-0000-000000000001' and role = 'owner';
    raise exception 'last owner was removed';
  exception when check_violation then null; end;
end $$;
rollback to savepoint s4;

-- Flags resolve workbook, then tenant, then global
reset role;
do $$ begin
  if app.flag('membership') then raise exception 'membership should be off globally'; end if;
  insert into public.feature_flags (key, scope, scope_id, enabled) values ('membership', 'tenant', 'aaaaaaaa-0000-0000-0000-00000000000a', true);
  if not app.flag('membership', 'aaaaaaaa-0000-0000-0000-00000000000a') then raise exception 'tenant override should win'; end if;
  if app.flag('membership', 'bbbbbbbb-0000-0000-0000-00000000000b') then raise exception 'other tenant should fall back to global'; end if;
end $$;

rollback;
\echo PASS 0001_isolation
