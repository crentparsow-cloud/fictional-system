-- Health data consent (F-026). Each block must raise or return the expected
-- result; a failure aborts the script and the CI step.
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('a6a6a6a6-0000-0000-0000-0000000000a1', 'consent-a@test'),
  ('a6a6a6a6-0000-0000-0000-0000000000b1', 'consent-b@test');

-- Reader A gives consent through the function and reads it back under RLS.
savepoint s1;
select test_as('a6a6a6a6-0000-0000-0000-0000000000a1');
do $$ declare v_at timestamptz; v_ver text; n int; begin
  select count(*) into n from public.profiles where health_consent_at is not null;
  if n <> 0 then raise exception 'reader A started with consent recorded'; end if;

  perform public.set_health_consent('health-2026-10');
  select health_consent_at, health_consent_version into v_at, v_ver
    from public.profiles where user_id = 'a6a6a6a6-0000-0000-0000-0000000000a1';
  if v_at is null or v_ver <> 'health-2026-10' then raise exception 'reader A consent not recorded: % %', v_at, v_ver; end if;

  -- RLS still shows only their own row
  select count(*) into n from public.profiles;
  if n <> 1 then raise exception 'reader A saw % profile rows', n; end if;

  -- a malformed version is refused
  begin
    perform public.set_health_consent('Not A Version!');
    raise exception 'a malformed consent version was accepted';
  exception when check_violation then null; end;

  -- direct writes to the consent columns are refused, even on their own row
  begin
    update public.profiles set health_consent_version = 'health-forged' where user_id = 'a6a6a6a6-0000-0000-0000-0000000000a1';
    raise exception 'reader A wrote the consent version directly';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set health_consent_at = null, health_consent_version = null where user_id = 'a6a6a6a6-0000-0000-0000-0000000000a1';
    raise exception 'reader A cleared consent without the function';
  exception when insufficient_privilege then null; end;

  -- ordinary profile updates still work
  update public.profiles set display_name = 'A' where user_id = 'a6a6a6a6-0000-0000-0000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'reader A could not update their display name'; end if;

  -- withdrawal clears both columns
  perform public.clear_health_consent();
  select health_consent_at, health_consent_version into v_at, v_ver
    from public.profiles where user_id = 'a6a6a6a6-0000-0000-0000-0000000000a1';
  if v_at is not null or v_ver is not null then raise exception 'reader A withdrawal left %, %', v_at, v_ver; end if;

  -- and consent can be given again
  perform app.set_health_consent('health-2026-10');
  select health_consent_at into v_at from public.profiles where user_id = 'a6a6a6a6-0000-0000-0000-0000000000a1';
  if v_at is null then raise exception 'reader A could not give consent again'; end if;
end $$;

-- Reader B cannot set or clear another reader's consent. The functions take
-- no user argument, so B's calls touch B's row only; B cannot see or update
-- A's row directly either.
select test_as('a6a6a6a6-0000-0000-0000-0000000000b1');
do $$ declare n int; begin
  perform public.clear_health_consent();
  perform public.set_health_consent('health-b');
  update public.profiles set display_name = 'hijack' where user_id = 'a6a6a6a6-0000-0000-0000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'reader B updated reader A''s profile'; end if;
  select count(*) into n from public.profiles where user_id = 'a6a6a6a6-0000-0000-0000-0000000000a1';
  if n <> 0 then raise exception 'reader B can see reader A''s profile'; end if;
end $$;

reset role;
do $$ declare v_ver text; v_at timestamptz; begin
  select health_consent_version, health_consent_at into v_ver, v_at
    from public.profiles where user_id = 'a6a6a6a6-0000-0000-0000-0000000000a1';
  if v_ver is distinct from 'health-2026-10' or v_at is null then
    raise exception 'reader B changed reader A''s consent: %', v_ver;
  end if;
  select health_consent_version into v_ver from public.profiles where user_id = 'a6a6a6a6-0000-0000-0000-0000000000b1';
  if v_ver is distinct from 'health-b' then raise exception 'reader B''s own consent not recorded'; end if;
end $$;

-- Anon is refused both functions outright.
set local role anon;
do $$ begin
  begin
    perform public.set_health_consent('health-2026-10');
    raise exception 'anon gave consent';
  exception when insufficient_privilege then null; end;
  begin
    perform app.set_health_consent('health-2026-10');
    raise exception 'anon called app.set_health_consent';
  exception when insufficient_privilege then null; end;
  begin
    perform public.clear_health_consent();
    raise exception 'anon withdrew consent';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- An authenticated role with no user id is refused too.
do $$ begin
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role authenticated';
  begin
    perform public.set_health_consent('health-2026-10');
    raise exception 'a session with no user gave consent';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback to savepoint s1;

rollback;
\echo PASS 0006_consent
