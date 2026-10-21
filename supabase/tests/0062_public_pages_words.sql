-- Public pages and words (0062): Theme intros, seasonal collection dates, the
-- weekly editorial slot and staff-set author bios. Each block must raise or
-- return the expected value; a failure aborts the script.
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('a6200000-0000-0000-0000-000000000001', 'editor62@test'),
  ('a6200000-0000-0000-0000-000000000002', 'support62@test'),
  ('a6200000-0000-0000-0000-000000000003', 'reader62@test');
insert into public.platform_roles (user_id, role) values
  ('a6200000-0000-0000-0000-000000000001', 'editor'),
  ('a6200000-0000-0000-0000-000000000002', 'support');

insert into public.organisations (id, code, kind, legal_name, display_name, slug, country) values
  ('a6200000-0000-0000-0000-0000000000a1', 'PB-TD062', 'publisher', 'Org 62 Ltd', 'Org 62', 'org-62', 'GB');
insert into public.books (id, org_id, slug, title, rights_status) values
  ('a6200000-0000-0000-0000-0000000000b1', 'a6200000-0000-0000-0000-0000000000a1', 'book-62', 'Book 62', 'public_domain');
insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, safety_tier, depth, status) values
  ('a6200000-0000-0000-0000-0000000000c1', 'AK-T62A0', 'a6200000-0000-0000-0000-0000000000b1', 'a6200000-0000-0000-0000-0000000000a1', 'wb-62a', 'Workbook 62 A', 'Card', 'productivity', 'none', 'full', 'live');
insert into public.themes (id, name) values ('theme-62', 'Theme 62');
insert into public.authors (id, slug, display_name) values ('a6200000-0000-0000-0000-0000000000e1', 'author-62', 'Author 62');
insert into public.collections (id, slug, name, status) values
  ('a6200000-0000-0000-0000-0000000000f1', 'season-62', 'Season 62', 'live'),
  ('a6200000-0000-0000-0000-0000000000f2', 'open-62', 'Open 62', 'live'),
  ('a6200000-0000-0000-0000-0000000000f3', 'past-62', 'Past 62', 'live');
insert into public.collection_items (collection_id, workbook_id, position) values
  ('a6200000-0000-0000-0000-0000000000f1', 'a6200000-0000-0000-0000-0000000000c1', 1),
  ('a6200000-0000-0000-0000-0000000000f2', 'a6200000-0000-0000-0000-0000000000c1', 1),
  ('a6200000-0000-0000-0000-0000000000f3', 'a6200000-0000-0000-0000-0000000000c1', 1);

-- ---------------------------------------------------------------------------
-- 1. Theme intros: staff only, plain punctuation, a length limit, audited.
-- ---------------------------------------------------------------------------
do $$ begin
  perform test_as('a6200000-0000-0000-0000-000000000002', array['support']);
  begin perform public.set_theme_intro('theme-62', 'Hello.');
    raise exception 'support should not write an intro'; exception when insufficient_privilege then null; end;
  reset role;
  perform test_as('a6200000-0000-0000-0000-000000000003');
  begin perform public.set_theme_intro('theme-62', 'Hello.');
    raise exception 'a reader should not write an intro'; exception when insufficient_privilege then null; end;
  reset role;
  perform test_as('a6200000-0000-0000-0000-000000000001', array['editor']);
  perform public.set_theme_intro('theme-62', '  A plain intro.  ');
  if (select intro from public.themes where id = 'theme-62') <> 'A plain intro.' then raise exception 'intro should be trimmed and saved'; end if;
  begin perform public.set_theme_intro('theme-62', 'Not this — please');
    raise exception 'a dash was accepted'; exception when sqlstate 'AKP02' then null; end;
  begin perform public.set_theme_intro('theme-62', repeat('x', 701));
    raise exception 'a long intro was accepted'; exception when sqlstate 'AKP02' then null; end;
  begin perform public.set_theme_intro('no-theme', 'x');
    raise exception 'an unknown Theme was accepted'; exception when sqlstate 'AKP01' then null; end;
  perform public.set_theme_intro('theme-62', '');
  if (select intro from public.themes where id = 'theme-62') is not null then raise exception 'empty should clear the intro'; end if;
  reset role;
  if not exists (select 1 from public.audit_log where action = 'theme.intro') then raise exception 'intro should be audited'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Seasonal collection dates: hidden outside the window, shown inside it or
--    with no dates, always visible to staff. Staff only can set them.
-- ---------------------------------------------------------------------------
do $$ declare today date := (now() at time zone 'Europe/London')::date; begin
  perform test_as('a6200000-0000-0000-0000-000000000003');
  begin perform public.set_collection_window('a6200000-0000-0000-0000-0000000000f1', today, today);
    raise exception 'a reader should not set dates'; exception when insufficient_privilege then null; end;
  reset role;
  perform test_as('a6200000-0000-0000-0000-000000000001', array['editor']);
  perform public.set_collection_window('a6200000-0000-0000-0000-0000000000f1', today - 2, today + 5);
  perform public.set_collection_window('a6200000-0000-0000-0000-0000000000f3', today - 20, today - 10);
  begin perform public.set_collection_window('a6200000-0000-0000-0000-0000000000f1', today, today - 1);
    raise exception 'end before start accepted'; exception when sqlstate 'AKP04' then null; end;
  begin perform public.set_collection_window(gen_random_uuid(), today, today);
    raise exception 'unknown collection accepted'; exception when sqlstate 'AKP03' then null; end;
  reset role;

  perform test_as('a6200000-0000-0000-0000-000000000003');
  if (select count(*) from public.collections where slug in ('season-62','open-62','past-62')) <> 2 then raise exception 'a reader should see the open and in-window collections only'; end if;
  if exists (select 1 from public.collections where slug = 'past-62') then raise exception 'a collection past its end date should be hidden'; end if;
  if (select count(*) from public.collection_items i join public.collections c on c.id = i.collection_id where c.slug in ('season-62','open-62','past-62')) <> 2 then
    raise exception 'items follow the window';
  end if;
  reset role;
  perform test_as('a6200000-0000-0000-0000-000000000001', array['editor']);
  if (select count(*) from public.collections where slug in ('season-62','open-62','past-62')) <> 3 then raise exception 'staff see every collection'; end if;
  perform public.set_collection_window('a6200000-0000-0000-0000-0000000000f3', today + 3, null);
  reset role;
  perform test_as('a6200000-0000-0000-0000-000000000003');
  if exists (select 1 from public.collections where slug = 'past-62') then raise exception 'a collection before its start date should be hidden'; end if;
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- 3. The editorial slot: staff write, a visitor sees a live slot inside its
--    dates only, validation carries codes.
-- ---------------------------------------------------------------------------
do $$ declare today date := (now() at time zone 'Europe/London')::date; v_id uuid; v_future uuid; v_draft uuid; begin
  perform test_as('a6200000-0000-0000-0000-000000000003');
  begin perform public.save_editorial_slot(null, 'Heading', '', 'AK-T62A0', null, today, today, 'live');
    raise exception 'a reader should not save a slot'; exception when insufficient_privilege then null; end;
  begin insert into public.editorial_slots (heading, starts_on, ends_on) values ('x', today, today);
    raise exception 'no insert grant'; exception when insufficient_privilege then null; end;
  reset role;

  perform test_as('a6200000-0000-0000-0000-000000000001', array['editor']);
  v_id := public.save_editorial_slot(null, 'This week', 'A short line.', 'ak-t62a0', null, today - 1, today + 5, 'live');
  v_future := public.save_editorial_slot(null, 'Next month', '', null, 'theme-62', today + 10, today + 16, 'live');
  v_draft := public.save_editorial_slot(null, 'Draft', '', 'AK-T62A0', null, today, today + 1, 'draft');
  begin perform public.save_editorial_slot(null, '', '', 'AK-T62A0', null, today, today, 'live');
    raise exception 'empty heading accepted'; exception when sqlstate 'AKP05' then null; end;
  begin perform public.save_editorial_slot(null, 'No target', '', null, null, today, today, 'live');
    raise exception 'a slot with no title or Theme accepted'; exception when sqlstate 'AKP05' then null; end;
  begin perform public.save_editorial_slot(null, 'Dash — here', '', 'AK-T62A0', null, today, today, 'live');
    raise exception 'a dash accepted'; exception when sqlstate 'AKP05' then null; end;
  begin perform public.save_editorial_slot(null, 'Backwards', '', 'AK-T62A0', null, today, today - 1, 'live');
    raise exception 'end before start accepted'; exception when sqlstate 'AKP05' then null; end;
  begin perform public.save_editorial_slot(null, 'Long', '', 'AK-T62A0', null, today, today + 40, 'live');
    raise exception 'a long window accepted'; exception when sqlstate 'AKP10' then null; end;
  begin perform public.save_editorial_slot(null, 'Unknown', '', 'AK-NOPE0', null, today, today, 'live');
    raise exception 'unknown code accepted'; exception when sqlstate 'AKP07' then null; end;
  begin perform public.save_editorial_slot(null, 'Unknown', '', null, 'no-theme', today, today, 'live');
    raise exception 'unknown Theme accepted'; exception when sqlstate 'AKP07' then null; end;
  begin perform public.save_editorial_slot(gen_random_uuid(), 'Missing', '', 'AK-T62A0', null, today, today, 'live');
    raise exception 'unknown slot accepted'; exception when sqlstate 'AKP06' then null; end;
  if (select count(*) from public.editorial_slots) <> 3 then raise exception 'staff see all slots'; end if;
  reset role;

  perform test_as('a6200000-0000-0000-0000-000000000003');
  if (select count(*) from public.editorial_slots) <> 1 then raise exception 'a visitor sees only the live slot inside its dates'; end if;
  if (select heading from public.editorial_slots) <> 'This week' then raise exception 'wrong slot shown'; end if;
  reset role;

  perform test_as('a6200000-0000-0000-0000-000000000001', array['editor']);
  perform public.save_editorial_slot(v_id, 'This week, changed', '', 'AK-T62A0', null, today - 1, today + 5, 'live');
  if (select heading from public.editorial_slots where id = v_id) <> 'This week, changed' then raise exception 'update should save'; end if;
  perform public.delete_editorial_slot(v_draft);
  begin perform public.delete_editorial_slot(v_draft);
    raise exception 'delete of a missing slot accepted'; exception when sqlstate 'AKP06' then null; end;
  reset role;
  perform test_as('a6200000-0000-0000-0000-000000000002', array['support']);
  begin perform public.delete_editorial_slot(v_id);
    raise exception 'support should not delete'; exception when insufficient_privilege then null; end;
  reset role;
  if not exists (select 1 from public.audit_log where action = 'editorial_slot.saved') then raise exception 'slot saves should be audited'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Staff set an author's bio.
-- ---------------------------------------------------------------------------
do $$ begin
  perform test_as('a6200000-0000-0000-0000-000000000003');
  begin perform public.staff_set_author_bio('author-62', 'Hello.');
    raise exception 'a reader should not set a bio'; exception when insufficient_privilege then null; end;
  reset role;
  perform test_as('a6200000-0000-0000-0000-000000000001', array['editor']);
  perform public.staff_set_author_bio('author-62', ' Author 62 writes about work. ');
  if (select bio from public.authors where slug = 'author-62') <> 'Author 62 writes about work.' then raise exception 'bio should be trimmed and saved'; end if;
  reset role;
  if (select bio_status from public.authors where slug = 'author-62') <> 'approved' then raise exception 'a staff bio is approved'; end if;
  perform test_as('a6200000-0000-0000-0000-000000000001', array['editor']);
  begin perform public.staff_set_author_bio('author-62', 'A dash – here');
    raise exception 'a dash was accepted'; exception when sqlstate 'AKP09' then null; end;
  begin perform public.staff_set_author_bio('author-62', repeat('x', 701));
    raise exception 'a long bio was accepted'; exception when sqlstate 'AKP09' then null; end;
  begin perform public.staff_set_author_bio('nobody', 'x');
    raise exception 'unknown author accepted'; exception when sqlstate 'AKP08' then null; end;
  perform public.staff_set_author_bio('author-62', null);
  reset role;
  if (select bio_status from public.authors where slug = 'author-62') <> 'none' then raise exception 'clearing the bio resets the status'; end if;
end $$;

rollback;
