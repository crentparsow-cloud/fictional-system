-- 0016 Review and operations: the staff review queue (F-084), the release
-- gate with sign-off records and the two-person override (F-085, F-155),
-- first-party funnel counts (F-141), operational alerts (F-142) and the
-- support inbox (F-090).
--
-- Same rules as 0001 to 0012. Depends on 0001 to 0012 only. Every table has
-- RLS on, with grants to anon and authenticated revoked and given back
-- narrowly. Every function is security definer with search_path pinned to
-- ''. Functions an RPC client may call have execute revoked from public first
-- and granted back to the role that needs it.
--
-- Status tolerance. Workbook status lives on public.workbooks (0002). Other
-- migrations may add statuses for author submission. Nothing here lists every
-- status: the queue reads whatever is not draft, live, paused or retired, and
-- the gate only cares about moves into approved and live.
--
-- Nothing in this file stores or reads reader answers. Funnel counts carry an
-- event name, a day, a tenant and at most a workbook id. Ops events carry a
-- kind, a source and a short code, never a message or a form value.
--
-- Error codes, for server code to map:
--   AKR01  release refused: a requirement is not met and no approved override covers it
--   AKR02  the version changed since it was validated or signed (content hash differs)
--   AKR03  an override needs a second, different member of staff
--   AKH01  support message: consent not given
--   AKH02  support message: a field failed validation (the message names the field)
--   AKH29  support message: rate limited

-- ===========================================================================
-- 1. Review queue (F-084)
-- ===========================================================================

-- Validator results, one row each time the result for a version changes. The
-- server runs @akana/validate on the version JSON and records the counts
-- against the content hash it validated. The findings themselves are shown
-- live and not stored.
create table public.review_validations (
  id            bigint generated always as identity primary key,
  version_id    uuid not null references public.workbook_versions(id) on delete cascade,
  content_hash  text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  ok            boolean not null,
  error_count   int not null check (error_count >= 0),
  warning_count int not null check (warning_count >= 0),
  validated_by  uuid references auth.users(id) on delete set null,
  validated_at  timestamptz not null default now(),
  constraint review_validations_ok check (not ok or error_count = 0)
);
create index review_validations_version_idx on public.review_validations(version_id, validated_at desc);

-- One assignee per version under review.
create table public.review_assignments (
  version_id  uuid primary key references public.workbook_versions(id) on delete cascade,
  assignee    uuid not null references auth.users(id) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now()
);
create index review_assignments_assignee_idx on public.review_assignments(assignee);

-- Reviewer notes on a version: comments and send-back reasons. Notes are about
-- the workbook content, which staff already read; never reader answers.
create table public.review_notes (
  id         uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.workbook_versions(id) on delete cascade,
  author     uuid references auth.users(id) on delete set null,
  kind       text not null check (kind in ('comment','send_back')),
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index review_notes_version_idx on public.review_notes(version_id, created_at);

-- Reviewer roles: who may work the queue at all.
create or replace function app.is_reviewer() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_platform(array['owner','editor','safety_reviewer'])
$$;

-- Record a validator result for a version. The hash must be the version's
-- current hash, so a result can never be filed against other content. A row
-- is written only when the result differs from the latest one, so opening
-- the queue repeatedly does not grow the table. validated_at on the version
-- (0002) follows the latest result.
create or replace function public.record_validation(
  p_version uuid, p_content_hash text, p_ok boolean, p_errors int, p_warnings int
) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  v    public.workbook_versions%rowtype;
  last public.review_validations%rowtype;
begin
  if not app.is_reviewer() then
    raise exception 'only reviewers record validator results' using errcode = 'insufficient_privilege';
  end if;
  if p_version is null or p_ok is null or p_errors is null or p_warnings is null or p_errors < 0 or p_warnings < 0 then
    raise exception 'version, result and counts are required' using errcode = 'invalid_parameter_value';
  end if;
  if p_ok and p_errors > 0 then
    raise exception 'a result with errors cannot pass' using errcode = 'check_violation';
  end if;
  select * into v from public.workbook_versions where id = p_version;
  if not found then
    raise exception 'version % not found', p_version using errcode = 'no_data_found';
  end if;
  if p_content_hash is distinct from v.content_hash then
    raise exception 'the version changed since it was validated' using errcode = 'AKR02';
  end if;

  select * into last from public.review_validations where version_id = p_version order by validated_at desc, id desc limit 1;
  if found and last.content_hash = p_content_hash and last.ok = p_ok
     and last.error_count = p_errors and last.warning_count = p_warnings then
    return false;
  end if;

  insert into public.review_validations (version_id, content_hash, ok, error_count, warning_count, validated_by)
  values (p_version, p_content_hash, p_ok, p_errors, p_warnings, app.uid());
  update public.workbook_versions set validated_at = case when p_ok then now() else null end where id = p_version;
  return true;
end $$;

-- Staff who can be given a review, with the email the assignment note goes to.
create or replace function public.review_staff()
returns table (user_id uuid, email text, roles text[])
language sql stable security definer set search_path = '' as $$
  select r.user_id, u.email::text, array_agg(r.role order by r.role)
  from public.platform_roles r
  join auth.users u on u.id = r.user_id
  where app.is_reviewer() and r.role in ('owner','editor','safety_reviewer')
  group by r.user_id, u.email
  order by u.email
$$;

-- Assign a version to a reviewer. Returns the assignee's email so the server
-- can send the one assignment note (F-084). Owners and editors assign.
create or replace function public.review_assign(p_version uuid, p_assignee uuid)
returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_wb    public.workbooks%rowtype;
  v_email text;
  v_prev  uuid;
begin
  if not app.is_platform(array['owner','editor']) then
    raise exception 'only owners and editors assign reviews' using errcode = 'insufficient_privilege';
  end if;
  if p_version is null or p_assignee is null then
    raise exception 'version and assignee are required' using errcode = 'invalid_parameter_value';
  end if;
  select w.* into v_wb from public.workbooks w join public.workbook_versions v on v.workbook_id = w.id where v.id = p_version;
  if not found then
    raise exception 'version % not found', p_version using errcode = 'no_data_found';
  end if;
  if not exists (select 1 from public.platform_roles r where r.user_id = p_assignee and r.role in ('owner','editor','safety_reviewer')) then
    raise exception 'the assignee must be an owner, editor or safety reviewer' using errcode = 'check_violation';
  end if;
  select assignee into v_prev from public.review_assignments where version_id = p_version;

  insert into public.review_assignments (version_id, assignee, assigned_by)
  values (p_version, p_assignee, app.uid())
  on conflict (version_id) do update set assignee = excluded.assignee, assigned_by = excluded.assigned_by, assigned_at = now();

  perform app.audit('review.assigned', 'workbook_version:' || p_version::text, null, v_wb.tenant_id, v_wb.org_id,
    jsonb_build_object('assignee', v_prev), jsonb_build_object('assignee', p_assignee, 'code', v_wb.code));

  select u.email::text into v_email from auth.users u where u.id = p_assignee;
  return v_email;
end $$;

create or replace function public.review_add_note(p_version uuid, p_body text)
returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_id   uuid;
begin
  if not app.is_reviewer() then
    raise exception 'only reviewers add review notes' using errcode = 'insufficient_privilege';
  end if;
  if v_body is null or char_length(v_body) > 2000 then
    raise exception 'a note is required, 2000 characters or fewer' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.workbook_versions where id = p_version) then
    raise exception 'version % not found', p_version using errcode = 'no_data_found';
  end if;
  insert into public.review_notes (version_id, author, kind, body) values (p_version, app.uid(), 'comment', v_body)
  returning id into v_id;
  return v_id;
end $$;

-- Send a version back with a reason. The reason is kept as a note and in the
-- audit log. A workbook that is not on sale goes back to draft; a live,
-- paused or retired workbook keeps its status, because its published version
-- is not the one being sent back.
create or replace function public.review_send_back(p_version uuid, p_reason text)
returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  w        public.workbooks%rowtype;
  v_target text;
begin
  if not app.is_reviewer() then
    raise exception 'only reviewers send a version back' using errcode = 'insufficient_privilege';
  end if;
  if v_reason is null or char_length(v_reason) > 2000 then
    raise exception 'a reason is required, 2000 characters or fewer' using errcode = 'check_violation';
  end if;
  select w2.* into w from public.workbooks w2 join public.workbook_versions v on v.workbook_id = w2.id
  where v.id = p_version for update of w2;
  if not found then
    raise exception 'version % not found', p_version using errcode = 'no_data_found';
  end if;
  if exists (select 1 from public.workbook_versions where id = p_version and published_at is not null) then
    raise exception 'a published version cannot be sent back' using errcode = 'object_not_in_prerequisite_state';
  end if;

  v_target := case when w.status in ('live','paused','retired') then w.status else 'draft' end;
  if v_target is distinct from w.status then
    update public.workbooks set status = v_target where id = w.id;
  end if;
  insert into public.review_notes (version_id, author, kind, body) values (p_version, app.uid(), 'send_back', v_reason);

  perform app.audit('review.sent_back', 'workbook_version:' || p_version::text, v_reason, w.tenant_id, w.org_id,
    jsonb_build_object('code', w.code, 'status', w.status), jsonb_build_object('code', w.code, 'status', v_target));
  return v_target;
end $$;

-- ===========================================================================
-- 2. Release gate (F-085, F-155)
-- ===========================================================================

-- Sign-offs, each against the content hash it saw. A sign-off on an older
-- hash does not count for newer content. Rows are never updated or deleted.
--   editor       an Akana editor (owner or editor role) signs for themselves
--   author       the author, recorded by staff or by an organisation member
--   publisher    the publisher, recorded the same way
--   safety       a safety reviewer signs for themselves (wellbeing tiers)
--   clinician    a named clinician, recorded by staff (higher tier)
--   theological  a named theological reviewer with their tradition and the
--                tradition label they approve (Faith and Spirituality, F-155)
create table public.release_signoffs (
  id                 uuid primary key default gen_random_uuid(),
  version_id         uuid not null references public.workbook_versions(id) on delete cascade,
  content_hash       text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  kind               text not null check (kind in ('editor','author','publisher','safety','clinician','theological')),
  signer_name        text not null check (char_length(signer_name) between 1 and 200),
  reviewer_tradition text check (reviewer_tradition in ('protestant','catholic','orthodox','anglican','general_christian')),
  tradition_label    text check (tradition_label in ('protestant','catholic','orthodox','general_christian')),
  note               text check (char_length(note) <= 500),
  recorded_by        uuid references auth.users(id) on delete set null,
  recorded_at        timestamptz not null default now(),
  constraint release_signoffs_tradition check ((kind = 'theological') = (reviewer_tradition is not null and tradition_label is not null))
);
create index release_signoffs_version_idx on public.release_signoffs(version_id, content_hash);

-- The two-person override: one member of staff asks, a different one
-- approves, and it is used once, for the same content hash, within 7 days.
create table public.release_overrides (
  id           uuid primary key default gen_random_uuid(),
  version_id   uuid not null references public.workbook_versions(id) on delete cascade,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  unmet        text[] not null check (cardinality(unmet) >= 1),
  reason       text not null check (char_length(reason) between 1 and 1000),
  requested_by uuid not null references auth.users(id),
  requested_at timestamptz not null default now(),
  approved_by  uuid references auth.users(id),
  approved_at  timestamptz,
  used_at      timestamptz,
  constraint release_overrides_two_people check (approved_by is null or approved_by <> requested_by),
  constraint release_overrides_approved check ((approved_by is null) = (approved_at is null))
);
create index release_overrides_version_idx on public.release_overrides(version_id);

-- A workbook is on the Faith and Spirituality shelf when its genre is faith
-- (if a later migration adds that genre) or its theme sits on that shelf.
create or replace function app.is_faith_workbook(p_workbook uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workbooks w
    left join public.themes t on t.id = w.theme_id
    where w.id = p_workbook and (w.genre_id = 'faith' or t.shelf_id = 'faith-and-spirituality'))
$$;
revoke execute on function app.is_faith_workbook(uuid) from public, anon;

-- The licence requirement: a licence or public-domain reference on the
-- workbook, or, once the author onboarding migration has added it, an active
-- licence for the book (app.book_has_active_licence). Looked up by name at
-- run time so this file depends on 0001 to 0012 only.
create or replace function app.release_licence_met(p_workbook uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_ok boolean;
begin
  select coalesce(btrim(w.licence_ref), '') <> '' into v_ok from public.workbooks w where w.id = p_workbook;
  if coalesce(v_ok, false) then return true; end if;
  if to_regprocedure('app.book_has_active_licence(uuid)') is not null then
    execute 'select app.book_has_active_licence(w.book_id) from public.workbooks w where w.id = $1' into v_ok using p_workbook;
    return coalesce(v_ok, false);
  end if;
  return false;
end $$;
revoke execute on function app.release_licence_met(uuid) from public, anon;

-- Every gate requirement for a version, whether it applies and whether it is
-- met. Sign-offs count only against the version's current content hash.
create or replace function app.release_requirements(p_version uuid)
returns table (requirement text, required boolean, met boolean)
language sql stable security definer set search_path = '' as $$
  with v as (
    select v.id, v.content_hash, w.id as workbook_id, w.safety_tier
    from public.workbook_versions v join public.workbooks w on w.id = v.workbook_id
    where v.id = p_version
  ), s as (
    select kind from public.release_signoffs x, v where x.version_id = v.id and x.content_hash = v.content_hash
  )
  select 'validator', true,
         exists (select 1 from v where (select r.ok from public.review_validations r
                                         where r.version_id = v.id and r.content_hash = v.content_hash
                                         order by r.validated_at desc, r.id desc limit 1))
  from v
  union all select 'editor', true, exists (select 1 from s where kind = 'editor') from v
  union all select 'author_or_publisher', true, exists (select 1 from s where kind in ('author','publisher')) from v
  union all select 'safety', v.safety_tier in ('standard','higher'), exists (select 1 from s where kind = 'safety') from v
  union all select 'clinician', v.safety_tier = 'higher', exists (select 1 from s where kind = 'clinician') from v
  union all select 'theological', app.is_faith_workbook(v.workbook_id), exists (select 1 from s where kind = 'theological') from v
  union all select 'licence', true, app.release_licence_met(v.workbook_id) from v
$$;
revoke execute on function app.release_requirements(uuid) from public, anon;

create or replace function app.release_unmet(p_version uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(requirement order by requirement), '{}'::text[])
  from app.release_requirements(p_version) where required and not met
$$;
revoke execute on function app.release_unmet(uuid) from public, anon;

-- For the queue: staff read the requirements of any version.
create or replace function public.release_requirements(p_version uuid)
returns table (requirement text, required boolean, met boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_staff() then
    raise exception 'only staff read release requirements' using errcode = 'insufficient_privilege';
  end if;
  return query select r.requirement, r.required, r.met from app.release_requirements(p_version) r;
end $$;

-- Record a sign-off against the version's current hash. Who may record which
-- kind is set out on the table above.
create or replace function public.record_signoff(
  p_version            uuid,
  p_kind               text,
  p_signer_name        text,
  p_reviewer_tradition text default null,
  p_tradition_label    text default null,
  p_note               text default null
) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v      public.workbook_versions%rowtype;
  w      public.workbooks%rowtype;
  v_name text := nullif(btrim(coalesce(p_signer_name, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_rt   text := nullif(btrim(coalesce(p_reviewer_tradition, '')), '');
  v_tl   text := nullif(btrim(coalesce(p_tradition_label, '')), '');
  v_id   uuid;
begin
  if p_version is null or p_kind is null or p_kind not in ('editor','author','publisher','safety','clinician','theological') then
    raise exception 'a version and a sign-off kind are required' using errcode = 'invalid_parameter_value';
  end if;
  select * into v from public.workbook_versions where id = p_version;
  if not found then
    raise exception 'version % not found', p_version using errcode = 'no_data_found';
  end if;
  select * into w from public.workbooks where id = v.workbook_id;

  if p_kind = 'editor' and not app.is_platform(array['owner','editor']) then
    raise exception 'an editor sign-off is given by an owner or editor' using errcode = 'insufficient_privilege';
  elsif p_kind = 'safety' and not app.is_platform(array['safety_reviewer']) then
    raise exception 'a safety sign-off is given by a safety reviewer' using errcode = 'insufficient_privilege';
  elsif p_kind in ('clinician','theological') and not app.is_platform(array['owner','editor']) then
    raise exception 'clinician and theological sign-offs are recorded by an owner or editor' using errcode = 'insufficient_privilege';
  elsif p_kind in ('author','publisher') and not (app.is_platform(array['owner','editor']) or app.org_can(w.org_id, 'workbooks', 'write')) then
    raise exception 'author and publisher sign-offs are recorded by staff or the owning organisation' using errcode = 'insufficient_privilege';
  end if;

  if v_name is null or char_length(v_name) > 200 then
    raise exception 'the name of the person signing is required, 200 characters or fewer' using errcode = 'check_violation';
  end if;
  if char_length(v_note) > 500 then
    raise exception 'the note must be 500 characters or fewer' using errcode = 'check_violation';
  end if;
  if p_kind = 'theological' then
    if v_rt is null or v_rt not in ('protestant','catholic','orthodox','anglican','general_christian') then
      raise exception 'the reviewer''s tradition is required' using errcode = 'check_violation';
    end if;
    if v_tl is null or v_tl not in ('protestant','catholic','orthodox','general_christian') then
      raise exception 'the tradition label being approved is required' using errcode = 'check_violation';
    end if;
    -- A title labelled for one tradition needs a reviewer from that tradition (F-155).
    if v_tl <> 'general_christian' and v_tl <> v_rt then
      raise exception 'a % label needs a reviewer from that tradition', v_tl using errcode = 'check_violation';
    end if;
  else
    v_rt := null;
    v_tl := null;
  end if;

  insert into public.release_signoffs (version_id, content_hash, kind, signer_name, reviewer_tradition, tradition_label, note, recorded_by)
  values (p_version, v.content_hash, p_kind, v_name, v_rt, v_tl, v_note, app.uid())
  returning id into v_id;

  perform app.audit('release.signoff', 'workbook_version:' || p_version::text, null, w.tenant_id, w.org_id, null,
    jsonb_build_object('kind', p_kind, 'signer_name', v_name, 'content_hash', v.content_hash, 'code', w.code,
                       'reviewer_tradition', v_rt, 'tradition_label', v_tl));
  return v_id;
end $$;

-- The licence or public-domain record for a workbook (F-085, F-118). For a
-- classic the reference is the house record, for example
-- 'public-domain:/public-domain/AK-XXXXX'.
create or replace function public.set_licence_record(p_workbook uuid, p_ref text)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  w     public.workbooks%rowtype;
  v_ref text := nullif(btrim(coalesce(p_ref, '')), '');
begin
  if not app.is_platform(array['owner','editor']) then
    raise exception 'only owners and editors record a licence' using errcode = 'insufficient_privilege';
  end if;
  if v_ref is null or char_length(v_ref) > 300 then
    raise exception 'a licence reference is required, 300 characters or fewer' using errcode = 'check_violation';
  end if;
  select * into w from public.workbooks where id = p_workbook for update;
  if not found then
    raise exception 'workbook % not found', p_workbook using errcode = 'no_data_found';
  end if;
  update public.workbooks set licence_ref = v_ref where id = w.id;
  perform app.audit('release.licence_record', 'workbook:' || w.id::text, null, w.tenant_id, w.org_id,
    jsonb_build_object('licence_ref', w.licence_ref), jsonb_build_object('licence_ref', v_ref, 'code', w.code));
end $$;

create or replace function public.request_release_override(p_version uuid, p_reason text)
returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v        public.workbook_versions%rowtype;
  w        public.workbooks%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_unmet  text[];
  v_id     uuid;
begin
  if not app.is_platform(array['owner','editor']) then
    raise exception 'only owners and editors ask for an override' using errcode = 'insufficient_privilege';
  end if;
  if v_reason is null or char_length(v_reason) > 1000 then
    raise exception 'a reason is required, 1000 characters or fewer' using errcode = 'check_violation';
  end if;
  select * into v from public.workbook_versions where id = p_version;
  if not found then
    raise exception 'version % not found', p_version using errcode = 'no_data_found';
  end if;
  select * into w from public.workbooks where id = v.workbook_id;
  v_unmet := app.release_unmet(p_version);
  if cardinality(v_unmet) = 0 then
    raise exception 'every requirement is met; no override is needed' using errcode = 'object_not_in_prerequisite_state';
  end if;

  insert into public.release_overrides (version_id, content_hash, unmet, reason, requested_by)
  values (p_version, v.content_hash, v_unmet, v_reason, app.uid())
  returning id into v_id;
  perform app.audit('release.override_requested', 'release_override:' || v_id::text, v_reason, w.tenant_id, w.org_id, null,
    jsonb_build_object('version_id', p_version, 'code', w.code, 'unmet', to_jsonb(v_unmet), 'content_hash', v.content_hash));
  return v_id;
end $$;

create or replace function public.approve_release_override(p_override uuid)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  o public.release_overrides%rowtype;
  v public.workbook_versions%rowtype;
  w public.workbooks%rowtype;
begin
  if not app.is_platform(array['owner','editor']) then
    raise exception 'only owners and editors approve an override' using errcode = 'insufficient_privilege';
  end if;
  select * into o from public.release_overrides where id = p_override for update;
  if not found then
    raise exception 'override % not found', p_override using errcode = 'no_data_found';
  end if;
  if o.requested_by = app.uid() then
    raise exception 'a second, different member of staff must approve the override' using errcode = 'AKR03';
  end if;
  if o.approved_by is not null or o.used_at is not null then
    raise exception 'this override has already been approved' using errcode = 'object_not_in_prerequisite_state';
  end if;
  select * into v from public.workbook_versions where id = o.version_id;
  if v.content_hash <> o.content_hash then
    raise exception 'the version changed since the override was asked for' using errcode = 'AKR02';
  end if;
  select * into w from public.workbooks where id = v.workbook_id;

  update public.release_overrides set approved_by = app.uid(), approved_at = now() where id = o.id;
  perform app.audit('release.override_approved', 'release_override:' || o.id::text, o.reason, w.tenant_id, w.org_id, null,
    jsonb_build_object('version_id', o.version_id, 'code', w.code, 'unmet', to_jsonb(o.unmet), 'requested_by', o.requested_by));
end $$;

-- Release a version. With p_go_live false the workbook moves to approved;
-- with true the version is published and the workbook goes live. Refused
-- unless every requirement is met, or an approved, unused override for the
-- same hash, younger than 7 days, covers every unmet requirement.
create or replace function public.release_version(p_version uuid, p_go_live boolean, p_override uuid default null)
returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v        public.workbook_versions%rowtype;
  w        public.workbooks%rowtype;
  o        public.release_overrides%rowtype;
  v_unmet  text[];
  v_target text := case when p_go_live then 'live' else 'approved' end;
begin
  if not app.is_platform(array['owner','editor']) then
    raise exception 'only owners and editors release a version' using errcode = 'insufficient_privilege';
  end if;
  if p_version is null or p_go_live is null then
    raise exception 'version and go-live are required' using errcode = 'invalid_parameter_value';
  end if;
  select * into v from public.workbook_versions where id = p_version for update;
  if not found then
    raise exception 'version % not found', p_version using errcode = 'no_data_found';
  end if;
  select * into w from public.workbooks where id = v.workbook_id for update;
  if w.status in ('paused','retired') then
    raise exception 'a % workbook cannot be released; resume it first', w.status using errcode = 'object_not_in_prerequisite_state';
  end if;
  if not p_go_live and w.status = 'live' then
    raise exception 'the workbook is already live' using errcode = 'object_not_in_prerequisite_state';
  end if;

  v_unmet := app.release_unmet(p_version);
  if cardinality(v_unmet) > 0 then
    if p_override is null then
      raise exception 'release refused: %', array_to_string(v_unmet, ', ') using errcode = 'AKR01';
    end if;
    select * into o from public.release_overrides where id = p_override for update;
    if not found or o.version_id <> p_version or o.approved_by is null or o.used_at is not null
       or o.approved_at < now() - interval '7 days' or not (o.unmet @> v_unmet) then
      raise exception 'release refused: %', array_to_string(v_unmet, ', ') using errcode = 'AKR01';
    end if;
    if o.content_hash <> v.content_hash then
      raise exception 'the version changed since the override was approved' using errcode = 'AKR02';
    end if;
    update public.release_overrides set used_at = now() where id = o.id;
  end if;

  if p_go_live and v.published_at is null then
    perform app.publish_version(p_version);
  end if;
  if w.status is distinct from v_target then
    update public.workbooks set status = v_target where id = w.id;
  end if;

  perform app.audit(case when p_go_live then 'release.live' else 'release.approved' end,
    'workbook_version:' || p_version::text, null, w.tenant_id, w.org_id,
    jsonb_build_object('code', w.code, 'status', w.status),
    jsonb_build_object('code', w.code, 'status', v_target, 'content_hash', v.content_hash,
                       'override_id', case when cardinality(v_unmet) > 0 then p_override end,
                       'overridden', to_jsonb(v_unmet)));
  return v_target;
end $$;

-- The gate itself. A client (anon or authenticated, including staff on the
-- API) can no longer move a workbook into approved or live by writing the
-- column; public.release_version does it after its checks. Resuming a paused
-- workbook stays open, as the kill switch (0008) needs it. Server code, the
-- seed and security definer functions run as other roles and pass through.
create or replace function app.guard_release_gate() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' and new.status in ('approved','live') then
      raise exception 'a workbook is approved or made live through public.release_version' using errcode = 'insufficient_privilege';
    end if;
    if tg_op = 'UPDATE' and new.status is distinct from old.status and new.status in ('approved','live')
       and not (old.status = 'paused' and new.status = 'live') then
      raise exception 'a workbook is approved or made live through public.release_version' using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end $$;
create trigger workbooks_release_gate before insert or update of status on public.workbooks
  for each row execute function app.guard_release_gate();

-- ===========================================================================
-- 3. First-party funnel counts (F-141)
-- ===========================================================================

-- Daily counts only. No user id, no session id, no IP, no free text, so an
-- answer cannot land here. Kept 13 months (public.prune_funnel_counts).
create table public.funnel_counts (
  id          bigint generated always as identity primary key,
  day         date not null,
  event       text not null check (event in ('page_view','sample_view','free_week_started','checkout_started','purchase','week_completed')),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  workbook_id uuid references public.workbooks(id) on delete cascade,
  n           bigint not null default 0 check (n >= 0),
  unique nulls not distinct (day, event, tenant_id, workbook_id)
);
create index funnel_counts_day_idx on public.funnel_counts(day desc);

-- Count one event. The server calls this only when the visitor has not opted
-- out (cookie, Global Privacy Control or Do Not Track; lib/funnel.ts).
create or replace function public.record_funnel_event(p_event text, p_tenant uuid, p_workbook uuid default null)
returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_event is null or p_event not in ('page_view','sample_view','free_week_started','checkout_started','purchase','week_completed') then
    raise exception 'unknown funnel event' using errcode = 'invalid_parameter_value';
  end if;
  if p_tenant is null or not exists (select 1 from public.tenants where id = p_tenant) then
    raise exception 'unknown tenant' using errcode = 'invalid_parameter_value';
  end if;
  if p_workbook is not null and not exists (select 1 from public.workbooks where id = p_workbook) then
    raise exception 'unknown workbook' using errcode = 'invalid_parameter_value';
  end if;
  insert into public.funnel_counts (day, event, tenant_id, workbook_id, n)
  values ((now() at time zone 'utc')::date, p_event, p_tenant, p_workbook, 1)
  on conflict (day, event, tenant_id, workbook_id) do update set n = public.funnel_counts.n + 1;
end $$;

-- Totals between two days for the staff page. Small-number suppression is
-- applied where counts are shown per workbook (lib/admin/funnel.ts).
create or replace function public.funnel_summary(p_from date, p_to date)
returns table (event text, workbook_id uuid, workbook_code text, n bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_platform(array['owner','editor','finance']) then
    raise exception 'only owners, editors and finance read funnel counts' using errcode = 'insufficient_privilege';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then
    raise exception 'a date range of up to 400 days is required' using errcode = 'invalid_parameter_value';
  end if;
  return query
    select f.event, f.workbook_id, w.code, sum(f.n)::bigint
    from public.funnel_counts f left join public.workbooks w on w.id = f.workbook_id
    where f.day between p_from and p_to
    group by f.event, f.workbook_id, w.code
    order by f.event, w.code nulls first;
end $$;

create or replace function public.prune_funnel_counts() returns bigint
language plpgsql volatile security definer set search_path = '' as $$
declare n bigint;
begin
  delete from public.funnel_counts where day < ((now() at time zone 'utc') - interval '13 months')::date;
  get diagnostics n = row_count;
  return n;
end $$;

-- ===========================================================================
-- 4. Operational alerts (F-142)
-- ===========================================================================

-- One row per failure: a kind, where it happened and a short code. No
-- message text, no ids of people, no form values. Kept 90 days.
create table public.ops_events (
  id     bigint generated always as identity primary key,
  at     timestamptz not null default now(),
  kind   text not null check (kind in ('webhook_failure','cron_failure','payout_failure','email_failure','validator_error','error')),
  source text not null check (source ~ '^[a-z0-9_./-]{1,80}$'),
  code   text check (code ~ '^[A-Za-z0-9_.:-]{1,80}$')
);
create index ops_events_recent_idx on public.ops_events(kind, source, at desc);
create index ops_events_at_idx on public.ops_events(at desc);

-- An open alert per kind and source. Further events add to its count until
-- staff acknowledge it; the next event after that opens a new alert.
create table public.ops_alerts (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null,
  source          text not null,
  opened_at       timestamptz not null default now(),
  last_at         timestamptz not null default now(),
  event_count     int not null default 1 check (event_count >= 1),
  last_code       text,
  notified_at     timestamptz,
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users(id) on delete set null
);
create unique index ops_alerts_open_idx on public.ops_alerts(kind, source) where acknowledged_at is null;
create index ops_alerts_opened_idx on public.ops_alerts(opened_at desc);

-- Thresholds: a webhook, cron, payout or validator failure alerts at once.
-- Email failures alert at 5 in an hour, other errors at 10 in 15 minutes.
create or replace function app.ops_threshold(p_kind text) returns table (n int, win interval)
language sql immutable set search_path = '' as $$
  select case p_kind when 'email_failure' then 5 when 'error' then 10 else 1 end,
         case p_kind when 'email_failure' then interval '1 hour' when 'error' then interval '15 minutes' else interval '1 hour' end
$$;
revoke execute on function app.ops_threshold(text) from public, anon, authenticated;

-- Server code only (service role). Returns the alert and whether this event
-- opened it, so the caller sends one email per alert.
create or replace function public.record_ops_event(p_kind text, p_source text, p_code text default null)
returns table (alert_id uuid, notify boolean)
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_code  text := nullif(btrim(coalesce(p_code, '')), '');
  v_alert uuid;
  v_n     int;
  t       record;
begin
  if p_kind is null or p_kind not in ('webhook_failure','cron_failure','payout_failure','email_failure','validator_error','error') then
    raise exception 'unknown ops event kind' using errcode = 'invalid_parameter_value';
  end if;
  if p_source is null or p_source !~ '^[a-z0-9_./-]{1,80}$' then
    raise exception 'ops event source must be a short lower-case path' using errcode = 'invalid_parameter_value';
  end if;
  if v_code is not null and v_code !~ '^[A-Za-z0-9_.:-]{1,80}$' then
    v_code := 'unrecognised';
  end if;

  perform pg_advisory_xact_lock(hashtext('ops:' || p_kind || ':' || p_source));
  insert into public.ops_events (kind, source, code) values (p_kind, p_source, v_code);

  update public.ops_alerts set event_count = event_count + 1, last_at = now(), last_code = v_code
   where kind = p_kind and source = p_source and acknowledged_at is null
  returning id into v_alert;
  if v_alert is not null then
    return query select v_alert, false;
    return;
  end if;

  select * into t from app.ops_threshold(p_kind);
  select count(*) into v_n from public.ops_events e
   where e.kind = p_kind and e.source = p_source and e.at > now() - t.win;
  if v_n < t.n then
    return query select null::uuid, false;
    return;
  end if;

  insert into public.ops_alerts (kind, source, event_count, last_code) values (p_kind, p_source, v_n, v_code)
  returning id into v_alert;
  return query select v_alert, true;
end $$;

create or replace function public.mark_ops_alert_notified(p_alert uuid) returns void
language sql volatile security definer set search_path = '' as $$
  update public.ops_alerts set notified_at = now() where id = p_alert and notified_at is null
$$;

create or replace function public.acknowledge_ops_alert(p_alert uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare a public.ops_alerts%rowtype;
begin
  if not app.is_platform(array['owner','editor','support']) then
    raise exception 'only owners, editors and support acknowledge alerts' using errcode = 'insufficient_privilege';
  end if;
  select * into a from public.ops_alerts where id = p_alert for update;
  if not found then
    raise exception 'alert % not found', p_alert using errcode = 'no_data_found';
  end if;
  if a.acknowledged_at is not null then
    raise exception 'the alert is already acknowledged' using errcode = 'object_not_in_prerequisite_state';
  end if;
  update public.ops_alerts set acknowledged_at = now(), acknowledged_by = app.uid() where id = a.id;
  perform app.audit('ops.alert_acknowledged', 'ops_alert:' || a.id::text, null, null, null,
    jsonb_build_object('kind', a.kind, 'source', a.source, 'event_count', a.event_count), null);
end $$;

create or replace function public.prune_ops_events() returns bigint
language plpgsql volatile security definer set search_path = '' as $$
declare n bigint;
begin
  delete from public.ops_events where at < now() - interval '90 days';
  get diagnostics n = row_count;
  return n;
end $$;

-- ===========================================================================
-- 5. Support inbox (F-090)
-- ===========================================================================

create table public.support_messages (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  topic           text not null check (topic in ('refund','access','deletion','payout','worried','other')),
  name            text not null check (char_length(name) between 1 and 200),
  email           extensions.citext not null check (char_length(email::text) between 3 and 254),
  message         text not null check (char_length(message) between 1 and 4000),
  consent_contact boolean not null check (consent_contact),
  status          text not null default 'new' check (status in ('new','open','closed')),
  user_id         uuid references auth.users(id) on delete set null,
  ip_hash         text check (ip_hash ~ '^[0-9a-f]{64}$')
);
create index support_messages_created_idx on public.support_messages(created_at desc);
create index support_messages_status_idx on public.support_messages(status, created_at desc);
create index support_messages_ip_recent_idx on public.support_messages(ip_hash, created_at desc);

-- The contact form's only write path. Same shape as app.submit_lead (0005):
-- checks every field, refuses without consent, and rate limits at 5 messages
-- per ip_hash an hour and 300 in total an hour.
create or replace function app.submit_support_message(
  p_topic text, p_name text, p_email text, p_message text, p_consent boolean, p_ip_hash text
) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_name   text := nullif(btrim(coalesce(p_name, '')), '');
  v_email  text := lower(nullif(btrim(coalesce(p_email, '')), ''));
  v_msg    text := nullif(btrim(coalesce(p_message, '')), '');
  v_recent int;
  v_id     uuid;
begin
  if p_consent is distinct from true then
    raise exception 'consent to store and reply is required' using errcode = 'AKH01';
  end if;
  if p_topic is null or p_topic not in ('refund','access','deletion','payout','worried','other') then
    raise exception 'support_invalid: topic' using errcode = 'AKH02';
  end if;
  if v_name is null or char_length(v_name) > 200 then
    raise exception 'support_invalid: name' using errcode = 'AKH02';
  end if;
  if v_email is null or char_length(v_email) > 254 or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'support_invalid: email' using errcode = 'AKH02';
  end if;
  if v_msg is null or char_length(v_msg) > 4000 then
    raise exception 'support_invalid: message' using errcode = 'AKH02';
  end if;
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'support_invalid: ip_hash' using errcode = 'AKH02';
  end if;

  perform pg_advisory_xact_lock(hashtext('support:' || p_ip_hash));
  select count(*) into v_recent from public.support_messages where ip_hash = p_ip_hash and created_at > now() - interval '1 hour';
  if v_recent >= 5 then
    raise exception 'rate_limited: too many messages from this address' using errcode = 'AKH29';
  end if;
  select count(*) into v_recent from public.support_messages where created_at > now() - interval '1 hour';
  if v_recent >= 300 then
    raise exception 'rate_limited: too many messages' using errcode = 'AKH29';
  end if;

  insert into public.support_messages (topic, name, email, message, consent_contact, user_id, ip_hash)
  values (p_topic, v_name, v_email, v_msg, true, app.uid(), p_ip_hash)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.submit_support_message(
  p_topic text, p_name text, p_email text, p_message text, p_consent boolean, p_ip_hash text
) returns uuid
language sql security invoker set search_path = '' as $$
  select app.submit_support_message(p_topic, p_name, p_email, p_message, p_consent, p_ip_hash)
$$;

create or replace function app.audit_support_status() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    perform app.audit('support.status', 'support_message:' || new.id::text, null, null, null,
      jsonb_build_object('status', old.status), jsonb_build_object('status', new.status));
  end if;
  return new;
end $$;
create trigger support_messages_status_audit after update of status on public.support_messages
  for each row execute function app.audit_support_status();

-- ===========================================================================
-- 6. Row level security and grants
-- ===========================================================================
alter table public.review_validations enable row level security;
alter table public.review_assignments enable row level security;
alter table public.review_notes       enable row level security;
alter table public.release_signoffs   enable row level security;
alter table public.release_overrides  enable row level security;
alter table public.funnel_counts      enable row level security;
alter table public.ops_events         enable row level security;
alter table public.ops_alerts         enable row level security;
alter table public.support_messages   enable row level security;

revoke all on public.review_validations, public.review_assignments, public.review_notes, public.release_signoffs,
  public.release_overrides, public.funnel_counts, public.ops_events, public.ops_alerts, public.support_messages
  from anon, authenticated;

-- Review records: any staff reads; writes go through the functions above.
-- The owning organisation reads sign-offs and send-back notes on its own
-- versions, so an author can see what was asked of them.
grant select on public.review_validations, public.review_assignments, public.review_notes,
  public.release_signoffs, public.release_overrides to authenticated;
create policy review_validations_read on public.review_validations for select to authenticated
  using ((select app.is_staff()));
create policy review_assignments_read on public.review_assignments for select to authenticated
  using ((select app.is_staff()));
create policy review_notes_read on public.review_notes for select to authenticated
  using ((select app.is_staff()) or (kind = 'send_back' and (select app.can_read_workbook(app.version_workbook(version_id)))));
create policy release_signoffs_read on public.release_signoffs for select to authenticated
  using ((select app.can_read_workbook(app.version_workbook(version_id))));
create policy release_overrides_read on public.release_overrides for select to authenticated
  using ((select app.is_staff()));

-- Funnel counts: owners, editors and finance read; nobody writes directly.
grant select on public.funnel_counts to authenticated;
create policy funnel_counts_read on public.funnel_counts for select to authenticated
  using ((select app.is_platform(array['owner','editor','finance'])));

-- Ops: any staff reads; only the functions write.
grant select on public.ops_events, public.ops_alerts to authenticated;
create policy ops_events_read on public.ops_events for select to authenticated using ((select app.is_staff()));
create policy ops_alerts_read on public.ops_alerts for select to authenticated using ((select app.is_staff()));

-- Support: owners, editors and support read every message and change status, and only status.
grant select on public.support_messages to authenticated;
grant update (status) on public.support_messages to authenticated;
create policy support_messages_staff_read on public.support_messages for select to authenticated
  using ((select app.is_platform(array['owner','editor','support'])));
create policy support_messages_staff_update on public.support_messages for update to authenticated
  using ((select app.is_platform(array['owner','editor','support'])))
  with check ((select app.is_platform(array['owner','editor','support'])));

-- Function grants. Staff functions check roles inside; authenticated is the
-- only client role that may reach them.
revoke execute on function app.is_reviewer() from public, anon;
revoke execute on function public.record_validation(uuid, text, boolean, int, int) from public, anon;
revoke execute on function public.review_staff() from public, anon;
revoke execute on function public.review_assign(uuid, uuid) from public, anon;
revoke execute on function public.review_add_note(uuid, text) from public, anon;
revoke execute on function public.review_send_back(uuid, text) from public, anon;
revoke execute on function public.release_requirements(uuid) from public, anon;
revoke execute on function public.record_signoff(uuid, text, text, text, text, text) from public, anon;
revoke execute on function public.set_licence_record(uuid, text) from public, anon;
revoke execute on function public.request_release_override(uuid, text) from public, anon;
revoke execute on function public.approve_release_override(uuid) from public, anon;
revoke execute on function public.release_version(uuid, boolean, uuid) from public, anon;
revoke execute on function public.funnel_summary(date, date) from public, anon;
revoke execute on function public.acknowledge_ops_alert(uuid) from public, anon;
grant execute on function app.is_reviewer() to authenticated;
grant execute on function public.record_validation(uuid, text, boolean, int, int) to authenticated;
grant execute on function public.review_staff() to authenticated;
grant execute on function public.review_assign(uuid, uuid) to authenticated;
grant execute on function public.review_add_note(uuid, text) to authenticated;
grant execute on function public.review_send_back(uuid, text) to authenticated;
grant execute on function public.release_requirements(uuid) to authenticated;
grant execute on function public.record_signoff(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.set_licence_record(uuid, text) to authenticated;
grant execute on function public.request_release_override(uuid, text) to authenticated;
grant execute on function public.approve_release_override(uuid) to authenticated;
grant execute on function public.release_version(uuid, boolean, uuid) to authenticated;
grant execute on function public.funnel_summary(date, date) to authenticated;
grant execute on function public.acknowledge_ops_alert(uuid) to authenticated;

-- Funnel events are counted from server code on the visitor's own request,
-- signed in or not.
revoke execute on function public.record_funnel_event(text, uuid, uuid) from public;
grant execute on function public.record_funnel_event(text, uuid, uuid) to anon, authenticated, service_role;

-- Service role only: ops events, notification stamps and retention.
revoke execute on function public.record_ops_event(text, text, text) from public, anon, authenticated;
revoke execute on function public.mark_ops_alert_notified(uuid) from public, anon, authenticated;
revoke execute on function public.prune_ops_events() from public, anon, authenticated;
revoke execute on function public.prune_funnel_counts() from public, anon, authenticated;
grant execute on function public.record_ops_event(text, text, text) to service_role;
grant execute on function public.mark_ops_alert_notified(uuid) to service_role;
grant execute on function public.prune_ops_events() to service_role;
grant execute on function public.prune_funnel_counts() to service_role;

-- Support form: anyone may send, as with leads.
revoke execute on function app.submit_support_message(text, text, text, text, boolean, text) from public;
revoke execute on function public.submit_support_message(text, text, text, text, boolean, text) from public;
grant execute on function app.submit_support_message(text, text, text, text, boolean, text) to anon, authenticated, service_role;
grant execute on function public.submit_support_message(text, text, text, text, boolean, text) to anon, authenticated, service_role;
