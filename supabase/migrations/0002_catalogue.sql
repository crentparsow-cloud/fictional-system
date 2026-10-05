-- 0002 Catalogue: genres, shelves, themes, authors, books, workbooks, versions,
-- sections and tenant listings (T1 catalogue policies, F-019 free unit).
--
-- Same rules as 0001. Every table has RLS on. Grants to anon and authenticated
-- are revoked for the new tables and given back table by table. Policies call
-- the app.* helpers as (select app.fn(...)) so Postgres evaluates them once
-- where it can. Writes to versions and sections are server only: the only path
-- from a client is app.publish_version(), which is platform staff only.
--
-- Entitlement-gated reads of paid sections arrive with the commerce migration
-- (app.has_entitlement); the place where that check slots in is marked below.

-- ---------------------------------------------------------------------------
-- Two advisor warnings carried from 0001.
-- ---------------------------------------------------------------------------

-- app.touch_updated_at() had no pinned search_path.
alter function app.touch_updated_at() set search_path = '';

-- citext lived in public. Move it to the extensions schema that Supabase puts
-- on the default search_path ("$user", public, extensions). The column
-- public.tenant_domains.host keeps its type (it is now extensions.citext, the
-- type's identity does not change on relocation). New code that names the type
-- explicitly should write extensions.citext. On plain Postgres, where the
-- extensions schema is not on the search_path, case-insensitive comparison
-- needs either the schema on the search_path or operator(extensions.=); the
-- 0002 test covers both forms.
create schema if not exists extensions;
alter extension citext set schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Genres: the fixed list from packages/schema GENRES. Guardrails say which
-- validator rules a genre runs. Wellbeing runs the full claims check; the
-- others run the reduced check plus income promise rules; finance and business
-- must carry an advice guardrail note.
-- ---------------------------------------------------------------------------
create table public.genres (
  id                  text primary key check (id in (
                        'wellbeing','personal_development','relationships','parenting','career','leadership',
                        'business','productivity','finance','education','life_skills')),
  name                text not null,
  default_safety_tier text not null default 'none' check (default_safety_tier in ('none','standard','higher')),
  guardrails          jsonb not null default '{}'::jsonb
);

insert into public.genres (id, name, default_safety_tier, guardrails) values
  ('wellbeing',            'Wellbeing',            'standard', '{"claims_check":"full","income_promise_rules":false,"advice_guardrail":false,"help_now":true}'),
  ('personal_development', 'Personal development', 'none',     '{"claims_check":"reduced","income_promise_rules":false,"advice_guardrail":false,"help_now":false}'),
  ('relationships',        'Relationships',        'none',     '{"claims_check":"reduced","income_promise_rules":false,"advice_guardrail":false,"help_now":false}'),
  ('parenting',            'Parenting',            'none',     '{"claims_check":"reduced","income_promise_rules":false,"advice_guardrail":false,"help_now":false}'),
  ('career',               'Career',               'none',     '{"claims_check":"reduced","income_promise_rules":true,"advice_guardrail":false,"help_now":false}'),
  ('leadership',           'Leadership',           'none',     '{"claims_check":"reduced","income_promise_rules":false,"advice_guardrail":false,"help_now":false}'),
  ('business',             'Business',             'none',     '{"claims_check":"reduced","income_promise_rules":true,"advice_guardrail":true,"help_now":false}'),
  ('productivity',         'Productivity',         'none',     '{"claims_check":"reduced","income_promise_rules":false,"advice_guardrail":false,"help_now":false}'),
  ('finance',              'Finance',              'none',     '{"claims_check":"reduced","income_promise_rules":true,"advice_guardrail":true,"help_now":false}'),
  ('education',            'Education',            'none',     '{"claims_check":"reduced","income_promise_rules":false,"advice_guardrail":false,"help_now":false}'),
  ('life_skills',          'Life skills',          'none',     '{"claims_check":"reduced","income_promise_rules":false,"advice_guardrail":false,"help_now":false}');

-- ---------------------------------------------------------------------------
-- Shelves, areas and themes. Themes are the shared positive shelves carried
-- from the old themes registry; a theme needs clearance (name searches) before
-- it goes live, and a minimum number of titles before it shows as a shelf.
-- Seeded by the demo seed loader, not here.
-- ---------------------------------------------------------------------------
create table public.shelves (
  id      text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name    text not null,
  status  text not null default 'proposed' check (status in ('proposed','active','retired')),
  sort    int  not null default 0
);

create table public.areas (
  id       text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  shelf_id text not null references public.shelves(id),
  name     text not null
);
create index areas_shelf_idx on public.areas(shelf_id);

create table public.themes (
  id               text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name             text not null,
  line             text,
  shelf_id         text references public.shelves(id),
  area_id          text references public.areas(id),
  topics           text[] not null default '{}',   -- hidden search terms, never shown
  clearance_status text not null default 'pending' check (clearance_status in ('pending','cleared','rejected')),
  min_books        int  not null default 3 check (min_books >= 0)
);
create index themes_shelf_idx on public.themes(shelf_id);
create index themes_area_idx on public.themes(area_id);

-- ---------------------------------------------------------------------------
-- Authors. A public identity with a permanent AU- code. legal_name is for
-- contracts and statements and is never served publicly: anon and
-- authenticated get column-level select on every column except legal_name.
-- Server code reads it with the service role. Note that a column-level grant
-- means clients must name their columns; select * fails for these roles.
-- ---------------------------------------------------------------------------
create table public.authors (
  id               uuid primary key default gen_random_uuid(),
  code             text unique check (code ~ '^AU-[0-9A-HJKMNP-TV-Z]{5}$'),
  org_id           uuid references public.organisations(id),
  slug             text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  display_name     text not null,
  legal_name       text,
  bio              text,
  country          char(2),
  photo_path       text,
  website          text,
  spelling         text not null default 'en-GB' check (spelling in ('en-GB','en-US')),
  is_demo          boolean not null default false,
  is_public_domain boolean not null default false,
  status           text not null default 'active' check (status in ('draft','active','retired')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index authors_org_idx on public.authors(org_id);
create trigger authors_touch before update on public.authors for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Books: the source title. Title-first identity, one row per edition used.
-- ---------------------------------------------------------------------------
create table public.books (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organisations(id),
  slug          text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title         text not null,
  subtitle      text,
  edition       text,
  language      text not null default 'en' check (language ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  isbns         jsonb not null default '[]'::jsonb,
  asin          text,
  store_links   jsonb not null default '{}'::jsonb,   -- by market, e.g. {"GB": "https://..."}
  cover_path    text,
  rights_status text not null default 'licensed' check (rights_status in ('licensed','public_domain','own_work')),
  publisher     text,
  year          int check (year is null or year between 1000 and 2100),
  is_demo       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index books_org_idx on public.books(org_id);
create trigger books_touch before update on public.books for each row execute function app.touch_updated_at();

-- Many authors per book, with a role. death_year feeds the public domain
-- evidence record for classics.
create table public.book_contributors (
  book_id    uuid not null references public.books(id) on delete cascade,
  author_id  uuid not null references public.authors(id),
  role       text not null default 'author' check (role in ('author','translator','editor')),
  death_year int check (death_year is null or death_year between 0 and 2100),
  sort       int not null default 0,
  primary key (book_id, author_id, role)
);
create index book_contributors_author_idx on public.book_contributors(author_id);

-- ---------------------------------------------------------------------------
-- Workbooks: the product identity. The AK- code is permanent and never reused,
-- so there is no delete grant; a workbook is retired instead. tenant_id is the
-- marketplace tenant that owns the listing, the akana tenant by default.
-- ---------------------------------------------------------------------------
create table public.workbooks (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique check (code ~ '^AK-[0-9A-HJKMNP-TV-Z]{5}$'),
  book_id            uuid not null references public.books(id),
  org_id             uuid not null references public.organisations(id),
  tenant_id          uuid not null default '00000000-0000-0000-0000-00000000000a' references public.tenants(id),
  slug               text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title              text not null,
  short_title        text,
  card_line          text not null default '',
  genre_id           text not null references public.genres(id),
  theme_id           text references public.themes(id),
  safety_tier        text not null default 'none' check (safety_tier in ('none','standard','higher')),
  depth              text not null default 'listing' check (depth in ('listing','outline','first_unit','full')),
  badge              text not null default 'official' check (badge in ('official','made_with_author','public_domain','demo')),
  is_demo            boolean not null default false,
  status             text not null default 'draft' check (status in ('draft','in_review','approved','live','paused','retired')),
  current_version_id uuid,
  licence_ref        text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- Demo content is labelled on every surface: a demo workbook carries the demo badge.
  constraint workbooks_demo_badge check (not is_demo or badge = 'demo')
);
create index workbooks_org_idx on public.workbooks(org_id);
create index workbooks_book_idx on public.workbooks(book_id);
create index workbooks_tenant_idx on public.workbooks(tenant_id);
create index workbooks_status_idx on public.workbooks(status) where status = 'live';
create index workbooks_genre_idx on public.workbooks(genre_id);
create index workbooks_theme_idx on public.workbooks(theme_id);
create trigger workbooks_touch before update on public.workbooks for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Versions: the full v3 document. Once published a version is immutable, so a
-- reader's enrolment can pin it. content keeps the internal block; the
-- sections built at publish time never carry it.
-- ---------------------------------------------------------------------------
create table public.workbook_versions (
  id                 uuid primary key default gen_random_uuid(),
  workbook_id        uuid not null references public.workbooks(id),
  semver             text not null check (semver ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  schema_version     text not null default '3.0',
  content            jsonb not null,
  content_hash       text not null check (content_hash ~ '^[0-9a-f]{64}$'),   -- sha256 hex of the canonical document
  validated_at       timestamptz,
  editor_approved_by uuid references auth.users(id),
  safety_approved_by uuid references auth.users(id),
  author_approved_by uuid references auth.users(id),
  published_at       timestamptz,
  created_at         timestamptz not null default now(),
  unique (workbook_id, semver)
);
create index workbook_versions_workbook_idx on public.workbook_versions(workbook_id);

alter table public.workbooks
  add constraint workbooks_current_version_fk foreign key (current_version_id) references public.workbook_versions(id);

-- ---------------------------------------------------------------------------
-- Sections: the published version split into loadable parts so RLS can gate
-- each one. listing is public for a public workbook. start and safety_hub are
-- marked free at publish time; unit N is free when N <= structure.free_units.
-- ---------------------------------------------------------------------------
create table public.workbook_sections (
  id          uuid primary key default gen_random_uuid(),
  version_id  uuid not null references public.workbook_versions(id) on delete cascade,
  kind        text not null check (kind in ('listing','start','unit','toolkit','finish','keep_going','safety_hub')),
  unit_number int check (unit_number is null or unit_number >= 1),
  body        jsonb not null,
  free        boolean not null default false,
  constraint workbook_sections_unit_number check ((kind = 'unit') = (unit_number is not null)),
  unique nulls not distinct (version_id, kind, unit_number)
);
create index workbook_sections_version_idx on public.workbook_sections(version_id);

-- ---------------------------------------------------------------------------
-- Tenant listings: which workbooks a storefront shows, with its own order.
-- ---------------------------------------------------------------------------
create table public.tenant_listings (
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  workbook_id uuid not null references public.workbooks(id) on delete cascade,
  visible     boolean not null default true,
  sort        int not null default 0,
  featured    boolean not null default false,
  primary key (tenant_id, workbook_id)
);
create index tenant_listings_workbook_idx on public.tenant_listings(workbook_id);

-- ---------------------------------------------------------------------------
-- Helper functions. Security definer, stable, search_path pinned. They read
-- the tables as owner, so policies that call them never recurse into RLS.
-- ---------------------------------------------------------------------------

-- A workbook is public when it is live and, for a demo title, the demo_visible
-- flag resolves true for its tenant and itself (workbook, then tenant, then global).
create or replace function app.workbook_is_public(p_workbook uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workbooks w
    where w.id = p_workbook and w.status = 'live'
      and (not w.is_demo or app.flag('demo_visible', w.tenant_id, w.id)))
$$;

-- Owning organisation members and staff read everything about a workbook.
create or replace function app.can_read_workbook(p_workbook uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_staff() or exists (
    select 1 from public.workbooks w
    where w.id = p_workbook and app.is_org_member(w.org_id))
$$;

-- Org members with workbooks write, or platform owners and editors.
create or replace function app.can_edit_workbook(p_workbook uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_platform(array['owner','editor']) or exists (
    select 1 from public.workbooks w
    where w.id = p_workbook and app.org_can(w.org_id, 'workbooks', 'write'))
$$;

-- An author or a book is public when at least one public workbook credits it.
create or replace function app.author_is_public(p_author uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.book_contributors bc
    join public.workbooks w on w.book_id = bc.book_id
    where bc.author_id = p_author and app.workbook_is_public(w.id))
$$;

create or replace function app.book_is_public(p_book uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workbooks w
    where w.book_id = p_book and app.workbook_is_public(w.id))
$$;

create or replace function app.version_workbook(p_version uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select workbook_id from public.workbook_versions where id = p_version
$$;

-- Tenant editors: the owning organisation's members with workbooks write, or staff.
create or replace function app.can_edit_tenant_listings(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_platform(array['owner','editor']) or exists (
    select 1 from public.tenants t
    where t.id = p_tenant and t.org_id is not null and app.org_can(t.org_id, 'workbooks', 'write'))
$$;

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------

-- A published version is immutable. Not security definer, so it runs as the
-- caller; it needs no table access of its own.
create or replace function app.guard_published_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.published_at is not null then
      raise exception 'published version % cannot be deleted', old.id using errcode = 'object_not_in_prerequisite_state';
    end if;
    return old;
  end if;
  if old.published_at is not null and (
       new.content        is distinct from old.content
    or new.content_hash   is distinct from old.content_hash
    or new.published_at   is distinct from old.published_at
    or new.workbook_id    is distinct from old.workbook_id
    or new.semver         is distinct from old.semver
    or new.schema_version is distinct from old.schema_version) then
    raise exception 'published version % is immutable', old.id using errcode = 'object_not_in_prerequisite_state';
  end if;
  return new;
end $$;
create trigger workbook_versions_immutable before update or delete on public.workbook_versions
  for each row execute function app.guard_published_version();

-- Organisation editors write drafts; only platform owners and editors move a
-- workbook to approved or live, and current_version_id is set by
-- app.publish_version() alone. Runs as the caller (not security definer) so
-- current_user is the client role; server code and security definer functions
-- pass through.
create or replace function app.guard_workbook_status() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated') and not app.is_platform(array['owner','editor']) then
    if tg_op = 'INSERT' and new.status not in ('draft','in_review') then
      raise exception 'a new workbook starts as draft or in_review' using errcode = 'insufficient_privilege';
    end if;
    if tg_op = 'INSERT' and new.current_version_id is not null then
      raise exception 'current_version_id is set by app.publish_version' using errcode = 'insufficient_privilege';
    end if;
    if tg_op = 'UPDATE' and new.status is distinct from old.status and new.status in ('approved','live') then
      raise exception 'only platform owners and editors approve or publish a workbook' using errcode = 'insufficient_privilege';
    end if;
    if tg_op = 'UPDATE' and new.current_version_id is distinct from old.current_version_id then
      raise exception 'current_version_id is set by app.publish_version' using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end $$;
create trigger workbooks_status_guard before insert or update on public.workbooks
  for each row execute function app.guard_workbook_status();

-- ---------------------------------------------------------------------------
-- Publish a version: platform owners and editors only. Marks the version
-- published, points the workbook at it, and splits the document into
-- sections. The internal block is dropped before anything is written to
-- sections. Unit sections carry the unit object plus its exercises, resolved
-- from content->'exercises' in exercise_ids order. free is true for listing,
-- start and safety_hub, and for unit N when N <= structure.free_units
-- (default 1, F-019).
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
  values (p_version, 'toolkit', jsonb_build_object('cards', coalesce(c->'toolkit', '[]'::jsonb)), false);

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

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.genres            enable row level security;
alter table public.shelves           enable row level security;
alter table public.areas             enable row level security;
alter table public.themes            enable row level security;
alter table public.authors           enable row level security;
alter table public.books             enable row level security;
alter table public.book_contributors enable row level security;
alter table public.workbooks         enable row level security;
alter table public.workbook_versions enable row level security;
alter table public.workbook_sections enable row level security;
alter table public.tenant_listings   enable row level security;

-- Only the new tables: 0001's grants stay as they are.
revoke all on public.genres, public.shelves, public.areas, public.themes, public.authors, public.books,
  public.book_contributors, public.workbooks, public.workbook_versions, public.workbook_sections, public.tenant_listings
  from anon, authenticated;

-- genres: read by everyone. Fixed list, written by migrations only.
grant select on public.genres to anon, authenticated;
create policy genres_read on public.genres for select to anon, authenticated using (true);

-- shelves, areas, themes: read by everyone; platform owners and editors curate them.
grant select on public.shelves to anon, authenticated;
grant insert, update, delete on public.shelves to authenticated;
create policy shelves_read on public.shelves for select to anon, authenticated using (true);
create policy shelves_write on public.shelves for all to authenticated
  using ((select app.is_platform(array['owner','editor'])))
  with check ((select app.is_platform(array['owner','editor'])));

grant select on public.areas to anon, authenticated;
grant insert, update, delete on public.areas to authenticated;
create policy areas_read on public.areas for select to anon, authenticated using (true);
create policy areas_write on public.areas for all to authenticated
  using ((select app.is_platform(array['owner','editor'])))
  with check ((select app.is_platform(array['owner','editor'])));

grant select on public.themes to anon, authenticated;
grant insert, update, delete on public.themes to authenticated;
create policy themes_read on public.themes for select to anon, authenticated using (true);
create policy themes_write on public.themes for all to authenticated
  using ((select app.is_platform(array['owner','editor'])))
  with check ((select app.is_platform(array['owner','editor'])));

-- authors: public when credited on a public workbook; members and staff see
-- their own. legal_name is left out of the column grant. Org members with
-- books write and platform owners and editors write.
grant select (id, code, org_id, slug, display_name, bio, country, photo_path, website, spelling,
              is_demo, is_public_domain, status, created_at, updated_at)
  on public.authors to anon, authenticated;
grant insert, update, delete on public.authors to authenticated;
create policy authors_read on public.authors for select to anon, authenticated
  using ((select app.author_is_public(id))
      or (org_id is not null and (select app.is_org_member(org_id)))
      or (select app.is_staff()));
create policy authors_write on public.authors for all to authenticated
  using ((org_id is not null and (select app.org_can(org_id, 'books', 'write'))) or (select app.is_platform(array['owner','editor'])))
  with check ((org_id is not null and (select app.org_can(org_id, 'books', 'write'))) or (select app.is_platform(array['owner','editor'])));

-- books: same shape as authors.
grant select on public.books to anon, authenticated;
grant insert, update, delete on public.books to authenticated;
create policy books_read on public.books for select to anon, authenticated
  using ((select app.book_is_public(id))
      or (select app.is_org_member(org_id))
      or (select app.is_staff()));
create policy books_write on public.books for all to authenticated
  using ((select app.org_can(org_id, 'books', 'write')) or (select app.is_platform(array['owner','editor'])))
  with check ((select app.org_can(org_id, 'books', 'write')) or (select app.is_platform(array['owner','editor'])));

-- book_contributors: visible with the book; written by whoever may write the book.
grant select on public.book_contributors to anon, authenticated;
grant insert, update, delete on public.book_contributors to authenticated;
create policy book_contributors_read on public.book_contributors for select to anon, authenticated
  using ((select app.book_is_public(book_id))
      or exists (select 1 from public.books b where b.id = book_id and ((select app.is_org_member(b.org_id)) or (select app.is_staff()))));
create policy book_contributors_write on public.book_contributors for all to authenticated
  using (exists (select 1 from public.books b where b.id = book_id
                 and ((select app.org_can(b.org_id, 'books', 'write')) or (select app.is_platform(array['owner','editor'])))))
  with check (exists (select 1 from public.books b where b.id = book_id
                 and ((select app.org_can(b.org_id, 'books', 'write')) or (select app.is_platform(array['owner','editor'])))));

-- workbooks: listing rows are public when the workbook is public; members and
-- staff read all of their own. Org members with workbooks write insert and
-- update their own; the status guard keeps approve and publish with staff.
-- No delete: codes are permanent, a workbook is retired.
grant select on public.workbooks to anon, authenticated;
grant insert, update on public.workbooks to authenticated;
create policy workbooks_read on public.workbooks for select to anon, authenticated
  using ((select app.workbook_is_public(id))
      or (select app.is_org_member(org_id))
      or (select app.is_staff()));
create policy workbooks_insert on public.workbooks for insert to authenticated
  with check ((select app.org_can(org_id, 'workbooks', 'write')) or (select app.is_platform(array['owner','editor'])));
create policy workbooks_update on public.workbooks for update to authenticated
  using ((select app.org_can(org_id, 'workbooks', 'write')) or (select app.is_platform(array['owner','editor'])))
  with check ((select app.org_can(org_id, 'workbooks', 'write')) or (select app.is_platform(array['owner','editor'])));

-- workbook_versions: content is for the owning organisation and staff only.
-- Readers get content through sections. No client writes; server code
-- inserts drafts and app.publish_version() publishes.
grant select on public.workbook_versions to authenticated;
create policy workbook_versions_read on public.workbook_versions for select to authenticated
  using ((select app.can_read_workbook(workbook_id)));

-- workbook_sections: listing is public for a public workbook; other kinds are
-- public only when free and the workbook is public; owning organisation
-- members and staff read everything. No client writes.
grant select on public.workbook_sections to anon, authenticated;
create policy workbook_sections_read on public.workbook_sections for select to anon, authenticated
  using (
    ((kind = 'listing' or free) and (select app.workbook_is_public(app.version_workbook(version_id))))
    or (select app.can_read_workbook(app.version_workbook(version_id)))
    -- Commerce migration: add
    --   or (select app.has_entitlement(app.uid(), <request tenant>, app.version_workbook(version_id), unit_number))
    -- so an entitled reader loads the paid units, toolkit, finish and keep_going.
  );

-- tenant_listings: read by everyone; written by the tenant's org editors and staff.
grant select on public.tenant_listings to anon, authenticated;
grant insert, update, delete on public.tenant_listings to authenticated;
create policy tenant_listings_read on public.tenant_listings for select to anon, authenticated using (true);
create policy tenant_listings_write on public.tenant_listings for all to authenticated
  using ((select app.can_edit_tenant_listings(tenant_id)))
  with check ((select app.can_edit_tenant_listings(tenant_id)));
