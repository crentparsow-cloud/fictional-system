-- Plain Postgres shim so the migrations and RLS tests run without the Supabase
-- stack. Supabase provides these itself; this file is used only by
-- scripts/db-test.sh on a throwaway database.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

-- Supabase gives anon, authenticated and service_role every privilege on
-- tables, sequences and functions that postgres creates in public. The shim
-- copies that, so a migration that forgets a revoke fails a test here rather
-- than passing on plain Postgres and leaving the grant on the live project.
-- supabase/tests/0074_review_permissions.sql sweeps the catalogue for it.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

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
-- From 0074 a staff role counts only when platform_roles holds it too, so the
-- helper adds the rows for the roles it is given (test_hold_platform_roles
-- runs as the owner, because the caller may already be a client role). Tests
-- of a token whose role row is gone delete the row themselves.
create or replace function test_hold_platform_roles(p_user uuid, p_platform_roles text[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(cardinality(p_platform_roles), 0) = 0 or to_regclass('public.platform_roles') is null then return; end if;
  if not exists (select 1 from auth.users u where u.id = p_user) then return; end if;
  insert into public.platform_roles (user_id, role)
  select p_user, r from unnest(p_platform_roles) r
  on conflict do nothing;
end $$;

create or replace function test_as(p_user uuid, p_platform_roles text[] default '{}') returns void
language plpgsql as $$
begin
  perform public.test_hold_platform_roles(p_user, p_platform_roles);
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
