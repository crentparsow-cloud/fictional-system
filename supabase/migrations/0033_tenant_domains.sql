-- 0033 Custom domains for white-label tenants (F-066 follow-on, A7).
--
-- Staff add a host to a white-label tenant. Akana gives the host a
-- verification token. The tenant adds a DNS TXT record at
-- _akana-verify.<host> with the value akana-verify=<token>, and a CNAME to
-- Vercel. The app checks the TXT record over DNS-over-HTTPS (Cloudflare's
-- public resolver, lib/tenant-domains.ts) when staff press Verify and once a
-- day from the cron, then records the result here. The database cannot make
-- DNS queries itself, so it trusts the caller's result: only platform owners
-- and editors (the Verify button) and the service role (the cron) may record
-- one.
--
-- Resolution is unchanged: public.resolve_tenant (0008) still serves only
-- rows with verified_at set. A verified host whose check then fails three
-- times in a row has verified_at cleared, so it stops resolving. A later
-- passing check sets verified_at again. A check that could not reach an
-- answer (resolver down, timeout, SERVFAIL) is recorded but never counts as
-- a failure, so a resolver outage cannot take a tenant offline.
--
-- Adding the domain to the Vercel project is a manual step for Crent in the
-- Vercel dashboard (docs/TENANT_RESOLUTION.md section 9). Nothing here talks
-- to Vercel.
--
-- Same rules as 0001 to 0030. Functions are security definer with
-- search_path pinned to ''. Every function an RPC client may call has execute
-- revoked from public first and granted back to the role that needs it.
-- Nothing earlier is edited. Depends on 0001, 0002 (citext) and 0008 only.
--
-- Audit actions:
--   tenant_domain.added         staff added a host
--   tenant_domain.removed       staff removed a host (reason required)
--   tenant_domain.verified      a passing check set verified_at
--   tenant_domain.check_failed  a definite failing check (count in after)
--   tenant_domain.recovered     a passing check after failures, still verified
--   tenant_domain.unverified    third failure in a row cleared verified_at
-- A passing check that changes nothing but last_checked_at writes no audit
-- row, so the daily cron does not fill the log. An inconclusive check writes
-- none either.
--
-- Error codes:
--   AKD01  host is not a valid public host name
--   AKD02  host is reserved (localhost, vercel.app, an IP address)
--   AKD03  tenant is not a white-label tenant, or is the demo tenant
--   AKD04  tenant already has the maximum number of hosts (5)
--   AKD05  host not found
--   AKD06  check result not recognised
--   23505  host already belongs to a tenant (primary key)

-- ---------------------------------------------------------------------------
-- 1. Columns.
--
-- stopped_at is set when the third failure in a row clears verified_at, and
-- cleared when a check passes again, so staff can tell a stopped host from
-- one that was never verified.
--
-- Existing rows get a token too. A row verified by hand before this migration
-- has no TXT record yet, so after three daily checks it would stop
-- resolving. docs/TENANT_RESOLUTION.md says to add the TXT record for any
-- such host before the cron runs three times.
-- ---------------------------------------------------------------------------
alter table public.tenant_domains
  add column verification_token   text not null default replace(gen_random_uuid()::text, '-', ''),
  add column last_checked_at      timestamptz,
  add column last_check_result    text,
  add column consecutive_failures int not null default 0,
  add column stopped_at           timestamptz,
  add column added_by             uuid references auth.users(id) on delete set null;

alter table public.tenant_domains
  add constraint tenant_domains_token_shape check (verification_token ~ '^[0-9a-f]{32}$'),
  add constraint tenant_domains_check_result check (last_check_result is null or last_check_result in ('ok','missing','wrong_value','dns_error')),
  add constraint tenant_domains_failures_nonneg check (consecutive_failures >= 0);

create unique index tenant_domains_token_idx on public.tenant_domains(verification_token);

-- ---------------------------------------------------------------------------
-- 2. Host rules.
--
-- Lower case, no trailing dot, labels of 1 to 63 letters, digits and
-- hyphens that neither start nor end with a hyphen, at least two labels, a
-- top-level label that is not all digits, 253 characters at most. Matches
-- what lib/tenant.ts normaliseHost sends to resolve_tenant. The app also
-- refuses AKANA_HOST and TENANT_APEX hosts, which only it knows.
-- ---------------------------------------------------------------------------
create or replace function app.tenant_host_problem(p_host text) returns text
language plpgsql immutable set search_path = '' as $$
begin
  if p_host is null or length(p_host) > 253
     or p_host !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' then
    return 'invalid';
  end if;
  if p_host ~ '\.[0-9]+$' then return 'reserved'; end if;
  if p_host = 'localhost' or p_host ~ '\.localhost$'
     or p_host = 'vercel.app' or p_host ~ '\.vercel\.app$'
     or p_host ~ '(^|\.)vercel-dns\.com$'
     or p_host ~ '\.(local|internal|test|example|invalid|onion)$' then
    return 'reserved';
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Add and remove (staff: platform owners and editors).
-- ---------------------------------------------------------------------------
create or replace function public.add_tenant_domain(p_tenant uuid, p_host text)
returns table (host text, verification_token text)
language plpgsql volatile security definer set search_path = '' as $$
declare
  t       public.tenants%rowtype;
  v_host  text := lower(btrim(coalesce(p_host, '')));
  v_prob  text;
  v_token text;
begin
  if not app.is_platform(array['owner','editor']) then
    raise exception 'only platform owners and editors add a custom domain' using errcode = 'insufficient_privilege';
  end if;
  while right(v_host, 1) = '.' loop v_host := left(v_host, -1); end loop;
  v_prob := app.tenant_host_problem(v_host);
  if v_prob = 'invalid' then
    raise exception 'that is not a valid host name' using errcode = 'AKD01';
  elsif v_prob = 'reserved' then
    raise exception 'that host cannot be a tenant domain' using errcode = 'AKD02';
  end if;

  select * into t from public.tenants where id = p_tenant for update;
  if not found or t.kind <> 'white_label' or t.is_demo then
    raise exception 'custom domains are for white-label tenants, not the marketplace or the demo' using errcode = 'AKD03';
  end if;
  if (select count(*) from public.tenant_domains d where d.tenant_id = t.id) >= 5 then
    raise exception 'a tenant may have up to 5 hosts' using errcode = 'AKD04';
  end if;

  insert into public.tenant_domains (host, tenant_id, added_by)
  values (v_host::extensions.citext, t.id, app.uid())
  returning public.tenant_domains.verification_token into v_token;

  perform app.audit('tenant_domain.added', 'tenant_domain:' || v_host, null, t.id, t.org_id,
    null, jsonb_build_object('host', v_host, 'tenant_id', t.id));

  host := v_host;
  verification_token := v_token;
  return next;
end $$;

revoke execute on function public.add_tenant_domain(uuid, text) from public, anon;
grant execute on function public.add_tenant_domain(uuid, text) to authenticated;

create or replace function public.remove_tenant_domain(p_host text, p_reason text)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  d        public.tenant_domains%rowtype;
  v_org    uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not app.is_platform(array['owner','editor']) then
    raise exception 'only platform owners and editors remove a custom domain' using errcode = 'insufficient_privilege';
  end if;
  if v_reason is null or length(v_reason) > 500 then
    raise exception 'a reason of 500 characters or fewer is required' using errcode = 'check_violation';
  end if;

  select * into d from public.tenant_domains x
  where x.host operator(extensions.=) lower(btrim(coalesce(p_host, '')))::extensions.citext
  for update;
  if not found then
    raise exception 'host not found' using errcode = 'AKD05';
  end if;
  select t.org_id into v_org from public.tenants t where t.id = d.tenant_id;

  delete from public.tenant_domains x where x.host operator(extensions.=) d.host;

  perform app.audit('tenant_domain.removed', 'tenant_domain:' || d.host::text, v_reason, d.tenant_id, v_org,
    jsonb_build_object('host', d.host::text, 'verified_at', d.verified_at, 'consecutive_failures', d.consecutive_failures),
    null);
end $$;

revoke execute on function public.remove_tenant_domain(text, text) from public, anon;
grant execute on function public.remove_tenant_domain(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Recording a check.
--
--   ok           the TXT record holds akana-verify=<token>
--   missing      the name does not exist, or has no TXT record
--   wrong_value  TXT records exist but none holds the token
--   dns_error    no answer could be had (inconclusive, never a failure)
--
-- Returns the row's state after the check.
-- ---------------------------------------------------------------------------
create or replace function app.record_tenant_domain_check(p_host text, p_result text, p_source text)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  d      public.tenant_domains%rowtype;
  v_org  uuid;
  v_fail int;
  v_ver  timestamptz;
  v_stop timestamptz;
begin
  if p_result is null or p_result not in ('ok','missing','wrong_value','dns_error') then
    raise exception 'check result not recognised' using errcode = 'AKD06';
  end if;

  select * into d from public.tenant_domains x
  where x.host operator(extensions.=) lower(btrim(coalesce(p_host, '')))::extensions.citext
  for update;
  if not found then
    raise exception 'host not found' using errcode = 'AKD05';
  end if;
  select t.org_id into v_org from public.tenants t where t.id = d.tenant_id;

  v_fail := d.consecutive_failures;
  v_ver  := d.verified_at;
  v_stop := d.stopped_at;

  if p_result = 'ok' then
    v_fail := 0;
    if d.verified_at is null then
      v_ver := now();
      v_stop := null;
      perform app.audit('tenant_domain.verified', 'tenant_domain:' || d.host::text, p_source, d.tenant_id, v_org,
        jsonb_build_object('verified_at', null, 'consecutive_failures', d.consecutive_failures),
        jsonb_build_object('verified_at', v_ver, 'consecutive_failures', 0));
    elsif d.consecutive_failures > 0 then
      perform app.audit('tenant_domain.recovered', 'tenant_domain:' || d.host::text, p_source, d.tenant_id, v_org,
        jsonb_build_object('consecutive_failures', d.consecutive_failures),
        jsonb_build_object('consecutive_failures', 0));
    end if;
  elsif p_result in ('missing','wrong_value') then
    v_fail := d.consecutive_failures + 1;
    perform app.audit('tenant_domain.check_failed', 'tenant_domain:' || d.host::text, p_source, d.tenant_id, v_org,
      jsonb_build_object('consecutive_failures', d.consecutive_failures),
      jsonb_build_object('consecutive_failures', v_fail, 'result', p_result));
    if d.verified_at is not null and v_fail >= 3 then
      v_ver := null;
      v_stop := now();
      perform app.audit('tenant_domain.unverified', 'tenant_domain:' || d.host::text, p_source, d.tenant_id, v_org,
        jsonb_build_object('verified_at', d.verified_at),
        jsonb_build_object('verified_at', null, 'consecutive_failures', v_fail));
    end if;
  end if;
  -- dns_error: only the check time and result change.

  update public.tenant_domains x
     set verified_at = v_ver,
         stopped_at = v_stop,
         consecutive_failures = v_fail,
         last_checked_at = now(),
         last_check_result = p_result
   where x.host operator(extensions.=) d.host;

  return jsonb_build_object('host', d.host::text, 'result', p_result, 'verified', v_ver is not null,
    'verified_at', v_ver, 'consecutive_failures', v_fail,
    'stopped', d.verified_at is not null and v_ver is null);
end $$;

revoke execute on function app.record_tenant_domain_check(text, text, text) from public, anon, authenticated;

-- The Verify button: platform owners and editors.
create or replace function public.record_tenant_domain_check(p_host text, p_result text)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not app.is_platform(array['owner','editor']) then
    raise exception 'only platform owners and editors verify a custom domain' using errcode = 'insufficient_privilege';
  end if;
  return app.record_tenant_domain_check(p_host, p_result, 'staff check');
end $$;

revoke execute on function public.record_tenant_domain_check(text, text) from public, anon;
grant execute on function public.record_tenant_domain_check(text, text) to authenticated;

-- The daily cron: service role only.
create or replace function public.record_tenant_domain_check_job(p_host text, p_result text)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  return app.record_tenant_domain_check(p_host, p_result, 'daily check');
end $$;

revoke execute on function public.record_tenant_domain_check_job(text, text) from public, anon, authenticated;
grant execute on function public.record_tenant_domain_check_job(text, text) to service_role;

-- The hosts for the daily cron, the longest unchecked first. Service role only.
create or replace function public.tenant_domains_to_check_job(p_limit int default 200)
returns table (host text, verification_token text)
language sql stable security definer set search_path = '' as $$
  select d.host::text, d.verification_token
  from public.tenant_domains d
  join public.tenants t on t.id = d.tenant_id
  where t.kind = 'white_label'
  order by d.last_checked_at nulls first, d.host
  limit greatest(1, least(coalesce(p_limit, 200), 500))
$$;

revoke execute on function public.tenant_domains_to_check_job(int) from public, anon, authenticated;
grant execute on function public.tenant_domains_to_check_job(int) to service_role;
