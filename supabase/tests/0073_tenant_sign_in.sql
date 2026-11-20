-- 0073 Tenant-scoped sessions (F-133). A tenant_reader token reads and writes
-- its own rows in its own tenant and nothing else; the access token hook
-- changes scoped sessions only; an ordinary reader is unchanged. Each block
-- must raise or return the expected count; a failure aborts the script.
\set ON_ERROR_STOP on

begin;

-- Reader 1 has enrolments in tenant A, tenant B and the marketplace.
-- Reader 2 has one in tenant A.
insert into auth.users (id, email) values
  ('a7300000-0000-0000-0000-000000000001', 'reader73a@test'),
  ('a7300000-0000-0000-0000-000000000002', 'reader73b@test'),
  ('a7300000-0000-0000-0000-000000000003', 'owner73@test');
insert into public.profiles (user_id) values
  ('a7300000-0000-0000-0000-000000000001'), ('a7300000-0000-0000-0000-000000000002'), ('a7300000-0000-0000-0000-000000000003')
on conflict (user_id) do nothing;

insert into public.organisations (id, code, kind, legal_name, display_name, slug, country) values
  ('a7300000-0000-0000-0000-0000000000a1', 'PB-TS73A', 'publisher', 'Org 73A Ltd', 'Org 73A', 'org-73a', 'GB'),
  ('a7300000-0000-0000-0000-0000000000a2', 'PB-TS73B', 'publisher', 'Org 73B Ltd', 'Org 73B', 'org-73b', 'GB');
insert into public.org_members (org_id, user_id, role) values
  ('a7300000-0000-0000-0000-0000000000a1', 'a7300000-0000-0000-0000-000000000003', 'owner');
insert into public.tenants (id, slug, kind, org_id, name, plan) values
  ('a7300000-0000-0000-0000-0000000000b1', 'org-73a', 'white_label', 'a7300000-0000-0000-0000-0000000000a1', 'Org 73A Books', 'pro'),
  ('a7300000-0000-0000-0000-0000000000b2', 'org-73b', 'white_label', 'a7300000-0000-0000-0000-0000000000a2', 'Org 73B Books', 'pro');
insert into public.books (id, org_id, slug, title) values
  ('a7300000-0000-0000-0000-0000000000c1', 'a7300000-0000-0000-0000-0000000000a1', 'book-73a', 'Book 73A'),
  ('a7300000-0000-0000-0000-0000000000c2', 'a7300000-0000-0000-0000-0000000000a2', 'book-73b', 'Book 73B');
-- d1 and d3 belong to org A; d1 is listed by tenant A, d3 is not. d2 is org B's.
insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, depth, status, badge, is_demo) values
  ('a7300000-0000-0000-0000-0000000000d1', 'AK-T73A1', 'a7300000-0000-0000-0000-0000000000c1', 'a7300000-0000-0000-0000-0000000000a1',
   'wb-73a', 'Workbook 73A', 'Card', 'productivity', 'full', 'live', 'official', false),
  ('a7300000-0000-0000-0000-0000000000d2', 'AK-T73B1', 'a7300000-0000-0000-0000-0000000000c2', 'a7300000-0000-0000-0000-0000000000a2',
   'wb-73b', 'Workbook 73B', 'Card', 'productivity', 'full', 'live', 'official', false),
  ('a7300000-0000-0000-0000-0000000000d3', 'AK-T73A3', 'a7300000-0000-0000-0000-0000000000c1', 'a7300000-0000-0000-0000-0000000000a1',
   'wb-73a3', 'Workbook 73A3', 'Card', 'productivity', 'full', 'live', 'official', false);
insert into public.workbook_versions (id, workbook_id, semver, content, content_hash) values
  ('a7300000-0000-0000-0000-0000000000e1', 'a7300000-0000-0000-0000-0000000000d1', '1.0.0', '{"structure":{"unit":"week","count":2}}'::jsonb, repeat('a', 64)),
  ('a7300000-0000-0000-0000-0000000000e2', 'a7300000-0000-0000-0000-0000000000d2', '1.0.0', '{"structure":{"unit":"week","count":2}}'::jsonb, repeat('b', 64)),
  ('a7300000-0000-0000-0000-0000000000e3', 'a7300000-0000-0000-0000-0000000000d3', '1.0.0', '{"structure":{"unit":"week","count":2}}'::jsonb, repeat('c', 64)),
  ('a7300000-0000-0000-0000-0000000000e4', 'a7300000-0000-0000-0000-0000000000d1', '0.9.0', '{"structure":{"unit":"week","count":2}}'::jsonb, repeat('d', 64));
update public.workbooks set current_version_id = 'a7300000-0000-0000-0000-0000000000e1' where id = 'a7300000-0000-0000-0000-0000000000d1';
update public.workbooks set current_version_id = 'a7300000-0000-0000-0000-0000000000e2' where id = 'a7300000-0000-0000-0000-0000000000d2';
update public.workbooks set current_version_id = 'a7300000-0000-0000-0000-0000000000e3' where id = 'a7300000-0000-0000-0000-0000000000d3';
insert into public.workbook_sections (version_id, kind, unit_number, body, free) values
  ('a7300000-0000-0000-0000-0000000000e1', 'listing', null, '{}'::jsonb, false),
  ('a7300000-0000-0000-0000-0000000000e1', 'unit', 1, '{}'::jsonb, true),
  ('a7300000-0000-0000-0000-0000000000e1', 'unit', 2, '{}'::jsonb, false),
  ('a7300000-0000-0000-0000-0000000000e2', 'listing', null, '{}'::jsonb, false),
  ('a7300000-0000-0000-0000-0000000000e2', 'unit', 1, '{}'::jsonb, true),
  ('a7300000-0000-0000-0000-0000000000e3', 'unit', 1, '{}'::jsonb, true);
insert into public.tenant_listings (tenant_id, workbook_id) values
  ('a7300000-0000-0000-0000-0000000000b1', 'a7300000-0000-0000-0000-0000000000d1'),
  ('a7300000-0000-0000-0000-0000000000b2', 'a7300000-0000-0000-0000-0000000000d2');

insert into public.enrolments (id, user_id, tenant_id, workbook_id, version_id) values
  -- reader 1, tenant B
  ('a7300000-0000-0000-0000-0000000000f2', 'a7300000-0000-0000-0000-000000000001', 'a7300000-0000-0000-0000-0000000000b2',
   'a7300000-0000-0000-0000-0000000000d2', 'a7300000-0000-0000-0000-0000000000e2'),
  -- reader 1, marketplace, the same workbook tenant A lists
  ('a7300000-0000-0000-0000-0000000000f3', 'a7300000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   'a7300000-0000-0000-0000-0000000000d1', 'a7300000-0000-0000-0000-0000000000e1'),
  -- reader 2, tenant A
  ('a7300000-0000-0000-0000-0000000000f4', 'a7300000-0000-0000-0000-000000000002', 'a7300000-0000-0000-0000-0000000000b1',
   'a7300000-0000-0000-0000-0000000000d1', 'a7300000-0000-0000-0000-0000000000e1');
insert into public.answers (enrolment_id, field, sealed, key_id) values
  ('a7300000-0000-0000-0000-0000000000f2', 'f1', 'v1.b', 'k1'),
  ('a7300000-0000-0000-0000-0000000000f3', 'f1', 'v1.m', 'k1'),
  ('a7300000-0000-0000-0000-0000000000f4', 'f1', 'v1.o', 'k1');
insert into public.progress_events (enrolment_id, kind, ref) values
  ('a7300000-0000-0000-0000-0000000000f2', 'unit_opened', '1'),
  ('a7300000-0000-0000-0000-0000000000f3', 'unit_opened', '1'),
  ('a7300000-0000-0000-0000-0000000000f4', 'unit_opened', '1');

-- ---------------------------------------------------------------------------
-- 1. Default deny, checked against the catalogue. tenant_reader holds exactly
--    the privileges 0073 names and nothing else, on any table or function in
--    any schema it can reach. A later migration that grants more, or that
--    leaves a function executable by public, fails here.
-- ---------------------------------------------------------------------------
do $$
declare r record; v text;
begin
  -- Schemas.
  select string_agg(n.nspname, ',' order by n.nspname) into v
    from pg_namespace n
   where has_schema_privilege('tenant_reader', n.oid, 'usage')
     and n.nspname not in ('pg_catalog', 'information_schema');
  if v is distinct from 'public,tenant_scope' then raise exception 'tenant_reader has usage on schemas: %', v; end if;

  -- Tables: only the four, with only these privileges.
  for r in
    select c.oid, n.nspname, c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where c.relkind in ('r', 'v', 'm', 'p', 'f', 'S')
       and n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast')
  loop
    v := concat_ws(',',
      case when has_table_privilege('tenant_reader', r.oid, 'select') then 'select' end,
      case when has_table_privilege('tenant_reader', r.oid, 'insert') then 'insert' end,
      case when has_table_privilege('tenant_reader', r.oid, 'update') then 'update' end,
      case when has_table_privilege('tenant_reader', r.oid, 'delete') then 'delete' end,
      case when has_table_privilege('tenant_reader', r.oid, 'truncate') then 'truncate' end,
      case when has_any_column_privilege('tenant_reader', r.oid, 'insert') then 'insert-columns' end,
      case when has_any_column_privilege('tenant_reader', r.oid, 'update') then 'update-columns' end,
      case when has_any_column_privilege('tenant_reader', r.oid, 'select') then 'select-columns' end);
    if v is distinct from (case r.nspname || '.' || r.relname
        when 'public.enrolments' then 'select,insert-columns,update-columns,select-columns'
        when 'public.progress_events' then 'select,insert,insert-columns,select-columns'
        when 'public.answers' then 'select,select-columns'
        when 'public.workbook_sections' then 'select,select-columns'
        else '' end) then
      raise exception 'tenant_reader privileges on %.% are: %', r.nspname, r.relname, v;
    end if;
  end loop;

  -- The column grants on enrolments are exactly these.
  select string_agg(a.attname || ':' || p.priv, ',' order by a.attname, p.priv) into v
    from pg_attribute a, (values ('insert'), ('update')) p(priv)
   where a.attrelid = 'public.enrolments'::regclass and a.attnum > 0 and not a.attisdropped
     and has_column_privilege('tenant_reader', 'public.enrolments', a.attname, p.priv);
  if v is distinct from 'last_opened_at:update,tenant_id:insert,user_id:insert,version_id:insert,workbook_id:insert' then
    raise exception 'tenant_reader column grants on enrolments are: %', v;
  end if;

  -- Functions in the schemas it can use. Extension functions (pgcrypto sits
  -- in public on plain Postgres) and this harness's own helpers are left out.
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text) into v
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'tenant_scope')
     and has_function_privilege('tenant_reader', p.oid, 'execute')
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
     and p.proname not in ('test_as', 'test_as_tenant_reader');
  if v is distinct from 'tenant_reader_accept_terms(text), tenant_reader_confirm_adult(text), tenant_reader_gates(), tenant_reader_set_health_consent(text), tenant_scope.can_write(), tenant_scope.claims(), tenant_scope.current_version(uuid), tenant_scope.lists_workbook(uuid), tenant_scope.live(), tenant_scope.owns_enrolment(uuid), tenant_scope.section_open(uuid,text,boolean), tenant_scope.tenant(), tenant_scope.uid()' then
    raise exception 'tenant_reader can execute: %', v;
  end if;

  -- authenticator can switch to the role; the new table has row level security.
  if not pg_has_role('authenticator', 'tenant_reader', 'member') then raise exception 'authenticator is not a member of tenant_reader'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.tenant_session_scopes'::regclass) then
    raise exception 'tenant_session_scopes has no row level security';
  end if;
  -- No existing policy names the new role or public, so none applies to it by accident.
  if exists (select 1 from pg_policies where 'public' = any(roles)) then raise exception 'a policy applies to every role'; end if;
  if (select count(*) from pg_policies where 'tenant_reader' = any(roles)) <> 7 then raise exception 'unexpected tenant_reader policies'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The access token hook
-- ---------------------------------------------------------------------------
insert into auth.sessions (id, user_id) values
  ('a7300000-0000-0000-0000-000000005e01', 'a7300000-0000-0000-0000-000000000001'),
  ('a7300000-0000-0000-0000-000000005e02', 'a7300000-0000-0000-0000-000000000001'),
  ('a7300000-0000-0000-0000-000000005e03', 'a7300000-0000-0000-0000-000000000001'),
  ('a7300000-0000-0000-0000-000000005e04', 'a7300000-0000-0000-0000-000000000002'),
  ('a7300000-0000-0000-0000-000000005e07', 'a7300000-0000-0000-0000-000000000001'),
  ('a7300000-0000-0000-0000-000000005e08', 'a7300000-0000-0000-0000-000000000001');

-- Registration refuses while the flag is off, for the marketplace, for a
-- session that is not this user's, and for an unknown tenant.
do $$ begin
  begin
    perform public.register_tenant_session('a7300000-0000-0000-0000-000000005e01', 'a7300000-0000-0000-0000-000000000001', 'a7300000-0000-0000-0000-0000000000b1', 'books.a73.example');
    raise exception 'a session was registered with the flag off';
  exception when sqlstate 'AKS02' then null; end;
  if public.tenant_sign_in_enabled('a7300000-0000-0000-0000-0000000000b1') then raise exception 'flag reads on before it is set'; end if;
end $$;
-- The flag rows are written as public.set_tenant_sign_in would (block 9 proves nothing else can).
select set_config('akana.tenant_sign_in_switch', 'on', true);
insert into public.feature_flags (key, scope, scope_id, enabled, reason) values
  ('tenant_sign_in', 'tenant', 'a7300000-0000-0000-0000-0000000000b1', true, 'test'),
  ('tenant_sign_in', 'tenant', 'a7300000-0000-0000-0000-0000000000b2', true, 'test'),
  ('tenant_sign_in', 'tenant', '00000000-0000-0000-0000-00000000000a', true, 'test');
select set_config('akana.tenant_sign_in_switch', '', true);
do $$ begin
  if not public.tenant_sign_in_enabled('a7300000-0000-0000-0000-0000000000b1') then raise exception 'flag reads off for tenant A'; end if;
  if public.tenant_sign_in_enabled('00000000-0000-0000-0000-00000000000a') then raise exception 'flag reads on for the marketplace'; end if;
  if public.tenant_sign_in_enabled(null) then raise exception 'flag reads on for no tenant'; end if;
  begin
    perform public.register_tenant_session('a7300000-0000-0000-0000-000000005e01', 'a7300000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'akana.example');
    raise exception 'a session was scoped to the marketplace';
  exception when sqlstate 'AKS01' then null; end;
  begin
    perform public.register_tenant_session('a7300000-0000-0000-0000-000000005e04', 'a7300000-0000-0000-0000-000000000001', 'a7300000-0000-0000-0000-0000000000b1', 'books.a73.example');
    raise exception 'another reader''s session was registered';
  exception when sqlstate 'AKS01' then null; end;
  perform public.register_tenant_session('a7300000-0000-0000-0000-000000005e01', 'a7300000-0000-0000-0000-000000000001', 'a7300000-0000-0000-0000-0000000000b1', 'Books.A73.example');
  perform public.register_tenant_session('a7300000-0000-0000-0000-000000005e03', 'a7300000-0000-0000-0000-000000000001', 'a7300000-0000-0000-0000-0000000000b1', 'other.a73.example');
  perform public.register_tenant_session('a7300000-0000-0000-0000-000000005e07', 'a7300000-0000-0000-0000-000000000001', 'a7300000-0000-0000-0000-0000000000b2', 'books.b73.example');
  if (select host from public.tenant_session_scopes where session_id = 'a7300000-0000-0000-0000-000000005e01') <> 'books.a73.example' then
    raise exception 'the host was not stored lower case';
  end if;
  -- A session is scoped once and for good.
  begin
    perform public.register_tenant_session('a7300000-0000-0000-0000-000000005e01', 'a7300000-0000-0000-0000-000000000001', 'a7300000-0000-0000-0000-0000000000b2', 'books.b73.example');
    raise exception 'a session was scoped twice';
  exception when unique_violation then null; end;
end $$;

-- Run as supabase_auth_admin, as Supabase Auth does.
set local role supabase_auth_admin;
do $$
declare
  v_event jsonb := jsonb_build_object(
    'user_id', 'a7300000-0000-0000-0000-000000000001',
    'authentication_method', 'otp',
    'claims', jsonb_build_object(
      'iss', 'https://example.supabase.co/auth/v1', 'aud', 'authenticated', 'exp', 1900000000, 'iat', 1800000000,
      'sub', 'a7300000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal1',
      'session_id', 'a7300000-0000-0000-0000-000000005e02', 'email', 'reader73a@test', 'phone', '', 'is_anonymous', false,
      'app_metadata', jsonb_build_object('provider', 'email'), 'amr', jsonb_build_array(jsonb_build_object('method', 'otp', 'timestamp', 1800000000))));
  v_out jsonb;
  k text;
begin
  -- No scope row: the event comes back exactly as it went in.
  v_out := public.akana_access_token_hook(v_event);
  if v_out is distinct from v_event then raise exception 'an unscoped session was changed: %', v_out; end if;
  -- No session id, a malformed one, no claims at all: unchanged, no error.
  if public.akana_access_token_hook(v_event #- '{claims,session_id}') is distinct from (v_event #- '{claims,session_id}') then raise exception 'no session id: changed'; end if;
  if public.akana_access_token_hook(jsonb_set(v_event, '{claims,session_id}', '"not-a-uuid"')) is distinct from jsonb_set(v_event, '{claims,session_id}', '"not-a-uuid"') then raise exception 'bad session id: changed'; end if;
  if public.akana_access_token_hook('{}'::jsonb) is distinct from '{}'::jsonb then raise exception 'empty event: changed'; end if;

  -- A scope row: role and tenant claim set, every other claim kept as it was.
  v_event := jsonb_set(v_event, '{claims,session_id}', '"a7300000-0000-0000-0000-000000005e01"');
  v_out := public.akana_access_token_hook(v_event);
  if v_out #>> '{claims,role}' <> 'tenant_reader' then raise exception 'role not set: %', v_out; end if;
  if v_out #>> '{claims,akana_tenant}' <> 'a7300000-0000-0000-0000-0000000000b1' then raise exception 'tenant claim not set: %', v_out; end if;
  foreach k in array array['iss', 'aud', 'exp', 'iat', 'sub', 'role', 'aal', 'session_id', 'email', 'phone', 'is_anonymous'] loop
    if not (v_out -> 'claims') ? k then raise exception 'required claim % was dropped', k; end if;
  end loop;
  if ((v_out -> 'claims') - 'role' - 'akana_tenant') is distinct from ((v_event -> 'claims') - 'role') then raise exception 'another claim was changed'; end if;
  if (v_out - 'claims') is distinct from (v_event - 'claims') then raise exception 'the event outside claims was changed'; end if;
  -- A forged tenant claim in the incoming event does not survive.
  v_out := public.akana_access_token_hook(jsonb_set(v_event, '{claims,akana_tenant}', '"a7300000-0000-0000-0000-0000000000b2"'));
  if v_out #>> '{claims,akana_tenant}' <> 'a7300000-0000-0000-0000-0000000000b1' then raise exception 'a forged tenant claim survived'; end if;
end $$;
reset role;

-- The hook belongs to supabase_auth_admin alone, and so does reading the scope table.
do $$
declare r text; n int;
begin
  foreach r in array array['anon', 'authenticated', 'tenant_reader', 'service_role'] loop
    if has_function_privilege(r, 'public.akana_access_token_hook(jsonb)', 'execute') then raise exception '% can execute the hook', r; end if;
  end loop;
  foreach r in array array['anon', 'authenticated', 'tenant_reader'] loop
    if has_table_privilege(r, 'public.tenant_session_scopes', 'select') or has_table_privilege(r, 'public.tenant_session_scopes', 'insert') then
      raise exception '% can reach tenant_session_scopes', r;
    end if;
    if has_function_privilege(r, 'public.register_tenant_session(uuid,uuid,uuid,text)', 'execute')
       or has_function_privilege(r, 'public.revoke_tenant_sessions(uuid,text)', 'execute') then
      raise exception '% can register or revoke sessions', r;
    end if;
  end loop;
end $$;
set local role anon;
do $$ begin
  begin perform public.akana_access_token_hook('{}'::jsonb); raise exception 'anon ran the hook'; exception when insufficient_privilege then null; end;
  begin perform count(*) from public.tenant_session_scopes; raise exception 'anon read the scope table'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
select test_as('a7300000-0000-0000-0000-000000000001');
do $$ begin
  begin perform public.akana_access_token_hook('{}'::jsonb); raise exception 'authenticated ran the hook'; exception when insufficient_privilege then null; end;
  begin perform count(*) from public.tenant_session_scopes; raise exception 'authenticated read the scope table'; exception when insufficient_privilege then null; end;
  begin perform public.register_tenant_session('a7300000-0000-0000-0000-000000005e02', 'a7300000-0000-0000-0000-000000000001', 'a7300000-0000-0000-0000-0000000000b1', 'x.example'); raise exception 'authenticated registered a session'; exception when insufficient_privilege then null; end;
  begin perform public.tenant_reader_gates(); raise exception 'authenticated called a tenant reader function'; exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. Reader 1 with a token for tenant A: own rows in tenant A
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '', true);
select test_as_tenant_reader('a7300000-0000-0000-0000-000000000001', 'a7300000-0000-0000-0000-0000000000b1');
do $$
declare n int; v_id uuid;
begin
  -- Nothing yet in tenant A. The tenant B and marketplace enrolments are not visible.
  select count(*) into n from public.enrolments;
  if n <> 0 then raise exception 'tenant A token sees % enrolments before enrolling', n; end if;

  -- Enrol in the title tenant A lists.
  insert into public.enrolments (user_id, tenant_id, workbook_id, version_id) values
    ('a7300000-0000-0000-0000-000000000001', 'a7300000-0000-0000-0000-0000000000b1', 'a7300000-0000-0000-0000-0000000000d1', 'a7300000-0000-0000-0000-0000000000e1')
  returning id into v_id;
  select count(*) into n from public.enrolments;
  if n <> 1 then raise exception 'own enrolment not visible'; end if;

  update public.enrolments set last_opened_at = now() where id = v_id;
  insert into public.progress_events (enrolment_id, kind, ref) values (v_id, 'unit_opened', '1');
  select count(*) into n from public.progress_events;
  if n <> 1 then raise exception 'tenant A token sees % progress events, expected 1', n; end if;

  -- Sections: the listing and the free unit of tenant A's title; not unit 2,
  -- not tenant B's title, not an unlisted title of the same organisation.
  select count(*) into n from public.workbook_sections;
  if n <> 2 then raise exception 'tenant A token sees % sections, expected 2', n; end if;
  select count(*) into n from public.workbook_sections where version_id <> 'a7300000-0000-0000-0000-0000000000e1';
  if n <> 0 then raise exception 'sections of another title are visible'; end if;

  -- Gates: own account facts only, as booleans.
  if (select adult_confirmed or terms_accepted or health_consent or not can_write from public.tenant_reader_gates()) then
    raise exception 'a new account shows a gate as passed';
  end if;
  -- Only the current terms version can be accepted, and only the current consent version given.
  begin perform public.tenant_reader_confirm_adult('reader-2020-01'); raise exception 'an unknown terms version was accepted'; exception when sqlstate 'AKT02' then null; end;
  begin perform public.tenant_reader_accept_terms(null); raise exception 'a null terms version was accepted'; exception when sqlstate 'AKT02' then null; end;
  begin perform public.tenant_reader_set_health_consent('attacker-v0'); raise exception 'an arbitrary consent version was stamped'; exception when check_violation then null; end;
  if (select adult_confirmed or health_consent from public.tenant_reader_gates()) then raise exception 'a refused call still wrote'; end if;

  perform public.tenant_reader_confirm_adult('reader-2026-10');
  if not (select adult_confirmed and terms_accepted and not health_consent and can_write from public.tenant_reader_gates()) then
    raise exception 'gates not recorded';
  end if;
  perform public.tenant_reader_set_health_consent('health-2026-10');
  if not (select health_consent from public.tenant_reader_gates()) then raise exception 'health consent not recorded'; end if;
  -- Asking again adds nothing: the account's hourly limit on acceptances (AKT29) cannot be used up from here.
  for i in 1..30 loop
    if public.tenant_reader_accept_terms('reader-2026-10') then raise exception 'a second acceptance of the same version was written'; end if;
    perform public.tenant_reader_confirm_adult('reader-2026-10');
    perform public.tenant_reader_set_health_consent('health-2026-10');
  end loop;
end $$;
reset role;
-- The acceptance carries the tenant from the token, once. Nothing that was
-- already on the account was moved (RT-5).
do $$
declare v_adult timestamptz; v_health timestamptz;
begin
  if (select count(*) from public.terms_acceptances where user_id = 'a7300000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'expected exactly one terms acceptance';
  end if;
  if (select count(*) from public.terms_acceptances where user_id = 'a7300000-0000-0000-0000-000000000001' and tenant_id = 'a7300000-0000-0000-0000-0000000000b1' and context = 'signup') <> 1 then
    raise exception 'the terms acceptance was not recorded against tenant A';
  end if;
  if (select adult_confirmed_at from public.profiles where user_id = 'a7300000-0000-0000-0000-000000000002') is not null then
    raise exception 'another reader was confirmed';
  end if;
  -- Move the dates back, as if given on the Akana site last month, and call again.
  update public.profiles set adult_confirmed_at = now() - interval '30 days', health_consent_at = now() - interval '30 days'
   where user_id = 'a7300000-0000-0000-0000-000000000001';
end $$;
select set_config('request.jwt.claims', '', true);
select test_as_tenant_reader('a7300000-0000-0000-0000-000000000001', 'a7300000-0000-0000-0000-0000000000b1');
select public.tenant_reader_confirm_adult('reader-2026-10'), public.tenant_reader_set_health_consent('health-2026-10');
reset role;
do $$ begin
  if (select adult_confirmed_at > now() - interval '29 days' or health_consent_at > now() - interval '29 days' or health_consent_version <> 'health-2026-10'
        from public.profiles where user_id = 'a7300000-0000-0000-0000-000000000001') then
    raise exception 'a tenant session overwrote an existing confirmation or consent';
  end if;
end $$;
-- The same reader on the Akana site can still accept terms: the tenant calls used none of the hourly limit.
select set_config('request.jwt.claims', '', true);
select test_as('a7300000-0000-0000-0000-000000000001');
select public.accept_terms('reader_terms', 'reader-2026-10', 'reask');
reset role;
insert into public.answers (enrolment_id, field, sealed, key_id)
  select id, 'f1', 'v1.a', 'k1' from public.enrolments
   where user_id = 'a7300000-0000-0000-0000-000000000001' and tenant_id = 'a7300000-0000-0000-0000-0000000000b1';

-- ---------------------------------------------------------------------------
-- 4. The same token: nothing in tenant B, the marketplace or another reader
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '', true);
select test_as_tenant_reader('a7300000-0000-0000-0000-000000000001', 'a7300000-0000-0000-0000-0000000000b1');
do $$
declare n int; t text;
begin
  select count(*) into n from public.answers;
  if n <> 1 then raise exception 'tenant A token sees % answers, expected 1', n; end if;
  if (select sealed from public.answers) <> 'v1.a' then raise exception 'the wrong answer is visible'; end if;
  select count(*) into n from public.enrolments where tenant_id <> 'a7300000-0000-0000-0000-0000000000b1';
  if n <> 0 then raise exception 'an enrolment outside tenant A is visible'; end if;
  select count(*) into n from public.answers where enrolment_id in ('a7300000-0000-0000-0000-0000000000f2', 'a7300000-0000-0000-0000-0000000000f3', 'a7300000-0000-0000-0000-0000000000f4');
  if n <> 0 then raise exception 'answers outside the scope are visible'; end if;
  select count(*) into n from public.progress_events where enrolment_id in ('a7300000-0000-0000-0000-0000000000f2', 'a7300000-0000-0000-0000-0000000000f3', 'a7300000-0000-0000-0000-0000000000f4');
  if n <> 0 then raise exception 'progress outside the scope is visible'; end if;

  -- Writes outside the scope: own enrolment in tenant B, own in the marketplace, another reader's in tenant A.
  foreach t in array array['a7300000-0000-0000-0000-0000000000f2', 'a7300000-0000-0000-0000-0000000000f3', 'a7300000-0000-0000-0000-0000000000f4'] loop
    begin
      insert into public.progress_events (enrolment_id, kind, ref) values (t::uuid, 'step_done', 's1');
      raise exception 'progress was written to enrolment %', t;
    exception when insufficient_privilege then null; end;
    update public.enrolments set last_opened_at = now() where id = t::uuid;
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'enrolment % was updated', t; end if;
  end loop;

  -- Enrolling: not in tenant B, not in the marketplace, not as someone else,
  -- not in a title tenant A does not list, not on an old version.
  begin
    insert into public.enrolments (user_id, tenant_id, workbook_id, version_id) values
      ('a7300000-0000-0000-0000-000000000001', 'a7300000-0000-0000-0000-0000000000b2', 'a7300000-0000-0000-0000-0000000000d3', 'a7300000-0000-0000-0000-0000000000e3');
    raise exception 'enrolled in tenant B';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.enrolments (user_id, tenant_id, workbook_id, version_id) values
      ('a7300000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'a7300000-0000-0000-0000-0000000000d3', 'a7300000-0000-0000-0000-0000000000e3');
    raise exception 'enrolled in the marketplace';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.enrolments (user_id, tenant_id, workbook_id, version_id) values
      ('a7300000-0000-0000-0000-000000000003', 'a7300000-0000-0000-0000-0000000000b1', 'a7300000-0000-0000-0000-0000000000d1', 'a7300000-0000-0000-0000-0000000000e1');
    raise exception 'enrolled as another reader';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.enrolments (user_id, tenant_id, workbook_id, version_id) values
      ('a7300000-0000-0000-0000-000000000001', 'a7300000-0000-0000-0000-0000000000b1', 'a7300000-0000-0000-0000-0000000000d3', 'a7300000-0000-0000-0000-0000000000e3');
    raise exception 'enrolled in a title tenant A does not list';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.enrolments (user_id, tenant_id, workbook_id, version_id) values
      ('a7300000-0000-0000-0000-000000000001', 'a7300000-0000-0000-0000-0000000000b1', 'a7300000-0000-0000-0000-0000000000d2', 'a7300000-0000-0000-0000-0000000000e2');
    raise exception 'enrolled in tenant B''s title through tenant A';
  exception when insufficient_privilege then null; end;

  -- The pins: no column but last_opened_at can be written, and nothing can be deleted.
  begin update public.enrolments set tenant_id = 'a7300000-0000-0000-0000-0000000000b2'; raise exception 'tenant_id was updated'; exception when insufficient_privilege then null; end;
  begin update public.enrolments set version_id = 'a7300000-0000-0000-0000-0000000000e4'; raise exception 'version_id was updated'; exception when insufficient_privilege then null; end;
  begin update public.enrolments set status = 'finished'; raise exception 'status was updated'; exception when insufficient_privilege then null; end;
  begin insert into public.enrolments (id, user_id, tenant_id, workbook_id, version_id, status) values (gen_random_uuid(), 'a7300000-0000-0000-0000-000000000001', 'a7300000-0000-0000-0000-0000000000b1', 'a7300000-0000-0000-0000-0000000000d1', 'a7300000-0000-0000-0000-0000000000e1', 'finished'); raise exception 'a column outside the grant was inserted'; exception when insufficient_privilege then null; end;
  begin delete from public.enrolments; raise exception 'enrolments were deleted'; exception when insufficient_privilege then null; end;
  begin delete from public.progress_events; raise exception 'progress was deleted'; exception when insufficient_privilege then null; end;
  begin update public.progress_events set ref = '2'; raise exception 'progress was updated'; exception when insufficient_privilege then null; end;
  -- Answers are read only for every reader; writes are the service role's.
  begin insert into public.answers (enrolment_id, field, sealed, key_id) select id, 'f2', 'v1.x', 'k1' from public.enrolments; raise exception 'an answer was written'; exception when insufficient_privilege then null; end;
  begin update public.answers set sealed = 'v1.z'; raise exception 'an answer was updated'; exception when insufficient_privilege then null; end;
  begin delete from public.answers; raise exception 'an answer was deleted'; exception when insufficient_privilege then null; end;
  begin update public.workbook_sections set free = true; raise exception 'a section was updated'; exception when insufficient_privilege then null; end;
end $$;

-- Tables that were never granted. The catalogue check in block 1 covers
-- every table; these are tried for real.
do $$
declare t text;
begin
  foreach t in array array['profiles', 'subscriptions', 'membership_seats', 'purchases', 'entitlements', 'habit_settings',
                           'programme_pairs', 'pair_finishes', 'push_subscriptions', 'tenant_members', 'tenant_domains', 'tenant_listings',
                           'tenants', 'org_members', 'audit_log', 'feature_flags', 'terms_acceptances', 'account_deletion_requests',
                           'reading_places', 'reader_marks', 'workbooks', 'workbook_versions', 'tenant_session_scopes'] loop
    begin
      execute format('select count(*) from public.%I', t);
      raise exception 'tenant_reader read public.%', t;
    exception when insufficient_privilege then null; end;
  end loop;
  begin perform count(*) from auth.users; raise exception 'tenant_reader read auth.users'; exception when insufficient_privilege then null; end;
  begin perform count(*) from auth.sessions; raise exception 'tenant_reader read auth.sessions'; exception when insufficient_privilege then null; end;
  begin perform count(*) from storage.objects; raise exception 'tenant_reader read storage.objects'; exception when insufficient_privilege then null; end;
  begin update public.profiles set display_name = 'x'; raise exception 'tenant_reader wrote profiles'; exception when insufficient_privilege then null; end;
  begin insert into public.audit_log (action, target) values ('x', 'y'); raise exception 'tenant_reader wrote audit_log'; exception when insufficient_privilege then null; end;

  -- Functions that were never granted.
  begin perform public.set_health_consent('health-2026-10'); raise exception 'ran set_health_consent'; exception when insufficient_privilege then null; end;
  begin perform public.accept_terms('reader_terms', 'reader-2026-10', 'signup'); raise exception 'ran accept_terms'; exception when insufficient_privilege then null; end;
  begin perform public.terms_status('reader_terms'); raise exception 'ran terms_status'; exception when insufficient_privilege then null; end;
  begin perform public.award_milestones(); raise exception 'ran award_milestones'; exception when insufficient_privilege then null; end;
  begin perform public.flag_on('tenant_sign_in'); raise exception 'ran flag_on'; exception when insufficient_privilege then null; end;
  begin perform public.tenant_catalogue('a7300000-0000-0000-0000-0000000000b1'); raise exception 'ran tenant_catalogue'; exception when insufficient_privilege then null; end;
  begin perform public.tenant_sign_in_enabled('a7300000-0000-0000-0000-0000000000b1'); raise exception 'ran tenant_sign_in_enabled'; exception when insufficient_privilege then null; end;
  begin perform public.akana_access_token_hook('{}'::jsonb); raise exception 'ran the hook'; exception when insufficient_privilege then null; end;
  begin perform public.register_tenant_session('a7300000-0000-0000-0000-000000005e02', 'a7300000-0000-0000-0000-000000000001', 'a7300000-0000-0000-0000-0000000000b2', 'x.example'); raise exception 'registered a session'; exception when insufficient_privilege then null; end;
  begin perform public.revoke_tenant_sessions('a7300000-0000-0000-0000-0000000000b1', 'x'); raise exception 'revoked sessions'; exception when insufficient_privilege then null; end;
  begin perform public.set_tenant_sign_in('a7300000-0000-0000-0000-0000000000b1', true, 'x'); raise exception 'switched the flag'; exception when insufficient_privilege then null; end;
  begin perform app.uid(); raise exception 'reached the app schema'; exception when insufficient_privilege then null; end;
  begin perform app.is_staff(); raise exception 'reached the app schema'; exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 5. Reader 1 with a token for tenant B sees tenant B only; tokens with a
--    missing or malformed claim, or the wrong role, see nothing
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '', true);
select test_as_tenant_reader('a7300000-0000-0000-0000-000000000001', 'a7300000-0000-0000-0000-0000000000b2');
do $$
declare n int;
begin
  select count(*) into n from public.enrolments;
  if n <> 1 then raise exception 'tenant B token sees % enrolments, expected 1', n; end if;
  if (select id from public.enrolments) <> 'a7300000-0000-0000-0000-0000000000f2' then raise exception 'tenant B token sees the wrong enrolment'; end if;
  if (select sealed from public.answers) <> 'v1.b' then raise exception 'tenant B token sees the wrong answer'; end if;
  select count(*) into n from public.workbook_sections where version_id = 'a7300000-0000-0000-0000-0000000000e1';
  if n <> 0 then raise exception 'tenant B token sees tenant A sections'; end if;
end $$;
reset role;

select set_config('request.jwt.claims', '', true);
select test_as_tenant_reader('a7300000-0000-0000-0000-000000000001', null, 'a7300000-0000-0000-0000-000000005e01');
do $$
declare n int;
begin
  select (select count(*) from public.enrolments) + (select count(*) from public.answers) + (select count(*) from public.progress_events) + (select count(*) from public.workbook_sections) into n;
  if n <> 0 then raise exception 'a token with no tenant claim sees % rows', n; end if;
  begin perform public.tenant_reader_gates(); raise exception 'gates answered a token with no tenant claim'; exception when insufficient_privilege then null; end;
  begin perform public.tenant_reader_confirm_adult('reader-2026-10'); raise exception 'confirm answered a token with no tenant claim'; exception when insufficient_privilege then null; end;
  begin perform public.tenant_reader_set_health_consent('health-2026-10'); raise exception 'consent answered a token with no tenant claim'; exception when insufficient_privilege then null; end;
end $$;
reset role;

-- The role is tenant_reader in the database but the claims say authenticated
-- (cannot happen through PostgREST; proves the claim readers ask for both).
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claims', '{"sub":"a7300000-0000-0000-0000-000000000001","role":"authenticated","akana_tenant":"a7300000-0000-0000-0000-0000000000b1","session_id":"a7300000-0000-0000-0000-000000005e01"}', true);
set local role tenant_reader;
do $$
declare n int;
begin
  select (select count(*) from public.enrolments) + (select count(*) from public.answers) + (select count(*) from public.workbook_sections) into n;
  if n <> 0 then raise exception 'a token with the wrong role claim sees % rows', n; end if;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claims', '{"sub":"a7300000-0000-0000-0000-000000000001","role":"tenant_reader","akana_tenant":"not-a-uuid","session_id":"a7300000-0000-0000-0000-000000005e01"}', true);
set local role tenant_reader;
do $$
declare n int;
begin
  select (select count(*) from public.enrolments) + (select count(*) from public.answers) + (select count(*) from public.workbook_sections) into n;
  if n <> 0 then raise exception 'a token with a malformed tenant claim sees % rows', n; end if;
end $$;
reset role;

-- The claims must be backed by the session's own scope row: a token naming
-- no session, an unknown session, another reader's session, or a session
-- scoped to a different tenant sees nothing, whatever its tenant claim says.
do $$
declare v text; n int;
begin
  foreach v in array array[
    '{"sub":"a7300000-0000-0000-0000-000000000001","role":"tenant_reader","akana_tenant":"a7300000-0000-0000-0000-0000000000b1"}',
    '{"sub":"a7300000-0000-0000-0000-000000000001","role":"tenant_reader","akana_tenant":"a7300000-0000-0000-0000-0000000000b1","session_id":"a7300000-0000-0000-0000-00000000ffff"}',
    '{"sub":"a7300000-0000-0000-0000-000000000001","role":"tenant_reader","akana_tenant":"a7300000-0000-0000-0000-0000000000b1","session_id":"zzz"}',
    '{"sub":"a7300000-0000-0000-0000-000000000002","role":"tenant_reader","akana_tenant":"a7300000-0000-0000-0000-0000000000b1","session_id":"a7300000-0000-0000-0000-000000005e01"}',
    '{"sub":"a7300000-0000-0000-0000-000000000001","role":"tenant_reader","akana_tenant":"a7300000-0000-0000-0000-0000000000b2","session_id":"a7300000-0000-0000-0000-000000005e01"}',
    '{"sub":"a7300000-0000-0000-0000-000000000001","role":"tenant_reader","akana_tenant":"a7300000-0000-0000-0000-0000000000b1","session_id":"a7300000-0000-0000-0000-000000005e07"}'] loop
    perform set_config('request.jwt.claims', v, true);
    set local role tenant_reader;
    select (select count(*) from public.enrolments) + (select count(*) from public.answers) + (select count(*) from public.progress_events) + (select count(*) from public.workbook_sections) into n;
    reset role;
    if n <> 0 then raise exception 'claims not backed by a scope row see % rows: %', n, v; end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 6. An ordinary (marketplace) session is unchanged. An akana_tenant claim on
--    an authenticated token means nothing to the existing policies.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '', true);
select test_as('a7300000-0000-0000-0000-000000000001');
do $$
declare n int;
begin
  select count(*) into n from public.enrolments;
  if n <> 3 then raise exception 'authenticated reader sees % enrolments, expected 3', n; end if;
  select count(*) into n from public.answers;
  if n <> 3 then raise exception 'authenticated reader sees % answers, expected 3', n; end if;
  select count(*) into n from public.progress_events;
  if n <> 3 then raise exception 'authenticated reader sees % progress events, expected 3', n; end if;
  insert into public.progress_events (enrolment_id, kind, ref) values ('a7300000-0000-0000-0000-0000000000f3', 'step_done', 's1');
  update public.enrolments set last_opened_at = now() where id = 'a7300000-0000-0000-0000-0000000000f3';
  if (select adult_confirmed_at from public.profiles where user_id = 'a7300000-0000-0000-0000-000000000001') is null then raise exception 'own profile not readable'; end if;
  -- The free unit of both titles, and both listings, as before.
  select count(*) into n from public.workbook_sections where version_id in ('a7300000-0000-0000-0000-0000000000e1', 'a7300000-0000-0000-0000-0000000000e2');
  if n <> 4 then raise exception 'authenticated reader sees % sections, expected 4', n; end if;
  begin perform tenant_scope.tenant(); raise exception 'authenticated reached tenant_scope'; exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Signed out: nothing new is reachable.
select set_config('request.jwt.claims', '', true);
set local role anon;
do $$ begin
  begin perform public.tenant_reader_gates(); raise exception 'anon called a tenant reader function'; exception when insufficient_privilege then null; end;
  begin perform tenant_scope.uid(); raise exception 'anon reached tenant_scope'; exception when insufficient_privilege then null; end;
  if not public.tenant_sign_in_enabled('a7300000-0000-0000-0000-0000000000b1') then raise exception 'anon cannot read the flag'; end if;
  begin perform count(*) from public.enrolments; raise exception 'anon read enrolments'; exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 7. Demo period (0070): every section of a demo title on a demo tenant
-- ---------------------------------------------------------------------------
insert into public.tenants (id, slug, kind, name, plan, is_demo) values
  ('a7300000-0000-0000-0000-0000000000b3', 'demo-73', 'white_label', 'Demo 73', 'demo', true);
insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, depth, status, badge, is_demo) values
  ('a7300000-0000-0000-0000-0000000000d4', 'AK-T73D4', 'a7300000-0000-0000-0000-0000000000c2', 'a7300000-0000-0000-0000-0000000000a2',
   'wb-73-demo', 'Demo 73', 'Card', 'productivity', 'full', 'live', 'demo', true);
insert into public.workbook_versions (id, workbook_id, semver, content, content_hash) values
  ('a7300000-0000-0000-0000-0000000000e5', 'a7300000-0000-0000-0000-0000000000d4', '1.0.0', '{"structure":{"unit":"week","count":2}}'::jsonb, repeat('e', 64));
update public.workbooks set current_version_id = 'a7300000-0000-0000-0000-0000000000e5' where id = 'a7300000-0000-0000-0000-0000000000d4';
insert into public.workbook_sections (version_id, kind, unit_number, body, free) values
  ('a7300000-0000-0000-0000-0000000000e5', 'unit', 1, '{}'::jsonb, true),
  ('a7300000-0000-0000-0000-0000000000e5', 'unit', 2, '{}'::jsonb, false);
insert into public.tenant_listings (tenant_id, workbook_id) values ('a7300000-0000-0000-0000-0000000000b3', 'a7300000-0000-0000-0000-0000000000d4');
select set_config('akana.tenant_sign_in_switch', 'on', true);
insert into public.feature_flags (key, scope, scope_id, enabled, reason) values ('tenant_sign_in', 'tenant', 'a7300000-0000-0000-0000-0000000000b3', true, 'test');
select set_config('akana.tenant_sign_in_switch', '', true);
select public.register_tenant_session('a7300000-0000-0000-0000-000000005e08', 'a7300000-0000-0000-0000-000000000001', 'a7300000-0000-0000-0000-0000000000b3', 'demo73.example');
select set_config('request.jwt.claims', '', true);
select test_as_tenant_reader('a7300000-0000-0000-0000-000000000001', 'a7300000-0000-0000-0000-0000000000b3');
do $$
declare n int;
begin
  select count(*) into n from public.workbook_sections;
  if n <> 2 then raise exception 'demo tenant token sees % sections, expected both parts of the demo', n; end if;
end $$;
reset role;
-- A hidden listing closes the title.
update public.tenant_listings set visible = false where tenant_id = 'a7300000-0000-0000-0000-0000000000b3';
select set_config('request.jwt.claims', '', true);
select test_as_tenant_reader('a7300000-0000-0000-0000-000000000001', 'a7300000-0000-0000-0000-0000000000b3');
do $$ begin
  if (select count(*) from public.workbook_sections) <> 0 then raise exception 'a hidden listing still opens sections'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 8. Revocation: a stopped or removed host ends the sessions created on it,
--    and only those; the hook then refuses a revoked session
-- ---------------------------------------------------------------------------
-- As the daily check runs: the service role through PostgREST.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into public.tenant_domains (host, tenant_id, verified_at) values
  ('books.a73.example', 'a7300000-0000-0000-0000-0000000000b1', now()),
  ('other.a73.example', 'a7300000-0000-0000-0000-0000000000b1', now());
do $$
declare n_audit bigint;
begin
  select count(*) into n_audit from public.audit_log where action = 'tenant_sessions.revoked';
  -- A change that keeps the host verified does nothing.
  update public.tenant_domains set last_checked_at = now(), consecutive_failures = 1 where host = 'books.a73.example';
  update public.tenant_domains set verified_at = now() where host = 'books.a73.example';
  if (select count(*) from public.tenant_session_scopes where revoked_at is null) <> 4 then raise exception 'a healthy host lost its sessions'; end if;

  -- Three strikes: verified_at cleared.
  update public.tenant_domains set verified_at = null, stopped_at = now() where host = 'books.a73.example';
  if exists (select 1 from auth.sessions where id = 'a7300000-0000-0000-0000-000000005e01') then raise exception 'the stopped host kept its session'; end if;
  if exists (select 1 from public.tenant_session_scopes where session_id = 'a7300000-0000-0000-0000-000000005e01') then raise exception 'the scope row outlived its session'; end if;
  if not exists (select 1 from auth.sessions where id = 'a7300000-0000-0000-0000-000000005e03') then raise exception 'a session on another host was ended'; end if;
  if not exists (select 1 from auth.sessions where id = 'a7300000-0000-0000-0000-000000005e02') then raise exception 'an unscoped session was ended'; end if;
  if (select count(*) from public.audit_log where action = 'tenant_sessions.revoked' and target = 'tenant_domain:books.a73.example' and reason = 'tenant host stopped') <> 1 then
    raise exception 'the revocation was not audited';
  end if;

  -- Removal.
  delete from public.tenant_domains where host = 'other.a73.example';
  if exists (select 1 from auth.sessions where id = 'a7300000-0000-0000-0000-000000005e03') then raise exception 'the removed host kept its session'; end if;
  if (select count(*) from public.audit_log where action = 'tenant_sessions.revoked') <> n_audit + 2 then raise exception 'expected two revocation audit rows'; end if;
  -- Removing a host with no sessions writes no audit row.
  delete from public.tenant_domains where host = 'books.a73.example';
  if (select count(*) from public.audit_log where action = 'tenant_sessions.revoked') <> n_audit + 2 then raise exception 'an empty revocation was audited'; end if;

  -- Whole tenant, by the service function. revoked_at alone stops the hook.
  perform public.register_tenant_session('a7300000-0000-0000-0000-000000005e02', 'a7300000-0000-0000-0000-000000000001', 'a7300000-0000-0000-0000-0000000000b2', 'books.b73.example');
  update public.tenant_session_scopes set revoked_at = now() where session_id = 'a7300000-0000-0000-0000-000000005e02';
end $$;
set local role supabase_auth_admin;
do $$
declare v_out jsonb;
begin
  v_out := public.akana_access_token_hook('{"claims":{"session_id":"a7300000-0000-0000-0000-000000005e02","role":"authenticated","sub":"a7300000-0000-0000-0000-000000000001"}}'::jsonb);
  if v_out ? 'claims' or (v_out #>> '{error,http_code}') <> '403' then raise exception 'a revoked session was issued a token: %', v_out; end if;
end $$;
reset role;
do $$ begin
  update public.tenant_session_scopes set revoked_at = null where session_id = 'a7300000-0000-0000-0000-000000005e02';
  if public.revoke_tenant_sessions('a7300000-0000-0000-0000-0000000000b2', 'flag switched off') <> 2 then raise exception 'expected two sessions revoked'; end if;
  if exists (select 1 from auth.sessions where id = 'a7300000-0000-0000-0000-000000005e02') then raise exception 'the tenant kept its session'; end if;
  if (select count(*) from public.audit_log where action = 'tenant_sessions.revoked' and target = 'tenant:a7300000-0000-0000-0000-0000000000b2') <> 1 then raise exception 'the tenant revocation was not audited'; end if;
  -- Deleting a user takes the scope row with it.
  insert into auth.sessions (id, user_id) values ('a7300000-0000-0000-0000-000000005e05', 'a7300000-0000-0000-0000-000000000002');
  perform public.register_tenant_session('a7300000-0000-0000-0000-000000005e05', 'a7300000-0000-0000-0000-000000000002', 'a7300000-0000-0000-0000-0000000000b1', 'books.a73.example');
  delete from auth.sessions where id = 'a7300000-0000-0000-0000-000000005e05';
  if exists (select 1 from public.tenant_session_scopes where session_id = 'a7300000-0000-0000-0000-000000005e05') then raise exception 'sign-out left a scope row'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 9. The owner's switch: owners only, audited, and off ends the sessions
-- ---------------------------------------------------------------------------
insert into auth.sessions (id, user_id) values ('a7300000-0000-0000-0000-000000005e06', 'a7300000-0000-0000-0000-000000000002');
select public.register_tenant_session('a7300000-0000-0000-0000-000000005e06', 'a7300000-0000-0000-0000-000000000002', 'a7300000-0000-0000-0000-0000000000b1', 'books.a73.example');
select set_config('akana.tenant_sign_in_switch', 'on', true);
delete from public.feature_flags where key = 'tenant_sign_in' and scope = 'tenant' and scope_id = 'a7300000-0000-0000-0000-0000000000b2';
select set_config('akana.tenant_sign_in_switch', '', true);

select set_config('request.jwt.claims', '', true);
select test_as('a7300000-0000-0000-0000-000000000003');
do $$ begin
  -- The tenant's own organisation owner is not a platform owner.
  begin perform public.set_tenant_sign_in('a7300000-0000-0000-0000-0000000000b1', false, 'x'); raise exception 'an organisation owner switched the flag'; exception when insufficient_privilege then null; end;
  -- Nor can they see who is signed in on their site.
  begin perform count(*) from public.tenant_session_scopes; raise exception 'an organisation owner read the scope table'; exception when insufficient_privilege then null; end;
  if (select count(*) from public.enrolments) <> 0 then raise exception 'an organisation owner sees reader enrolments'; end if;
  if (select count(*) from public.answers) <> 0 then raise exception 'an organisation owner sees reader answers'; end if;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
select test_as('a7300000-0000-0000-0000-000000000003', array['editor']);
do $$ begin
  begin perform public.set_tenant_sign_in('a7300000-0000-0000-0000-0000000000b1', false, 'x'); raise exception 'an editor switched the flag'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
select test_as('a7300000-0000-0000-0000-000000000003', array['owner']);
do $$ begin
  begin perform public.set_tenant_sign_in('00000000-0000-0000-0000-00000000000a', true, 'x'); raise exception 'the marketplace was switched on'; exception when no_data_found then null; end;
  -- On for tenant B, which had no row.
  perform public.set_tenant_sign_in('a7300000-0000-0000-0000-0000000000b2', true, 'pilot');
  if not public.tenant_sign_in_enabled('a7300000-0000-0000-0000-0000000000b2') then raise exception 'the switch did not turn sign-in on'; end if;
  -- Off for tenant A: the flag reads off and its scoped session is gone.
  perform public.set_tenant_sign_in('a7300000-0000-0000-0000-0000000000b1', false, 'pause');
  if public.tenant_sign_in_enabled('a7300000-0000-0000-0000-0000000000b1') then raise exception 'the switch did not turn sign-in off'; end if;
end $$;
reset role;
do $$ begin
  if exists (select 1 from auth.sessions where id = 'a7300000-0000-0000-0000-000000005e06') then raise exception 'switching off left a session'; end if;
  if (select count(*) from public.audit_log where action = 'flag.changed' and target = 'flag:tenant_sign_in'
        and actor = 'a7300000-0000-0000-0000-000000000003') <> 2 then raise exception 'the switch was not audited'; end if;
  if (select count(*) from public.audit_log where action = 'tenant_sessions.revoked' and reason = 'tenant sign-in switched off') <> 1 then
    raise exception 'the revocation on switch-off was not audited';
  end if;
  begin
    perform public.register_tenant_session('a7300000-0000-0000-0000-000000005e04', 'a7300000-0000-0000-0000-000000000002', 'a7300000-0000-0000-0000-0000000000b1', 'books.a73.example');
    raise exception 'a session was registered after the switch went off';
  exception when sqlstate 'AKS02' then null; end;
end $$;

-- ---------------------------------------------------------------------------
-- 10. Revocation reaches the database at once (RT-3). The auth.sessions row
--     may outlive a revocation in production; the scope row is then kept,
--     revoked, and a token issued before it reads and writes nothing.
--     Tenant B is on (block 9); reader 1 has enrolment f2 there.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '', true);
insert into auth.sessions (id, user_id) values
  ('a7300000-0000-0000-0000-000000005e10', 'a7300000-0000-0000-0000-000000000001'),
  ('a7300000-0000-0000-0000-000000005e11', 'a7300000-0000-0000-0000-000000000001'),
  ('a7300000-0000-0000-0000-000000005e12', 'a7300000-0000-0000-0000-000000000001');
select public.register_tenant_session('a7300000-0000-0000-0000-000000005e10', 'a7300000-0000-0000-0000-000000000001', 'a7300000-0000-0000-0000-0000000000b2', 'books.b73.example');
insert into public.tenant_browser_sessions (id_hash, tenant_id, user_id, session_id, sealed, expires_at) values
  (repeat('a', 64), 'a7300000-0000-0000-0000-0000000000b2', 'a7300000-0000-0000-0000-000000000001', 'a7300000-0000-0000-0000-000000005e10', 'v2.k.x', now() + interval '30 days');

select test_as_tenant_reader('a7300000-0000-0000-0000-000000000001', 'a7300000-0000-0000-0000-0000000000b2', 'a7300000-0000-0000-0000-000000005e10');
do $$ begin
  if (select count(*) from public.answers) <> 1 then raise exception 'a live session does not see its answer'; end if;
end $$;
reset role;
-- Revoked, and the auth.sessions row could not be deleted.
update public.tenant_session_scopes set revoked_at = now() where session_id = 'a7300000-0000-0000-0000-000000005e10';
select set_config('request.jwt.claims', '', true);
select test_as_tenant_reader('a7300000-0000-0000-0000-000000000001', 'a7300000-0000-0000-0000-0000000000b2', 'a7300000-0000-0000-0000-000000005e10');
do $$
declare n int;
begin
  select (select count(*) from public.enrolments) + (select count(*) from public.answers) + (select count(*) from public.progress_events) + (select count(*) from public.workbook_sections) into n;
  if n <> 0 then raise exception 'a revoked session still reads % rows', n; end if;
  begin
    insert into public.progress_events (enrolment_id, kind, ref) values ('a7300000-0000-0000-0000-0000000000f2', 'step_done', 'after-revoke');
    raise exception 'a revoked session still writes';
  exception when insufficient_privilege then null; end;
  begin perform public.tenant_reader_gates(); raise exception 'a revoked session still reads the gates'; exception when insufficient_privilege then null; end;
  begin perform public.tenant_reader_set_health_consent('health-2026-10'); raise exception 'a revoked session still writes consent'; exception when insufficient_privilege then null; end;
  begin perform public.tenant_reader_confirm_adult('reader-2026-10'); raise exception 'a revoked session still confirms'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.tenant_session_scopes set revoked_at = null where session_id = 'a7300000-0000-0000-0000-000000005e10';

-- ---------------------------------------------------------------------------
-- 11. A tenant that stops being active (RT-4). Each layer is shown alone
--     first, with the trigger held back; then the trigger itself.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
alter table public.tenants disable trigger tenants_revoke_sessions;
update public.tenants set status = 'suspended' where id = 'a7300000-0000-0000-0000-0000000000b2';
set local role supabase_auth_admin;
do $$
declare v_out jsonb;
begin
  v_out := public.akana_access_token_hook('{"claims":{"session_id":"a7300000-0000-0000-0000-000000005e10","role":"authenticated","sub":"a7300000-0000-0000-0000-000000000001"}}'::jsonb);
  if v_out ? 'claims' or (v_out #>> '{error,http_code}') <> '403' then raise exception 'the hook issued a token for a suspended tenant: %', v_out; end if;
  -- An ordinary session is still returned unchanged while a tenant is suspended.
  v_out := public.akana_access_token_hook('{"claims":{"session_id":"a7300000-0000-0000-0000-000000005e11","role":"authenticated"}}'::jsonb);
  if v_out #>> '{claims,role}' <> 'authenticated' or v_out ? 'error' then raise exception 'an ordinary session was changed: %', v_out; end if;
end $$;
reset role;
select test_as_tenant_reader('a7300000-0000-0000-0000-000000000001', 'a7300000-0000-0000-0000-0000000000b2', 'a7300000-0000-0000-0000-000000005e10');
do $$ begin
  if (select count(*) from public.answers) + (select count(*) from public.enrolments) <> 0 then raise exception 'a suspended tenant''s token still reads'; end if;
  begin insert into public.progress_events (enrolment_id, kind, ref) values ('a7300000-0000-0000-0000-0000000000f2', 'step_done', 'suspended'); raise exception 'a suspended tenant''s token still writes';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.tenants set status = 'active' where id = 'a7300000-0000-0000-0000-0000000000b2';
alter table public.tenants enable trigger tenants_revoke_sessions;
do $$
declare n bigint;
begin
  select count(*) into n from public.audit_log where action = 'tenant_sessions.revoked' and reason = 'tenant suspended';
  -- A change that keeps the tenant active does nothing.
  update public.tenants set name = 'Org 73B Books Ltd' where id = 'a7300000-0000-0000-0000-0000000000b2';
  update public.tenants set status = 'active' where id = 'a7300000-0000-0000-0000-0000000000b2';
  if not exists (select 1 from auth.sessions where id = 'a7300000-0000-0000-0000-000000005e10') then raise exception 'an active tenant lost a session'; end if;
  update public.tenants set status = 'suspended' where id = 'a7300000-0000-0000-0000-0000000000b2';
  if exists (select 1 from auth.sessions where id = 'a7300000-0000-0000-0000-000000005e10') then raise exception 'a suspended tenant kept its session'; end if;
  if exists (select 1 from public.tenant_browser_sessions where id_hash = repeat('a', 64)) then raise exception 'the browser session outlived its Supabase session'; end if;
  if (select count(*) from public.audit_log where action = 'tenant_sessions.revoked' and reason = 'tenant suspended') <> n + 1 then raise exception 'suspension was not audited'; end if;
  if public.tenant_sign_in_enabled('a7300000-0000-0000-0000-0000000000b2') then raise exception 'the flag reads on for a suspended tenant'; end if;
  begin
    perform public.register_tenant_session('a7300000-0000-0000-0000-000000005e11', 'a7300000-0000-0000-0000-000000000001', 'a7300000-0000-0000-0000-0000000000b2', 'books.b73.example');
    raise exception 'a session was registered on a suspended tenant';
  exception when sqlstate 'AKS01' then null; end;
  update public.tenants set status = 'active' where id = 'a7300000-0000-0000-0000-0000000000b2';
end $$;

-- ---------------------------------------------------------------------------
-- 12. The flag changes only through set_tenant_sign_in (RT-4). A safety
--     reviewer, an owner and the service role are all refused a direct
--     write, in either direction, and the global row cannot be turned on.
--     With the flag off, the hook and the claim readers refuse on their own.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '', true);
select test_as('a7300000-0000-0000-0000-000000000003', array['safety_reviewer']);
do $$ begin
  begin update public.feature_flags set enabled = false where key = 'tenant_sign_in'; raise exception 'a safety reviewer switched the flag off directly'; exception when insufficient_privilege then null; end;
  begin insert into public.feature_flags (key, scope, scope_id, enabled, reason) values ('tenant_sign_in', 'tenant', 'a7300000-0000-0000-0000-0000000000b3', false, 'rt'); raise exception 'a safety reviewer wrote the flag directly';
  exception when insufficient_privilege then null; when unique_violation then raise exception 'the guard let the write reach the table'; end;
  begin delete from public.feature_flags where key = 'tenant_sign_in'; raise exception 'a safety reviewer deleted the flag'; exception when insufficient_privilege then null; end;
  begin update public.feature_flags set key = 'tenant_sign_in' where key = 'web_push'; raise exception 'another row was renamed to the flag'; exception when insufficient_privilege then null; end;
  -- Other flags are untouched by the guard.
  update public.feature_flags set reason = reason where key = 'demo_visible';
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
select test_as('a7300000-0000-0000-0000-000000000003', array['owner']);
do $$ begin
  begin update public.feature_flags set enabled = true where key = 'tenant_sign_in' and scope = 'global'; raise exception 'an owner switched the global flag on directly'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
do $$ begin
  begin update public.feature_flags set enabled = true where key = 'tenant_sign_in'; raise exception 'the service role wrote the flag directly'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  if (select enabled from public.feature_flags where key = 'tenant_sign_in' and scope = 'global') then raise exception 'the global flag is on'; end if;
end $$;
-- Flag off for tenant B without the function, to show the layers alone.
select public.register_tenant_session('a7300000-0000-0000-0000-000000005e11', 'a7300000-0000-0000-0000-000000000001', 'a7300000-0000-0000-0000-0000000000b2', 'books.b73.example');
select set_config('akana.tenant_sign_in_switch', 'on', true);
update public.feature_flags set enabled = false where key = 'tenant_sign_in' and scope = 'tenant' and scope_id = 'a7300000-0000-0000-0000-0000000000b2';
select set_config('akana.tenant_sign_in_switch', '', true);
set local role supabase_auth_admin;
do $$
declare v_out jsonb;
begin
  v_out := public.akana_access_token_hook('{"claims":{"session_id":"a7300000-0000-0000-0000-000000005e11","role":"authenticated"}}'::jsonb);
  if v_out ? 'claims' or not v_out ? 'error' then raise exception 'the hook issued a token with the flag off: %', v_out; end if;
end $$;
reset role;
select test_as_tenant_reader('a7300000-0000-0000-0000-000000000001', 'a7300000-0000-0000-0000-0000000000b2', 'a7300000-0000-0000-0000-000000005e11');
do $$ begin
  if (select count(*) from public.answers) + (select count(*) from public.enrolments) <> 0 then raise exception 'a token still reads with the flag off'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 13. Akana's sign-in code: bound to one tenant and one address, ten
--     minutes, single use, dead after five wrong tries. Service role only.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('akana.tenant_sign_in_switch', 'on', true);
update public.feature_flags set enabled = true where key = 'tenant_sign_in' and scope = 'tenant' and scope_id in ('a7300000-0000-0000-0000-0000000000b1', 'a7300000-0000-0000-0000-0000000000b2');
select set_config('akana.tenant_sign_in_switch', '', true);
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'tenant_reader'] loop
    if has_function_privilege(r, 'public.issue_tenant_sign_in_code(uuid,text,text,integer)', 'execute')
       or has_function_privilege(r, 'public.check_tenant_sign_in_code(uuid,text,text)', 'execute')
       or has_table_privilege(r, 'public.tenant_sign_in_codes', 'select')
       or has_table_privilege(r, 'public.tenant_browser_sessions', 'select')
       or has_table_privilege(r, 'public.tenant_browser_sessions', 'update') then
      raise exception '% can reach the sign-in codes or the session store', r;
    end if;
  end loop;
  if not (select relrowsecurity from pg_class where oid = 'public.tenant_sign_in_codes'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.tenant_browser_sessions'::regclass) then
    raise exception 'a new table has no row level security';
  end if;

  perform public.issue_tenant_sign_in_code('a7300000-0000-0000-0000-0000000000b1', ' Reader@Example.com ', repeat('1', 64));
  -- The code of tenant A is nothing on tenant B, and nothing for another address.
  if public.check_tenant_sign_in_code('a7300000-0000-0000-0000-0000000000b2', 'reader@example.com', repeat('1', 64)) then raise exception 'a code for tenant A opened tenant B'; end if;
  if public.check_tenant_sign_in_code('a7300000-0000-0000-0000-0000000000b1', 'other@example.com', repeat('1', 64)) then raise exception 'a code opened another address'; end if;
  -- Neither of those counted against the real row.
  if (select attempts from public.tenant_sign_in_codes where tenant_id = 'a7300000-0000-0000-0000-0000000000b1') <> 0 then raise exception 'a miss elsewhere was counted here'; end if;
  -- Right code: once.
  if not public.check_tenant_sign_in_code('a7300000-0000-0000-0000-0000000000b1', 'READER@example.com', repeat('1', 64)) then raise exception 'the right code was refused'; end if;
  if public.check_tenant_sign_in_code('a7300000-0000-0000-0000-0000000000b1', 'reader@example.com', repeat('1', 64)) then raise exception 'a code was used twice'; end if;

  -- Five wrong tries kill it; the right code is then refused too.
  perform public.issue_tenant_sign_in_code('a7300000-0000-0000-0000-0000000000b1', 'reader@example.com', repeat('2', 64));
  for i in 1..5 loop
    if public.check_tenant_sign_in_code('a7300000-0000-0000-0000-0000000000b1', 'reader@example.com', repeat('f', 64)) then raise exception 'a wrong code was accepted'; end if;
  end loop;
  if public.check_tenant_sign_in_code('a7300000-0000-0000-0000-0000000000b1', 'reader@example.com', repeat('2', 64)) then raise exception 'the code survived five wrong tries'; end if;

  -- Four wrong tries leave it alive. Asking again replaces the code and the old one is dead.
  perform public.issue_tenant_sign_in_code('a7300000-0000-0000-0000-0000000000b1', 'reader@example.com', repeat('3', 64));
  for i in 1..4 loop perform public.check_tenant_sign_in_code('a7300000-0000-0000-0000-0000000000b1', 'reader@example.com', repeat('f', 64)); end loop;
  perform public.issue_tenant_sign_in_code('a7300000-0000-0000-0000-0000000000b1', 'reader@example.com', repeat('4', 64));
  if public.check_tenant_sign_in_code('a7300000-0000-0000-0000-0000000000b1', 'reader@example.com', repeat('3', 64)) then raise exception 'a replaced code still worked'; end if;
  if not public.check_tenant_sign_in_code('a7300000-0000-0000-0000-0000000000b1', 'reader@example.com', repeat('4', 64)) then raise exception 'the new code was refused'; end if;

  -- Expired.
  perform public.issue_tenant_sign_in_code('a7300000-0000-0000-0000-0000000000b1', 'reader@example.com', repeat('5', 64));
  update public.tenant_sign_in_codes set expires_at = now() - interval '1 second' where tenant_id = 'a7300000-0000-0000-0000-0000000000b1';
  if public.check_tenant_sign_in_code('a7300000-0000-0000-0000-0000000000b1', 'reader@example.com', repeat('5', 64)) then raise exception 'an expired code worked'; end if;
  if (select expires_at - created_at from public.tenant_sign_in_codes where tenant_id = 'a7300000-0000-0000-0000-0000000000b1') > interval '10 minutes' then raise exception 'a code lives longer than ten minutes'; end if;

  -- Not for the marketplace, not with a silly lifetime, not with the flag off, and nothing unknown checks out.
  begin perform public.issue_tenant_sign_in_code('00000000-0000-0000-0000-00000000000a', 'reader@example.com', repeat('6', 64)); raise exception 'a code was issued for the marketplace'; exception when sqlstate 'AKS02' then null; end;
  begin perform public.issue_tenant_sign_in_code('a7300000-0000-0000-0000-0000000000b1', 'reader@example.com', repeat('6', 64), 86400); raise exception 'a day-long code was issued'; exception when sqlstate 'AKS03' then null; end;
  begin perform public.issue_tenant_sign_in_code('a7300000-0000-0000-0000-0000000000b1', 'reader@example.com', 'plain-code'); raise exception 'an unhashed code was stored'; exception when check_violation then null; end;
  if public.check_tenant_sign_in_code('a7300000-0000-0000-0000-0000000000b1', 'nobody@example.com', repeat('6', 64)) then raise exception 'an unknown address checked out'; end if;
  if public.check_tenant_sign_in_code(null, null, null) then raise exception 'nulls checked out'; end if;
end $$;
select set_config('request.jwt.claims', '', true);
select test_as('a7300000-0000-0000-0000-000000000001');
do $$ begin
  begin perform public.issue_tenant_sign_in_code('a7300000-0000-0000-0000-0000000000b1', 'reader@example.com', repeat('7', 64)); raise exception 'a reader issued a code'; exception when insufficient_privilege then null; end;
  begin perform public.check_tenant_sign_in_code('a7300000-0000-0000-0000-0000000000b1', 'reader@example.com', repeat('7', 64)); raise exception 'a reader checked a code'; exception when insufficient_privilege then null; end;
  begin perform count(*) from public.tenant_sign_in_codes; raise exception 'a reader read the codes'; exception when insufficient_privilege then null; end;
  begin perform count(*) from public.tenant_browser_sessions; raise exception 'a reader read the session store'; exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 14. The session store: revoking a tenant's sessions kills its browser ids
--     even when the Supabase session cannot be deleted, and one Supabase
--     session has one browser id.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select public.register_tenant_session('a7300000-0000-0000-0000-000000005e12', 'a7300000-0000-0000-0000-000000000001', 'a7300000-0000-0000-0000-0000000000b1', 'books.a73.example');
insert into public.tenant_browser_sessions (id_hash, tenant_id, user_id, session_id, sealed, expires_at) values
  (repeat('b', 64), 'a7300000-0000-0000-0000-0000000000b1', 'a7300000-0000-0000-0000-000000000001', 'a7300000-0000-0000-0000-000000005e12', 'v2.k.x', now() + interval '30 days');
do $$ begin
  begin
    insert into public.tenant_browser_sessions (id_hash, tenant_id, user_id, session_id, sealed, expires_at) values
      (repeat('c', 64), 'a7300000-0000-0000-0000-0000000000b1', 'a7300000-0000-0000-0000-000000000001', 'a7300000-0000-0000-0000-000000005e12', 'v2.k.x', now() + interval '30 days');
    raise exception 'one session got two browser ids';
  exception when unique_violation then null; end;
  begin
    insert into public.tenant_browser_sessions (id_hash, tenant_id, user_id, session_id, sealed, expires_at) values
      (repeat('d', 64), 'a7300000-0000-0000-0000-0000000000b1', 'a7300000-0000-0000-0000-000000000001', 'a7300000-0000-0000-0000-00000000ffff', 'v2.k.x', now() + interval '30 days');
    raise exception 'a browser id was stored for a session with no scope';
  exception when foreign_key_violation then null; end;
end $$;
-- Make the delete of auth.sessions fail, as it might in production.
create function pg_temp.refuse_delete() returns trigger language plpgsql as $$ begin raise exception 'not permitted' using errcode = 'insufficient_privilege'; end $$;
create trigger refuse_delete before delete on auth.sessions for each row execute function pg_temp.refuse_delete();
do $$ begin
  if public.revoke_tenant_sessions('a7300000-0000-0000-0000-0000000000b1', 'incident') <> 1 then raise exception 'expected one session revoked'; end if;
  if not exists (select 1 from auth.sessions where id = 'a7300000-0000-0000-0000-000000005e12') then raise exception 'the stand-in for a refused delete did not hold'; end if;
  if (select revoked_at from public.tenant_session_scopes where session_id = 'a7300000-0000-0000-0000-000000005e12') is null then raise exception 'the scope row was not kept revoked'; end if;
  if (select revoked_at from public.tenant_browser_sessions where id_hash = repeat('b', 64)) is null then raise exception 'the browser id was not revoked'; end if;
  if (select (after ->> 'sessions_deleted') from public.audit_log where action = 'tenant_sessions.revoked' and reason = 'incident') <> 'false' then raise exception 'the audit row does not say the delete failed'; end if;
end $$;
drop trigger refuse_delete on auth.sessions;

-- ---------------------------------------------------------------------------
-- 15. The second red team pass (R2-1 to R2-7). Two fresh readers, so nothing
--     above is leaned on: reader 5 and reader 6, each signed in on tenant A.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '', true);
insert into auth.users (id, email) values ('a7300000-0000-0000-0000-000000000005', 'reader73e@test'), ('a7300000-0000-0000-0000-000000000006', 'reader73f@test');
insert into public.profiles (user_id) values ('a7300000-0000-0000-0000-000000000005'), ('a7300000-0000-0000-0000-000000000006') on conflict (user_id) do nothing;
update public.tenants set status = 'active' where id in ('a7300000-0000-0000-0000-0000000000b1', 'a7300000-0000-0000-0000-0000000000b2');
select set_config('akana.tenant_sign_in_switch', 'on', true);
insert into public.feature_flags (key, scope, scope_id, enabled, reason) values
  ('tenant_sign_in', 'tenant', 'a7300000-0000-0000-0000-0000000000b1', true, 'test'),
  ('tenant_sign_in', 'tenant', 'a7300000-0000-0000-0000-0000000000b2', true, 'test')
on conflict (key, scope, scope_id) do update set enabled = true;
select set_config('akana.tenant_sign_in_switch', '', true);
insert into auth.sessions (id, user_id) values
  ('a7300000-0000-0000-0000-000000005e21', 'a7300000-0000-0000-0000-000000000005'),
  ('a7300000-0000-0000-0000-000000005e22', 'a7300000-0000-0000-0000-000000000006'),
  ('a7300000-0000-0000-0000-000000005e23', 'a7300000-0000-0000-0000-000000000005'),
  ('a7300000-0000-0000-0000-000000005e24', 'a7300000-0000-0000-0000-000000000005');
select public.register_tenant_session('a7300000-0000-0000-0000-000000005e21', 'a7300000-0000-0000-0000-000000000005', 'a7300000-0000-0000-0000-0000000000b1', 'books.a73.example');
select public.register_tenant_session('a7300000-0000-0000-0000-000000005e22', 'a7300000-0000-0000-0000-000000000006', 'a7300000-0000-0000-0000-0000000000b1', 'books.a73.example');
-- Reader 5: tenant A and marketplace enrolments on the same title. Reader 6: tenant A.
insert into public.enrolments (id, user_id, tenant_id, workbook_id, version_id) values
  ('a7300000-0000-0000-0000-0000000000f5', 'a7300000-0000-0000-0000-000000000005', 'a7300000-0000-0000-0000-0000000000b1', 'a7300000-0000-0000-0000-0000000000d1', 'a7300000-0000-0000-0000-0000000000e1'),
  ('a7300000-0000-0000-0000-0000000000f6', 'a7300000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000a', 'a7300000-0000-0000-0000-0000000000d1', 'a7300000-0000-0000-0000-0000000000e1'),
  ('a7300000-0000-0000-0000-0000000000f7', 'a7300000-0000-0000-0000-000000000006', 'a7300000-0000-0000-0000-0000000000b1', 'a7300000-0000-0000-0000-0000000000d1', 'a7300000-0000-0000-0000-0000000000e1');

-- R2-1. Health consent from a tenant session: once, and never after a withdrawal.
select set_config('request.jwt.claims', '', true);
select test_as_tenant_reader('a7300000-0000-0000-0000-000000000005', 'a7300000-0000-0000-0000-0000000000b1');
do $$ begin
  perform public.tenant_reader_confirm_adult('reader-2026-10');
  perform public.tenant_reader_set_health_consent('health-2026-10');
  if not (select health_consent from public.tenant_reader_gates()) then raise exception 'a first consent was not recorded'; end if;
  begin perform count(*) from public.health_consent_withdrawals; raise exception 'a tenant session read the withdrawals'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  if exists (select 1 from public.health_consent_withdrawals) then raise exception 'a withdrawal is on record before any was made'; end if;
end $$;
-- The reader withdraws on the Akana site, through the ordinary path (0006).
select set_config('request.jwt.claims', '', true);
select test_as('a7300000-0000-0000-0000-000000000005');
select public.clear_health_consent();
do $$ begin
  begin perform count(*) from public.health_consent_withdrawals; raise exception 'a reader read the withdrawals'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;
do $$ begin
  begin perform count(*) from public.health_consent_withdrawals; raise exception 'anon read the withdrawals'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.health_consent_withdrawals where user_id = 'a7300000-0000-0000-0000-000000000005') <> 1 then raise exception 'the withdrawal was not recorded'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.health_consent_withdrawals'::regclass) then raise exception 'health_consent_withdrawals has no row level security'; end if;
end $$;
select set_config('request.jwt.claims', '', true);
select test_as_tenant_reader('a7300000-0000-0000-0000-000000000005', 'a7300000-0000-0000-0000-0000000000b1');
do $$ begin
  if (select health_consent from public.tenant_reader_gates()) then raise exception 'the gates still show a withdrawn consent'; end if;
  begin perform public.tenant_reader_set_health_consent('health-2026-10'); raise exception 'a tenant session gave a withdrawn consent again';
  exception when sqlstate 'AKH09' then null; end;
end $$;
reset role;
do $$ begin
  if (select health_consent_at from public.profiles where user_id = 'a7300000-0000-0000-0000-000000000005') is not null then raise exception 'the refused call still wrote consent'; end if;
end $$;
-- Giving it again is for the Akana site. That works, and the withdrawal stays
-- on record: when the wording next changes, the tenant session is still refused.
select set_config('request.jwt.claims', '', true);
select test_as('a7300000-0000-0000-0000-000000000005');
select public.set_health_consent('health-2026-10');
reset role;
update public.profiles set health_consent_version = 'health-2020-01' where user_id = 'a7300000-0000-0000-0000-000000000005';
select set_config('request.jwt.claims', '', true);
select test_as_tenant_reader('a7300000-0000-0000-0000-000000000005', 'a7300000-0000-0000-0000-0000000000b1');
do $$ begin
  begin perform public.tenant_reader_set_health_consent('health-2026-10'); raise exception 'a tenant session renewed consent for an account that once withdrew';
  exception when sqlstate 'AKH09' then null; end;
end $$;
reset role;
do $$ begin
  if (select health_consent_version from public.profiles where user_id = 'a7300000-0000-0000-0000-000000000005') <> 'health-2020-01' then raise exception 'the refused renewal still wrote'; end if;
end $$;

-- R2-2. A step done on a tenant enrolment leaves a marketplace pairing alone.
-- The same step on the marketplace enrolment marks it, as before.
insert into public.programme_pairs (id, workbook_id, tenant_id, inviter_id, friend_id, friend_label, status, accepted_at) values
  ('a7300000-0000-0000-0000-00000000aa15', 'a7300000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000000a', 'a7300000-0000-0000-0000-000000000005', 'a7300000-0000-0000-0000-000000000006', 'Friend', 'active', now());
select set_config('request.jwt.claims', '', true);
select test_as_tenant_reader('a7300000-0000-0000-0000-000000000005', 'a7300000-0000-0000-0000-0000000000b1');
insert into public.progress_events (enrolment_id, kind, ref) values ('a7300000-0000-0000-0000-0000000000f5', 'step_done', 'r2-2-tenant');
reset role;
do $$ begin
  if exists (select 1 from public.pair_finishes where pair_id = 'a7300000-0000-0000-0000-00000000aa15') then
    raise exception 'a tenant step wrote a marketplace pair finish';
  end if;
end $$;
select set_config('request.jwt.claims', '', true);
select test_as('a7300000-0000-0000-0000-000000000005');
insert into public.progress_events (enrolment_id, kind, ref) values ('a7300000-0000-0000-0000-0000000000f6', 'step_done', 'r2-2-market');
reset role;
do $$ begin
  if (select count(*) from public.pair_finishes where pair_id = 'a7300000-0000-0000-0000-00000000aa15' and user_id = 'a7300000-0000-0000-0000-000000000005') <> 1 then
    raise exception 'a marketplace step no longer marks the marketplace pairing';
  end if;
end $$;

-- R2-6. The gates say only what the site can act on: four booleans, no faith
-- consent, and a pending deletion as can_write alone.
update public.profiles set faith_consent_at = now(), faith_consent_version = 'faith-2026-10' where user_id = 'a7300000-0000-0000-0000-000000000006';
insert into public.account_deletion_requests (user_id, cancel_before) values ('a7300000-0000-0000-0000-000000000006', now() + interval '7 days');
do $$ begin
  if (select proargnames from pg_proc where oid = 'public.tenant_reader_gates()'::regprocedure)
       is distinct from array['adult_confirmed', 'terms_accepted', 'health_consent', 'can_write'] then
    raise exception 'tenant_reader_gates returns other columns';
  end if;
end $$;
select set_config('request.jwt.claims', '', true);
select test_as_tenant_reader('a7300000-0000-0000-0000-000000000006', 'a7300000-0000-0000-0000-0000000000b1');
do $$
declare j jsonb;
begin
  select to_jsonb(g) into j from public.tenant_reader_gates() g;
  if j is distinct from '{"adult_confirmed": false, "terms_accepted": false, "health_consent": false, "can_write": false}'::jsonb then
    raise exception 'the gates said: %', j;
  end if;
  if tenant_scope.can_write() then raise exception 'can_write is true while a deletion is pending'; end if;

  -- R2-3. Read only means read only on a tenant host too.
  begin perform public.tenant_reader_confirm_adult('reader-2026-10'); raise exception 'adult confirmed while read only'; exception when sqlstate 'AKR01' then null; end;
  begin perform public.tenant_reader_accept_terms('reader-2026-10'); raise exception 'terms accepted while read only'; exception when sqlstate 'AKR01' then null; end;
  begin perform public.tenant_reader_set_health_consent('health-2026-10'); raise exception 'consent given while read only'; exception when sqlstate 'AKR01' then null; end;
  begin
    insert into public.enrolments (user_id, tenant_id, workbook_id, version_id) values
      ('a7300000-0000-0000-0000-000000000006', 'a7300000-0000-0000-0000-0000000000b1', 'a7300000-0000-0000-0000-0000000000d1', 'a7300000-0000-0000-0000-0000000000e1');
    raise exception 'an enrolment was started while read only';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.progress_events (enrolment_id, kind, ref) values ('a7300000-0000-0000-0000-0000000000f7', 'unit_opened', 'r2-3');
    raise exception 'progress was recorded while read only';
  exception when insufficient_privilege or sqlstate 'AKR01' then null; end;
  -- Reading still works.
  if (select count(*) from public.enrolments) <> 1 then raise exception 'a read only reader cannot read their enrolment'; end if;
end $$;
reset role;
do $$ begin
  if (select adult_confirmed_at is not null or health_consent_at is not null from public.profiles where user_id = 'a7300000-0000-0000-0000-000000000006')
     or exists (select 1 from public.terms_acceptances where user_id = 'a7300000-0000-0000-0000-000000000006') then
    raise exception 'a refused call wrote to a read only account';
  end if;
end $$;
-- The progress policy holds by itself, without the 0026 trigger.
alter table public.progress_events disable trigger progress_events_read_only;
select set_config('request.jwt.claims', '', true);
select test_as_tenant_reader('a7300000-0000-0000-0000-000000000006', 'a7300000-0000-0000-0000-0000000000b1');
do $$ begin
  begin
    insert into public.progress_events (enrolment_id, kind, ref) values ('a7300000-0000-0000-0000-0000000000f7', 'unit_opened', 'r2-3');
    raise exception 'the progress policy let a read only write through';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
alter table public.progress_events enable trigger progress_events_read_only;
-- The deletion is cancelled: the same session can write again.
update public.account_deletion_requests set cancelled_at = now() where user_id = 'a7300000-0000-0000-0000-000000000006';
select set_config('request.jwt.claims', '', true);
select test_as_tenant_reader('a7300000-0000-0000-0000-000000000006', 'a7300000-0000-0000-0000-0000000000b1');
do $$ begin
  if not (select can_write from public.tenant_reader_gates()) then raise exception 'can_write is false with no deletion pending'; end if;
  perform public.tenant_reader_confirm_adult('reader-2026-10');
  insert into public.progress_events (enrolment_id, kind, ref) values ('a7300000-0000-0000-0000-0000000000f7', 'unit_opened', 'r2-3');
end $$;
reset role;

-- R2-4. The switch needs a second factor and a reason.
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.sub', 'a7300000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims', jsonb_build_object('sub', 'a7300000-0000-0000-0000-000000000003', 'role', 'authenticated', 'aal', 'aal1', 'amr', '[]'::jsonb,
  'app_metadata', jsonb_build_object('platform_roles', '["owner"]'::jsonb))::text, true);
set local role authenticated;
do $$ begin
  begin perform public.set_tenant_sign_in('a7300000-0000-0000-0000-0000000000b2', false, 'no second factor'); raise exception 'an owner at aal1 used the switch'; exception when sqlstate 'AKM01' then null; end;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
select test_as('a7300000-0000-0000-0000-000000000003', array['owner']);
do $$ begin
  begin perform public.set_tenant_sign_in('a7300000-0000-0000-0000-0000000000b2', false, null); raise exception 'the switch took a null reason'; exception when check_violation then null; end;
  begin perform public.set_tenant_sign_in('a7300000-0000-0000-0000-0000000000b2', false, '   '); raise exception 'the switch took a blank reason'; exception when check_violation then null; end;
  if not public.tenant_sign_in_enabled('a7300000-0000-0000-0000-0000000000b2') then raise exception 'a refused call changed the flag'; end if;
end $$;
reset role;

-- R2-5. Five codes an hour for one tenant and address, counted in the database.
select set_config('request.jwt.claims', '', true);
do $$ begin
  for i in 1..5 loop
    if not public.issue_tenant_sign_in_code('a7300000-0000-0000-0000-0000000000b1', 'limit@example.com', repeat(i::text, 64)) then raise exception 'code % was refused', i; end if;
  end loop;
  if public.issue_tenant_sign_in_code('a7300000-0000-0000-0000-0000000000b1', ' Limit@Example.com', repeat('6', 64)) then raise exception 'a sixth code was issued within the hour'; end if;
  if public.issue_tenant_sign_in_code('a7300000-0000-0000-0000-0000000000b1', 'limit@example.com', repeat('7', 64)) then raise exception 'a seventh code was issued within the hour'; end if;
  -- The refusal wrote nothing: the fifth code is still the live one.
  if (select code_hash from public.tenant_sign_in_codes where tenant_id = 'a7300000-0000-0000-0000-0000000000b1' and email = 'limit@example.com') <> repeat('5', 64) then
    raise exception 'a refused request replaced the live code';
  end if;
  -- Per tenant and per address: another address, and the same address on tenant B, are not affected.
  if not public.issue_tenant_sign_in_code('a7300000-0000-0000-0000-0000000000b1', 'other-limit@example.com', repeat('8', 64)) then raise exception 'another address was limited'; end if;
  if not public.issue_tenant_sign_in_code('a7300000-0000-0000-0000-0000000000b2', 'limit@example.com', repeat('8', 64)) then raise exception 'another tenant was limited'; end if;
  -- An hour later the count starts again.
  update public.tenant_sign_in_codes set window_started_at = now() - interval '61 minutes' where tenant_id = 'a7300000-0000-0000-0000-0000000000b1' and email = 'limit@example.com';
  if not public.issue_tenant_sign_in_code('a7300000-0000-0000-0000-0000000000b1', 'limit@example.com', repeat('9', 64)) then raise exception 'a code was refused after the hour'; end if;
  if (select issued_in_window from public.tenant_sign_in_codes where tenant_id = 'a7300000-0000-0000-0000-0000000000b1' and email = 'limit@example.com') <> 1 then raise exception 'the count did not start again'; end if;
end $$;

-- R2-7. An account with a verified second factor holds no tenant session.
-- An unverified factor changes nothing.
insert into auth.mfa_factors (id, user_id, status) values ('a7300000-0000-0000-0000-00000000fa01', 'a7300000-0000-0000-0000-000000000005', 'unverified');
select set_config('request.jwt.claims', '', true);
set local role supabase_auth_admin;
do $$
declare v_out jsonb;
begin
  v_out := public.akana_access_token_hook('{"claims":{"session_id":"a7300000-0000-0000-0000-000000005e21","role":"authenticated","sub":"a7300000-0000-0000-0000-000000000005"}}'::jsonb);
  if v_out #>> '{claims,role}' is distinct from 'tenant_reader' then raise exception 'an unverified factor ended the session: %', v_out; end if;
end $$;
reset role;
update auth.mfa_factors set status = 'verified' where id = 'a7300000-0000-0000-0000-00000000fa01';
select set_config('request.jwt.claims', '', true);
set local role supabase_auth_admin;
do $$
declare
  v_scoped   jsonb := '{"claims":{"session_id":"a7300000-0000-0000-0000-000000005e21","role":"authenticated","sub":"a7300000-0000-0000-0000-000000000005"}}';
  v_unscoped jsonb := '{"claims":{"session_id":"a7300000-0000-0000-0000-000000005e24","role":"authenticated","aal":"aal2","sub":"a7300000-0000-0000-0000-000000000005"}}';
  v_out jsonb;
begin
  v_out := public.akana_access_token_hook(v_scoped);
  if v_out ? 'claims' or v_out #>> '{error,http_code}' is distinct from '403' then raise exception 'a scoped session of a two-step account got a token: %', v_out; end if;
  -- The same account's ordinary session on the Akana site is returned exactly as it came.
  if public.akana_access_token_hook(v_unscoped) is distinct from v_unscoped then raise exception 'an unscoped session of a two-step account was changed'; end if;
  -- Another reader's scoped session is not affected.
  v_out := public.akana_access_token_hook('{"claims":{"session_id":"a7300000-0000-0000-0000-000000005e22","role":"authenticated"}}'::jsonb);
  if v_out #>> '{claims,role}' is distinct from 'tenant_reader' then raise exception 'another reader lost their session: %', v_out; end if;
end $$;
reset role;
do $$ begin
  begin
    perform public.register_tenant_session('a7300000-0000-0000-0000-000000005e23', 'a7300000-0000-0000-0000-000000000005', 'a7300000-0000-0000-0000-0000000000b1', 'books.a73.example');
    raise exception 'a session was registered for an account with a verified second factor';
  exception when sqlstate 'AKS10' then null; end;
end $$;
-- The hook stays total for unscoped sessions: it does not read the factor
-- table for them. With that table unreadable, an unscoped session still comes
-- back unchanged, and a scoped one gets no token at all.
revoke select on auth.mfa_factors from supabase_auth_admin;
select set_config('request.jwt.claims', '', true);
set local role supabase_auth_admin;
do $$
declare
  v_unscoped jsonb := '{"claims":{"session_id":"a7300000-0000-0000-0000-000000005e24","role":"authenticated","sub":"a7300000-0000-0000-0000-000000000005"}}';
begin
  if public.akana_access_token_hook(v_unscoped) is distinct from v_unscoped then raise exception 'an unscoped session needed the factor table'; end if;
  begin
    perform public.akana_access_token_hook('{"claims":{"session_id":"a7300000-0000-0000-0000-000000005e22","role":"authenticated"}}'::jsonb);
    raise exception 'a scoped session got an answer with the factor table unreadable';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
grant select on auth.mfa_factors to supabase_auth_admin;

rollback;
