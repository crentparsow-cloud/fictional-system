-- 0061 Organisations, Phase B: the group leader kit source (9.2) and the
-- monthly report email (9.3).
--
-- Depends on 0001 to 0060. Nothing earlier is edited or replaced.
--
-- FOR OTHER BUILDERS
-- app.org_group_kit_source(group)  the published content of the version a
--   group pinned: the start section and every unit section, as they are in
--   public.workbook_sections. The web app builds the talk outline, the
--   discussion guide and the welcome slides from it (lib/group-kit.ts).
--   Only leaders and co-leaders of the group and staff may call it. It reads
--   workbook content only. It never touches answers, enrolments or members,
--   so the kit cannot show anything a member wrote.
-- public.org_profiles.monthly_report  on by default. The owner can switch the
--   monthly email off from the reports page (app.org_report_pref_set).
-- app.org_report_digest(month)  service role only. One row per customer
--   organisation with a licence that overlapped the month: seats taken at the
--   month's end, people who started a workbook that month, and how many groups
--   had at least the reporting threshold of members. Counts under the
--   threshold (never below five, 0028) come back as null with shown =
--   'fewer_than'. No group name, no title, no person.
-- app.org_report_recipients(org)  service role only. Owners and finance
--   members with an address, for an organisation that has not switched the
--   email off. Never a seat holder.
-- The cron route is /api/org/monthly-report (vercel.json), once a month, for
-- the month before. Each recipient is claimed in email_claims per month, so a
-- second run sends nothing new.

-- ---------------------------------------------------------------------------
-- 1. Leader kit source
-- ---------------------------------------------------------------------------
create or replace function app.org_group_kit_source(p_group uuid) returns jsonb
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
  return jsonb_build_object(
    'workbook_title', (select w.title from public.workbooks w where w.id = g.workbook_id),
    'faith', g.faith,
    'start', (select s.body from public.workbook_sections s where s.version_id = g.version_id and s.kind = 'start'),
    'units', coalesce((select jsonb_agg(s.body order by s.unit_number)
                         from public.workbook_sections s where s.version_id = g.version_id and s.kind = 'unit'), '[]'::jsonb));
end $$;

create or replace function public.org_group_kit_source(p_group uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$ select app.org_group_kit_source(p_group) $$;

-- ---------------------------------------------------------------------------
-- 2. The monthly report
-- ---------------------------------------------------------------------------
alter table public.org_profiles add column monthly_report boolean not null default true;

create or replace function app.org_report_pref_set(p_org uuid, p_on boolean) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
begin
  if app.uid() is null or not app.is_org_member(p_org, array['owner']) then
    raise exception 'not allowed' using errcode = 'AKO01';
  end if;
  perform app.require_role_mfa(p_org);
  if p_on is null then raise exception 'org_invalid: choice' using errcode = 'AKO02'; end if;
  insert into public.org_profiles (org_id, monthly_report) values (p_org, p_on)
  on conflict (org_id) do update set monthly_report = excluded.monthly_report;
  perform app.audit('org.monthly_report_pref', 'organisation:' || p_org::text, null, null, p_org, null,
    jsonb_build_object('monthly_report', p_on));
  return p_on;
end $$;

create or replace function app.org_report_digest(p_month date)
returns table (org_id uuid, organisation_name text, seats_taken int, people_started int, started_shown text, groups_meeting int, threshold int)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_t    int := app.org_group_threshold();
  v_this date := date_trunc('month', app.london_today())::date;
  v_from timestamptz;
  v_to   timestamptz;
  o      record;
  v_seats int;
  v_start int;
  v_groups int;
begin
  if not app.is_service_role() then
    raise exception 'only the service role builds the monthly digest' using errcode = 'AKO01';
  end if;
  if p_month is null or p_month <> date_trunc('month', p_month)::date or p_month >= v_this then
    raise exception 'org_invalid: month (a complete month)' using errcode = 'AKO02';
  end if;
  v_from := (p_month::timestamp) at time zone 'Europe/London';
  v_to   := ((p_month + interval '1 month')::timestamp) at time zone 'Europe/London';

  for o in
    select og.id, og.display_name from public.organisations og
      join public.org_profiles p on p.org_id = og.id
     where app.is_customer_org(og.id) and og.status not in ('suspended','closed') and p.monthly_report
       and exists (select 1 from public.org_licences l where l.org_id = og.id and l.starts_at < v_to and l.ends_at > v_from)
     order by og.created_at, og.id
  loop
    select count(*) into v_seats from public.org_seats s
      join public.org_licences l on l.id = s.licence_id
     where l.org_id = o.id and s.claimed_at < v_to and (s.released_at is null or s.released_at >= v_to);

    select count(distinct s.user_id) into v_start from public.org_seats s
      join public.org_licences l on l.id = s.licence_id
     where l.org_id = o.id and s.claimed_at < v_to and (s.released_at is null or s.released_at >= v_from)
       and exists (select 1 from public.enrolments e
                    where e.user_id = s.user_id and e.tenant_id = l.tenant_id
                      and e.started_at >= greatest(s.claimed_at, v_from) and e.started_at < v_to
                      and app.org_licence_scope_has(l.id, e.workbook_id));

    select count(*) into v_groups from public.org_groups g
     where g.org_id = o.id and g.created_at < v_to and g.status <> 'archived'
       and (select count(*) from public.org_group_members m
             where m.group_id = g.id and m.accepted_at is not null and m.accepted_at < v_to
               and (m.left_at is null or m.left_at >= v_to)) >= v_t;

    return query select o.id, o.display_name, v_seats,
      case when v_start >= v_t then v_start end,
      case when v_start >= v_t then 'exact' else 'fewer_than' end,
      v_groups, v_t;
  end loop;
end $$;

create or replace function app.org_report_recipients(p_org uuid)
returns table (user_id uuid, email text, role text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_service_role() then
    raise exception 'only the service role reads report recipients' using errcode = 'AKO01';
  end if;
  return query
    select m.user_id, lower(u.email::text), m.role
      from public.org_members m
      join auth.users u on u.id = m.user_id
      join public.org_profiles p on p.org_id = m.org_id
     where m.org_id = p_org and m.role in ('owner','finance') and u.email is not null and p.monthly_report
     order by m.role, 2;
end $$;

create or replace function public.org_report_pref_set(p_org uuid, p_on boolean) returns boolean
language sql volatile security invoker set search_path = '' as $$ select app.org_report_pref_set(p_org, p_on) $$;
create or replace function public.org_report_digest(p_month date)
returns table (org_id uuid, organisation_name text, seats_taken int, people_started int, started_shown text, groups_meeting int, threshold int)
language sql stable security invoker set search_path = '' as $$ select * from app.org_report_digest(p_month) $$;
create or replace function public.org_report_recipients(p_org uuid)
returns table (user_id uuid, email text, role text)
language sql stable security invoker set search_path = '' as $$ select * from app.org_report_recipients(p_org) $$;

revoke execute on function
  app.org_group_kit_source(uuid), app.org_report_pref_set(uuid, boolean), app.org_report_digest(date), app.org_report_recipients(uuid),
  public.org_group_kit_source(uuid), public.org_report_pref_set(uuid, boolean), public.org_report_digest(date), public.org_report_recipients(uuid)
  from public, anon, authenticated;
grant execute on function
  app.org_group_kit_source(uuid), app.org_report_pref_set(uuid, boolean),
  public.org_group_kit_source(uuid), public.org_report_pref_set(uuid, boolean)
  to authenticated;
grant execute on function
  app.org_report_digest(date), app.org_report_recipients(uuid), public.org_report_digest(date), public.org_report_recipients(uuid)
  to service_role;
