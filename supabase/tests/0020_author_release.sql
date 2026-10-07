-- Author release (0020): author and publisher sign-off against a content
-- hash, the price choice from the ladder and its staff review, the author
-- mail recipients, and the staff JSON editor's save. Each block must raise
-- or return the expected result; a failure aborts the script and the CI step.
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('a2000000-0000-0000-0000-000000000001', 'editor20@test'),
  ('a2000000-0000-0000-0000-000000000002', 'owner20@test'),
  ('a2000000-0000-0000-0000-000000000003', 'author20@test'),
  ('a2000000-0000-0000-0000-000000000004', 'finance20@test'),
  ('a2000000-0000-0000-0000-000000000005', 'outsider20@test'),
  ('a2000000-0000-0000-0000-000000000006', 'solo20@test');
insert into public.platform_roles (user_id, role) values
  ('a2000000-0000-0000-0000-000000000001', 'editor');

insert into public.organisations (id, code, kind, legal_name, display_name, slug, country, connect_status) values
  ('a2000000-0000-0000-0000-0000000000a1', 'PB-TST20', 'publisher', 'Org 20 Ltd', 'Org 20', 'org-20', 'GB', 'verified'),
  ('a2000000-0000-0000-0000-0000000000a2', 'AU-TST21', 'individual', 'Solo 20', 'Solo 20', 'solo-20', 'GB', 'verified');
insert into public.org_members (org_id, user_id, role) values
  ('a2000000-0000-0000-0000-0000000000a1', 'a2000000-0000-0000-0000-000000000002', 'owner'),
  ('a2000000-0000-0000-0000-0000000000a1', 'a2000000-0000-0000-0000-000000000003', 'author'),
  ('a2000000-0000-0000-0000-0000000000a1', 'a2000000-0000-0000-0000-000000000004', 'finance'),
  ('a2000000-0000-0000-0000-0000000000a2', 'a2000000-0000-0000-0000-000000000006', 'owner');
insert into public.profiles (user_id, display_name) values
  ('a2000000-0000-0000-0000-000000000003', 'Ann Author')
on conflict (user_id) do update set display_name = excluded.display_name;

-- A licensed book (not exempt from the licence) and a demo workbook.
insert into public.books (id, org_id, slug, title, rights_status) values
  ('a2000000-0000-0000-0000-0000000000b1', 'a2000000-0000-0000-0000-0000000000a1', 'book-20', 'Book 20', 'licensed'),
  ('a2000000-0000-0000-0000-0000000000b2', 'a2000000-0000-0000-0000-0000000000a2', 'book-20s', 'Book 20 Solo', 'own_work');

insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, safety_tier, depth, status, is_demo, badge) values
  ('a2000000-0000-0000-0000-0000000000c1', 'AK-T20A0', 'a2000000-0000-0000-0000-0000000000b1', 'a2000000-0000-0000-0000-0000000000a1',
   'wb-20a', 'Workbook 20A', 'Card', 'productivity', 'none', 'full', 'in_review', false, 'official'),
  ('a2000000-0000-0000-0000-0000000000c2', 'AK-T20B0', 'a2000000-0000-0000-0000-0000000000b1', 'a2000000-0000-0000-0000-0000000000a1',
   'wb-20b', 'Workbook 20B', 'Card', 'productivity', 'none', 'full', 'draft', true, 'demo'),
  ('a2000000-0000-0000-0000-0000000000c3', 'AK-T20C0', 'a2000000-0000-0000-0000-0000000000b1', 'a2000000-0000-0000-0000-0000000000a1',
   'wb-20c', 'Workbook 20C', 'Card', 'productivity', 'none', 'listing', 'draft', false, 'official'),
  ('a2000000-0000-0000-0000-0000000000c4', 'AK-T20D0', 'a2000000-0000-0000-0000-0000000000b2', 'a2000000-0000-0000-0000-0000000000a2',
   'wb-20d', 'Workbook 20D', 'Card', 'productivity', 'none', 'full', 'in_review', false, 'official');

insert into public.workbook_versions (id, workbook_id, semver, content, content_hash) values
  ('a2000000-0000-0000-0000-0000000000d1', 'a2000000-0000-0000-0000-0000000000c1', '1.0.0',
   '{"schema_version": "3.0", "code": "AK-T20A0", "title": "Workbook 20A"}'::jsonb, repeat('a', 64)),
  ('a2000000-0000-0000-0000-0000000000d4', 'a2000000-0000-0000-0000-0000000000c4', '1.0.0',
   '{"schema_version": "3.0", "code": "AK-T20D0", "title": "Workbook 20D"}'::jsonb, repeat('d', 64));

-- ---------------------------------------------------------------------------
-- 1. Author and publisher sign-off against the exact hash.
-- ---------------------------------------------------------------------------
select test_as('a2000000-0000-0000-0000-000000000005');
do $$ begin
  begin
    perform public.author_signoff('a2000000-0000-0000-0000-0000000000d1', repeat('a', 64), 'author', 'Out Sider');
    raise exception 'an outsider signed off';
  exception when sqlstate 'AKS01' then null; end;
  begin
    perform public.studio_release_status('a2000000-0000-0000-0000-0000000000d1');
    raise exception 'an outsider read the release status';
  exception when sqlstate 'AKS01' then null; end;
end $$;
reset role;

select test_as('a2000000-0000-0000-0000-000000000004');
do $$ begin
  begin
    perform public.author_signoff('a2000000-0000-0000-0000-0000000000d1', repeat('a', 64), 'author', 'Fin Ance');
    raise exception 'a finance member signed off';
  exception when sqlstate 'AKS01' then null; end;
end $$;
reset role;

select test_as('a2000000-0000-0000-0000-000000000003');
do $$ declare a uuid; b uuid; n int; begin
  begin
    perform public.author_signoff('a2000000-0000-0000-0000-0000000000d1', repeat('b', 64), 'author', 'Ann Author');
    raise exception 'a sign-off on another hash was accepted';
  exception when sqlstate 'AKR02' then null; end;
  begin
    perform public.author_signoff('a2000000-0000-0000-0000-0000000000d1', repeat('a', 64), 'publisher', 'Ann Author');
    raise exception 'an author gave a publisher sign-off';
  exception when sqlstate 'AKS01' then null; end;
  begin
    perform public.author_signoff('a2000000-0000-0000-0000-0000000000d1', repeat('a', 64), 'editor', 'Ann Author');
    raise exception 'an author gave an editor sign-off';
  exception when sqlstate 'AKS02' then null; end;
  begin
    perform public.author_signoff('a2000000-0000-0000-0000-0000000000d1', repeat('a', 64), 'author', '   ');
    raise exception 'a sign-off without a name was accepted';
  exception when sqlstate 'AKS02' then null; end;
  select count(*) into n from public.studio_release_status('a2000000-0000-0000-0000-0000000000d1')
   where requirement = 'author_or_publisher' and met;
  if n <> 0 then raise exception 'author requirement met before any sign-off'; end if;
  a := public.author_signoff('a2000000-0000-0000-0000-0000000000d1', repeat('a', 64), 'author', 'Ann Author', 'Read on my phone.');
  b := public.author_signoff('a2000000-0000-0000-0000-0000000000d1', repeat('a', 64), 'author', 'Ann Author');
  if a is distinct from b then raise exception 'a repeat sign-off made a second row'; end if;
  select count(*) into n from public.studio_release_status('a2000000-0000-0000-0000-0000000000d1')
   where requirement = 'author_or_publisher' and met;
  if n <> 1 then raise exception 'author requirement not met after the sign-off'; end if;
  -- direct writes stay closed
  begin
    insert into public.release_signoffs (version_id, content_hash, kind, signer_name)
    values ('a2000000-0000-0000-0000-0000000000d1', repeat('a', 64), 'editor', 'Ann');
    raise exception 'an author wrote a sign-off row directly';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select test_as('a2000000-0000-0000-0000-000000000002');
do $$ begin
  perform public.author_signoff('a2000000-0000-0000-0000-0000000000d1', repeat('a', 64), 'publisher', 'Owen Owner');
end $$;
reset role;

-- An individual's owner is an author, not a publisher.
select test_as('a2000000-0000-0000-0000-000000000006');
do $$ begin
  begin
    perform public.author_signoff('a2000000-0000-0000-0000-0000000000d4', repeat('d', 64), 'publisher', 'Solo');
    raise exception 'an individual gave a publisher sign-off';
  exception when sqlstate 'AKS01' then null; end;
  perform public.author_signoff('a2000000-0000-0000-0000-0000000000d4', repeat('d', 64), 'author', 'Solo Writer');
end $$;
reset role;

do $$ begin
  if (select count(*) from public.release_signoffs where version_id = 'a2000000-0000-0000-0000-0000000000d1'
      and content_hash = repeat('a', 64) and kind in ('author','publisher')) <> 2 then
    raise exception 'expected an author and a publisher sign-off on d1'; end if;
  if (select recorded_by from public.release_signoffs where version_id = 'a2000000-0000-0000-0000-0000000000d1' and kind = 'author')
     <> 'a2000000-0000-0000-0000-000000000003' then raise exception 'recorded_by is not the author'; end if;
  if (select count(*) from public.audit_log where action = 'release.signoff' and org_id = 'a2000000-0000-0000-0000-0000000000a1') <> 2 then
    raise exception 'sign-off audit rows missing'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Price choice from the ladder and its review.
-- ---------------------------------------------------------------------------
select test_as('a2000000-0000-0000-0000-000000000003');
do $$ declare s text; begin
  begin
    update public.workbooks set price_point_id = 'p3' where id = 'a2000000-0000-0000-0000-0000000000c1';
    raise exception 'an author set the price directly';
  exception when insufficient_privilege then null; end;
  begin
    perform public.price_choose('a2000000-0000-0000-0000-0000000000c1', 'member_month', false);
    raise exception 'a membership point was chosen for a workbook';
  exception when sqlstate 'AKS02' then null; end;
  begin
    perform public.price_choose('a2000000-0000-0000-0000-0000000000c1', 'p9', false);
    raise exception 'an unknown point was chosen';
  exception when sqlstate 'AKS02' then null; end;
  begin
    perform public.price_choose('a2000000-0000-0000-0000-0000000000c1', 'p3', true);
    raise exception 'membership was chosen without a licence that allows it';
  exception when sqlstate 'AKS02' then null; end;
  begin
    perform public.price_choose('a2000000-0000-0000-0000-0000000000c2', 'p3', false);
    raise exception 'a demo workbook was priced';
  exception when sqlstate 'AKS08' then null; end;
  if public.licence_allows_membership('a2000000-0000-0000-0000-0000000000c1') then raise exception 'no licence yet, but membership allowed'; end if;
  s := public.price_choose('a2000000-0000-0000-0000-0000000000c1', 'p3', false);
  if s <> 'pending' then raise exception 'choice should be pending'; end if;
  if (select count(*) from public.workbook_price_choices) <> 1 then raise exception 'author cannot read the choice'; end if;
  begin
    perform public.price_review('a2000000-0000-0000-0000-0000000000c1', true, null);
    raise exception 'an author approved their own price';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.workbook_price_choices (workbook_id, org_id, price_point_id, in_membership)
    values ('a2000000-0000-0000-0000-0000000000c3', 'a2000000-0000-0000-0000-0000000000a1', 'p1', false);
    raise exception 'an author wrote a price choice directly';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select test_as('a2000000-0000-0000-0000-000000000005');
do $$ begin
  if (select count(*) from public.workbook_price_choices) <> 0 then raise exception 'an outsider read a price choice'; end if;
end $$;
reset role;

select test_as('a2000000-0000-0000-0000-000000000001', array['editor']);
do $$ declare s text; begin
  s := public.price_review('a2000000-0000-0000-0000-0000000000c1', true, null);
  if s <> 'approved' then raise exception 'approve returned %', s; end if;
  begin
    perform public.price_review('a2000000-0000-0000-0000-0000000000c1', true, null);
    raise exception 'an approved choice was approved again';
  exception when object_not_in_prerequisite_state then null; end;
end $$;
reset role;
do $$ begin
  if (select price_point_id from public.workbooks where id = 'a2000000-0000-0000-0000-0000000000c1') <> 'p3' then
    raise exception 'approval did not set the price'; end if;
  if (select in_membership from public.workbooks where id = 'a2000000-0000-0000-0000-0000000000c1') then
    raise exception 'approval did not take the title out of the membership'; end if;
  if (select count(*) from public.audit_log where action in ('price.chosen','price.approved')) <> 2 then
    raise exception 'price audit rows missing'; end if;
end $$;

-- A licence that includes the membership lets the author choose it; a decline needs a reason.
insert into public.licences (id, ref, book_id, org_id, text_version, text_sha256, method, status, term_months,
                             subscription_included, cover_rights, audio_rights, warranties, signer_name, signer_capacity)
values ('a2000000-0000-0000-0000-0000000000e1', 'LIC-T20A0', 'a2000000-0000-0000-0000-0000000000b1', 'a2000000-0000-0000-0000-0000000000a1',
        '0.1.0-draft', repeat('e', 64), 'clickwrap', 'test_only', 12, true, true, false, '{}'::jsonb, 'Owen Owner', 'Director');
select test_as('a2000000-0000-0000-0000-000000000003');
do $$ begin
  if not public.licence_allows_membership('a2000000-0000-0000-0000-0000000000c1') then raise exception 'licence should allow membership'; end if;
  perform public.price_choose('a2000000-0000-0000-0000-0000000000c1', 'p4', true);
end $$;
reset role;
select test_as('a2000000-0000-0000-0000-000000000001', array['editor']);
do $$ declare s text; begin
  begin
    perform public.price_review('a2000000-0000-0000-0000-0000000000c1', false, '  ');
    raise exception 'a decline without a reason';
  exception when check_violation then null; end;
  s := public.price_review('a2000000-0000-0000-0000-0000000000c1', false, 'Point 4 is for longer workbooks.');
  if s <> 'declined' then raise exception 'decline returned %', s; end if;
end $$;
reset role;
do $$ begin
  if (select price_point_id from public.workbooks where id = 'a2000000-0000-0000-0000-0000000000c1') <> 'p3' then
    raise exception 'a decline changed the price'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Author mail recipients: reviewers only; owners, editors and authors only.
-- ---------------------------------------------------------------------------
select test_as('a2000000-0000-0000-0000-000000000003');
do $$ begin
  begin
    perform public.author_mail_recipients('a2000000-0000-0000-0000-0000000000c1');
    raise exception 'an author listed contacts';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select test_as('a2000000-0000-0000-0000-000000000001', array['editor']);
do $$ declare n int; begin
  select count(*) into n from public.author_mail_recipients('a2000000-0000-0000-0000-0000000000c1');
  if n <> 2 then raise exception 'expected owner and author, saw %', n; end if;
  if exists (select 1 from public.author_mail_recipients('a2000000-0000-0000-0000-0000000000c1') where email = 'finance20@test') then
    raise exception 'finance member listed'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. Staff JSON editor: a new version with a new hash, never with errors.
-- ---------------------------------------------------------------------------
select test_as('a2000000-0000-0000-0000-000000000003');
do $$ begin
  begin
    perform public.staff_save_version('a2000000-0000-0000-0000-0000000000c1', 'a2000000-0000-0000-0000-0000000000d1',
      '{"code": "AK-T20A0"}'::jsonb, repeat('f', 64), 0, 0);
    raise exception 'an author saved a version';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.workbook_versions (workbook_id, semver, content, content_hash)
    values ('a2000000-0000-0000-0000-0000000000c1', '9.9.9', '{}'::jsonb, repeat('f', 64));
    raise exception 'an author inserted a version directly';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select test_as('a2000000-0000-0000-0000-000000000001', array['editor']);
do $$ declare r record; begin
  begin
    perform public.staff_save_version('a2000000-0000-0000-0000-0000000000c1', 'a2000000-0000-0000-0000-0000000000d1',
      '{"code": "AK-T20A0", "title": "x"}'::jsonb, repeat('f', 64), 1, 0);
    raise exception 'a version with errors was saved';
  exception when check_violation then null; end;
  begin
    perform public.staff_save_version('a2000000-0000-0000-0000-0000000000c1', 'a2000000-0000-0000-0000-0000000000d1',
      '{"code": "AK-T20B0"}'::jsonb, repeat('f', 64), 0, 0);
    raise exception 'a version naming another code was saved';
  exception when check_violation then null; end;
  begin
    perform public.staff_save_version('a2000000-0000-0000-0000-0000000000c1', 'a2000000-0000-0000-0000-0000000000d1',
      '{"code": "AK-T20A0"}'::jsonb, repeat('a', 64), 0, 0);
    raise exception 'an unchanged version was saved';
  exception when check_violation then null; end;
  begin
    perform public.staff_save_version('a2000000-0000-0000-0000-0000000000c1', null,
      '{"code": "AK-T20A0"}'::jsonb, repeat('f', 64), 0, 0);
    raise exception 'a first version was started where versions exist';
  exception when invalid_parameter_value then null; end;
  select * into r from public.staff_save_version('a2000000-0000-0000-0000-0000000000c1', 'a2000000-0000-0000-0000-0000000000d1',
    '{"schema_version": "3.0", "code": "AK-T20A0", "title": "Workbook 20A, edited"}'::jsonb, repeat('f', 64), 0, 2);
  if r.semver <> '1.0.1' then raise exception 'expected 1.0.1, got %', r.semver; end if;
  -- The author sign-off on the old hash does not carry to the new version.
  if exists (select 1 from public.release_requirements(r.version_id) where requirement = 'author_or_publisher' and met) then
    raise exception 'the old sign-off counted for new content'; end if;
  if not exists (select 1 from public.release_requirements(r.version_id) where requirement = 'validator' and met) then
    raise exception 'the saved version should pass the validator requirement'; end if;
  -- The first version of a workbook with none moves it from draft into review.
  select * into r from public.staff_save_version('a2000000-0000-0000-0000-0000000000c3', null,
    '{"schema_version": "3.0", "code": "AK-T20C0"}'::jsonb, repeat('c', 64), 0, 0);
  if r.semver <> '1.0.0' then raise exception 'first version should be 1.0.0, got %', r.semver; end if;
end $$;
reset role;
do $$ begin
  if (select status from public.workbooks where id = 'a2000000-0000-0000-0000-0000000000c3') <> 'in_review' then
    raise exception 'first version did not move the draft into review'; end if;
  if (select count(*) from public.workbook_versions where workbook_id = 'a2000000-0000-0000-0000-0000000000c1') <> 2 then
    raise exception 'expected two versions of w1'; end if;
  if (select content_hash from public.workbook_versions where id = 'a2000000-0000-0000-0000-0000000000d1') <> repeat('a', 64) then
    raise exception 'the base version changed'; end if;
  if (select count(*) from public.review_validations v join public.workbook_versions x on x.id = v.version_id
      where x.workbook_id = 'a2000000-0000-0000-0000-0000000000c1' and v.ok and v.warning_count = 2) <> 1 then
    raise exception 'validator row missing for the saved version'; end if;
  if (select count(*) from public.audit_log where action = 'workbook.version_saved') <> 2 then
    raise exception 'version save audit rows missing'; end if;
end $$;

rollback;
\echo PASS 0020_author_release
