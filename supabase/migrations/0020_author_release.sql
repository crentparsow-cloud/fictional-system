-- 0020 Author release (M5): author sign-off against a content hash (F-039),
-- pricing from the ladder (F-040), who gets the author status emails
-- (F-043) and the staff JSON editor's save (F-086). Preview in the real
-- engine (F-038) needs no table: it reads workbook_versions under the 0002
-- policy and saves nothing.
--
-- Builds on 0013 (submissions, licences, studio helpers) and 0016 (review
-- queue, release_signoffs, the release gate). Nothing there is edited or
-- duplicated: the author sign-off ends in public.record_signoff, and a saved
-- version gets its validator row in public.review_validations.
--
-- Same rules as before: every table has RLS on, grants to anon and
-- authenticated are revoked and given back narrowly, every function is
-- security definer with search_path pinned to '', and PostgREST sees thin
-- public wrappers. Rate limits count rows in the audit log, as 0013 does.
--
-- Nothing here reads or stores reader answers. The recipients function
-- returns organisation members only, never a reader.
--
-- Error codes, for the server to map (shared with 0013 and 0016):
--   AKS01  not allowed (wrong role, or not signed in)
--   AKS02  a field failed validation (the message names the field)
--   AKS08  the row is not in a state that allows this
--   AKS29  rate limited
--   AKR02  the version changed since the person looked at it (content hash differs)

-- ===========================================================================
-- 1. Author and publisher sign-off from the Studio (F-039)
-- ===========================================================================

-- The caller's role in an organisation, or null.
create or replace function app.org_role_of(p_org uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.org_members m where m.org_id = p_org and m.user_id = app.uid()
$$;

-- The author or publisher signs the exact content they looked at. The page
-- passes the hash it showed; if the version's hash differs the sign-off is
-- refused with AKR02. The row itself is written by public.record_signoff
-- (0016), which checks the role again and writes the audit entry.
--   author     any member who may write workbooks (owner, editor, author)
--   publisher  an owner or editor of a publisher or author company
-- A second sign-off of the same kind, hash and person returns the first.
create or replace function app.author_signoff(
  p_version uuid, p_content_hash text, p_kind text, p_signer_name text, p_note text default null
) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v      public.workbook_versions%rowtype;
  w      public.workbooks%rowtype;
  o      public.organisations%rowtype;
  v_role text;
  v_name text := app.clean_text(p_signer_name, 200);
  v_note text := app.clean_text(p_note, 500);
  v_id   uuid;
  n      int;
begin
  if app.uid() is null then
    raise exception 'sign in first' using errcode = 'AKS01';
  end if;
  if p_kind is null or p_kind not in ('author','publisher') then
    raise exception 'studio_invalid: kind' using errcode = 'AKS02';
  end if;
  select * into v from public.workbook_versions x where x.id = p_version;
  if not found then
    raise exception 'studio_invalid: version' using errcode = 'AKS02';
  end if;
  select * into w from public.workbooks x where x.id = v.workbook_id;
  select * into o from public.organisations x where x.id = w.org_id;
  if not app.org_can(w.org_id, 'workbooks', 'write') then
    raise exception 'not allowed' using errcode = 'AKS01';
  end if;
  v_role := app.org_role_of(w.org_id);
  if p_kind = 'publisher' and (v_role not in ('owner','editor') or o.kind not in ('publisher','author_company')) then
    raise exception 'a publisher sign-off is given by an owner or editor of a publisher' using errcode = 'AKS01';
  end if;
  if v_name is null or v_name ~ '[<>]' then
    raise exception 'studio_invalid: signer_name' using errcode = 'AKS02';
  end if;
  if v_note is not null and v_note ~ '[<>]' then
    raise exception 'studio_invalid: note' using errcode = 'AKS02';
  end if;
  if p_content_hash is null or p_content_hash is distinct from v.content_hash then
    raise exception 'the version changed since you looked at it' using errcode = 'AKR02';
  end if;
  if v.published_at is not null or w.status = 'retired' then
    raise exception 'this version cannot be signed off' using errcode = 'AKS08';
  end if;

  select x.id into v_id from public.release_signoffs x
   where x.version_id = v.id and x.content_hash = v.content_hash and x.kind = p_kind and x.recorded_by = app.uid()
   limit 1;
  if v_id is not null then return v_id; end if;

  select count(*) into n from public.audit_log a
   where a.action = 'release.signoff' and a.org_id = w.org_id and a.at > now() - interval '1 day';
  if n >= 30 then
    raise exception 'too many sign-offs today' using errcode = 'AKS29';
  end if;

  return public.record_signoff(v.id, p_kind, v_name, null, null, v_note);
end $$;

-- What a version still needs before release, for the owning organisation.
-- The same rows the staff queue reads (app.release_requirements, 0016).
create or replace function app.studio_release_status(p_version uuid)
returns table (requirement text, required boolean, met boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if app.uid() is null or not app.can_read_workbook(app.version_workbook(p_version)) then
    raise exception 'not allowed' using errcode = 'AKS01';
  end if;
  return query select r.requirement, r.required, r.met from app.release_requirements(p_version) r;
end $$;

-- ===========================================================================
-- 2. Pricing from the ladder (F-040)
-- ===========================================================================

-- The author's choice of a ladder point (0004 price_points, kind workbook)
-- and whether the title is in the membership, waiting for staff. The price
-- that checkout charges stays workbooks.price_point_id, which only staff
-- approval sets. Figures live on price_points and are placeholders until
-- Crent sets them; nothing here holds an amount.
create table public.workbook_price_choices (
  workbook_id    uuid primary key references public.workbooks(id) on delete cascade,
  org_id         uuid not null references public.organisations(id),
  price_point_id text not null references public.price_points(id),
  in_membership  boolean not null,
  status         text not null default 'pending' check (status in ('pending','approved','declined')),
  chosen_by      uuid references auth.users(id) on delete set null,
  chosen_at      timestamptz not null default now(),
  reviewed_by    uuid references auth.users(id) on delete set null,
  reviewed_at    timestamptz,
  review_reason  text check (review_reason is null or char_length(review_reason) <= 500),
  constraint workbook_price_choices_reviewed check ((status = 'pending') = (reviewed_at is null))
);
create index workbook_price_choices_org_idx on public.workbook_price_choices(org_id);
create index workbook_price_choices_pending_idx on public.workbook_price_choices(chosen_at) where status = 'pending';

-- Org members may update their workbooks (0002), but the price is set only
-- by staff approval or server code. Runs as the caller, like the 0009
-- membership guard.
create or replace function app.guard_workbook_price() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated') and not app.is_platform(array['owner','editor']) then
    if (tg_op = 'INSERT' and new.price_point_id is not null)
       or (tg_op = 'UPDATE' and new.price_point_id is distinct from old.price_point_id) then
      raise exception 'the price is set when Akana approves the price choice' using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end $$;
create trigger workbooks_price_guard before insert or update of price_point_id on public.workbooks
  for each row execute function app.guard_workbook_price();

-- Whether the licence lets this workbook into the membership. Demo, house
-- and public-domain titles need no author licence (0013). Otherwise the
-- newest licence for the book that is active, waiting for verification, or
-- a demo organisation's test signature decides.
create or replace function app.licence_allows_membership(p_workbook uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.workbook_licence_exempt(p_workbook) or coalesce((
    select l.subscription_included from public.licences l
    join public.workbooks w on w.book_id = l.book_id
    where w.id = p_workbook and l.status in ('active','pending_verification','test_only')
    order by l.signed_at desc limit 1), false)
$$;

create or replace function app.price_choose(p_workbook uuid, p_point text, p_in_membership boolean)
returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  w public.workbooks%rowtype;
  c public.workbook_price_choices%rowtype;
  n int;
begin
  select * into w from public.workbooks x where x.id = p_workbook;
  if not found or app.uid() is null or not app.org_can(w.org_id, 'workbooks', 'write') then
    raise exception 'not allowed' using errcode = 'AKS01';
  end if;
  if w.is_demo or w.status = 'retired' then
    raise exception 'this workbook cannot be priced' using errcode = 'AKS08';
  end if;
  if p_point is null or not exists (select 1 from public.price_points p where p.id = p_point and p.kind = 'workbook') then
    raise exception 'studio_invalid: price_point' using errcode = 'AKS02';
  end if;
  if p_in_membership is null then
    raise exception 'studio_invalid: in_membership' using errcode = 'AKS02';
  end if;
  if p_in_membership and not app.licence_allows_membership(w.id) then
    raise exception 'studio_invalid: in_membership' using errcode = 'AKS02';
  end if;
  select count(*) into n from public.audit_log a
   where a.action = 'price.chosen' and a.org_id = w.org_id and a.at > now() - interval '1 day';
  if n >= 30 then
    raise exception 'too many price changes today' using errcode = 'AKS29';
  end if;

  select * into c from public.workbook_price_choices x where x.workbook_id = w.id for update;
  insert into public.workbook_price_choices (workbook_id, org_id, price_point_id, in_membership, status, chosen_by)
  values (w.id, w.org_id, p_point, p_in_membership, 'pending', app.uid())
  on conflict (workbook_id) do update set
    price_point_id = excluded.price_point_id, in_membership = excluded.in_membership, status = 'pending',
    chosen_by = excluded.chosen_by, chosen_at = now(), reviewed_by = null, reviewed_at = null, review_reason = null;

  perform app.audit('price.chosen', 'workbook:' || w.id::text, null, w.tenant_id, w.org_id,
    case when c.workbook_id is null then null
         else jsonb_build_object('price_point_id', c.price_point_id, 'in_membership', c.in_membership, 'status', c.status) end,
    jsonb_build_object('price_point_id', p_point, 'in_membership', p_in_membership, 'code', w.code));
  return 'pending';
end $$;

-- Staff approve or decline the choice. Approval copies it onto the workbook,
-- which is what the store and checkout read. A decline needs a reason, which
-- the author sees.
create or replace function app.price_review(p_workbook uuid, p_approve boolean, p_reason text)
returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  c        public.workbook_price_choices%rowtype;
  w        public.workbooks%rowtype;
  v_reason text := app.clean_text(p_reason, 500);
  v_status text := case when p_approve then 'approved' else 'declined' end;
begin
  if not app.studio_staff() then
    raise exception 'only platform owners and editors review a price' using errcode = 'insufficient_privilege';
  end if;
  if p_approve is null then
    raise exception 'approve or decline' using errcode = 'invalid_parameter_value';
  end if;
  select * into c from public.workbook_price_choices x where x.workbook_id = p_workbook for update;
  if not found or c.status <> 'pending' then
    raise exception 'no price choice waiting' using errcode = 'object_not_in_prerequisite_state';
  end if;
  if not p_approve and v_reason is null then
    raise exception 'a reason is needed to decline' using errcode = 'check_violation';
  end if;
  select * into w from public.workbooks x where x.id = p_workbook for update;
  if p_approve and c.in_membership and not app.licence_allows_membership(w.id) then
    raise exception 'the licence does not include the membership' using errcode = 'check_violation';
  end if;

  update public.workbook_price_choices x
     set status = v_status, reviewed_by = app.uid(), reviewed_at = now(), review_reason = v_reason
   where x.workbook_id = c.workbook_id;
  if p_approve then
    update public.workbooks x set price_point_id = c.price_point_id, in_membership = c.in_membership where x.id = w.id;
  end if;

  perform app.audit('price.' || v_status, 'workbook:' || w.id::text, v_reason, w.tenant_id, w.org_id,
    jsonb_build_object('price_point_id', w.price_point_id, 'in_membership', w.in_membership),
    jsonb_build_object('price_point_id', c.price_point_id, 'in_membership', c.in_membership, 'code', w.code, 'status', v_status));
  return v_status;
end $$;

-- ===========================================================================
-- 3. Who gets the author status emails (F-043)
-- ===========================================================================

-- The owning organisation's owners, editors and authors, for the staff
-- action that just moved the workbook on. Never a reader, and never a
-- finance or viewer member. Reviewers only.
create or replace function app.author_mail_recipients(p_workbook uuid)
returns table (email text, display_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_reviewer() then
    raise exception 'only reviewers read author contacts' using errcode = 'insufficient_privilege';
  end if;
  return query
    select lower(u.email)::text, p.display_name
    from public.workbooks w
    join public.organisations o on o.id = w.org_id and o.kind <> 'akana_house'
    join public.org_members m on m.org_id = w.org_id and m.role in ('owner','editor','author')
    join auth.users u on u.id = m.user_id
    left join public.profiles p on p.user_id = m.user_id
    where w.id = p_workbook and u.email is not null
    order by case m.role when 'owner' then 0 when 'author' then 1 else 2 end, m.created_at
    limit 20;
end $$;

-- ===========================================================================
-- 4. Staff JSON editor: save as a new version (F-086)
-- ===========================================================================

-- The server runs @akana/validate on the JSON, computes the content hash
-- (packages/schema contentHash) and passes both. The save is refused when
-- the validator found errors, when nothing changed, or when the JSON names a
-- different workbook code. The new version is never published here; it goes
-- through the 0016 gate like any other. Its validator row is written in the
-- same transaction, against its own hash. p_base is the version edited, or
-- null for the first version of a workbook that has none.
create or replace function app.staff_save_version(
  p_workbook uuid, p_base uuid, p_content jsonb, p_content_hash text, p_errors int, p_warnings int
) returns table (version_id uuid, semver text)
language plpgsql volatile security definer set search_path = '' as $$
declare
  w       public.workbooks%rowtype;
  b       public.workbook_versions%rowtype;
  v_last  text;
  v_parts int[];
  v_semver text;
  v_id    uuid;
begin
  if not app.studio_staff() then
    raise exception 'only platform owners and editors save a version' using errcode = 'insufficient_privilege';
  end if;
  if p_workbook is null or p_content is null or p_errors is null or p_warnings is null or p_warnings < 0 then
    raise exception 'workbook, content and validator counts are required' using errcode = 'invalid_parameter_value';
  end if;
  if p_errors <> 0 then
    raise exception 'a version with validator errors cannot be saved' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p_content) <> 'object' or octet_length(p_content::text) > 2000000 then
    raise exception 'the content must be one JSON object of 2 MB or less' using errcode = 'check_violation';
  end if;
  if p_content_hash is null or p_content_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'a content hash is required' using errcode = 'invalid_parameter_value';
  end if;
  select * into w from public.workbooks x where x.id = p_workbook for update;
  if not found then
    raise exception 'workbook % not found', p_workbook using errcode = 'no_data_found';
  end if;
  if w.status = 'retired' then
    raise exception 'a retired workbook takes no new versions' using errcode = 'object_not_in_prerequisite_state';
  end if;
  if p_content->>'code' is distinct from w.code then
    raise exception 'the code in the JSON must stay %', w.code using errcode = 'check_violation';
  end if;

  if p_base is null then
    if exists (select 1 from public.workbook_versions x where x.workbook_id = w.id) then
      raise exception 'start from the latest version' using errcode = 'invalid_parameter_value';
    end if;
    v_semver := '1.0.0';
  else
    select * into b from public.workbook_versions x where x.id = p_base;
    if not found or b.workbook_id <> w.id then
      raise exception 'version % not found for this workbook', p_base using errcode = 'no_data_found';
    end if;
    if b.content_hash = p_content_hash then
      raise exception 'nothing changed' using errcode = 'check_violation';
    end if;
    select x.semver into v_last from public.workbook_versions x where x.workbook_id = w.id
     order by string_to_array(x.semver, '.')::int[] desc limit 1;
    v_parts := string_to_array(v_last, '.')::int[];
    v_semver := v_parts[1] || '.' || v_parts[2] || '.' || (v_parts[3] + 1);
  end if;

  insert into public.workbook_versions (workbook_id, semver, schema_version, content, content_hash, validated_at)
  values (w.id, v_semver, coalesce(nullif(p_content->>'schema_version', ''), '3.0'), p_content, p_content_hash, now())
  returning id into v_id;
  insert into public.review_validations (version_id, content_hash, ok, error_count, warning_count, validated_by)
  values (v_id, p_content_hash, true, 0, p_warnings, app.uid());
  -- A draft goes into the review queue with its first saved version.
  if w.status = 'draft' then
    update public.workbooks x set status = 'in_review' where x.id = w.id;
  end if;

  perform app.audit('workbook.version_saved', 'workbook_version:' || v_id::text, null, w.tenant_id, w.org_id,
    case when p_base is null then null else jsonb_build_object('version_id', b.id, 'semver', b.semver, 'content_hash', b.content_hash) end,
    jsonb_build_object('version_id', v_id, 'semver', v_semver, 'content_hash', p_content_hash, 'code', w.code,
                       'warnings', p_warnings, 'status', case when w.status = 'draft' then 'in_review' else w.status end));
  return query select v_id, v_semver;
end $$;

-- ===========================================================================
-- 5. RPC wrappers. Security invoker: the app functions do the checks.
-- ===========================================================================
create or replace function public.author_signoff(
  p_version uuid, p_content_hash text, p_kind text, p_signer_name text, p_note text default null) returns uuid
language sql volatile security invoker set search_path = '' as $$
  select app.author_signoff(p_version, p_content_hash, p_kind, p_signer_name, p_note) $$;
create or replace function public.studio_release_status(p_version uuid)
returns table (requirement text, required boolean, met boolean)
language sql stable security invoker set search_path = '' as $$ select * from app.studio_release_status(p_version) $$;
create or replace function public.price_choose(p_workbook uuid, p_point text, p_in_membership boolean) returns text
language sql volatile security invoker set search_path = '' as $$ select app.price_choose(p_workbook, p_point, p_in_membership) $$;
create or replace function public.price_review(p_workbook uuid, p_approve boolean, p_reason text) returns text
language sql volatile security invoker set search_path = '' as $$ select app.price_review(p_workbook, p_approve, p_reason) $$;
create or replace function public.licence_allows_membership(p_workbook uuid) returns boolean
language sql stable security invoker set search_path = '' as $$
  select case when app.can_read_workbook(p_workbook) then app.licence_allows_membership(p_workbook) else false end $$;
create or replace function public.author_mail_recipients(p_workbook uuid) returns table (email text, display_name text)
language sql stable security invoker set search_path = '' as $$ select * from app.author_mail_recipients(p_workbook) $$;
create or replace function public.staff_save_version(
  p_workbook uuid, p_base uuid, p_content jsonb, p_content_hash text, p_errors int, p_warnings int)
returns table (version_id uuid, semver text)
language sql volatile security invoker set search_path = '' as $$
  select * from app.staff_save_version(p_workbook, p_base, p_content, p_content_hash, p_errors, p_warnings) $$;

-- Execute: revoke from everyone, then give back to the one role that needs it.
revoke execute on function
  app.org_role_of(uuid), app.author_signoff(uuid, text, text, text, text), app.studio_release_status(uuid),
  app.guard_workbook_price(), app.licence_allows_membership(uuid), app.price_choose(uuid, text, boolean),
  app.price_review(uuid, boolean, text), app.author_mail_recipients(uuid),
  app.staff_save_version(uuid, uuid, jsonb, text, int, int)
  from public, anon, authenticated;
revoke execute on function
  public.author_signoff(uuid, text, text, text, text), public.studio_release_status(uuid),
  public.price_choose(uuid, text, boolean), public.price_review(uuid, boolean, text),
  public.licence_allows_membership(uuid), public.author_mail_recipients(uuid),
  public.staff_save_version(uuid, uuid, jsonb, text, int, int)
  from public, anon, authenticated;
grant execute on function
  app.author_signoff(uuid, text, text, text, text), app.studio_release_status(uuid),
  app.licence_allows_membership(uuid), app.price_choose(uuid, text, boolean),
  app.price_review(uuid, boolean, text), app.author_mail_recipients(uuid),
  app.staff_save_version(uuid, uuid, jsonb, text, int, int),
  public.author_signoff(uuid, text, text, text, text), public.studio_release_status(uuid),
  public.price_choose(uuid, text, boolean), public.price_review(uuid, boolean, text),
  public.licence_allows_membership(uuid), public.author_mail_recipients(uuid),
  public.staff_save_version(uuid, uuid, jsonb, text, int, int)
  to authenticated;

-- ===========================================================================
-- 6. Row level security. Reads only; every write goes through a function.
-- ===========================================================================
alter table public.workbook_price_choices enable row level security;
revoke all on public.workbook_price_choices from anon, authenticated;
grant select on public.workbook_price_choices to authenticated;
create policy workbook_price_choices_read on public.workbook_price_choices for select to authenticated
  using ((select app.org_can(org_id, 'workbooks', 'read')) or (select app.is_staff()));
grant select, insert, update, delete on public.workbook_price_choices to service_role;
