-- Review and operations (0016): review queue records, the release gate with
-- sign-offs and the two-person override, funnel counts, ops alerts and the
-- support inbox. Each block must raise or return the expected count; a
-- failure aborts the script and the CI step.
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('a1600000-0000-0000-0000-000000000001', 'editor@test'),
  ('a1600000-0000-0000-0000-000000000002', 'owner@test'),
  ('a1600000-0000-0000-0000-000000000003', 'safety@test'),
  ('a1600000-0000-0000-0000-000000000004', 'support@test'),
  ('a1600000-0000-0000-0000-000000000005', 'finance@test'),
  ('a1600000-0000-0000-0000-000000000006', 'reader@test'),
  ('a1600000-0000-0000-0000-000000000007', 'author@test');
insert into public.platform_roles (user_id, role) values
  ('a1600000-0000-0000-0000-000000000001', 'editor'),
  ('a1600000-0000-0000-0000-000000000002', 'owner'),
  ('a1600000-0000-0000-0000-000000000003', 'safety_reviewer'),
  ('a1600000-0000-0000-0000-000000000004', 'support'),
  ('a1600000-0000-0000-0000-000000000005', 'finance');

insert into public.organisations (id, code, kind, legal_name, display_name, slug, country, connect_status) values
  ('a1600000-0000-0000-0000-0000000000a1', 'PB-TST16', 'publisher', 'Org 16 Ltd', 'Org 16', 'org-16', 'GB', 'verified');
insert into public.org_members (org_id, user_id, role) values
  ('a1600000-0000-0000-0000-0000000000a1', 'a1600000-0000-0000-0000-000000000007', 'owner');
-- A public-domain book, so a later licence gate on the book (0013) does not
-- stand in the way of the release tests here.
insert into public.books (id, org_id, slug, title, rights_status) values
  ('a1600000-0000-0000-0000-0000000000b1', 'a1600000-0000-0000-0000-0000000000a1', 'book-16', 'Book 16', 'public_domain');
-- 0015 may already have seeded the shelf and theme.
insert into public.shelves (id, name) values ('faith-and-spirituality', 'Faith and Spirituality') on conflict (id) do nothing;
insert into public.themes (id, name, shelf_id) values ('growing-in-faith', 'Growing in Faith', 'faith-and-spirituality') on conflict (id) do nothing;

-- w1: a standard-tier wellbeing title in review. w2: a faith title. w3: a
-- higher-tier title. w4: a live title, for the kill switch.
insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, theme_id, safety_tier, depth, status) values
  ('a1600000-0000-0000-0000-0000000000c1', 'AK-T16A0', 'a1600000-0000-0000-0000-0000000000b1', 'a1600000-0000-0000-0000-0000000000a1',
   'wb-16a', 'Workbook 16A', 'Card', 'wellbeing', null, 'standard', 'full', 'in_review'),
  ('a1600000-0000-0000-0000-0000000000c2', 'AK-T16B0', 'a1600000-0000-0000-0000-0000000000b1', 'a1600000-0000-0000-0000-0000000000a1',
   'wb-16b', 'Workbook 16B', 'Card', 'personal_development', 'growing-in-faith', 'none', 'full', 'in_review'),
  ('a1600000-0000-0000-0000-0000000000c3', 'AK-T16C0', 'a1600000-0000-0000-0000-0000000000b1', 'a1600000-0000-0000-0000-0000000000a1',
   'wb-16c', 'Workbook 16C', 'Card', 'wellbeing', null, 'higher', 'full', 'in_review'),
  ('a1600000-0000-0000-0000-0000000000c4', 'AK-T16D0', 'a1600000-0000-0000-0000-0000000000b1', 'a1600000-0000-0000-0000-0000000000a1',
   'wb-16d', 'Workbook 16D', 'Card', 'productivity', null, 'none', 'full', 'live');

create temp table doc16 as select $j$
{"schema_version": "3.0", "title": "Workbook 16", "structure": {"unit": "week", "count": 2, "free_units": 1},
 "units": [{"number": 1, "focus": "One", "exercise_ids": []}, {"number": 2, "focus": "Two", "exercise_ids": []}],
 "exercises": [], "toolkit": [], "finish": {"summary": "s", "book_bridge": "b"},
 "safety_hub": {"points": [{"title": "Help", "text": "Reach out"}]}}
$j$::jsonb as content;
grant select on doc16 to authenticated;

insert into public.workbook_versions (id, workbook_id, semver, content, content_hash) values
  ('a1600000-0000-0000-0000-0000000000d1', 'a1600000-0000-0000-0000-0000000000c1', '1.0.0', (select content from doc16), repeat('1', 64)),
  ('a1600000-0000-0000-0000-0000000000d2', 'a1600000-0000-0000-0000-0000000000c2', '1.0.0', (select content from doc16), repeat('2', 64)),
  ('a1600000-0000-0000-0000-0000000000d3', 'a1600000-0000-0000-0000-0000000000c3', '1.0.0', (select content from doc16), repeat('3', 64));

create or replace function pg_temp.as_anon() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "anon"}'::text, true);
  execute 'set local role anon';
end $$;

create or replace function pg_temp.as_service() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "service_role"}'::text, true);
  execute 'set local role service_role';
end $$;

-- ---------------------------------------------------------------------------
-- 1. Review queue: validator results, assignment, notes and send back.
-- ---------------------------------------------------------------------------
select test_as('a1600000-0000-0000-0000-000000000006');
do $$ begin
  begin
    perform public.record_validation('a1600000-0000-0000-0000-0000000000d1', repeat('1', 64), true, 0, 0);
    raise exception 'a reader recorded a validator result';
  exception when insufficient_privilege then null; end;
  if (select count(*) from public.review_validations) <> 0 then raise exception 'a reader read review validations'; end if;
  if (select count(*) from public.review_staff()) <> 0 then raise exception 'a reader listed review staff'; end if;
end $$;
reset role;

select test_as('a1600000-0000-0000-0000-000000000003', array['safety_reviewer']);
do $$ declare wrote boolean; begin
  begin
    perform public.record_validation('a1600000-0000-0000-0000-0000000000d1', repeat('9', 64), true, 0, 0);
    raise exception 'a result was filed against another hash';
  exception when sqlstate 'AKR02' then null; end;
  begin
    perform public.record_validation('a1600000-0000-0000-0000-0000000000d1', repeat('1', 64), true, 2, 0);
    raise exception 'a result with errors passed';
  exception when check_violation then null; end;
  wrote := public.record_validation('a1600000-0000-0000-0000-0000000000d1', repeat('1', 64), false, 3, 1);
  if not wrote then raise exception 'first result not written'; end if;
  wrote := public.record_validation('a1600000-0000-0000-0000-0000000000d1', repeat('1', 64), false, 3, 1);
  if wrote then raise exception 'an unchanged result was written twice'; end if;
  if (select count(*) from public.review_validations) <> 1 then raise exception 'expected one validation row'; end if;
  -- a safety reviewer cannot assign
  begin
    perform public.review_assign('a1600000-0000-0000-0000-0000000000d1', 'a1600000-0000-0000-0000-000000000003');
    raise exception 'a safety reviewer assigned a review';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  if (select validated_at from public.workbook_versions where id = 'a1600000-0000-0000-0000-0000000000d1') is not null then
    raise exception 'a failing result set validated_at'; end if;
end $$;

select test_as('a1600000-0000-0000-0000-000000000001', array['editor']);
do $$ declare e text; n int; s text; begin
  if (select count(*) from public.review_staff()) <> 3 then raise exception 'review_staff should list editor, owner and safety reviewer'; end if;
  begin
    perform public.review_assign('a1600000-0000-0000-0000-0000000000d1', 'a1600000-0000-0000-0000-000000000004');
    raise exception 'support was assigned a review';
  exception when check_violation then null; end;
  e := public.review_assign('a1600000-0000-0000-0000-0000000000d1', 'a1600000-0000-0000-0000-000000000003');
  if e <> 'safety@test' then raise exception 'assign returned %', e; end if;
  e := public.review_assign('a1600000-0000-0000-0000-0000000000d1', 'a1600000-0000-0000-0000-000000000001');
  select count(*) into n from public.review_assignments;
  if n <> 1 then raise exception 'reassign should keep one row, saw %', n; end if;
  perform public.review_add_note('a1600000-0000-0000-0000-0000000000d3', 'Looks close.');
  begin
    perform public.review_add_note('a1600000-0000-0000-0000-0000000000d3', '   ');
    raise exception 'an empty note was saved';
  exception when check_violation then null; end;
  s := public.review_send_back('a1600000-0000-0000-0000-0000000000d3', 'Unit 2 needs a gentler close.');
  if s <> 'draft' then raise exception 'send back should move to draft, got %', s; end if;
end $$;
reset role;
do $$ begin
  if (select status from public.workbooks where id = 'a1600000-0000-0000-0000-0000000000c3') <> 'draft' then raise exception 'w3 not draft'; end if;
  if (select count(*) from public.audit_log where action = 'review.assigned') <> 2 then raise exception 'assign audit missing'; end if;
  if (select count(*) from public.audit_log where action = 'review.sent_back' and reason = 'Unit 2 needs a gentler close.') <> 1 then
    raise exception 'send back audit missing'; end if;
end $$;
update public.workbooks set status = 'in_review' where id = 'a1600000-0000-0000-0000-0000000000c3';

-- The author's organisation sees send-back notes on its own version, not comments.
select test_as('a1600000-0000-0000-0000-000000000007');
do $$ begin
  if (select count(*) from public.review_notes) <> 1 then raise exception 'author should see the one send-back note'; end if;
  if (select count(*) from public.review_notes where kind = 'comment') <> 0 then raise exception 'author read a staff comment'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 2. The gate: no direct move to approved or live from the API.
-- ---------------------------------------------------------------------------
select test_as('a1600000-0000-0000-0000-000000000002', array['owner']);
do $$ begin
  begin
    update public.workbooks set status = 'live' where id = 'a1600000-0000-0000-0000-0000000000c1';
    raise exception 'an owner set live directly';
  exception when insufficient_privilege then null; end;
  begin
    update public.workbooks set status = 'approved' where id = 'a1600000-0000-0000-0000-0000000000c1';
    raise exception 'an owner set approved directly';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.workbooks (code, book_id, org_id, slug, title, genre_id, status)
    values ('AK-T16E0', 'a1600000-0000-0000-0000-0000000000b1', 'a1600000-0000-0000-0000-0000000000a1', 'wb-16e', 'E', 'career', 'live');
    raise exception 'an owner inserted a live workbook';
  exception when insufficient_privilege then null; end;
  begin
    perform public.release_version('a1600000-0000-0000-0000-0000000000d1', true);
    raise exception 'an unsigned version was released';
  exception when sqlstate 'AKR01' then null; end;
end $$;
-- Requirements as the queue sees them: all unmet except the not-required ones.
do $$ declare n int; begin
  select count(*) into n from public.release_requirements('a1600000-0000-0000-0000-0000000000d1') where required and not met;
  if n <> 5 then raise exception 'w1 should have 5 unmet requirements (validator, editor, author, safety, licence), saw %', n; end if;
  select count(*) into n from public.release_requirements('a1600000-0000-0000-0000-0000000000d1') where requirement in ('clinician','theological') and required;
  if n <> 0 then raise exception 'w1 should not need clinician or theological'; end if;
end $$;
reset role;

-- Who may sign what.
select test_as('a1600000-0000-0000-0000-000000000001', array['editor']);
do $$ begin
  begin
    perform public.record_signoff('a1600000-0000-0000-0000-0000000000d1', 'safety', 'Ed Itor');
    raise exception 'an editor gave a safety sign-off';
  exception when insufficient_privilege then null; end;
  perform public.record_signoff('a1600000-0000-0000-0000-0000000000d1', 'editor', 'Ed Itor');
  perform public.record_signoff('a1600000-0000-0000-0000-0000000000d1', 'author', 'Ann Author', null, null, 'Signed by email, 7 October');
  perform public.record_validation('a1600000-0000-0000-0000-0000000000d1', repeat('1', 64), true, 0, 2);
  perform public.set_licence_record('a1600000-0000-0000-0000-0000000000c1', 'LIC-2026-016');
  begin
    perform public.release_version('a1600000-0000-0000-0000-0000000000d1', true);
    raise exception 'released without the safety sign-off';
  exception when sqlstate 'AKR01' then null; end;
end $$;
reset role;

select test_as('a1600000-0000-0000-0000-000000000003', array['safety_reviewer']);
select public.record_signoff('a1600000-0000-0000-0000-0000000000d1', 'safety', 'Sam Safety');
do $$ begin
  begin
    perform public.release_version('a1600000-0000-0000-0000-0000000000d1', true);
    raise exception 'a safety reviewer released a version';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- A sign-off on an old hash does not count once the content changes.
update public.workbook_versions set content_hash = repeat('a', 64) where id = 'a1600000-0000-0000-0000-0000000000d1';
select test_as('a1600000-0000-0000-0000-000000000001', array['editor']);
do $$ declare n int; begin
  select count(*) into n from public.release_requirements('a1600000-0000-0000-0000-0000000000d1') where required and not met;
  if n <> 4 then raise exception 'after a content change 4 requirements should be unmet (licence stays), saw %', n; end if;
end $$;
reset role;
update public.workbook_versions set content_hash = repeat('1', 64) where id = 'a1600000-0000-0000-0000-0000000000d1';

-- Everything met: the editor releases, the version is published and the workbook is live.
select test_as('a1600000-0000-0000-0000-000000000001', array['editor']);
do $$ declare s text; begin
  s := public.release_version('a1600000-0000-0000-0000-0000000000d1', true);
  if s <> 'live' then raise exception 'release returned %', s; end if;
end $$;
reset role;
do $$ begin
  if (select status from public.workbooks where id = 'a1600000-0000-0000-0000-0000000000c1') <> 'live' then raise exception 'w1 not live'; end if;
  if (select current_version_id from public.workbooks where id = 'a1600000-0000-0000-0000-0000000000c1') <> 'a1600000-0000-0000-0000-0000000000d1' then
    raise exception 'w1 current version not set'; end if;
  if (select count(*) from public.workbook_sections where version_id = 'a1600000-0000-0000-0000-0000000000d1') = 0 then raise exception 'no sections published'; end if;
  if (select count(*) from public.audit_log where action = 'release.live') <> 1 then raise exception 'release audit missing'; end if;
  if (select count(*) from public.audit_log where action = 'release.signoff') <> 3 then raise exception 'expected 3 sign-off audit rows'; end if;
end $$;

-- The kill switch still pauses and resumes a live workbook.
select test_as('a1600000-0000-0000-0000-000000000001', array['editor']);
select public.set_workbook_paused('a1600000-0000-0000-0000-0000000000c4', true, 'Check');
select public.set_workbook_paused('a1600000-0000-0000-0000-0000000000c4', false, 'Checked');
reset role;

-- ---------------------------------------------------------------------------
-- 3. Faith titles need a theological sign-off from the right tradition.
-- ---------------------------------------------------------------------------
select test_as('a1600000-0000-0000-0000-000000000002', array['owner']);
do $$ declare n int; begin
  select count(*) into n from public.release_requirements('a1600000-0000-0000-0000-0000000000d2') where requirement = 'theological' and required;
  if n <> 1 then raise exception 'a faith shelf title should need a theological sign-off'; end if;
  select count(*) into n from public.release_requirements('a1600000-0000-0000-0000-0000000000d2') where requirement = 'safety' and required;
  if n <> 0 then raise exception 'a none-tier title should not need a safety sign-off'; end if;
  begin
    perform public.record_signoff('a1600000-0000-0000-0000-0000000000d2', 'theological', 'Rev Reviewer', 'protestant', 'catholic');
    raise exception 'a Protestant reviewer approved a Catholic label';
  exception when check_violation then null; end;
  begin
    perform public.record_signoff('a1600000-0000-0000-0000-0000000000d2', 'theological', 'Rev Reviewer');
    raise exception 'a theological sign-off without a tradition was saved';
  exception when check_violation then null; end;
  perform public.record_signoff('a1600000-0000-0000-0000-0000000000d2', 'theological', 'Rev Reviewer', 'protestant', 'general_christian');
  perform public.record_signoff('a1600000-0000-0000-0000-0000000000d2', 'editor', 'Olive Owner');
  perform public.record_signoff('a1600000-0000-0000-0000-0000000000d2', 'publisher', 'Org 16');
  perform public.record_validation('a1600000-0000-0000-0000-0000000000d2', repeat('2', 64), true, 0, 0);
  perform public.set_licence_record('a1600000-0000-0000-0000-0000000000c2', 'public-domain:/public-domain/AK-T16B0');
  if public.release_version('a1600000-0000-0000-0000-0000000000d2', false) <> 'approved' then raise exception 'faith title not approved'; end if;
end $$;
reset role;
do $$ begin
  if (select status from public.workbooks where id = 'a1600000-0000-0000-0000-0000000000c2') <> 'approved' then raise exception 'w2 not approved'; end if;
  if (select published_at from public.workbook_versions where id = 'a1600000-0000-0000-0000-0000000000d2') is not null then
    raise exception 'approve should not publish'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. The two-person override, on the higher-tier title with no clinician.
-- ---------------------------------------------------------------------------
select test_as('a1600000-0000-0000-0000-000000000001', array['editor']);
create temp table ovr (id uuid);
grant all on ovr to authenticated;
do $$ declare o uuid; n int; begin
  select count(*) into n from public.release_requirements('a1600000-0000-0000-0000-0000000000d3') where requirement = 'clinician' and required and not met;
  if n <> 1 then raise exception 'a higher-tier title should need a clinician'; end if;
  begin
    perform public.request_release_override('a1600000-0000-0000-0000-0000000000d3', '');
    raise exception 'an override without a reason was saved';
  exception when check_violation then null; end;
  o := public.request_release_override('a1600000-0000-0000-0000-0000000000d3', 'Pilot test only, Crent agreed');
  insert into ovr values (o);
  begin
    perform public.approve_release_override(o);
    raise exception 'the requester approved their own override';
  exception when sqlstate 'AKR03' then null; end;
  begin
    perform public.release_version('a1600000-0000-0000-0000-0000000000d3', true, o);
    raise exception 'an unapproved override released';
  exception when sqlstate 'AKR01' then null; end;
end $$;
reset role;

select test_as('a1600000-0000-0000-0000-000000000002', array['owner']);
select public.approve_release_override((select id from ovr));
reset role;

select test_as('a1600000-0000-0000-0000-000000000001', array['editor']);
do $$ begin
  if public.release_version('a1600000-0000-0000-0000-0000000000d3', true, (select id from ovr)) <> 'live' then raise exception 'override release failed'; end if;
end $$;
reset role;
do $$ begin
  if (select used_at from public.release_overrides) is null then raise exception 'override not marked used'; end if;
  if (select count(*) from public.audit_log where action in ('release.override_requested','release.override_approved')) <> 2 then
    raise exception 'override audit rows missing'; end if;
  if (select (after->>'override_id') from public.audit_log where action = 'release.live' and target = 'workbook_version:a1600000-0000-0000-0000-0000000000d3') is null then
    raise exception 'release audit should name the override'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Funnel counts: aggregated, no direct reads or writes, staff summary.
-- ---------------------------------------------------------------------------
select pg_temp.as_anon();
select public.record_funnel_event('page_view', '00000000-0000-0000-0000-00000000000a');
select public.record_funnel_event('page_view', '00000000-0000-0000-0000-00000000000a');
select public.record_funnel_event('sample_view', '00000000-0000-0000-0000-00000000000a', 'a1600000-0000-0000-0000-0000000000c1');
do $$ begin
  begin
    perform public.record_funnel_event('answer_saved', '00000000-0000-0000-0000-00000000000a');
    raise exception 'an unknown event was counted';
  exception when invalid_parameter_value then null; end;
  begin
    perform count(*) from public.funnel_counts;
    raise exception 'anon read funnel counts';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.funnel_counts (day, event, tenant_id, n) values (current_date, 'purchase', '00000000-0000-0000-0000-00000000000a', 999);
    raise exception 'anon wrote a count';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.funnel_counts) <> 2 then raise exception 'expected 2 count rows'; end if;
  if (select n from public.funnel_counts where event = 'page_view') <> 2 then raise exception 'page views not aggregated'; end if;
end $$;

select test_as('a1600000-0000-0000-0000-000000000004', array['support']);
do $$ begin
  begin
    perform * from public.funnel_summary(current_date - 30, current_date);
    raise exception 'support read the funnel summary';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select test_as('a1600000-0000-0000-0000-000000000005', array['finance']);
do $$ declare n bigint; begin
  select sum(s.n) into n from public.funnel_summary(current_date - 30, current_date) s;
  if n <> 3 then raise exception 'finance summary should total 3, saw %', n; end if;
  begin
    perform * from public.funnel_summary(current_date - 500, current_date);
    raise exception 'an over-long range was allowed';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;

insert into public.funnel_counts (day, event, tenant_id, n) values (current_date - 500, 'purchase', '00000000-0000-0000-0000-00000000000a', 4);
select pg_temp.as_service();
do $$ begin
  if public.prune_funnel_counts() <> 1 then raise exception 'prune should remove the old row'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 6. Ops alerts.
-- ---------------------------------------------------------------------------
select test_as('a1600000-0000-0000-0000-000000000001', array['editor']);
do $$ begin
  begin
    perform public.record_ops_event('error', 'api/test', 'x');
    raise exception 'a client recorded an ops event';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select pg_temp.as_service();
create temp table al (id uuid);
do $$ declare r record; i int; begin
  select * into r from public.record_ops_event('webhook_failure', 'api/stripe/webhook', 'handler_failed');
  if r.alert_id is null or not r.notify then raise exception 'a webhook failure should open an alert and notify'; end if;
  insert into al values (r.alert_id);
  select * into r from public.record_ops_event('webhook_failure', 'api/stripe/webhook', 'handler_failed');
  if r.notify then raise exception 'a second failure should not notify again'; end if;
  for i in 1..9 loop
    select * into r from public.record_ops_event('error', 'api/answers', 'sql_failed');
    if r.alert_id is not null then raise exception 'an error alert opened below the threshold at %', i; end if;
  end loop;
  select * into r from public.record_ops_event('error', 'api/answers', 'contains spaces and an email a@b.c');
  if not r.notify then raise exception 'the tenth error should open an alert'; end if;
  begin
    perform public.record_ops_event('error', 'Bad Source!', null);
    raise exception 'a bad source was accepted';
  exception when invalid_parameter_value then null; end;
  perform public.mark_ops_alert_notified((select id from al));
end $$;
reset role;
do $$ begin
  if (select last_code from public.ops_alerts where kind = 'error') <> 'unrecognised' then raise exception 'free text code was stored'; end if;
  if (select count(*) from public.ops_events where code like '%@%') <> 0 then raise exception 'an email reached ops events'; end if;
  if (select notified_at from public.ops_alerts where kind = 'webhook_failure') is null then raise exception 'notified_at not set'; end if;
end $$;
grant select on al to authenticated;

select test_as('a1600000-0000-0000-0000-000000000006');
do $$ begin
  if (select count(*) from public.ops_alerts) <> 0 then raise exception 'a reader read ops alerts'; end if;
end $$;
reset role;
select test_as('a1600000-0000-0000-0000-000000000004', array['support']);
do $$ begin
  if (select count(*) from public.ops_alerts) <> 2 then raise exception 'support should see 2 alerts'; end if;
  if (select event_count from public.ops_alerts where id = (select id from al)) <> 2 then raise exception 'webhook alert should count 2'; end if;
  perform public.acknowledge_ops_alert((select id from al));
end $$;
reset role;
select pg_temp.as_service();
do $$ declare r record; begin
  select * into r from public.record_ops_event('webhook_failure', 'api/stripe/webhook', null);
  if not r.notify or r.alert_id = (select id from al) then raise exception 'a failure after acknowledgement should open a new alert'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 7. Support inbox.
-- ---------------------------------------------------------------------------
select pg_temp.as_anon();
do $$ declare i int; begin
  begin
    perform public.submit_support_message('refund', 'Jo', 'jo@test.example', 'Please refund', false, repeat('e', 64));
    raise exception 'a message without consent was stored';
  exception when sqlstate 'AKH01' then null; end;
  begin
    perform public.submit_support_message('chat', 'Jo', 'jo@test.example', 'Hi', true, repeat('e', 64));
    raise exception 'an unknown topic was stored';
  exception when sqlstate 'AKH02' then null; end;
  begin
    perform public.submit_support_message('access', 'Jo', 'not-an-email', 'Hi', true, repeat('e', 64));
    raise exception 'a bad email was stored';
  exception when sqlstate 'AKH02' then null; end;
  for i in 1..5 loop
    perform public.submit_support_message('access', 'Jo', 'jo@test.example', 'I cannot open my workbook', true, repeat('e', 64));
  end loop;
  begin
    perform public.submit_support_message('access', 'Jo', 'jo@test.example', 'Again', true, repeat('e', 64));
    raise exception 'the sixth message in an hour was stored';
  exception when sqlstate 'AKH29' then null; end;
  begin
    perform count(*) from public.support_messages;
    raise exception 'anon read support messages';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select test_as('a1600000-0000-0000-0000-000000000006');
do $$ begin
  if (select count(*) from public.support_messages) <> 0 then raise exception 'a reader read support messages'; end if;
end $$;
reset role;
select test_as('a1600000-0000-0000-0000-000000000004', array['support']);
do $$ declare n int; begin
  if (select count(*) from public.support_messages) <> 5 then raise exception 'support should see 5 messages'; end if;
  update public.support_messages set status = 'open' where id = (select id from public.support_messages limit 1);
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'support could not change status'; end if;
  begin
    update public.support_messages set message = 'changed';
    raise exception 'support changed a message';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.audit_log where action = 'support.status') <> 1 then raise exception 'support status audit missing'; end if;
end $$;

rollback;
\echo PASS 0016_review_ops
