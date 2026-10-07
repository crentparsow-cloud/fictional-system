-- 0025 Retire the Reading Scripture Theme.
--
-- Crent's decision, 7 October 2026: nothing directly about studying the Bible
-- for now. Faith titles stay Bible-based (devotional, prayer, character,
-- practical and Christian living), but Bible study is out of scope. The
-- Reading Scripture Theme (reading-scripture) is retired. Its four demo
-- titles are marked removed in docs/research/catalogue/faith.json; none was
-- ever seeded. Bible quotation handling (World English Bible) stays, but only
-- as quotation support inside Bible-based titles (F-151).
--
-- Same rules as 0001 to 0018. Depends on 0002 and 0015 only. Additive and
-- idempotent: nothing is deleted, renamed or narrowed, and a second run
-- changes nothing.
--
--   * themes.status records whether a Theme is in use. 'active' (default)
--     or 'retired'. A retired Theme keeps its row and its id for good, because
--     Theme ids are never reused, and old links or audit rows may name it.
--   * themes.retired_at and themes.retired_reason say when and why.
--   * reading-scripture is set to retired and stays hidden
--     (hidden_until_min_books true). A guard refuses any workbook that tries
--     to join a retired Theme, so it can never reach the three live titles
--     that would show it to readers.
--   * The app should also leave retired Themes out of /themes, the library
--     and search. That is an app change and is not made here.

-- ---------------------------------------------------------------------------
-- Columns.
-- ---------------------------------------------------------------------------
alter table public.themes
  add column if not exists status         text not null default 'active',
  add column if not exists retired_at     timestamptz,
  add column if not exists retired_reason text;

do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'themes_status_check' and conrelid = 'public.themes'::regclass) then
    alter table public.themes
      add constraint themes_status_check check (status in ('active', 'retired'));
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'themes_retired_fields_check' and conrelid = 'public.themes'::regclass) then
    alter table public.themes
      add constraint themes_retired_fields_check check (status <> 'retired' or retired_at is not null);
  end if;
end $$;

comment on column public.themes.status is 'active or retired. A retired Theme is kept, never reused and never shown to readers (0025).';
comment on column public.themes.retired_at is 'When the Theme was retired (0025).';
comment on column public.themes.retired_reason is 'Why the Theme was retired (0025).';

-- ---------------------------------------------------------------------------
-- Retire Reading Scripture. A row that does not exist is simply skipped.
-- coalesce keeps the first retirement time on a re-run.
-- ---------------------------------------------------------------------------
update public.themes
   set status                 = 'retired',
       hidden_until_min_books = true,
       retired_at             = coalesce(retired_at, now()),
       retired_reason         = coalesce(retired_reason,
         'Bible study is out of scope for now (Crent, 7 October 2026). Faith titles stay Bible-based but not Bible study.')
 where id = 'reading-scripture';

-- ---------------------------------------------------------------------------
-- Guard: no workbook may join a retired Theme. Existing rows are not touched;
-- the guard fires only when theme_id is set or changed.
-- ---------------------------------------------------------------------------
create or replace function app.refuse_retired_theme() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.theme_id is not null
     and (tg_op = 'INSERT' or new.theme_id is distinct from old.theme_id)
     and exists (select 1 from public.themes t where t.id = new.theme_id and t.status = 'retired') then
    raise exception 'Theme % is retired and cannot take workbooks', new.theme_id
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

revoke all on function app.refuse_retired_theme() from public;

drop trigger if exists workbooks_refuse_retired_theme on public.workbooks;
create trigger workbooks_refuse_retired_theme
  before insert or update of theme_id on public.workbooks
  for each row execute function app.refuse_retired_theme();
