-- 0066 Do a programme with a friend (build list 6.2).
--
-- Two readers pair up on one workbook. The pairing is opt-in on both sides: the
-- first reader makes an invitation link and shares it through their own
-- channel (Akana never contacts the friend), and the friend accepts on a page
-- that says what is shared. Once paired, each can see one thing about the
-- other: whether they finished a step today. Nothing else.
--
-- The shape of trust
--   * Answers are never shared and no table here can hold one. A finish is
--     (pair, reader, local date, time). A nudge is one of a fixed list of
--     codes chosen from pre-written messages; the words live in the app, and
--     the recipient always sees it as coming from their friend. There is no
--     free text between the two readers.
--   * Mental health and other wellbeing shelves are out: a pair can only be
--     made on a workbook at safety tier none (nothing counts days, nothing
--     nags, on tier standard and higher).
--   * The pair is behind the programme_friends cohort flag (0064). Flags
--     default off. Both readers must be in the flag to make or accept one.
--   * Either reader can end the pair at any time. Ending deletes the finishes
--     and nudges, so nothing is kept about the other person.
--   * Readers do not see each other's accounts. The invitation holds a label
--     each side chose ("Sam", "My sister"). A pair row is readable only by its
--     two members, through public.my_pairs(), which leaves out both user ids.
--   * The invitation token is made by the server and only its sha256 hash is
--     stored. It is cleared the moment the friend accepts.
--   * Realtime: each pair has a private channel key, returned only to its
--     members. The server announces "a finish happened" on a Supabase Realtime
--     Broadcast channel named after that key, with no payload. The page also
--     polls my_pairs() as a fallback, so the feature works without Realtime.
--
-- Depends on 0001 to 0048 and 0064. Nothing earlier is edited. Safe to run
-- twice where the objects allow it.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
create table if not exists public.programme_pairs (
  id             uuid primary key default gen_random_uuid(),
  workbook_id    uuid not null references public.workbooks(id) on delete cascade,
  tenant_id      uuid not null references public.tenants(id),
  inviter_id     uuid not null references auth.users(id) on delete cascade,
  friend_id      uuid references auth.users(id) on delete cascade,
  inviter_label  text not null default 'Your friend' check (char_length(btrim(inviter_label)) between 1 and 30 and inviter_label !~ '[<>[:cntrl:]]'),
  friend_label   text check (friend_label is null or (char_length(btrim(friend_label)) between 1 and 30 and friend_label !~ '[<>[:cntrl:]]')),
  status         text not null default 'invited' check (status in ('invited','active','ended')),
  token_hash     text unique check (token_hash is null or token_hash ~ '^[0-9a-f]{64}$'),
  channel_key    text not null default replace(gen_random_uuid()::text, '-', '') check (channel_key ~ '^[0-9a-f]{32}$'),
  invited_at     timestamptz not null default now(),
  expires_at     timestamptz not null default now() + interval '14 days',
  accepted_at    timestamptz,
  ended_at       timestamptz,
  constraint programme_pairs_shape check (
    (status = 'invited' and friend_id is null and friend_label is null and accepted_at is null and ended_at is null and token_hash is not null)
    or (status = 'active' and friend_id is not null and friend_label is not null and accepted_at is not null and ended_at is null and token_hash is null)
    or (status = 'ended' and ended_at is not null and token_hash is null)),
  constraint programme_pairs_not_self check (friend_id is null or friend_id <> inviter_id)
);
create unique index if not exists programme_pairs_one_open_inviter on public.programme_pairs(inviter_id, workbook_id) where status in ('invited','active');
create unique index if not exists programme_pairs_one_open_friend on public.programme_pairs(friend_id, workbook_id) where status = 'active';
create index if not exists programme_pairs_friend_idx on public.programme_pairs(friend_id);
create index if not exists programme_pairs_workbook_idx on public.programme_pairs(workbook_id);
create index if not exists programme_pairs_tenant_idx on public.programme_pairs(tenant_id);

create table if not exists public.pair_finishes (
  pair_id    uuid not null references public.programme_pairs(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  at         timestamptz not null default now(),
  primary key (pair_id, user_id, local_date)
);
create index if not exists pair_finishes_user_idx on public.pair_finishes(user_id);

create table if not exists public.pair_nudges (
  id         uuid primary key default gen_random_uuid(),
  pair_id    uuid not null references public.programme_pairs(id) on delete cascade,
  from_user  uuid not null references auth.users(id) on delete cascade,
  to_user    uuid not null references auth.users(id) on delete cascade,
  code       text not null check (code in ('thinking_of_you','ready_when_you_are','shall_we_do_ours','no_rush','nice_one')),
  local_date date not null,
  created_at timestamptz not null default now(),
  unique (pair_id, from_user, local_date)
);
create index if not exists pair_nudges_to_idx on public.pair_nudges(to_user, local_date);
create index if not exists pair_nudges_from_idx on public.pair_nudges(from_user);

-- Nothing here is read or written directly by a reader: every path is a function below.
alter table public.programme_pairs enable row level security;
alter table public.pair_finishes   enable row level security;
alter table public.pair_nudges     enable row level security;
revoke all on public.programme_pairs, public.pair_finishes, public.pair_nudges from public, anon, authenticated;
grant select, update on public.programme_pairs to service_role;
grant select on public.pair_finishes, public.pair_nudges to service_role;

-- ---------------------------------------------------------------------------
-- 2. A finished step marks the pair, in the same transaction
-- ---------------------------------------------------------------------------
create or replace function app.london_today() returns date
language sql stable set search_path = '' as $$ select (now() at time zone 'Europe/London')::date $$;

create or replace function app.record_pair_finish() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_workbook uuid;
begin
  if new.kind <> 'step_done' or (new.ref is not null and new.ref like '%~r') then return new; end if;
  select e.user_id, e.workbook_id into v_user, v_workbook from public.enrolments e where e.id = new.enrolment_id;
  if v_user is null then return new; end if;
  insert into public.pair_finishes (pair_id, user_id, local_date)
  select p.id, v_user, app.london_today()
    from public.programme_pairs p
   where p.status = 'active' and p.workbook_id = v_workbook and v_user in (p.inviter_id, p.friend_id)
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists progress_events_pair_finish on public.progress_events;
create trigger progress_events_pair_finish after insert on public.progress_events
  for each row when (new.kind = 'step_done') execute function app.record_pair_finish();

-- ---------------------------------------------------------------------------
-- 3. Invite
-- ---------------------------------------------------------------------------
create or replace function public.create_pair_invite(p_enrolment uuid, p_hash text, p_label text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid   uuid := app.uid();
  v_label text := coalesce(nullif(btrim(coalesce(p_label, '')), ''), 'Your friend');
  v_e     public.enrolments%rowtype;
  v_tier  text;
  v_id    uuid;
begin
  if v_uid is null or not app.enrolment_owner(p_enrolment) then
    raise exception 'not your programme' using errcode = 'insufficient_privilege';
  end if;
  if not app.flag_for_user('programme_friends', v_uid) then
    raise exception 'doing a programme with a friend is not open to you yet' using errcode = 'feature_not_supported';
  end if;
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'bad link hash' using errcode = 'invalid_parameter_value';
  end if;
  if char_length(v_label) > 30 or v_label ~ '[<>[:cntrl:]]' then
    raise exception 'the name must be plain text of up to 30 characters' using errcode = 'check_violation';
  end if;
  select * into v_e from public.enrolments where id = p_enrolment;
  select w.safety_tier::text into v_tier from public.workbooks w where w.id = v_e.workbook_id;
  if v_tier is distinct from 'none' then
    raise exception 'this title is read on your own' using errcode = 'object_not_in_prerequisite_state';
  end if;
  if (select count(*) from public.programme_pairs where inviter_id = v_uid and status in ('invited','active')) >= 5 then
    raise exception 'you already have five open pairings' using errcode = 'program_limit_exceeded';
  end if;
  -- An expired invitation is replaced by a new one for the same programme.
  update public.programme_pairs set status = 'ended', ended_at = now(), token_hash = null
   where inviter_id = v_uid and workbook_id = v_e.workbook_id and status = 'invited' and expires_at <= now();
  if exists (select 1 from public.programme_pairs where inviter_id = v_uid and workbook_id = v_e.workbook_id and status in ('invited','active')) then
    raise exception 'you already have a pairing on this programme' using errcode = 'unique_violation';
  end if;
  insert into public.programme_pairs (workbook_id, tenant_id, inviter_id, inviter_label, token_hash)
  values (v_e.workbook_id, v_e.tenant_id, v_uid, v_label, p_hash)
  returning id into v_id;
  return v_id;
end $$;

-- The accept page's lookup. Service role only. Names the programme and the
-- label the inviter chose; nothing that identifies the inviter's account.
create or replace function public.pair_invite_state(p_hash text) returns table (state text, slug text, title text, inviter_label text, tier text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_service_role() then
    raise exception 'only the service role reads an invitation' using errcode = 'insufficient_privilege';
  end if;
  return query
  select case when p.expires_at <= now() then 'expired' else 'open' end, w.slug::text, w.title::text, p.inviter_label, w.safety_tier::text
    from public.programme_pairs p join public.workbooks w on w.id = p.workbook_id
   where p.token_hash = p_hash and p.status = 'invited';
end $$;

-- Accept. Returns an outcome word the page turns into plain wording.
create or replace function public.accept_pair_invite(p_hash text, p_label text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid   uuid := app.uid();
  v_label text := coalesce(nullif(btrim(coalesce(p_label, '')), ''), 'Your friend');
  p       public.programme_pairs%rowtype;
  v_tier  text;
begin
  if v_uid is null then
    raise exception 'sign in first' using errcode = 'insufficient_privilege';
  end if;
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then return 'invalid'; end if;
  if char_length(v_label) > 30 or v_label ~ '[<>[:cntrl:]]' then return 'bad_label'; end if;
  select * into p from public.programme_pairs where token_hash = p_hash and status = 'invited' for update;
  if not found then return 'invalid'; end if;
  if p.expires_at <= now() then return 'expired'; end if;
  if p.inviter_id = v_uid then return 'self'; end if;
  if not app.flag_for_user('programme_friends', v_uid) then return 'off'; end if;
  select w.safety_tier::text into v_tier from public.workbooks w where w.id = p.workbook_id;
  if v_tier is distinct from 'none' then return 'invalid'; end if;
  if not exists (select 1 from public.enrolments e where e.user_id = v_uid and e.workbook_id = p.workbook_id and e.tenant_id = p.tenant_id) then
    return 'not_enrolled';
  end if;
  if exists (select 1 from public.programme_pairs x where x.friend_id = v_uid and x.workbook_id = p.workbook_id and x.status = 'active') then
    return 'busy';
  end if;
  update public.programme_pairs
     set friend_id = v_uid, friend_label = v_label, status = 'active', accepted_at = now(), token_hash = null
   where id = p.id;
  return 'joined';
end $$;

-- ---------------------------------------------------------------------------
-- 4. Reading and ending
-- ---------------------------------------------------------------------------
create or replace function public.my_pairs() returns table (
  pair_id uuid, workbook_slug text, title text, status text, friend_label text,
  channel_key text, expires_at timestamptz, i_am_inviter boolean,
  friend_finished_today boolean, i_finished_today boolean, nudge_sent_today boolean, nudge_code text
)
language sql stable security definer set search_path = '' as $$
  select p.id, w.slug::text, w.title::text, p.status,
         case when p.inviter_id = app.uid() then coalesce(p.friend_label, 'Your friend') else p.inviter_label end,
         p.channel_key, p.expires_at, p.inviter_id = app.uid(),
         exists (select 1 from public.pair_finishes f where f.pair_id = p.id and f.user_id <> app.uid() and f.local_date = app.london_today()),
         exists (select 1 from public.pair_finishes f where f.pair_id = p.id and f.user_id = app.uid() and f.local_date = app.london_today()),
         exists (select 1 from public.pair_nudges n where n.pair_id = p.id and n.from_user = app.uid() and n.local_date = app.london_today()),
         (select n.code from public.pair_nudges n where n.pair_id = p.id and n.to_user = app.uid() and n.local_date = app.london_today() limit 1)
    from public.programme_pairs p
    join public.workbooks w on w.id = p.workbook_id
   where app.uid() is not null
     and (p.inviter_id = app.uid() or p.friend_id = app.uid())
     and (p.status = 'active' or (p.status = 'invited' and p.inviter_id = app.uid() and p.expires_at > now()))
   order by p.invited_at desc
$$;

create or replace function public.end_pair(p_pair uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare p public.programme_pairs%rowtype;
begin
  select * into p from public.programme_pairs where id = p_pair for update;
  if not found or app.uid() is null or app.uid() not in (p.inviter_id, coalesce(p.friend_id, p.inviter_id)) or p.status = 'ended' then
    raise exception 'no such pairing' using errcode = 'insufficient_privilege';
  end if;
  delete from public.pair_finishes where pair_id = p.id;
  delete from public.pair_nudges where pair_id = p.id;
  update public.programme_pairs set status = 'ended', ended_at = now(), token_hash = null where id = p.id;
end $$;

-- One pre-written nudge a day to the friend, never when they have already finished.
create or replace function public.send_nudge(p_pair uuid, p_code text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := app.uid();
  p     public.programme_pairs%rowtype;
  v_to  uuid;
begin
  select * into p from public.programme_pairs where id = p_pair;
  if not found or v_uid is null or p.status <> 'active' or v_uid not in (p.inviter_id, p.friend_id) then return 'inactive'; end if;
  if p_code is null or p_code not in ('thinking_of_you','ready_when_you_are','shall_we_do_ours','no_rush','nice_one') then return 'invalid'; end if;
  v_to := case when v_uid = p.inviter_id then p.friend_id else p.inviter_id end;
  if exists (select 1 from public.pair_finishes f where f.pair_id = p.id and f.user_id = v_to and f.local_date = app.london_today())
     and p_code <> 'nice_one' then
    return 'already_finished';
  end if;
  if p_code = 'nice_one' and not exists (select 1 from public.pair_finishes f where f.pair_id = p.id and f.user_id = v_to and f.local_date = app.london_today()) then
    return 'not_yet';
  end if;
  insert into public.pair_nudges (pair_id, from_user, to_user, code, local_date)
  values (p.id, v_uid, v_to, p_code, app.london_today())
  on conflict (pair_id, from_user, local_date) do nothing;
  if not found then return 'limit'; end if;
  return 'sent';
end $$;

-- Who to tell on a finished step: the channel keys of the active pairs the
-- reader is in for this programme. Service role only, used by the server to
-- broadcast "something happened" without any payload.
create or replace function public.pair_channels_for(p_user uuid, p_workbook uuid) returns table (channel_key text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_service_role() then
    raise exception 'only the service role reads pair channels' using errcode = 'insufficient_privilege';
  end if;
  return query select p.channel_key from public.programme_pairs p
   where p.status = 'active' and p.workbook_id = p_workbook and p_user in (p.inviter_id, p.friend_id);
end $$;

create or replace function public.prune_pairs() returns bigint
language plpgsql volatile security definer set search_path = '' as $$
declare n bigint; m bigint;
begin
  if not app.is_service_role() then
    raise exception 'only the service role prunes pairings' using errcode = 'insufficient_privilege';
  end if;
  delete from public.pair_finishes where local_date < app.london_today() - 7;
  delete from public.pair_nudges where local_date < app.london_today() - 7;
  delete from public.programme_pairs where status = 'invited' and expires_at < now() - interval '30 days';
  get diagnostics n = row_count;
  delete from public.programme_pairs where status = 'ended' and ended_at < now() - interval '30 days';
  get diagnostics m = row_count;
  return n + m;
end $$;

revoke execute on function app.london_today(), app.record_pair_finish() from public, anon;
grant execute on function app.london_today() to authenticated, service_role;
revoke execute on function
  public.create_pair_invite(uuid, text, text), public.pair_invite_state(text), public.accept_pair_invite(text, text),
  public.my_pairs(), public.end_pair(uuid), public.send_nudge(uuid, text), public.pair_channels_for(uuid, uuid), public.prune_pairs()
  from public, anon;
grant execute on function public.create_pair_invite(uuid, text, text), public.accept_pair_invite(text, text),
  public.my_pairs(), public.end_pair(uuid), public.send_nudge(uuid, text) to authenticated;
grant execute on function public.pair_invite_state(text), public.pair_channels_for(uuid, uuid), public.prune_pairs() to service_role;
