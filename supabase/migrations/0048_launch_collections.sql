-- 0048 Launch collections and Start here (build list 2.3, 2.5).
--
-- What changes
--   1. Ten curated collections across the shelves, as rows in
--      public.collections with their ordered titles in public.collection_items
--      (tables from 0043). Each leads with a public domain classic where one
--      fits, then demo titles from the catalogue. Demo titles cannot be bought.
--   2. One more collection, slug start-here, holding the ten "Start here"
--      titles in reading order: the five classics, shortest programme first,
--      then five fully written demo titles. There is no separate Start here
--      column; the collection is the data, and the Explore page lists it.
--
-- Safe to run twice. Collections are upserted on their slug and their title
-- lists are rebuilt from the values below. A code that is not in
-- public.workbooks yet is skipped, so a database without the catalogue (a
-- fresh test database) gets the collections with no titles, and the page
-- hides a collection with fewer than three visible titles. Nothing earlier is
-- edited. Depends on 0043. No function is added, so nothing needs a grant.
--
-- Content rules kept: UK English, no em dashes, no outcome, health or income
-- promises, no mental health titles (tier standard or higher are left out).

with c(slug, name, line, cover_genre, cover_pattern, sort) as (
  values
    ('start-here', 'Start here',
     'Short titles to begin with, shortest first. Each lets you read the first week before you decide.',
     'personal_development', 'steps', 0),
    ('using-your-time-well', 'Using your time well',
     'Plans for the hours you have. Starts with Arnold Bennett''s evening plan, then short workbooks on priorities, mornings and meetings.',
     'productivity', 'steps', 10),
    ('ideas-for-how-to-live', 'Ideas for how to live',
     'Two classics, Marcus Aurelius and Samuel Smiles, with workbooks on small rules, big decisions and what you would like to pass on.',
     'personal_development', 'rings', 20),
    ('money-plainly', 'Money, plainly',
     'Franklin''s sayings on thrift, then workbooks on budgets, saving and steady plans. General information, not financial advice.',
     'finance', 'bars', 30),
    ('family-routines', 'Family routines',
     'Charlotte Mason''s short lessons at home, then workbooks on shared meals, screens and house rules.',
     'parenting', 'dots', 40),
    ('study-and-learning', 'Study and learning',
     'Workbooks on planning revision, taking notes and fitting study around your life, and on helping someone else learn.',
     'education', 'columns', 50),
    ('working-with-people', 'Working with people',
     'Workbooks on giving feedback, starting with a new team and making decisions that others can follow.',
     'leadership', 'grid', 60),
    ('moving-on-at-work', 'Moving on at work',
     'Workbooks for preparing a change of work, a pay conversation, a first mentoring relationship or a short talk.',
     'career', 'chevrons', 70),
    ('partners-and-friends', 'Partners and friends',
     'Workbooks on saying hard things kindly, sharing the load at home and keeping in touch with people who matter.',
     'relationships', 'arcs', 80),
    ('small-business-basics', 'Small business basics',
     'Plain workbooks on keeping a cash book, knowing your regulars, taking orders and hiring a first person. Not financial or legal advice.',
     'business', 'crosses', 90),
    ('everyday-know-how', 'Everyday know-how',
     'Workbooks for a first flat, cooking for one, small repairs, spotting scams and simple spreadsheets.',
     'life_skills', 'waves', 100)
), up as (
  insert into public.collections (slug, name, line, cover_genre, cover_pattern, status, sort)
  select slug, name, line, cover_genre, cover_pattern, 'live', sort from c
  on conflict (slug) do update set
    name = excluded.name,
    line = excluded.line,
    cover_genre = excluded.cover_genre,
    cover_pattern = excluded.cover_pattern,
    status = excluded.status,
    sort = excluded.sort,
    updated_at = now()
  returning id, slug
), cleared as (
  delete from public.collection_items i using up where i.collection_id = up.id
  returning i.collection_id
)
select (select count(*) from up) as collections_saved, (select count(*) from cleared) as items_cleared;

-- The titles, in display order. Position is the order inside the collection.
with t(slug, position, code) as (
  values
    ('start-here', 1, 'AK-3TQX1'),
    ('start-here', 2, 'AK-QCRRE'),
    ('start-here', 3, 'AK-7SWKN'),
    ('start-here', 4, 'AK-B9XEG'),
    ('start-here', 5, 'AK-FN9KB'),
    ('start-here', 6, 'AK-4Q9CB'),
    ('start-here', 7, 'AK-BJ8GJ'),
    ('start-here', 8, 'AK-MBFT8'),
    ('start-here', 9, 'AK-RPT7D'),
    ('start-here', 10, 'AK-TJWHK'),

    ('using-your-time-well', 1, 'AK-QCRRE'),
    ('using-your-time-well', 2, 'AK-0ATHQ'),
    ('using-your-time-well', 3, 'AK-BFTT8'),
    ('using-your-time-well', 4, 'AK-AWYB0'),
    ('using-your-time-well', 5, 'AK-SDSH9'),

    ('ideas-for-how-to-live', 1, 'AK-FN9KB'),
    ('ideas-for-how-to-live', 2, 'AK-7SWKN'),
    ('ideas-for-how-to-live', 3, 'AK-RPT7D'),
    ('ideas-for-how-to-live', 4, 'AK-19BS2'),
    ('ideas-for-how-to-live', 5, 'AK-N1Q1M'),

    ('money-plainly', 1, 'AK-3TQX1'),
    ('money-plainly', 2, 'AK-SWX23'),
    ('money-plainly', 3, 'AK-4EYKY'),
    ('money-plainly', 4, 'AK-MBFT8'),
    ('money-plainly', 5, 'AK-ZSFV9'),

    ('family-routines', 1, 'AK-B9XEG'),
    ('family-routines', 2, 'AK-G628R'),
    ('family-routines', 3, 'AK-5B1JE'),
    ('family-routines', 4, 'AK-0Y78E'),
    ('family-routines', 5, 'AK-KMWTQ'),

    ('study-and-learning', 1, 'AK-T1WVV'),
    ('study-and-learning', 2, 'AK-R4CGT'),
    ('study-and-learning', 3, 'AK-06699'),
    ('study-and-learning', 4, 'AK-QS96Q'),
    ('study-and-learning', 5, 'AK-XB0A1'),

    ('working-with-people', 1, 'AK-J85XW'),
    ('working-with-people', 2, 'AK-6VDBX'),
    ('working-with-people', 3, 'AK-TJ4ZR'),
    ('working-with-people', 4, 'AK-HJY00'),
    ('working-with-people', 5, 'AK-MBRV9'),

    ('moving-on-at-work', 1, 'AK-YYD3W'),
    ('moving-on-at-work', 2, 'AK-24T4N'),
    ('moving-on-at-work', 3, 'AK-32PNA'),
    ('moving-on-at-work', 4, 'AK-S3DMK'),
    ('moving-on-at-work', 5, 'AK-5NJQA'),

    ('partners-and-friends', 1, 'AK-6ECZ7'),
    ('partners-and-friends', 2, 'AK-33BZ8'),
    ('partners-and-friends', 3, 'AK-P48WC'),
    ('partners-and-friends', 4, 'AK-YKY7D'),
    ('partners-and-friends', 5, 'AK-BJ8GJ'),

    ('small-business-basics', 1, 'AK-TJWHK'),
    ('small-business-basics', 2, 'AK-A2BXW'),
    ('small-business-basics', 3, 'AK-7BZ6P'),
    ('small-business-basics', 4, 'AK-1APCY'),
    ('small-business-basics', 5, 'AK-2W5XQ'),

    ('everyday-know-how', 1, 'AK-4Q9CB'),
    ('everyday-know-how', 2, 'AK-ERMC7'),
    ('everyday-know-how', 3, 'AK-F3ZA8'),
    ('everyday-know-how', 4, 'AK-NDT42'),
    ('everyday-know-how', 5, 'AK-D49C0')
)
insert into public.collection_items (collection_id, workbook_id, position)
select col.id, w.id, row_number() over (partition by t.slug order by t.position)
  from t
  join public.collections col on col.slug = t.slug
  join public.workbooks w on w.code = t.code
on conflict (collection_id, workbook_id) do update set position = excluded.position;
