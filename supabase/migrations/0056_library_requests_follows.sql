-- 0056 Library: title requests, author follows and rail signals
-- (build list 2.8, 2.9, 2.10).
--
-- What changes
--   1. public.title_requests: a reader or visitor asks for a title. One row
--      each, with the title, the author if known and a short note. No name and
--      no email are stored, so there is nothing to reply to and nothing to leak.
--      The only link back to a person is user_id for a signed-in reader, kept
--      so the same reader cannot flood the list, and set to null if the account
--      is deleted. A salted hash of the address is kept for the rate limit and
--      never shown. public.submit_title_request is the only write path. It
--      limits each address and each reader (rules in public.rate_limit_rules,
--      0027, so staff can change the numbers) and caps the total per hour.
--      Owners, editors and support read the requests and set a status and a
--      short staff note. Nobody else can read the table.
--   2. public.author_follows: a signed-in reader follows an author. Private to
--      the reader. The author never sees who follows them and no count is
--      shown on author pages. A reader follows at most 200 authors. Only
--      authors that are public on a live workbook can be followed.
--   3. public.rail_signals: per live workbook on one tenant, how many readers
--      started, how many finished and how many came back to finish a step at
--      least seven days after they started. Counts only. The personalised
--      rails on Explore rank on these (apps/web/lib/rails.ts). No reader is
--      named. Nothing derives a streak or a run of days from it: it asks one
--      yes or no question of each enrolment.
--
-- Same rules as 0001 to 0048. Functions are security definer with search_path
-- pinned to ''. Every function a client may call has execute revoked from
-- public first and granted back to the roles that need it. Nothing earlier is
-- edited. Depends on 0002, 0003, 0016 and 0027.
--
-- Error codes:
--   AKZ01  title request is missing or too long
--   AKZ02  title request author or note is too long
--   AKZ03  title request address hash is not valid
--   AKZ04  title request status not recognised
--   AKZ05  title request not found
--   AKZ06  staff note too long
--   AKZ07  too many follows
--   AKZ29  rate limited

-- ---------------------------------------------------------------------------
-- 1. Title requests.
-- ---------------------------------------------------------------------------
insert into public.rate_limit_rules (bucket, max_hits, window_seconds, self_service) values
  ('title_request_ip', 3, 86400, false),
  ('title_request_user', 5, 86400, false)
on conflict (bucket) do nothing;

create table public.title_requests (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  title       text not null check (char_length(title) between 1 and 200),
  title_key   text not null check (char_length(title_key) between 1 and 200),
  author_name text check (author_name is null or char_length(author_name) <= 200),
  note        text check (note is null or char_length(note) <= 1000),
  user_id     uuid references auth.users(id) on delete set null,
  ip_hash     text check (ip_hash ~ '^[0-9a-f]{64}$'),
  status      text not null default 'new' check (status in ('new','considering','planned','declined','done')),
  staff_note  text check (staff_note is null or char_length(staff_note) <= 500),
  updated_at  timestamptz not null default now()
);
create index title_requests_created_idx on public.title_requests(created_at desc);
create index title_requests_status_idx on public.title_requests(status, created_at desc);
create index title_requests_key_idx on public.title_requests(title_key);
create index title_requests_user_idx on public.title_requests(user_id);
create index title_requests_ip_recent_idx on public.title_requests(ip_hash, created_at desc);
create trigger title_requests_touch before update on public.title_requests for each row execute function app.touch_updated_at();

-- Lower case, letters and digits only, single spaces: so "The Power of Habit!"
-- and "the power of habit" count as one title in the staff view.
create or replace function app.title_key(p text) returns text
language sql immutable set search_path = '' as $$
  select left(btrim(regexp_replace(regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]+', ' ', 'g'), '\s+', ' ', 'g')), 200)
$$;

create or replace function app.submit_title_request(p_title text, p_author text, p_note text, p_ip_hash text)
returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_title  text := app.clean_text(p_title, 200);
  v_author text := app.clean_text(p_author, 200);
  v_note   text := app.clean_multiline(p_note, 1000);
  v_key    text;
  v_uid    uuid := app.uid();
  v_recent int;
  v_id     uuid;
begin
  if v_title is null then
    raise exception 'request_invalid: title' using errcode = 'AKZ01';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) > 200 then
    raise exception 'request_invalid: title too long' using errcode = 'AKZ01';
  end if;
  if char_length(btrim(coalesce(p_author, ''))) > 200 or char_length(btrim(coalesce(p_note, ''))) > 1000 then
    raise exception 'request_invalid: author or note too long' using errcode = 'AKZ02';
  end if;
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'request_invalid: ip_hash' using errcode = 'AKZ03';
  end if;
  v_key := app.title_key(v_title);
  if v_key = '' then
    raise exception 'request_invalid: title' using errcode = 'AKZ01';
  end if;

  if not app.rate_hit('title_request_ip', p_ip_hash) then
    raise exception 'rate_limited: too many requests from this address' using errcode = 'AKZ29';
  end if;
  if v_uid is not null and not app.rate_hit('title_request_user',
       encode(pg_catalog.sha256(pg_catalog.convert_to('title_request_user:' || v_uid::text, 'UTF8')), 'hex')) then
    raise exception 'rate_limited: too many requests from this reader' using errcode = 'AKZ29';
  end if;
  select count(*) into v_recent from public.title_requests where created_at > now() - interval '1 hour';
  if v_recent >= 300 then
    raise exception 'rate_limited: too many requests' using errcode = 'AKZ29';
  end if;

  insert into public.title_requests (title, title_key, author_name, note, user_id, ip_hash)
  values (v_title, v_key, v_author, v_note, v_uid, p_ip_hash)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.submit_title_request(p_title text, p_author text, p_note text, p_ip_hash text)
returns uuid
language sql volatile security invoker set search_path = '' as $$
  select app.submit_title_request(p_title, p_author, p_note, p_ip_hash)
$$;

-- Staff set a status and a short note. Nothing else about a request changes.
create or replace function app.set_title_request_status(p_id uuid, p_status text, p_note text)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_note text := app.clean_text(p_note, 500);
  old_status text;
begin
  if not app.is_platform(array['owner','editor','support']) then
    raise exception 'only owners, editors and support handle title requests' using errcode = 'insufficient_privilege';
  end if;
  if p_status is null or p_status not in ('new','considering','planned','declined','done') then
    raise exception 'status not recognised' using errcode = 'AKZ04';
  end if;
  if char_length(btrim(coalesce(p_note, ''))) > 500 then
    raise exception 'staff note too long' using errcode = 'AKZ06';
  end if;
  select status into old_status from public.title_requests where id = p_id for update;
  if not found then
    raise exception 'title request not found' using errcode = 'AKZ05';
  end if;
  update public.title_requests set status = p_status, staff_note = v_note where id = p_id;
  perform app.audit('title_request.status', 'title_request:' || p_id::text, null, null, null,
    jsonb_build_object('status', old_status), jsonb_build_object('status', p_status));
end $$;

create or replace function public.set_title_request_status(p_id uuid, p_status text, p_note text)
returns void
language sql volatile security invoker set search_path = '' as $$
  select app.set_title_request_status(p_id, p_status, p_note)
$$;

alter table public.title_requests enable row level security;
revoke all on public.title_requests from public, anon, authenticated;
grant select on public.title_requests to authenticated;
create policy title_requests_staff_read on public.title_requests for select to authenticated
  using ((select app.is_platform(array['owner','editor','support'])));

revoke execute on function app.title_key(text) from public, anon, authenticated;
revoke execute on function app.submit_title_request(text, text, text, text) from public, anon, authenticated;
revoke execute on function app.set_title_request_status(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.submit_title_request(text, text, text, text) from public;
revoke execute on function public.set_title_request_status(uuid, text, text) from public, anon;
grant execute on function app.submit_title_request(text, text, text, text) to anon, authenticated, service_role;
grant execute on function app.set_title_request_status(uuid, text, text) to authenticated;
grant execute on function public.submit_title_request(text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.set_title_request_status(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Author follows.
-- ---------------------------------------------------------------------------
create table public.author_follows (
  user_id    uuid not null references auth.users(id) on delete cascade,
  author_id  uuid not null references public.authors(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, author_id)
);
create index author_follows_author_idx on public.author_follows(author_id);

create or replace function app.guard_author_follows() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.author_follows f where f.user_id = new.user_id) >= 200 then
    raise exception 'you follow as many authors as we can keep' using errcode = 'AKZ07';
  end if;
  return new;
end $$;
create trigger author_follows_cap before insert on public.author_follows
  for each row execute function app.guard_author_follows();

alter table public.author_follows enable row level security;
revoke all on public.author_follows from public, anon, authenticated;
grant select, insert, delete on public.author_follows to authenticated;
create policy author_follows_read on public.author_follows for select to authenticated
  using (user_id = (select app.uid()));
create policy author_follows_insert on public.author_follows for insert to authenticated
  with check (user_id = (select app.uid()) and (select app.author_is_public(author_id)));
create policy author_follows_delete on public.author_follows for delete to authenticated
  using (user_id = (select app.uid()));

-- ---------------------------------------------------------------------------
-- 3. rail_signals: counts per live workbook on one tenant.
--    starts    every enrolment
--    finishes  enrolments with status finished
--    returned  enrolments with a finished step at least seven days after
--              the reader started
-- ---------------------------------------------------------------------------
create or replace function public.rail_signals(p_tenant uuid)
returns table (workbook_id uuid, starts bigint, finishes bigint, returned bigint)
language sql stable security definer set search_path = '' as $$
  select e.workbook_id,
         count(*),
         count(*) filter (where e.status = 'finished'),
         count(*) filter (where exists (
           select 1 from public.progress_events p
            where p.enrolment_id = e.id and p.kind = 'step_done' and p.at >= e.started_at + interval '7 days'))
    from public.enrolments e
    join public.workbooks w on w.id = e.workbook_id and w.status = 'live' and w.tenant_id = p_tenant
   where e.tenant_id = p_tenant
   group by e.workbook_id
$$;

revoke execute on function public.rail_signals(uuid) from public;
grant execute on function public.rail_signals(uuid) to anon, authenticated;
