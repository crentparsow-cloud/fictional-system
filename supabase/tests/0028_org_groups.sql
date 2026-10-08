-- Akana Business phase 2: groups, leaders, schedule, facilitator guides,
-- fixed-choice check-ins, monthly reports, faith consent for church groups
-- and report a concern (F-210 to F-216). The privacy rules are tested from
-- every side: leaders and owners never read a member list, a check-in, an
-- answer or a progress event; counts under the threshold never come back.
-- Each block must raise or return the expected value; a failure aborts.
\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
-- 001 business owner, 002 church owner, 003 leader L, 004 co-leader C,
-- 005 to 012 members M1 to M8, 013 outsider X (no seat), 014 platform
-- editor, 015 platform support, 016 church member F, 017 business viewer,
-- 018 seat holder not yet 18+ confirmed.
insert into auth.users (id, email)
select ('a0280000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'u28-' || n || '@test.example'
from generate_series(1, 18) n;
insert into public.profiles (user_id, display_name, adult_confirmed_at)
select ('a0280000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'Person ' || n, case when n = 18 then null else now() end
from generate_series(1, 18) n
on conflict (user_id) do update set adult_confirmed_at = excluded.adult_confirmed_at, display_name = excluded.display_name;

-- A publisher with three titles: p1 in the membership (three units), p2 a
-- faith title in the membership, p3 outside the membership.
insert into public.organisations (id, kind, legal_name, display_name, slug, country) values
  ('a0280000-0000-0000-0000-0000000000f1', 'publisher', 'Pub 28 Ltd', 'Pub 28', 'pub-28', 'GB');
insert into public.books (id, org_id, slug, title) values
  ('a0280000-0000-0000-0000-0000000000b1', 'a0280000-0000-0000-0000-0000000000f1', 'book-28', 'Book 28');
insert into public.workbooks (id, code, book_id, org_id, tenant_id, slug, title, card_line, genre_id, theme_id, depth, badge, is_demo, status, safety_tier, in_membership) values
  ('a0280000-0000-0000-0000-0000000000c1', 'AK-PTW81', 'a0280000-0000-0000-0000-0000000000b1', 'a0280000-0000-0000-0000-0000000000f1',
   '00000000-0000-0000-0000-00000000000a', 'wb28-one', 'Wb28 One', 'Card', 'productivity', null, 'full', 'official', false, 'live', 'none', true),
  ('a0280000-0000-0000-0000-0000000000c2', 'AK-PTW82', 'a0280000-0000-0000-0000-0000000000b1', 'a0280000-0000-0000-0000-0000000000f1',
   '00000000-0000-0000-0000-00000000000a', 'wb28-two', 'Wb28 Two', 'Card', 'personal_development', 'growing-in-faith', 'full', 'official', false, 'live', 'none', true),
  ('a0280000-0000-0000-0000-0000000000c3', 'AK-PTW83', 'a0280000-0000-0000-0000-0000000000b1', 'a0280000-0000-0000-0000-0000000000f1',
   '00000000-0000-0000-0000-00000000000a', 'wb28-three', 'Wb28 Three', 'Card', 'productivity', null, 'full', 'official', false, 'live', 'none', false);
insert into public.workbook_versions (id, workbook_id, semver, content, content_hash, published_at) values
  ('a0280000-0000-0000-0000-0000000000d1', 'a0280000-0000-0000-0000-0000000000c1', '1.0.0', '{"schema_version": "3.0"}'::jsonb, repeat('a', 64), now()),
  ('a0280000-0000-0000-0000-0000000000d2', 'a0280000-0000-0000-0000-0000000000c2', '1.0.0',
   '{"schema_version": "3.0", "units": [{"number": 1}, {"number": 2}]}'::jsonb, repeat('b', 64), now()),
  ('a0280000-0000-0000-0000-0000000000d3', 'a0280000-0000-0000-0000-0000000000c3', '1.0.0', '{"schema_version": "3.0"}'::jsonb, repeat('c', 64), now());
update public.workbooks set current_version_id = 'a0280000-0000-0000-0000-0000000000d1' where id = 'a0280000-0000-0000-0000-0000000000c1';
update public.workbooks set current_version_id = 'a0280000-0000-0000-0000-0000000000d2' where id = 'a0280000-0000-0000-0000-0000000000c2';
update public.workbooks set current_version_id = 'a0280000-0000-0000-0000-0000000000d3' where id = 'a0280000-0000-0000-0000-0000000000c3';
insert into public.workbook_sections (version_id, kind, unit_number, body, free) values
  ('a0280000-0000-0000-0000-0000000000d1', 'unit', 1, '{"number": 1}'::jsonb, true),
  ('a0280000-0000-0000-0000-0000000000d1', 'unit', 2, '{"number": 2}'::jsonb, false),
  ('a0280000-0000-0000-0000-0000000000d1', 'unit', 3, '{"number": 3}'::jsonb, false);

-- Ids made during the test, readable by every role inside this transaction.
create table public.t28_ids (k text primary key, v uuid not null);
grant select, insert on public.t28_ids to anon, authenticated, service_role;
create function public.t28(p text) returns uuid language sql stable as $$ select v from public.t28_ids where k = p $$;
grant execute on function public.t28(text) to anon, authenticated, service_role;
create function public.u28(n int) returns uuid language sql immutable as $$
  select ('a0280000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid $$;
grant execute on function public.u28(int) to anon, authenticated, service_role;

-- Two customer organisations and a licence each, made by staff.
select test_as(public.u28(14), array['editor']);
do $$ declare v uuid; begin
  v := public.create_customer_organisation('business', 'Biz 28', 'Biz 28 Ltd', 'GB', 'biz-28');
  insert into public.t28_ids values ('biz', v);
  v := public.create_customer_organisation('church', 'St Twenty Eight', 'St 28 PCC', 'GB', 'st-28');
  insert into public.t28_ids values ('church', v);
  v := public.org_licence_create(public.t28('biz'), 'teams', 'membership', 30, now() - interval '70 days', now() + interval '300 days');
  insert into public.t28_ids values ('biz_lic', v);
  v := public.org_licence_create(public.t28('church'), 'church', 'membership', 30, now() - interval '70 days', now() + interval '300 days');
  insert into public.t28_ids values ('church_lic', v);
end $$;
reset role;

insert into public.org_members (org_id, user_id, role) values
  (public.t28('biz'), public.u28(1), 'owner'),
  (public.t28('biz'), public.u28(17), 'viewer'),
  (public.t28('church'), public.u28(2), 'owner');

-- Seats, as a claim would leave them: L, C, M1 to M8 and 018 on the
-- business licence; F and L on the church licence.
do $$ declare n int; v_ent uuid; v_lic uuid; v_seat uuid; begin
  for n in select unnest(array[3,4,5,6,7,8,9,10,11,12,18]) loop
    v_lic := public.t28('biz_lic');
    insert into public.entitlements (user_id, tenant_id, workbook_id, source, status, starts_at, ends_at, org_licence_id)
    values (public.u28(n), '00000000-0000-0000-0000-00000000000a', null, 'team_seat', 'active', now() - interval '70 days', now() + interval '300 days', v_lic)
    returning id into v_ent;
    insert into public.org_seats (licence_id, org_id, user_id, entitlement_id, roster_email)
    values (v_lic, public.t28('biz'), public.u28(n), v_ent, 'u28-' || n || '@test.example') returning id into v_seat;
    insert into public.t28_ids values ('seat' || n, v_seat);
  end loop;
  for n in select unnest(array[16, 3]) loop
    v_lic := public.t28('church_lic');
    insert into public.entitlements (user_id, tenant_id, workbook_id, source, status, starts_at, ends_at, org_licence_id)
    values (public.u28(n), '00000000-0000-0000-0000-00000000000a', null, 'team_seat', 'active', now() - interval '70 days', now() + interval '300 days', v_lic)
    returning id into v_ent;
    insert into public.org_seats (licence_id, org_id, user_id, entitlement_id, roster_email)
    values (v_lic, public.t28('church'), public.u28(n), v_ent, 'u28-' || n || '@test.example') returning id into v_seat;
    insert into public.t28_ids values ('cseat' || n, v_seat);
  end loop;
end $$;

-- M1's own work, which nobody else may reach.
insert into public.enrolments (id, user_id, tenant_id, workbook_id, version_id, started_at) values
  ('a0280000-0000-0000-0000-0000000000a1', public.u28(5), '00000000-0000-0000-0000-00000000000a',
   'a0280000-0000-0000-0000-0000000000c1', 'a0280000-0000-0000-0000-0000000000d1', now() - interval '40 days');
insert into public.answers (enrolment_id, field, sealed, key_id) values
  ('a0280000-0000-0000-0000-0000000000a1', 'exercise:ex_one.f_one', 'v2.k1.AAAA', 'k1');
insert into public.progress_events (enrolment_id, kind, ref) values
  ('a0280000-0000-0000-0000-0000000000a1', 'step_done', 'ex_one');

-- ---------------------------------------------------------------------------
-- 1. Groups (F-210): the owner creates them, on a title in scope only.
-- ---------------------------------------------------------------------------
select test_as(public.u28(1));
do $$ declare v uuid; begin
  v := public.org_group_create(public.t28('biz_lic'), '  Tuesday   lunch group ', 'a0280000-0000-0000-0000-0000000000c1', null, 2, '12:30');
  insert into public.t28_ids values ('g', v);
  if (select name from public.org_groups where id = v) <> 'Tuesday lunch group' then
    raise exception 'the group name was not tidied';
  end if;
  if (select count_default or faith from public.org_groups where id = v) then
    raise exception 'a business group counted check-ins by default, or asked for faith consent';
  end if;
  if (select version_id from public.org_groups where id = v) <> 'a0280000-0000-0000-0000-0000000000d1' then
    raise exception 'the group did not pin the current version';
  end if;
  if exists (select 1 from public.org_licence_group_titles(public.t28('biz_lic')) where workbook_id = 'a0280000-0000-0000-0000-0000000000c3')
     or not exists (select 1 from public.org_licence_group_titles(public.t28('biz_lic')) where workbook_id = 'a0280000-0000-0000-0000-0000000000c2' and faith) then
    raise exception 'the title list for groups was wrong';
  end if;
  begin
    perform public.org_group_create(public.t28('biz_lic'), 'Out of scope', 'a0280000-0000-0000-0000-0000000000c3');
    raise exception 'a title outside the licence made a group';
  exception when sqlstate 'AKG02' then null; end;
  begin
    perform public.org_group_create(public.t28('biz_lic'), 'See www.example.com', 'a0280000-0000-0000-0000-0000000000c1');
    raise exception 'a link in a group name was accepted';
  exception when sqlstate 'AKG02' then null; end;
  begin
    perform public.org_group_create(public.t28('church_lic'), 'Not mine', 'a0280000-0000-0000-0000-0000000000c1');
    raise exception 'an owner made a group on another organisation''s licence';
  exception when sqlstate 'AKG01' then null; end;
end $$;
reset role;

-- A seat holder, a viewer and an outsider cannot create groups.
select test_as(public.u28(5));
do $$ begin
  perform public.org_group_create(public.t28('biz_lic'), 'Mine', 'a0280000-0000-0000-0000-0000000000c1');
  raise exception 'a member made a group';
exception when sqlstate 'AKG01' then null; end $$;
reset role;
select test_as(public.u28(17));
do $$ begin
  perform public.org_group_create(public.t28('biz_lic'), 'Mine', 'a0280000-0000-0000-0000-0000000000c1');
  raise exception 'a viewer made a group';
exception when sqlstate 'AKG01' then null; end $$;
reset role;

-- The church group on a faith title asks for faith consent and counts check-ins by default.
select test_as(public.u28(2));
do $$ declare v uuid; begin
  v := public.org_group_create(public.t28('church_lic'), 'Thursday house group', 'a0280000-0000-0000-0000-0000000000c2');
  insert into public.t28_ids values ('cg', v);
  if not (select faith and count_default from public.org_groups where id = v) then
    raise exception 'a church group did not ask for faith consent';
  end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 2. Leaders: appointed by the owner from the seat holders, accepted by them.
-- ---------------------------------------------------------------------------
select test_as(public.u28(1));
do $$ begin
  perform public.org_group_appoint(public.t28('g'), public.t28('seat3'), 'leader');
  perform public.org_group_appoint(public.t28('g'), public.t28('seat4'), 'co_leader');
  begin
    perform public.org_group_appoint(public.t28('g'), public.t28('cseat16'), 'leader');
    raise exception 'a seat on another licence was appointed';
  exception when sqlstate 'AKG02' then null; end;
  begin
    perform public.org_group_appoint(public.t28('g'), public.t28('seat5'), 'boss');
    raise exception 'an unknown role was accepted';
  exception when sqlstate 'AKG02' then null; end;
  if (select leader_state || '/' || co_leader_state from public.org_group_list(public.t28('biz')) where group_id = public.t28('g')) <> 'offered/offered' then
    raise exception 'the owner did not see two waiting appointments';
  end if;
end $$;
reset role;

-- Before accepting, the appointment gives nothing.
select test_as(public.u28(3));
do $$ begin
  if not exists (select 1 from public.my_org_groups() where group_id = public.t28('g') and offered_role = 'leader' and role = 'member' and not accepted) then
    raise exception 'the leader did not see the appointment waiting';
  end if;
  begin
    perform * from public.org_group_leader_view(public.t28('g'));
    raise exception 'an unaccepted leader read the leader view';
  exception when sqlstate 'AKG01' then null; end;
  if public.org_group_join(public.t28('g')) <> 'accepted' then
    raise exception 'the leader could not accept';
  end if;
  if (select members from public.org_group_leader_view(public.t28('g'))) <> 1 then
    raise exception 'the leader view did not count the leader';
  end if;
end $$;
reset role;
select test_as(public.u28(4));
do $$ begin
  if public.org_group_join(public.t28('g')) <> 'accepted' then raise exception 'the co-leader could not accept'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. Members join from their seat. Adults only; a seat is needed.
-- ---------------------------------------------------------------------------
select test_as(public.u28(5));
do $$ begin
  if not exists (select 1 from public.my_joinable_org_groups() where group_id = public.t28('g')) then
    raise exception 'a seat holder did not see the group to join';
  end if;
  if exists (select 1 from public.my_joinable_org_groups() where group_id = public.t28('cg')) then
    raise exception 'a seat holder saw another organisation''s group';
  end if;
  if public.org_group_join(public.t28('g')) <> 'joined' then raise exception 'M1 could not join'; end if;
  if public.org_group_join(public.t28('g')) <> 'already' then raise exception 'a second join was not idempotent'; end if;
  begin
    perform public.org_group_join(public.t28('cg'));
    raise exception 'a member joined a group on a licence they have no seat on';
  exception when sqlstate 'AKG04' then null; end;
end $$;
reset role;
select test_as(public.u28(13));
do $$ begin
  perform public.org_group_join(public.t28('g'));
  raise exception 'someone with no seat joined';
exception when sqlstate 'AKG04' then null; end $$;
reset role;
select test_as(public.u28(18));
do $$ begin
  perform public.org_group_join(public.t28('g'));
  raise exception 'someone without the 18 or over confirmation joined';
exception when sqlstate 'AKG10' then null; end $$;
reset role;
do $$ declare n int; begin
  for n in 6 .. 12 loop
    perform test_as(public.u28(n));
    perform public.org_group_join(public.t28('g'));
    execute 'reset role';
  end loop;
end $$;

-- Faith consent (F-215): the church group asks for it first.
select test_as(public.u28(16));
do $$ begin
  begin
    perform public.org_group_join(public.t28('cg'));
    raise exception 'a church group member joined without faith consent';
  exception when sqlstate 'AKG03' then null; end;
  perform public.set_faith_consent('faith-2026-10');
  if public.org_group_join(public.t28('cg')) <> 'joined' then raise exception 'F could not join after consent'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. Nobody reads a member list. Your own row only.
-- ---------------------------------------------------------------------------
select test_as(public.u28(3));
do $$ begin
  if (select count(*) from public.org_group_members where group_id = public.t28('g')) <> 1 then
    raise exception 'a leader read other members'' rows';
  end if;
end $$;
reset role;
select test_as(public.u28(1));
do $$ begin
  if (select count(*) from public.org_group_members) <> 0 then raise exception 'an owner read group member rows'; end if;
  if (select members_shown from public.org_group_list(public.t28('biz')) where group_id = public.t28('g')) <> 'exact' then
    raise exception 'ten members were not shown to the owner';
  end if;
end $$;
reset role;
select test_as(public.u28(2));
do $$ begin
  if (select members from public.org_group_list(public.t28('church')) where group_id = public.t28('cg')) is not null then
    raise exception 'a group of one was shown as a number to the owner';
  end if;
  begin
    perform * from public.org_group_list(public.t28('biz'));
    raise exception 'an owner listed another organisation''s groups';
  exception when sqlstate 'AKG01' then null; end;
  if exists (select 1 from public.org_groups where org_id = public.t28('biz')) then
    raise exception 'an owner read another organisation''s groups';
  end if;
end $$;
reset role;
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'org_group_members'
             and column_name in ('email','roster_email','display_name','name')) then
    raise exception 'group members carry contact details';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'org_group_checkins'
             and data_type in ('text','character varying','jsonb') and column_name <> 'choice') then
    raise exception 'group check-ins have a free text column';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Schedule and soft pace (F-211).
-- ---------------------------------------------------------------------------
select test_as(public.u28(5));
do $$ begin
  perform public.org_group_schedule_set(public.t28('g'), array[1], array[current_date]);
  raise exception 'a member set the schedule';
exception when sqlstate 'AKG01' then null; end $$;
reset role;
select test_as(public.u28(3));
do $$ declare d date := (now() at time zone 'Europe/London')::date; begin
  begin
    perform public.org_group_schedule_set(public.t28('g'), array[1, 9], array[d, d]);
    raise exception 'a unit outside the workbook was scheduled';
  exception when sqlstate 'AKG02' then null; end;
  begin
    perform public.org_group_schedule_set(public.t28('g'), array[1, 1], array[d, d]);
    raise exception 'a unit was scheduled twice';
  exception when sqlstate 'AKG02' then null; end;
  if public.org_group_units(public.t28('g')) <> array[1, 2, 3] then
    raise exception 'the leader did not get the unit numbers';
  end if;
  if public.org_group_schedule_set(public.t28('g'), array[1, 2, 3], array[d - 14, d - 7, d + 7]) <> 3 then
    raise exception 'the leader could not set the schedule';
  end if;
end $$;
reset role;
select test_as(public.u28(1));
do $$ begin
  if public.org_group_update(public.t28('g'), 'Tuesday lunch group', null, 2, '12:30', 'running') <> 'running' then
    raise exception 'the owner could not start the group';
  end if;
  begin
    perform public.org_group_update(public.t28('g'), 'Tuesday lunch group', null, 2, '12:30', 'draft');
    raise exception 'a running group went back to draft';
  exception when sqlstate 'AKG08' then null; end;
end $$;
reset role;
select test_as(public.u28(5));
do $$ begin
  if (select current_unit::text || '/' || current_week::text from public.my_org_groups() where group_id = public.t28('g')) <> '2/2' then
    raise exception 'the member did not see the group on week 2';
  end if;
end $$;
reset role;
-- Nothing is locked: the seat still opens unit 3, which the group has not reached.
do $$ begin
  if not app.has_entitlement(public.u28(5), '00000000-0000-0000-0000-00000000000a', 'a0280000-0000-0000-0000-0000000000c1', 3) then
    raise exception 'a group schedule locked a unit';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Check-ins (F-213): fixed choices, your own only, counts for leaders.
-- ---------------------------------------------------------------------------
select test_as(public.u28(5));
do $$ begin
  begin
    perform public.org_group_checkin(public.t28('g'), 2, 'I feel awful about work');
    raise exception 'a free text check-in was accepted';
  exception when sqlstate 'AKG02' then null; end;
  begin
    perform public.org_group_checkin(public.t28('g'), 3, 'doing_fine');
    raise exception 'a check-in for a unit not yet open was accepted';
  exception when sqlstate 'AKG02' then null; end;
  perform public.org_group_checkin(public.t28('g'), 2, 'found_it_hard');
  perform public.org_group_checkin(public.t28('g'), 2, 'doing_fine');
  if (select count(*) from public.org_group_checkins) <> 1 or (select choice from public.org_group_checkins) <> 'doing_fine' then
    raise exception 'the last check-in did not win';
  end if;
  if (select counted from public.org_group_checkins) then
    raise exception 'a business group check-in counted without the member choosing it';
  end if;
end $$;
reset role;
select test_as(public.u28(13));
do $$ begin
  perform public.org_group_checkin(public.t28('g'), 2, 'doing_fine');
  raise exception 'an outsider checked in';
exception when sqlstate 'AKG01' then null; end $$;
reset role;

-- Seven more members check in; five of them choose to count.
do $$ declare n int; begin
  for n in 6 .. 12 loop
    perform test_as(public.u28(n));
    perform public.org_group_checkin(public.t28('g'), 2, case when n = 12 then 'found_it_hard' else 'doing_fine' end);
    if n <= 9 then perform public.org_group_set_counting(public.t28('g'), true); end if;
    execute 'reset role';
  end loop;
end $$;

-- Fewer than five counted (four, and only from today): nothing shows.
select test_as(public.u28(3));
do $$ begin
  if exists (select 1 from public.org_group_checkin_counts(public.t28('g'), 2) where shown <> 'hidden' or n is not null) then
    raise exception 'check-in counts showed with fewer than five counted';
  end if;
  if (select count(*) from public.org_group_checkins) <> 0 then raise exception 'a leader read members'' check-ins'; end if;
end $$;
reset role;

-- M1 and M8 also count; the check-ins move to yesterday. Five said doing
-- fine, one found it hard: the one is held back, no total is given.
select test_as(public.u28(5));
select public.org_group_set_counting(public.t28('g'), true);
reset role;
select test_as(public.u28(12));
select public.org_group_set_counting(public.t28('g'), true);
reset role;
update public.org_group_checkins set at = now() - interval '1 day' where group_id = public.t28('g');
select test_as(public.u28(4));
do $$ begin
  if (select n from public.org_group_checkin_counts(public.t28('g'), 2) where choice = 'doing_fine') <> 5 then
    raise exception 'five doing fine were not shown';
  end if;
  if (select n is not null or shown <> 'fewer_than' from public.org_group_checkin_counts(public.t28('g'), 2) where choice = 'found_it_hard') then
    raise exception 'a count of one was shown';
  end if;
end $$;
reset role;
-- Owners, members and staff support without a leader role get no counts.
select test_as(public.u28(1));
do $$ begin
  perform * from public.org_group_checkin_counts(public.t28('g'), 2);
  raise exception 'an owner read check-in counts';
exception when sqlstate 'AKG01' then null; end $$;
reset role;
select test_as(public.u28(6));
do $$ begin
  perform * from public.org_group_checkin_counts(public.t28('g'), 2);
  raise exception 'a member read check-in counts';
exception when sqlstate 'AKG01' then null; end $$;
reset role;

-- Leaders and owners never reach answers or progress.
select test_as(public.u28(3));
do $$ begin
  if (select count(*) from public.answers) <> 0 or (select count(*) from public.progress_events) <> 0
     or (select count(*) from public.enrolments where user_id = public.u28(5)) <> 0 then
    raise exception 'a leader read a member''s work';
  end if;
end $$;
reset role;
select test_as(public.u28(1));
do $$ begin
  if (select count(*) from public.answers) <> 0 or (select count(*) from public.progress_events) <> 0
     or (select count(*) from public.org_group_checkins) <> 0 or (select count(*) from public.enrolments) <> 0 then
    raise exception 'an owner read a member''s work or check-ins';
  end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 7. Facilitator guides (F-212): staff write, leaders read, nobody else.
-- ---------------------------------------------------------------------------
select test_as(public.u28(1));
do $$ begin
  perform public.facilitator_guide_save('a0280000-0000-0000-0000-0000000000d1', '{"units": []}'::jsonb, repeat('e', 64));
  raise exception 'an owner wrote a guide';
exception when sqlstate 'AKG01' then null; end $$;
reset role;
select test_as(public.u28(14), array['editor']);
do $$ declare v uuid; begin
  v := public.facilitator_guide_save('a0280000-0000-0000-0000-0000000000d1',
         '{"guide_version": "1", "units": [{"unit_number": 2, "minutes": 60, "discussion": [{"question": "What helped?", "minutes": 10}]}]}'::jsonb,
         repeat('e', 64));
  insert into public.t28_ids values ('guide', v);
  perform public.facilitator_guide_approve(v);
  begin
    perform public.facilitator_guide_save('a0280000-0000-0000-0000-0000000000d1', '{"units": []}'::jsonb, repeat('f', 64));
    raise exception 'an approved guide was replaced';
  exception when sqlstate 'AKG08' then null; end;
end $$;
reset role;
do $$ begin
  update public.facilitator_guides set content = '{"units": []}'::jsonb where id = public.t28('guide');
  raise exception 'an approved guide was edited';
exception when sqlstate 'AKG08' then null; end $$;
select test_as(public.u28(3));
do $$ begin
  if (select public.org_group_guide(public.t28('g')) #>> '{units,0,discussion,0,question}') <> 'What helped?' then
    raise exception 'the leader could not read the guide';
  end if;
  if not (select guide_available from public.org_group_leader_view(public.t28('g'))) then
    raise exception 'the leader view did not say a guide exists';
  end if;
  if (select count(*) from public.facilitator_guides) <> 0 then raise exception 'a leader read the guides table'; end if;
end $$;
reset role;
select test_as(public.u28(6));
do $$ begin
  perform public.org_group_guide(public.t28('g'));
  raise exception 'a member read the guide';
exception when sqlstate 'AKG01' then null; end $$;
reset role;
select test_as(public.u28(1));
do $$ begin
  perform public.org_group_guide(public.t28('g'));
  raise exception 'an owner read the guide';
exception when sqlstate 'AKG01' then null; end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 8. Report a concern (F-216): to Akana support, never the leader.
-- ---------------------------------------------------------------------------
select test_as(public.u28(6));
do $$ declare v uuid; begin
  begin
    perform public.org_group_report_concern(public.t28('g'), 'Something worries me', false);
    raise exception 'a concern was stored without consent';
  exception when sqlstate 'AKG02' then null; end;
  v := public.org_group_report_concern(public.t28('g'), 'Something in the group worries me.', true);
  perform public.org_group_report_concern(public.t28('g'), 'Second note.', true);
  perform public.org_group_report_concern(public.t28('g'), 'Third note.', true);
  begin
    perform public.org_group_report_concern(public.t28('g'), 'Fourth note.', true);
    raise exception 'the concern limit did not hold';
  exception when sqlstate 'AKG29' then null; end;
  insert into public.t28_ids values ('concern', v);
  if (select count(*) from public.support_messages) <> 0 then raise exception 'a member read the support inbox'; end if;
end $$;
reset role;
do $$ begin
  if (select topic || '/' || email::text from public.support_messages where id = public.t28('concern')) <> 'safeguarding/u28-6@test.example'
     or (select org_group_id from public.support_messages where id = public.t28('concern')) <> public.t28('g') then
    raise exception 'the concern did not reach the inbox as safeguarding';
  end if;
  if exists (select 1 from public.audit_log where target = 'support_message:' || public.t28('concern')::text) then
    raise exception 'the concern was written to the audit log';
  end if;
end $$;
select test_as(public.u28(3));
do $$ begin
  if (select count(*) from public.support_messages) <> 0 then raise exception 'a leader read a concern'; end if;
end $$;
reset role;
select test_as(public.u28(1));
do $$ begin
  if (select count(*) from public.support_messages) <> 0 then raise exception 'an owner read a concern'; end if;
end $$;
reset role;
select test_as(public.u28(13));
do $$ begin
  perform public.org_group_report_concern(public.t28('g'), 'Not my group', true);
  raise exception 'an outsider reported a concern about a group';
exception when sqlstate 'AKG01' then null; end $$;
reset role;
select test_as(public.u28(15), array['support']);
do $$ begin
  if (select topic from public.support_messages where id = public.t28('concern')) <> 'safeguarding' then
    raise exception 'support staff could not read the concern';
  end if;
end $$;
reset role;
-- The public contact form still cannot use the safeguarding topic.
do $$ begin
  perform public.submit_support_message('safeguarding', 'N', 'n@test.example', 'Hello', true, repeat('1', 64));
  raise exception 'the contact form took the safeguarding topic';
exception when sqlstate 'AKH02' then null; end $$;

-- ---------------------------------------------------------------------------
-- 9. Monthly reports (F-214): complete months, counts only, suppressed.
-- ---------------------------------------------------------------------------
update public.org_groups set created_at = date_trunc('month', now()) - interval '20 days' where id = public.t28('g');
update public.org_group_members set accepted_at = date_trunc('month', now()) - interval '18 days' where group_id = public.t28('g');
update public.org_group_checkins set at = date_trunc('month', now()) - interval '10 days' where group_id = public.t28('g');
update public.org_seats set claimed_at = date_trunc('month', now()) - interval '25 days' where org_id = public.t28('biz');
select test_as(public.u28(1));
do $$ declare m date := (date_trunc('month', (now() at time zone 'Europe/London')) - interval '1 month')::date; begin
  begin
    perform * from public.org_monthly_report(public.t28('biz'), date_trunc('month', (now() at time zone 'Europe/London'))::date);
    raise exception 'the month in progress was reported';
  exception when sqlstate 'AKG02' then null; end;
  if (select value from public.org_monthly_report(public.t28('biz'), m) where scope = 'group' and metric = 'members') <> 10 then
    raise exception 'the group member count was wrong';
  end if;
  if (select value from public.org_monthly_report(public.t28('biz'), m) where metric = 'checkins_doing_fine') <> 5 then
    raise exception 'the doing fine count was wrong';
  end if;
  if (select value is not null or shown <> 'fewer_than' from public.org_monthly_report(public.t28('biz'), m) where metric = 'checkins_found_it_hard') then
    raise exception 'a count of one was reported';
  end if;
  if (select value is not null from public.org_monthly_report(public.t28('biz'), m) where metric = 'people_started') then
    raise exception 'one person starting was reported as a number';
  end if;
  if (select value from public.org_monthly_report(public.t28('biz'), m) where metric = 'seats_taken') <> 11 then
    raise exception 'seats taken was wrong';
  end if;
  begin
    perform * from public.org_monthly_report(public.t28('church'), m);
    raise exception 'an owner read another organisation''s report';
  exception when sqlstate 'AKG01' then null; end;
end $$;
reset role;
select test_as(public.u28(2));
do $$ declare m date := (date_trunc('month', (now() at time zone 'Europe/London')) - interval '1 month')::date; begin
  -- The church group was made this month, so last month has no group rows;
  -- a group of one would show nothing anyway.
  if exists (select 1 from public.org_monthly_report(public.t28('church'), m) where scope = 'group' and value is not null) then
    raise exception 'a small group was reported as numbers';
  end if;
end $$;
reset role;
select test_as(public.u28(17));
do $$ declare m date := (date_trunc('month', (now() at time zone 'Europe/London')) - interval '1 month')::date; begin
  perform * from public.org_monthly_report(public.t28('biz'), m);
end $$;
reset role;
select test_as(public.u28(3));
do $$ declare m date := (date_trunc('month', (now() at time zone 'Europe/London')) - interval '1 month')::date; begin
  perform * from public.org_monthly_report(public.t28('biz'), m);
  raise exception 'a leader read the organisation report';
exception when sqlstate 'AKG01' then null; end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 10. Leaving, releases and archiving close places.
-- ---------------------------------------------------------------------------
select test_as(public.u28(5));
do $$ begin
  if public.org_group_clear_my_checkins(public.t28('g')) <> 1 then raise exception 'M1 could not clear their check-ins'; end if;
end $$;
reset role;
select test_as(public.u28(1));
select public.org_seat_release(public.t28('seat5'));
reset role;
do $$ begin
  if (select left_reason from public.org_group_members where group_id = public.t28('g') and user_id = public.u28(5)) <> 'seat_released' then
    raise exception 'a released seat kept its group place';
  end if;
end $$;
select test_as(public.u28(6));
do $$ begin
  if not public.org_group_leave(public.t28('g')) then raise exception 'M2 could not leave'; end if;
end $$;
reset role;
-- The owner takes the co-leader role back: C stays a member.
select test_as(public.u28(1));
select public.org_group_unappoint(public.t28('g'), 'co_leader');
reset role;
do $$ begin
  if (select role from public.org_group_members where group_id = public.t28('g') and user_id = public.u28(4) and left_at is null) <> 'member' then
    raise exception 'the co-leader did not go back to member';
  end if;
end $$;
select test_as(public.u28(4));
do $$ begin
  perform * from public.org_group_checkin_counts(public.t28('g'), 2);
  raise exception 'a former co-leader still read counts';
exception when sqlstate 'AKG01' then null; end $$;
reset role;
-- An accepted member offered a role who says no stays a member; the
-- current leader keeps the role until a new appointment is accepted.
select test_as(public.u28(1));
select public.org_group_appoint(public.t28('g'), public.t28('seat7'), 'leader');
reset role;
select test_as(public.u28(3));
do $$ begin
  if (select my_role from public.org_group_leader_view(public.t28('g'))) <> 'leader' then
    raise exception 'the leader lost the role before the new one accepted';
  end if;
end $$;
reset role;
select test_as(public.u28(7));
do $$ begin
  if not public.org_group_decline_offer(public.t28('g')) then raise exception 'M3 could not say no'; end if;
  if (select role || '/' || accepted::text || '/' || coalesce(offered_role, '-') from public.my_org_groups() where group_id = public.t28('g')) <> 'member/true/-' then
    raise exception 'saying no to a role took away the membership';
  end if;
end $$;
reset role;
-- Accepting a role moves the current holder back to member.
select test_as(public.u28(1));
select public.org_group_appoint(public.t28('g'), public.t28('seat8'), 'leader');
reset role;
select test_as(public.u28(8));
do $$ begin
  if public.org_group_join(public.t28('g')) <> 'accepted' then raise exception 'M4 could not accept the leader role'; end if;
end $$;
reset role;
do $$ begin
  if (select role from public.org_group_members where group_id = public.t28('g') and user_id = public.u28(3) and left_at is null) <> 'member' then
    raise exception 'the old leader kept the role';
  end if;
  if (select role from public.org_group_members where group_id = public.t28('g') and user_id = public.u28(8) and left_at is null) <> 'leader' then
    raise exception 'the new leader did not get the role';
  end if;
end $$;
select test_as(public.u28(1));
select public.org_group_update(public.t28('g'), 'Tuesday lunch group', null, 2, '12:30', 'finished');
select public.org_group_update(public.t28('g'), 'Tuesday lunch group', null, 2, '12:30', 'archived');
reset role;
do $$ begin
  if exists (select 1 from public.org_group_members where group_id = public.t28('g') and left_at is null) then
    raise exception 'archiving left places open';
  end if;
end $$;

-- Anon reaches nothing.
do $$ begin
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
  begin
    perform count(*) from public.org_groups;
    raise exception 'anon read groups';
  exception when insufficient_privilege then null; end;
  begin
    perform public.my_org_groups();
    raise exception 'anon called my_org_groups';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
end $$;

rollback;
