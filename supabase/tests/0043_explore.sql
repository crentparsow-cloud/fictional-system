-- Explore, shelf pages and collections (0043). Collections can be read when
-- live and written only through the staff functions; the shelf editorial
-- function is staff only; explore_signals returns counts and nothing else.
-- Each block must raise or return the expected value; a failure aborts the script.
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('a4300000-0000-0000-0000-000000000001', 'editor43@test'),
  ('a4300000-0000-0000-0000-000000000002', 'support43@test'),
  ('a4300000-0000-0000-0000-000000000003', 'reader43@test');
insert into public.platform_roles (user_id, role) values
  ('a4300000-0000-0000-0000-000000000001', 'editor'),
  ('a4300000-0000-0000-0000-000000000002', 'support');

insert into public.organisations (id, code, kind, legal_name, display_name, slug, country) values
  ('a4300000-0000-0000-0000-0000000000a1', 'PB-TD043', 'publisher', 'Org 43 Ltd', 'Org 43', 'org-43', 'GB');
insert into public.books (id, org_id, slug, title, rights_status) values
  ('a4300000-0000-0000-0000-0000000000b1', 'a4300000-0000-0000-0000-0000000000a1', 'book-43', 'Book 43', 'public_domain');
insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, safety_tier, depth, status) values
  ('a4300000-0000-0000-0000-0000000000c1', 'AK-T43A0', 'a4300000-0000-0000-0000-0000000000b1', 'a4300000-0000-0000-0000-0000000000a1', 'wb-43a', 'Workbook 43 A', 'Card', 'productivity', 'none', 'full', 'live'),
  ('a4300000-0000-0000-0000-0000000000c2', 'AK-T43B0', 'a4300000-0000-0000-0000-0000000000b1', 'a4300000-0000-0000-0000-0000000000a1', 'wb-43b', 'Workbook 43 B', 'Card', 'productivity', 'none', 'full', 'draft');
insert into public.workbook_versions (id, workbook_id, semver, content, content_hash) values
  ('a4300000-0000-0000-0000-0000000000d1', 'a4300000-0000-0000-0000-0000000000c1', '1.0.0', '{}'::jsonb, repeat('c', 64)),
  ('a4300000-0000-0000-0000-0000000000d2', 'a4300000-0000-0000-0000-0000000000c2', '1.0.0', '{}'::jsonb, repeat('d', 64));

insert into auth.users (id, email)
select ('a4300000-0000-0000-0001-' || lpad(g::text, 12, '0'))::uuid, 'r' || g || '@t43' from generate_series(1, 4) g;
insert into public.enrolments (user_id, tenant_id, workbook_id, version_id, status)
select ('a4300000-0000-0000-0001-' || lpad(g::text, 12, '0'))::uuid, '00000000-0000-0000-0000-00000000000a',
       'a4300000-0000-0000-0000-0000000000c1', 'a4300000-0000-0000-0000-0000000000d1', case when g <= 1 then 'finished' else 'active' end
  from generate_series(1, 4) g;
insert into public.enrolments (user_id, tenant_id, workbook_id, version_id, status) values
  ('a4300000-0000-0000-0001-000000000001', '00000000-0000-0000-0000-00000000000a', 'a4300000-0000-0000-0000-0000000000c2', 'a4300000-0000-0000-0000-0000000000d2', 'active');

-- ---------------------------------------------------------------------------
-- 1. Only owners and editors save a collection.
-- ---------------------------------------------------------------------------
do $$ begin
  perform test_as('a4300000-0000-0000-0000-000000000002', array['support']);
  begin
    perform public.save_collection(null, 'calm-starts', 'Calm starts', 'Line', 'wellbeing', null, 'live', 0, array['AK-T43A0']);
    raise exception 'support should not save a collection';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform test_as('a4300000-0000-0000-0000-000000000003');
  begin
    perform public.save_collection(null, 'calm-starts', 'Calm starts', 'Line', 'wellbeing', null, 'live', 0, array['AK-T43A0']);
    raise exception 'a reader should not save a collection';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.collections (slug, name) values ('direct', 'Direct');
    raise exception 'a reader should have no insert grant';
  exception when insufficient_privilege then null;
  end;
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- 2. An editor saves; refusals carry their codes; the order is kept.
-- ---------------------------------------------------------------------------
do $$ declare v_id uuid; v_ids text; begin
  perform test_as('a4300000-0000-0000-0000-000000000001', array['editor']);
  v_id := public.save_collection(null, 'Calm-Starts', 'Calm starts', 'Gentle first steps.', 'wellbeing', 'waves', 'live', 1, array['AK-T43B0', 'AK-T43A0']);
  select string_agg(w.code, ',' order by i.position) into v_ids
    from public.collection_items i join public.workbooks w on w.id = i.workbook_id where i.collection_id = v_id;
  if v_ids <> 'AK-T43B0,AK-T43A0' then raise exception 'order should be kept, got %', v_ids; end if;

  -- Replace: the list is swapped, not appended.
  perform public.save_collection(v_id, 'calm-starts', 'Calm starts', 'Gentle first steps.', 'wellbeing', null, 'live', 1, array['AK-T43A0']);
  if (select count(*) from public.collection_items where collection_id = v_id) <> 1 then raise exception 'replace should swap the list'; end if;

  begin perform public.save_collection(null, 'Bad Slug', 'x', '', 'wellbeing', null, 'live', 0, '{}');
    raise exception 'bad slug accepted'; exception when sqlstate 'AKE01' then null; end;
  begin perform public.save_collection(null, 'ok-slug', '', '', 'wellbeing', null, 'live', 0, '{}');
    raise exception 'empty name accepted'; exception when sqlstate 'AKE02' then null; end;
  begin perform public.save_collection(null, 'ok-slug', 'x', '', 'wellbeing', null, 'live', 0, array['AK-NOPE0']);
    raise exception 'unknown code accepted'; exception when sqlstate 'AKE03' then null; end;
  begin perform public.save_collection(null, 'ok-slug', 'x', '', 'wellbeing', null, 'live', 0, array['AK-T43A0', 'AK-T43A0']);
    raise exception 'duplicate code accepted'; exception when sqlstate 'AKE03' then null; end;
  begin perform public.save_collection(null, 'ok-slug', 'x', '', 'nothing', null, 'live', 0, '{}');
    raise exception 'unknown genre accepted'; exception when sqlstate 'AKE07' then null; end;
  begin perform public.save_collection(null, 'ok-slug', 'x', '', 'wellbeing', null, 'maybe', 0, '{}');
    raise exception 'unknown status accepted'; exception when sqlstate 'AKE09' then null; end;
  begin perform public.save_collection(gen_random_uuid(), 'ok-slug', 'x', '', 'wellbeing', null, 'live', 0, '{}');
    raise exception 'unknown id accepted'; exception when sqlstate 'AKE04' then null; end;
  begin perform public.save_collection(null, 'calm-starts', 'Again', '', 'wellbeing', null, 'live', 0, '{}');
    raise exception 'duplicate slug accepted'; exception when unique_violation then null; end;

  perform public.save_collection(null, 'quiet-drafts', 'Quiet drafts', '', 'career', null, 'draft', 2, '{}');
  reset role;
  if not exists (select 1 from public.audit_log where action = 'collection.saved') then raise exception 'save should be audited'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Readers and visitors see live collections only; staff see drafts too.
-- ---------------------------------------------------------------------------
do $$ begin
  perform test_as('a4300000-0000-0000-0000-000000000003');
  if (select count(*) from public.collections) <> 1 then raise exception 'a reader sees live collections only'; end if;
  if (select count(*) from public.collection_items) <> 1 then raise exception 'a reader sees items of live collections only'; end if;
  reset role;
  perform test_as('a4300000-0000-0000-0000-000000000001', array['editor']);
  if (select count(*) from public.collections) <> 2 then raise exception 'staff see drafts'; end if;
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Shelf editorial: staff only, validates the code, clears with nulls.
-- ---------------------------------------------------------------------------
do $$ begin
  insert into public.shelves (id, name, status, sort) values ('shelf-43', 'Shelf 43', 'active', 99);
  perform test_as('a4300000-0000-0000-0000-000000000003');
  begin perform public.set_shelf_editorial('shelf-43', 'Line', null);
    raise exception 'a reader should not set the shelf page'; exception when insufficient_privilege then null; end;
  reset role;
  perform test_as('a4300000-0000-0000-0000-000000000001', array['editor']);
  perform public.set_shelf_editorial('shelf-43', '  A line from us.  ', 'ak-t43a0');
  if (select editors_line from public.shelves where id = 'shelf-43') <> 'A line from us.' then raise exception 'line should be trimmed and saved'; end if;
  if (select featured_workbook_id from public.shelves where id = 'shelf-43') <> 'a4300000-0000-0000-0000-0000000000c1' then raise exception 'featured should be set'; end if;
  begin perform public.set_shelf_editorial('shelf-43', 'x', 'AK-NOPE0');
    raise exception 'unknown featured code accepted'; exception when sqlstate 'AKE06' then null; end;
  begin perform public.set_shelf_editorial('shelf-43', repeat('x', 281), null);
    raise exception 'long line accepted'; exception when sqlstate 'AKE08' then null; end;
  begin perform public.set_shelf_editorial('no-such-shelf', 'x', null);
    raise exception 'unknown shelf accepted'; exception when sqlstate 'AKE05' then null; end;
  perform public.set_shelf_editorial('shelf-43', '', null);
  if (select editors_line from public.shelves where id = 'shelf-43') is not null then raise exception 'empty line should clear'; end if;
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- 5. explore_signals: counts for live workbooks only, open to a visitor.
-- ---------------------------------------------------------------------------
do $$ declare r record; begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "anon"}'::text, true);
  execute 'set local role anon';
  select * into r from public.explore_signals('00000000-0000-0000-0000-00000000000a') where workbook_id = 'a4300000-0000-0000-0000-0000000000c1';
  if r.starts <> 4 or r.finishes <> 1 then raise exception 'expected 4 starts and 1 finish, got % and %', r.starts, r.finishes; end if;
  if exists (select 1 from public.explore_signals('00000000-0000-0000-0000-00000000000a') where workbook_id = 'a4300000-0000-0000-0000-0000000000c2') then
    raise exception 'a draft workbook has no signals';
  end if;
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Delete is staff only and audited.
-- ---------------------------------------------------------------------------
do $$ begin
  perform test_as('a4300000-0000-0000-0000-000000000003');
  begin perform public.delete_collection((select id from public.collections limit 1));
    raise exception 'a reader should not delete'; exception when insufficient_privilege then null; end;
  reset role;
  perform test_as('a4300000-0000-0000-0000-000000000001', array['editor']);
  perform public.delete_collection((select id from public.collections where slug = 'quiet-drafts'));
  if exists (select 1 from public.collections where slug = 'quiet-drafts') then raise exception 'collection should be gone'; end if;
  begin perform public.delete_collection(gen_random_uuid());
    raise exception 'unknown id accepted'; exception when sqlstate 'AKE04' then null; end;
  reset role;
end $$;

rollback;
