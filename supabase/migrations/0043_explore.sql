-- 0043 Explore, shelf pages and collections (build list 2.1, 2.2, 2.3).
--
-- What changes
--   1. public.shelves gains editors_line (the short line staff set for the
--      shelf page) and featured_workbook_id (the staff-chosen featured title).
--      Both are optional. A featured title that is not live, or not in the
--      shelf, is ignored by the page, which falls back to the most started.
--   2. public.collections and public.collection_items: hand-curated groups of
--      titles across shelves. A collection has a slug, a name, one line, a
--      cover (a genre id for the tint and accent, and an optional pattern from
--      the cover pattern list in apps/web/lib/covers.ts), a status and an
--      ordered list of titles. Everyone reads live collections. Nobody writes
--      the tables directly: staff use public.save_collection and
--      public.delete_collection, which check the role and write the audit row.
--   3. public.set_shelf_editorial: platform owners and editors set the
--      editor's line and the featured title of one shelf.
--   4. public.explore_signals: per live workbook, how many readers started
--      and how many finished, for the Explore rails. Counts only. The page
--      applies its own minimum before it ranks by finish rate.
--
-- Same rules as 0001 to 0035. Functions are security definer with search_path
-- pinned to ''. Every function a client may call has execute revoked from
-- public first and granted back to the roles that need it. Nothing earlier is
-- edited. Depends on 0001, 0002, 0003 and 0015.
--
-- Error codes:
--   AKE01  collection slug is not valid
--   AKE02  collection name or line is missing or too long
--   AKE03  a title code in the list is not a workbook
--   AKE04  collection not found
--   AKE05  shelf not found
--   AKE06  featured title code is not a workbook
--   AKE07  cover genre or pattern not recognised
--   AKE08  editor's line is too long
--   AKE09  status not recognised

-- ---------------------------------------------------------------------------
-- 1. Shelf editorial fields.
-- ---------------------------------------------------------------------------
alter table public.shelves
  add column if not exists editors_line         text check (editors_line is null or char_length(editors_line) <= 280),
  add column if not exists featured_workbook_id uuid references public.workbooks(id) on delete set null;

comment on column public.shelves.editors_line is 'A short line from staff, shown at the top of the shelf page. Optional.';
comment on column public.shelves.featured_workbook_id is 'The staff-chosen featured title for the shelf page. Ignored when it is not live or not on the shelf.';

-- ---------------------------------------------------------------------------
-- 2. Collections.
-- ---------------------------------------------------------------------------
create table public.collections (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  name         text not null check (char_length(btrim(name)) between 1 and 80),
  line         text not null default '' check (char_length(line) <= 200),
  cover_genre  text not null default 'personal_development' references public.genres(id),
  cover_pattern text check (cover_pattern is null or cover_pattern in
                 ('waves','steps','rings','dots','diagonals','chevrons','grid','bars','columns','arcs','crosses')),
  status       text not null default 'draft' check (status in ('draft','live')),
  sort         int  not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index collections_live_idx on public.collections(sort, name) where status = 'live';

create table public.collection_items (
  collection_id uuid not null references public.collections(id) on delete cascade,
  workbook_id   uuid not null references public.workbooks(id) on delete cascade,
  position      int  not null check (position >= 1),
  primary key (collection_id, workbook_id),
  unique (collection_id, position) deferrable initially deferred
);
create index collection_items_workbook_idx on public.collection_items(workbook_id);

alter table public.collections enable row level security;
alter table public.collection_items enable row level security;
revoke all on public.collections, public.collection_items from public, anon, authenticated;
grant select on public.collections, public.collection_items to anon, authenticated;

create policy collections_read on public.collections for select to anon, authenticated
  using (status = 'live' or (select app.is_staff()));
create policy collection_items_read on public.collection_items for select to anon, authenticated
  using (exists (select 1 from public.collections c where c.id = collection_id and (c.status = 'live' or (select app.is_staff()))));

-- ---------------------------------------------------------------------------
-- 3. save_collection: create (p_id null) or replace one collection and its
--    ordered titles. p_codes is the list of AK codes in display order.
-- ---------------------------------------------------------------------------
create or replace function public.save_collection(
  p_id uuid, p_slug text, p_name text, p_line text, p_cover_genre text, p_cover_pattern text,
  p_status text, p_sort int, p_codes text[]
) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id    uuid := p_id;
  v_slug  text := lower(btrim(coalesce(p_slug, '')));
  v_name  text := btrim(coalesce(p_name, ''));
  v_line  text := btrim(coalesce(p_line, ''));
  v_codes text[] := coalesce(p_codes, '{}');
  v_found int;
  v_dupes int;
begin
  if not app.is_platform(array['owner','editor']) then
    raise exception 'only platform owners and editors curate collections' using errcode = 'insufficient_privilege';
  end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(v_slug) > 60 then
    raise exception 'that is not a valid collection slug' using errcode = 'AKE01';
  end if;
  if char_length(v_name) not between 1 and 80 or char_length(v_line) > 200 then
    raise exception 'a collection needs a name of up to 80 characters and a line of up to 200' using errcode = 'AKE02';
  end if;
  if p_status not in ('draft','live') then
    raise exception 'status must be draft or live' using errcode = 'AKE09';
  end if;
  if not exists (select 1 from public.genres g where g.id = p_cover_genre)
     or (p_cover_pattern is not null and p_cover_pattern not in
         ('waves','steps','rings','dots','diagonals','chevrons','grid','bars','columns','arcs','crosses')) then
    raise exception 'cover genre or pattern not recognised' using errcode = 'AKE07';
  end if;

  select count(distinct c), count(*) - count(distinct c) into v_found, v_dupes from unnest(v_codes) as c;
  if v_dupes > 0 or v_found <> (select count(*) from public.workbooks w where w.code = any (v_codes)) then
    raise exception 'every title code must be a workbook and appear once' using errcode = 'AKE03';
  end if;

  if v_id is null then
    insert into public.collections (slug, name, line, cover_genre, cover_pattern, status, sort)
    values (v_slug, v_name, v_line, p_cover_genre, p_cover_pattern, p_status, coalesce(p_sort, 0))
    returning id into v_id;
  else
    update public.collections
       set slug = v_slug, name = v_name, line = v_line, cover_genre = p_cover_genre, cover_pattern = p_cover_pattern,
           status = p_status, sort = coalesce(p_sort, 0), updated_at = now()
     where id = v_id;
    if not found then
      raise exception 'collection not found' using errcode = 'AKE04';
    end if;
    delete from public.collection_items where collection_id = v_id;
  end if;

  insert into public.collection_items (collection_id, workbook_id, position)
  select v_id, w.id, o.ord
    from unnest(v_codes) with ordinality as o(code, ord)
    join public.workbooks w on w.code = o.code;

  perform app.audit('collection.saved', 'collection:' || v_slug, null, null, null,
    null, jsonb_build_object('status', p_status, 'titles', cardinality(v_codes)));
  return v_id;
end $$;

revoke execute on function public.save_collection(uuid, text, text, text, text, text, text, int, text[]) from public, anon;
grant execute on function public.save_collection(uuid, text, text, text, text, text, text, int, text[]) to authenticated;

create or replace function public.delete_collection(p_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_slug text;
begin
  if not app.is_platform(array['owner','editor']) then
    raise exception 'only platform owners and editors curate collections' using errcode = 'insufficient_privilege';
  end if;
  delete from public.collections where id = p_id returning slug into v_slug;
  if not found then
    raise exception 'collection not found' using errcode = 'AKE04';
  end if;
  perform app.audit('collection.deleted', 'collection:' || v_slug, null, null, null, null, null);
end $$;

revoke execute on function public.delete_collection(uuid) from public, anon;
grant execute on function public.delete_collection(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. set_shelf_editorial: the editor's line and the featured title (by AK
--    code, or null to clear it).
-- ---------------------------------------------------------------------------
create or replace function public.set_shelf_editorial(p_shelf text, p_line text, p_featured_code text)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_line text := nullif(btrim(coalesce(p_line, '')), '');
  v_wb   uuid;
begin
  if not app.is_platform(array['owner','editor']) then
    raise exception 'only platform owners and editors set a shelf page' using errcode = 'insufficient_privilege';
  end if;
  if v_line is not null and char_length(v_line) > 280 then
    raise exception 'the editor''s line is up to 280 characters' using errcode = 'AKE08';
  end if;
  if p_featured_code is not null and btrim(p_featured_code) <> '' then
    select w.id into v_wb from public.workbooks w where w.code = upper(btrim(p_featured_code));
    if v_wb is null then
      raise exception 'that title code is not a workbook' using errcode = 'AKE06';
    end if;
  end if;
  update public.shelves set editors_line = v_line, featured_workbook_id = v_wb where id = p_shelf;
  if not found then
    raise exception 'shelf not found' using errcode = 'AKE05';
  end if;
  perform app.audit('shelf.editorial', 'shelf:' || p_shelf, null, null, null,
    null, jsonb_build_object('has_line', v_line is not null, 'featured', v_wb is not null));
end $$;

revoke execute on function public.set_shelf_editorial(text, text, text) from public, anon;
grant execute on function public.set_shelf_editorial(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. explore_signals: counts per live workbook on one tenant. starts is every
--    enrolment; finishes is those with status finished. No reader is named
--    and no answer is touched. The page withholds a finish rate until a title
--    has enough starts (apps/web/lib/explore.ts).
-- ---------------------------------------------------------------------------
create or replace function public.explore_signals(p_tenant uuid)
returns table (workbook_id uuid, starts bigint, finishes bigint)
language sql stable security definer set search_path = '' as $$
  select e.workbook_id, count(*), count(*) filter (where e.status = 'finished')
    from public.enrolments e
    join public.workbooks w on w.id = e.workbook_id and w.status = 'live' and w.tenant_id = p_tenant
   where e.tenant_id = p_tenant
   group by e.workbook_id
$$;

revoke execute on function public.explore_signals(uuid) from public;
grant execute on function public.explore_signals(uuid) to anon, authenticated;
