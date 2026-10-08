-- Custom domains (0033): host rules, staff-only add and remove, the check
-- recorder with three strikes, the inconclusive result, the cron's list and
-- audit rows. Each block must raise or return the expected value; a failure
-- aborts the script and the CI step.
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('a3300000-0000-0000-0000-000000000001', 'editor33@test'),
  ('a3300000-0000-0000-0000-000000000002', 'support33@test'),
  ('a3300000-0000-0000-0000-000000000003', 'orgowner33@test');
insert into public.platform_roles (user_id, role) values
  ('a3300000-0000-0000-0000-000000000001', 'editor'),
  ('a3300000-0000-0000-0000-000000000002', 'support');

insert into public.organisations (id, code, kind, legal_name, display_name, slug, country) values
  ('a3300000-0000-0000-0000-0000000000a1', 'PB-TD001', 'publisher', 'Org D Ltd', 'Org D', 'org-d', 'GB');
insert into public.org_members (org_id, user_id, role) values
  ('a3300000-0000-0000-0000-0000000000a1', 'a3300000-0000-0000-0000-000000000003', 'owner');
insert into public.tenants (id, slug, kind, org_id, name, plan) values
  ('a3300000-0000-0000-0000-0000000000b1', 'org-d', 'white_label', 'a3300000-0000-0000-0000-0000000000a1', 'Org D Books', 'pro');
insert into public.tenants (id, slug, kind, org_id, name, plan, is_demo) values
  ('a3300000-0000-0000-0000-0000000000b2', 'demo-d', 'white_label', null, 'Demo D', 'pro', true);

create or replace function pg_temp.as_anon() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "anon"}'::text, true);
  execute 'set local role anon';
end $$;

-- ---------------------------------------------------------------------------
-- 1. Host rules.
-- ---------------------------------------------------------------------------
do $$ begin
  if app.tenant_host_problem('books.example.co.uk') is not null then raise exception 'a normal host should pass'; end if;
  if app.tenant_host_problem('xn--bcher-kva.com') is not null then raise exception 'punycode should pass'; end if;
  if app.tenant_host_problem('localhost') <> 'invalid' then raise exception 'a single label is invalid'; end if;
  if app.tenant_host_problem('Books.Example.com') <> 'invalid' then raise exception 'upper case is invalid (normalise first)'; end if;
  if app.tenant_host_problem('-bad.example.com') <> 'invalid' then raise exception 'leading hyphen is invalid'; end if;
  if app.tenant_host_problem('a..b.com') <> 'invalid' then raise exception 'empty label is invalid'; end if;
  if app.tenant_host_problem('10.0.0.1') <> 'reserved' then raise exception 'an IP address is reserved'; end if;
  if app.tenant_host_problem('demo.localhost') <> 'reserved' then raise exception '*.localhost is reserved'; end if;
  if app.tenant_host_problem('akana.vercel.app') <> 'reserved' then raise exception '*.vercel.app is reserved'; end if;
  if app.tenant_host_problem('cname.vercel-dns.com') <> 'reserved' then raise exception 'vercel-dns is reserved'; end if;
  if app.tenant_host_problem(repeat('a', 60) || '.' || repeat('b', 60) || '.' || repeat('c', 60) || '.' || repeat('d', 60) || '.com') <> 'invalid' then
    raise exception 'over 253 characters is invalid';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Only platform owners and editors add a domain.
-- ---------------------------------------------------------------------------
do $$ begin
  perform pg_temp.as_anon();
  begin
    perform public.add_tenant_domain('a3300000-0000-0000-0000-0000000000b1', 'books.orgd.example.com');
    raise exception 'anon should not reach add_tenant_domain';
  exception when insufficient_privilege then null;
  end;
  reset role;
end $$;

do $$ begin
  perform test_as('a3300000-0000-0000-0000-000000000002', array['support']);
  begin
    perform public.add_tenant_domain('a3300000-0000-0000-0000-0000000000b1', 'books.orgd.example.com');
    raise exception 'support should not add a domain';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform test_as('a3300000-0000-0000-0000-000000000003');
  begin
    perform public.add_tenant_domain('a3300000-0000-0000-0000-0000000000b1', 'books.orgd.example.com');
    raise exception 'an organisation owner should not add a domain';
  exception when insufficient_privilege then null;
  end;
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- 3. An editor adds one; refusals carry their codes.
-- ---------------------------------------------------------------------------
do $$ declare r record; begin
  perform test_as('a3300000-0000-0000-0000-000000000001', array['editor']);
  select * into r from public.add_tenant_domain('a3300000-0000-0000-0000-0000000000b1', '  Books.OrgD.Example.com. ');
  if r.host <> 'books.orgd.example.com' then raise exception 'host should be normalised, got %', r.host; end if;
  if r.verification_token !~ '^[0-9a-f]{32}$' then raise exception 'token shape wrong: %', r.verification_token; end if;

  begin
    perform public.add_tenant_domain('a3300000-0000-0000-0000-0000000000b1', 'books.orgd.example.com');
    raise exception 'a duplicate host should be refused';
  exception when unique_violation then null;
  end;
  begin
    perform public.add_tenant_domain('a3300000-0000-0000-0000-0000000000b1', 'not a host');
    raise exception 'an invalid host should be refused';
  exception when sqlstate 'AKD01' then null;
  end;
  begin
    perform public.add_tenant_domain('a3300000-0000-0000-0000-0000000000b1', 'x.vercel.app');
    raise exception 'a reserved host should be refused';
  exception when sqlstate 'AKD02' then null;
  end;
  begin
    perform public.add_tenant_domain('00000000-0000-0000-0000-00000000000a', 'market.example.com');
    raise exception 'the marketplace takes no custom domain';
  exception when sqlstate 'AKD03' then null;
  end;
  begin
    perform public.add_tenant_domain('a3300000-0000-0000-0000-0000000000b2', 'demo.example.com');
    raise exception 'the demo takes no custom domain';
  exception when sqlstate 'AKD03' then null;
  end;
  perform public.add_tenant_domain('a3300000-0000-0000-0000-0000000000b1', 'h2.orgd.example.com');
  perform public.add_tenant_domain('a3300000-0000-0000-0000-0000000000b1', 'h3.orgd.example.com');
  perform public.add_tenant_domain('a3300000-0000-0000-0000-0000000000b1', 'h4.orgd.example.com');
  perform public.add_tenant_domain('a3300000-0000-0000-0000-0000000000b1', 'h5.orgd.example.com');
  begin
    perform public.add_tenant_domain('a3300000-0000-0000-0000-0000000000b1', 'h6.orgd.example.com');
    raise exception 'a sixth host should be refused';
  exception when sqlstate 'AKD04' then null;
  end;
  reset role;

  if (select count(*) from public.audit_log where action = 'tenant_domain.added' and tenant_id = 'a3300000-0000-0000-0000-0000000000b1') <> 5 then
    raise exception 'each add should be audited';
  end if;
  if (select added_by from public.tenant_domains where host = 'books.orgd.example.com') <> 'a3300000-0000-0000-0000-000000000001' then
    raise exception 'added_by should be the editor';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Unverified hosts do not resolve; a passing check verifies.
-- ---------------------------------------------------------------------------
do $$ declare j jsonb; begin
  if exists (select 1 from public.resolve_tenant('books.orgd.example.com')) then raise exception 'unverified host should not resolve'; end if;

  perform test_as('a3300000-0000-0000-0000-000000000003');
  begin
    perform public.record_tenant_domain_check('books.orgd.example.com', 'ok');
    raise exception 'an organisation owner should not record a check';
  exception when insufficient_privilege then null;
  end;
  reset role;

  perform test_as('a3300000-0000-0000-0000-000000000001', array['editor']);
  begin
    perform public.record_tenant_domain_check('books.orgd.example.com', 'great');
    raise exception 'unknown result should be refused';
  exception when sqlstate 'AKD06' then null;
  end;
  begin
    perform public.record_tenant_domain_check('nobody.example.com', 'ok');
    raise exception 'unknown host should be refused';
  exception when sqlstate 'AKD05' then null;
  end;
  j := public.record_tenant_domain_check('Books.OrgD.Example.com', 'ok');
  if not (j->>'verified')::boolean then raise exception 'ok should verify: %', j; end if;
  reset role;

  if not exists (select 1 from public.resolve_tenant('books.orgd.example.com')) then raise exception 'verified host should resolve'; end if;
  if (select count(*) from public.audit_log where action = 'tenant_domain.verified' and target = 'tenant_domain:books.orgd.example.com') <> 1 then
    raise exception 'verification should be audited once';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. The cron path: service role only. A repeat pass writes no audit row.
--    Inconclusive checks never count. Three failures in a row unverify.
-- ---------------------------------------------------------------------------
do $$ declare j jsonb; n int; begin
  perform test_as('a3300000-0000-0000-0000-000000000001', array['editor']);
  begin
    perform public.record_tenant_domain_check_job('books.orgd.example.com', 'missing');
    raise exception 'authenticated should not reach the job function';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.tenant_domains_to_check_job(10);
    raise exception 'authenticated should not list hosts for the job';
  exception when insufficient_privilege then null;
  end;
  reset role;

  set local role service_role;
  select count(*) into n from public.tenant_domains_to_check_job(10);
  if n <> 5 then raise exception 'the job should list 5 hosts, got %', n; end if;
  if (select host from public.tenant_domains_to_check_job(1)) = 'books.orgd.example.com' then
    raise exception 'checked hosts should come after unchecked ones';
  end if;

  reset role;
  select count(*) into n from public.audit_log where target = 'tenant_domain:books.orgd.example.com';
  set local role service_role;
  perform public.record_tenant_domain_check_job('books.orgd.example.com', 'ok');
  reset role;
  if (select count(*) from public.audit_log where target = 'tenant_domain:books.orgd.example.com') <> n then
    raise exception 'a repeat pass should write no audit row';
  end if;
  set local role service_role;

  j := public.record_tenant_domain_check_job('books.orgd.example.com', 'missing');
  if (j->>'consecutive_failures')::int <> 1 or not (j->>'verified')::boolean then raise exception 'first failure: %', j; end if;
  j := public.record_tenant_domain_check_job('books.orgd.example.com', 'dns_error');
  if (j->>'consecutive_failures')::int <> 1 then raise exception 'dns_error should not count: %', j; end if;
  j := public.record_tenant_domain_check_job('books.orgd.example.com', 'wrong_value');
  if (j->>'consecutive_failures')::int <> 2 or not (j->>'verified')::boolean then raise exception 'second failure: %', j; end if;
  reset role;
  if not exists (select 1 from public.resolve_tenant('books.orgd.example.com')) then raise exception 'two failures should still resolve'; end if;

  set local role service_role;
  j := public.record_tenant_domain_check_job('books.orgd.example.com', 'missing');
  if (j->>'verified')::boolean or not (j->>'stopped')::boolean then raise exception 'third failure should unverify: %', j; end if;
  reset role;
  if exists (select 1 from public.resolve_tenant('books.orgd.example.com')) then raise exception 'unverified host should stop resolving'; end if;
  if (select count(*) from public.audit_log where action = 'tenant_domain.check_failed' and target = 'tenant_domain:books.orgd.example.com') <> 3 then
    raise exception 'each failure should be audited';
  end if;
  if (select count(*) from public.audit_log where action = 'tenant_domain.unverified' and target = 'tenant_domain:books.orgd.example.com') <> 1 then
    raise exception 'unverify should be audited';
  end if;
  if (select stopped_at from public.tenant_domains where host = 'books.orgd.example.com') is null then
    raise exception 'stopped_at should be set';
  end if;
  if (select last_check_result from public.tenant_domains where host = 'books.orgd.example.com') <> 'missing' then
    raise exception 'last result should be stored';
  end if;

  -- A passing check brings it back.
  set local role service_role;
  j := public.record_tenant_domain_check_job('books.orgd.example.com', 'ok');
  reset role;
  if not (j->>'verified')::boolean or (j->>'consecutive_failures')::int <> 0 then raise exception 'pass should re-verify: %', j; end if;
  if not exists (select 1 from public.resolve_tenant('books.orgd.example.com')) then raise exception 're-verified host should resolve'; end if;
  if (select stopped_at from public.tenant_domains where host = 'books.orgd.example.com') is not null then
    raise exception 'stopped_at should clear on a pass';
  end if;

  -- Failures then a pass while still verified: recovered.
  set local role service_role;
  perform public.record_tenant_domain_check_job('h2.orgd.example.com', 'ok');
  perform public.record_tenant_domain_check_job('h2.orgd.example.com', 'missing');
  perform public.record_tenant_domain_check_job('h2.orgd.example.com', 'ok');
  reset role;
  if (select count(*) from public.audit_log where action = 'tenant_domain.recovered' and target = 'tenant_domain:h2.orgd.example.com') <> 1 then
    raise exception 'recovery should be audited';
  end if;

  -- An unverified host never verified does not get unverified, it just counts.
  set local role service_role;
  perform public.record_tenant_domain_check_job('h3.orgd.example.com', 'missing');
  perform public.record_tenant_domain_check_job('h3.orgd.example.com', 'missing');
  j := public.record_tenant_domain_check_job('h3.orgd.example.com', 'missing');
  reset role;
  if (j->>'consecutive_failures')::int <> 3 or (j->>'verified')::boolean or (j->>'stopped')::boolean then raise exception 'pending host count: %', j; end if;
  if exists (select 1 from public.audit_log where action = 'tenant_domain.unverified' and target = 'tenant_domain:h3.orgd.example.com') then
    raise exception 'a never-verified host should not be audited as unverified';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Reading: staff and the tenant's organisation see rows; anon sees none.
-- ---------------------------------------------------------------------------
do $$ declare n int; begin
  perform test_as('a3300000-0000-0000-0000-000000000003');
  select count(*) into n from public.tenant_domains where tenant_id = 'a3300000-0000-0000-0000-0000000000b1';
  if n <> 5 then raise exception 'org member should read its hosts, got %', n; end if;
  reset role;
  perform pg_temp.as_anon();
  begin
    select count(*) into n from public.tenant_domains;
    raise exception 'anon should not read tenant_domains';
  exception when insufficient_privilege then null;
  end;
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Remove: staff only, reason required, audited.
-- ---------------------------------------------------------------------------
do $$ begin
  perform test_as('a3300000-0000-0000-0000-000000000002', array['support']);
  begin
    perform public.remove_tenant_domain('h5.orgd.example.com', 'tidy');
    raise exception 'support should not remove a domain';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform test_as('a3300000-0000-0000-0000-000000000001', array['editor']);
  begin
    perform public.remove_tenant_domain('h5.orgd.example.com', '  ');
    raise exception 'a reason is required';
  exception when check_violation then null;
  end;
  perform public.remove_tenant_domain('H5.orgd.example.com', 'Tenant asked to drop it');
  begin
    perform public.remove_tenant_domain('h5.orgd.example.com', 'again');
    raise exception 'a removed host is gone';
  exception when sqlstate 'AKD05' then null;
  end;
  reset role;
  if exists (select 1 from public.tenant_domains where host = 'h5.orgd.example.com') then raise exception 'row should be gone'; end if;
  if (select reason from public.audit_log where action = 'tenant_domain.removed' and target = 'tenant_domain:h5.orgd.example.com') <> 'Tenant asked to drop it' then
    raise exception 'removal should be audited with its reason';
  end if;
end $$;

rollback;
