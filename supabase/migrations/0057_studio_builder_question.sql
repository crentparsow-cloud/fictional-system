-- 0057 Studio: the workbook builder, the end-of-programme question and the
-- home summary (build list 8.1, 8.2, 8.5, 13.13).
--
-- What changes
--   1. public.studio_save_draft_version: an author, editor or owner of the
--      organisation saves the form builder's work as a new, unpublished
--      version. It is the author-side twin of public.staff_save_version
--      (0020) and follows the same rules: the validator found no errors, the
--      content changed, the code stays the workbook's own, a retired workbook
--      takes nothing. In addition the safety lines, the badge, the demo flag,
--      the slug and the internal block must be exactly as in the version the
--      builder started from, because those belong to Akana. The new version
--      is never published here. It goes through the same sign-off and
--      release gate (0016, 0020) as any other.
--   2. public.programme_questions and public.programme_question_answers: one
--      optional question for the end of a programme, written by the author
--      with two to five fixed answers. A reader answers once, after finishing,
--      and may skip. Authors read results only through
--      public.studio_programme_question_results, which counts and hides any
--      count under 10 in the database. No table grant lets an author, or
--      staff, read a row of answers. Not offered on titles with a safety tier.
--   3. public.studio_home_summary: for the Studio home, one row per workbook
--      of an organisation with how many readers started and how many
--      finished, hidden under 10 in the database as the dashboard does (0022).
--
-- Same rules as 0001 to 0048. Functions are security definer with search_path
-- pinned to ''. Every function a client may call has execute revoked from
-- public first and granted back to the roles that need it. Nothing earlier is
-- edited. Depends on 0002, 0003, 0013, 0016 and 0020.
--
-- Error codes:
--   AKZ21  builder: sign in, or no write access to the workbook
--   AKZ22  builder: not the latest version, or the first version is Akana's
--   AKZ23  builder: a line that belongs to Akana was changed
--   AKZ24  builder: validator errors, a changed code or content that is too big
--   AKZ31  question: wording, answers or title not allowed
--   AKZ32  question: answer is not valid
--   AKZ33  question: not found, or the reader has not finished

-- ---------------------------------------------------------------------------
-- 1. Builder: save a draft version.
-- ---------------------------------------------------------------------------
create or replace function app.studio_save_draft_version(
  p_workbook uuid, p_base uuid, p_content jsonb, p_content_hash text, p_errors int, p_warnings int
) returns table (version_id uuid, semver text)
language plpgsql volatile security definer set search_path = '' as $$
declare
  w        public.workbooks%rowtype;
  b        public.workbook_versions%rowtype;
  v_last   text;
  v_parts  int[];
  v_semver text;
  v_id     uuid;
begin
  if app.uid() is null then
    raise exception 'sign in first' using errcode = 'AKZ21';
  end if;
  if p_workbook is null or p_base is null or p_content is null or p_errors is null or p_warnings is null or p_warnings < 0 then
    raise exception 'workbook, base version, content and validator counts are required' using errcode = 'invalid_parameter_value';
  end if;
  if p_errors <> 0 then
    raise exception 'a version with validator errors cannot be saved' using errcode = 'AKZ24';
  end if;
  if jsonb_typeof(p_content) <> 'object' or octet_length(p_content::text) > 2000000 then
    raise exception 'the content must be one JSON object of 2 MB or less' using errcode = 'AKZ24';
  end if;
  if p_content_hash is null or p_content_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'a content hash is required' using errcode = 'invalid_parameter_value';
  end if;

  select * into w from public.workbooks x where x.id = p_workbook for update;
  if not found or not app.org_can(w.org_id, 'workbooks', 'write') then
    raise exception 'you cannot change this workbook' using errcode = 'AKZ21';
  end if;
  if w.status = 'retired' then
    raise exception 'a retired workbook takes no new versions' using errcode = 'object_not_in_prerequisite_state';
  end if;
  if p_content->>'code' is distinct from w.code then
    raise exception 'the code in the content must stay %', w.code using errcode = 'AKZ24';
  end if;

  select * into b from public.workbook_versions x where x.id = p_base;
  if not found or b.workbook_id <> w.id then
    raise exception 'version % not found for this workbook', p_base using errcode = 'no_data_found';
  end if;
  select x.semver into v_last from public.workbook_versions x where x.workbook_id = w.id
   order by string_to_array(x.semver, '.')::int[] desc limit 1;
  if v_last is distinct from b.semver then
    raise exception 'start from the latest version' using errcode = 'AKZ22';
  end if;
  if b.content_hash = p_content_hash then
    raise exception 'nothing changed' using errcode = 'check_violation';
  end if;

  -- Lines that belong to Akana stay as they were.
  if (p_content->'safety_tier') is distinct from (b.content->'safety_tier')
     or (p_content->'advice_guardrail') is distinct from (b.content->'advice_guardrail')
     or (p_content->'safety_hub') is distinct from (b.content->'safety_hub')
     or (p_content->'start'->'higher_tier_note') is distinct from (b.content->'start'->'higher_tier_note')
     or (p_content->'start'->'extra_safety_note') is distinct from (b.content->'start'->'extra_safety_note')
     or (p_content->'badge') is distinct from (b.content->'badge')
     or (p_content->'is_demo') is distinct from (b.content->'is_demo')
     or (p_content->'slug') is distinct from (b.content->'slug')
     or (p_content->'internal') is distinct from (b.content->'internal') then
    raise exception 'safety lines, badge, slug and the internal block are set by Akana' using errcode = 'AKZ23';
  end if;

  v_parts := string_to_array(v_last, '.')::int[];
  v_semver := v_parts[1] || '.' || v_parts[2] || '.' || (v_parts[3] + 1);

  insert into public.workbook_versions (workbook_id, semver, schema_version, content, content_hash, validated_at)
  values (w.id, v_semver, coalesce(nullif(p_content->>'schema_version', ''), '3.0'), p_content, p_content_hash, now())
  returning id into v_id;
  insert into public.review_validations (version_id, content_hash, ok, error_count, warning_count, validated_by)
  values (v_id, p_content_hash, true, 0, p_warnings, app.uid());
  if w.status = 'draft' then
    update public.workbooks x set status = 'in_review' where x.id = w.id;
  end if;

  perform app.audit('workbook.version_saved_by_author', 'workbook_version:' || v_id::text, null, w.tenant_id, w.org_id,
    jsonb_build_object('version_id', b.id, 'semver', b.semver, 'content_hash', b.content_hash),
    jsonb_build_object('version_id', v_id, 'semver', v_semver, 'content_hash', p_content_hash, 'code', w.code,
                       'warnings', p_warnings, 'status', case when w.status = 'draft' then 'in_review' else w.status end));
  return query select v_id, v_semver;
end $$;

create or replace function public.studio_save_draft_version(
  p_workbook uuid, p_base uuid, p_content jsonb, p_content_hash text, p_errors int, p_warnings int)
returns table (version_id uuid, semver text)
language sql volatile security invoker set search_path = '' as $$
  select * from app.studio_save_draft_version(p_workbook, p_base, p_content, p_content_hash, p_errors, p_warnings) $$;

revoke execute on function app.studio_save_draft_version(uuid, uuid, jsonb, text, int, int) from public, anon, authenticated;
revoke execute on function public.studio_save_draft_version(uuid, uuid, jsonb, text, int, int) from public, anon, authenticated;
grant execute on function app.studio_save_draft_version(uuid, uuid, jsonb, text, int, int) to authenticated;
grant execute on function public.studio_save_draft_version(uuid, uuid, jsonb, text, int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The end-of-programme question.
-- ---------------------------------------------------------------------------
create table public.programme_questions (
  workbook_id uuid primary key references public.workbooks(id) on delete cascade,
  question    text not null check (char_length(question) between 5 and 140),
  options     text[] not null check (cardinality(options) between 2 and 5),
  updated_by  uuid references auth.users(id) on delete set null,
  updated_at  timestamptz not null default now()
);
create index programme_questions_updated_by_idx on public.programme_questions(updated_by);

create table public.programme_question_answers (
  id           uuid primary key default gen_random_uuid(),
  workbook_id  uuid not null references public.programme_questions(workbook_id) on delete cascade,
  enrolment_id uuid not null references public.enrolments(id) on delete cascade,
  option_index smallint not null check (option_index between 0 and 4),
  answered_at  timestamptz not null default now(),
  unique (enrolment_id)
);
create index programme_question_answers_workbook_idx on public.programme_question_answers(workbook_id, option_index);

-- Author, editor or owner of the workbook's organisation sets or clears the
-- question. An empty question clears it. Changing the wording or the answers
-- removes the answers given so far, so two different questions never mix.
create or replace function app.studio_set_programme_question(p_workbook uuid, p_question text, p_options text[])
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  w        public.workbooks%rowtype;
  v_q      text := app.clean_text(p_question, 140);
  v_opts   text[];
  o        text;
  v_clean  text;
  old      public.programme_questions%rowtype;
begin
  if app.uid() is null then
    raise exception 'sign in first' using errcode = 'AKZ21';
  end if;
  select * into w from public.workbooks x where x.id = p_workbook;
  if not found or not app.org_can(w.org_id, 'workbooks', 'write') then
    raise exception 'you cannot change this workbook' using errcode = 'AKZ21';
  end if;
  if v_q is null then
    delete from public.programme_questions where workbook_id = p_workbook;
    perform app.audit('programme_question.cleared', 'workbook:' || p_workbook::text, null, w.tenant_id, w.org_id);
    return;
  end if;
  if char_length(btrim(coalesce(p_question, ''))) > 140 or char_length(v_q) < 5 then
    raise exception 'the question needs 5 to 140 characters' using errcode = 'AKZ31';
  end if;
  if w.safety_tier <> 'none' then
    raise exception 'this question is not offered on titles with a safety tier' using errcode = 'AKZ31';
  end if;
  v_opts := '{}';
  foreach o in array coalesce(p_options, '{}') loop
    v_clean := app.clean_text(o, 60);
    if v_clean is not null then
      v_opts := v_opts || v_clean;
    end if;
  end loop;
  if cardinality(v_opts) not between 2 and 5 then
    raise exception 'give two to five answers' using errcode = 'AKZ31';
  end if;
  if (select count(distinct lower(x)) from unnest(v_opts) x) <> cardinality(v_opts) then
    raise exception 'each answer must be different' using errcode = 'AKZ31';
  end if;

  select * into old from public.programme_questions where workbook_id = p_workbook;
  if found and (old.question is distinct from v_q or old.options is distinct from v_opts) then
    delete from public.programme_question_answers where workbook_id = p_workbook;
  end if;
  insert into public.programme_questions (workbook_id, question, options, updated_by)
  values (p_workbook, v_q, v_opts, app.uid())
  on conflict (workbook_id) do update
    set question = excluded.question, options = excluded.options, updated_by = excluded.updated_by, updated_at = now();
  perform app.audit('programme_question.saved', 'workbook:' || p_workbook::text, null, w.tenant_id, w.org_id);
end $$;

-- A reader answers once, after finishing. The row names the enrolment so the
-- same reader cannot answer twice; no author or staff policy can read it.
create or replace function app.answer_programme_question(p_enrolment uuid, p_option int)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  e public.enrolments%rowtype;
  q public.programme_questions%rowtype;
begin
  select * into e from public.enrolments x where x.id = p_enrolment and x.user_id = app.uid();
  if not found or e.status <> 'finished' then
    raise exception 'finish the programme first' using errcode = 'AKZ33';
  end if;
  select * into q from public.programme_questions x where x.workbook_id = e.workbook_id;
  if not found then
    raise exception 'there is no question for this programme' using errcode = 'AKZ33';
  end if;
  if p_option is null or p_option < 0 or p_option >= cardinality(q.options) then
    raise exception 'that answer is not on the list' using errcode = 'AKZ32';
  end if;
  insert into public.programme_question_answers (workbook_id, enrolment_id, option_index)
  values (e.workbook_id, e.id, p_option)
  on conflict (enrolment_id) do nothing;
end $$;

-- What the author sees: counts per answer, each hidden under 10, and the
-- total hidden under 10. Members who may read the workbook, and staff.
create or replace function app.studio_programme_question_results(p_workbook uuid)
returns table (option_index int, label text, n bigint, total bigint, suppressed boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  q      public.programme_questions%rowtype;
  v_tot  bigint;
begin
  if not app.can_read_workbook(p_workbook) then
    raise exception 'you cannot read this workbook' using errcode = 'AKZ21';
  end if;
  select * into q from public.programme_questions x where x.workbook_id = p_workbook;
  if not found then
    return;
  end if;
  select count(*) into v_tot from public.programme_question_answers a where a.workbook_id = p_workbook;
  return query
    select (g.i - 1)::int,
           q.options[g.i],
           case when v_tot < 10 then null
                else (select case when c.k < 10 then null else c.k end
                        from (select count(*) as k from public.programme_question_answers a
                               where a.workbook_id = p_workbook and a.option_index = g.i - 1) c) end,
           case when v_tot < 10 then null else v_tot end,
           case when v_tot < 10 then true
                else (select count(*) < 10 from public.programme_question_answers a
                       where a.workbook_id = p_workbook and a.option_index = g.i - 1) end
      from generate_series(1, cardinality(q.options)) as g(i)
     order by g.i;
end $$;

create or replace function public.studio_set_programme_question(p_workbook uuid, p_question text, p_options text[])
returns void language sql volatile security invoker set search_path = '' as $$
  select app.studio_set_programme_question(p_workbook, p_question, p_options) $$;
create or replace function public.answer_programme_question(p_enrolment uuid, p_option int)
returns void language sql volatile security invoker set search_path = '' as $$
  select app.answer_programme_question(p_enrolment, p_option) $$;
create or replace function public.studio_programme_question_results(p_workbook uuid)
returns table (option_index int, label text, n bigint, total bigint, suppressed boolean)
language sql stable security invoker set search_path = '' as $$
  select * from app.studio_programme_question_results(p_workbook) $$;

revoke execute on function
  app.studio_set_programme_question(uuid, text, text[]), app.answer_programme_question(uuid, int),
  app.studio_programme_question_results(uuid),
  public.studio_set_programme_question(uuid, text, text[]), public.answer_programme_question(uuid, int),
  public.studio_programme_question_results(uuid)
  from public, anon, authenticated;
grant execute on function
  app.studio_set_programme_question(uuid, text, text[]), app.answer_programme_question(uuid, int),
  app.studio_programme_question_results(uuid),
  public.studio_set_programme_question(uuid, text, text[]), public.answer_programme_question(uuid, int),
  public.studio_programme_question_results(uuid)
  to authenticated;

alter table public.programme_questions enable row level security;
alter table public.programme_question_answers enable row level security;
revoke all on public.programme_questions, public.programme_question_answers from public, anon, authenticated;
-- The question is public wherever the workbook is: the reader needs it at the
-- end of the programme. Members and staff read it too, to edit it.
grant select on public.programme_questions to authenticated;
create policy programme_questions_read on public.programme_questions for select to authenticated
  using ((select app.workbook_is_public(workbook_id)) or (select app.can_read_workbook(workbook_id)));
-- A reader sees only whether they have answered. Nobody else reads this table.
grant select on public.programme_question_answers to authenticated;
create policy programme_question_answers_own on public.programme_question_answers for select to authenticated
  using ((select app.enrolment_owner(enrolment_id)));

-- ---------------------------------------------------------------------------
-- 3. Studio home summary: readers started and finished per workbook, each
--    hidden under 10, for members who may read the organisation's workbooks.
-- ---------------------------------------------------------------------------
create or replace function app.studio_home_summary(p_org uuid)
returns table (workbook_id uuid, code text, title text, status text, is_demo boolean, started bigint, finished bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (app.org_can(p_org, 'workbooks', 'read') or app.is_staff()) then
    raise exception 'you cannot read this organisation' using errcode = 'AKZ21';
  end if;
  return query
    select w.id, w.code, w.title, w.status, w.is_demo,
           case when s.starts >= 10 then s.starts end,
           case when s.finishes >= 10 then s.finishes end
      from public.workbooks w
      left join lateral (
        select count(*) as starts, count(*) filter (where e.status = 'finished') as finishes
          from public.enrolments e where e.workbook_id = w.id) s on true
     where w.org_id = p_org
     order by w.updated_at desc
     limit 200;
end $$;

create or replace function public.studio_home_summary(p_org uuid)
returns table (workbook_id uuid, code text, title text, status text, is_demo boolean, started bigint, finished bigint)
language sql stable security invoker set search_path = '' as $$
  select * from app.studio_home_summary(p_org) $$;

revoke execute on function app.studio_home_summary(uuid), public.studio_home_summary(uuid) from public, anon, authenticated;
grant execute on function app.studio_home_summary(uuid), public.studio_home_summary(uuid) to authenticated;
