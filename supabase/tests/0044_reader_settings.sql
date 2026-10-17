-- 0044 Reading settings: a reader reads and writes only their own row, the
-- shape check refuses anything outside the fixed lists, and nobody signed out
-- can touch the table. Each block must raise or return the expected value; a
-- failure aborts the script.
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('a4400000-0000-0000-0000-000000000001', 'reader44a@test'),
  ('a4400000-0000-0000-0000-000000000002', 'reader44b@test');

-- ---------------------------------------------------------------------------
-- 1. A reader saves and updates their own settings
-- ---------------------------------------------------------------------------
select test_as('a4400000-0000-0000-0000-000000000001');
insert into public.reader_settings (user_id, reading)
values ('a4400000-0000-0000-0000-000000000001', '{"font": "dyslexic", "size": 3, "colour": "dark", "margin": "wide", "progress": "time"}');
-- The app saves with an upsert that names every column it sends.
insert into public.reader_settings (user_id, reading, updated_at)
values ('a4400000-0000-0000-0000-000000000001', '{"font": "lexend", "size": 2, "colour": "auto", "margin": "standard", "progress": "both"}', now())
on conflict (user_id) do update set reading = excluded.reading, updated_at = excluded.updated_at;
do $$ begin
  if (select reading ->> 'font' from public.reader_settings) <> 'lexend' then raise exception 'the upsert did not replace the settings'; end if;
  if (select count(*) from public.reader_settings) <> 1 then raise exception 'a reader sees one row, their own'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 2. Another reader cannot see, write or take over that row
-- ---------------------------------------------------------------------------
select test_as('a4400000-0000-0000-0000-000000000002');
do $$ begin
  if exists (select 1 from public.reader_settings) then raise exception 'a reader saw someone else''s settings'; end if;
  begin
    insert into public.reader_settings (user_id, reading) values ('a4400000-0000-0000-0000-000000000001', '{}');
    raise exception 'a reader wrote settings for someone else';
  exception when insufficient_privilege or unique_violation then null;
  end;
  update public.reader_settings set reading = '{"size": 5}' where user_id = 'a4400000-0000-0000-0000-000000000001';
  if (select reading ->> 'size' from public.reader_settings where false) is not null then raise exception 'unreachable'; end if;
end $$;
reset role;
do $$ begin
  if (select reading ->> 'size' from public.reader_settings where user_id = 'a4400000-0000-0000-0000-000000000001') <> '2' then
    raise exception 'another reader changed the first reader''s settings';
  end if;
end $$;

-- A reader cannot move their row to someone else's id with an update.
select test_as('a4400000-0000-0000-0000-000000000001');
do $$ begin
  begin
    update public.reader_settings set user_id = 'a4400000-0000-0000-0000-000000000002';
    raise exception 'a reader handed their settings to another account';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. The shape check refuses unknown keys and values outside the lists
-- ---------------------------------------------------------------------------
select test_as('a4400000-0000-0000-0000-000000000002');
do $$ declare bad text; begin
  foreach bad in array array[
    '{"font": "comic"}',
    '{"size": 9}',
    '{"size": "2"}',
    '{"colour": "sepia"}',
    '{"margin": "huge"}',
    '{"progress": "streak"}',
    '{"note": "anything else"}',
    '[]',
    '"text"'
  ] loop
    begin
      insert into public.reader_settings (user_id, reading) values ('a4400000-0000-0000-0000-000000000002', bad::jsonb);
      raise exception 'the shape check accepted %', bad;
    exception when check_violation then null;
    end;
  end loop;
  -- An empty object and a partial one are fine: the app fills in the defaults.
  insert into public.reader_settings (user_id, reading) values ('a4400000-0000-0000-0000-000000000002', '{"colour": "light"}');
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. Signed out gets nothing
-- ---------------------------------------------------------------------------
do $$ begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "anon"}'::text, true);
  execute 'set local role anon';
  begin
    perform 1 from public.reader_settings;
    raise exception 'anon read reader settings';
  exception when insufficient_privilege then null;
  end;
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Deleting the account deletes the settings
-- ---------------------------------------------------------------------------
delete from auth.users where id = 'a4400000-0000-0000-0000-000000000001';
do $$ begin
  if exists (select 1 from public.reader_settings where user_id = 'a4400000-0000-0000-0000-000000000001') then
    raise exception 'settings outlived the account';
  end if;
end $$;

rollback;
