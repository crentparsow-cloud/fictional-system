-- 0018 Versioned terms acceptance (F-122).
--
-- Depends on 0001 to 0012 only. Same rules as before: RLS on every table,
-- grants to anon and authenticated revoked and given back narrowly, helpers
-- security definer with search_path pinned, thin public wrappers that run as
-- the caller.
--
-- The shape of trust here:
--   * terms_versions is the register of every terms document Akana has
--     published: reader terms, author terms, publisher terms, white-label
--     SaaS terms, the DPA and the sub-processor list. A version is public.
--     Anyone may read the register, because a reader is entitled to know
--     which wording applies. Only a platform owner adds a version, through
--     app.publish_terms_version, and every one is audited. A version is
--     never edited or deleted after it is added; a new wording is a new row.
--   * Business documents (everything except reader terms) take effect no
--     sooner than 15 days after they are published, so business users get
--     the notice the P2B rules expect. A check constraint holds that.
--   * terms_acceptances is append only. One row each time a person accepts
--     a version: at sign-up, at checkout, or when asked again after a new
--     version. Rows are written only by app.accept_terms, for app.uid(), and
--     never updated or deleted by a client. A reader reads their own rows.
--     A business acceptance names the organisation and may be made only by
--     someone who can manage that organisation. Drafts are recorded for
--     readers while Akana is in test mode, and the draft flag travels with
--     the row; a business party can never accept a draft.
--   * Rows go with the account when it is deleted (on delete cascade), as
--     the consent columns on profiles do.
--
-- Error codes, for the server to map:
--   AKT01  not allowed (not signed in, or cannot act for the organisation)
--   AKT02  unknown, not yet effective, or draft version for a business party
--   AKT03  a field failed validation (the message names the field)
--   AKT29  rate limited: more than 20 acceptances in an hour

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.terms_versions (
  id            bigint generated always as identity primary key,
  doc           text not null check (doc in ('reader_terms','author_terms','publisher_terms','saas_terms','dpa','subprocessors')),
  version       text not null check (version ~ '^[a-z0-9][a-z0-9._-]{0,31}$'),
  summary       text check (summary is null or char_length(summary) <= 500),
  is_draft      boolean not null default true,
  published_at  timestamptz not null default now(),
  effective_at  timestamptz not null,
  created_by    uuid references auth.users(id) on delete set null,
  constraint terms_versions_doc_version unique (doc, version),
  constraint terms_versions_effective_after_published check (effective_at >= published_at),
  constraint terms_versions_business_notice check (doc = 'reader_terms' or effective_at >= published_at + interval '15 days')
);
create index terms_versions_current_idx on public.terms_versions (doc, effective_at desc, id desc);

create table public.terms_acceptances (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  doc          text not null,
  version      text not null,
  context      text not null check (context in ('signup','checkout','reask','business')),
  was_draft    boolean not null,
  tenant_id    uuid references public.tenants(id) on delete set null,
  org_id       uuid references public.organisations(id) on delete set null,
  accepted_at  timestamptz not null default now(),
  constraint terms_acceptances_version_fk foreign key (doc, version) references public.terms_versions (doc, version),
  constraint terms_acceptances_party check ((doc = 'reader_terms') = (org_id is null)),
  constraint terms_acceptances_business_context check ((doc = 'reader_terms') = (context <> 'business'))
);
create index terms_acceptances_user_idx on public.terms_acceptances (user_id, doc, accepted_at desc);
create index terms_acceptances_org_idx on public.terms_acceptances (org_id, doc, accepted_at desc) where org_id is not null;

-- Neither table is ever edited in place. The functions below only insert.
create or replace function app.terms_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception '% is append only', tg_table_name using errcode = 'insufficient_privilege';
end $$;
create trigger terms_versions_append_only before update or delete on public.terms_versions
  for each row execute function app.terms_append_only();
create trigger terms_acceptances_append_only before update on public.terms_acceptances
  for each row execute function app.terms_append_only();

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------
alter table public.terms_versions enable row level security;
alter table public.terms_acceptances enable row level security;
revoke all on public.terms_versions, public.terms_acceptances from anon, authenticated;

grant select (id, doc, version, summary, is_draft, published_at, effective_at) on public.terms_versions to anon, authenticated;
create policy terms_versions_read on public.terms_versions for select to anon, authenticated using (true);

grant select (id, doc, version, context, was_draft, tenant_id, org_id, accepted_at) on public.terms_acceptances to authenticated;
create policy terms_acceptances_own on public.terms_acceptances for select to authenticated
  using (user_id = (select app.uid())
         or (org_id is not null and (select app.org_can(org_id, 'organisation', 'manage'))));

-- ---------------------------------------------------------------------------
-- The version in force for a document: the latest that has taken effect.
-- ---------------------------------------------------------------------------
create or replace function app.current_terms(p_doc text)
returns table (doc text, version text, is_draft boolean, published_at timestamptz, effective_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select v.doc, v.version, v.is_draft, v.published_at, v.effective_at
    from public.terms_versions v
   where v.doc = p_doc and v.effective_at <= now()
   order by v.effective_at desc, v.id desc
   limit 1
$$;

-- ---------------------------------------------------------------------------
-- Where the caller stands on a document: the version in force, the latest
-- version they (or, for a business document, the organisation) accepted,
-- and whether they must be asked. needs_acceptance is true when nothing was
-- accepted or what was accepted is not the version in force.
-- ---------------------------------------------------------------------------
create or replace function app.terms_status(p_doc text, p_org uuid default null)
returns table (current_version text, accepted_version text, accepted_at timestamptz, needs_acceptance boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := app.uid();
  v_cur text;
  v_acc text;
  v_at  timestamptz;
begin
  if v_uid is null then
    raise exception 'sign in to see terms status' using errcode = 'AKT01';
  end if;
  if p_doc = 'reader_terms' and p_org is not null then
    raise exception 'terms_invalid: org' using errcode = 'AKT03';
  end if;
  if p_doc <> 'reader_terms' and (p_org is null or not app.org_can(p_org, 'organisation', 'manage')) then
    raise exception 'not allowed to act for this organisation' using errcode = 'AKT01';
  end if;
  select c.version into v_cur from app.current_terms(p_doc) c;
  if p_org is null then
    select a.version, a.accepted_at into v_acc, v_at
      from public.terms_acceptances a
     where a.user_id = v_uid and a.doc = p_doc
     order by a.accepted_at desc, a.id desc limit 1;
  else
    select a.version, a.accepted_at into v_acc, v_at
      from public.terms_acceptances a
     where a.org_id = p_org and a.doc = p_doc
     order by a.accepted_at desc, a.id desc limit 1;
  end if;
  return query select v_cur, v_acc, v_at, (v_cur is not null and v_acc is distinct from v_cur);
end $$;

-- ---------------------------------------------------------------------------
-- Accept a version, for the signed-in person only. The version must exist
-- and have taken effect. The app also checks it is the wording it showed.
-- Returns the time recorded.
-- ---------------------------------------------------------------------------
create or replace function app.accept_terms(
  p_doc text, p_version text, p_context text, p_tenant uuid default null, p_org uuid default null
) returns timestamptz
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid   uuid := app.uid();
  v_at    timestamptz := now();
  v_ver   public.terms_versions%rowtype;
  v_count int;
begin
  if v_uid is null then
    raise exception 'sign in to accept terms' using errcode = 'AKT01';
  end if;
  if p_doc is null or p_doc not in ('reader_terms','author_terms','publisher_terms','saas_terms','dpa','subprocessors') then
    raise exception 'terms_invalid: doc' using errcode = 'AKT03';
  end if;
  if p_context is null or p_context not in ('signup','checkout','reask','business') then
    raise exception 'terms_invalid: context' using errcode = 'AKT03';
  end if;
  if (p_doc = 'reader_terms') <> (p_context <> 'business') then
    raise exception 'terms_invalid: context' using errcode = 'AKT03';
  end if;
  if p_doc = 'reader_terms' and p_org is not null then
    raise exception 'terms_invalid: org' using errcode = 'AKT03';
  end if;
  if p_doc <> 'reader_terms' and (p_org is null or not app.org_can(p_org, 'organisation', 'manage')) then
    raise exception 'not allowed to act for this organisation' using errcode = 'AKT01';
  end if;
  if p_tenant is not null and not exists (select 1 from public.tenants t where t.id = p_tenant) then
    raise exception 'terms_invalid: tenant' using errcode = 'AKT03';
  end if;

  select * into v_ver from public.terms_versions v where v.doc = p_doc and v.version = p_version;
  if not found or v_ver.effective_at > v_at then
    raise exception 'unknown or not yet effective terms version' using errcode = 'AKT02';
  end if;
  if v_ver.is_draft and p_doc <> 'reader_terms' then
    raise exception 'draft terms cannot be accepted by a business party' using errcode = 'AKT02';
  end if;

  select count(*) into v_count from public.terms_acceptances a
   where a.user_id = v_uid and a.accepted_at > v_at - interval '1 hour';
  if v_count >= 20 then
    raise exception 'too many acceptances, try again later' using errcode = 'AKT29';
  end if;

  insert into public.terms_acceptances (user_id, doc, version, context, was_draft, tenant_id, org_id, accepted_at)
  values (v_uid, p_doc, p_version, p_context, v_ver.is_draft, p_tenant, p_org, v_at);

  if p_org is not null then
    perform app.audit('terms.accept', p_doc || ':' || p_version, null, p_tenant, p_org);
  end if;
  return v_at;
end $$;

-- ---------------------------------------------------------------------------
-- Add a version. Platform owners only, audited. Business documents must
-- give at least 15 days' notice; the table constraint refuses less.
-- ---------------------------------------------------------------------------
create or replace function app.publish_terms_version(
  p_doc text, p_version text, p_effective_at timestamptz, p_summary text default null, p_is_draft boolean default true
) returns bigint
language plpgsql volatile security definer set search_path = '' as $$
declare v_id bigint;
begin
  if not app.is_platform(array['owner']) then
    raise exception 'only a platform owner publishes terms' using errcode = 'AKT01';
  end if;
  insert into public.terms_versions (doc, version, summary, is_draft, effective_at, created_by)
  values (p_doc, p_version, p_summary, coalesce(p_is_draft, true), coalesce(p_effective_at, now()), app.uid())
  returning id into v_id;
  perform app.audit('terms.publish', p_doc || ':' || p_version, p_summary, null, null, null,
    jsonb_build_object('effective_at', p_effective_at, 'is_draft', coalesce(p_is_draft, true)));
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- RPC wrappers. Security invoker: the app functions do the checks.
-- ---------------------------------------------------------------------------
create or replace function public.current_terms(p_doc text)
returns table (doc text, version text, is_draft boolean, published_at timestamptz, effective_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select * from app.current_terms(p_doc)
$$;
create or replace function public.terms_status(p_doc text, p_org uuid default null)
returns table (current_version text, accepted_version text, accepted_at timestamptz, needs_acceptance boolean)
language sql stable security invoker set search_path = '' as $$
  select * from app.terms_status(p_doc, p_org)
$$;
create or replace function public.accept_terms(
  p_doc text, p_version text, p_context text, p_tenant uuid default null, p_org uuid default null
) returns timestamptz
language sql volatile security invoker set search_path = '' as $$
  select app.accept_terms(p_doc, p_version, p_context, p_tenant, p_org)
$$;
create or replace function public.publish_terms_version(
  p_doc text, p_version text, p_effective_at timestamptz, p_summary text default null, p_is_draft boolean default true
) returns bigint
language sql volatile security invoker set search_path = '' as $$
  select app.publish_terms_version(p_doc, p_version, p_effective_at, p_summary, p_is_draft)
$$;

revoke execute on function app.current_terms(text), app.terms_status(text, uuid),
  app.accept_terms(text, text, text, uuid, uuid), app.publish_terms_version(text, text, timestamptz, text, boolean),
  app.terms_append_only() from public, anon;
revoke execute on function public.current_terms(text), public.terms_status(text, uuid),
  public.accept_terms(text, text, text, uuid, uuid), public.publish_terms_version(text, text, timestamptz, text, boolean) from public, anon;

grant execute on function app.current_terms(text), public.current_terms(text) to anon, authenticated;
grant execute on function app.terms_status(text, uuid), public.terms_status(text, uuid),
  app.accept_terms(text, text, text, uuid, uuid), public.accept_terms(text, text, text, uuid, uuid),
  app.publish_terms_version(text, text, timestamptz, text, boolean), public.publish_terms_version(text, text, timestamptz, text, boolean)
  to authenticated;

-- ---------------------------------------------------------------------------
-- The first reader terms version. Draft until the lawyer signs off (gate L3).
-- Keep in step with READER_TERMS_VERSION in apps/web/lib/terms.ts.
-- ---------------------------------------------------------------------------
insert into public.terms_versions (doc, version, summary, is_draft, published_at, effective_at) values
  ('reader_terms', 'reader-2026-10', 'First reader terms, with the refund policy and privacy notice. Draft for the lawyer.', true,
   '2026-10-07 00:00:00+00', '2026-10-07 00:00:00+00');
