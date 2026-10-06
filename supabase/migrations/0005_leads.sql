-- 0005 Leads: enquiries from the Publish with Akana page (F-001).
--
-- Same rules as 0001 to 0004. RLS is on. Grants to anon and authenticated are
-- revoked for the new table and given back narrowly.
--
-- The shape of trust here:
--   * Nobody outside staff reads a lead. anon and authenticated have no
--     select, insert, update or delete on public.leads.
--   * The only write path from a client is app.submit_lead(), reached through
--     the public.submit_lead() RPC wrapper. It is security definer, checks
--     every field, refuses without consent and rate limits inside the
--     database, so the server action cannot be skipped to flood the table
--     from one address.
--   * Platform owners, editors and support read leads and change status, and
--     nothing else. Every status change writes one audit row.
--   * The table holds hashes of the IP address and user agent, never the
--     raw values. The server salts them (LEAD_HASH_SALT) before they arrive.
--
-- Error codes raised by app.submit_lead, for the server action to map:
--   AKL01  consent not given
--   AKL02  a field failed validation (the message names the field)
--   AKL29  rate limited: more than 5 leads from one ip_hash in an hour, or
--          more than 200 leads in total in an hour

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table public.leads (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  kind            text not null check (kind in ('author','publisher','agent','other')),
  name            text not null check (char_length(name) between 1 and 200),
  email           extensions.citext not null check (char_length(email::text) between 3 and 254),
  organisation    text check (char_length(organisation) <= 200),
  country         char(2) check (country ~ '^[A-Z]{2}$'),
  catalogue_size  text check (char_length(catalogue_size) <= 50),
  -- The form on /publish asks for these four as well (copy doc, enquiry form).
  book_title      text check (char_length(book_title) <= 300),
  book_ref        text check (char_length(book_ref) <= 500),
  genre           text references public.genres(id),
  interest        text check (interest in ('marketplace','built','white_label','unsure')),
  message         text check (char_length(message) <= 4000),
  source          text not null default 'publish_page' check (source ~ '^[a-z_]{1,40}$'),
  consent_contact boolean not null check (consent_contact),
  status          text not null default 'new' check (status in ('new','contacted','closed')),
  ip_hash         text check (ip_hash ~ '^[0-9a-f]{64}$'),
  user_agent_hash text check (user_agent_hash ~ '^[0-9a-f]{64}$')
);
create index leads_ip_recent_idx on public.leads(ip_hash, created_at desc);
create index leads_created_idx on public.leads(created_at desc);
create index leads_status_idx on public.leads(status, created_at desc);

-- ---------------------------------------------------------------------------
-- Submit a lead. Security definer, search_path pinned. Validates lengths and
-- shapes, refuses without consent, then rate limits: at most 5 leads per
-- ip_hash in the last hour, and at most 200 leads in total in the last hour
-- as a ceiling against a caller who invents a fresh hash per request. An
-- advisory lock per ip_hash makes the count and the insert one step, so two
-- requests in flight cannot both take the fifth slot.
-- ---------------------------------------------------------------------------
create or replace function app.submit_lead(
  p_kind            text,
  p_name            text,
  p_email           text,
  p_consent         boolean,
  p_ip_hash         text,
  p_user_agent_hash text default null,
  p_organisation    text default null,
  p_book_title      text default null,
  p_book_ref        text default null,
  p_genre           text default null,
  p_interest        text default null,
  p_message         text default null,
  p_country         text default null,
  p_catalogue_size  text default null,
  p_source          text default 'publish_page'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_name    text := nullif(btrim(p_name), '');
  v_email   text := lower(nullif(btrim(p_email), ''));
  v_org     text := nullif(btrim(p_organisation), '');
  v_title   text := nullif(btrim(p_book_title), '');
  v_ref     text := nullif(btrim(p_book_ref), '');
  v_genre   text := nullif(btrim(p_genre), '');
  v_int     text := nullif(btrim(p_interest), '');
  v_msg     text := nullif(btrim(p_message), '');
  v_country text := upper(nullif(btrim(p_country), ''));
  v_size    text := nullif(btrim(p_catalogue_size), '');
  v_source  text := coalesce(nullif(btrim(p_source), ''), 'publish_page');
  v_recent  int;
  v_id      uuid;
begin
  if p_consent is distinct from true then
    raise exception 'consent to store and contact is required' using errcode = 'AKL01';
  end if;

  if p_kind is null or p_kind not in ('author','publisher','agent','other') then
    raise exception 'lead_invalid: kind' using errcode = 'AKL02';
  end if;
  if v_name is null or char_length(v_name) > 200 then
    raise exception 'lead_invalid: name' using errcode = 'AKL02';
  end if;
  if v_email is null or char_length(v_email) > 254 or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'lead_invalid: email' using errcode = 'AKL02';
  end if;
  if char_length(v_org) > 200 then
    raise exception 'lead_invalid: organisation' using errcode = 'AKL02';
  end if;
  if char_length(v_title) > 300 then
    raise exception 'lead_invalid: book_title' using errcode = 'AKL02';
  end if;
  if char_length(v_ref) > 500 then
    raise exception 'lead_invalid: book_ref' using errcode = 'AKL02';
  end if;
  if v_genre is not null and not exists (select 1 from public.genres g where g.id = v_genre) then
    raise exception 'lead_invalid: genre' using errcode = 'AKL02';
  end if;
  if v_int is not null and v_int not in ('marketplace','built','white_label','unsure') then
    raise exception 'lead_invalid: interest' using errcode = 'AKL02';
  end if;
  if char_length(v_msg) > 4000 then
    raise exception 'lead_invalid: message' using errcode = 'AKL02';
  end if;
  if v_country is not null and v_country !~ '^[A-Z]{2}$' then
    raise exception 'lead_invalid: country' using errcode = 'AKL02';
  end if;
  if char_length(v_size) > 50 then
    raise exception 'lead_invalid: catalogue_size' using errcode = 'AKL02';
  end if;
  if v_source !~ '^[a-z_]{1,40}$' then
    raise exception 'lead_invalid: source' using errcode = 'AKL02';
  end if;
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'lead_invalid: ip_hash' using errcode = 'AKL02';
  end if;
  if p_user_agent_hash is not null and p_user_agent_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'lead_invalid: user_agent_hash' using errcode = 'AKL02';
  end if;

  perform pg_advisory_xact_lock(hashtext('lead:' || p_ip_hash));
  select count(*) into v_recent from public.leads
   where ip_hash = p_ip_hash and created_at > now() - interval '1 hour';
  if v_recent >= 5 then
    raise exception 'rate_limited: too many enquiries from this address, try again later' using errcode = 'AKL29';
  end if;
  select count(*) into v_recent from public.leads where created_at > now() - interval '1 hour';
  if v_recent >= 200 then
    raise exception 'rate_limited: too many enquiries, try again later' using errcode = 'AKL29';
  end if;

  insert into public.leads (kind, name, email, organisation, country, catalogue_size, book_title, book_ref,
                            genre, interest, message, source, consent_contact, ip_hash, user_agent_hash)
  values (p_kind, v_name, v_email, v_org, v_country, v_size, v_title, v_ref,
          v_genre, v_int, v_msg, v_source, true, p_ip_hash, p_user_agent_hash)
  returning id into v_id;
  return v_id;
end $$;

-- RPC wrapper. PostgREST exposes the public schema only. Security invoker:
-- the app function does the checks.
create or replace function public.submit_lead(
  p_kind            text,
  p_name            text,
  p_email           text,
  p_consent         boolean,
  p_ip_hash         text,
  p_user_agent_hash text default null,
  p_organisation    text default null,
  p_book_title      text default null,
  p_book_ref        text default null,
  p_genre           text default null,
  p_interest        text default null,
  p_message         text default null,
  p_country         text default null,
  p_catalogue_size  text default null,
  p_source          text default 'publish_page'
) returns uuid
language sql security invoker set search_path = '' as $$
  select app.submit_lead(p_kind, p_name, p_email, p_consent, p_ip_hash, p_user_agent_hash, p_organisation,
                         p_book_title, p_book_ref, p_genre, p_interest, p_message, p_country, p_catalogue_size, p_source)
$$;

revoke execute on function app.submit_lead(text, text, text, boolean, text, text, text, text, text, text, text, text, text, text, text) from public;
revoke execute on function public.submit_lead(text, text, text, boolean, text, text, text, text, text, text, text, text, text, text, text) from public;
grant execute on function app.submit_lead(text, text, text, boolean, text, text, text, text, text, text, text, text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.submit_lead(text, text, text, boolean, text, text, text, text, text, text, text, text, text, text, text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Status changes are audited: one row per change, before and after status.
-- Runs as definer so app.audit can write whoever the caller is.
-- ---------------------------------------------------------------------------
create or replace function app.audit_lead_status() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    perform app.audit('leads.status', 'lead:' || new.id::text, null, null, null,
      jsonb_build_object('status', old.status), jsonb_build_object('status', new.status));
  end if;
  return new;
end $$;
create trigger leads_status_audit after update of status on public.leads
  for each row execute function app.audit_lead_status();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.leads enable row level security;
revoke all on public.leads from anon, authenticated;

-- Staff read every lead and change status, and only status.
grant select on public.leads to authenticated;
grant update (status) on public.leads to authenticated;
create policy leads_staff_read on public.leads for select to authenticated
  using ((select app.is_platform(array['owner','editor','support'])));
create policy leads_staff_update on public.leads for update to authenticated
  using ((select app.is_platform(array['owner','editor','support'])))
  with check ((select app.is_platform(array['owner','editor','support'])));
