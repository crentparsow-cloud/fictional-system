-- 0064 Platform: cohort flags, white-label shape, reader prompts.
-- Each block must raise or return the expected value; a failure aborts the script.
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('a6400000-0000-0000-0000-000000000001', 'owner64@test'),
  ('a6400000-0000-0000-0000-000000000002', 'reader64a@test'),
  ('a6400000-0000-0000-0000-000000000003', 'reader64b@test');
insert into public.platform_roles (user_id, role) values ('a6400000-0000-0000-0000-000000000001', 'owner');

-- ---------------------------------------------------------------------------
-- 1. Bucketing is deterministic, within 0 to 99, and matches the app's known value
-- ---------------------------------------------------------------------------
do $$ declare b1 int; b2 int; begin
  b1 := app.flag_bucket('a6400000-0000-0000-0000-000000000002', 'web_push');
  b2 := app.flag_bucket('a6400000-0000-0000-0000-000000000002', 'web_push');
  if b1 <> b2 then raise exception 'the bucket changed between calls'; end if;
  if b1 not between 0 and 99 then raise exception 'bucket out of range: %', b1; end if;
  -- The same pair is pinned in apps/web/lib/flags.test.ts.
  if app.flag_bucket('00000000-0000-0000-0000-000000000001', 'web_push') <> 99 then
    raise exception 'known bucket value changed: %', app.flag_bucket('00000000-0000-0000-0000-000000000001', 'web_push');
  end if;
  -- A second pair whose first four bytes have the top bit set (3293017423), so the unsigned read is tested.
  if app.flag_bucket('00000000-0000-0000-0000-000000000002', 'web_push') <> 23 then
    raise exception 'unsigned bucket value changed: %', app.flag_bucket('00000000-0000-0000-0000-000000000002', 'web_push');
  end if;
  if app.flag_bucket('a6400000-0000-0000-0000-000000000002', 'web_push') = app.flag_bucket('a6400000-0000-0000-0000-000000000002', 'programme_friends')
     and app.flag_bucket('a6400000-0000-0000-0000-000000000003', 'web_push') = app.flag_bucket('a6400000-0000-0000-0000-000000000003', 'programme_friends')
     and app.flag_bucket('a6400000-0000-0000-0000-000000000003', 'web_push') = app.flag_bucket('a6400000-0000-0000-0000-000000000002', 'web_push') then
    raise exception 'flags and readers do not move the bucket';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The three new flags are seeded off and cohort flags
-- ---------------------------------------------------------------------------
do $$ begin
  if (select count(*) from public.feature_flags where key in ('reader_passkeys','web_push','programme_friends') and enabled = false and cohort and rollout_percent = 0) <> 3 then
    raise exception 'the three cohort flags should be seeded off at 0 percent';
  end if;
  if (select cohort from public.feature_flags where key = 'live_payments') then raise exception 'live_payments must not be a cohort flag'; end if;
  if app.flag_for_user('web_push', 'a6400000-0000-0000-0000-000000000002') then raise exception 'flags must default off'; end if;
  if app.flag_for_user('no_such_flag', 'a6400000-0000-0000-0000-000000000002') then raise exception 'an unknown flag must read as off'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Staff switch: owners only, cohort flags only, audited
-- ---------------------------------------------------------------------------
select test_as('a6400000-0000-0000-0000-000000000002');
do $$ begin
  begin
    perform public.set_flag('web_push', true, 100, 'try');
    raise exception 'a reader changed a flag';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select test_as('a6400000-0000-0000-0000-000000000001', array['owner']);
do $$ begin
  perform public.set_flag('web_push', true, 100, 'test everyone');
  begin perform public.set_flag('live_payments', true, 100, 'no'); raise exception 'a launch toggle moved'; exception when no_data_found then null; end;
  begin perform public.set_flag('web_push', true, 101, 'no'); raise exception 'accepted 101 percent'; exception when invalid_parameter_value then null; end;
  begin perform public.set_flag('web_push', null, 10, 'no'); raise exception 'accepted a null switch'; exception when invalid_parameter_value then null; end;
end $$;
reset role;

do $$ begin
  if not app.flag_for_user('web_push', 'a6400000-0000-0000-0000-000000000002') then raise exception 'at 100 percent every reader is in'; end if;
  if not app.flag_for_user('web_push', null) then raise exception 'at 100 percent a signed-out visitor is in'; end if;
  if (select count(*) from public.audit_log where action = 'flag.changed' and target = 'flag:web_push') <> 1 then raise exception 'the change was not audited'; end if;
  if (select (before ->> 'enabled')::boolean from public.audit_log where action = 'flag.changed') then raise exception 'the audit row should hold the old value'; end if;
end $$;

-- Stepped rollout: percent 0 is nobody, percent 100 is everybody, and the share grows only upwards.
update public.feature_flags set rollout_percent = 0 where key = 'web_push';
do $$ begin
  if app.flag_for_user('web_push', 'a6400000-0000-0000-0000-000000000002') then raise exception '0 percent should be nobody'; end if;
end $$;
do $$ declare u uuid; p int; prev boolean; in_at int; begin
  for u in select id from auth.users loop
    prev := false;
    for p in 0..100 loop
      update public.feature_flags set rollout_percent = p where key = 'web_push';
      if prev and not app.flag_for_user('web_push', u) then raise exception 'raising the percentage removed a reader'; end if;
      prev := app.flag_for_user('web_push', u);
    end loop;
  end loop;
end $$;

-- A switched-off flag is off whatever the percentage.
update public.feature_flags set enabled = false, rollout_percent = 100 where key = 'web_push';
do $$ begin
  if app.flag_for_user('web_push', 'a6400000-0000-0000-0000-000000000002') then raise exception 'a disabled flag read as on'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Brand shape
-- ---------------------------------------------------------------------------
do $$ declare p text[]; s text; begin
  foreach s in array array['square','soft','round'] loop
    p := app.tenant_brand_problems(jsonb_build_object('shape', s));
    if cardinality(p) <> 0 then raise exception 'shape % refused: %', s, p; end if;
  end loop;
  foreach s in array array['pill','Round','','1'] loop
    p := app.tenant_brand_problems(jsonb_build_object('shape', s));
    if cardinality(p) <> 1 then raise exception 'shape % should be refused once: %', s, p; end if;
  end loop;
  p := app.tenant_brand_problems('{"shape": 3}');
  if cardinality(p) <> 1 then raise exception 'a numeric shape should be refused'; end if;
  -- The earlier contract still holds.
  if cardinality(app.tenant_brand_problems(app.demo_brand('a'))) <> 0 then raise exception 'demo look a no longer passes'; end if;
  p := app.tenant_brand_problems('{"custom_css": "x", "shape": "soft"}');
  if cardinality(p) <> 1 then raise exception 'an unknown key should still be refused: %', p; end if;
  p := app.tenant_brand_problems('{"colours": {"light": {"primary": "#8a8a8a", "accent": "#7a7a7a"}, "dark": {"primary": "#7fc2cf", "accent": "#173c45"}}, "shape": "round"}');
  if cardinality(p) < 1 then raise exception 'low contrast should still be refused with a shape set'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Reader prompts: own row only
-- ---------------------------------------------------------------------------
select test_as('a6400000-0000-0000-0000-000000000002');
insert into public.reader_prompts (user_id, prompt) values ('a6400000-0000-0000-0000-000000000002', 'passkey');
do $$ begin
  if (select count(*) from public.reader_prompts) <> 1 then raise exception 'a reader should see their own dismissal'; end if;
  begin
    insert into public.reader_prompts (user_id, prompt) values ('a6400000-0000-0000-0000-000000000003', 'passkey');
    raise exception 'a reader dismissed a prompt for someone else';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.reader_prompts (user_id, prompt) values ('a6400000-0000-0000-0000-000000000002', 'other');
    raise exception 'an unknown prompt was accepted';
  exception when check_violation or unique_violation then null;
  end;
end $$;
reset role;
select test_as('a6400000-0000-0000-0000-000000000003');
do $$ begin
  if exists (select 1 from public.reader_prompts) then raise exception 'a reader saw someone else''s dismissal'; end if;
end $$;
select set_config('request.jwt.claims', '', true);
reset role;

rollback;
