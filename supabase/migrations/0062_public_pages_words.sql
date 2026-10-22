-- 0062 Public pages and words (build list 7.6, 7.7, 7.10, 12.5).
--
-- What changes
--   1. public.themes.intro: a short paragraph staff write for a Theme page
--      (7.7). public.set_theme_intro saves it. Optional; the page shows
--      nothing when it is empty.
--   2. public.collections.starts_on and ends_on: the dates a seasonal
--      collection is shown (12.5). Both optional. Outside the window the
--      collection is hidden from everyone but staff; inside it, or with no
--      dates, it shows as before. public.set_collection_window saves the
--      dates. The policies on collections and collection_items are replaced
--      to apply the window. The dates are shown as dates. Nothing counts
--      down.
--   3. public.editorial_slots: the weekly editorial slot (7.10). Staff pick
--      one title or one Theme, a short heading and line, and a start and end
--      date. A live slot whose window covers today shows on Explore and the
--      public home page. public.save_editorial_slot and
--      public.delete_editorial_slot are the only write path.
--   4. public.staff_set_author_bio: staff set the approved bio of an author
--      directly (7.6), for authors with no Studio login such as authors of
--      public domain classics. Authors keep using the review flow from 0013.
--      The house style rules (no dashes, no emoji, no curly quotes, a length
--      limit) are checked here as well as in the app.
--
-- Same rules as 0001 to 0048. Functions are security definer with search_path
-- pinned to ''. Every function a client may call has execute revoked from
-- public first and granted back to the roles that need it. Nothing earlier is
-- edited. Depends on 0001, 0002, 0043.
--
-- Error codes:
--   AKP01  theme not found
--   AKP02  intro too long or breaks house style
--   AKP03  collection not found
--   AKP04  end date is before the start date
--   AKP05  slot needs a title or a Theme, a heading and valid dates
--   AKP06  slot not found
--   AKP07  title code or Theme not found
--   AKP08  author not found
--   AKP09  bio breaks house style or is too long
--   AKP10  slot window too long

-- ---------------------------------------------------------------------------
-- 1. Theme intros.
-- ---------------------------------------------------------------------------
alter table public.themes
  add column if not exists intro text check (intro is null or char_length(intro) <= 700);
comment on column public.themes.intro is 'A short paragraph from staff, shown on the Theme page (7.7). Optional. House style: no dashes, no emoji.';

create or replace function public.set_theme_intro(p_theme text, p_intro text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_intro text := nullif(btrim(coalesce(p_intro, '')), '');
begin
  if not app.is_platform(array['owner','editor']) then
    raise exception 'only platform owners and editors write Theme intros' using errcode = 'insufficient_privilege';
  end if;
  if v_intro is not null and (char_length(v_intro) > 700 or v_intro ~ '[—–‒―“”‘’…]') then
    raise exception 'a Theme intro is up to 700 characters, with no dashes or curly quotes' using errcode = 'AKP02';
  end if;
  update public.themes set intro = v_intro where id = p_theme;
  if not found then
    raise exception 'Theme not found' using errcode = 'AKP01';
  end if;
  perform app.audit('theme.intro', 'theme:' || p_theme, null, null, null, null, jsonb_build_object('has_intro', v_intro is not null));
end $$;

revoke execute on function public.set_theme_intro(text, text) from public, anon;
grant execute on function public.set_theme_intro(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Seasonal collections: a window of dates.
-- ---------------------------------------------------------------------------
alter table public.collections
  add column if not exists starts_on date,
  add column if not exists ends_on   date;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'collections_window_order') then
    alter table public.collections
      add constraint collections_window_order check (starts_on is null or ends_on is null or ends_on >= starts_on);
  end if;
end $$;
comment on column public.collections.starts_on is 'First day (UK date) a seasonal collection shows. Null means no start limit.';
comment on column public.collections.ends_on   is 'Last day (UK date) a seasonal collection shows. Null means no end limit.';

drop policy if exists collections_read on public.collections;
create policy collections_read on public.collections for select to anon, authenticated
  using (
    (select app.is_staff())
    or (status = 'live'
        and (starts_on is null or starts_on <= (now() at time zone 'Europe/London')::date)
        and (ends_on   is null or ends_on   >= (now() at time zone 'Europe/London')::date))
  );

drop policy if exists collection_items_read on public.collection_items;
create policy collection_items_read on public.collection_items for select to anon, authenticated
  using (
    (select app.is_staff())
    or exists (select 1 from public.collections c
                where c.id = collection_id
                  and c.status = 'live'
                  and (c.starts_on is null or c.starts_on <= (now() at time zone 'Europe/London')::date)
                  and (c.ends_on   is null or c.ends_on   >= (now() at time zone 'Europe/London')::date))
  );

create or replace function public.set_collection_window(p_id uuid, p_starts date, p_ends date) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_slug text;
begin
  if not app.is_platform(array['owner','editor']) then
    raise exception 'only platform owners and editors set collection dates' using errcode = 'insufficient_privilege';
  end if;
  if p_starts is not null and p_ends is not null and p_ends < p_starts then
    raise exception 'the end date is before the start date' using errcode = 'AKP04';
  end if;
  update public.collections set starts_on = p_starts, ends_on = p_ends, updated_at = now()
   where id = p_id returning slug into v_slug;
  if not found then
    raise exception 'collection not found' using errcode = 'AKP03';
  end if;
  perform app.audit('collection.window', 'collection:' || v_slug, null, null, null, null,
    jsonb_build_object('starts_on', p_starts, 'ends_on', p_ends));
end $$;

revoke execute on function public.set_collection_window(uuid, date, date) from public, anon;
grant execute on function public.set_collection_window(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The weekly editorial slot.
-- ---------------------------------------------------------------------------
create table if not exists public.editorial_slots (
  id          uuid primary key default gen_random_uuid(),
  heading     text not null check (char_length(btrim(heading)) between 1 and 80),
  line        text not null default '' check (char_length(line) <= 240),
  workbook_id uuid references public.workbooks(id) on delete set null,
  theme_id    text references public.themes(id) on delete set null,
  starts_on   date not null,
  ends_on     date not null,
  status      text not null default 'draft' check (status in ('draft','live')),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (ends_on >= starts_on),
  check (ends_on - starts_on <= 31)
);
create index if not exists editorial_slots_window_idx on public.editorial_slots(starts_on, ends_on) where status = 'live';
create index if not exists editorial_slots_workbook_idx on public.editorial_slots(workbook_id);
create index if not exists editorial_slots_theme_idx on public.editorial_slots(theme_id);
create index if not exists editorial_slots_created_by_idx on public.editorial_slots(created_by);

alter table public.editorial_slots enable row level security;
revoke all on public.editorial_slots from public, anon, authenticated;
grant select on public.editorial_slots to anon, authenticated;
create policy editorial_slots_read on public.editorial_slots for select to anon, authenticated
  using (
    (select app.is_staff())
    or (status = 'live'
        and starts_on <= (now() at time zone 'Europe/London')::date
        and ends_on   >= (now() at time zone 'Europe/London')::date)
  );

create or replace function public.save_editorial_slot(
  p_id uuid, p_heading text, p_line text, p_workbook_code text, p_theme_id text,
  p_starts date, p_ends date, p_status text
) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id      uuid := p_id;
  v_heading text := btrim(coalesce(p_heading, ''));
  v_line    text := btrim(coalesce(p_line, ''));
  v_wb      uuid;
  v_theme   text := nullif(btrim(coalesce(p_theme_id, '')), '');
  v_code    text := nullif(upper(btrim(coalesce(p_workbook_code, ''))), '');
begin
  if not app.is_platform(array['owner','editor']) then
    raise exception 'only platform owners and editors curate the editorial slot' using errcode = 'insufficient_privilege';
  end if;
  if char_length(v_heading) not between 1 and 80 or char_length(v_line) > 240
     or (v_heading || ' ' || v_line) ~ '[—–‒―“”‘’…]' or p_status not in ('draft','live')
     or p_starts is null or p_ends is null or p_ends < p_starts then
    raise exception 'a slot needs a heading, plain punctuation and valid dates' using errcode = 'AKP05';
  end if;
  if p_ends - p_starts > 31 then
    raise exception 'a slot runs for up to 32 days' using errcode = 'AKP10';
  end if;
  if v_code is null and v_theme is null then
    raise exception 'a slot features a title or a Theme' using errcode = 'AKP05';
  end if;
  if v_code is not null then
    select w.id into v_wb from public.workbooks w where w.code = v_code;
    if v_wb is null then raise exception 'that title code is not a workbook' using errcode = 'AKP07'; end if;
  end if;
  if v_theme is not null and not exists (select 1 from public.themes t where t.id = v_theme) then
    raise exception 'that Theme does not exist' using errcode = 'AKP07';
  end if;

  if v_id is null then
    insert into public.editorial_slots (heading, line, workbook_id, theme_id, starts_on, ends_on, status, created_by)
    values (v_heading, v_line, v_wb, v_theme, p_starts, p_ends, p_status, app.uid())
    returning id into v_id;
  else
    update public.editorial_slots
       set heading = v_heading, line = v_line, workbook_id = v_wb, theme_id = v_theme,
           starts_on = p_starts, ends_on = p_ends, status = p_status, updated_at = now()
     where id = v_id;
    if not found then raise exception 'slot not found' using errcode = 'AKP06'; end if;
  end if;
  perform app.audit('editorial_slot.saved', 'editorial_slot:' || v_id::text, null, null, null, null,
    jsonb_build_object('status', p_status, 'starts_on', p_starts, 'ends_on', p_ends));
  return v_id;
end $$;

create or replace function public.delete_editorial_slot(p_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not app.is_platform(array['owner','editor']) then
    raise exception 'only platform owners and editors curate the editorial slot' using errcode = 'insufficient_privilege';
  end if;
  delete from public.editorial_slots where id = p_id;
  if not found then raise exception 'slot not found' using errcode = 'AKP06'; end if;
  perform app.audit('editorial_slot.deleted', 'editorial_slot:' || p_id::text, null, null, null, null, null);
end $$;

revoke execute on function public.save_editorial_slot(uuid, text, text, text, text, date, date, text) from public, anon;
revoke execute on function public.delete_editorial_slot(uuid) from public, anon;
grant execute on function public.save_editorial_slot(uuid, text, text, text, text, date, date, text) to authenticated;
grant execute on function public.delete_editorial_slot(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Staff set an author's approved bio.
-- ---------------------------------------------------------------------------
create or replace function public.staff_set_author_bio(p_slug text, p_bio text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_bio text := nullif(btrim(coalesce(p_bio, '')), '');
begin
  if not app.is_platform(array['owner','editor']) then
    raise exception 'only platform owners and editors set an author bio' using errcode = 'insufficient_privilege';
  end if;
  if v_bio is not null and (char_length(v_bio) > 700 or v_bio ~ '[—–‒―“”‘’…]') then
    raise exception 'a bio is up to 700 characters, with no dashes or curly quotes' using errcode = 'AKP09';
  end if;
  update public.authors
     set bio = v_bio, bio_status = case when v_bio is null then 'none' else 'approved' end,
         bio_reviewed_by = app.uid(), bio_reviewed_at = now(), updated_at = now()
   where slug = p_slug;
  if not found then
    raise exception 'author not found' using errcode = 'AKP08';
  end if;
  perform app.audit('author.bio_set', 'author:' || p_slug, null, null, null, null, jsonb_build_object('has_bio', v_bio is not null));
end $$;

revoke execute on function public.staff_set_author_bio(text, text) from public, anon;
grant execute on function public.staff_set_author_bio(text, text) to authenticated;
