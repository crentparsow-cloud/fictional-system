-- Studio (0057): the builder saves a draft version for members who may write
-- the workbook, and nothing Akana owns can change. The end-of-programme
-- question is answered once by a finished reader and read only as counts of
-- 10 or more. The home summary hides small counts.
-- Each block must raise or return the expected value; a failure aborts the script.
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('a5700000-0000-0000-0000-000000000001', 'owner57@test'),
  ('a5700000-0000-0000-0000-000000000002', 'author57@test'),
  ('a5700000-0000-0000-0000-000000000003', 'viewer57@test'),
  ('a5700000-0000-0000-0000-000000000004', 'outsider57@test'),
  ('a5700000-0000-0000-0000-000000000005', 'staff57@test');
insert into public.platform_roles (user_id, role) values ('a5700000-0000-0000-0000-000000000005', 'editor');

insert into public.organisations (id, code, kind, legal_name, display_name, slug, country) values
  ('a5700000-0000-0000-0000-0000000000a1', 'PB-TD057', 'publisher', 'Org 57 Ltd', 'Org 57', 'org-57', 'GB'),
  ('a5700000-0000-0000-0000-0000000000a2', 'PB-TD058', 'publisher', 'Org 58 Ltd', 'Org 58', 'org-58', 'GB');
insert into public.org_members (org_id, user_id, role) values
  ('a5700000-0000-0000-0000-0000000000a1', 'a5700000-0000-0000-0000-000000000001', 'owner'),
  ('a5700000-0000-0000-0000-0000000000a1', 'a5700000-0000-0000-0000-000000000002', 'author'),
  ('a5700000-0000-0000-0000-0000000000a1', 'a5700000-0000-0000-0000-000000000003', 'viewer'),
  ('a5700000-0000-0000-0000-0000000000a2', 'a5700000-0000-0000-0000-000000000004', 'owner');
insert into public.books (id, org_id, slug, title, rights_status) values
  ('a5700000-0000-0000-0000-0000000000b1', 'a5700000-0000-0000-0000-0000000000a1', 'book-57', 'Book 57', 'public_domain');
insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, safety_tier, depth, status, badge) values
  ('a5700000-0000-0000-0000-0000000000c1', 'AK-T57A0', 'a5700000-0000-0000-0000-0000000000b1', 'a5700000-0000-0000-0000-0000000000a1', 'wb-57a', 'Workbook 57 A', 'Card', 'productivity', 'none', 'full', 'live', 'official'),
  ('a5700000-0000-0000-0000-0000000000c2', 'AK-T57B0', 'a5700000-0000-0000-0000-0000000000b1', 'a5700000-0000-0000-0000-0000000000a1', 'wb-57b', 'Workbook 57 B', 'Card', 'wellbeing', 'standard', 'full', 'live', 'official'),
  ('a5700000-0000-0000-0000-0000000000c3', 'AK-T57C0', 'a5700000-0000-0000-0000-0000000000b1', 'a5700000-0000-0000-0000-0000000000a1', 'wb-57c', 'Workbook 57 C', 'Card', 'productivity', 'none', 'full', 'draft', 'official');
insert into public.workbook_versions (id, workbook_id, semver, content, content_hash, published_at) values
  ('a5700000-0000-0000-0000-0000000000d1', 'a5700000-0000-0000-0000-0000000000c1', '1.0.0',
   '{"code":"AK-T57A0","slug":"wb-57a","safety_tier":"none","badge":"official","is_demo":false,"start":{"welcome":"Hello"},"internal":{"notes":"house"},"units":[]}'::jsonb, repeat('1', 64), now()),
  ('a5700000-0000-0000-0000-0000000000d3', 'a5700000-0000-0000-0000-0000000000c3', '1.0.0',
   '{"code":"AK-T57C0","slug":"wb-57c","safety_tier":"none","badge":"official","is_demo":false,"start":{"welcome":"Hello"},"units":[]}'::jsonb, repeat('3', 64), null);

-- ---------------------------------------------------------------------------
-- 1. The builder: who may save, and what must stay as it was.
-- ---------------------------------------------------------------------------
do $$ declare r record; c jsonb;
begin
  c := '{"code":"AK-T57A0","slug":"wb-57a","safety_tier":"none","badge":"official","is_demo":false,"start":{"welcome":"Hello there"},"internal":{"notes":"house"},"units":[]}';

  perform test_as('a5700000-0000-0000-0000-000000000003');
  begin perform * from public.studio_save_draft_version('a5700000-0000-0000-0000-0000000000c1', 'a5700000-0000-0000-0000-0000000000d1', c, repeat('a', 64), 0, 0);
    raise exception 'a viewer should not save'; exception when sqlstate 'AKZ21' then null; end;
  reset role;
  perform test_as('a5700000-0000-0000-0000-000000000004');
  begin perform * from public.studio_save_draft_version('a5700000-0000-0000-0000-0000000000c1', 'a5700000-0000-0000-0000-0000000000d1', c, repeat('a', 64), 0, 0);
    raise exception 'another organisation should not save'; exception when sqlstate 'AKZ21' then null; end;
  reset role;

  perform test_as('a5700000-0000-0000-0000-000000000002');
  begin perform * from public.studio_save_draft_version('a5700000-0000-0000-0000-0000000000c1', 'a5700000-0000-0000-0000-0000000000d1', c, repeat('a', 64), 2, 0);
    raise exception 'validator errors accepted'; exception when sqlstate 'AKZ24' then null; end;
  begin perform * from public.studio_save_draft_version('a5700000-0000-0000-0000-0000000000c1', 'a5700000-0000-0000-0000-0000000000d1', c || '{"code":"AK-OTHER"}', repeat('a', 64), 0, 0);
    raise exception 'a changed code accepted'; exception when sqlstate 'AKZ24' then null; end;
  begin perform * from public.studio_save_draft_version('a5700000-0000-0000-0000-0000000000c1', 'a5700000-0000-0000-0000-0000000000d1', c, repeat('1', 64), 0, 0);
    raise exception 'unchanged content accepted'; exception when check_violation then null; end;
  begin perform * from public.studio_save_draft_version('a5700000-0000-0000-0000-0000000000c1', null, c, repeat('a', 64), 0, 0);
    raise exception 'a null base accepted'; exception when invalid_parameter_value then null; end;
  begin perform * from public.studio_save_draft_version('a5700000-0000-0000-0000-0000000000c1', 'a5700000-0000-0000-0000-0000000000d1', jsonb_set(c, '{safety_tier}', '"higher"'), repeat('a', 64), 0, 0);
    raise exception 'a changed safety tier accepted'; exception when sqlstate 'AKZ23' then null; end;
  begin perform * from public.studio_save_draft_version('a5700000-0000-0000-0000-0000000000c1', 'a5700000-0000-0000-0000-0000000000d1', jsonb_set(c, '{badge}', '"demo"'), repeat('a', 64), 0, 0);
    raise exception 'a changed badge accepted'; exception when sqlstate 'AKZ23' then null; end;
  begin perform * from public.studio_save_draft_version('a5700000-0000-0000-0000-0000000000c1', 'a5700000-0000-0000-0000-0000000000d1', jsonb_set(c, '{internal,notes}', '"mine"'), repeat('a', 64), 0, 0);
    raise exception 'a changed internal block accepted'; exception when sqlstate 'AKZ23' then null; end;
  begin perform * from public.studio_save_draft_version('a5700000-0000-0000-0000-0000000000c1', 'a5700000-0000-0000-0000-0000000000d1', c || '{"safety_hub":{"points":[]}}', repeat('a', 64), 0, 0);
    raise exception 'an added safety hub accepted'; exception when sqlstate 'AKZ23' then null; end;

  select * into r from public.studio_save_draft_version('a5700000-0000-0000-0000-0000000000c1', 'a5700000-0000-0000-0000-0000000000d1', c, repeat('a', 64), 0, 3);
  if r.semver <> '1.0.1' then raise exception 'expected 1.0.1, got %', r.semver; end if;
  begin perform * from public.studio_save_draft_version('a5700000-0000-0000-0000-0000000000c1', 'a5700000-0000-0000-0000-0000000000d1', c || '{"tagline":"x"}', repeat('b', 64), 0, 0);
    raise exception 'saving from an older base accepted'; exception when sqlstate 'AKZ22' then null; end;
  reset role;

  if (select published_at from public.workbook_versions where id = r.version_id) is not null then raise exception 'a draft is never published'; end if;
  if (select validated_at from public.workbook_versions where id = r.version_id) is null then raise exception 'validated_at should be set'; end if;
  if not exists (select 1 from public.review_validations where version_id = r.version_id and content_hash = repeat('a', 64) and ok and warning_count = 3) then raise exception 'validator row'; end if;
  if (select status from public.workbooks where id = 'a5700000-0000-0000-0000-0000000000c1') <> 'live' then raise exception 'a live workbook stays live'; end if;
  if not exists (select 1 from public.audit_log where action = 'workbook.version_saved_by_author') then raise exception 'save should be audited'; end if;

  -- A draft workbook moves into review with its saved version.
  perform test_as('a5700000-0000-0000-0000-000000000001');
  perform * from public.studio_save_draft_version('a5700000-0000-0000-0000-0000000000c3', 'a5700000-0000-0000-0000-0000000000d3',
    '{"code":"AK-T57C0","slug":"wb-57c","safety_tier":"none","badge":"official","is_demo":false,"start":{"welcome":"Hi"},"units":[]}', repeat('c', 64), 0, 0);
  reset role;
  if (select status from public.workbooks where id = 'a5700000-0000-0000-0000-0000000000c3') <> 'in_review' then raise exception 'a draft moves into review'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The question: set by members, refused on a safety tier, answered once.
-- ---------------------------------------------------------------------------
do $$ begin
  perform test_as('a5700000-0000-0000-0000-000000000003');
  begin perform public.studio_set_programme_question('a5700000-0000-0000-0000-0000000000c1', 'Did it help you?', array['Yes','No']);
    raise exception 'a viewer should not set a question'; exception when sqlstate 'AKZ21' then null; end;
  reset role;
  perform test_as('a5700000-0000-0000-0000-000000000002');
  begin perform public.studio_set_programme_question('a5700000-0000-0000-0000-0000000000c2', 'Did it help you?', array['Yes','No']);
    raise exception 'a safety tier title should not take a question'; exception when sqlstate 'AKZ31' then null; end;
  begin perform public.studio_set_programme_question('a5700000-0000-0000-0000-0000000000c1', 'Did it help you?', array['Yes']);
    raise exception 'one answer accepted'; exception when sqlstate 'AKZ31' then null; end;
  begin perform public.studio_set_programme_question('a5700000-0000-0000-0000-0000000000c1', 'Did it help you?', array['Yes','yes']);
    raise exception 'duplicate answers accepted'; exception when sqlstate 'AKZ31' then null; end;
  begin perform public.studio_set_programme_question('a5700000-0000-0000-0000-0000000000c1', 'Did it help you?', array['a','b','c','d','e','f']);
    raise exception 'six answers accepted'; exception when sqlstate 'AKZ31' then null; end;
  begin perform public.studio_set_programme_question('a5700000-0000-0000-0000-0000000000c1', 'No', array['Yes','No']);
    raise exception 'a very short question accepted'; exception when sqlstate 'AKZ31' then null; end;
  perform public.studio_set_programme_question('a5700000-0000-0000-0000-0000000000c1', '  Which part helped you most?  ', array['The reading','The exercises',' The reminders ','']);
  reset role;
  if (select question from public.programme_questions where workbook_id = 'a5700000-0000-0000-0000-0000000000c1') <> 'Which part helped you most?' then raise exception 'question trimmed'; end if;
  if (select cardinality(options) from public.programme_questions where workbook_id = 'a5700000-0000-0000-0000-0000000000c1') <> 3 then raise exception 'blank answers dropped'; end if;
end $$;

insert into auth.users (id, email)
select ('a5700000-0000-0000-0001-' || lpad(g::text, 12, '0'))::uuid, 'r' || g || '@t57' from generate_series(1, 25) g;
insert into public.enrolments (id, user_id, tenant_id, workbook_id, version_id, status)
select ('a5700000-0000-0000-0003-' || lpad(g::text, 12, '0'))::uuid,
       ('a5700000-0000-0000-0001-' || lpad(g::text, 12, '0'))::uuid, '00000000-0000-0000-0000-00000000000a',
       'a5700000-0000-0000-0000-0000000000c1', 'a5700000-0000-0000-0000-0000000000d1',
       case when g <= 22 then 'finished' else 'active' end
  from generate_series(1, 25) g;

do $$ declare g int; begin
  -- Not finished: refused.
  perform test_as('a5700000-0000-0000-0001-000000000025');
  begin perform public.answer_programme_question('a5700000-0000-0000-0003-000000000025', 0);
    raise exception 'an unfinished reader should not answer'; exception when sqlstate 'AKZ33' then null; end;
  reset role;
  -- Someone else's enrolment: refused.
  perform test_as('a5700000-0000-0000-0001-000000000001');
  begin perform public.answer_programme_question('a5700000-0000-0000-0003-000000000002', 0);
    raise exception 'answering for another reader accepted'; exception when sqlstate 'AKZ33' then null; end;
  begin perform public.answer_programme_question('a5700000-0000-0000-0003-000000000001', 7);
    raise exception 'an answer off the list accepted'; exception when sqlstate 'AKZ32' then null; end;
  reset role;
  -- Author sees nothing until 10 have answered.
  for g in 1..9 loop
    perform test_as(('a5700000-0000-0000-0001-' || lpad(g::text, 12, '0'))::uuid);
    perform public.answer_programme_question(('a5700000-0000-0000-0003-' || lpad(g::text, 12, '0'))::uuid, case when g <= 6 then 0 else 1 end);
    reset role;
  end loop;
  perform test_as('a5700000-0000-0000-0000-000000000002');
  if exists (select 1 from public.studio_programme_question_results('a5700000-0000-0000-0000-0000000000c1') where n is not null or total is not null) then
    raise exception 'nine answers should show no numbers';
  end if;
  reset role;
  -- A second answer from the same reader changes nothing.
  perform test_as('a5700000-0000-0000-0001-000000000001');
  perform public.answer_programme_question('a5700000-0000-0000-0003-000000000001', 2);
  reset role;
  if (select option_index from public.programme_question_answers where enrolment_id = 'a5700000-0000-0000-0003-000000000001') <> 0 then raise exception 'first answer stands'; end if;
  -- Now 22 answers: 12 for option 0, 6 for option 1, 4 for option 2.
  for g in 10..22 loop
    perform test_as(('a5700000-0000-0000-0001-' || lpad(g::text, 12, '0'))::uuid);
    perform public.answer_programme_question(('a5700000-0000-0000-0003-' || lpad(g::text, 12, '0'))::uuid, case when g <= 15 then 0 when g <= 18 then 1 else 2 end);
    reset role;
  end loop;
end $$;

do $$ declare r record; begin
  perform test_as('a5700000-0000-0000-0000-000000000002');
  select * into r from public.studio_programme_question_results('a5700000-0000-0000-0000-0000000000c1') where option_index = 0;
  if r.n <> 12 or r.total <> 22 or r.suppressed then raise exception 'option 0: %, %, %', r.n, r.total, r.suppressed; end if;
  select * into r from public.studio_programme_question_results('a5700000-0000-0000-0000-0000000000c1') where option_index = 1;
  if r.n is not null or not r.suppressed then raise exception 'a count under 10 should be hidden'; end if;
  if (select count(*) from public.programme_question_answers) <> 0 then raise exception 'an author reads no answer rows'; end if;
  reset role;
  perform test_as('a5700000-0000-0000-0000-000000000004');
  begin perform * from public.studio_programme_question_results('a5700000-0000-0000-0000-0000000000c1');
    raise exception 'another organisation should not read results'; exception when sqlstate 'AKZ21' then null; end;
  reset role;
  -- A reader sees only their own answer row, and can read the question.
  perform test_as('a5700000-0000-0000-0001-000000000003');
  if (select count(*) from public.programme_question_answers) <> 1 then raise exception 'a reader sees their own row only'; end if;
  if (select count(*) from public.programme_questions) <> 1 then raise exception 'a reader reads the question of a live workbook'; end if;
  reset role;
  -- Changing the question clears the answers.
  perform test_as('a5700000-0000-0000-0000-000000000002');
  perform public.studio_set_programme_question('a5700000-0000-0000-0000-0000000000c1', 'Which part helped you most?', array['The reading','The exercises']);
  reset role;
  if (select count(*) from public.programme_question_answers) <> 0 then raise exception 'new wording should clear answers'; end if;
  perform test_as('a5700000-0000-0000-0000-000000000002');
  perform public.studio_set_programme_question('a5700000-0000-0000-0000-0000000000c1', '', null);
  reset role;
  if exists (select 1 from public.programme_questions) then raise exception 'an empty question clears it'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Home summary: counts under 10 are hidden in the database.
-- ---------------------------------------------------------------------------
do $$ declare r record; begin
  perform test_as('a5700000-0000-0000-0000-000000000001');
  select * into r from public.studio_home_summary('a5700000-0000-0000-0000-0000000000a1') where code = 'AK-T57A0';
  if r.started <> 25 or r.finished <> 22 then raise exception 'expected 25 and 22, got % and %', r.started, r.finished; end if;
  select * into r from public.studio_home_summary('a5700000-0000-0000-0000-0000000000a1') where code = 'AK-T57B0';
  if r.started is not null or r.finished is not null then raise exception 'a title with no readers hides its counts'; end if;
  if (select count(*) from public.studio_home_summary('a5700000-0000-0000-0000-0000000000a1')) <> 3 then raise exception 'three workbooks'; end if;
  reset role;
  perform test_as('a5700000-0000-0000-0000-000000000004');
  begin perform * from public.studio_home_summary('a5700000-0000-0000-0000-0000000000a1');
    raise exception 'another organisation should not read the summary'; exception when sqlstate 'AKZ21' then null; end;
  reset role;
end $$;

rollback;
