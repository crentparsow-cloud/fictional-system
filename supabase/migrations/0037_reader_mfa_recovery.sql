-- 0037 Recovery codes for readers' optional two-step sign-in (13.2).
--
-- A reader may turn on an authenticator app for their own account from the
-- You tab (/you/security). It is never required for readers. Supabase Auth
-- holds the TOTP factor; it issues no recovery codes, so Akana keeps them
-- here. When the reader turns two-step sign-in on, or asks for new codes,
-- the app makes eight random codes, shows them once, and stores only their
-- SHA-256 hashes. A reader who has lost the authenticator enters one code at
-- /verify; the app checks it here, then removes the TOTP factor with the
-- service role and clears the remaining codes, so two-step sign-in is off
-- and the reader can set it up again. A code never lifts a session to aal2
-- on its own: Supabase has no API for that, and turning the factor off is
-- the honest result of "I lost my phone".
--
-- Owners, finance members and staff get no codes: their reset stays a
-- support task with identity checks (docs/SUPPORT_MFA_RECOVERY.md). The
-- issue function refuses them (AKR03) so a reader-only feature cannot become
-- a way round that.
--
-- Rules, as in 0001 to 0035. The table has row level security with a
-- select policy for the owner only (to count what is left); every write goes
-- through a security definer function with search_path pinned to ''.
-- Execute is revoked from public first and granted back to the role that
-- needs it. Nothing earlier is edited. Depends on 0001 (app.uid, app.is_staff,
-- app.audit) and 0032 (app.session_mfa_verified) only.
--
-- Audit actions (no code, hash or count of failures in the row):
--   mfa_recovery.issued    codes issued or replaced (after: count)
--   mfa_recovery.used      a code accepted; the app then removes the factor
--   mfa_recovery.cleared   the reader turned two-step sign-in off
--
-- Error codes:
--   AKR01  not signed in
--   AKR02  too many wrong codes in the last hour (10); try later
--   AKR03  this account's second factor is managed by support, not codes
--   AKR04  the session has not passed the authenticator just now (aal2 needed to issue)
--   AKR05  a code hash is not 64 lower-case hex characters, or the count is not 1 to 10

-- ---------------------------------------------------------------------------
-- 1. Tables.
-- ---------------------------------------------------------------------------
create table public.mfa_recovery_codes (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  code_hash   text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  created_at  timestamptz not null default now(),
  used_at     timestamptz,
  unique (user_id, code_hash)
);
create index mfa_recovery_codes_user_idx on public.mfa_recovery_codes(user_id) where used_at is null;

-- Wrong attempts, so a code cannot be guessed. Rows older than an hour are
-- dropped on the next attempt by the same user.
create table public.mfa_recovery_attempts (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  attempted_at  timestamptz not null default now()
);
create index mfa_recovery_attempts_user_idx on public.mfa_recovery_attempts(user_id, attempted_at desc);

alter table public.mfa_recovery_codes    enable row level security;
alter table public.mfa_recovery_attempts enable row level security;

-- The owner reads their own rows, to show how many codes are left. Nobody
-- writes from a client: no insert, update or delete grant, no policy for
-- them. The attempts table has no client access at all.
grant select on public.mfa_recovery_codes to authenticated;
create policy mfa_recovery_codes_read_own on public.mfa_recovery_codes for select to authenticated
  using (user_id = (select app.uid()));

-- ---------------------------------------------------------------------------
-- 2. Functions.
-- ---------------------------------------------------------------------------

-- Readers only: staff, owners and finance members are refused (AKR03).
create or replace function app.mfa_recovery_reader_only() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if app.uid() is null then
    raise exception 'sign in first' using errcode = 'AKR01';
  end if;
  if app.is_staff() or exists (
    select 1 from public.org_members m where m.user_id = app.uid() and m.role in ('owner', 'finance')) then
    raise exception 'this account''s second factor is managed by support' using errcode = 'AKR03';
  end if;
end $$;

-- Replace the caller's codes with these hashes. The session must have passed
-- the authenticator just now (aal2), which it has right after enrolment and
-- whenever the reader is inside /you with two-step sign-in on. Returns the
-- number stored.
create or replace function public.mfa_recovery_codes_issue(p_hashes text[]) returns int
language plpgsql volatile security definer set search_path = '' as $$
declare v_n int;
begin
  perform app.mfa_recovery_reader_only();
  if not app.session_mfa_verified() then
    raise exception 'verify with your authenticator app first' using errcode = 'AKR04';
  end if;
  if p_hashes is null or cardinality(p_hashes) < 1 or cardinality(p_hashes) > 10
     or exists (select 1 from unnest(p_hashes) h where h !~ '^[0-9a-f]{64}$') then
    raise exception 'recovery code hashes malformed' using errcode = 'AKR05';
  end if;
  delete from public.mfa_recovery_codes where user_id = app.uid();
  insert into public.mfa_recovery_codes (user_id, code_hash)
  select app.uid(), h from unnest(p_hashes) h on conflict do nothing;
  get diagnostics v_n = row_count;
  perform app.audit('mfa_recovery.issued', 'user:' || app.uid()::text, null, null, null, null, jsonb_build_object('count', v_n));
  return v_n;
end $$;

-- Spend a code. Works at aal1: the point is that the authenticator is gone.
-- True when the hash matched an unused code, which is then marked used.
-- False otherwise, with the attempt counted; the eleventh wrong attempt in
-- an hour raises AKR02 instead. The same answer whether or not the reader
-- has any codes, so nothing is learned by trying.
create or replace function public.mfa_recovery_code_use(p_hash text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare v_id bigint;
begin
  if app.uid() is null then
    raise exception 'sign in first' using errcode = 'AKR01';
  end if;
  delete from public.mfa_recovery_attempts where user_id = app.uid() and attempted_at < now() - interval '1 hour';
  if (select count(*) from public.mfa_recovery_attempts where user_id = app.uid()) >= 10 then
    raise exception 'too many attempts, try again later' using errcode = 'AKR02';
  end if;
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then
    insert into public.mfa_recovery_attempts (user_id) values (app.uid());
    return false;
  end if;
  update public.mfa_recovery_codes set used_at = now()
   where user_id = app.uid() and code_hash = p_hash and used_at is null
  returning id into v_id;
  if v_id is null then
    insert into public.mfa_recovery_attempts (user_id) values (app.uid());
    return false;
  end if;
  delete from public.mfa_recovery_attempts where user_id = app.uid();
  perform app.audit('mfa_recovery.used', 'user:' || app.uid()::text);
  return true;
end $$;

-- Two-step sign-in turned off: the codes go too. Any level, because the
-- app calls this right after a recovery code was used at aal1 as well as
-- from the You tab at aal2.
create or replace function public.mfa_recovery_codes_clear() returns int
language plpgsql volatile security definer set search_path = '' as $$
declare v_n int;
begin
  if app.uid() is null then
    raise exception 'sign in first' using errcode = 'AKR01';
  end if;
  delete from public.mfa_recovery_codes where user_id = app.uid();
  get diagnostics v_n = row_count;
  if v_n > 0 then
    perform app.audit('mfa_recovery.cleared', 'user:' || app.uid()::text, null, null, null, jsonb_build_object('count', v_n), null);
  end if;
  return v_n;
end $$;

-- How many unused codes the caller has. Cheaper than reading the rows.
create or replace function public.mfa_recovery_codes_left() returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.mfa_recovery_codes where user_id = app.uid() and used_at is null
$$;

-- ---------------------------------------------------------------------------
-- 3. Execute.
-- ---------------------------------------------------------------------------
-- The helper is reached only through the functions below.
revoke execute on function app.mfa_recovery_reader_only() from public, anon, authenticated, service_role;

revoke execute on function
  public.mfa_recovery_codes_issue(text[]), public.mfa_recovery_code_use(text),
  public.mfa_recovery_codes_clear(), public.mfa_recovery_codes_left()
  from public, anon;

grant execute on function
  public.mfa_recovery_codes_issue(text[]), public.mfa_recovery_code_use(text),
  public.mfa_recovery_codes_clear(), public.mfa_recovery_codes_left()
  to authenticated;
