-- 0073 Reader sign-in on white-label tenant hosts: tenant-scoped sessions
-- (F-133, decided by Crent, 20 November 2026).
--
-- Same rules as 0001 to 0072. Nothing earlier is edited. Functions pin
-- search_path to ''. Safe to run twice. Design: docs/TENANT_SIGN_IN.md.
--
-- A tenant controls the DNS of its own domain. A session created on a tenant
-- host must therefore be worth nothing outside that tenant. This migration
-- is the token layer and the database layer of that rule. The app layer is
-- apps/web/lib/session-scope.ts.
--
-- Nothing here changes what anon, authenticated or service_role can do. No
-- existing policy, grant or function is altered. The access token hook does
-- nothing until it is enabled in the Supabase dashboard, and after that it
-- returns every session without a scope row exactly as it received it.
--
--  1. Role tenant_reader: no privileges by default
--  2. public.tenant_session_scopes: which session belongs to which tenant
--  3. Schema tenant_scope: the claim readers the policies use
--  4. public.akana_access_token_hook: stamps the role and the tenant claim
--  5. Grants and policies for tenant_reader, table by table
--  6. The gate functions a tenant-host reader may call
--  7. Registering and revoking scoped sessions (service role)
--  8. Revocation when a tenant host is removed or stopped (0033), or the
--     tenant stops being active
--  9. The tenant_sign_in flag, its public read and the owner's switch
-- 10. Akana's own sign-in code for tenant hosts
-- 11. The server-side session store behind the tenant cookie
--
-- Reworked after the second red team pass (R2-1 to R2-7). Two small
-- exceptions to "no existing function is altered", neither of which changes
-- what a marketplace reader sees or can do: app.record_pair_finish (0066) is
-- redefined here to match the pair's tenant to the enrolment's (section 5),
-- and a new trigger on profiles records a health consent withdrawal
-- (section 6).

-- ---------------------------------------------------------------------------
-- 1. The role. PostgREST switches to it when the access token says so, which
-- is why authenticator must be a member. It is given nothing here: every
-- table, function and schema below is granted by name, so anything not named
-- in this file is denied without anyone having to remember a policy.
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'tenant_reader') then
    create role tenant_reader nologin noinherit;
  end if;
end $$;
grant tenant_reader to authenticator;
alter role tenant_reader set statement_timeout = '8s';

-- ---------------------------------------------------------------------------
-- 2. The scope table. One row per session created on a tenant host. A row is
-- never deleted while its session exists: deleting it would turn a scoped
-- session into an ordinary one. Rows go when the session goes (cascade).
-- Revoking sets revoked_at, after which the hook refuses the session.
-- ---------------------------------------------------------------------------
create table if not exists public.tenant_session_scopes (
  session_id uuid primary key references auth.sessions(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  -- No cascade from tenants: a tenant cannot be deleted while it has scoped sessions.
  tenant_id  uuid not null references public.tenants(id),
  -- The verified host the reader signed in on, as the proxy resolved it.
  host       text not null check (host = lower(host) and length(host) between 1 and 253),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists tenant_session_scopes_tenant_idx on public.tenant_session_scopes (tenant_id, host);
create index if not exists tenant_session_scopes_user_idx on public.tenant_session_scopes (user_id);

alter table public.tenant_session_scopes enable row level security;
revoke all on public.tenant_session_scopes from public, anon, authenticated, tenant_reader;
grant select, insert, update, delete on public.tenant_session_scopes to service_role;
-- The hook runs as supabase_auth_admin, which does not bypass row level
-- security. Supabase advises against security definer for hooks, so the role
-- gets select through a policy of its own. Nobody else has a policy.
grant usage on schema public to supabase_auth_admin;
grant select on public.tenant_session_scopes to supabase_auth_admin;
drop policy if exists tenant_session_scopes_hook_read on public.tenant_session_scopes;
create policy tenant_session_scopes_hook_read on public.tenant_session_scopes
  for select to supabase_auth_admin using (true);

-- ---------------------------------------------------------------------------
-- 3. The claim readers. A schema of its own, so tenant_reader needs no usage
-- on app (whose helpers are executable by public) or on auth. claims() reads
-- the verified claims PostgREST sets for the request. uid() and tenant() are
-- null unless those claims are backed by a live scope row (tenant_scope.live
-- below), so every policy that compares with them denies by default.
-- ---------------------------------------------------------------------------
create schema if not exists tenant_scope;
revoke all on schema tenant_scope from public;
grant usage on schema tenant_scope to tenant_reader, service_role;
grant usage on schema public to tenant_reader;

create or replace function tenant_scope.claims() returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

-- The live scope behind the token, or no row. A tenant_reader token counts
-- only while all of these hold: its session has a scope row that is not
-- revoked, for the same user and the same tenant as the token says; the
-- tenant is an active white-label tenant; and sign-in is on for it. So
-- revoking a session, suspending a tenant or switching the flag off closes
-- the database to an access token that has not yet expired. One primary key
-- lookup, evaluated once per statement where a policy wraps it in a select.
create or replace function tenant_scope.live() returns table (user_id uuid, tenant_id uuid)
language sql stable security definer set search_path = '' as $$
  select s.user_id, s.tenant_id
  from (select tenant_scope.claims() as c) x
  join public.tenant_session_scopes s
    on s.session_id = case when (x.c ->> 'session_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                           then (x.c ->> 'session_id')::uuid end
  join public.tenants t on t.id = s.tenant_id
  where x.c ->> 'role' = 'tenant_reader'
    and s.revoked_at is null
    and s.user_id::text = lower(x.c ->> 'sub')
    and s.tenant_id::text = lower(x.c ->> 'akana_tenant')
    and t.kind = 'white_label' and t.status = 'active'
    and app.flag('tenant_sign_in', s.tenant_id)
$$;

create or replace function tenant_scope.uid() returns uuid
language sql stable set search_path = '' as $$
  select l.user_id from tenant_scope.live() l
$$;

create or replace function tenant_scope.tenant() returns uuid
language sql stable set search_path = '' as $$
  select l.tenant_id from tenant_scope.live() l
$$;

-- Is this enrolment the caller's own, in the caller's tenant?
create or replace function tenant_scope.owns_enrolment(p_enrolment uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.enrolments e
    where e.id = p_enrolment
      and e.user_id = tenant_scope.uid()
      and e.tenant_id = tenant_scope.tenant())
$$;

-- Does the caller's tenant list this workbook, visibly, while both are live?
create or replace function tenant_scope.lists_workbook(p_workbook uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.tenant_listings l
    join public.tenants t on t.id = l.tenant_id
    where l.tenant_id = tenant_scope.tenant()
      and l.workbook_id = p_workbook
      and l.visible
      and t.kind = 'white_label' and t.status = 'active'
      and app.workbook_is_public(p_workbook))
$$;

create or replace function tenant_scope.current_version(p_workbook uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select w.current_version_id from public.workbooks w
  where w.id = p_workbook and tenant_scope.lists_workbook(p_workbook)
$$;

-- What is free on a tenant site: the listing and the free sections of a
-- title the tenant lists, and every section of a demo title while the demo
-- period switch is on (0070). Nothing is sold on a tenant host, so no
-- entitlement branch.
create or replace function tenant_scope.section_open(p_version uuid, p_kind text, p_free boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select tenant_scope.uid() is not null and exists (
    select 1 from public.workbook_versions v
    where v.id = p_version
      and tenant_scope.lists_workbook(v.workbook_id)
      and (p_kind = 'listing' or coalesce(p_free, false) or app.demo_open_to_reader(v.workbook_id)))
$$;

-- May this session add anything? Not while the account's deletion is
-- pending (0026): the account is read only everywhere, a tenant host
-- included (R2-3). One boolean, and the only thing a tenant session is told
-- about that state (R2-6). False with no live scope.
create or replace function tenant_scope.can_write() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select not app.account_read_only(l.user_id) from tenant_scope.live() l), false)
$$;

revoke execute on function tenant_scope.claims(), tenant_scope.live(), tenant_scope.uid(), tenant_scope.tenant(),
  tenant_scope.owns_enrolment(uuid), tenant_scope.lists_workbook(uuid), tenant_scope.current_version(uuid),
  tenant_scope.section_open(uuid, text, boolean), tenant_scope.can_write() from public;
grant execute on function tenant_scope.claims(), tenant_scope.live(), tenant_scope.uid(), tenant_scope.tenant(),
  tenant_scope.owns_enrolment(uuid), tenant_scope.lists_workbook(uuid), tenant_scope.current_version(uuid),
  tenant_scope.section_open(uuid, text, boolean), tenant_scope.can_write() to tenant_reader, service_role;

-- ---------------------------------------------------------------------------
-- 4. The access token hook. Enabled by hand in the dashboard (Authentication,
-- Hooks, Customize Access Token). Kept tiny and total:
--   no session id, or no scope row  -> the event, unchanged
--   a live scope row                -> role tenant_reader and akana_tenant
--   a scope row that is revoked, or whose tenant is not an active
--   white-label tenant, or whose flag is off -> an error, so no token
--   a scope row whose user has a verified second factor -> an error, so no
--   token (R2-7). A tenant host cannot ask for the second step, so an
--   account that has one may not hold a tenant session, even one made
--   before the factor was enrolled. auth.mfa_factors is read only on this
--   branch: an ordinary session never reaches it.
-- Every other claim is passed through untouched. If a table cannot be read
-- the function raises, and Supabase Auth issues no token at all: a scoped
-- session can never be handed an unscoped token because of a lookup failure.
-- An ordinary session costs one primary key lookup that finds nothing.
--
-- The hook runs as supabase_auth_admin and is not security definer, so that
-- role is given select on what the hook reads, through policies of its own:
-- the scope table (section 2), three columns of tenants, and feature_flags.
-- ---------------------------------------------------------------------------
grant select (id, kind, status) on public.tenants to supabase_auth_admin;
drop policy if exists tenants_hook_read on public.tenants;
create policy tenants_hook_read on public.tenants for select to supabase_auth_admin using (true);
grant select (key, scope, scope_id, enabled) on public.feature_flags to supabase_auth_admin;
drop policy if exists feature_flags_hook_read on public.feature_flags;
create policy feature_flags_hook_read on public.feature_flags for select to supabase_auth_admin using (true);

create or replace function public.akana_access_token_hook(event jsonb) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_sid     text := event #>> '{claims,session_id}';
  v_tenant  uuid;
  v_user    uuid;
  v_revoked timestamptz;
  v_live    boolean;
begin
  if v_sid is null or v_sid !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return event;
  end if;
  select s.tenant_id, s.user_id, s.revoked_at into v_tenant, v_user, v_revoked
    from public.tenant_session_scopes s where s.session_id = v_sid::uuid;
  if not found then
    return event;
  end if;
  v_live := v_revoked is null
    and exists (select 1 from public.tenants t
                 where t.id = v_tenant and t.kind = 'white_label' and t.status = 'active')
    -- The same order as app.flag: the tenant's row, then the global row, then off.
    and coalesce(
          (select f.enabled from public.feature_flags f
            where f.key = 'tenant_sign_in' and f.scope = 'tenant' and f.scope_id = v_tenant::text),
          (select f.enabled from public.feature_flags f
            where f.key = 'tenant_sign_in' and f.scope = 'global' and f.scope_id = ''),
          false);
  if not v_live then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'This session has ended. Sign in again.'));
  end if;
  if exists (select 1 from auth.mfa_factors f where f.user_id = v_user and f.status::text = 'verified') then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'This session has ended. Sign in on the Akana site.'));
  end if;
  return jsonb_set(event, '{claims}',
    (event -> 'claims') || jsonb_build_object('role', 'tenant_reader', 'akana_tenant', v_tenant::text));
end $$;

revoke execute on function public.akana_access_token_hook(jsonb) from public, anon, authenticated, tenant_reader, service_role;
grant execute on function public.akana_access_token_hook(jsonb) to supabase_auth_admin;

-- ---------------------------------------------------------------------------
-- 5. What a tenant-host reader may touch. Each policy is "to tenant_reader"
-- and asks for ownership and the tenant claim together. The existing
-- policies are all "to anon" or "to authenticated", so none of them applies
-- to this role.
--
-- enrolments: read own in this tenant; start one for a title the tenant
-- lists, pinned to the current version; touch last_opened_at. The pins guard
-- (app.guard_enrolment_pins) names anon and authenticated only, so update is
-- granted on that one column and no other.
-- ---------------------------------------------------------------------------
grant select on public.enrolments to tenant_reader;
grant insert (user_id, tenant_id, workbook_id, version_id) on public.enrolments to tenant_reader;
grant update (last_opened_at) on public.enrolments to tenant_reader;

drop policy if exists enrolments_tenant_reader_read on public.enrolments;
create policy enrolments_tenant_reader_read on public.enrolments for select to tenant_reader
  using (user_id = (select tenant_scope.uid()) and tenant_id = (select tenant_scope.tenant()));

drop policy if exists enrolments_tenant_reader_insert on public.enrolments;
create policy enrolments_tenant_reader_insert on public.enrolments for insert to tenant_reader
  with check (
    user_id = (select tenant_scope.uid())
    and tenant_id = (select tenant_scope.tenant())
    and (select tenant_scope.lists_workbook(workbook_id))
    and version_id = (select tenant_scope.current_version(workbook_id))
    -- Nothing new is started while the account's deletion is pending (R2-3).
    and (select tenant_scope.can_write()));

drop policy if exists enrolments_tenant_reader_update on public.enrolments;
create policy enrolments_tenant_reader_update on public.enrolments for update to tenant_reader
  using (user_id = (select tenant_scope.uid()) and tenant_id = (select tenant_scope.tenant()))
  with check (user_id = (select tenant_scope.uid()) and tenant_id = (select tenant_scope.tenant()));

-- progress_events: ids and times only (F-020), through an own enrolment in this tenant.
grant select, insert on public.progress_events to tenant_reader;
drop policy if exists progress_events_tenant_reader_read on public.progress_events;
create policy progress_events_tenant_reader_read on public.progress_events for select to tenant_reader
  using ((select tenant_scope.owns_enrolment(enrolment_id)));
drop policy if exists progress_events_tenant_reader_insert on public.progress_events;
create policy progress_events_tenant_reader_insert on public.progress_events for insert to tenant_reader
  with check ((select tenant_scope.owns_enrolment(enrolment_id)) and (select tenant_scope.can_write()));

-- A finished step marks a friend pairing (0066) only when the pairing is in
-- the same tenant as the enrolment the step was done on (R2-2). Pairs carry
-- the tenant of the inviter's enrolment, and friends exists on the
-- marketplace only, so a step done on a tenant host never writes a
-- marketplace pair's record. On the marketplace both are the marketplace
-- tenant, so nothing changes there. The body is 0066's with that one
-- condition added.
create or replace function app.record_pair_finish() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_workbook uuid; v_tenant uuid;
begin
  if new.kind <> 'step_done' or (new.ref is not null and new.ref like '%~r') then return new; end if;
  select e.user_id, e.workbook_id, e.tenant_id into v_user, v_workbook, v_tenant from public.enrolments e where e.id = new.enrolment_id;
  if v_user is null then return new; end if;
  insert into public.pair_finishes (pair_id, user_id, local_date)
  select p.id, v_user, app.london_today()
    from public.programme_pairs p
   where p.status = 'active' and p.workbook_id = v_workbook and p.tenant_id = v_tenant
     and v_user in (p.inviter_id, p.friend_id)
  on conflict do nothing;
  return new;
end $$;

-- answers: read only, sealed. Writes stay with the service role behind the
-- route's own checks, as for every reader (F-134).
grant select on public.answers to tenant_reader;
drop policy if exists answers_tenant_reader_read on public.answers;
create policy answers_tenant_reader_read on public.answers for select to tenant_reader
  using ((select tenant_scope.owns_enrolment(enrolment_id)));

-- workbook_sections: what is free on this tenant's own titles.
grant select on public.workbook_sections to tenant_reader;
drop policy if exists workbook_sections_tenant_reader_read on public.workbook_sections;
create policy workbook_sections_tenant_reader_read on public.workbook_sections for select to tenant_reader
  using ((select tenant_scope.section_open(version_id, kind, free)));

-- ---------------------------------------------------------------------------
-- 6. The gates a reader passes before reading: adults only (F-127), reader
-- terms (F-122) and health data consent (F-026). These are facts about the
-- one shared Akana account, not about a tenant, so tenant_reader gets no
-- grant on profiles or terms_acceptances. It gets four functions that act on
-- the caller's own row and nobody else's. Each refuses unless the token is
-- backed by a live scope (tenant_scope.live).
--
-- A tenant session is the weaker session, so these functions are narrow:
--   - they answer with booleans only: no dates, no versions, no detail,
--     and only what this site can act on. Faith consent is not taken here,
--     so it is not reported. A pending deletion is reported as can_write
--     and nothing more (R2-6)
--   - none of them writes while the account's deletion is pending (R2-3)
--   - health consent is given here once at most. If the reader has ever
--     withdrawn it, giving it again is for the Akana site alone (R2-1)
--   - they only ever add a fact that is missing. An adult confirmation, a
--     terms acceptance of the current version or a current consent that
--     already exists is left exactly as it is
--   - the version must be the current one: the terms register for terms,
--     app_config for consent. Nothing else can be recorded
--   - a terms acceptance is written here, not through app.accept_terms, so
--     it cannot use up the account's hourly limit there (AKT29). At most one
--     row per terms version can ever come from tenant sessions.
-- ---------------------------------------------------------------------------
insert into public.app_config (key, value) values
  ('health_consent_version', '"health-2026-10"'::jsonb),
  ('faith_consent_version', '"faith-2026-10"'::jsonb)
on conflict (key) do nothing;

-- Withdrawal of health consent (0006) clears the two profile columns and
-- kept no trace, so "never asked" and "withdrew" looked the same. This table
-- is the trace: one row per account that has ever withdrawn, written by a
-- trigger whenever health_consent_at goes from a value to null, whichever
-- path cleared it. 0006 is not edited. Giving consent again on the Akana
-- site does not remove the row. Withdrawals made before this migration left
-- no trace and cannot be recovered (docs/TENANT_SIGN_IN.md, open risks).
-- Nobody reads it but the function below and the service role.
create table if not exists public.health_consent_withdrawals (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  withdrawn_at timestamptz not null default now()
);
alter table public.health_consent_withdrawals enable row level security;
revoke all on public.health_consent_withdrawals from public, anon, authenticated, tenant_reader;
grant select, insert, update, delete on public.health_consent_withdrawals to service_role;

create or replace function app.record_health_consent_withdrawal() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.health_consent_withdrawals (user_id, withdrawn_at) values (new.user_id, now())
  on conflict (user_id) do update set withdrawn_at = excluded.withdrawn_at;
  return null;
end $$;
revoke execute on function app.record_health_consent_withdrawal() from public, anon, authenticated;

drop trigger if exists profiles_health_consent_withdrawal on public.profiles;
create trigger profiles_health_consent_withdrawal
  after update on public.profiles
  for each row when (old.health_consent_at is not null and new.health_consent_at is null)
  execute function app.record_health_consent_withdrawal();

drop function if exists public.tenant_reader_gates();
create or replace function public.tenant_reader_gates()
returns table (adult_confirmed boolean, terms_accepted boolean, health_consent boolean, can_write boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := tenant_scope.uid();
  v_cur text;
begin
  if v_uid is null or tenant_scope.tenant() is null then
    raise exception 'tenant reader session required' using errcode = 'insufficient_privilege';
  end if;
  select c.version into v_cur from app.current_terms('reader_terms') c;
  return query
    select coalesce(p.adult_confirmed_at is not null, false),
           v_cur is null or coalesce((select a.version from public.terms_acceptances a
             where a.user_id = v_uid and a.doc = 'reader_terms'
             order by a.accepted_at desc, a.id desc limit 1) = v_cur, false),
           coalesce(p.health_consent_at is not null and p.health_consent_version =
             (select c.value #>> '{}' from public.app_config c where c.key = 'health_consent_version'), false),
           not app.account_read_only(v_uid)
    from (select v_uid as user_id) u
    left join public.profiles p on p.user_id = u.user_id;
end $$;

-- Records the current reader terms for the caller if, and only if, their
-- latest acceptance is not already the current version. Internal: the two
-- public functions below call it after their own checks.
create or replace function tenant_scope.accept_current_terms(p_version text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := tenant_scope.uid();
  v_tenant uuid := tenant_scope.tenant();
  v_ver    public.terms_versions%rowtype;
  v_last   text;
begin
  if v_uid is null or v_tenant is null then
    raise exception 'tenant reader session required' using errcode = 'insufficient_privilege';
  end if;
  if app.account_read_only(v_uid) then
    raise exception 'read only while your account deletion is pending' using errcode = 'AKR01';
  end if;
  select v.* into v_ver from public.terms_versions v
    join app.current_terms('reader_terms') c on c.version = v.version
   where v.doc = 'reader_terms';
  if not found or p_version is distinct from v_ver.version then
    raise exception 'not the current reader terms' using errcode = 'AKT02';
  end if;
  select a.version into v_last from public.terms_acceptances a
   where a.user_id = v_uid and a.doc = 'reader_terms'
   order by a.accepted_at desc, a.id desc limit 1;
  if v_last is not distinct from v_ver.version then
    return false;
  end if;
  -- The tenant recorded is the one in the token, never one the caller names.
  insert into public.terms_acceptances (user_id, doc, version, context, was_draft, tenant_id, org_id, accepted_at)
  values (v_uid, 'reader_terms', v_ver.version, case when v_last is null then 'signup' else 'reask' end,
          v_ver.is_draft, v_tenant, null, now());
  return true;
end $$;
revoke execute on function tenant_scope.accept_current_terms(text) from public;

drop function if exists public.tenant_reader_accept_terms(text, text);
create or replace function public.tenant_reader_accept_terms(p_version text) returns boolean
language sql security definer set search_path = '' as $$
  select tenant_scope.accept_current_terms(p_version)
$$;

drop function if exists public.tenant_reader_confirm_adult(text);
create or replace function public.tenant_reader_confirm_adult(p_terms_version text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := tenant_scope.uid();
begin
  if v_uid is null or tenant_scope.tenant() is null then
    raise exception 'tenant reader session required' using errcode = 'insufficient_privilege';
  end if;
  if app.account_read_only(v_uid) then
    raise exception 'read only while your account deletion is pending' using errcode = 'AKR01';
  end if;
  perform tenant_scope.accept_current_terms(p_terms_version);
  -- Only ever fills an empty confirmation. An existing date is not moved.
  insert into public.profiles (user_id, adult_confirmed_at) values (v_uid, now())
  on conflict (user_id) do update set adult_confirmed_at = excluded.adult_confirmed_at
    where public.profiles.adult_confirmed_at is null;
  return true;
end $$;

drop function if exists public.tenant_reader_set_health_consent(text);
create or replace function public.tenant_reader_set_health_consent(p_version text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := tenant_scope.uid();
  v_cur text;
begin
  if v_uid is null or tenant_scope.tenant() is null then
    raise exception 'tenant reader session required' using errcode = 'insufficient_privilege';
  end if;
  if app.account_read_only(v_uid) then
    raise exception 'read only while your account deletion is pending' using errcode = 'AKR01';
  end if;
  select c.value #>> '{}' into v_cur from public.app_config c where c.key = 'health_consent_version';
  if v_cur is null or p_version is distinct from v_cur then
    raise exception 'not the current consent version' using errcode = 'check_violation';
  end if;
  -- A reader who has ever withdrawn this consent gives it again on the Akana
  -- site only, whatever the account holds now. The tenant session is the
  -- weaker one and must not undo that choice (R2-1).
  if exists (select 1 from public.health_consent_withdrawals w where w.user_id = v_uid) then
    raise exception 'health consent was withdrawn: manage it on the Akana site' using errcode = 'AKH09';
  end if;
  -- Consent to the current wording that already exists is left as it is,
  -- date included. Only a missing or out-of-date consent is written.
  insert into public.profiles (user_id, health_consent_at, health_consent_version) values (v_uid, now(), v_cur)
  on conflict (user_id) do update
    set health_consent_at = excluded.health_consent_at, health_consent_version = excluded.health_consent_version
    where public.profiles.health_consent_at is null or public.profiles.health_consent_version is distinct from v_cur;
  return true;
end $$;

revoke execute on function public.tenant_reader_gates(), public.tenant_reader_accept_terms(text),
  public.tenant_reader_confirm_adult(text), public.tenant_reader_set_health_consent(text) from public, anon, authenticated;
grant execute on function public.tenant_reader_gates(), public.tenant_reader_accept_terms(text),
  public.tenant_reader_confirm_adult(text), public.tenant_reader_set_health_consent(text) to tenant_reader;

-- ---------------------------------------------------------------------------
-- 7. Registering and revoking. Service role only. The sign-in action calls
-- register_tenant_session with the session id from the fresh token, before
-- any cookie is written, then refreshes so the hook issues a scoped token.
-- ---------------------------------------------------------------------------
create or replace function public.register_tenant_session(p_session uuid, p_user uuid, p_tenant uuid, p_host text)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_host text := lower(btrim(coalesce(p_host, '')));
begin
  if p_session is null or p_user is null or p_tenant is null or v_host = '' then
    raise exception 'tenant_session_invalid' using errcode = 'AKS01';
  end if;
  if not exists (select 1 from public.tenants t
                  where t.id = p_tenant and t.kind = 'white_label' and t.status = 'active') then
    raise exception 'tenant_session_invalid: tenant' using errcode = 'AKS01';
  end if;
  if not app.flag('tenant_sign_in', p_tenant) then
    raise exception 'tenant sign-in is switched off for this tenant' using errcode = 'AKS02';
  end if;
  if not exists (select 1 from auth.sessions s where s.id = p_session and s.user_id = p_user) then
    raise exception 'tenant_session_invalid: session' using errcode = 'AKS01';
  end if;
  -- An account with a verified second factor holds no tenant session (R2-7).
  if exists (select 1 from auth.mfa_factors f where f.user_id = p_user and f.status::text = 'verified') then
    raise exception 'tenant_session_invalid: second factor' using errcode = 'AKS10';
  end if;
  insert into public.tenant_session_scopes (session_id, user_id, tenant_id, host)
  values (p_session, p_user, p_tenant, v_host);
  return true;
end $$;

-- Ends every scoped session of a tenant, or only those created on one host.
-- revoked_at is set first and always: from then on the hook issues no token,
-- tenant_scope.live() finds nothing, so the database is closed to a token
-- that has not yet expired, and the browser's opaque id is dead. Deleting the
-- auth.sessions rows then removes the scope rows by cascade. If the delete is
-- not permitted the revoked rows stay, the revocation stands, and the audit
-- row says so. plpgsql compiles the body when it first runs, so the store
-- table of section 11 may be created later in this file.
create or replace function app.revoke_tenant_sessions(p_tenant uuid, p_host text, p_reason text)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_host    text := nullif(lower(btrim(coalesce(p_host, ''))), '');
  v_count   integer;
  v_deleted boolean := true;
begin
  update public.tenant_session_scopes s set revoked_at = now()
   where s.tenant_id = p_tenant and (v_host is null or s.host = v_host) and s.revoked_at is null;
  get diagnostics v_count = row_count;
  -- The browser's opaque ids for those sessions stop working at once (section 11).
  update public.tenant_browser_sessions b set revoked_at = now()
    from public.tenant_session_scopes s
   where s.session_id = b.session_id and s.tenant_id = p_tenant
     and (v_host is null or s.host = v_host) and s.revoked_at is not null and b.revoked_at is null;
  begin
    delete from auth.sessions a
     using public.tenant_session_scopes s
     where s.session_id = a.id and s.tenant_id = p_tenant
       and (v_host is null or s.host = v_host) and s.revoked_at is not null;
  exception when others then
    v_deleted := false;
  end;
  if v_count > 0 then
    perform app.audit('tenant_sessions.revoked',
      case when v_host is null then 'tenant:' || p_tenant::text else 'tenant_domain:' || v_host end,
      left(coalesce(p_reason, ''), 500),
      (select t.id from public.tenants t where t.id = p_tenant), null, null,
      jsonb_build_object('sessions', v_count, 'sessions_deleted', v_deleted));
  end if;
  return v_count;
end $$;

create or replace function public.revoke_tenant_sessions(p_tenant uuid, p_reason text)
returns integer
language sql security definer set search_path = '' as $$
  select app.revoke_tenant_sessions(p_tenant, null, p_reason)
$$;

revoke execute on function app.revoke_tenant_sessions(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.register_tenant_session(uuid, uuid, uuid, text),
  public.revoke_tenant_sessions(uuid, text) from public, anon, authenticated;
grant execute on function public.register_tenant_session(uuid, uuid, uuid, text),
  public.revoke_tenant_sessions(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 8. A tenant host that is removed, or stopped by the three-strike check
-- (0033), takes its scoped sessions with it. A trigger, so the 0033
-- functions are not redefined. It fires only when a verified host stops
-- being verified.
-- ---------------------------------------------------------------------------
create or replace function app.tenant_domain_revoke_sessions() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.verified_at is not null and (tg_op = 'DELETE' or new.verified_at is null) then
    perform app.revoke_tenant_sessions(old.tenant_id, old.host::text,
      case when tg_op = 'DELETE' then 'tenant host removed' else 'tenant host stopped' end);
  end if;
  return null;
end $$;
revoke execute on function app.tenant_domain_revoke_sessions() from public, anon, authenticated;

drop trigger if exists tenant_domains_revoke_sessions on public.tenant_domains;
create trigger tenant_domains_revoke_sessions
  after delete or update of verified_at on public.tenant_domains
  for each row execute function app.tenant_domain_revoke_sessions();

-- A tenant that stops being active (suspended or closed) loses its scoped
-- sessions too. tenant_scope.live() and the hook already refuse them from the
-- moment the status changes; this ends them and writes the audit row.
create or replace function app.tenant_status_revoke_sessions() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'active' and new.status is distinct from 'active' then
    perform app.revoke_tenant_sessions(new.id, null, 'tenant ' || new.status);
  end if;
  return null;
end $$;
revoke execute on function app.tenant_status_revoke_sessions() from public, anon, authenticated;

drop trigger if exists tenants_revoke_sessions on public.tenants;
create trigger tenants_revoke_sessions
  after update of status on public.tenants
  for each row execute function app.tenant_status_revoke_sessions();

-- ---------------------------------------------------------------------------
-- 9. The flag. Off everywhere. Switched on per tenant with a row of scope
-- 'tenant' (docs/TENANT_SIGN_IN.md, go-live). The proxy asks through
-- tenant_sign_in_enabled, which also refuses a tenant that is not an active
-- white-label tenant.
-- ---------------------------------------------------------------------------
--
-- feature_flags_write (0001) lets a platform owner or a safety reviewer write
-- any flag row directly. For this key that would switch sign-in on with no
-- audit row, or off with nobody signed out. So rows with this key change
-- only inside public.set_tenant_sign_in below, which sets a marker for its
-- own transaction; a trigger refuses every other write, whoever makes it.
-- The global row therefore stays off for good.
create or replace function app.guard_tenant_sign_in_flag() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not ((tg_op <> 'INSERT' and old.key = 'tenant_sign_in') or (tg_op <> 'DELETE' and new.key = 'tenant_sign_in')) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if coalesce(current_setting('akana.tenant_sign_in_switch', true), '') <> 'on' then
    raise exception 'tenant_sign_in changes only through public.set_tenant_sign_in' using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke execute on function app.guard_tenant_sign_in_flag() from public, anon, authenticated;

drop trigger if exists feature_flags_tenant_sign_in_guard on public.feature_flags;
create trigger feature_flags_tenant_sign_in_guard
  before insert or update or delete on public.feature_flags
  for each row execute function app.guard_tenant_sign_in_flag();

do $$ begin
  perform set_config('akana.tenant_sign_in_switch', 'on', true);
  insert into public.feature_flags (key, scope, enabled, reason) values
    ('tenant_sign_in', 'global', false, 'F-133: reader sign-in on tenant hosts. Per tenant. Enable the access token hook first.')
  on conflict (key, scope, scope_id) do nothing;
  perform set_config('akana.tenant_sign_in_switch', '', true);
end $$;

create or replace function public.tenant_sign_in_enabled(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_tenant is not null
     and app.flag('tenant_sign_in', p_tenant)
     and exists (select 1 from public.tenants t
                  where t.id = p_tenant and t.kind = 'white_label' and t.status = 'active')
$$;
revoke execute on function public.tenant_sign_in_enabled(uuid) from public;
grant execute on function public.tenant_sign_in_enabled(uuid) to anon, authenticated, service_role;

-- The switch, for /admin/white-label/[id]. Platform owners only, like every
-- flag (0064), in a session that has passed a second factor, and always with
-- a reason. Switching off ends the tenant's scoped sessions in the same
-- transaction, so nothing is left signed in on a host that no longer offers
-- sign-in. Audited either way, with the reason.
create or replace function public.set_tenant_sign_in(p_tenant uuid, p_enabled boolean, p_reason text default null)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_before boolean;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not app.is_platform(array['owner']) then
    raise exception 'only platform owners change feature flags' using errcode = 'insufficient_privilege';
  end if;
  -- Owners act with a second factor, like every staff action (0032). Checked
  -- here because this function is new and has no 0032 wrapper (R2-4).
  perform app.require_role_mfa(null);
  if p_enabled is null then
    raise exception 'say whether sign-in is on' using errcode = 'invalid_parameter_value';
  end if;
  if v_reason is null then
    raise exception 'give a reason' using errcode = 'check_violation';
  end if;
  if length(coalesce(v_reason, '')) > 500 then
    raise exception 'a reason of 500 characters or fewer' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.tenants t where t.id = p_tenant and t.kind = 'white_label') then
    raise exception 'not a white-label tenant' using errcode = 'no_data_found';
  end if;
  select f.enabled into v_before from public.feature_flags f
   where f.key = 'tenant_sign_in' and f.scope = 'tenant' and f.scope_id = p_tenant::text for update;
  perform set_config('akana.tenant_sign_in_switch', 'on', true);
  insert into public.feature_flags (key, scope, scope_id, enabled, reason, updated_by, updated_at)
  values ('tenant_sign_in', 'tenant', p_tenant::text, p_enabled, v_reason, app.uid(), now())
  on conflict (key, scope, scope_id) do update
    set enabled = excluded.enabled, reason = coalesce(excluded.reason, public.feature_flags.reason),
        updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  perform set_config('akana.tenant_sign_in_switch', '', true);
  perform app.audit('flag.changed', 'flag:tenant_sign_in', v_reason, p_tenant, null,
    jsonb_build_object('enabled', coalesce(v_before, false)), jsonb_build_object('enabled', p_enabled));
  if not p_enabled then
    perform app.revoke_tenant_sessions(p_tenant, null, 'tenant sign-in switched off');
  end if;
  return p_enabled;
end $$;
revoke execute on function public.set_tenant_sign_in(uuid, boolean, text) from public, anon;
grant execute on function public.set_tenant_sign_in(uuid, boolean, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 10. Akana's own sign-in code for tenant hosts. A reader on a tenant host
-- never types a Supabase code: that code is good for the whole account, and
-- the tenant controls the domain it would be typed on. This one is made by
-- Akana's server, bound to one tenant and one address, and worth nothing
-- anywhere else. The server keeps only an HMAC of it (the key never reaches
-- the database). One live code per tenant and address; asking again replaces
-- it. Ten minutes, single use, dead after five wrong tries. Service role only.
--
-- At most five codes an hour for one tenant and address (R2-5). The count is
-- kept on the row and checked in the same statement that writes the code,
-- under the row's lock, so it holds on every server instance and whatever
-- happens to the app's own limiter. With five tries per code that bounds
-- guessing at 25 tries an hour. issue_tenant_sign_in_code answers true when
-- a code was stored and false when the limit refused it: one shape, and
-- neither looks at whether the address has an account.
-- ---------------------------------------------------------------------------
create table if not exists public.tenant_sign_in_codes (
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  email       text not null check (email = lower(email) and length(email) between 3 and 254),
  code_hash   text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  expires_at  timestamptz not null,
  attempts    smallint not null default 0,
  consumed_at timestamptz,
  created_at  timestamptz not null default now(),
  -- The hour being counted, and the codes issued in it.
  window_started_at timestamptz not null default now(),
  issued_in_window  smallint not null default 1,
  primary key (tenant_id, email)
);
alter table public.tenant_sign_in_codes enable row level security;
revoke all on public.tenant_sign_in_codes from public, anon, authenticated, tenant_reader;
grant select, insert, update, delete on public.tenant_sign_in_codes to service_role;

create or replace function public.issue_tenant_sign_in_code(p_tenant uuid, p_email text, p_code_hash text, p_ttl_seconds integer default 600)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if p_tenant is null or v_email = '' or p_code_hash is null or p_ttl_seconds is null or p_ttl_seconds < 60 or p_ttl_seconds > 900 then
    raise exception 'tenant_code_invalid' using errcode = 'AKS03';
  end if;
  if not exists (select 1 from public.tenants t where t.id = p_tenant and t.kind = 'white_label' and t.status = 'active')
     or not app.flag('tenant_sign_in', p_tenant) then
    raise exception 'tenant sign-in is switched off for this tenant' using errcode = 'AKS02';
  end if;
  delete from public.tenant_sign_in_codes c where c.expires_at < now() - interval '1 day';
  -- One statement: the conflict takes the row's lock, the where clause is the
  -- limit. Over the limit nothing is written and the live code stays as it is.
  insert into public.tenant_sign_in_codes as c (tenant_id, email, code_hash, expires_at)
  values (p_tenant, v_email, p_code_hash, now() + make_interval(secs => p_ttl_seconds))
  on conflict (tenant_id, email) do update
    set code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, consumed_at = null, created_at = now(),
        window_started_at = case when c.window_started_at <= now() - interval '1 hour' then now() else c.window_started_at end,
        issued_in_window  = case when c.window_started_at <= now() - interval '1 hour' then 1 else c.issued_in_window + 1 end
    where c.window_started_at <= now() - interval '1 hour' or c.issued_in_window < 5;
  return found;
end $$;

-- True once, for the right code, in time. Every other outcome is false and
-- says nothing about why. A wrong try is counted; the fifth kills the code,
-- after which even the right one is refused.
create or replace function public.check_tenant_sign_in_code(p_tenant uuid, p_email text, p_code_hash text)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  c public.tenant_sign_in_codes%rowtype;
begin
  if p_tenant is null or v_email = '' or p_code_hash is null then return false; end if;
  if not exists (select 1 from public.tenants t where t.id = p_tenant and t.kind = 'white_label' and t.status = 'active')
     or not app.flag('tenant_sign_in', p_tenant) then
    return false;
  end if;
  select * into c from public.tenant_sign_in_codes x where x.tenant_id = p_tenant and x.email = v_email for update;
  if not found or c.consumed_at is not null or c.expires_at <= now() or c.attempts >= 5 then
    return false;
  end if;
  if c.code_hash = p_code_hash then
    update public.tenant_sign_in_codes x set consumed_at = now() where x.tenant_id = p_tenant and x.email = v_email;
    return true;
  end if;
  update public.tenant_sign_in_codes x set attempts = x.attempts + 1 where x.tenant_id = p_tenant and x.email = v_email;
  return false;
end $$;

revoke execute on function public.issue_tenant_sign_in_code(uuid, text, text, integer),
  public.check_tenant_sign_in_code(uuid, text, text) from public, anon, authenticated;
grant execute on function public.issue_tenant_sign_in_code(uuid, text, text, integer),
  public.check_tenant_sign_in_code(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 11. The session store behind the tenant cookie. The browser on a tenant
-- host holds an opaque random id and nothing else. The Supabase session it
-- stands for lives here, sealed with a server key, and never reaches the
-- browser, so nobody who controls a tenant's domain can take a Supabase
-- token to the Auth API or to another host. Only the sha256 of the id is
-- stored. A row is good for one tenant: the server looks it up with the
-- tenant the proxy resolved. version is the compare-and-swap counter for
-- concurrent refreshes. The row goes when its scope row goes (cascade).
-- Service role only.
-- ---------------------------------------------------------------------------
create table if not exists public.tenant_browser_sessions (
  id_hash      text primary key check (id_hash ~ '^[0-9a-f]{64}$'),
  tenant_id    uuid not null references public.tenants(id),
  user_id      uuid not null references auth.users(id) on delete cascade,
  session_id   uuid not null unique references public.tenant_session_scopes(session_id) on delete cascade,
  sealed       text not null,
  version      integer not null default 1,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at   timestamptz not null,
  revoked_at   timestamptz
);
create index if not exists tenant_browser_sessions_tenant_idx on public.tenant_browser_sessions (tenant_id);
alter table public.tenant_browser_sessions enable row level security;
revoke all on public.tenant_browser_sessions from public, anon, authenticated, tenant_reader;
grant select, insert, update, delete on public.tenant_browser_sessions to service_role;
