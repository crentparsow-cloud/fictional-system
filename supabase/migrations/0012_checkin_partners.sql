-- 0012 Check-in partners (F-030, first named "Support partner").
--
-- Depends on 0001 to 0010 only. Same rules as before: every table has RLS
-- on, grants to anon and authenticated are revoked and given back narrowly,
-- helpers are security definer with search_path pinned, and PostgREST sees
-- thin public wrappers.
--
-- The shape of trust here:
--   * A reader may have one check-in partner. The partner has no account.
--     They act only through links in emails. Each link carries a random
--     token that is single-purpose (respond, report, reply or stop), expires,
--     can be revoked, and is stored only as a sha256 hash. The plain token
--     is minted by the server, put in the email and never stored.
--   * A partner never sees answers, workbook titles, themes or anything the
--     reader wrote in a workbook. What reaches them is fixed by the share
--     level the reader chose:
--       1  that the reader reached a new stage (as "stage 2 of 4")
--       2  as 1, plus a gentle question they could ask
--       3  as 2, plus a short note the reader writes for them
--     The stage is given by number only. Stage names are workbook wording and
--     never leave this database for a partner.
--   * Progress on a wellbeing workbook (safety tier standard or higher, or a
--     tier that cannot be read) is shared only when the reader has ticked
--     that choice. It is off by default and timestamped when made.
--   * Anything that mints tokens runs as the service role only, so a reader
--     can never get hold of a link meant for their partner and accept on
--     their behalf. Reader changes that mint nothing (share level, note,
--     stop sharing, remove details) run as the signed-in reader.
--   * Invitations are rate limited here, not only in the app: three per
--     reader and three per address in any 30 days, counted from the audit
--     log so deleting a partner row does not reset the count. An address
--     that declined or reported is never invited again.
--   * Updates are capped at one a week and four in 30 days per partner, and
--     each stage is sent once.
--   * Audit rows hold ids, levels and hashes. Never a name, an address or a
--     note.
--
-- Error codes, for the server to map:
--   AKP01  not allowed (wrong role, or not signed in)
--   AKP02  a field failed validation (the message names the field)
--   AKP03  the reader invited their own address
--   AKP04  the address cannot be invited (it declined or reported before)
--   AKP05  the reader already has an active partner
--   AKP06  the account is scheduled for deletion
--   AKP29  rate limited

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.partners (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null unique references auth.users(id) on delete cascade,
  -- The reader's name as their partner knows them, and the partner's first
  -- name. Letters, spaces, apostrophes and hyphens; the app cleans them and
  -- the check below refuses anything that could carry a link or markup.
  reader_name         text not null check (char_length(reader_name) between 1 and 30 and reader_name !~ '[<>@/\\:;=&#%0-9[:cntrl:]]'),
  partner_name        text not null check (char_length(partner_name) between 1 and 30 and partner_name !~ '[<>@/\\:;=&#%0-9[:cntrl:]]'),
  partner_email       text not null check (char_length(partner_email) between 3 and 254 and partner_email = lower(partner_email)
                                           and partner_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  email_hash          text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  share_level         smallint not null check (share_level between 1 and 3),
  include_wellbeing   boolean not null default false,
  wellbeing_chosen_at timestamptz,
  note                text check (note is null or (char_length(note) between 1 and 200
                                  and note !~ '[<>@[:cntrl:]]' and note !~* '(https?:|www\.)')),
  note_updated_at     timestamptz,
  note_sent_at        timestamptz,
  status              text not null default 'invited' check (status in ('invited','accepted','declined','stopped')),
  stopped_by          text check (stopped_by in ('reader','partner')),
  invited_at          timestamptz not null default now(),
  invite_expires_at   timestamptz not null,
  responded_at        timestamptz,
  stopped_at          timestamptz,
  constraint partners_wellbeing_choice check (not include_wellbeing or wellbeing_chosen_at is not null),
  constraint partners_stopped check ((status = 'stopped') = (stopped_at is not null) and (status = 'stopped') = (stopped_by is not null))
);

create table public.partner_tokens (
  id          uuid primary key default gen_random_uuid(),
  partner_id  uuid not null references public.partners(id) on delete cascade,
  token_hash  text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  purpose     text not null check (purpose in ('respond','report','reply','stop')),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  revoked_at  timestamptz,
  constraint partner_tokens_window check (expires_at > created_at)
);
create index partner_tokens_partner_idx on public.partner_tokens(partner_id);

-- What was sent to a partner, by kind. dedupe_key holds ids only.
create table public.partner_sends (
  id          uuid primary key default gen_random_uuid(),
  partner_id  uuid not null references public.partners(id) on delete cascade,
  kind        text not null check (kind in ('invite','accepted','update','stopped')),
  dedupe_key  text unique check (dedupe_key is null or (length(dedupe_key) <= 200 and dedupe_key !~ '@')),
  sent_at     timestamptz not null default now()
);
create index partner_sends_partner_idx on public.partner_sends(partner_id, kind, sent_at desc);

-- A short encouragement from the partner, for the reader to read.
create table public.partner_replies (
  id          uuid primary key default gen_random_uuid(),
  partner_id  uuid not null references public.partners(id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 280 and body !~ '[<>[:cntrl:]]'),
  created_at  timestamptz not null default now()
);
create index partner_replies_partner_idx on public.partner_replies(partner_id, created_at desc);

-- Addresses that said no or reported an invitation. A hash, never the address.
create table public.partner_blocks (
  email_hash  text primary key check (email_hash ~ '^[0-9a-f]{64}$'),
  reason      text not null check (reason in ('declined','reported')),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function app.partner_email_hash(p_email text) returns text
language sql immutable set search_path = '' as $$
  select encode(pg_catalog.sha256(pg_catalog.convert_to(lower(btrim(p_email)), 'UTF8')), 'hex')
$$;

create or replace function app.partner_deletion_pending(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.account_deletion_requests d
                  where d.user_id = p_user and d.cancelled_at is null)
$$;

-- The highest stage this enrolment has finished, by the pinned version's own
-- structure. A unit is done when every exercise it lists has a step_done
-- event, or its check-in was saved. A stage is done when every unit in it is
-- done, and it counts only when every stage before it is done as well. A
-- workbook without stages counts as one stage. Returns no row when no stage
-- is done. Only ids and numbers come back, never a stage name.
create or replace function app.partner_stage_reached(p_enrolment uuid)
returns table (stage_id text, stage_number int, stage_count int)
language plpgsql stable security definer set search_path = '' as $$
declare
  c jsonb;
begin
  select v.content into c
    from public.enrolments e join public.workbook_versions v on v.id = e.version_id
   where e.id = p_enrolment;
  if c is null or jsonb_typeof(c -> 'units') is distinct from 'array' then
    return;
  end if;

  return query
  with done_steps as (
    select array_agg(distinct p.ref) as refs from public.progress_events p
     where p.enrolment_id = p_enrolment and p.kind = 'step_done' and p.ref is not null
  ), done_checkins as (
    select array_agg(distinct p.ref) as refs from public.progress_events p
     where p.enrolment_id = p_enrolment and p.kind = 'checkin_done' and p.ref is not null
  ), units as (
    select (u ->> 'number')::int as n,
           u ->> 'stage' as sid,
           case when jsonb_typeof(u -> 'exercise_ids') = 'array'
                then array(select jsonb_array_elements_text(u -> 'exercise_ids')) else '{}'::text[] end as ex
      from jsonb_array_elements(c -> 'units') u
     where jsonb_typeof(u) = 'object' and (u ->> 'number') ~ '^[0-9]{1,3}$'
  ), unit_done as (
    select un.n, un.sid,
           (cardinality(un.ex) > 0 and un.ex <@ coalesce((select refs from done_steps), '{}'::text[]))
           or un.n::text = any(coalesce((select refs from done_checkins), '{}'::text[])) as done
      from units un
  ), stages as (
    select s ->> 'id' as id,
           t.ord::int as ord,
           case when jsonb_typeof(s -> 'units') = 'array'
                then array(select x::int from jsonb_array_elements_text(s -> 'units') x where x ~ '^[0-9]{1,3}$') else '{}'::int[] end as nums
      from jsonb_array_elements(case when jsonb_typeof(c #> '{structure,stages}') = 'array' then c #> '{structure,stages}' else '[]'::jsonb end)
           with ordinality as t(s, ord)
     where jsonb_typeof(s) = 'object' and s ->> 'id' is not null
  ), shaped as (
    select st.id, st.ord, (select count(*) from stages)::int as total,
           array(select ud.done from unit_done ud where ud.n = any(st.nums) or ud.sid = st.id) as flags
      from stages st
    union all
    select 'all', 1, 1, array(select ud.done from unit_done ud)
     where not exists (select 1 from stages)
  ), judged as (
    select sh.id, sh.ord, sh.total, cardinality(sh.flags) > 0 and not (false = any(sh.flags)) as done
      from shaped sh
  )
  -- The highest stage that is done with every stage before it done too.
  select j.id, j.ord, j.total
    from judged j
   where j.done and not exists (select 1 from judged k where k.ord < j.ord and not k.done)
   order by j.ord desc
   limit 1;
end $$;

-- ---------------------------------------------------------------------------
-- Invite. Service role only: it stores the hashes of the two tokens the
-- server put in the invitation email.
-- ---------------------------------------------------------------------------
create or replace function app.partner_invite(
  p_user              uuid,
  p_reader_name       text,
  p_partner_name      text,
  p_email             text,
  p_share_level       int,
  p_include_wellbeing boolean,
  p_respond_hash      text,
  p_report_hash       text
) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_hash   text;
  v_reader text := btrim(coalesce(p_reader_name, ''));
  v_name   text := btrim(coalesce(p_partner_name, ''));
  v_own    text;
  v_old    public.partners;
  v_id     uuid;
  n        int;
begin
  if not app.is_service_role() then
    raise exception 'only the service role sends partner invitations' using errcode = 'AKP01';
  end if;
  if p_user is null or not exists (select 1 from auth.users u where u.id = p_user) then
    raise exception 'partner_invalid: user' using errcode = 'AKP02';
  end if;
  perform pg_advisory_xact_lock(hashtext('partner_invite:' || p_user::text));

  if char_length(v_reader) not between 1 and 30 or v_reader ~ '[<>@/\\:;=&#%0-9[:cntrl:]]' then
    raise exception 'partner_invalid: reader_name' using errcode = 'AKP02';
  end if;
  if char_length(v_name) not between 1 and 30 or v_name ~ '[<>@/\\:;=&#%0-9[:cntrl:]]' then
    raise exception 'partner_invalid: partner_name' using errcode = 'AKP02';
  end if;
  if char_length(v_email) not between 3 and 254 or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'partner_invalid: email' using errcode = 'AKP02';
  end if;
  if p_share_level is null or p_share_level not between 1 and 3 then
    raise exception 'partner_invalid: share_level' using errcode = 'AKP02';
  end if;
  if p_respond_hash !~ '^[0-9a-f]{64}$' or p_report_hash !~ '^[0-9a-f]{64}$' or p_respond_hash = p_report_hash then
    raise exception 'partner_invalid: token' using errcode = 'AKP02';
  end if;

  select lower(u.email) into v_own from auth.users u where u.id = p_user;
  if v_own is not null and v_own = v_email then
    raise exception 'a reader cannot be their own partner' using errcode = 'AKP03';
  end if;
  if app.partner_deletion_pending(p_user) then
    raise exception 'this account is scheduled for deletion' using errcode = 'AKP06';
  end if;

  v_hash := app.partner_email_hash(v_email);
  if exists (select 1 from public.partner_blocks b where b.email_hash = v_hash) then
    raise exception 'this address cannot be invited' using errcode = 'AKP04';
  end if;

  select * into v_old from public.partners p where p.user_id = p_user for update;
  if found and (v_old.status = 'accepted' or (v_old.status = 'invited' and v_old.invite_expires_at > now())) then
    raise exception 'there is already a partner' using errcode = 'AKP05';
  end if;

  select count(*) into n from public.audit_log a
   where a.action = 'partner.invited' and a.target = 'user:' || p_user::text and a.at > now() - interval '30 days';
  if n >= 3 then
    raise exception 'three invitations in 30 days' using errcode = 'AKP29';
  end if;
  select count(*) into n from public.audit_log a
   where a.action = 'partner.invited' and a.after ->> 'email_hash' = v_hash and a.at > now() - interval '30 days';
  if n >= 3 then
    raise exception 'this address had three invitations in 30 days' using errcode = 'AKP29';
  end if;

  -- One partner row per reader. A lapsed, declined or stopped row is replaced.
  delete from public.partners p where p.user_id = p_user;
  insert into public.partners (user_id, reader_name, partner_name, partner_email, email_hash, share_level,
                               include_wellbeing, wellbeing_chosen_at, invite_expires_at)
  values (p_user, v_reader, v_name, v_email, v_hash, p_share_level,
          coalesce(p_include_wellbeing, false), case when p_include_wellbeing then now() end, now() + interval '14 days')
  returning id into v_id;

  insert into public.partner_tokens (partner_id, token_hash, purpose, expires_at) values
    (v_id, p_respond_hash, 'respond', now() + interval '14 days'),
    (v_id, p_report_hash, 'report', now() + interval '60 days');
  insert into public.partner_sends (partner_id, kind) values (v_id, 'invite');

  perform app.audit('partner.invited', 'user:' || p_user::text, null, null, null, null,
    jsonb_build_object('partner', v_id, 'share_level', p_share_level,
                       'include_wellbeing', coalesce(p_include_wellbeing, false), 'email_hash', v_hash));
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Reader changes, for the signed-in reader only.
-- ---------------------------------------------------------------------------

-- Share level, the wellbeing choice and the note. A changed note goes out
-- once, with the next update.
create or replace function app.partner_settings(p_share_level int, p_include_wellbeing boolean, p_note text default null)
returns public.partners
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid  uuid := app.uid();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  r      public.partners;
begin
  if v_uid is null then
    raise exception 'sign in to change sharing' using errcode = 'AKP01';
  end if;
  if p_share_level is null or p_share_level not between 1 and 3 then
    raise exception 'partner_invalid: share_level' using errcode = 'AKP02';
  end if;
  if v_note is not null and (char_length(v_note) > 200 or v_note ~ '[<>@[:cntrl:]]' or v_note ~* '(https?:|www\.)') then
    raise exception 'partner_invalid: note' using errcode = 'AKP02';
  end if;
  select * into r from public.partners p where p.user_id = v_uid and p.status in ('invited','accepted') for update;
  if not found then
    raise exception 'there is no partner to change' using errcode = 'no_data_found';
  end if;
  update public.partners p
     set share_level = p_share_level,
         include_wellbeing = coalesce(p_include_wellbeing, false),
         wellbeing_chosen_at = case when coalesce(p_include_wellbeing, false) then coalesce(r.wellbeing_chosen_at, now()) end,
         note = v_note,
         note_updated_at = case when v_note is distinct from r.note then now() else r.note_updated_at end,
         note_sent_at = case when v_note is distinct from r.note then null else r.note_sent_at end
   where p.id = r.id
   returning * into r;
  perform app.audit('partner.settings_changed', 'user:' || v_uid::text, null, null, null, null,
    jsonb_build_object('partner', r.id, 'share_level', r.share_level, 'include_wellbeing', r.include_wellbeing,
                       'note_set', r.note is not null));
  return r;
end $$;

-- Stop sharing. Every link the partner holds stops working at once. notify
-- is true when the partner had said yes, so the server tells them.
create or replace function app.partner_stop()
returns table (partner_id uuid, partner_name text, partner_email text, reader_name text, notify boolean)
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := app.uid();
  r     public.partners;
begin
  if v_uid is null then
    raise exception 'sign in to stop sharing' using errcode = 'AKP01';
  end if;
  select * into r from public.partners p where p.user_id = v_uid and p.status in ('invited','accepted') for update;
  if not found then
    return;
  end if;
  update public.partners p set status = 'stopped', stopped_by = 'reader', stopped_at = now() where p.id = r.id;
  update public.partner_tokens t set revoked_at = now() where t.partner_id = r.id and t.revoked_at is null;
  if r.status = 'accepted' then
    insert into public.partner_sends (partner_id, kind, dedupe_key) values (r.id, 'stopped', 'stopped:' || r.id::text)
    on conflict (dedupe_key) do nothing;
  end if;
  perform app.audit('partner.stopped', 'user:' || v_uid::text, 'reader', null, null,
    jsonb_build_object('status', r.status), jsonb_build_object('partner', r.id));
  return query select r.id, r.partner_name, r.partner_email, r.reader_name, r.status = 'accepted';
end $$;

-- Remove a partner's details once sharing has ended. Their replies go too.
create or replace function app.partner_forget() returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := app.uid();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'sign in to remove a partner' using errcode = 'AKP01';
  end if;
  delete from public.partners p
   where p.user_id = v_uid
     and (p.status in ('declined','stopped') or (p.status = 'invited' and p.invite_expires_at <= now()))
   returning p.id into v_id;
  if v_id is null then
    return false;
  end if;
  perform app.audit('partner.forgotten', 'user:' || v_uid::text, null, null, null, null, jsonb_build_object('partner', v_id));
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- The partner's side, by token.
-- ---------------------------------------------------------------------------

-- What a link is for and whether it still works. Callable without an
-- account: the token is the key. Returns first names and the share level
-- only. Never an address, an id or anything from the reader's work.
create or replace function app.partner_link_view(p_token_hash text)
returns table (state text, purpose text, partner_status text, partner_name text, reader_name text, share_level int)
language plpgsql stable security definer set search_path = '' as $$
declare
  t public.partner_tokens;
  p public.partners;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return query select 'unknown'::text, null::text, null::text, null::text, null::text, null::int;
    return;
  end if;
  select * into t from public.partner_tokens x where x.token_hash = p_token_hash;
  if not found then
    return query select 'unknown'::text, null::text, null::text, null::text, null::text, null::int;
    return;
  end if;
  select * into p from public.partners x where x.id = t.partner_id;
  return query select
    case when t.revoked_at is not null then 'revoked'
         when t.expires_at <= now() then 'expired'
         when t.used_at is not null then 'used'
         else 'ok' end,
    t.purpose, p.status, p.partner_name, p.reader_name, p.share_level::int;
end $$;

-- Acts on a link. Service role only: the result carries the addresses the
-- server needs to send the follow-up email.
--   accept, decline  need a respond token
--   report           needs a report token
--   stop             needs a stop token
--   reply            needs a reply token, and a message of 1 to 280 characters
-- Outcomes: accepted, declined, reported, stopped, replied, already,
-- inactive, expired, unknown, invalid_message, reply_limit.
create or replace function app.partner_link_act(p_token_hash text, p_action text, p_message text default null)
returns table (outcome text, partner_id uuid, reader_email text, reader_name text, partner_name text, partner_email text)
language plpgsql volatile security definer set search_path = '' as $$
declare
  t      public.partner_tokens;
  p      public.partners;
  v_need text;
  v_msg  text := nullif(btrim(coalesce(p_message, '')), '');
  v_out  text;
  v_mail text;
  n      int;
begin
  if not app.is_service_role() then
    raise exception 'only the service role acts on partner links' using errcode = 'AKP01';
  end if;
  v_need := case p_action when 'accept' then 'respond' when 'decline' then 'respond' when 'report' then 'report'
                          when 'stop' then 'stop' when 'reply' then 'reply' end;
  if v_need is null or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return query select 'unknown'::text, null::uuid, null::text, null::text, null::text, null::text;
    return;
  end if;
  select * into t from public.partner_tokens x where x.token_hash = p_token_hash and x.purpose = v_need for update;
  if not found then
    return query select 'unknown'::text, null::uuid, null::text, null::text, null::text, null::text;
    return;
  end if;
  select * into p from public.partners x where x.id = t.partner_id for update;
  if t.revoked_at is not null then
    return query select 'inactive'::text, null::uuid, null::text, null::text, null::text, null::text;
    return;
  end if;
  if t.expires_at <= now() then
    return query select 'expired'::text, null::uuid, null::text, null::text, null::text, null::text;
    return;
  end if;

  if p_action = 'accept' then
    if p.status = 'accepted' then v_out := 'already';
    elsif p.status <> 'invited' or t.used_at is not null then v_out := 'inactive';
    else
      update public.partners x set status = 'accepted', responded_at = now() where x.id = p.id;
      update public.partner_tokens x set used_at = now() where x.id = t.id;
      insert into public.partner_sends (partner_id, kind, dedupe_key) values (p.id, 'accepted', 'accepted:' || p.id::text)
      on conflict (dedupe_key) do nothing;
      perform app.audit('partner.accepted', 'partner:' || p.id::text);
      v_out := 'accepted';
    end if;

  elsif p_action = 'decline' then
    if p.status = 'declined' then v_out := 'already';
    elsif p.status <> 'invited' or t.used_at is not null then v_out := 'inactive';
    else
      update public.partners x set status = 'declined', responded_at = now() where x.id = p.id;
      update public.partner_tokens x set used_at = now() where x.id = t.id;
      update public.partner_tokens x set revoked_at = now() where x.partner_id = p.id and x.id <> t.id and x.revoked_at is null;
      insert into public.partner_blocks (email_hash, reason) values (p.email_hash, 'declined') on conflict (email_hash) do nothing;
      perform app.audit('partner.declined', 'partner:' || p.id::text);
      v_out := 'declined';
    end if;

  elsif p_action = 'report' then
    -- Works whatever the status: the address is blocked for good either way.
    insert into public.partner_blocks (email_hash, reason) values (p.email_hash, 'reported')
    on conflict (email_hash) do update set reason = 'reported';
    if p.status = 'invited' then
      update public.partners x set status = 'declined', responded_at = now() where x.id = p.id;
    elsif p.status = 'accepted' then
      update public.partners x set status = 'stopped', stopped_by = 'partner', stopped_at = now() where x.id = p.id;
    end if;
    update public.partner_tokens x set used_at = coalesce(x.used_at, now()) where x.id = t.id;
    update public.partner_tokens x set revoked_at = now() where x.partner_id = p.id and x.id <> t.id and x.revoked_at is null;
    perform app.audit('partner.reported', 'partner:' || p.id::text);
    v_out := 'reported';

  elsif p_action = 'stop' then
    if p.status = 'stopped' then v_out := 'already';
    elsif p.status <> 'accepted' then v_out := 'inactive';
    else
      update public.partners x set status = 'stopped', stopped_by = 'partner', stopped_at = now() where x.id = p.id;
      update public.partner_tokens x set used_at = now() where x.id = t.id;
      update public.partner_tokens x set revoked_at = now() where x.partner_id = p.id and x.id <> t.id and x.revoked_at is null;
      insert into public.partner_sends (partner_id, kind, dedupe_key) values (p.id, 'stopped', 'stopped:' || p.id::text)
      on conflict (dedupe_key) do nothing;
      perform app.audit('partner.stopped', 'partner:' || p.id::text, 'partner');
      v_out := 'stopped';
    end if;

  elsif p_action = 'reply' then
    if p.status <> 'accepted' then v_out := 'inactive';
    elsif t.used_at is not null then v_out := 'already';
    elsif v_msg is null or char_length(v_msg) > 280 or v_msg ~ '[<>[:cntrl:]]' then v_out := 'invalid_message';
    else
      select count(*) into n from public.partner_replies r where r.partner_id = p.id and r.created_at > now() - interval '7 days';
      if n >= 3 then
        v_out := 'reply_limit';
      else
        insert into public.partner_replies (partner_id, body) values (p.id, v_msg);
        update public.partner_tokens x set used_at = now() where x.id = t.id;
        perform app.audit('partner.replied', 'partner:' || p.id::text);
        v_out := 'replied';
      end if;
    end if;
  end if;

  if v_out in ('accepted') then
    select u.email into v_mail from auth.users u where u.id = p.user_id;
  end if;
  return query select v_out, p.id, v_mail, p.reader_name, p.partner_name,
                      case when v_out in ('stopped') then p.partner_email end;
end $$;

-- ---------------------------------------------------------------------------
-- A stage update. Service role only. Called by the server after a progress
-- event. Decides whether an update is due, records it, stores the hashes of
-- the stop and reply tokens the server will put in the email, and hands the
-- note over once. Outcomes: send, no_partner, paused, not_shared, no_stage,
-- duplicate, capped.
-- ---------------------------------------------------------------------------
create or replace function app.partner_stage_update(p_enrolment uuid, p_stop_hash text, p_reply_hash text)
returns table (outcome text, partner_id uuid, partner_name text, partner_email text, reader_name text,
               share_level int, stage_number int, stage_count int, note text)
language plpgsql volatile security definer set search_path = '' as $$
declare
  e      public.enrolments;
  p      public.partners;
  v_tier text;
  v_sid  text;
  v_num  int;
  v_cnt  int;
  v_key  text;
  v_note text;
  n_week int;
  n_month int;
begin
  if not app.is_service_role() then
    raise exception 'only the service role sends partner updates' using errcode = 'AKP01';
  end if;
  if p_stop_hash !~ '^[0-9a-f]{64}$' or p_reply_hash !~ '^[0-9a-f]{64}$' or p_stop_hash = p_reply_hash then
    raise exception 'partner_invalid: token' using errcode = 'AKP02';
  end if;

  select * into e from public.enrolments x where x.id = p_enrolment;
  if not found then
    return query select 'no_partner'::text, null::uuid, null::text, null::text, null::text, null::int, null::int, null::int, null::text;
    return;
  end if;
  select * into p from public.partners x where x.user_id = e.user_id and x.status = 'accepted' for update;
  if not found then
    return query select 'no_partner'::text, null::uuid, null::text, null::text, null::text, null::int, null::int, null::int, null::text;
    return;
  end if;
  if app.partner_deletion_pending(e.user_id) then
    return query select 'paused'::text, p.id, null::text, null::text, null::text, null::int, null::int, null::int, null::text;
    return;
  end if;

  -- Wellbeing progress is shared only by the reader's explicit choice. An
  -- unknown tier counts as wellbeing (lib/consent.ts isWellbeingTier).
  select w.safety_tier into v_tier from public.workbooks w where w.id = e.workbook_id;
  if v_tier is distinct from 'none' and not p.include_wellbeing then
    return query select 'not_shared'::text, p.id, null::text, null::text, null::text, null::int, null::int, null::int, null::text;
    return;
  end if;

  select s.stage_id, s.stage_number, s.stage_count into v_sid, v_num, v_cnt from app.partner_stage_reached(p_enrolment) s;
  if v_sid is null then
    return query select 'no_stage'::text, p.id, null::text, null::text, null::text, null::int, null::int, null::int, null::text;
    return;
  end if;

  v_key := 'stage:' || p.id::text || ':' || e.id::text || ':' || v_num::text;
  if exists (select 1 from public.partner_sends s where s.dedupe_key = v_key) then
    return query select 'duplicate'::text, p.id, null::text, null::text, null::text, null::int, null::int, null::int, null::text;
    return;
  end if;

  select count(*) filter (where s.sent_at > now() - interval '7 days'), count(*)
    into n_week, n_month
    from public.partner_sends s
   where s.partner_id = p.id and s.kind = 'update' and s.sent_at > now() - interval '30 days';
  if n_week >= 1 or n_month >= 4 then
    return query select 'capped'::text, p.id, null::text, null::text, null::text, null::int, null::int, null::int, null::text;
    return;
  end if;

  insert into public.partner_sends (partner_id, kind, dedupe_key) values (p.id, 'update', v_key);
  insert into public.partner_tokens (partner_id, token_hash, purpose, expires_at) values
    (p.id, p_stop_hash, 'stop', now() + interval '90 days'),
    (p.id, p_reply_hash, 'reply', now() + interval '30 days');

  if p.share_level >= 3 and p.note is not null and p.note_sent_at is null then
    v_note := p.note;
    update public.partners x set note_sent_at = now() where x.id = p.id;
  end if;

  return query select 'send'::text, p.id, p.partner_name, p.partner_email, p.reader_name,
                      p.share_level::int, v_num, v_cnt, v_note;
end $$;

-- ---------------------------------------------------------------------------
-- When an account deletion completes, the partner's details go with it.
-- ---------------------------------------------------------------------------
create or replace function app.partner_on_deletion_completed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.completed_at is not null and old.completed_at is null then
    delete from public.partners p where p.user_id = new.user_id;
  end if;
  return new;
end $$;
create trigger account_deletion_requests_partner after update of completed_at on public.account_deletion_requests
  for each row execute function app.partner_on_deletion_completed();

-- ---------------------------------------------------------------------------
-- RPC wrappers. Security invoker: the app functions do the checks.
-- ---------------------------------------------------------------------------
create or replace function public.partner_invite(
  p_user uuid, p_reader_name text, p_partner_name text, p_email text, p_share_level int,
  p_include_wellbeing boolean, p_respond_hash text, p_report_hash text
) returns uuid
language sql volatile security invoker set search_path = '' as $$
  select app.partner_invite(p_user, p_reader_name, p_partner_name, p_email, p_share_level, p_include_wellbeing, p_respond_hash, p_report_hash)
$$;
create or replace function public.partner_settings(p_share_level int, p_include_wellbeing boolean, p_note text default null)
returns public.partners
language sql volatile security invoker set search_path = '' as $$
  select * from app.partner_settings(p_share_level, p_include_wellbeing, p_note)
$$;
create or replace function public.partner_stop()
returns table (partner_id uuid, partner_name text, partner_email text, reader_name text, notify boolean)
language sql volatile security invoker set search_path = '' as $$
  select * from app.partner_stop()
$$;
create or replace function public.partner_forget() returns boolean
language sql volatile security invoker set search_path = '' as $$
  select app.partner_forget()
$$;
create or replace function public.partner_link_view(p_token_hash text)
returns table (state text, purpose text, partner_status text, partner_name text, reader_name text, share_level int)
language sql stable security invoker set search_path = '' as $$
  select * from app.partner_link_view(p_token_hash)
$$;
create or replace function public.partner_link_act(p_token_hash text, p_action text, p_message text default null)
returns table (outcome text, partner_id uuid, reader_email text, reader_name text, partner_name text, partner_email text)
language sql volatile security invoker set search_path = '' as $$
  select * from app.partner_link_act(p_token_hash, p_action, p_message)
$$;
create or replace function public.partner_stage_update(p_enrolment uuid, p_stop_hash text, p_reply_hash text)
returns table (outcome text, partner_id uuid, partner_name text, partner_email text, reader_name text,
               share_level int, stage_number int, stage_count int, note text)
language sql volatile security invoker set search_path = '' as $$
  select * from app.partner_stage_update(p_enrolment, p_stop_hash, p_reply_hash)
$$;

revoke execute on function
  app.partner_email_hash(text), app.partner_deletion_pending(uuid), app.partner_stage_reached(uuid),
  app.partner_invite(uuid, text, text, text, int, boolean, text, text),
  app.partner_settings(int, boolean, text), app.partner_stop(), app.partner_forget(),
  app.partner_link_view(text), app.partner_link_act(text, text, text),
  app.partner_stage_update(uuid, text, text), app.partner_on_deletion_completed()
  from public, anon, authenticated;
revoke execute on function
  public.partner_invite(uuid, text, text, text, int, boolean, text, text),
  public.partner_settings(int, boolean, text), public.partner_stop(), public.partner_forget(),
  public.partner_link_view(text), public.partner_link_act(text, text, text),
  public.partner_stage_update(uuid, text, text)
  from public, anon, authenticated;

-- The signed-in reader.
grant execute on function app.partner_settings(int, boolean, text), app.partner_stop(), app.partner_forget(),
  public.partner_settings(int, boolean, text), public.partner_stop(), public.partner_forget() to authenticated;
-- Anyone holding a link may ask what it is for.
grant execute on function app.partner_link_view(text), public.partner_link_view(text) to anon, authenticated;
-- The server.
grant execute on function
  app.partner_invite(uuid, text, text, text, int, boolean, text, text), app.partner_link_act(text, text, text),
  app.partner_stage_update(uuid, text, text), app.partner_link_view(text), app.partner_stage_reached(uuid),
  public.partner_invite(uuid, text, text, text, int, boolean, text, text), public.partner_link_act(text, text, text),
  public.partner_stage_update(uuid, text, text), public.partner_link_view(text)
  to service_role;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.partners        enable row level security;
alter table public.partner_tokens  enable row level security;
alter table public.partner_sends   enable row level security;
alter table public.partner_replies enable row level security;
alter table public.partner_blocks  enable row level security;

revoke all on public.partners, public.partner_tokens, public.partner_sends, public.partner_replies, public.partner_blocks
  from anon, authenticated;

-- partners: the reader reads their own row. No client writes; the functions
-- above are the only way in.
grant select on public.partners to authenticated;
create policy partners_read_own on public.partners for select to authenticated
  using (user_id = (select app.uid()));

-- partner_replies: the reader reads what their partner sent. No client writes.
grant select on public.partner_replies to authenticated;
create policy partner_replies_read_own on public.partner_replies for select to authenticated
  using (exists (select 1 from public.partners p where p.id = partner_id and p.user_id = (select app.uid())));

-- partner_tokens, partner_sends and partner_blocks: no policy for anon or
-- authenticated, so nobody reads or writes them from a client. The service
-- role grant is what Supabase gives by default; plain Postgres needs it said.
grant select, insert, update, delete on public.partners, public.partner_tokens, public.partner_sends,
  public.partner_replies, public.partner_blocks to service_role;
