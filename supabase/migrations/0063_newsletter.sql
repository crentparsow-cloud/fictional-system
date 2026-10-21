-- 0063 Weekly newsletter with one exercise (build list 6.11).
--
-- What changes
--   1. public.newsletter_subscribers: an address, a status (pending until the
--      person confirms from the email, then confirmed, then unsubscribed) and
--      one random token. The token confirms and unsubscribes. Nobody reads or
--      writes this table from a client; the server uses the service role.
--   2. public.newsletter_issues: one issue holds a subject, a preheader, a
--      short intro, one exercise, an optional sponsor block (a paid
--      cross-recommendation: name, a short text and an https link; the email
--      labels it "Sponsored") and a send time. Staff owners and editors save,
--      schedule and cancel through public.save_newsletter_issue and
--      public.cancel_newsletter_issue.
--   3. public.newsletter_sends: which subscriber got which issue, so a run
--      that stops half way carries on without sending twice.
--   4. Server-only functions for the routes: subscribe (double opt-in),
--      confirm, unsubscribe, the due issue, the next recipients, the result
--      of each send, finishing an issue and purging pending sign-ups older
--      than 14 days. All are service role only.
--
-- Rules kept: double opt-in; one unsubscribe token per person; a pending
-- address is never mailed an issue; sign-up is rate limited (5 per ip hash an
-- hour, 500 in total an hour); the table holds a hash of the address's IP
-- and never the raw value; no issue names a workbook title (the console
-- checks that against the live titles before it saves). Nothing earlier is
-- edited. Depends on 0001, 0010 (email_claims).
--
-- Error codes:
--   AKN01  email address not valid
--   AKN02  ip hash not valid
--   AKN29  rate limited
--   AKN03  issue field invalid (the message names the field)
--   AKN04  issue not found
--   AKN05  issue can no longer be changed (it is sending or sent)
--   AKN06  send time missing or not in the future

-- ---------------------------------------------------------------------------
-- 1. Subscribers.
-- ---------------------------------------------------------------------------
create table public.newsletter_subscribers (
  id               uuid primary key default gen_random_uuid(),
  email            extensions.citext not null unique check (char_length(email::text) between 3 and 254),
  status           text not null default 'pending' check (status in ('pending','confirmed','unsubscribed')),
  token            text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  last_ip_hash     text check (last_ip_hash is null or last_ip_hash ~ '^[0-9a-f]{64}$'),
  confirm_sent_at  timestamptz,
  created_at       timestamptz not null default now(),
  confirmed_at     timestamptz,
  unsubscribed_at  timestamptz
);
create index newsletter_subscribers_status_idx on public.newsletter_subscribers(status);
create index newsletter_subscribers_ip_idx on public.newsletter_subscribers(last_ip_hash, confirm_sent_at desc);

alter table public.newsletter_subscribers enable row level security;
revoke all on public.newsletter_subscribers from public, anon, authenticated;
grant select, insert, update, delete on public.newsletter_subscribers to service_role;
-- No policy for anon or authenticated: nobody reads an address from a client.

-- ---------------------------------------------------------------------------
-- 2. Issues.
-- ---------------------------------------------------------------------------
create table public.newsletter_issues (
  id               uuid primary key default gen_random_uuid(),
  subject          text not null check (char_length(btrim(subject)) between 1 and 90),
  preheader        text not null default '' check (char_length(preheader) <= 140),
  intro            text not null default '' check (char_length(intro) <= 600),
  exercise_heading text not null check (char_length(btrim(exercise_heading)) between 1 and 80),
  exercise_body    text not null check (char_length(btrim(exercise_body)) between 1 and 2400),
  sponsor_name     text check (sponsor_name is null or char_length(btrim(sponsor_name)) between 1 and 80),
  sponsor_text     text check (sponsor_text is null or char_length(btrim(sponsor_text)) between 1 and 300),
  sponsor_url      text check (sponsor_url is null or (sponsor_url ~ '^https://[^\\s]+$' and char_length(sponsor_url) <= 300)),
  scheduled_for    timestamptz,
  status           text not null default 'draft' check (status in ('draft','scheduled','sending','sent','cancelled')),
  sent_at          timestamptz,
  sent_count       int not null default 0,
  failed_count     int not null default 0,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- A sponsor block has all three parts or none.
  check ((sponsor_name is null) = (sponsor_text is null) and (sponsor_text is null) = (sponsor_url is null))
);
create index newsletter_issues_due_idx on public.newsletter_issues(scheduled_for) where status in ('scheduled','sending');
create index newsletter_issues_created_by_idx on public.newsletter_issues(created_by);

alter table public.newsletter_issues enable row level security;
revoke all on public.newsletter_issues from public, anon, authenticated;
grant select on public.newsletter_issues to authenticated;
grant select, insert, update, delete on public.newsletter_issues to service_role;
create policy newsletter_issues_staff_read on public.newsletter_issues for select to authenticated
  using ((select app.is_staff()));

-- ---------------------------------------------------------------------------
-- 3. Sends.
-- ---------------------------------------------------------------------------
create table public.newsletter_sends (
  issue_id      uuid not null references public.newsletter_issues(id) on delete cascade,
  subscriber_id uuid not null references public.newsletter_subscribers(id) on delete cascade,
  status        text not null check (status in ('sent','failed')),
  attempts      int  not null default 1,
  last_at       timestamptz not null default now(),
  primary key (issue_id, subscriber_id)
);
create index newsletter_sends_subscriber_idx on public.newsletter_sends(subscriber_id);

alter table public.newsletter_sends enable row level security;
revoke all on public.newsletter_sends from public, anon, authenticated;
grant select, insert, update, delete on public.newsletter_sends to service_role;

-- ---------------------------------------------------------------------------
-- 4. Staff functions: save, schedule and cancel an issue; counts.
-- ---------------------------------------------------------------------------
create or replace function public.save_newsletter_issue(
  p_id uuid, p_subject text, p_preheader text, p_intro text, p_exercise_heading text, p_exercise_body text,
  p_sponsor_name text, p_sponsor_text text, p_sponsor_url text, p_scheduled_for timestamptz, p_schedule boolean
) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id      uuid := p_id;
  v_subject text := btrim(coalesce(p_subject, ''));
  v_pre     text := btrim(coalesce(p_preheader, ''));
  v_intro   text := btrim(coalesce(p_intro, ''));
  v_head    text := btrim(coalesce(p_exercise_heading, ''));
  v_body    text := btrim(coalesce(p_exercise_body, ''));
  v_sname   text := nullif(btrim(coalesce(p_sponsor_name, '')), '');
  v_stext   text := nullif(btrim(coalesce(p_sponsor_text, '')), '');
  v_surl    text := nullif(btrim(coalesce(p_sponsor_url, '')), '');
  v_old     text;
  v_status  text := case when p_schedule then 'scheduled' else 'draft' end;
begin
  if not app.is_platform(array['owner','editor']) then
    raise exception 'only platform owners and editors write the newsletter' using errcode = 'insufficient_privilege';
  end if;
  if char_length(v_subject) not between 1 and 90 then raise exception 'subject' using errcode = 'AKN03'; end if;
  if char_length(v_pre) > 140 then raise exception 'preheader' using errcode = 'AKN03'; end if;
  if char_length(v_intro) > 600 then raise exception 'intro' using errcode = 'AKN03'; end if;
  if char_length(v_head) not between 1 and 80 then raise exception 'exercise_heading' using errcode = 'AKN03'; end if;
  if char_length(v_body) not between 1 and 2400 then raise exception 'exercise_body' using errcode = 'AKN03'; end if;
  if (v_sname is null) <> (v_stext is null) or (v_stext is null) <> (v_surl is null) then
    raise exception 'sponsor' using errcode = 'AKN03';
  end if;
  if v_surl is not null and (v_surl !~ '^https://[^\\s]+$' or char_length(v_surl) > 300) then
    raise exception 'sponsor_url' using errcode = 'AKN03';
  end if;
  if (v_subject || v_pre || v_intro || v_head || v_body || coalesce(v_sname, '') || coalesce(v_stext, '')) ~ '[—–‒―]' then
    raise exception 'dashes' using errcode = 'AKN03';
  end if;
  if p_schedule and (p_scheduled_for is null or p_scheduled_for <= now()) then
    raise exception 'the send time must be in the future' using errcode = 'AKN06';
  end if;

  if v_id is null then
    insert into public.newsletter_issues
      (subject, preheader, intro, exercise_heading, exercise_body, sponsor_name, sponsor_text, sponsor_url, scheduled_for, status, created_by)
    values (v_subject, v_pre, v_intro, v_head, v_body, v_sname, v_stext, v_surl, p_scheduled_for, v_status, app.uid())
    returning id into v_id;
  else
    select status into v_old from public.newsletter_issues where id = v_id for update;
    if v_old is null then raise exception 'issue not found' using errcode = 'AKN04'; end if;
    if v_old in ('sending','sent') then raise exception 'issue is already going out' using errcode = 'AKN05'; end if;
    update public.newsletter_issues
       set subject = v_subject, preheader = v_pre, intro = v_intro, exercise_heading = v_head, exercise_body = v_body,
           sponsor_name = v_sname, sponsor_text = v_stext, sponsor_url = v_surl,
           scheduled_for = p_scheduled_for, status = v_status, updated_at = now()
     where id = v_id;
  end if;
  perform app.audit('newsletter.saved', 'newsletter_issue:' || v_id::text, null, null, null, null,
    jsonb_build_object('status', v_status, 'sponsored', v_sname is not null));
  return v_id;
end $$;

create or replace function public.cancel_newsletter_issue(p_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_old text;
begin
  if not app.is_platform(array['owner','editor']) then
    raise exception 'only platform owners and editors write the newsletter' using errcode = 'insufficient_privilege';
  end if;
  select status into v_old from public.newsletter_issues where id = p_id for update;
  if v_old is null then raise exception 'issue not found' using errcode = 'AKN04'; end if;
  if v_old in ('sending','sent') then raise exception 'issue is already going out' using errcode = 'AKN05'; end if;
  update public.newsletter_issues set status = 'cancelled', updated_at = now() where id = p_id;
  perform app.audit('newsletter.cancelled', 'newsletter_issue:' || p_id::text, null, null, null, null, null);
end $$;

-- Counts for the console. No addresses.
create or replace function public.newsletter_stats() returns table (pending bigint, confirmed bigint, unsubscribed bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_platform(array['owner','editor','support']) then
    raise exception 'only staff read newsletter counts' using errcode = 'insufficient_privilege';
  end if;
  return query
    select count(*) filter (where s.status = 'pending'),
           count(*) filter (where s.status = 'confirmed'),
           count(*) filter (where s.status = 'unsubscribed')
      from public.newsletter_subscribers s;
end $$;

revoke execute on function public.save_newsletter_issue(uuid, text, text, text, text, text, text, text, text, timestamptz, boolean) from public, anon;
revoke execute on function public.cancel_newsletter_issue(uuid) from public, anon;
revoke execute on function public.newsletter_stats() from public, anon;
grant execute on function public.save_newsletter_issue(uuid, text, text, text, text, text, text, text, text, timestamptz, boolean) to authenticated;
grant execute on function public.cancel_newsletter_issue(uuid) to authenticated;
grant execute on function public.newsletter_stats() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Service role functions for the routes and the cron.
-- ---------------------------------------------------------------------------

-- Sign up. Returns the token to put in a confirmation email, or null when no
-- email should go (already confirmed, or a confirmation went out in the last
-- ten minutes). The caller shows the same words either way, so the form does
-- not reveal whether an address is on the list.
create or replace function app.newsletter_subscribe(p_email text, p_ip_hash text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_email  text := lower(nullif(btrim(p_email), ''));
  v_recent int;
  v_total  int;
  v_row    public.newsletter_subscribers;
begin
  if not app.is_service_role() then
    raise exception 'only the service role signs people up' using errcode = 'insufficient_privilege';
  end if;
  if v_email is null or char_length(v_email) > 254 or v_email !~ '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$' then
    raise exception 'email address not valid' using errcode = 'AKN01';
  end if;
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'ip hash not valid' using errcode = 'AKN02';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('newsletter:' || p_ip_hash, 0));
  select count(*) into v_recent from public.newsletter_subscribers
   where last_ip_hash = p_ip_hash and confirm_sent_at > now() - interval '1 hour';
  select count(*) into v_total from public.newsletter_subscribers where confirm_sent_at > now() - interval '1 hour';
  if v_recent >= 5 or v_total >= 500 then
    raise exception 'too many sign-ups' using errcode = 'AKN29';
  end if;

  select * into v_row from public.newsletter_subscribers where email = v_email for update;
  if not found then
    insert into public.newsletter_subscribers (email, last_ip_hash, confirm_sent_at)
    values (v_email, p_ip_hash, now()) returning * into v_row;
    return v_row.token;
  end if;
  if v_row.status = 'confirmed' then
    return null;
  end if;
  if v_row.confirm_sent_at > now() - interval '10 minutes' and v_row.status = 'pending' then
    return null;
  end if;
  -- Pending again, or back after unsubscribing: a fresh token and a fresh confirmation.
  update public.newsletter_subscribers
     set status = 'pending', token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
         last_ip_hash = p_ip_hash, confirm_sent_at = now(), unsubscribed_at = null
   where id = v_row.id returning * into v_row;
  return v_row.token;
end $$;

-- Confirm from the email. True when the person is now (or already was) confirmed.
create or replace function app.newsletter_confirm(p_token text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare v_row public.newsletter_subscribers;
begin
  if not app.is_service_role() then
    raise exception 'only the service role confirms sign-ups' using errcode = 'insufficient_privilege';
  end if;
  select * into v_row from public.newsletter_subscribers where token = p_token for update;
  if not found or v_row.status = 'unsubscribed' then return false; end if;
  if v_row.status = 'pending' then
    update public.newsletter_subscribers set status = 'confirmed', confirmed_at = now() where id = v_row.id;
  end if;
  return true;
end $$;

-- Unsubscribe. True when the token belongs to someone. Safe to repeat.
create or replace function app.newsletter_unsubscribe(p_token text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not app.is_service_role() then
    raise exception 'only the service role unsubscribes people' using errcode = 'insufficient_privilege';
  end if;
  update public.newsletter_subscribers
     set status = 'unsubscribed', unsubscribed_at = coalesce(unsubscribed_at, now())
   where token = p_token returning id into v_id;
  return v_id is not null;
end $$;

-- The one issue to work on now: one already sending, otherwise the earliest
-- scheduled issue whose time has come. It is marked sending.
create or replace function app.newsletter_take_due_issue() returns setof public.newsletter_issues
language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not app.is_service_role() then
    raise exception 'only the service role runs the newsletter' using errcode = 'insufficient_privilege';
  end if;
  select i.id into v_id from public.newsletter_issues i
   where i.status = 'sending'
      or (i.status = 'scheduled' and i.scheduled_for <= now())
   order by (i.status = 'sending') desc, i.scheduled_for
   limit 1 for update skip locked;
  if v_id is null then return; end if;
  update public.newsletter_issues set status = 'sending', updated_at = now() where id = v_id and status = 'scheduled';
  return query select * from public.newsletter_issues where id = v_id;
end $$;

-- Confirmed subscribers who have not had this issue (or whose last try failed
-- fewer than three times), up to p_limit.
create or replace function app.newsletter_next_recipients(p_issue uuid, p_limit int)
returns table (subscriber_id uuid, email text, token text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_service_role() then
    raise exception 'only the service role runs the newsletter' using errcode = 'insufficient_privilege';
  end if;
  return query
    select s.id, s.email::text, s.token
      from public.newsletter_subscribers s
      left join public.newsletter_sends x on x.issue_id = p_issue and x.subscriber_id = s.id
     where s.status = 'confirmed'
       and (x.subscriber_id is null or (x.status = 'failed' and x.attempts < 3))
     order by s.created_at
     limit greatest(1, least(coalesce(p_limit, 100), 2000));
end $$;

create or replace function app.newsletter_record_send(p_issue uuid, p_subscriber uuid, p_ok boolean) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not app.is_service_role() then
    raise exception 'only the service role runs the newsletter' using errcode = 'insufficient_privilege';
  end if;
  insert into public.newsletter_sends (issue_id, subscriber_id, status, attempts)
  values (p_issue, p_subscriber, case when p_ok then 'sent' else 'failed' end, 1)
  on conflict (issue_id, subscriber_id) do update
    set status = excluded.status, attempts = public.newsletter_sends.attempts + 1, last_at = now();
end $$;

-- Marks an issue sent when nobody is left to try. Returns true when it did.
create or replace function app.newsletter_finish_issue(p_issue uuid) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare v_left int; v_sent int; v_failed int;
begin
  if not app.is_service_role() then
    raise exception 'only the service role runs the newsletter' using errcode = 'insufficient_privilege';
  end if;
  select count(*) into v_left
    from public.newsletter_subscribers s
    left join public.newsletter_sends x on x.issue_id = p_issue and x.subscriber_id = s.id
   where s.status = 'confirmed' and (x.subscriber_id is null or (x.status = 'failed' and x.attempts < 3));
  if v_left > 0 then return false; end if;
  select count(*) filter (where status = 'sent'), count(*) filter (where status = 'failed')
    into v_sent, v_failed from public.newsletter_sends where issue_id = p_issue;
  update public.newsletter_issues
     set status = 'sent', sent_at = now(), sent_count = v_sent, failed_count = v_failed, updated_at = now()
   where id = p_issue and status = 'sending';
  return true;
end $$;

-- Sign-ups never confirmed within 14 days are removed. Returns how many.
create or replace function app.newsletter_purge_pending() returns int
language plpgsql volatile security definer set search_path = '' as $$
declare n int;
begin
  if not app.is_service_role() then
    raise exception 'only the service role runs the newsletter' using errcode = 'insufficient_privilege';
  end if;
  delete from public.newsletter_subscribers where status = 'pending' and created_at < now() - interval '14 days';
  get diagnostics n = row_count;
  return n;
end $$;

-- Public wrappers, callable only by the service role.
create or replace function public.newsletter_subscribe(p_email text, p_ip_hash text) returns text
language sql volatile security invoker set search_path = '' as $$ select app.newsletter_subscribe(p_email, p_ip_hash) $$;
create or replace function public.newsletter_confirm(p_token text) returns boolean
language sql volatile security invoker set search_path = '' as $$ select app.newsletter_confirm(p_token) $$;
create or replace function public.newsletter_unsubscribe(p_token text) returns boolean
language sql volatile security invoker set search_path = '' as $$ select app.newsletter_unsubscribe(p_token) $$;
create or replace function public.newsletter_take_due_issue() returns setof public.newsletter_issues
language sql volatile security invoker set search_path = '' as $$ select * from app.newsletter_take_due_issue() $$;
create or replace function public.newsletter_next_recipients(p_issue uuid, p_limit int)
returns table (subscriber_id uuid, email text, token text)
language sql stable security invoker set search_path = '' as $$ select * from app.newsletter_next_recipients(p_issue, p_limit) $$;
create or replace function public.newsletter_record_send(p_issue uuid, p_subscriber uuid, p_ok boolean) returns void
language sql volatile security invoker set search_path = '' as $$ select app.newsletter_record_send(p_issue, p_subscriber, p_ok) $$;
create or replace function public.newsletter_finish_issue(p_issue uuid) returns boolean
language sql volatile security invoker set search_path = '' as $$ select app.newsletter_finish_issue(p_issue) $$;
create or replace function public.newsletter_purge_pending() returns int
language sql volatile security invoker set search_path = '' as $$ select app.newsletter_purge_pending() $$;

revoke execute on function
  app.newsletter_subscribe(text, text), app.newsletter_confirm(text), app.newsletter_unsubscribe(text),
  app.newsletter_take_due_issue(), app.newsletter_next_recipients(uuid, int), app.newsletter_record_send(uuid, uuid, boolean),
  app.newsletter_finish_issue(uuid), app.newsletter_purge_pending()
  from public;
revoke execute on function
  public.newsletter_subscribe(text, text), public.newsletter_confirm(text), public.newsletter_unsubscribe(text),
  public.newsletter_take_due_issue(), public.newsletter_next_recipients(uuid, int), public.newsletter_record_send(uuid, uuid, boolean),
  public.newsletter_finish_issue(uuid), public.newsletter_purge_pending()
  from public, anon, authenticated;
grant execute on function
  app.newsletter_subscribe(text, text), app.newsletter_confirm(text), app.newsletter_unsubscribe(text),
  app.newsletter_take_due_issue(), app.newsletter_next_recipients(uuid, int), app.newsletter_record_send(uuid, uuid, boolean),
  app.newsletter_finish_issue(uuid), app.newsletter_purge_pending(),
  public.newsletter_subscribe(text, text), public.newsletter_confirm(text), public.newsletter_unsubscribe(text),
  public.newsletter_take_due_issue(), public.newsletter_next_recipients(uuid, int), public.newsletter_record_send(uuid, uuid, boolean),
  public.newsletter_finish_issue(uuid), public.newsletter_purge_pending()
  to service_role;
