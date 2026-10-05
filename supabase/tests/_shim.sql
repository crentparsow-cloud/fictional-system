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

-- Helper for tests: act as a user with the given platform roles.
create or replace function test_as(p_user uuid, p_platform_roles text[] default '{}') returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', p_user, 'role', 'authenticated',
      'app_metadata', jsonb_build_object('platform_roles', to_jsonb(p_platform_roles)))::text, true);
  execute 'set local role authenticated';
end $$;
