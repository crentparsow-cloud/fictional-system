-- 0008 Admin controls: tenant column grants, the audited kill switch,
-- staff-created organisations, a free toolkit and the tenant lookup.
--
-- Same rules as 0001 to 0007. Functions are security definer with
-- search_path pinned to ''. Every function an RPC client may call has execute
-- revoked from public first and granted back to the one role that needs it.
-- Nothing in 0001 to 0007 is edited; where a function changes it is replaced
-- here with create or replace.

-- ---------------------------------------------------------------------------
-- 1. Tenants: column-level select.
--
-- tenants_read (0001) lets anon and authenticated read every row, which is
-- right for the storefront, but the table-level grant also handed out every
-- column. stripe_account_id is a connected account id and plan is a billing
-- detail; neither belongs to the public. The row policy stays as it is; the
-- column grant below decides what can be selected. As with authors.legal_name
-- (0002), clients must name their columns: select * now fails for these roles.
-- Server code on the service role still reads every column.
-- ---------------------------------------------------------------------------
revoke select on public.tenants from anon, authenticated;
grant select (id, slug, kind, org_id, name, brand, default_locale, default_currency, seller_of_record,
              status, is_demo, created_at, updated_at)
  on public.tenants to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Kill switch with an audit row (F-083, F-081).
--
-- Moves a workbook between live and paused, and nothing else. Platform owners
-- and editors only. A reason is required both ways and goes into the audit
-- log with the before and after status. The row is locked, so two staff
-- acting at once get one change and one clear refusal.
-- ---------------------------------------------------------------------------
create or replace function public.set_workbook_paused(p_workbook uuid, p_paused boolean, p_reason text)
returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  w        public.workbooks%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_target text;
begin
  if not app.is_platform(array['owner','editor']) then
    raise exception 'only platform owners and editors pause or resume a workbook' using errcode = 'insufficient_privilege';
  end if;
  if p_workbook is null or p_paused is null then
    raise exception 'workbook and paused are both required' using errcode = 'invalid_parameter_value';
  end if;
  if v_reason is null then
    raise exception 'a reason is required to pause or resume a workbook' using errcode = 'check_violation';
  end if;
  if length(v_reason) > 500 then
    raise exception 'the reason must be 500 characters or fewer' using errcode = 'check_violation';
  end if;

  select * into w from public.workbooks where id = p_workbook for update;
  if not found then
    raise exception 'workbook % not found', p_workbook using errcode = 'no_data_found';
  end if;

  if p_paused and w.status <> 'live' then
    raise exception 'only a live workbook can be paused; % is %', w.code, w.status using errcode = 'object_not_in_prerequisite_state';
  end if;
  if not p_paused and w.status <> 'paused' then
    raise exception 'only a paused workbook can be resumed; % is %', w.code, w.status using errcode = 'object_not_in_prerequisite_state';
  end if;
  v_target := case when p_paused then 'paused' else 'live' end;

  update public.workbooks set status = v_target where id = w.id;

  perform app.audit(case when p_paused then 'workbook.paused' else 'workbook.resumed' end,
    'workbook:' || w.id::text, v_reason, w.tenant_id, w.org_id,
    jsonb_build_object('code', w.code, 'status', w.status),
    jsonb_build_object('code', w.code, 'status', v_target));
  return v_target;
end $$;

revoke execute on function public.set_workbook_paused(uuid, boolean, text) from public, anon;
grant execute on function public.set_workbook_paused(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Staff create organisations (F-082).
--
-- Codes follow packages/schema/src/codes.ts mintCode(): prefix plus five
-- Crockford base32 digits from sha256('akana:<key>:<n>'), least significant
-- digit first, with n raised on collision. Only the low 25 bits of the digest
-- are used, which are the last four bytes. The seed gives publishers a PB-
-- code and sole authors their AU- code; an author company is a publishing
-- business, so it gets PB- as well. The key is 'organisation:<new id>'.
-- ---------------------------------------------------------------------------
create or replace function app.mint_code(p_prefix text, p_key text, p_n int default 0) returns text
language plpgsql immutable set search_path = '' as $$
declare
  d   bytea := pg_catalog.sha256(pg_catalog.convert_to('akana:' || p_key || ':' || p_n::text, 'UTF8'));
  v   bigint;
  out text := '';
begin
  v := (get_byte(d, 28)::bigint << 24) | (get_byte(d, 29)::bigint << 16) | (get_byte(d, 30)::bigint << 8) | get_byte(d, 31)::bigint;
  for i in 1..5 loop
    out := out || substr('0123456789ABCDEFGHJKMNPQRSTVWXYZ', (v & 31)::int + 1, 1);
    v := v >> 5;
  end loop;
  return p_prefix || '-' || out;
end $$;
revoke execute on function app.mint_code(text, text, int) from public, anon, authenticated;

create or replace function public.create_organisation(
  p_kind text, p_display_name text, p_legal_name text, p_country text, p_slug text
) returns table (organisation_id uuid, organisation_code text, organisation_slug text)
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id      uuid := gen_random_uuid();
  v_display text := btrim(coalesce(p_display_name, ''));
  v_legal   text := btrim(coalesce(p_legal_name, ''));
  v_country text := upper(btrim(coalesce(p_country, '')));
  v_slug    text := lower(btrim(coalesce(p_slug, '')));
  v_prefix  text;
  v_code    text;
  v_n       int := 0;
begin
  if not app.is_platform(array['owner','editor']) then
    raise exception 'only platform owners and editors create organisations' using errcode = 'insufficient_privilege';
  end if;
  if p_kind = 'akana_house' then
    raise exception 'the Akana house organisation already exists and cannot be created again' using errcode = 'check_violation';
  end if;
  if p_kind is null or p_kind not in ('publisher','author_company','individual') then
    raise exception 'kind must be publisher, author_company or individual' using errcode = 'check_violation';
  end if;
  if v_display = '' or length(v_display) > 200 then
    raise exception 'display name is required, 200 characters or fewer' using errcode = 'check_violation';
  end if;
  if v_legal = '' or length(v_legal) > 300 then
    raise exception 'legal name is required, 300 characters or fewer' using errcode = 'check_violation';
  end if;
  if v_country !~ '^[A-Z]{2}$' then
    raise exception 'country must be a two-letter code' using errcode = 'check_violation';
  end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'slug must be lower case letters, digits and single hyphens' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.organisations o where o.slug = v_slug) then
    raise exception 'an organisation with slug % already exists', v_slug using errcode = 'unique_violation';
  end if;

  v_prefix := case when p_kind = 'individual' then 'AU' else 'PB' end;
  loop
    v_code := app.mint_code(v_prefix, 'organisation:' || v_id::text, v_n);
    exit when not exists (select 1 from public.organisations o where o.code = v_code)
          and not exists (select 1 from public.authors a where a.code = v_code);
    v_n := v_n + 1;
    if v_n > 100 then
      raise exception 'could not mint a free organisation code' using errcode = 'unique_violation';
    end if;
  end loop;

  insert into public.organisations (id, code, kind, legal_name, display_name, slug, country)
  values (v_id, v_code, p_kind, v_legal, v_display, v_slug, v_country);

  perform app.audit('organisation.created', 'organisation:' || v_id::text, null, null, v_id, null,
    jsonb_build_object('code', v_code, 'kind', p_kind, 'display_name', v_display, 'slug', v_slug, 'country', v_country));

  return query select v_id, v_code, v_slug;
end $$;

revoke execute on function public.create_organisation(text, text, text, text, text) from public, anon;
grant execute on function public.create_organisation(text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The toolkit is free before purchase.
--
-- app.publish_version from 0002, copied unchanged except that the toolkit
-- section is written with free = true. Sections already published keep the
-- flag they were given, so they are brought into line below. Sections are not
-- part of the immutable version row, so this does not touch published
-- content.
-- ---------------------------------------------------------------------------
create or replace function app.publish_version(p_version uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v           public.workbook_versions%rowtype;
  w           public.workbooks%rowtype;
  c           jsonb;
  v_free      int;
  v_unit      jsonb;
  v_number    int;
  v_exercises jsonb;
begin
  if not app.is_platform(array['owner','editor']) then
    raise exception 'only platform owners and editors publish a version' using errcode = 'insufficient_privilege';
  end if;

  select * into v from public.workbook_versions where id = p_version for update;
  if not found then
    raise exception 'version % not found', p_version using errcode = 'no_data_found';
  end if;
  if v.published_at is not null then
    raise exception 'version % is already published', p_version using errcode = 'object_not_in_prerequisite_state';
  end if;
  select * into w from public.workbooks where id = v.workbook_id for update;

  c := v.content - 'internal';
  if jsonb_typeof(c->'units') is distinct from 'array' or jsonb_typeof(c->'exercises') is distinct from 'array' then
    raise exception 'version % content has no units or exercises array', p_version using errcode = 'check_violation';
  end if;
  v_free := coalesce((c->'structure'->>'free_units')::int, 1);

  delete from public.workbook_sections where version_id = p_version;

  -- listing: the catalogue card and the programme outline, no exercise content
  insert into public.workbook_sections (version_id, kind, body, free) values (p_version, 'listing', jsonb_strip_nulls(jsonb_build_object(
    'schema_version',   c->'schema_version',
    'code',             c->'code',
    'slug',             c->'slug',
    'title',            c->'title',
    'short_title',      c->'short_title',
    'card_line',        c->'card_line',
    'tagline',          c->'tagline',
    'book',             c->'book',
    'author',           c->'author',
    'genre',            c->'genre',
    'theme_id',         c->'theme_id',
    'language',         c->'language',
    'spelling',         c->'spelling',
    'is_demo',          c->'is_demo',
    'depth',            c->'depth',
    'badge',            c->'badge',
    'safety_tier',      c->'safety_tier',
    'advice_guardrail', c->'advice_guardrail',
    'structure',        c->'structure',
    'outline', (select coalesce(jsonb_agg(jsonb_build_object('number', u->'number', 'stage', u->'stage', 'focus', u->'focus')
                                          order by (u->>'number')::int), '[]'::jsonb)
                from jsonb_array_elements(c->'units') u)
  )), true);

  -- start: welcome plus the instruments the reader meets before unit 1
  insert into public.workbook_sections (version_id, kind, body, free) values (p_version, 'start', jsonb_strip_nulls(jsonb_build_object(
    'start',         c->'start',
    'selfcheck',     c->'selfcheck',
    'checkin',       c->'checkin',
    'daily_check',   c->'daily_check',
    'plan_sections', coalesce(c->'plan_sections', '[]'::jsonb),
    'milestones',    coalesce(c->'milestones', '[]'::jsonb)
  )), true);

  -- one row per unit, with its exercises resolved in exercise_ids order
  for v_unit in select u from jsonb_array_elements(c->'units') as t(u) loop
    v_number := (v_unit->>'number')::int;
    select coalesce(jsonb_agg(e order by ids.ord), '[]'::jsonb) into v_exercises
    from jsonb_array_elements_text(v_unit->'exercise_ids') with ordinality as ids(id, ord)
    join jsonb_array_elements(c->'exercises') e on e->>'id' = ids.id;
    insert into public.workbook_sections (version_id, kind, unit_number, body, free)
    values (p_version, 'unit', v_number, v_unit || jsonb_build_object('exercises', v_exercises), v_number <= v_free);
  end loop;

  insert into public.workbook_sections (version_id, kind, body, free)
  values (p_version, 'toolkit', jsonb_build_object('cards', coalesce(c->'toolkit', '[]'::jsonb)), true);

  insert into public.workbook_sections (version_id, kind, body, free)
  values (p_version, 'finish', coalesce(c->'finish', '{}'::jsonb), false);

  if c ? 'keep_going' then
    insert into public.workbook_sections (version_id, kind, body, free)
    values (p_version, 'keep_going', c->'keep_going', false);
  end if;

  -- Help now is one tap away everywhere, so the hub is never behind a purchase.
  if c ? 'safety_hub' then
    insert into public.workbook_sections (version_id, kind, body, free)
    values (p_version, 'safety_hub', c->'safety_hub', true);
  end if;

  update public.workbook_versions set published_at = now() where id = p_version;
  update public.workbooks set current_version_id = p_version where id = w.id;

  perform app.audit('workbook.publish_version', 'workbook_version:' || p_version::text, null, w.tenant_id, w.org_id,
    jsonb_build_object('current_version_id', w.current_version_id),
    jsonb_build_object('current_version_id', p_version, 'workbook_id', w.id, 'semver', v.semver));
end $$;

update public.workbook_sections set free = true where kind = 'toolkit' and not free;

-- ---------------------------------------------------------------------------
-- 5. Tenant lookup for the proxy (F-066, docs/TENANT_RESOLUTION.md).
--
-- One exact, verified host in, at most one row out: the tenant id and the
-- fields the proxy needs. anon gets no select on tenant_domains, so the list
-- of hosts cannot be read; only a host the caller already knows resolves.
-- Status is returned so the caller can refuse a suspended or closed tenant.
-- The comparison is case-insensitive through citext (moved to the extensions
-- schema in 0002), named explicitly because search_path is empty.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_tenant(p_host text)
returns table (tenant_id uuid, slug text, kind text, status text)
language sql stable security definer set search_path = '' as $$
  select t.id, t.slug, t.kind, t.status
  from public.tenant_domains d
  join public.tenants t on t.id = d.tenant_id
  where p_host is not null
    and length(p_host) <= 253
    and d.host operator(extensions.=) p_host::extensions.citext
    and d.verified_at is not null
  limit 1
$$;

revoke execute on function public.resolve_tenant(text) from public;
grant execute on function public.resolve_tenant(text) to anon, authenticated, service_role;
