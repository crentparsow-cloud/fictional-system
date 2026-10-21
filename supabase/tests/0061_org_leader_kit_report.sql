-- Organisations, Phase B (0061): the group leader kit source and the monthly
-- report digest. The kit reads workbook content only and only for a group's
-- leaders and staff. The digest is service role only, hides counts under the
-- threshold, and carries no name, title or person. Each block must raise or
-- return the expected value; a failure aborts the script.
\set ON_ERROR_STOP on

begin;

-- 01 owner, 02 finance, 03 leader, 04 member, 05 outsider, 06 editor,
-- 07 to 13 seat holders (7 of them), 14 viewer.
insert into auth.users (id, email)
select ('a0610000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'u61-' || n || '@test.example' from generate_series(1, 14) n;
insert into public.profiles (user_id, adult_confirmed_at)
select ('a0610000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, now() from generate_series(1, 14) n
on conflict (user_id) do update set adult_confirmed_at = excluded.adult_confirmed_at;
insert into public.platform_roles (user_id, role) values ('a0610000-0000-0000-0000-000000000006', 'editor');

insert into public.organisations (id, kind, legal_name, display_name, slug, country) values
  ('a0610000-0000-0000-0000-0000000000f1', 'publisher', 'Pub 61 Ltd', 'Pub 61', 'pub-61', 'GB'),
  ('a0610000-0000-0000-0000-0000000000f2', 'business', 'Biz 61 Ltd', 'Biz 61', 'biz-61', 'GB'),
  ('a0610000-0000-0000-0000-0000000000f3', 'charity', 'Small 61', 'Small 61', 'small-61', 'GB');
insert into public.org_profiles (org_id) values ('a0610000-0000-0000-0000-0000000000f2'), ('a0610000-0000-0000-0000-0000000000f3');
insert into public.org_members (org_id, user_id, role) values
  ('a0610000-0000-0000-0000-0000000000f2', 'a0610000-0000-0000-0000-000000000001', 'owner'),
  ('a0610000-0000-0000-0000-0000000000f2', 'a0610000-0000-0000-0000-000000000002', 'finance'),
  ('a0610000-0000-0000-0000-0000000000f2', 'a0610000-0000-0000-0000-000000000014', 'viewer'),
  ('a0610000-0000-0000-0000-0000000000f3', 'a0610000-0000-0000-0000-000000000001', 'owner');
insert into public.books (id, org_id, slug, title) values
  ('a0610000-0000-0000-0000-0000000000b1', 'a0610000-0000-0000-0000-0000000000f1', 'book-61', 'Book 61');
insert into public.workbooks (id, code, book_id, org_id, tenant_id, slug, title, card_line, genre_id, depth, badge, is_demo, status, safety_tier, in_membership) values
  ('a0610000-0000-0000-0000-0000000000c1', 'AK-PTV61', 'a0610000-0000-0000-0000-0000000000b1', 'a0610000-0000-0000-0000-0000000000f1',
   '00000000-0000-0000-0000-00000000000a', 'wb61-one', 'Wb61 One', 'Card', 'productivity', 'full', 'official', false, 'live', 'none', true);
insert into public.workbook_versions (id, workbook_id, semver, content, content_hash, published_at) values
  ('a0610000-0000-0000-0000-0000000000d1', 'a0610000-0000-0000-0000-0000000000c1', '1.0.0', '{"schema_version": "3.0"}'::jsonb, repeat('a', 64), now());
update public.workbooks set current_version_id = 'a0610000-0000-0000-0000-0000000000d1' where id = 'a0610000-0000-0000-0000-0000000000c1';
insert into public.workbook_sections (version_id, kind, unit_number, body, free) values
  ('a0610000-0000-0000-0000-0000000000d1', 'start', null, '{"welcome": "Welcome text", "how_it_works": ["One", "Two"]}'::jsonb, true),
  ('a0610000-0000-0000-0000-0000000000d1', 'unit', 1, '{"number": 1, "focus": "Unit one focus"}'::jsonb, true),
  ('a0610000-0000-0000-0000-0000000000d1', 'unit', 2, '{"number": 2, "focus": "Unit two focus"}'::jsonb, false);

insert into public.org_licences (id, org_id, kind, title_scope, seats_purchased, starts_at, ends_at) values
  ('a0610000-0000-0000-0000-0000000000e2', 'a0610000-0000-0000-0000-0000000000f2', 'teams', 'membership', 20, now() - interval '70 days', now() + interval '300 days'),
  ('a0610000-0000-0000-0000-0000000000e3', 'a0610000-0000-0000-0000-0000000000f3', 'teams', 'membership', 5, now() - interval '70 days', now() + interval '300 days');

-- Seat holders 03 to 13 on the business licence (11), 04 alone on the small one.
do $$ declare n int; v_ent uuid; begin
  for n in 3..13 loop
    insert into public.entitlements (user_id, tenant_id, workbook_id, source, status, starts_at, ends_at, org_licence_id)
    values (('a0610000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-00000000000a', null, 'team_seat', 'active',
            now() - interval '70 days', now() + interval '300 days', 'a0610000-0000-0000-0000-0000000000e2') returning id into v_ent;
    insert into public.org_seats (licence_id, org_id, user_id, entitlement_id, claimed_at)
    values ('a0610000-0000-0000-0000-0000000000e2', 'a0610000-0000-0000-0000-0000000000f2',
            ('a0610000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, v_ent, now() - interval '60 days');
  end loop;
  insert into public.entitlements (user_id, tenant_id, workbook_id, source, status, starts_at, ends_at, org_licence_id)
  values ('a0610000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000a', null, 'team_seat', 'active',
          now() - interval '70 days', now() + interval '300 days', 'a0610000-0000-0000-0000-0000000000e3') returning id into v_ent;
  insert into public.org_seats (licence_id, org_id, user_id, entitlement_id, claimed_at)
  values ('a0610000-0000-0000-0000-0000000000e3', 'a0610000-0000-0000-0000-0000000000f3', 'a0610000-0000-0000-0000-000000000004', v_ent, now() - interval '60 days');
end $$;

-- A group on the business licence: 03 leads; 04 to 08 are members (6 in all).
insert into public.org_groups (id, org_id, licence_id, tenant_id, name, workbook_id, version_id, status, count_default, faith, created_at) values
  ('a0610000-0000-0000-0000-0000000000a1', 'a0610000-0000-0000-0000-0000000000f2', 'a0610000-0000-0000-0000-0000000000e2',
   '00000000-0000-0000-0000-00000000000a', 'Group 61', 'a0610000-0000-0000-0000-0000000000c1', 'a0610000-0000-0000-0000-0000000000d1', 'running', false, false, now() - interval '60 days');
insert into public.org_group_members (group_id, user_id, role, accepted_at)
select 'a0610000-0000-0000-0000-0000000000a1', ('a0610000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       case when n = 3 then 'leader' else 'member' end, now() - interval '50 days'
from generate_series(3, 8) n;

-- Some members started the workbook last month and one wrote an answer.
insert into public.enrolments (id, user_id, tenant_id, workbook_id, version_id, started_at)
select gen_random_uuid(), ('a0610000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-00000000000a',
       'a0610000-0000-0000-0000-0000000000c1', 'a0610000-0000-0000-0000-0000000000d1',
       (date_trunc('month', now()) - interval '10 days')
from generate_series(3, 9) n;

create or replace function pg_temp.as_service() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "service_role"}'::text, true);
  execute 'set local role service_role';
end $$;

-- ---------------------------------------------------------------------------
-- 1. The kit source: leaders and staff only, content only.
-- ---------------------------------------------------------------------------
select test_as('a0610000-0000-0000-0000-000000000003');
do $$ declare j jsonb; begin
  j := public.org_group_kit_source('a0610000-0000-0000-0000-0000000000a1');
  if j ->> 'workbook_title' <> 'Wb61 One' or jsonb_array_length(j -> 'units') <> 2 or j -> 'start' ->> 'welcome' <> 'Welcome text' then
    raise exception 'kit source was %', j;
  end if;
  if (j -> 'units' -> 0 ->> 'number')::int <> 1 or (j -> 'units' -> 1 ->> 'number')::int <> 2 then raise exception 'units out of order'; end if;
  if j::text ~* 'answer|sealed|email' then raise exception 'the kit source carries more than content'; end if;
end $$;
reset role;
select test_as('a0610000-0000-0000-0000-000000000004');
do $$ begin
  perform public.org_group_kit_source('a0610000-0000-0000-0000-0000000000a1');
  raise exception 'a member read the leader kit source';
exception when sqlstate 'AKG01' then null; end $$;
reset role;
select test_as('a0610000-0000-0000-0000-000000000001');
do $$ begin
  perform public.org_group_kit_source('a0610000-0000-0000-0000-0000000000a1');
  raise exception 'the organisation owner read the leader kit source without leading';
exception when sqlstate 'AKG01' then null; end $$;
reset role;
select test_as('a0610000-0000-0000-0000-000000000006', array['editor']);
do $$ begin
  if public.org_group_kit_source('a0610000-0000-0000-0000-0000000000a1') is null then raise exception 'staff could not read the kit source'; end if;
end $$;
reset role;
select pg_temp.as_service();
do $$ begin
  perform public.org_group_kit_source('a0610000-0000-0000-0000-0000000000a1');
  raise exception 'the service role read a kit with no user';
exception when insufficient_privilege then null; end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 2. The digest: service role only, counts under the threshold hidden.
-- ---------------------------------------------------------------------------
select test_as('a0610000-0000-0000-0000-000000000001');
do $$ begin
  perform * from public.org_report_digest((date_trunc('month', now()) - interval '1 month')::date);
  raise exception 'a client read the digest';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform * from public.org_report_recipients('a0610000-0000-0000-0000-0000000000f2');
  raise exception 'a client read the recipients';
exception when insufficient_privilege then null; end $$;
reset role;

select pg_temp.as_service();
do $$ declare r record; m date := (date_trunc('month', now() at time zone 'Europe/London') - interval '1 month')::date; n int; begin
  begin perform * from public.org_report_digest(date_trunc('month', now())::date);
    raise exception 'an unfinished month was reported'; exception when sqlstate 'AKO02' then null; end;
  begin perform * from public.org_report_digest((m + 3));
    raise exception 'a mid-month date was accepted'; exception when sqlstate 'AKO02' then null; end;
  select * into r from public.org_report_digest(m) where org_id = 'a0610000-0000-0000-0000-0000000000f2';
  if r.seats_taken <> 11 then raise exception 'seats taken %', r.seats_taken; end if;
  if r.people_started is distinct from 7 or r.started_shown <> 'exact' then raise exception 'people started % %', r.people_started, r.started_shown; end if;
  if r.groups_meeting <> 1 then raise exception 'groups meeting %', r.groups_meeting; end if;
  if r.organisation_name <> 'Biz 61' then raise exception 'organisation name'; end if;
  -- The small organisation has one seat holder: shown as fewer than the threshold.
  select * into r from public.org_report_digest(m) where org_id = 'a0610000-0000-0000-0000-0000000000f3';
  if r.seats_taken <> 1 or r.people_started is not null or r.started_shown <> 'fewer_than' or r.groups_meeting <> 0 then
    raise exception 'small organisation row: %', row_to_json(r);
  end if;
  -- The publisher is not a customer organisation.
  select count(*) into n from public.org_report_digest(m) where org_id = 'a0610000-0000-0000-0000-0000000000f1';
  if n <> 0 then raise exception 'a publisher appears in the digest'; end if;
end $$;

-- Recipients: owner and finance, never the viewer or a seat holder.
do $$ declare v text; begin
  select string_agg(role || ':' || email, ',' order by role) into v from public.org_report_recipients('a0610000-0000-0000-0000-0000000000f2');
  if v <> 'finance:u61-2@test.example,owner:u61-1@test.example' then raise exception 'recipients were %', v; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. The owner can switch the email off; others cannot.
-- ---------------------------------------------------------------------------
select test_as('a0610000-0000-0000-0000-000000000002');
do $$ begin
  perform public.org_report_pref_set('a0610000-0000-0000-0000-0000000000f2', false);
  raise exception 'finance switched the report off';
exception when sqlstate 'AKO01' then null; end $$;
reset role;
select test_as('a0610000-0000-0000-0000-000000000001');
do $$ begin
  if public.org_report_pref_set('a0610000-0000-0000-0000-0000000000f2', false) is not false then raise exception 'preference not saved'; end if;
end $$;
reset role;
select pg_temp.as_service();
do $$ declare m date := (date_trunc('month', now() at time zone 'Europe/London') - interval '1 month')::date; begin
  if exists (select 1 from public.org_report_digest(m) where org_id = 'a0610000-0000-0000-0000-0000000000f2') then
    raise exception 'an organisation that switched the report off is still in the digest';
  end if;
  if exists (select 1 from public.org_report_recipients('a0610000-0000-0000-0000-0000000000f2')) then
    raise exception 'recipients still listed after switching off';
  end if;
end $$;
reset role;

rollback;
