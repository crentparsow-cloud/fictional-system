-- Reading Scripture retired (0025). Each block must raise or return the
-- expected result; a failure aborts the script and the CI step.
\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------------------
-- The Theme is retired, hidden and still present. Nothing was deleted.
-- ---------------------------------------------------------------------------
do $$ declare n int; r record; begin
  select * into r from public.themes where id = 'reading-scripture';
  if not found then raise exception 'reading-scripture row is gone; ids are never deleted'; end if;
  if r.status <> 'retired' then raise exception 'reading-scripture status is %, expected retired', r.status; end if;
  if not r.hidden_until_min_books then raise exception 'reading-scripture is not hidden'; end if;
  if r.retired_at is null then raise exception 'reading-scripture has no retired_at'; end if;
  if coalesce(r.retired_reason, '') !~* 'bible study' then raise exception 'reading-scripture has no reason'; end if;

  -- Every other Theme stays active, and the faith shelf keeps all nine rows.
  select count(*) into n from public.themes where status = 'retired';
  if n <> 1 then raise exception 'expected 1 retired Theme, saw %', n; end if;
  select count(*) into n from public.themes where shelf_id = 'faith-and-spirituality';
  if n <> 9 then raise exception 'expected 9 faith Theme rows (8 active, 1 retired), saw %', n; end if;
  select count(*) into n from public.themes where shelf_id = 'faith-and-spirituality' and status = 'active';
  if n <> 8 then raise exception 'expected 8 active faith Themes, saw %', n; end if;
end $$;

-- ---------------------------------------------------------------------------
-- The constraints hold.
-- ---------------------------------------------------------------------------
savepoint s0;
do $$ begin
  begin
    update public.themes set status = 'archived' where id = 'rhythms-of-prayer';
    raise exception 'an unknown status was accepted';
  exception when check_violation then null; end;
  begin
    insert into public.themes (id, name, status) values ('zz-test-retired', 'Test', 'retired');
    raise exception 'a retired Theme with no retired_at was accepted';
  exception when check_violation then null; end;
end $$;
rollback to savepoint s0;

-- ---------------------------------------------------------------------------
-- Running the migration again changes nothing: the first retired_at is kept
-- and no second trigger or constraint appears.
-- ---------------------------------------------------------------------------
savepoint s1;
create temp table rs_before as select retired_at, retired_reason from public.themes where id = 'reading-scripture';
\i supabase/migrations/0025_retire_reading_scripture.sql
do $$ declare n int; begin
  select count(*) into n from public.themes t join rs_before b
   on t.retired_at = b.retired_at and t.retired_reason = b.retired_reason
   where t.id = 'reading-scripture' and t.status = 'retired';
  if n <> 1 then raise exception 'a second run changed the retirement record'; end if;
  select count(*) into n from pg_trigger where tgname = 'workbooks_refuse_retired_theme' and not tgisinternal;
  if n <> 1 then raise exception 'expected 1 guard trigger, saw %', n; end if;
  select count(*) into n from pg_constraint
   where conrelid = 'public.themes'::regclass and conname in ('themes_status_check', 'themes_retired_fields_check');
  if n <> 2 then raise exception 'expected 2 status constraints, saw %', n; end if;
end $$;
rollback to savepoint s1;

-- ---------------------------------------------------------------------------
-- No workbook can join a retired Theme; active Themes still take workbooks.
-- ---------------------------------------------------------------------------
savepoint s2;
insert into public.organisations (id, kind, legal_name, display_name, slug, country) values
  ('25252525-0000-0000-0000-000000000001', 'publisher', 'Org 25 Ltd', 'Org 25', 'org-25', 'GB');
insert into public.books (id, org_id, slug, title, rights_status, is_demo) values
  ('25252525-0000-0000-0000-0000000000b1', '25252525-0000-0000-0000-000000000001', 'book-25', 'Book 25', 'licensed', false);
insert into public.workbooks (id, code, book_id, org_id, slug, title, genre_id, theme_id, status) values
  ('25252525-0000-0000-0000-0000000000c1', 'AK-T25A1', '25252525-0000-0000-0000-0000000000b1',
   '25252525-0000-0000-0000-000000000001', 'wb-25-prayer', 'Prayer 25', 'personal_development', 'rhythms-of-prayer', 'draft');

do $$ begin
  begin
    insert into public.workbooks (code, book_id, org_id, slug, title, genre_id, theme_id, status)
    values ('AK-T25A2', '25252525-0000-0000-0000-0000000000b1', '25252525-0000-0000-0000-000000000001',
            'wb-25-scripture', 'Scripture 25', 'education', 'reading-scripture', 'draft');
    raise exception 'a new workbook joined the retired Theme';
  exception when check_violation then null; end;
  begin
    update public.workbooks set theme_id = 'reading-scripture' where id = '25252525-0000-0000-0000-0000000000c1';
    raise exception 'a workbook was moved into the retired Theme';
  exception when check_violation then null; end;
end $$;

-- Other edits to a workbook are not blocked by the guard.
do $$ declare n int; begin
  update public.workbooks set title = 'Prayer 25, renamed' where id = '25252525-0000-0000-0000-0000000000c1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'an ordinary workbook edit was blocked'; end if;
end $$;
rollback to savepoint s2;

rollback;
\echo PASS 0025_retire_reading_scripture
