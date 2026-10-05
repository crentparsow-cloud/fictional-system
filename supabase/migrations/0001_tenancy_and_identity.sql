-- 0001 Tenancy, organisations, roles, flags and audit (F-129, F-130, F-136, F-080, F-081)
--
-- Every table has RLS on. Default grants to anon and authenticated are revoked
-- and given back table by table. Money is in minor units. Times are timestamptz.
-- Authorisation reads app_metadata only, never user_metadata.
--
-- The akana-saas project starts empty. Nothing from workbooks-dev is copied.

create extension if not exists "pgcrypto";
create extension if not exists "citext";

create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- Organisations: a publisher, an author's own company, a sole author, or the
-- Akana house organisation that owns Maya Vaughn's titles.
-- ---------------------------------------------------------------------------
create table public.organisations (
  id              uuid primary key default gen_random_uuid(),
  code            text unique check (code ~ '^(AU|PB)-[0-9A-HJKMNP-TV-Z]{5}$'),
  kind            text not null check (kind in ('akana_house','publisher','author_company','individual')),
  legal_name      text not null,
  display_name    text not null,
  slug            text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  country         char(2),
  tax_residence   char(2),
  treaty_declaration jsonb,
  stripe_connect_id text unique,
  connect_status  text not null default 'not_started' check (connect_status in ('not_started','pending','verified','action_needed','held')),
  status          text not null default 'active' check (status in ('invited','active','suspended','closed')),
  is_demo         boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Tenants: a storefront. The marketplace is tenant 'akana'. Each white-label
-- site is a tenant owned by an organisation.
-- ---------------------------------------------------------------------------
create table public.tenants (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  kind             text not null check (kind in ('marketplace','white_label')),
  org_id           uuid references public.organisations(id),
  name             text not null,
  brand            jsonb not null default '{}'::jsonb,
  default_locale   text not null default 'en-GB',
  default_currency char(3) not null default 'GBP',
  seller_of_record text not null default 'akana' check (seller_of_record in ('akana','tenant')),
  stripe_account_id text,
  plan             text not null default 'demo',
  status           text not null default 'active' check (status in ('active','suspended','closed')),
  is_demo          boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.tenant_domains (
  host          citext primary key,
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  verified_at   timestamptz,
  vercel_status text,
  created_at    timestamptz not null default now()
);
create index tenant_domains_tenant_idx on public.tenant_domains(tenant_id);

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  locale       text not null default 'en-GB',
  country      char(2),
  adult_confirmed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Fixed organisation roles (F-130). No custom roles.
create table public.org_members (
  org_id     uuid not null references public.organisations(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('owner','editor','finance','author','viewer')),
  invited_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index org_members_user_idx on public.org_members(user_id);

-- One shared identity, per-tenant membership (A4).
create table public.tenant_members (
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'reader' check (role in ('reader','tenant_admin','tenant_editor')),
  joined_at  timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
create index tenant_members_user_idx on public.tenant_members(user_id);

-- Akana staff roles (F-080). Mirrored into app_metadata by the access token hook.
create table public.platform_roles (
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('owner','editor','safety_reviewer','support','finance')),
  granted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

-- ---------------------------------------------------------------------------
-- Permissions table drives RLS and the UI (F-130): one row per role per table
-- per action. Tests cover every row.
-- ---------------------------------------------------------------------------
create table public.org_permissions (
  role       text not null,
  resource   text not null,
  action     text not null check (action in ('read','write','manage')),
  primary key (role, resource, action)
);
insert into public.org_permissions (role, resource, action) values
  ('owner','organisation','read'),('owner','organisation','write'),('owner','organisation','manage'),
  ('owner','members','read'),('owner','members','manage'),
  ('owner','books','read'),('owner','books','write'),
  ('owner','workbooks','read'),('owner','workbooks','write'),
  ('owner','licences','read'),('owner','licences','write'),
  ('owner','payouts','read'),('owner','payouts','manage'),
  ('owner','statements','read'),
  ('editor','organisation','read'),('editor','members','read'),
  ('editor','books','read'),('editor','books','write'),
  ('editor','workbooks','read'),('editor','workbooks','write'),
  ('editor','licences','read'),
  ('finance','organisation','read'),('finance','members','read'),
  ('finance','books','read'),('finance','workbooks','read'),
  ('finance','payouts','read'),('finance','payouts','manage'),('finance','statements','read'),
  ('author','organisation','read'),('author','books','read'),('author','workbooks','read'),('author','workbooks','write'),
  ('author','licences','read'),('author','statements','read'),
  ('viewer','organisation','read'),('viewer','books','read'),('viewer','workbooks','read');

-- ---------------------------------------------------------------------------
-- Feature flags and config (F-136). Scope: global, tenant or workbook.
-- ---------------------------------------------------------------------------
create table public.app_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.app_config (key, value) values
  ('suppression_threshold_owner', '5'),
  ('suppression_threshold_author', '10'),
  ('deletion_undo_days', '7'),
  ('postal_address_is_placeholder', 'true');

create table public.feature_flags (
  key         text not null,
  scope       text not null check (scope in ('global','tenant','workbook')),
  scope_id    text not null default '',
  enabled     boolean not null,
  reason      text,
  updated_by  uuid references auth.users(id),
  updated_at  timestamptz not null default now(),
  primary key (key, scope, scope_id)
);
insert into public.feature_flags (key, scope, enabled, reason) values
  ('membership', 'global', false, 'Launch toggle'),
  ('white_label', 'global', false, 'Launch toggle'),
  ('demo_visible', 'global', true, 'Demo titles shown with a Demo badge until real titles arrive (B4)'),
  ('live_payments', 'global', false, 'Stays off until Stripe live activation and the gates in AK_3_Week_Plan section 7');

-- ---------------------------------------------------------------------------
-- Append-only audit log (F-081). Insert through app.audit() only.
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  actor      uuid,
  actor_role text,
  action     text not null,
  target     text,
  tenant_id  uuid,
  org_id     uuid,
  reason     text,
  before     jsonb,
  after      jsonb,
  ip_hash    text
);
create index audit_log_at_idx on public.audit_log(at desc);
create index audit_log_target_idx on public.audit_log(target);

-- ---------------------------------------------------------------------------
-- Helper functions. All security definer, stable, search_path pinned.
-- Policies call them as (select app.fn(...)) so Postgres evaluates once.
-- ---------------------------------------------------------------------------
create or replace function app.uid() returns uuid
language sql stable security definer set search_path = '' as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create or replace function app.platform_roles() returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(
    array(select jsonb_array_elements_text(
      coalesce(current_setting('request.jwt.claims', true), '{}')::jsonb -> 'app_metadata' -> 'platform_roles')),
    '{}'::text[])
$$;

create or replace function app.is_platform(p_roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.platform_roles() && p_roles
$$;

create or replace function app.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select cardinality(app.platform_roles()) > 0
$$;

create or replace function app.is_org_member(p_org uuid, p_roles text[] default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.org_members m
    where m.org_id = p_org and m.user_id = app.uid()
      and (p_roles is null or m.role = any(p_roles)))
$$;

create or replace function app.is_tenant_member(p_tenant uuid, p_roles text[] default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tenant_members m
    where m.tenant_id = p_tenant and m.user_id = app.uid()
      and (p_roles is null or m.role = any(p_roles)))
$$;

create or replace function app.org_can(p_org uuid, p_resource text, p_action text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.org_members m
    join public.org_permissions p on p.role = m.role
    where m.org_id = p_org and m.user_id = app.uid()
      and p.resource = p_resource and p.action = p_action)
$$;

create or replace function app.flag(p_key text, p_tenant uuid default null, p_workbook uuid default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select enabled from public.feature_flags where key = p_key and scope = 'workbook' and scope_id = coalesce(p_workbook::text, '')),
    (select enabled from public.feature_flags where key = p_key and scope = 'tenant' and scope_id = coalesce(p_tenant::text, '')),
    (select enabled from public.feature_flags where key = p_key and scope = 'global'),
    false)
$$;

create or replace function app.audit(
  p_action text, p_target text, p_reason text default null,
  p_tenant uuid default null, p_org uuid default null,
  p_before jsonb default null, p_after jsonb default null
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  insert into public.audit_log (actor, actor_role, action, target, tenant_id, org_id, reason, before, after)
  values (app.uid(), array_to_string(app.platform_roles(), ','), p_action, p_target, p_tenant, p_org, p_reason, p_before, p_after)
  returning id into v_id;
  return v_id;
end $$;

-- An organisation always keeps one owner (F-055), enforced here.
create or replace function app.guard_last_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (tg_op = 'DELETE' and old.role = 'owner') or (tg_op = 'UPDATE' and old.role = 'owner' and new.role <> 'owner') then
    if not exists (select 1 from public.org_members where org_id = old.org_id and role = 'owner' and user_id <> old.user_id) then
      raise exception 'an organisation must keep at least one owner' using errcode = 'check_violation';
    end if;
  end if;
  return coalesce(new, old);
end $$;
create trigger org_members_last_owner before update or delete on public.org_members
  for each row execute function app.guard_last_owner();

create or replace function app.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create trigger organisations_touch before update on public.organisations for each row execute function app.touch_updated_at();
create trigger tenants_touch before update on public.tenants for each row execute function app.touch_updated_at();
create trigger profiles_touch before update on public.profiles for each row execute function app.touch_updated_at();

-- New auth users get a profile row.
create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.organisations   enable row level security;
alter table public.tenants         enable row level security;
alter table public.tenant_domains  enable row level security;
alter table public.profiles        enable row level security;
alter table public.org_members     enable row level security;
alter table public.tenant_members  enable row level security;
alter table public.platform_roles  enable row level security;
alter table public.org_permissions enable row level security;
alter table public.app_config      enable row level security;
alter table public.feature_flags   enable row level security;
alter table public.audit_log       enable row level security;

revoke all on all tables in schema public from anon, authenticated;

-- organisations: members read their own; staff read all; owners update; staff create.
grant select, update on public.organisations to authenticated;
create policy organisations_read on public.organisations for select to authenticated
  using ((select app.is_org_member(id)) or (select app.is_staff()));
create policy organisations_update on public.organisations for update to authenticated
  using ((select app.org_can(id, 'organisation', 'write')) or (select app.is_platform(array['owner','editor'])))
  with check ((select app.org_can(id, 'organisation', 'write')) or (select app.is_platform(array['owner','editor'])));

-- tenants: public listing columns are read through a view later; the row is for members and staff.
grant select, update on public.tenants to authenticated;
grant select on public.tenants to anon;
create policy tenants_read on public.tenants for select to anon, authenticated using (true);
create policy tenants_update on public.tenants for update to authenticated
  using ((org_id is not null and (select app.org_can(org_id, 'organisation', 'write'))) or (select app.is_platform(array['owner','editor'])))
  with check ((org_id is not null and (select app.org_can(org_id, 'organisation', 'write'))) or (select app.is_platform(array['owner','editor'])));

grant select on public.tenant_domains to authenticated;
create policy tenant_domains_read on public.tenant_domains for select to authenticated
  using ((select app.is_staff()) or exists (
    select 1 from public.tenants t where t.id = tenant_id and t.org_id is not null and (select app.is_org_member(t.org_id))));

-- profiles: own row only. Staff never read profiles directly; support goes through the lookup console.
grant select, insert, update on public.profiles to authenticated;
create policy profiles_own on public.profiles for all to authenticated
  using (user_id = (select app.uid())) with check (user_id = (select app.uid()));

-- org_members: members see their organisation's roster; owners manage it.
grant select, insert, update, delete on public.org_members to authenticated;
create policy org_members_read on public.org_members for select to authenticated
  using ((select app.is_org_member(org_id)) or (select app.is_staff()));
create policy org_members_manage on public.org_members for all to authenticated
  using ((select app.org_can(org_id, 'members', 'manage')) or (select app.is_platform(array['owner'])))
  with check ((select app.org_can(org_id, 'members', 'manage')) or (select app.is_platform(array['owner'])));

-- tenant_members: a reader sees their own memberships; tenant admins see their tenant's; never another tenant's.
grant select on public.tenant_members to authenticated;
create policy tenant_members_read on public.tenant_members for select to authenticated
  using (user_id = (select app.uid())
      or (select app.is_tenant_member(tenant_id, array['tenant_admin']))
      or (select app.is_staff()));

-- platform_roles: staff can see who is staff. Writes are server only.
grant select on public.platform_roles to authenticated;
create policy platform_roles_read on public.platform_roles for select to authenticated using ((select app.is_staff()));

grant select on public.org_permissions to anon, authenticated;
create policy org_permissions_read on public.org_permissions for select to anon, authenticated using (true);

-- app_config and feature_flags: read by everyone (values are not secret), written by owner staff.
grant select on public.app_config to anon, authenticated;
create policy app_config_read on public.app_config for select to anon, authenticated using (true);
grant select, insert, update on public.feature_flags to authenticated;
grant select on public.feature_flags to anon;
create policy feature_flags_read on public.feature_flags for select to anon, authenticated using (true);
create policy feature_flags_write on public.feature_flags for all to authenticated
  using ((select app.is_platform(array['owner','safety_reviewer'])))
  with check ((select app.is_platform(array['owner','safety_reviewer'])));

-- audit_log: platform owners read. Nobody updates or deletes. Inserts only through app.audit().
grant select on public.audit_log to authenticated;
create policy audit_log_read on public.audit_log for select to authenticated using ((select app.is_platform(array['owner'])));

-- ---------------------------------------------------------------------------
-- Seed the two fixed rows: the Akana house organisation and the marketplace tenant.
-- ---------------------------------------------------------------------------
insert into public.organisations (id, kind, legal_name, display_name, slug, country)
values ('00000000-0000-0000-0000-000000000001', 'akana_house', 'Akana (company name pending, gate O1)', 'Akana', 'akana', 'GB');

insert into public.tenants (id, slug, kind, org_id, name, default_locale, default_currency)
values ('00000000-0000-0000-0000-00000000000a', 'akana', 'marketplace', '00000000-0000-0000-0000-000000000001', 'Akana', 'en-GB', 'GBP');
