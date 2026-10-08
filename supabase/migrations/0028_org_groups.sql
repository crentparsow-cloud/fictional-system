-- 0028 Akana Business phase 2: groups inside an organisation licence
-- (F-210 to F-216).
--
-- Depends on 0001 to 0025 only. Same rules as before: every table has RLS
-- on, grants to anon and authenticated are revoked and given back narrowly,
-- helpers are security definer with search_path pinned to '', and PostgREST
-- sees thin public wrappers that run as the caller. Nothing in 0001 to 0025
-- is edited. app.has_entitlement is NOT changed: pace is soft and nothing is
-- ever locked by a group.
--
-- What this adds:
--   * Groups (F-210). The organisation's owner creates a group on one of its
--     licences, picks one title in the licence's scope and pins the title's
--     current version. The owner appoints a leader and a co-leader from the
--     licence's seat holders; the appointment waits until that person
--     accepts it in the reader app. Members join a group themselves, from
--     their seat. Nobody is added to a group without pressing a button.
--   * Schedule and soft pace (F-211). Leaders (or the owner) set the open
--     date of each unit. The group's current unit is the latest one whose
--     date has come, by UK date. Members see "Your group is on week 3". No
--     unit is locked, no one is ever "behind", and no streaks are derived.
--   * Facilitator guides (F-212). Staff write a guide per workbook version
--     (discussion questions and timings), validated in the app by the
--     packages/schema guide schema. Immutable once approved. Read only by
--     the accepted leaders and co-leaders of a live group on that version,
--     through a function, and by staff. Nothing is seeded.
--   * Group check-ins (F-213). Three fixed choices, no free text column.
--     Each member reads only their own. A member chooses whether their
--     check-ins count in the group's totals (off by default in business
--     groups). Leaders see counts per choice, never who; a count under the
--     threshold (at least 5) is held back, and nothing is shown at all when
--     fewer than the threshold counted in that unit.
--   * Organisation reports (F-214). Monthly counts per licence and per
--     group, for complete months only, suppressed under the threshold.
--     Never a name against progress, never a per-person row.
--   * Faith consent for church groups (F-215). A group run by a church, or
--     on a faith title, asks each member for the 0015 faith consent before
--     they join, accept a leader role or check in.
--   * Report a concern (F-216). A member or leader of a group can write to
--     Akana support about the group. It lands in the 0016 support inbox
--     under a new safeguarding topic, never with the leader or the
--     organisation. The app shows Help now first and, for church groups,
--     points to the church's own safeguarding lead.
--
-- Adults only: joining a group needs the 18 or over confirmation that the
-- seat claim already records. No messaging between members. No member
-- contact details are shown to other members, to leaders, or in reports.
--
-- Error codes, for the server to map:
--   AKG01  not allowed (wrong role, or not signed in)
--   AKG02  a field failed validation (the message names the field)
--   AKG03  faith consent is needed first
--   AKG04  no open seat on this group's licence
--   AKG05  already exists (already in the group)
--   AKG06  the account is scheduled for deletion
--   AKG08  the row is not in a state that allows this
--   AKG10  the 18 or over confirmation is missing
--   AKG29  rate limited

-- ---------------------------------------------------------------------------
-- 1. Permissions for the new resources (F-130 fixed roles).
-- Owners manage groups; viewers and finance read the group list; owners,
-- finance and viewers read the aggregate reports.
-- ---------------------------------------------------------------------------
insert into public.org_permissions (role, resource, action) values
  ('owner','groups','read'),('owner','groups','manage'),
  ('finance','groups','read'),('viewer','groups','read'),
  ('owner','reports','read'),('finance','reports','read'),('viewer','reports','read')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------
create table public.org_groups (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organisations(id) on delete cascade,
  licence_id    uuid not null references public.org_licences(id) on delete cascade,
  tenant_id     uuid not null references public.tenants(id),
  -- Shown to the members, the leaders and the organisation. The app warns
  -- about words that would put health or belief data into a roster.
  name          text not null check (char_length(name) between 1 and 60 and name !~ '[<>@[:cntrl:]]' and name !~* '(https?:|www\.)'),
  workbook_id   uuid not null references public.workbooks(id),
  version_id    uuid not null references public.workbook_versions(id),
  status        text not null default 'draft' check (status in ('draft','running','finished','archived')),
  starts_on     date,
  meeting_day   smallint check (meeting_day is null or meeting_day between 1 and 7),  -- ISO day, 1 = Monday
  meeting_time  time,
  -- Whether a new member's check-ins count in the totals until they choose.
  count_default boolean not null,
  -- Asks the 0015 faith consent: a church-run group, or a faith title.
  faith         boolean not null,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index org_groups_org_idx on public.org_groups(org_id, created_at desc);
create index org_groups_licence_idx on public.org_groups(licence_id);
create trigger org_groups_touch before update on public.org_groups for each row execute function app.touch_updated_at();

create table public.org_group_members (
  id             uuid primary key default gen_random_uuid(),
  group_id       uuid not null references public.org_groups(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  seat_id        uuid references public.org_seats(id) on delete set null,
  -- The role the person holds now. A role is only ever taken by accepting.
  role           text not null default 'member' check (role in ('leader','co_leader','member')),
  -- null while the person has only been offered a leader role.
  accepted_at    timestamptz,
  -- A leader appointment waiting for the person to accept or say no.
  offered_role   text check (offered_role in ('leader','co_leader')),
  offered_at     timestamptz,
  count_checkins boolean not null default false,
  left_at        timestamptz,
  left_reason    text check (left_reason in ('left','declined','replaced','seat_released','group_ended')),
  constraint org_group_members_left check ((left_at is null) = (left_reason is null)),
  constraint org_group_members_offer check ((offered_role is null) = (offered_at is null)),
  constraint org_group_members_place check (accepted_at is not null or offered_role is not null),
  constraint org_group_members_role check (role = 'member' or accepted_at is not null)
);
-- One open place per person per group; one leader and one co-leader, and
-- one waiting appointment for each.
create unique index org_group_members_open_idx on public.org_group_members(group_id, user_id) where left_at is null;
create unique index org_group_members_leader_idx on public.org_group_members(group_id) where left_at is null and role = 'leader';
create unique index org_group_members_co_leader_idx on public.org_group_members(group_id) where left_at is null and role = 'co_leader';
create unique index org_group_members_offer_idx on public.org_group_members(group_id, offered_role) where left_at is null and offered_role is not null;
create index org_group_members_user_idx on public.org_group_members(user_id) where left_at is null;
create index org_group_members_seat_idx on public.org_group_members(seat_id) where left_at is null;

create table public.org_group_schedule (
  group_id    uuid not null references public.org_groups(id) on delete cascade,
  unit_number int not null check (unit_number between 1 and 99),
  opens_on    date not null,
  primary key (group_id, unit_number)
);

-- No text column, by design (Online Safety Act user-to-user scope).
create table public.org_group_checkins (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.org_groups(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  unit_number int not null check (unit_number between 1 and 99),
  choice      text not null check (choice in ('doing_fine','found_it_hard','missed_this_week')),
  counted     boolean not null,
  at          timestamptz not null default now(),
  unique (group_id, user_id, unit_number)
);
create index org_group_checkins_group_idx on public.org_group_checkins(group_id, unit_number);
create index org_group_checkins_at_idx on public.org_group_checkins(group_id, at);

-- Facilitator guides (F-212). content is validated in the app by
-- FacilitatorGuide in packages/schema before it reaches save.
create table public.facilitator_guides (
  id           uuid primary key default gen_random_uuid(),
  workbook_id  uuid not null references public.workbooks(id) on delete cascade,
  version_id   uuid not null references public.workbook_versions(id) on delete cascade,
  content      jsonb not null check (jsonb_typeof(content) = 'object' and pg_column_size(content) <= 200000),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  status       text not null default 'draft' check (status in ('draft','approved','withdrawn')),
  saved_by     uuid references auth.users(id) on delete set null,
  saved_at     timestamptz not null default now(),
  approved_by  uuid references auth.users(id) on delete set null,
  approved_at  timestamptz,
  withdrawn_at timestamptz,
  constraint facilitator_guides_approved check ((status = 'draft') or approved_at is not null),
  constraint facilitator_guides_withdrawn check ((status = 'withdrawn') = (withdrawn_at is not null))
);
-- One guide in play per version; withdrawn ones are kept.
create unique index facilitator_guides_live_idx on public.facilitator_guides(version_id) where status <> 'withdrawn';
create index facilitator_guides_workbook_idx on public.facilitator_guides(workbook_id);

-- Approved guides never change; only their status may move to withdrawn.
create or replace function app.guard_facilitator_guide() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status in ('approved','withdrawn') and (
       new.content is distinct from old.content or new.content_hash is distinct from old.content_hash
    or new.version_id is distinct from old.version_id or new.workbook_id is distinct from old.workbook_id
    or new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at) then
    raise exception 'an approved facilitator guide cannot be changed' using errcode = 'AKG08';
  end if;
  if old.status = 'withdrawn' and new.status <> 'withdrawn' then
    raise exception 'a withdrawn facilitator guide stays withdrawn' using errcode = 'AKG08';
  end if;
  return new;
end $$;
create trigger facilitator_guides_guard before update on public.facilitator_guides
  for each row execute function app.guard_facilitator_guide();

-- Support inbox (0016): a safeguarding topic for group concerns, and the
-- group the concern is about, for staff only.
alter table public.support_messages drop constraint if exists support_messages_topic_check;
alter table public.support_messages add constraint support_messages_topic_check
  check (topic in ('refund','access','deletion','payout','worried','other','safeguarding'));
alter table public.support_messages add column org_group_id uuid references public.org_groups(id) on delete set null;

insert into public.app_config (key, value) values
  ('org_group_concerns_per_day', '3')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Helpers
-- ---------------------------------------------------------------------------
create or replace function app.london_today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Europe/London')::date
$$;

-- The suppression threshold. Never below 5, whatever the config says.
create or replace function app.org_group_threshold() returns int
language sql stable security definer set search_path = '' as $$
  select greatest(5, app.org_config_int('suppression_threshold_owner', 5))
$$;

-- The caller's accepted role in a group, or null.
create or replace function app.org_group_role(p_group uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.org_group_members m
   where m.group_id = p_group and m.user_id = app.uid() and m.left_at is null and m.accepted_at is not null
$$;

create or replace function app.is_group_leader(p_group uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(app.org_group_role(p_group) in ('leader','co_leader'), false)
$$;

-- Any open row for the caller, accepted or an appointment offer.
create or replace function app.is_group_member(p_group uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.org_group_members m
                  where m.group_id = p_group and m.user_id = app.uid() and m.left_at is null)
$$;

create or replace function app.org_group_can_manage(p_group uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.org_groups g where g.id = p_group
                  and (app.org_can(g.org_id, 'groups', 'manage') or app.is_platform(array['owner','editor'])))
$$;

-- The current unit: the latest scheduled unit whose date has come (UK date),
-- and its place in the schedule ("week"). No row before the first date.
create or replace function app.org_group_current_unit(p_group uuid)
returns table (unit_number int, week_number int, opens_on date)
language sql stable security definer set search_path = '' as $$
  with s as (
    select x.unit_number, x.opens_on,
           row_number() over (order by x.opens_on, x.unit_number)::int as wk
      from public.org_group_schedule x where x.group_id = p_group
  )
  select s.unit_number, s.wk, s.opens_on from s
   where s.opens_on <= app.london_today()
   order by s.opens_on desc, s.unit_number desc
   limit 1
$$;

-- Unit numbers that exist in a version: unit sections, else the content's units.
create or replace function app.version_unit_numbers(p_version uuid) returns int[]
language sql stable security definer set search_path = '' as $$
  select coalesce(
    nullif((select array_agg(distinct s.unit_number order by s.unit_number) from public.workbook_sections s
             where s.version_id = p_version and s.kind = 'unit'), '{}'::int[]),
    (select array_agg(distinct (u ->> 'number')::int order by (u ->> 'number')::int)
       from public.workbook_versions v, jsonb_array_elements(
              case when jsonb_typeof(v.content -> 'units') = 'array' then v.content -> 'units' else '[]'::jsonb end) u
      where v.id = p_version and jsonb_typeof(u) = 'object' and (u ->> 'number') ~ '^[0-9]{1,2}$'),
    '{}'::int[])
$$;

-- The caller's open, live seat on a licence, or null.
create or replace function app.my_live_seat(p_licence uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select s.id from public.org_seats s
   where s.licence_id = p_licence and s.user_id = app.uid() and s.released_at is null
     and app.org_licence_live(p_licence)
   limit 1
$$;

-- Faith consent recorded for the caller (0015). The app also checks the
-- wording version is current before it calls a function that needs this.
create or replace function app.has_faith_consent() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.user_id = app.uid() and p.faith_consent_at is not null)
$$;

-- Common checks before a person takes a place in a group.
create or replace function app.org_group_entry_check(g public.org_groups) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid  uuid := app.uid();
  v_seat uuid;
begin
  if v_uid is null then
    raise exception 'sign in first' using errcode = 'AKG01';
  end if;
  if g.status not in ('draft','running') then
    raise exception 'this group is not open' using errcode = 'AKG08';
  end if;
  if exists (select 1 from public.account_deletion_requests d where d.user_id = v_uid and d.cancelled_at is null) then
    raise exception 'this account is scheduled for deletion' using errcode = 'AKG06';
  end if;
  if not exists (select 1 from public.profiles p where p.user_id = v_uid and p.adult_confirmed_at is not null) then
    raise exception 'confirm you are 18 or over' using errcode = 'AKG10';
  end if;
  v_seat := app.my_live_seat(g.licence_id);
  if v_seat is null then
    raise exception 'no open seat on this licence' using errcode = 'AKG04';
  end if;
  if g.faith and not app.has_faith_consent() then
    raise exception 'faith consent is needed first' using errcode = 'AKG03';
  end if;
  return v_seat;
end $$;

create or replace function app.org_group_name_check(p_name text) returns text
language plpgsql immutable set search_path = '' as $$
declare v text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  if char_length(v) not between 1 and 60 or v ~ '[<>@[:cntrl:]]' or v ~* '(https?:|www\.)' then
    raise exception 'group_invalid: name' using errcode = 'AKG02';
  end if;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Groups (F-210). The owner (or staff) creates and runs them.
-- ---------------------------------------------------------------------------
create or replace function app.org_group_create(
  p_licence uuid, p_name text, p_workbook uuid, p_starts_on date default null,
  p_meeting_day int default null, p_meeting_time time default null
) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  l       public.org_licences;
  v_kind  text;
  v_name  text;
  v_ver   uuid;
  v_id    uuid;
begin
  select * into l from public.org_licences x where x.id = p_licence;
  if not found or app.uid() is null
     or not (app.org_can(l.org_id, 'groups', 'manage') or app.is_platform(array['owner','editor'])) then
    raise exception 'not allowed to create groups on this licence' using errcode = 'AKG01';
  end if;
  if not app.org_licence_live(l.id) then
    raise exception 'this licence is not open' using errcode = 'AKG08';
  end if;
  v_name := app.org_group_name_check(p_name);
  if p_workbook is null or not app.org_licence_scope_has(l.id, p_workbook) then
    raise exception 'group_invalid: workbook (not in this licence)' using errcode = 'AKG02';
  end if;
  select w.current_version_id into v_ver from public.workbooks w where w.id = p_workbook and w.status = 'live';
  if v_ver is null then
    raise exception 'group_invalid: workbook (no live version)' using errcode = 'AKG02';
  end if;
  if p_meeting_day is not null and p_meeting_day not between 1 and 7 then
    raise exception 'group_invalid: meeting_day' using errcode = 'AKG02';
  end if;
  if p_starts_on is not null and (p_starts_on < (l.starts_at at time zone 'Europe/London')::date - 1
                                  or p_starts_on >= (l.ends_at at time zone 'Europe/London')::date) then
    raise exception 'group_invalid: starts_on (outside the licence dates)' using errcode = 'AKG02';
  end if;
  select o.kind into v_kind from public.organisations o where o.id = l.org_id;

  insert into public.org_groups (org_id, licence_id, tenant_id, name, workbook_id, version_id, starts_on,
                                 meeting_day, meeting_time, count_default, faith, created_by)
  values (l.org_id, l.id, l.tenant_id, v_name, p_workbook, v_ver, p_starts_on, p_meeting_day, p_meeting_time,
          v_kind <> 'business', v_kind = 'church' or app.is_faith_workbook(p_workbook), app.uid())
  returning id into v_id;

  -- Ids only: a group name can carry sensitive words.
  perform app.audit('org.group_created', 'org_group:' || v_id::text, null, null, l.org_id, null,
    jsonb_build_object('licence', l.id, 'workbook', p_workbook, 'version', v_ver));
  return v_id;
end $$;

-- Change the name, dates, meeting time or status. The pinned version never
-- changes. draft -> running -> finished -> archived; draft -> archived.
-- Archiving closes every place in the group.
create or replace function app.org_group_update(
  p_group uuid, p_name text, p_starts_on date, p_meeting_day int, p_meeting_time time, p_status text
) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  g      public.org_groups;
  v_name text;
  v_status text := coalesce(p_status, 'draft');
begin
  select * into g from public.org_groups x where x.id = p_group for update;
  if not found or app.uid() is null or not app.org_group_can_manage(g.id) then
    raise exception 'not allowed' using errcode = 'AKG01';
  end if;
  if g.status = 'archived' then
    raise exception 'this group is archived' using errcode = 'AKG08';
  end if;
  v_name := app.org_group_name_check(p_name);
  if v_status not in ('draft','running','finished','archived') then
    raise exception 'group_invalid: status' using errcode = 'AKG02';
  end if;
  if v_status <> g.status and not (
       (g.status = 'draft' and v_status in ('running','archived'))
    or (g.status = 'running' and v_status = 'finished')
    or (g.status = 'finished' and v_status in ('running','archived'))) then
    raise exception 'a group cannot go from % to %', g.status, v_status using errcode = 'AKG08';
  end if;
  if v_status = 'running' and not app.org_licence_live(g.licence_id) then
    raise exception 'this licence is not open' using errcode = 'AKG08';
  end if;
  if p_meeting_day is not null and p_meeting_day not between 1 and 7 then
    raise exception 'group_invalid: meeting_day' using errcode = 'AKG02';
  end if;

  update public.org_groups x
     set name = v_name, starts_on = p_starts_on, meeting_day = p_meeting_day, meeting_time = p_meeting_time, status = v_status
   where x.id = g.id;
  if v_status = 'archived' then
    update public.org_group_members m set left_at = now(), left_reason = 'group_ended'
     where m.group_id = g.id and m.left_at is null;
  end if;
  perform app.audit('org.group_updated', 'org_group:' || g.id::text, null, null, g.org_id,
    jsonb_build_object('status', g.status), jsonb_build_object('status', v_status));
  return v_status;
end $$;

-- Appoint a leader or co-leader from the licence's seat holders. The
-- person accepts in the reader app; until then the offer gives them
-- nothing, and whoever holds the role keeps it. Another waiting offer for
-- the same role lapses.
create or replace function app.org_group_appoint(p_group uuid, p_seat uuid, p_role text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  g      public.org_groups;
  s      public.org_seats;
  m      public.org_group_members;
  v_id   uuid;
begin
  select * into g from public.org_groups x where x.id = p_group for update;
  if not found or app.uid() is null or not app.org_group_can_manage(g.id) then
    raise exception 'not allowed' using errcode = 'AKG01';
  end if;
  if p_role is null or p_role not in ('leader','co_leader') then
    raise exception 'group_invalid: role' using errcode = 'AKG02';
  end if;
  if g.status not in ('draft','running') then
    raise exception 'this group is not open' using errcode = 'AKG08';
  end if;
  select * into s from public.org_seats x where x.id = p_seat;
  if not found or s.licence_id <> g.licence_id or s.released_at is not null then
    raise exception 'group_invalid: seat (not an open seat on this licence)' using errcode = 'AKG02';
  end if;

  -- Any other waiting offer for this role lapses.
  update public.org_group_members x set left_at = now(), left_reason = 'replaced'
   where x.group_id = g.id and x.offered_role = p_role and x.left_at is null and x.accepted_at is null and x.user_id <> s.user_id;
  update public.org_group_members x set offered_role = null, offered_at = null
   where x.group_id = g.id and x.offered_role = p_role and x.left_at is null and x.user_id <> s.user_id;

  select * into m from public.org_group_members x where x.group_id = g.id and x.user_id = s.user_id and x.left_at is null for update;
  if found then
    if m.role <> p_role then
      update public.org_group_members x set offered_role = p_role, offered_at = now() where x.id = m.id;
    end if;
    v_id := m.id;
  else
    insert into public.org_group_members (group_id, user_id, seat_id, role, accepted_at, offered_role, offered_at, count_checkins)
    values (g.id, s.user_id, s.id, 'member', null, p_role, now(), g.count_default)
    returning id into v_id;
  end if;

  perform app.audit('org.group_leader_appointed', 'org_group:' || g.id::text, null, null, g.org_id, null,
    jsonb_build_object('seat', s.id, 'role', p_role));
  return v_id;
end $$;

-- The owner takes a leader role back: the holder goes back to being a
-- member, and a waiting offer for the role lapses.
create or replace function app.org_group_unappoint(p_group uuid, p_role text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare g public.org_groups;
begin
  select * into g from public.org_groups x where x.id = p_group for update;
  if not found or app.uid() is null or not app.org_group_can_manage(g.id) then
    raise exception 'not allowed' using errcode = 'AKG01';
  end if;
  if p_role is null or p_role not in ('leader','co_leader') then
    raise exception 'group_invalid: role' using errcode = 'AKG02';
  end if;
  update public.org_group_members x set role = 'member'
   where x.group_id = g.id and x.role = p_role and x.left_at is null;
  update public.org_group_members x set left_at = now(), left_reason = 'replaced'
   where x.group_id = g.id and x.offered_role = p_role and x.left_at is null and x.accepted_at is null;
  update public.org_group_members x set offered_role = null, offered_at = null
   where x.group_id = g.id and x.offered_role = p_role and x.left_at is null;
  perform app.audit('org.group_leader_removed', 'org_group:' || g.id::text, null, null, g.org_id, null,
    jsonb_build_object('role', p_role));
  return true;
end $$;

-- A member joins from their seat, or a person accepts a leader appointment.
-- Same checks either way: signed in, 18 or over, an open live seat on the
-- group's licence, faith consent for a faith group. Accepting a role moves
-- whoever held it back to being a member.
create or replace function app.org_group_join(p_group uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  g      public.org_groups;
  m      public.org_group_members;
  v_seat uuid;
begin
  select * into g from public.org_groups x where x.id = p_group for update;
  if not found then
    raise exception 'not allowed' using errcode = 'AKG01';
  end if;
  v_seat := app.org_group_entry_check(g);
  select * into m from public.org_group_members x where x.group_id = g.id and x.user_id = app.uid() and x.left_at is null for update;
  if found then
    if m.offered_role is null then
      return 'already';
    end if;
    update public.org_group_members x set role = 'member'
     where x.group_id = g.id and x.role = m.offered_role and x.left_at is null and x.id <> m.id;
    update public.org_group_members x
       set role = m.offered_role, offered_role = null, offered_at = null,
           accepted_at = coalesce(x.accepted_at, now()), seat_id = v_seat
     where x.id = m.id;
    perform app.audit('org.group_leader_accepted', 'org_group:' || g.id::text, null, null, g.org_id, null,
      jsonb_build_object('role', m.offered_role));
    return 'accepted';
  end if;
  insert into public.org_group_members (group_id, user_id, seat_id, role, accepted_at, count_checkins)
  values (g.id, app.uid(), v_seat, 'member', now(), g.count_default);
  -- No audit row per member join: who is in which group is not logged.
  return 'joined';
end $$;

-- Say no to a leader appointment. Someone who was already a member stays one.
create or replace function app.org_group_decline_offer(p_group uuid) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare m public.org_group_members;
begin
  if app.uid() is null then
    raise exception 'sign in first' using errcode = 'AKG01';
  end if;
  select * into m from public.org_group_members x
   where x.group_id = p_group and x.user_id = app.uid() and x.left_at is null and x.offered_role is not null for update;
  if not found then return false; end if;
  if m.accepted_at is null then
    update public.org_group_members x set left_at = now(), left_reason = 'declined' where x.id = m.id;
  else
    update public.org_group_members x set offered_role = null, offered_at = null where x.id = m.id;
  end if;
  return true;
end $$;

-- Leave a group (a leader leaving gives up the role). Check-ins already
-- made stay as counts; they can be cleared with org_group_clear_my_checkins.
create or replace function app.org_group_leave(p_group uuid) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare m public.org_group_members;
begin
  if app.uid() is null then
    raise exception 'sign in first' using errcode = 'AKG01';
  end if;
  select * into m from public.org_group_members x where x.group_id = p_group and x.user_id = app.uid() and x.left_at is null for update;
  if not found then return false; end if;
  update public.org_group_members x
     set left_at = now(), left_reason = case when m.accepted_at is null then 'declined' else 'left' end
   where x.id = m.id;
  return true;
end $$;

-- The member decides whether their check-ins count in the group's totals.
-- Applies to their past check-ins in this group too.
create or replace function app.org_group_set_counting(p_group uuid, p_count boolean) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare m public.org_group_members;
begin
  if app.uid() is null or p_count is null then
    raise exception 'not allowed' using errcode = 'AKG01';
  end if;
  select * into m from public.org_group_members x
   where x.group_id = p_group and x.user_id = app.uid() and x.left_at is null and x.accepted_at is not null for update;
  if not found then
    raise exception 'not in this group' using errcode = 'AKG01';
  end if;
  update public.org_group_members x set count_checkins = p_count where x.id = m.id;
  update public.org_group_checkins c set counted = p_count where c.group_id = p_group and c.user_id = app.uid();
  return p_count;
end $$;

-- Remove the caller's own check-ins in a group.
create or replace function app.org_group_clear_my_checkins(p_group uuid) returns int
language plpgsql volatile security definer set search_path = '' as $$
declare n int;
begin
  if app.uid() is null then
    raise exception 'sign in first' using errcode = 'AKG01';
  end if;
  delete from public.org_group_checkins c where c.group_id = p_group and c.user_id = app.uid();
  get diagnostics n = row_count;
  return n;
end $$;

-- A released seat ends the person's places in that licence's groups.
create or replace function app.org_group_members_on_seat_end() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.released_at is not null and old.released_at is null then
    update public.org_group_members m set left_at = now(), left_reason = 'seat_released'
     where m.left_at is null and m.user_id = new.user_id
       and m.group_id in (select g.id from public.org_groups g where g.licence_id = new.licence_id);
  end if;
  return new;
end $$;
create trigger org_seats_end_group_places after update of released_at on public.org_seats
  for each row execute function app.org_group_members_on_seat_end();

-- ---------------------------------------------------------------------------
-- 5. Schedule (F-211). Leaders or the owner set it. Soft pace only.
-- ---------------------------------------------------------------------------
create or replace function app.org_group_schedule_set(p_group uuid, p_units int[], p_dates date[]) returns int
language plpgsql volatile security definer set search_path = '' as $$
declare
  g      public.org_groups;
  l      public.org_licences;
  v_all  int[];
  i      int;
  n      int := coalesce(cardinality(p_units), 0);
begin
  select * into g from public.org_groups x where x.id = p_group for update;
  if not found or app.uid() is null or not (app.is_group_leader(g.id) or app.org_group_can_manage(g.id)) then
    raise exception 'not allowed' using errcode = 'AKG01';
  end if;
  if g.status not in ('draft','running') then
    raise exception 'this group is not open' using errcode = 'AKG08';
  end if;
  if n <> coalesce(cardinality(p_dates), 0) or n > 99 then
    raise exception 'group_invalid: schedule' using errcode = 'AKG02';
  end if;
  select * into l from public.org_licences x where x.id = g.licence_id;
  v_all := app.version_unit_numbers(g.version_id);
  for i in 1 .. n loop
    if p_units[i] is null or p_dates[i] is null then
      raise exception 'group_invalid: schedule (row %)', i using errcode = 'AKG02';
    end if;
    if cardinality(v_all) > 0 and not (p_units[i] = any(v_all)) then
      raise exception 'group_invalid: unit % is not in this workbook', p_units[i] using errcode = 'AKG02';
    end if;
    if p_units[i] not between 1 and 99 then
      raise exception 'group_invalid: unit %', p_units[i] using errcode = 'AKG02';
    end if;
    if p_dates[i] < (l.starts_at at time zone 'Europe/London')::date - 1 or p_dates[i] >= (l.ends_at at time zone 'Europe/London')::date then
      raise exception 'group_invalid: date for unit % is outside the licence', p_units[i] using errcode = 'AKG02';
    end if;
  end loop;
  if (select count(distinct u) from unnest(coalesce(p_units, '{}'::int[])) u) <> n then
    raise exception 'group_invalid: a unit is listed twice' using errcode = 'AKG02';
  end if;

  delete from public.org_group_schedule s where s.group_id = g.id;
  insert into public.org_group_schedule (group_id, unit_number, opens_on)
  select g.id, u, d from unnest(coalesce(p_units, '{}'::int[]), coalesce(p_dates, '{}'::date[])) as t(u, d);
  perform app.audit('org.group_schedule', 'org_group:' || g.id::text, null, null, g.org_id, null,
    jsonb_build_object('units', n, 'by_leader', app.is_group_leader(g.id)));
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Check-ins (F-213). Fixed choices, no text. Last write wins.
-- ---------------------------------------------------------------------------
create or replace function app.org_group_checkin(p_group uuid, p_unit int, p_choice text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  g public.org_groups;
  m public.org_group_members;
begin
  if app.uid() is null then
    raise exception 'sign in first' using errcode = 'AKG01';
  end if;
  select * into g from public.org_groups x where x.id = p_group;
  select * into m from public.org_group_members x
   where x.group_id = p_group and x.user_id = app.uid() and x.left_at is null and x.accepted_at is not null;
  if g.id is null or m.id is null then
    raise exception 'not in this group' using errcode = 'AKG01';
  end if;
  if p_choice is null or p_choice not in ('doing_fine','found_it_hard','missed_this_week') then
    raise exception 'group_invalid: choice' using errcode = 'AKG02';
  end if;
  if g.status <> 'running' then
    raise exception 'this group is not running' using errcode = 'AKG08';
  end if;
  if g.faith and not app.has_faith_consent() then
    raise exception 'faith consent is needed first' using errcode = 'AKG03';
  end if;
  if not exists (select 1 from public.org_group_schedule s
                  where s.group_id = g.id and s.unit_number = p_unit and s.opens_on <= app.london_today()) then
    raise exception 'group_invalid: unit (not open yet)' using errcode = 'AKG02';
  end if;
  insert into public.org_group_checkins (group_id, user_id, unit_number, choice, counted)
  values (g.id, app.uid(), p_unit, p_choice, m.count_checkins)
  on conflict (group_id, user_id, unit_number) do update
    set choice = excluded.choice, counted = excluded.counted, at = now();
  return p_choice;
end $$;

-- Counts per choice for one unit, for the group's leaders and staff only.
-- Only check-ins the member chose to count. Nothing at all when fewer than
-- the threshold counted; a single choice under the threshold is held back.
-- No total is returned, so a held-back count cannot be worked out.
-- Check-ins made today are counted from tomorrow.
create or replace function app.org_group_checkin_counts(p_group uuid, p_unit int)
returns table (choice text, n int, shown text, threshold int)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_t     int := app.org_group_threshold();
  -- Counted up to the start of today (UK), so the numbers move once a day
  -- and a leader cannot watch one person's check-in arrive.
  v_until timestamptz := (app.london_today()::timestamp) at time zone 'Europe/London';
  v_total int;
begin
  if app.uid() is null or p_group is null or not (app.is_group_leader(p_group) or app.is_staff()) then
    raise exception 'not allowed' using errcode = 'AKG01';
  end if;
  select count(*) into v_total from public.org_group_checkins c
   where c.group_id = p_group and c.unit_number = p_unit and c.counted and c.at < v_until;
  return query
  with choices(choice, ord) as (values ('doing_fine', 1), ('found_it_hard', 2), ('missed_this_week', 3)),
  counts as (
    select ch.choice, ch.ord,
           (select count(*)::int from public.org_group_checkins c
             where c.group_id = p_group and c.unit_number = p_unit and c.counted and c.at < v_until and c.choice = ch.choice) as k
      from choices ch
  )
  select ct.choice,
         case when v_total >= v_t and ct.k >= v_t then ct.k end,
         case when v_total < v_t then 'hidden' when ct.k >= v_t then 'exact' else 'fewer_than' end,
         v_t
    from counts ct order by ct.ord;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Reads for the reader app and the leader and owner views.
-- ---------------------------------------------------------------------------

-- The caller's groups, accepted or offered, with where the group is.
create or replace function app.my_org_groups()
returns table (group_id uuid, group_name text, organisation_name text, organisation_kind text, workbook_title text, workbook_slug text,
               status text, role text, accepted boolean, offered_role text, count_checkins boolean, faith boolean, starts_on date,
               meeting_day int, meeting_time time, current_unit int, current_week int, my_choice text)
language sql stable security definer set search_path = '' as $$
  select g.id, g.name, o.display_name, o.kind, w.title, w.slug, g.status, m.role, m.accepted_at is not null, m.offered_role, m.count_checkins,
         g.faith, g.starts_on, g.meeting_day::int, g.meeting_time, cu.unit_number, cu.week_number,
         (select c.choice from public.org_group_checkins c
           where c.group_id = g.id and c.user_id = m.user_id and c.unit_number = cu.unit_number)
    from public.org_group_members m
    join public.org_groups g on g.id = m.group_id
    join public.organisations o on o.id = g.org_id
    join public.workbooks w on w.id = g.workbook_id
    left join lateral app.org_group_current_unit(g.id) cu on true
   where m.user_id = app.uid() and m.left_at is null and g.status <> 'archived'
   order by g.name
$$;

-- Groups the caller could join from a seat they hold. Shows no one else.
create or replace function app.my_joinable_org_groups()
returns table (group_id uuid, group_name text, organisation_name text, organisation_kind text, workbook_title text,
               status text, faith boolean, starts_on date, meeting_day int, meeting_time time)
language sql stable security definer set search_path = '' as $$
  select g.id, g.name, o.display_name, o.kind, w.title, g.status, g.faith, g.starts_on, g.meeting_day::int, g.meeting_time
    from public.org_seats s
    join public.org_groups g on g.licence_id = s.licence_id
    join public.organisations o on o.id = g.org_id
    join public.workbooks w on w.id = g.workbook_id
   where s.user_id = app.uid() and s.released_at is null and app.org_licence_live(s.licence_id)
     and g.status in ('draft','running')
     and not exists (select 1 from public.org_group_members m where m.group_id = g.id and m.user_id = app.uid() and m.left_at is null)
   order by o.display_name, g.name
$$;

-- none, offered, accepted, or replacing (held, with a new offer waiting).
create or replace function app.org_group_role_state(p_group uuid, p_role text) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when h and o then 'replacing' when h then 'accepted' when o then 'offered' else 'none' end
  from (select
          exists (select 1 from public.org_group_members m where m.group_id = p_group and m.role = p_role and m.left_at is null) as h,
          exists (select 1 from public.org_group_members m where m.group_id = p_group and m.offered_role = p_role and m.left_at is null) as o) x
$$;

-- The owner's list. Member numbers are suppressed under the threshold.
-- Leader state is none, offered or accepted; never who.
create or replace function app.org_group_list(p_org uuid)
returns table (group_id uuid, licence_id uuid, group_name text, workbook_title text, status text, faith boolean,
               starts_on date, meeting_day int, meeting_time time, members int, members_shown text,
               leader_state text, co_leader_state text, current_unit int, current_week int, scheduled_units int, threshold int)
language plpgsql stable security definer set search_path = '' as $$
declare v_t int := app.org_group_threshold();
begin
  if app.uid() is null or p_org is null or not (app.org_can(p_org, 'groups', 'read') or app.is_staff()) then
    raise exception 'not allowed' using errcode = 'AKG01';
  end if;
  return query
  select g.id, g.licence_id, g.name, w.title, g.status, g.faith, g.starts_on, g.meeting_day::int, g.meeting_time,
         case when k.n >= v_t then k.n end, case when k.n >= v_t then 'exact' else 'fewer_than' end,
         app.org_group_role_state(g.id, 'leader'),
         app.org_group_role_state(g.id, 'co_leader'),
         cu.unit_number, cu.week_number,
         (select count(*)::int from public.org_group_schedule s where s.group_id = g.id),
         v_t
    from public.org_groups g
    join public.workbooks w on w.id = g.workbook_id
    cross join lateral (select count(*)::int as n from public.org_group_members m
                         where m.group_id = g.id and m.left_at is null and m.accepted_at is not null) k
    left join lateral app.org_group_current_unit(g.id) cu on true
   where g.org_id = p_org
   order by g.status = 'archived', g.created_at desc;
end $$;

-- The leader's view of their group: the basics and the member number.
-- A leader meets the group, so the number is exact here; never names.
create or replace function app.org_group_leader_view(p_group uuid)
returns table (group_id uuid, group_name text, organisation_name text, organisation_kind text, workbook_title text,
               version_id uuid, status text, faith boolean, starts_on date, meeting_day int, meeting_time time,
               members int, current_unit int, current_week int, my_role text, guide_available boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if app.uid() is null or p_group is null or not (app.is_group_leader(p_group) or app.is_staff()) then
    raise exception 'not allowed' using errcode = 'AKG01';
  end if;
  return query
  select g.id, g.name, o.display_name, o.kind, w.title, g.version_id, g.status, g.faith, g.starts_on, g.meeting_day::int, g.meeting_time,
         (select count(*)::int from public.org_group_members m where m.group_id = g.id and m.left_at is null and m.accepted_at is not null),
         cu.unit_number, cu.week_number, app.org_group_role(g.id),
         exists (select 1 from public.facilitator_guides f where f.version_id = g.version_id and f.status = 'approved')
    from public.org_groups g
    join public.organisations o on o.id = g.org_id
    join public.workbooks w on w.id = g.workbook_id
    left join lateral app.org_group_current_unit(g.id) cu on true
   where g.id = p_group;
end $$;

-- The groups the caller leads (accepted), for the leader index.
create or replace function app.my_led_org_groups()
returns table (group_id uuid, group_name text, organisation_name text, status text, role text)
language sql stable security definer set search_path = '' as $$
  select g.id, g.name, o.display_name, g.status, m.role
    from public.org_group_members m
    join public.org_groups g on g.id = m.group_id
    join public.organisations o on o.id = g.org_id
   where m.user_id = app.uid() and m.left_at is null and m.accepted_at is not null
     and m.role in ('leader','co_leader') and g.status <> 'archived'
   order by g.name
$$;

-- Unit numbers of the group's pinned version, for the schedule editor.
-- Leaders, the group's managers and staff.
create or replace function app.org_group_units(p_group uuid) returns int[]
language plpgsql stable security definer set search_path = '' as $$
declare g public.org_groups;
begin
  select * into g from public.org_groups x where x.id = p_group;
  if not found or app.uid() is null or not (app.is_group_leader(g.id) or app.org_group_can_manage(g.id) or app.is_staff()) then
    raise exception 'not allowed' using errcode = 'AKG01';
  end if;
  return app.version_unit_numbers(g.version_id);
end $$;

-- Titles a group on this licence may use: in scope, live, with a version.
create or replace function app.org_licence_group_titles(p_licence uuid)
returns table (workbook_id uuid, title text, faith boolean)
language plpgsql stable security definer set search_path = '' as $$
declare l public.org_licences;
begin
  select * into l from public.org_licences x where x.id = p_licence;
  if not found or app.uid() is null
     or not (app.org_can(l.org_id, 'groups', 'manage') or app.is_platform(array['owner','editor'])) then
    raise exception 'not allowed' using errcode = 'AKG01';
  end if;
  return query
  select w.id, w.title, app.is_faith_workbook(w.id)
    from public.workbooks w
   where w.tenant_id = l.tenant_id and w.status = 'live' and w.current_version_id is not null
     and app.org_licence_scope_has(l.id, w.id)
   order by w.title
   limit 500;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Facilitator guides (F-212). Staff write; leaders read through here.
-- ---------------------------------------------------------------------------
create or replace function app.facilitator_guide_save(p_version uuid, p_content jsonb, p_hash text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_wb uuid;
  f    public.facilitator_guides;
  v_id uuid;
begin
  if not app.is_platform(array['owner','editor']) then
    raise exception 'only platform owners and editors write facilitator guides' using errcode = 'AKG01';
  end if;
  select v.workbook_id into v_wb from public.workbook_versions v where v.id = p_version;
  if v_wb is null then
    raise exception 'group_invalid: version' using errcode = 'AKG02';
  end if;
  if p_content is null or jsonb_typeof(p_content) <> 'object' then
    raise exception 'group_invalid: content' using errcode = 'AKG02';
  end if;
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'group_invalid: content_hash' using errcode = 'AKG02';
  end if;
  select * into f from public.facilitator_guides x where x.version_id = p_version and x.status <> 'withdrawn' for update;
  if found and f.status = 'approved' then
    raise exception 'this version has an approved guide; withdraw it first' using errcode = 'AKG08';
  end if;
  if found then
    update public.facilitator_guides x set content = p_content, content_hash = p_hash, saved_by = app.uid(), saved_at = now()
     where x.id = f.id;
    v_id := f.id;
  else
    insert into public.facilitator_guides (workbook_id, version_id, content, content_hash, saved_by)
    values (v_wb, p_version, p_content, p_hash, app.uid())
    returning id into v_id;
  end if;
  perform app.audit('facilitator_guide.saved', 'facilitator_guide:' || v_id::text, null, null, null, null,
    jsonb_build_object('version', p_version, 'hash', p_hash));
  return v_id;
end $$;

create or replace function app.facilitator_guide_approve(p_guide uuid) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare f public.facilitator_guides;
begin
  if not app.is_platform(array['owner','editor']) then
    raise exception 'only platform owners and editors approve facilitator guides' using errcode = 'AKG01';
  end if;
  select * into f from public.facilitator_guides x where x.id = p_guide for update;
  if not found or f.status <> 'draft' then
    raise exception 'only a draft guide can be approved' using errcode = 'AKG08';
  end if;
  update public.facilitator_guides x set status = 'approved', approved_by = app.uid(), approved_at = now() where x.id = f.id;
  perform app.audit('facilitator_guide.approved', 'facilitator_guide:' || f.id::text, null, null, null, null,
    jsonb_build_object('version', f.version_id, 'hash', f.content_hash));
  return true;
end $$;

create or replace function app.facilitator_guide_withdraw(p_guide uuid, p_reason text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  f public.facilitator_guides;
  v_reason text := app.clean_text(p_reason, 500);
begin
  if not app.is_platform(array['owner','editor']) then
    raise exception 'only platform owners and editors withdraw facilitator guides' using errcode = 'AKG01';
  end if;
  if v_reason is null then
    raise exception 'group_invalid: reason' using errcode = 'AKG02';
  end if;
  select * into f from public.facilitator_guides x where x.id = p_guide for update;
  if not found or f.status = 'withdrawn' then
    return false;
  end if;
  update public.facilitator_guides x
     set status = 'withdrawn', withdrawn_at = now(), approved_at = coalesce(x.approved_at, now())
   where x.id = f.id;
  perform app.audit('facilitator_guide.withdrawn', 'facilitator_guide:' || f.id::text, v_reason, null, null, null,
    jsonb_build_object('version', f.version_id));
  return true;
end $$;

-- The approved guide for a group's pinned version. Leaders of an open
-- group only (and staff). Members and organisation owners get nothing.
create or replace function app.org_group_guide(p_group uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare g public.org_groups;
begin
  select * into g from public.org_groups x where x.id = p_group;
  if not found or app.uid() is null or not (app.is_group_leader(g.id) or app.is_staff()) then
    raise exception 'not allowed' using errcode = 'AKG01';
  end if;
  if g.status not in ('draft','running','finished') and not app.is_staff() then
    return null;
  end if;
  return (select f.content from public.facilitator_guides f where f.version_id = g.version_id and f.status = 'approved');
end $$;

-- ---------------------------------------------------------------------------
-- 9. Report a concern (F-216). To Akana support only.
-- ---------------------------------------------------------------------------
create or replace function app.org_group_report_concern(p_group uuid, p_message text, p_consent boolean) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid   uuid := app.uid();
  v_msg   text := nullif(btrim(coalesce(p_message, '')), '');
  v_email text;
  v_name  text;
  v_n     int;
  v_id    uuid;
begin
  if v_uid is null or p_group is null or not app.is_group_member(p_group) then
    raise exception 'not allowed' using errcode = 'AKG01';
  end if;
  if p_consent is distinct from true then
    raise exception 'consent to store and reply is required' using errcode = 'AKG02';
  end if;
  if v_msg is null or char_length(v_msg) > 4000 then
    raise exception 'group_invalid: message' using errcode = 'AKG02';
  end if;
  select lower(u.email) into v_email from auth.users u where u.id = v_uid;
  if v_email is null or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'group_invalid: email' using errcode = 'AKG02';
  end if;
  select coalesce(nullif(btrim(p.display_name), ''), 'Group member') into v_name from public.profiles p where p.user_id = v_uid;
  perform pg_advisory_xact_lock(hashtext('group-concern:' || v_uid::text));
  select count(*) into v_n from public.support_messages s
   where s.user_id = v_uid and s.topic = 'safeguarding' and s.created_at > now() - interval '1 day';
  if v_n >= app.org_config_int('org_group_concerns_per_day', 3) then
    raise exception 'too many reports today' using errcode = 'AKG29';
  end if;
  insert into public.support_messages (topic, name, email, message, consent_contact, user_id, org_group_id)
  values ('safeguarding', left(coalesce(v_name, 'Group member'), 200), v_email, v_msg, true, v_uid, p_group)
  returning id into v_id;
  -- No audit row naming the organisation: it must not learn of the report.
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 10. Organisation reports (F-214). Monthly, counts only, suppressed.
-- One row per metric. value is null whenever shown is not 'exact'.
--   licence rows: seats_taken (exact, as on the console),
--                 people_started (seat holders who started a title in scope
--                 during the month)
--   group rows:   members (at month end), members_started (members with
--                 the group's title started by month end), checkins_doing_fine,
--                 checkins_found_it_hard, checkins_missed_this_week (counted
--                 check-ins made in the month)
-- A group with fewer members than the threshold shows nothing ('hidden').
-- Check-in rows are all hidden when fewer than the threshold counted.
-- ---------------------------------------------------------------------------
create or replace function app.org_monthly_report(p_org uuid, p_month date)
returns table (scope text, licence_id uuid, group_id uuid, group_name text, metric text, value int, shown text, threshold int)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_t      int := app.org_group_threshold();
  v_from   timestamptz;
  v_to     timestamptz;
  v_this   date := date_trunc('month', app.london_today())::date;
  r        record;
  g        record;
  v_n      int;
  v_total  int;
  v_members int;
  v_choice text;
begin
  if app.uid() is null or p_org is null or not (app.org_can(p_org, 'reports', 'read') or app.is_staff()) then
    raise exception 'not allowed' using errcode = 'AKG01';
  end if;
  if p_month is null or p_month <> date_trunc('month', p_month)::date or p_month >= v_this or p_month < (v_this - interval '24 months')::date then
    raise exception 'group_invalid: month (a complete month in the last two years)' using errcode = 'AKG02';
  end if;
  v_from := (p_month::timestamp) at time zone 'Europe/London';
  v_to   := ((p_month + interval '1 month')::timestamp) at time zone 'Europe/London';

  for r in select l.* from public.org_licences l
            where l.org_id = p_org and l.starts_at < v_to and l.ends_at > v_from
            order by l.starts_at loop
    -- Seats live at the end of the month.
    select count(*) into v_n from public.org_seats s
     where s.licence_id = r.id and s.claimed_at < v_to and (s.released_at is null or s.released_at >= v_to);
    return query select 'licence'::text, r.id, null::uuid, null::text, 'seats_taken'::text, v_n, 'exact'::text, v_t;

    select count(distinct s.user_id) into v_n from public.org_seats s
     where s.licence_id = r.id and s.claimed_at < v_to and (s.released_at is null or s.released_at >= v_from)
       and exists (select 1 from public.enrolments e
                    where e.user_id = s.user_id and e.tenant_id = r.tenant_id
                      and e.started_at >= greatest(s.claimed_at, v_from) and e.started_at < v_to
                      and app.org_licence_scope_has(r.id, e.workbook_id));
    return query select 'licence'::text, r.id, null::uuid, null::text, 'people_started'::text,
      case when v_n >= v_t then v_n end, case when v_n >= v_t then 'exact' else 'fewer_than' end, v_t;

    for g in select x.* from public.org_groups x where x.licence_id = r.id and x.created_at < v_to order by x.created_at loop
      select count(*) into v_members from public.org_group_members m
       where m.group_id = g.id and m.accepted_at is not null and m.accepted_at < v_to and (m.left_at is null or m.left_at >= v_to);
      if v_members < v_t then
        return query select 'group'::text, r.id, g.id, g.name, x.metric, null::int, 'hidden'::text, v_t
          from unnest(array['members','members_started','checkins_doing_fine','checkins_found_it_hard','checkins_missed_this_week']) as x(metric);
        continue;
      end if;
      return query select 'group'::text, r.id, g.id, g.name, 'members'::text, v_members, 'exact'::text, v_t;

      select count(*) into v_n from public.org_group_members m
       where m.group_id = g.id and m.accepted_at is not null and m.accepted_at < v_to and (m.left_at is null or m.left_at >= v_to)
         and exists (select 1 from public.enrolments e where e.user_id = m.user_id and e.workbook_id = g.workbook_id and e.started_at < v_to);
      -- Hide the count when it, or the number not started, is under the threshold.
      return query select 'group'::text, r.id, g.id, g.name, 'members_started'::text,
        case when v_n >= v_t and v_members - v_n >= v_t then v_n end,
        case when v_n < v_t then 'fewer_than' when v_members - v_n < v_t then 'nearly_all' else 'exact' end, v_t;

      select count(*) into v_total from public.org_group_checkins c
       where c.group_id = g.id and c.counted and c.at >= v_from and c.at < v_to;
      foreach v_choice in array array['doing_fine','found_it_hard','missed_this_week'] loop
        select count(*) into v_n from public.org_group_checkins c
         where c.group_id = g.id and c.counted and c.at >= v_from and c.at < v_to and c.choice = v_choice;
        return query select 'group'::text, r.id, g.id, g.name, ('checkins_' || v_choice)::text,
          case when v_total >= v_t and v_n >= v_t then v_n end,
          case when v_total < v_t then 'hidden' when v_n >= v_t then 'exact' else 'fewer_than' end, v_t;
      end loop;
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 11. RPC wrappers. Security invoker: the app functions do the checks.
-- ---------------------------------------------------------------------------
create or replace function public.org_group_create(
  p_licence uuid, p_name text, p_workbook uuid, p_starts_on date default null, p_meeting_day int default null, p_meeting_time time default null
) returns uuid
language sql volatile security invoker set search_path = '' as $$
  select app.org_group_create(p_licence, p_name, p_workbook, p_starts_on, p_meeting_day, p_meeting_time) $$;
create or replace function public.org_group_update(
  p_group uuid, p_name text, p_starts_on date, p_meeting_day int, p_meeting_time time, p_status text
) returns text
language sql volatile security invoker set search_path = '' as $$
  select app.org_group_update(p_group, p_name, p_starts_on, p_meeting_day, p_meeting_time, p_status) $$;
create or replace function public.org_group_appoint(p_group uuid, p_seat uuid, p_role text) returns uuid
language sql volatile security invoker set search_path = '' as $$ select app.org_group_appoint(p_group, p_seat, p_role) $$;
create or replace function public.org_group_unappoint(p_group uuid, p_role text) returns boolean
language sql volatile security invoker set search_path = '' as $$ select app.org_group_unappoint(p_group, p_role) $$;
create or replace function public.org_group_join(p_group uuid) returns text
language sql volatile security invoker set search_path = '' as $$ select app.org_group_join(p_group) $$;
create or replace function public.org_group_decline_offer(p_group uuid) returns boolean
language sql volatile security invoker set search_path = '' as $$ select app.org_group_decline_offer(p_group) $$;
create or replace function public.org_group_leave(p_group uuid) returns boolean
language sql volatile security invoker set search_path = '' as $$ select app.org_group_leave(p_group) $$;
create or replace function public.org_group_set_counting(p_group uuid, p_count boolean) returns boolean
language sql volatile security invoker set search_path = '' as $$ select app.org_group_set_counting(p_group, p_count) $$;
create or replace function public.org_group_clear_my_checkins(p_group uuid) returns int
language sql volatile security invoker set search_path = '' as $$ select app.org_group_clear_my_checkins(p_group) $$;
create or replace function public.org_group_schedule_set(p_group uuid, p_units int[], p_dates date[]) returns int
language sql volatile security invoker set search_path = '' as $$ select app.org_group_schedule_set(p_group, p_units, p_dates) $$;
create or replace function public.org_group_checkin(p_group uuid, p_unit int, p_choice text) returns text
language sql volatile security invoker set search_path = '' as $$ select app.org_group_checkin(p_group, p_unit, p_choice) $$;
create or replace function public.org_group_checkin_counts(p_group uuid, p_unit int)
returns table (choice text, n int, shown text, threshold int)
language sql stable security invoker set search_path = '' as $$ select * from app.org_group_checkin_counts(p_group, p_unit) $$;
create or replace function public.my_org_groups()
returns table (group_id uuid, group_name text, organisation_name text, organisation_kind text, workbook_title text, workbook_slug text,
               status text, role text, accepted boolean, offered_role text, count_checkins boolean, faith boolean, starts_on date,
               meeting_day int, meeting_time time, current_unit int, current_week int, my_choice text)
language sql stable security invoker set search_path = '' as $$ select * from app.my_org_groups() $$;
create or replace function public.my_joinable_org_groups()
returns table (group_id uuid, group_name text, organisation_name text, organisation_kind text, workbook_title text,
               status text, faith boolean, starts_on date, meeting_day int, meeting_time time)
language sql stable security invoker set search_path = '' as $$ select * from app.my_joinable_org_groups() $$;
create or replace function public.my_led_org_groups()
returns table (group_id uuid, group_name text, organisation_name text, status text, role text)
language sql stable security invoker set search_path = '' as $$ select * from app.my_led_org_groups() $$;
create or replace function public.org_group_list(p_org uuid)
returns table (group_id uuid, licence_id uuid, group_name text, workbook_title text, status text, faith boolean,
               starts_on date, meeting_day int, meeting_time time, members int, members_shown text,
               leader_state text, co_leader_state text, current_unit int, current_week int, scheduled_units int, threshold int)
language sql stable security invoker set search_path = '' as $$ select * from app.org_group_list(p_org) $$;
create or replace function public.org_group_leader_view(p_group uuid)
returns table (group_id uuid, group_name text, organisation_name text, organisation_kind text, workbook_title text,
               version_id uuid, status text, faith boolean, starts_on date, meeting_day int, meeting_time time,
               members int, current_unit int, current_week int, my_role text, guide_available boolean)
language sql stable security invoker set search_path = '' as $$ select * from app.org_group_leader_view(p_group) $$;
create or replace function public.org_group_units(p_group uuid) returns int[]
language sql stable security invoker set search_path = '' as $$ select app.org_group_units(p_group) $$;
create or replace function public.org_licence_group_titles(p_licence uuid)
returns table (workbook_id uuid, title text, faith boolean)
language sql stable security invoker set search_path = '' as $$ select * from app.org_licence_group_titles(p_licence) $$;
create or replace function public.facilitator_guide_save(p_version uuid, p_content jsonb, p_hash text) returns uuid
language sql volatile security invoker set search_path = '' as $$ select app.facilitator_guide_save(p_version, p_content, p_hash) $$;
create or replace function public.facilitator_guide_approve(p_guide uuid) returns boolean
language sql volatile security invoker set search_path = '' as $$ select app.facilitator_guide_approve(p_guide) $$;
create or replace function public.facilitator_guide_withdraw(p_guide uuid, p_reason text) returns boolean
language sql volatile security invoker set search_path = '' as $$ select app.facilitator_guide_withdraw(p_guide, p_reason) $$;
create or replace function public.org_group_guide(p_group uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$ select app.org_group_guide(p_group) $$;
create or replace function public.org_group_report_concern(p_group uuid, p_message text, p_consent boolean) returns uuid
language sql volatile security invoker set search_path = '' as $$ select app.org_group_report_concern(p_group, p_message, p_consent) $$;
create or replace function public.org_monthly_report(p_org uuid, p_month date)
returns table (scope text, licence_id uuid, group_id uuid, group_name text, metric text, value int, shown text, threshold int)
language sql stable security invoker set search_path = '' as $$ select * from app.org_monthly_report(p_org, p_month) $$;

-- Execute: revoke from everyone, then give back to the roles that need it.
revoke execute on function
  app.guard_facilitator_guide(), app.london_today(), app.org_group_threshold(), app.org_group_role(uuid),
  app.is_group_leader(uuid), app.is_group_member(uuid), app.org_group_can_manage(uuid), app.org_group_current_unit(uuid),
  app.version_unit_numbers(uuid), app.my_live_seat(uuid), app.has_faith_consent(), app.org_group_entry_check(public.org_groups),
  app.org_group_name_check(text),
  app.org_group_create(uuid, text, uuid, date, int, time), app.org_group_update(uuid, text, date, int, time, text),
  app.org_group_appoint(uuid, uuid, text), app.org_group_unappoint(uuid, text), app.org_group_join(uuid), app.org_group_leave(uuid), app.org_group_decline_offer(uuid),
  app.org_group_set_counting(uuid, boolean), app.org_group_clear_my_checkins(uuid), app.org_group_members_on_seat_end(),
  app.org_group_schedule_set(uuid, int[], date[]), app.org_group_checkin(uuid, int, text), app.org_group_checkin_counts(uuid, int),
  app.my_org_groups(), app.my_joinable_org_groups(), app.my_led_org_groups(), app.org_group_list(uuid), app.org_group_leader_view(uuid),
  app.facilitator_guide_save(uuid, jsonb, text), app.facilitator_guide_approve(uuid), app.facilitator_guide_withdraw(uuid, text),
  app.org_group_guide(uuid), app.org_group_report_concern(uuid, text, boolean), app.org_monthly_report(uuid, date),
  app.org_group_units(uuid), app.org_licence_group_titles(uuid), app.org_group_role_state(uuid, text)
  from public, anon, authenticated;
revoke execute on function
  public.org_group_create(uuid, text, uuid, date, int, time), public.org_group_update(uuid, text, date, int, time, text),
  public.org_group_appoint(uuid, uuid, text), public.org_group_unappoint(uuid, text), public.org_group_join(uuid), public.org_group_leave(uuid), public.org_group_decline_offer(uuid),
  public.org_group_set_counting(uuid, boolean), public.org_group_clear_my_checkins(uuid),
  public.org_group_schedule_set(uuid, int[], date[]), public.org_group_checkin(uuid, int, text), public.org_group_checkin_counts(uuid, int),
  public.my_org_groups(), public.my_joinable_org_groups(), public.my_led_org_groups(), public.org_group_list(uuid), public.org_group_leader_view(uuid),
  public.facilitator_guide_save(uuid, jsonb, text), public.facilitator_guide_approve(uuid), public.facilitator_guide_withdraw(uuid, text),
  public.org_group_guide(uuid), public.org_group_report_concern(uuid, text, boolean), public.org_monthly_report(uuid, date),
  public.org_group_units(uuid), public.org_licence_group_titles(uuid)
  from public, anon, authenticated;

-- Policies call these.
grant execute on function app.is_group_member(uuid), app.is_group_leader(uuid), app.org_group_role(uuid) to authenticated, service_role;
-- Signed-in callers. Each function checks the caller's role itself.
grant execute on function
  app.org_group_create(uuid, text, uuid, date, int, time), app.org_group_update(uuid, text, date, int, time, text),
  app.org_group_appoint(uuid, uuid, text), app.org_group_unappoint(uuid, text), app.org_group_join(uuid), app.org_group_leave(uuid), app.org_group_decline_offer(uuid),
  app.org_group_set_counting(uuid, boolean), app.org_group_clear_my_checkins(uuid),
  app.org_group_schedule_set(uuid, int[], date[]), app.org_group_checkin(uuid, int, text), app.org_group_checkin_counts(uuid, int),
  app.my_org_groups(), app.my_joinable_org_groups(), app.my_led_org_groups(), app.org_group_list(uuid), app.org_group_leader_view(uuid),
  app.facilitator_guide_save(uuid, jsonb, text), app.facilitator_guide_approve(uuid), app.facilitator_guide_withdraw(uuid, text),
  app.org_group_guide(uuid), app.org_group_report_concern(uuid, text, boolean), app.org_monthly_report(uuid, date),
  public.org_group_create(uuid, text, uuid, date, int, time), public.org_group_update(uuid, text, date, int, time, text),
  public.org_group_appoint(uuid, uuid, text), public.org_group_unappoint(uuid, text), public.org_group_join(uuid), public.org_group_leave(uuid), public.org_group_decline_offer(uuid),
  public.org_group_set_counting(uuid, boolean), public.org_group_clear_my_checkins(uuid),
  public.org_group_schedule_set(uuid, int[], date[]), public.org_group_checkin(uuid, int, text), public.org_group_checkin_counts(uuid, int),
  public.my_org_groups(), public.my_joinable_org_groups(), public.my_led_org_groups(), public.org_group_list(uuid), public.org_group_leader_view(uuid),
  public.facilitator_guide_save(uuid, jsonb, text), public.facilitator_guide_approve(uuid), public.facilitator_guide_withdraw(uuid, text),
  public.org_group_guide(uuid), public.org_group_report_concern(uuid, text, boolean), public.org_monthly_report(uuid, date),
  public.org_group_units(uuid), public.org_licence_group_titles(uuid),
  app.org_group_units(uuid), app.org_licence_group_titles(uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 12. Row level security. Reads only; every write goes through a function.
-- ---------------------------------------------------------------------------
alter table public.org_groups          enable row level security;
alter table public.org_group_members   enable row level security;
alter table public.org_group_schedule  enable row level security;
alter table public.org_group_checkins  enable row level security;
alter table public.facilitator_guides  enable row level security;

revoke all on public.org_groups, public.org_group_members, public.org_group_schedule, public.org_group_checkins,
  public.facilitator_guides from anon, authenticated;

-- org_groups: the organisation's group readers, staff, and anyone with a
-- place (or an offer) in the group.
grant select on public.org_groups to authenticated;
create policy org_groups_read on public.org_groups for select to authenticated
  using ((select app.org_can(org_id, 'groups', 'read')) or (select app.is_staff()) or (select app.is_group_member(id)));

-- org_group_members: your own rows only. Staff read all. Leaders and owners
-- get numbers through the functions above, never the list.
grant select (id, group_id, user_id, role, accepted_at, offered_role, offered_at, count_checkins, left_at, left_reason)
  on public.org_group_members to authenticated;
create policy org_group_members_read on public.org_group_members for select to authenticated
  using (user_id = (select app.uid()) or (select app.is_staff()));

-- org_group_schedule: the group's people, its organisation and staff.
grant select on public.org_group_schedule to authenticated;
create policy org_group_schedule_read on public.org_group_schedule for select to authenticated
  using ((select app.is_group_member(group_id)) or (select app.is_staff())
         or exists (select 1 from public.org_groups g where g.id = group_id and (select app.org_can(g.org_id, 'groups', 'read'))));

-- org_group_checkins: your own rows only. Not leaders, not owners, not staff.
grant select on public.org_group_checkins to authenticated;
create policy org_group_checkins_read on public.org_group_checkins for select to authenticated
  using (user_id = (select app.uid()));

-- facilitator_guides: staff only; leaders read through app.org_group_guide.
grant select on public.facilitator_guides to authenticated;
create policy facilitator_guides_read on public.facilitator_guides for select to authenticated
  using ((select app.is_staff()));

grant select, insert, update, delete on public.org_groups, public.org_group_members, public.org_group_schedule,
  public.org_group_checkins, public.facilitator_guides to service_role;
