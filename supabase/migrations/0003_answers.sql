-- 0003 Answers: enrolments, sealed answers and progress events (T3 autosave,
-- F-134 sealed storage, F-018 no streaks, F-020 ids and timestamps only).
--
-- Same rules as 0001 and 0002. Every table has RLS on. Grants to anon and
-- authenticated are revoked for the new tables and given back table by table.
-- Policies call the app.* helpers as (select app.fn(...)).
--
-- The shape of trust here:
--   * A reader owns an enrolment. They read and update their own rows and may
--     start one only on a public workbook, pinned to its current version.
--   * Answers are opaque. The sealed column holds the "v2.<key_id>.<b64>"
--     string from packages/seal and nothing else. There is no plaintext
--     column. Clients can read their own rows but have no insert or update
--     grant at all: the only write path is the server route, which checks the
--     session and ownership under RLS, seals the value with AAD bound to
--     user, tenant and field, then writes with the service role.
--   * Progress events are ids and timestamps. Never an answer, never a
--     feeling. Readers insert and read their own; nothing updates or deletes.

-- ---------------------------------------------------------------------------
-- Enrolments: a reader started a workbook on a tenant. Pins the published
-- version so content changes never move under a reader's answers.
-- ---------------------------------------------------------------------------
create table public.enrolments (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  tenant_id      uuid not null references public.tenants(id),
  workbook_id    uuid not null references public.workbooks(id),
  version_id     uuid not null references public.workbook_versions(id),
  status         text not null default 'active' check (status in ('active','finished','paused')),
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  last_opened_at timestamptz not null default now(),
  unique (user_id, tenant_id, workbook_id)
);
create index enrolments_workbook_idx on public.enrolments(workbook_id);
create index enrolments_version_idx on public.enrolments(version_id);

-- ---------------------------------------------------------------------------
-- Answers: one row per enrolment and field. field is the AAD scope field,
-- for example "exercise:plan_first_step.what" or "checkin:3.mood". sealed is
-- the whole sealed string; key_id is copied out of it so a rotation job can
-- find rows on an old key without unsealing anything. Last write wins.
--
-- The unique constraint's index leads on enrolment_id, so it already serves
-- the "all answers for this enrolment" read; no second index is needed.
-- ---------------------------------------------------------------------------
create table public.answers (
  id           uuid primary key default gen_random_uuid(),
  enrolment_id uuid not null references public.enrolments(id) on delete cascade,
  field        text not null check (length(field) between 1 and 200),
  sealed       text not null check (sealed ~ '^v[12]\.'),
  key_id       text not null check (length(key_id) between 1 and 32),
  updated_at   timestamptz not null default now(),
  unique (enrolment_id, field)
);

-- ---------------------------------------------------------------------------
-- Progress events: what happened and when, by id only (F-020). ref is a unit
-- number or an exercise id, never free text.
--
-- No streak, run or missed-day count is ever derived from this table (F-018).
-- Totals are fine ("you have done 12 exercises"); anything that counts days in
-- a row or days skipped is not, and no view or function here may add one.
-- ---------------------------------------------------------------------------
create table public.progress_events (
  id           uuid primary key default gen_random_uuid(),
  enrolment_id uuid not null references public.enrolments(id) on delete cascade,
  kind         text not null check (kind in ('unit_opened','step_done','checkin_done','daily_check_done','toolkit_used','finished')),
  ref          text check (ref is null or ref ~ '^[a-z0-9][a-z0-9_:~.-]{0,79}$'),
  at           timestamptz not null default now()
);
create index progress_events_enrolment_idx on public.progress_events(enrolment_id, at);

-- ---------------------------------------------------------------------------
-- Helpers. Security definer, stable, search_path pinned, as in 0002.
-- ---------------------------------------------------------------------------

-- Does the signed-in user own this enrolment?
create or replace function app.enrolment_owner(p_enrolment uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.enrolments e
    where e.id = p_enrolment and e.user_id = app.uid())
$$;

-- The version a new enrolment must pin: the workbook's current published one.
create or replace function app.workbook_current_version(p_workbook uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select current_version_id from public.workbooks where id = p_workbook
$$;

-- ---------------------------------------------------------------------------
-- Guard: a client may change an enrolment's status and timestamps, never who
-- it belongs to or what it pins. Runs as the caller so server code passes.
-- ---------------------------------------------------------------------------
create or replace function app.guard_enrolment_pins() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated') and (
       new.user_id     is distinct from old.user_id
    or new.tenant_id   is distinct from old.tenant_id
    or new.workbook_id is distinct from old.workbook_id
    or new.version_id  is distinct from old.version_id
    or new.started_at  is distinct from old.started_at) then
    raise exception 'an enrolment keeps its owner, tenant, workbook and version' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger enrolments_pins_guard before update on public.enrolments
  for each row execute function app.guard_enrolment_pins();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.enrolments      enable row level security;
alter table public.answers         enable row level security;
alter table public.progress_events enable row level security;

revoke all on public.enrolments, public.answers, public.progress_events from anon, authenticated;

-- enrolments: own rows, plus staff read. Insert only for yourself, only on a
-- public workbook, only pinned to its current version. Update own rows; the
-- guard keeps the pins. No delete: an enrolment is paused or finished.
grant select, insert, update on public.enrolments to authenticated;
create policy enrolments_read on public.enrolments for select to authenticated
  using (user_id = (select app.uid()) or (select app.is_staff()));
create policy enrolments_insert on public.enrolments for insert to authenticated
  with check (user_id = (select app.uid())
          and (select app.workbook_is_public(workbook_id))
          and version_id = (select app.workbook_current_version(workbook_id)));
create policy enrolments_update on public.enrolments for update to authenticated
  using (user_id = (select app.uid()))
  with check (user_id = (select app.uid()));

-- answers: the owner reads ciphertext. No client insert, update or delete.
-- The service role writes after the route's checks. The explicit grant to
-- service_role is what Supabase gives by default; on plain Postgres (the
-- test harness) it has to be said.
grant select on public.answers to authenticated;
grant select, insert, update, delete on public.answers to service_role;
create policy answers_read on public.answers for select to authenticated
  using ((select app.enrolment_owner(enrolment_id)));

-- progress_events: the owner inserts and reads. No update or delete grant.
grant select, insert on public.progress_events to authenticated;
create policy progress_events_read on public.progress_events for select to authenticated
  using ((select app.enrolment_owner(enrolment_id)));
create policy progress_events_insert on public.progress_events for insert to authenticated
  with check ((select app.enrolment_owner(enrolment_id)));
