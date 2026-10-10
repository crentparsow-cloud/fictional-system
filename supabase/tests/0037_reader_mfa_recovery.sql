-- Recovery codes for readers' optional two-step sign-in (0037, 13.2). A
-- reader at aal2 issues codes and sees only their own; a code is spent once,
-- at aal1; wrong guesses are counted and the eleventh in an hour is refused;
-- an owner, a finance member and staff cannot issue codes; nobody writes the
-- table from a client. Each block must raise or return the expected value; a
-- failure aborts the script.
\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------------------
-- Fixtures: 01 and 02 readers, 03 an organisation owner, 04 finance, 05 staff.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('a0370000-0000-0000-0000-000000000001', 'reader37a@home37.example'),
  ('a0370000-0000-0000-0000-000000000002', 'reader37b@home37.example'),
  ('a0370000-0000-0000-0000-000000000003', 'owner37@work37.example'),
  ('a0370000-0000-0000-0000-000000000004', 'finance37@work37.example'),
  ('a0370000-0000-0000-0000-000000000005', 'staff37@akana.example');
insert into public.organisations (id, kind, legal_name, display_name, slug, country) values
  ('a0370000-0000-0000-0000-0000000000f1', 'business', 'Biz 37 Ltd', 'Biz 37', 'biz-37', 'GB');
insert into public.org_members (org_id, user_id, role) values
  ('a0370000-0000-0000-0000-0000000000f1', 'a0370000-0000-0000-0000-000000000003', 'owner'),
  ('a0370000-0000-0000-0000-0000000000f1', 'a0370000-0000-0000-0000-000000000004', 'finance');

-- Act as a user at a given level, as in 0032's and 0034's tests.
create or replace function pg_temp.as_level(p_user uuid, p_aal text, p_amr jsonb, p_roles text[] default '{}') returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal, 'amr', p_amr,
    'app_metadata', jsonb_build_object('platform_roles', to_jsonb(p_roles)))::text, true);
  execute 'set local role authenticated';
end $$;
create or replace function pg_temp.pw() returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint)) $$;
create or replace function pg_temp.totp() returns jsonb language sql as $$
  select pg_temp.pw() || jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint - 60)) $$;
-- A hash the way the app makes one: sha256 hex of the normalised code.
create or replace function pg_temp.h(p text) returns text language sql immutable as $$ select encode(sha256(convert_to(p, 'UTF8')), 'hex') $$;

-- ---------------------------------------------------------------------------
-- 1. A reader at aal1 cannot issue codes (AKR04); at aal2 they can.
-- ---------------------------------------------------------------------------
select pg_temp.as_level('a0370000-0000-0000-0000-000000000001', 'aal1', pg_temp.pw());
do $$ begin
  perform public.mfa_recovery_codes_issue(array[pg_temp.h('A1')]);
  raise exception 'issued at aal1';
exception when sqlstate 'AKR04' then null; end $$;
reset role;

select pg_temp.as_level('a0370000-0000-0000-0000-000000000001', 'aal2', pg_temp.totp());
do $$ begin
  if public.mfa_recovery_codes_issue(array[pg_temp.h('A1'), pg_temp.h('A2'), pg_temp.h('A3')]) <> 3 then raise exception 'issue count'; end if;
  if public.mfa_recovery_codes_left() <> 3 then raise exception 'left after issue'; end if;
  if (select count(*) from public.mfa_recovery_codes) <> 3 then raise exception 'reader sees other than own rows'; end if;
  -- Malformed hashes and too many are refused.
  begin
    perform public.mfa_recovery_codes_issue(array['not-a-hash']);
    raise exception 'malformed hash accepted';
  exception when sqlstate 'AKR05' then null; end;
  begin
    perform public.mfa_recovery_codes_issue(array_fill(pg_temp.h('x'), array[11]));
    raise exception 'eleven hashes accepted';
  exception when sqlstate 'AKR05' then null; end;
  -- Re-issue replaces, never adds.
  if public.mfa_recovery_codes_issue(array[pg_temp.h('B1'), pg_temp.h('B2')]) <> 2 then raise exception 'reissue count'; end if;
  if public.mfa_recovery_codes_left() <> 2 then raise exception 'left after reissue'; end if;
  if exists (select 1 from public.mfa_recovery_codes where code_hash = pg_temp.h('A1')) then raise exception 'old code kept'; end if;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.audit_log where action = 'mfa_recovery.issued' and target = 'user:a0370000-0000-0000-0000-000000000001') <> 2 then
    raise exception 'issue audit rows'; end if;
  if exists (select 1 from public.audit_log where action = 'mfa_recovery.issued' and (after::text like '%' || pg_temp.h('B1') || '%')) then
    raise exception 'audit row carries a hash'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The second reader sees none of the first reader's rows and cannot write them.
-- ---------------------------------------------------------------------------
select pg_temp.as_level('a0370000-0000-0000-0000-000000000002', 'aal2', pg_temp.totp());
do $$ begin
  if (select count(*) from public.mfa_recovery_codes) <> 0 then raise exception 'cross-reader read'; end if;
  if public.mfa_recovery_codes_left() <> 0 then raise exception 'cross-reader count'; end if;
  begin
    insert into public.mfa_recovery_codes (user_id, code_hash) values ('a0370000-0000-0000-0000-000000000002', pg_temp.h('Z'));
    raise exception 'client insert allowed';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.mfa_recovery_codes;
    raise exception 'client delete allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform count(*) from public.mfa_recovery_attempts;
    raise exception 'attempts readable';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. Using a code at aal1: wrong is false and counted, right is true once.
-- ---------------------------------------------------------------------------
select pg_temp.as_level('a0370000-0000-0000-0000-000000000001', 'aal1', pg_temp.pw());
do $$ begin
  if public.mfa_recovery_code_use(pg_temp.h('WRONG')) then raise exception 'wrong code accepted'; end if;
  if public.mfa_recovery_code_use('junk') then raise exception 'junk accepted'; end if;
  if not public.mfa_recovery_code_use(pg_temp.h('B1')) then raise exception 'right code refused'; end if;
  if public.mfa_recovery_code_use(pg_temp.h('B1')) then raise exception 'code spent twice'; end if;
  if public.mfa_recovery_codes_left() <> 1 then raise exception 'left after use'; end if;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.audit_log where action = 'mfa_recovery.used' and target = 'user:a0370000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'use audit row'; end if;
  -- The right code cleared the attempt count; the one after it is the first of a new run.
  if (select count(*) from public.mfa_recovery_attempts where user_id = 'a0370000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'attempt count after success'; end if;
end $$;

-- Ten wrong guesses in an hour, then AKR02 even for the right code.
select pg_temp.as_level('a0370000-0000-0000-0000-000000000001', 'aal1', pg_temp.pw());
do $$ declare i int; begin
  for i in 1..9 loop perform public.mfa_recovery_code_use(pg_temp.h('WRONG' || i)); end loop;
  begin
    perform public.mfa_recovery_code_use(pg_temp.h('B2'));
    raise exception 'eleventh attempt not refused';
  exception when sqlstate 'AKR02' then null; end;
  if public.mfa_recovery_codes_left() <> 1 then raise exception 'code spent while locked'; end if;
end $$;
reset role;
-- An hour later the lock lifts.
update public.mfa_recovery_attempts set attempted_at = attempted_at - interval '2 hours' where user_id = 'a0370000-0000-0000-0000-000000000001';
select pg_temp.as_level('a0370000-0000-0000-0000-000000000001', 'aal1', pg_temp.pw());
do $$ begin
  if not public.mfa_recovery_code_use(pg_temp.h('B2')) then raise exception 'code refused after lock lifted'; end if;
  if public.mfa_recovery_codes_left() <> 0 then raise exception 'left after last code'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. Clearing: at any level, own rows only, audited when something went.
-- ---------------------------------------------------------------------------
select pg_temp.as_level('a0370000-0000-0000-0000-000000000002', 'aal2', pg_temp.totp());
select public.mfa_recovery_codes_issue(array[pg_temp.h('C1'), pg_temp.h('C2')]);
reset role;
select pg_temp.as_level('a0370000-0000-0000-0000-000000000001', 'aal1', pg_temp.pw());
do $$ begin
  if public.mfa_recovery_codes_clear() <> 2 then raise exception 'clear count'; end if;   -- the two spent B codes
  if public.mfa_recovery_codes_clear() <> 0 then raise exception 'second clear'; end if;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.mfa_recovery_codes where user_id = 'a0370000-0000-0000-0000-000000000002') <> 2 then
    raise exception 'clear touched another reader'; end if;
  if (select count(*) from public.audit_log where action = 'mfa_recovery.cleared' and target = 'user:a0370000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'clear audit rows'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Owner, finance and staff cannot issue codes (AKR03), even at aal2.
-- ---------------------------------------------------------------------------
select pg_temp.as_level('a0370000-0000-0000-0000-000000000003', 'aal2', pg_temp.totp());
do $$ begin
  perform public.mfa_recovery_codes_issue(array[pg_temp.h('O1')]);
  raise exception 'owner issued codes';
exception when sqlstate 'AKR03' then null; end $$;
reset role;
select pg_temp.as_level('a0370000-0000-0000-0000-000000000004', 'aal2', pg_temp.totp());
do $$ begin
  perform public.mfa_recovery_codes_issue(array[pg_temp.h('F1')]);
  raise exception 'finance issued codes';
exception when sqlstate 'AKR03' then null; end $$;
reset role;
select pg_temp.as_level('a0370000-0000-0000-0000-000000000005', 'aal2', pg_temp.totp(), array['editor']);
do $$ begin
  perform public.mfa_recovery_codes_issue(array[pg_temp.h('S1')]);
  raise exception 'staff issued codes';
exception when sqlstate 'AKR03' then null; end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 6. Anon reaches nothing.
-- ---------------------------------------------------------------------------
do $$ begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  execute 'set local role anon';
  begin
    perform public.mfa_recovery_code_use(pg_temp.h('B1'));
    raise exception 'anon used a code';
  exception when insufficient_privilege then null; end;
  begin
    perform count(*) from public.mfa_recovery_codes;
    raise exception 'anon read codes';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

rollback;
\echo PASS 0037_reader_mfa_recovery
