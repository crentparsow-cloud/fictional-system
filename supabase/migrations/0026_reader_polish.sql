-- 0026 Reader polish (F-015 parity, F-022, F-025).
--
-- Depends on 0001 to 0025 only (auth.users, public.enrolments,
-- public.workbooks, public.progress_events, public.account_deletion_requests,
-- app.uid). Same rules as before: RLS on every table, grants to anon and
-- authenticated revoked and given back narrowly, helpers security definer
-- with search_path pinned, thin public wrappers that run as the caller.
--
-- 1. "I have read this" for higher-tier workbooks (F-022), kept server side.
--    It was kept on the device only, so a new phone or a cleared browser
--    meant reading the note again, and nothing showed that the reader had
--    seen it. One row per enrolment and pinned version: a new version may
--    carry a new note, so it is asked again. The row holds ids and a time,
--    never an answer. It goes with the enrolment (on delete cascade), so
--    account deletion removes it. Written only by
--    app.acknowledge_higher_tier() for app.uid() on their own enrolment.
--
-- 2. Read only while an account deletion is pending (F-025). The old app
--    said "until then it's read-only"; the reader app now shows that, and
--    the answers route refuses writes. Progress events are written through
--    the reader's own client, so the database refuses them here as well,
--    for inserts made by the signed-in owner. Inserts with no signed-in
--    user (the service role, tests, jobs) are not touched.
--
-- Error codes, for the server to map:
--   AKA01  not allowed (not signed in, or not the reader's own enrolment)
--   AKA03  the workbook is not higher tier, so there is nothing to acknowledge
--   AKR01  read only: an account deletion is pending

-- ---------------------------------------------------------------------------
-- 1. Higher-tier acknowledgement
-- ---------------------------------------------------------------------------
create table public.enrolment_acknowledgements (
  enrolment_id     uuid not null references public.enrolments(id) on delete cascade,
  version_id       uuid not null references public.workbook_versions(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  acknowledged_at  timestamptz not null default now(),
  primary key (enrolment_id, version_id)
);
create index enrolment_acknowledgements_user_idx on public.enrolment_acknowledgements (user_id);

alter table public.enrolment_acknowledgements enable row level security;
revoke all on public.enrolment_acknowledgements from anon, authenticated;
grant select (enrolment_id, version_id, acknowledged_at) on public.enrolment_acknowledgements to authenticated;
create policy enrolment_acknowledgements_own on public.enrolment_acknowledgements for select to authenticated
  using (user_id = (select app.uid()));

-- Record it for the enrolment's pinned version. Idempotent: a second press
-- keeps the first time. Returns when the reader acknowledged.
create or replace function app.acknowledge_higher_tier(p_enrolment uuid) returns timestamptz
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid     uuid := app.uid();
  v_version uuid;
  v_tier    text;
  v_at      timestamptz;
begin
  if v_uid is null then
    raise exception 'sign in first' using errcode = 'AKA01';
  end if;
  select e.version_id, w.safety_tier into v_version, v_tier
    from public.enrolments e join public.workbooks w on w.id = e.workbook_id
   where e.id = p_enrolment and e.user_id = v_uid;
  if v_version is null then
    raise exception 'not your enrolment' using errcode = 'AKA01';
  end if;
  if v_tier is distinct from 'higher' then
    raise exception 'nothing to acknowledge' using errcode = 'AKA03';
  end if;
  insert into public.enrolment_acknowledgements (enrolment_id, version_id, user_id)
  values (p_enrolment, v_version, v_uid)
  on conflict (enrolment_id, version_id) do nothing;
  select a.acknowledged_at into v_at from public.enrolment_acknowledgements a
   where a.enrolment_id = p_enrolment and a.version_id = v_version;
  return v_at;
end $$;

create or replace function public.acknowledge_higher_tier(p_enrolment uuid) returns timestamptz
language sql volatile security invoker set search_path = '' as $$
  select app.acknowledge_higher_tier(p_enrolment)
$$;

-- ---------------------------------------------------------------------------
-- 2. Read only while a deletion is pending
-- ---------------------------------------------------------------------------
-- Pending or due: asked for, not cancelled, not yet completed.
create or replace function app.account_read_only(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.account_deletion_requests d
                  where d.user_id = p_user and d.cancelled_at is null and d.completed_at is null)
$$;

-- The signed-in reader's own state only. app.account_read_only(uuid) takes
-- any user and is not granted to clients.
create or replace function app.my_account_read_only() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(app.account_read_only(app.uid()), false)
$$;

create or replace function public.my_account_read_only() returns boolean
language sql stable security invoker set search_path = '' as $$
  select app.my_account_read_only()
$$;

create or replace function app.progress_events_read_only() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app.uid();
begin
  if v_uid is not null
     and exists (select 1 from public.enrolments e where e.id = new.enrolment_id and e.user_id = v_uid)
     and app.account_read_only(v_uid) then
    raise exception 'read only while your account deletion is pending' using errcode = 'AKR01';
  end if;
  return new;
end $$;
create trigger progress_events_read_only before insert on public.progress_events
  for each row execute function app.progress_events_read_only();

-- ---------------------------------------------------------------------------
-- Execute grants
-- ---------------------------------------------------------------------------
revoke execute on function app.acknowledge_higher_tier(uuid), public.acknowledge_higher_tier(uuid),
  app.account_read_only(uuid), app.my_account_read_only(), public.my_account_read_only(), app.progress_events_read_only()
  from public, anon, authenticated;
grant execute on function app.acknowledge_higher_tier(uuid), public.acknowledge_higher_tier(uuid),
  app.my_account_read_only(), public.my_account_read_only()
  to authenticated;
