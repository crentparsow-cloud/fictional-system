-- Plain Postgres shim so the migrations and RLS tests run without the Supabase
-- stack. Supabase provides these itself; this file is used only by
-- scripts/db-test.sh on a throwaway database.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;

-- Helper for tests: act as a user with the given platform roles. The
-- session has passed a second factor just now (aal2, TOTP in amr), as owners,
-- finance and staff must from 0032; tests of the aal1 case set claims themselves.
create or replace function test_as(p_user uuid, p_platform_roles text[] default '{}') returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal2',
      'amr', jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint)),
      'app_metadata', jsonb_build_object('platform_roles', to_jsonb(p_platform_roles)))::text, true);
  execute 'set local role authenticated';
end $$;

-- Storage (added with 0014): the parts of Supabase Storage the migrations
-- touch, so bucket rows and storage.objects policies can be applied and
-- tested on plain Postgres. Supabase provides the real ones.
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  metadata jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;
grant all on storage.objects to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;

-- Tenant-scoped sessions (added with 0073, F-133): the Supabase roles and the
-- auth table the migration names. supabase_auth_admin runs the access token
-- hook; authenticator is the role PostgREST connects as before it switches.
-- Supabase provides the real ones.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then create role supabase_auth_admin nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator nologin noinherit; end if;
end $$;
create table if not exists auth.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Helper for tests: act as a reader whose session was created on a tenant
-- host, as PostgREST would after verifying the token. Only
-- request.jwt.claims is set. The token names its session: pass one, or the
-- newest scope row for this user and tenant is used (revoked or not, as an
-- access token issued before a revocation would still name it). Pass a null
-- tenant to leave the tenant claim out.
drop function if exists test_as_tenant_reader(uuid, uuid);
create or replace function test_as_tenant_reader(p_user uuid, p_tenant uuid, p_session uuid default null) returns void
language plpgsql as $$
declare v_session uuid := p_session;
begin
  if v_session is null and to_regclass('public.tenant_session_scopes') is not null then
    execute 'select session_id from public.tenant_session_scopes where user_id = $1 and tenant_id = $2 order by created_at desc, session_id limit 1'
      into v_session using p_user, p_tenant;
  end if;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims',
    (jsonb_build_object('sub', p_user, 'role', 'tenant_reader', 'aal', 'aal1')
      || case when p_tenant is null then '{}'::jsonb else jsonb_build_object('akana_tenant', p_tenant) end
      || case when v_session is null then '{}'::jsonb else jsonb_build_object('session_id', v_session) end)::text, true);
  execute 'set local role tenant_reader';
end $$;

-- Second factors (added with the 0073 rework, R2-7): the access token hook
-- and public.register_tenant_session refuse a tenant session for a user with
-- a verified factor. The real table has more columns and an enum for status;
-- the migration reads user_id and status only. supabase_auth_admin owns the
-- real one, so here it is given the read the hook needs.
create table if not exists auth.mfa_factors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  factor_type text not null default 'totp',
  status text not null default 'unverified' check (status in ('unverified', 'verified')),
  created_at timestamptz not null default now()
);
grant usage on schema auth to supabase_auth_admin;
grant select on auth.mfa_factors to supabase_auth_admin;
