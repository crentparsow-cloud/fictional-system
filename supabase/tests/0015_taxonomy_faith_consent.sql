-- Expanded taxonomy (F-148) and faith consent (F-150). Each block must raise
-- or return the expected result; a failure aborts the script and the CI step.
\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------------------
-- Taxonomy rows. On the test database no seed has run, so the migration's
-- own rows are all that exist: 10 shelves, 19 areas, 34 new Themes.
-- ---------------------------------------------------------------------------
do $$ declare n int; begin
  select count(*) into n from public.shelves;
  if n <> 10 then raise exception 'expected 10 shelves, saw %', n; end if;
  select count(*) into n from public.shelves where hidden_until_min_books;
  if n <> 3 then raise exception 'expected 3 held shelves, saw %', n; end if;
  select count(*) into n from public.shelves
   where id in ('health-and-body', 'faith-and-spirituality', 'creativity-and-making') and status = 'proposed';
  if n <> 3 then raise exception 'new shelves missing or not proposed (%)', n; end if;
  select count(*) into n from public.areas;
  if n <> 19 then raise exception 'expected 19 areas, saw %', n; end if;

  select count(*) into n from public.themes;
  if n <> 34 then raise exception 'expected 34 new Themes before the seed, saw %', n; end if;
  select count(*) into n from public.themes
   where hidden_until_min_books and clearance_status = 'pending' and min_books = 3;
  if n <> 34 then raise exception 'new Themes not all held, pending and min 3 (%)', n; end if;
  select count(*) into n from public.themes where shelf_id = 'faith-and-spirituality';
  if n <> 9 then raise exception 'expected 9 faith Themes, saw %', n; end if;
  select count(*) into n from public.themes t join public.areas a on a.id = t.area_id where a.shelf_id is distinct from t.shelf_id;
  if n <> 0 then raise exception '% Themes sit in an area on another shelf', n; end if;

  -- stoicism moved to Wisdom for Living
  select count(*) into n from public.themes where id = 'wisdom-for-living' and 'stoicism' = any(topics);
  if n <> 1 then raise exception 'stoicism not on Wisdom for Living'; end if;
  -- the new condition words are hidden topics, never in a name or line
  select count(*) into n from public.themes
   where name ~* '(depression|ocd|ptsd|debt|divorce|anxiety|trauma|addiction|dementia)'
      or coalesce(line, '') ~* '(depression|ocd|ptsd|debt|divorce|anxiety|trauma|addiction|dementia)';
  if n <> 0 then raise exception '% Theme names or lines carry a condition word', n; end if;
end $$;

-- The seed then upserts the 17 existing Themes. Simulate the seed's insert for
-- one existing and one new Theme, then re-run the migration's flag update:
-- existing rows keep the default (current behaviour), new rows stay held.
savepoint s0;
insert into public.themes (id, name, line, shelf_id, area_id, topics, clearance_status, min_books)
values ('chosen-habits', 'Chosen Habits', null, 'personal-growth', 'habits-and-character', array['habits'], 'pending', 3)
on conflict (id) do nothing;
do $$ declare v boolean; begin
  select hidden_until_min_books into v from public.themes where id = 'chosen-habits';
  if v then raise exception 'an existing Theme defaulted to held'; end if;
  select hidden_until_min_books into v from public.themes where id = 'settled-mind';
  if not v then raise exception 'a new Theme is not held'; end if;
end $$;
-- Readers can read the new columns; they cannot write Themes.
select test_as('a6a6a6a6-0000-0000-0000-0000000000f1');
do $$ declare n int; begin
  select count(*) into n from public.themes where hidden_until_min_books and group_suitable;
  if n < 1 then raise exception 'reader cannot read the Theme flags'; end if;
  update public.themes set hidden_until_min_books = false where id = 'settled-mind';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'a reader unheld a Theme'; end if;
end $$;
reset role;
rollback to savepoint s0;

-- ---------------------------------------------------------------------------
-- Faith consent.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('a6a6a6a6-0000-0000-0000-0000000000f1', 'faith-a@test'),
  ('a6a6a6a6-0000-0000-0000-0000000000f2', 'faith-b@test');

savepoint s1;
select test_as('a6a6a6a6-0000-0000-0000-0000000000f1');
do $$ declare v_at timestamptz; v_ver text; n int; begin
  select count(*) into n from public.profiles where faith_consent_at is not null;
  if n <> 0 then raise exception 'reader A started with faith consent recorded'; end if;

  perform public.set_faith_consent('faith-2026-10');
  select faith_consent_at, faith_consent_version into v_at, v_ver
    from public.profiles where user_id = 'a6a6a6a6-0000-0000-0000-0000000000f1';
  if v_at is null or v_ver <> 'faith-2026-10' then raise exception 'faith consent not recorded: % %', v_at, v_ver; end if;

  -- faith consent is separate from health consent
  select count(*) into n from public.profiles where user_id = 'a6a6a6a6-0000-0000-0000-0000000000f1' and health_consent_at is not null;
  if n <> 0 then raise exception 'faith consent set health consent too'; end if;

  begin
    perform public.set_faith_consent('Not A Version!');
    raise exception 'a malformed faith consent version was accepted';
  exception when check_violation then null; end;

  begin
    update public.profiles set faith_consent_version = 'faith-forged' where user_id = 'a6a6a6a6-0000-0000-0000-0000000000f1';
    raise exception 'reader A forged a faith consent version';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set faith_consent_at = null, faith_consent_version = null where user_id = 'a6a6a6a6-0000-0000-0000-0000000000f1';
    raise exception 'reader A cleared faith consent without the function';
  exception when insufficient_privilege then null; end;

  -- ordinary profile updates still work
  update public.profiles set display_name = 'A' where user_id = 'a6a6a6a6-0000-0000-0000-0000000000f1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'reader A could not update their display name'; end if;

  -- withdrawal clears both columns, and consent can be given again
  perform public.clear_faith_consent();
  select faith_consent_at, faith_consent_version into v_at, v_ver
    from public.profiles where user_id = 'a6a6a6a6-0000-0000-0000-0000000000f1';
  if v_at is not null or v_ver is not null then raise exception 'withdrawal left %, %', v_at, v_ver; end if;
  perform public.set_faith_consent('faith-2026-10');
end $$;

-- Reader B touches only B's own row.
select test_as('a6a6a6a6-0000-0000-0000-0000000000f2');
do $$ declare n int; begin
  perform public.clear_faith_consent();
  perform public.set_faith_consent('faith-b');
  update public.profiles set display_name = 'hijack' where user_id = 'a6a6a6a6-0000-0000-0000-0000000000f1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'reader B updated reader A''s profile'; end if;
end $$;
reset role;
do $$ declare v_ver text; begin
  select faith_consent_version into v_ver from public.profiles where user_id = 'a6a6a6a6-0000-0000-0000-0000000000f1';
  if v_ver is distinct from 'faith-2026-10' then raise exception 'reader B changed reader A''s faith consent: %', v_ver; end if;
end $$;

-- Anon is refused outright.
set local role anon;
do $$ begin
  begin
    perform public.set_faith_consent('faith-2026-10');
    raise exception 'anon gave faith consent';
  exception when insufficient_privilege then null; end;
  begin
    perform app.set_faith_consent('faith-2026-10');
    raise exception 'anon called app.set_faith_consent';
  exception when insufficient_privilege then null; end;
  begin
    perform public.clear_faith_consent();
    raise exception 'anon withdrew faith consent';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- An authenticated role with no user id is refused too.
do $$ begin
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role authenticated';
  begin
    perform public.set_faith_consent('faith-2026-10');
    raise exception 'a session with no user gave faith consent';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Account erasure: a completed deletion request clears the faith columns.
insert into public.account_deletion_requests (user_id, requested_at, cancel_before)
values ('a6a6a6a6-0000-0000-0000-0000000000f1', now() - interval '40 days', now() - interval '10 days');
update public.account_deletion_requests set completed_at = now() where user_id = 'a6a6a6a6-0000-0000-0000-0000000000f1';
do $$ declare v_at timestamptz; v_ver text; begin
  select faith_consent_at, faith_consent_version into v_at, v_ver
    from public.profiles where user_id = 'a6a6a6a6-0000-0000-0000-0000000000f1';
  if v_at is not null or v_ver is not null then raise exception 'erasure left faith consent %, %', v_at, v_ver; end if;
  select faith_consent_version into v_ver from public.profiles where user_id = 'a6a6a6a6-0000-0000-0000-0000000000f2';
  if v_ver is distinct from 'faith-b' then raise exception 'erasure of A touched B'; end if;
end $$;
rollback to savepoint s1;

rollback;
\echo PASS 0015_taxonomy_faith_consent
