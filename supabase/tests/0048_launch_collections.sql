-- Launch collections and Start here (0048). The migration is data only: this
-- test stands up stub titles for every code it names, runs the file again
-- inside the transaction, and checks the shape the Explore page expects.
-- Each block must raise or return the expected value; a failure aborts the
-- script.
\set ON_ERROR_STOP on

begin;

insert into public.organisations (id, code, kind, legal_name, display_name, slug, country) values
  ('a4800000-0000-0000-0000-0000000000a1', 'PB-TD048', 'publisher', 'Org 48 Ltd', 'Org 48', 'org-48', 'GB');
insert into public.books (id, org_id, slug, title, rights_status) values
  ('a4800000-0000-0000-0000-0000000000b1', 'a4800000-0000-0000-0000-0000000000a1', 'book-48', 'Book 48', 'public_domain');

-- One stub per code the migration names. A code missing here would be skipped
-- by the migration, and the counts below would fail.
insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, safety_tier, depth, status)
select gen_random_uuid(), c, 'a4800000-0000-0000-0000-0000000000b1', 'a4800000-0000-0000-0000-0000000000a1',
       'stub-' || lower(c), 'Stub ' || c, 'Card', 'productivity', 'none', 'full', 'draft'
  from unnest(array[
    'AK-06699','AK-0ATHQ','AK-0Y78E','AK-19BS2','AK-1APCY','AK-24T4N','AK-2W5XQ','AK-32PNA','AK-33BZ8','AK-3TQX1',
    'AK-4EYKY','AK-4Q9CB','AK-5B1JE','AK-5NJQA','AK-6ECZ7','AK-6VDBX','AK-7BZ6P','AK-7SWKN','AK-A2BXW','AK-AWYB0',
    'AK-B9XEG','AK-BFTT8','AK-BJ8GJ','AK-D49C0','AK-ERMC7','AK-F3ZA8','AK-FN9KB','AK-G628R','AK-HJY00','AK-J85XW',
    'AK-KMWTQ','AK-MBFT8','AK-MBRV9','AK-N1Q1M','AK-NDT42','AK-P48WC','AK-QCRRE','AK-QS96Q','AK-R4CGT','AK-RPT7D',
    'AK-S3DMK','AK-SDSH9','AK-SWX23','AK-T1WVV','AK-TJ4ZR','AK-TJWHK','AK-XB0A1','AK-YKY7D','AK-YYD3W','AK-ZSFV9'
  ]) as c;

-- The migration, run inside this transaction. \ir is relative to this file.
\ir ../migrations/0048_launch_collections.sql

-- ---------------------------------------------------------------------------
-- 1. Eleven live collections: Start here and the ten curated ones.
-- ---------------------------------------------------------------------------
do $$ begin
  if (select count(*) from public.collections where status = 'live'
        and slug in ('start-here','using-your-time-well','ideas-for-how-to-live','money-plainly','family-routines',
                     'study-and-learning','working-with-people','moving-on-at-work','partners-and-friends',
                     'small-business-basics','everyday-know-how')) <> 11 then
    raise exception 'expected the eleven launch collections, live';
  end if;
  if (select count(*) from public.collections where slug <> 'start-here' and status = 'live') <> 10 then
    raise exception 'expected ten curated collections besides Start here';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Start here: ten titles, the five classics first in the agreed order.
-- ---------------------------------------------------------------------------
do $$ declare v_codes text; begin
  select string_agg(w.code, ',' order by i.position) into v_codes
    from public.collection_items i
    join public.collections c on c.id = i.collection_id and c.slug = 'start-here'
    join public.workbooks w on w.id = i.workbook_id;
  if v_codes <> 'AK-3TQX1,AK-QCRRE,AK-7SWKN,AK-B9XEG,AK-FN9KB,AK-4Q9CB,AK-BJ8GJ,AK-MBFT8,AK-RPT7D,AK-TJWHK' then
    raise exception 'Start here list or order is wrong: %', v_codes;
  end if;
  if (select min(i.position) from public.collection_items i join public.collections c on c.id = i.collection_id and c.slug = 'start-here') <> 1
     or (select max(i.position) from public.collection_items i join public.collections c on c.id = i.collection_id and c.slug = 'start-here') <> 10 then
    raise exception 'Start here positions should run 1 to 10';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Every curated collection has five titles, and the page minimum is three.
--    The four collections that fit a classic lead with it.
-- ---------------------------------------------------------------------------
do $$ declare r record; begin
  for r in select c.slug, count(i.workbook_id) as n from public.collections c
             left join public.collection_items i on i.collection_id = c.id
            where c.slug <> 'start-here' and c.slug in ('using-your-time-well','ideas-for-how-to-live','money-plainly','family-routines',
                     'study-and-learning','working-with-people','moving-on-at-work','partners-and-friends','small-business-basics','everyday-know-how')
            group by c.slug loop
    if r.n <> 5 then raise exception 'collection % should hold five titles, holds %', r.slug, r.n; end if;
  end loop;
  if (select w.code from public.collection_items i join public.collections c on c.id = i.collection_id join public.workbooks w on w.id = i.workbook_id
       where c.slug = 'using-your-time-well' and i.position = 1) <> 'AK-QCRRE' then raise exception 'time collection should lead with AK-QCRRE'; end if;
  if (select w.code from public.collection_items i join public.collections c on c.id = i.collection_id join public.workbooks w on w.id = i.workbook_id
       where c.slug = 'ideas-for-how-to-live' and i.position = 1) <> 'AK-FN9KB' then raise exception 'ideas collection should lead with AK-FN9KB'; end if;
  if (select w.code from public.collection_items i join public.collections c on c.id = i.collection_id join public.workbooks w on w.id = i.workbook_id
       where c.slug = 'money-plainly' and i.position = 1) <> 'AK-3TQX1' then raise exception 'money collection should lead with AK-3TQX1'; end if;
  if (select w.code from public.collection_items i join public.collections c on c.id = i.collection_id join public.workbooks w on w.id = i.workbook_id
       where c.slug = 'family-routines' and i.position = 1) <> 'AK-B9XEG' then raise exception 'family collection should lead with AK-B9XEG'; end if;
  -- All five classics appear in at least one curated collection.
  if (select count(distinct w.code) from public.collection_items i join public.collections c on c.id = i.collection_id join public.workbooks w on w.id = i.workbook_id
       where c.slug <> 'start-here' and w.code in ('AK-FN9KB','AK-QCRRE','AK-3TQX1','AK-7SWKN','AK-B9XEG')) <> 5 then
    raise exception 'each of the five classics should sit in a curated collection';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. House words. No em or en dash, no exclamation mark, no price or hype,
--    no outcome, health or income promise, no streak or countdown wording.
-- ---------------------------------------------------------------------------
do $$ declare r record; begin
  for r in select slug, name, line from public.collections
            where slug in ('start-here','using-your-time-well','ideas-for-how-to-live','money-plainly','family-routines',
                           'study-and-learning','working-with-people','moving-on-at-work','partners-and-friends',
                           'small-business-basics','everyday-know-how') loop
    if r.name || ' ' || r.line ~ '[—–!£$]' then raise exception 'collection % has a banned mark', r.slug; end if;
    if r.name || ' ' || r.line ~* '\m(free|guarantee[sd]?|proven|best|cure[sd]?|heal(s|ing)?|treat(s|ment)?|therapy|anxiety|depress\w*|streaks?|countdown|earn\w*|income|rich|wealthy|fast|instant|transform\w*|boost\w*|master\w*|ultimate|secret)\M' then
      raise exception 'collection % has a banned word: %', r.slug, r.line;
    end if;
    if char_length(r.name) > 40 or char_length(r.line) > 200 then raise exception 'collection % is too long', r.slug; end if;
    if r.slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'bad slug %', r.slug; end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Running the migration again changes nothing: same collections, same ids,
--    same items, same order.
-- ---------------------------------------------------------------------------
create temp table before_ids as select id, slug from public.collections where slug in (
  'start-here','using-your-time-well','ideas-for-how-to-live','money-plainly','family-routines','study-and-learning',
  'working-with-people','moving-on-at-work','partners-and-friends','small-business-basics','everyday-know-how');
create temp table before_items as select collection_id, workbook_id, position from public.collection_items
  where collection_id in (select id from before_ids);

\ir ../migrations/0048_launch_collections.sql

do $$ begin
  if exists (select 1 from before_ids b left join public.collections c on c.id = b.id and c.slug = b.slug where c.id is null) then
    raise exception 'a rerun should keep every collection id';
  end if;
  if (select count(*) from public.collections where slug in (select slug from before_ids)) <> 11 then
    raise exception 'a rerun should not add collections';
  end if;
  if (select count(*) from public.collection_items where collection_id in (select id from before_ids)) <> (select count(*) from before_items)
     or exists (select 1 from before_items b where not exists (
          select 1 from public.collection_items i where i.collection_id = b.collection_id and i.workbook_id = b.workbook_id and i.position = b.position)) then
    raise exception 'a rerun should leave the items as they were';
  end if;
end $$;

rollback;
