-- 0013 Author and publisher onboarding (F-033 to F-037, F-055, F-056).
--
-- Depends on 0001 to 0012 only. Same rules as before: every table has RLS
-- on, grants to anon and authenticated are revoked and given back narrowly,
-- helpers are security definer with search_path pinned to '', and PostgREST
-- sees thin public wrappers. Nothing in 0001 to 0012 is edited.
--
-- What this adds:
--   * Invitations to an organisation (F-033, F-055). Staff invite the first
--     person; organisation owners invite their own team. The link carries a
--     random token, stored only as a sha256 hash, as for check-in partners
--     (0012). An invitation is bound to one email address: it is accepted
--     only by a signed-in user whose account has that address, so a token
--     seen by anyone else is no use to them.
--   * Member changes with audit (F-055): change role, remove. Only staff
--     make or unmake an owner (ownership transfer by staff at launch). The
--     last-owner guard from 0001 still holds. Removing a member takes effect
--     on their next request, because every policy reads org_members live.
--   * Author profiles (F-034): pen name and legal name kept apart, a bio that
--     goes public only after staff approve it, a photo rights tick, links.
--   * Imprints as labels (F-056) and a roster of authors without logins
--     unless invited.
--   * Book records (F-035) with series, imprint, genre, ISBN uniqueness and a
--     private rights record (cover rights tick, KDP Select declaration).
--   * Licences (F-036): versioned licence texts, clickwrap acceptance and
--     signed uploads. The first text is a placeholder marked draft. A draft
--     text cannot be signed for a real organisation, only for a demo one as
--     a test, and a test signature never counts. A workbook cannot go live
--     without an active licence for its book unless it is demo, Akana house
--     or public domain.
--   * Submissions (F-037): upload a manuscript, or ask Akana to develop the
--     workbook. Both create a Draft workbook and a submission row whose
--     status column is what the staff review queue reads.
--   * Files. Manuscripts and signed licence PDFs live in the private
--     org-files bucket that F-135 sets up, under its fixed paths:
--       <organisation id>/manuscripts/<uuid>.(pdf|docx|epub)
--       <organisation id>/licences/<uuid>.pdf
--     This migration creates no bucket and no storage policy. It records
--     which file belongs to which submission or licence, and refuses a path
--     outside the caller's organisation.
--
-- Error codes, for the server to map:
--   AKS01  not allowed (wrong role, or not signed in)
--   AKS02  a field failed validation (the message names the field)
--   AKS03  the invitation is for a different email address
--   AKS04  the link is unknown, expired, used or revoked
--   AKS05  already exists (member, pending invitation, ISBN)
--   AKS06  the licence text is a draft and cannot be signed for real
--   AKS08  the row is not in a state that allows this
--   AKS29  rate limited

-- ---------------------------------------------------------------------------
-- 1. Imprints: a label and a statement filter, never a permission boundary.
-- ---------------------------------------------------------------------------
create table public.imprints (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organisations(id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 120 and name !~ '[<>[:cntrl:]]'),
  created_at timestamptz not null default now(),
  unique (org_id, name)
);
create index imprints_org_idx on public.imprints(org_id);

-- ---------------------------------------------------------------------------
-- 2. Authors: the extra profile fields. user_id links a roster entry to the
-- person who accepted an invitation for it; it is never granted to clients.
-- bio stays the public, approved text. bio_draft is what the author wrote
-- and waits for staff.
-- ---------------------------------------------------------------------------
alter table public.authors
  add column user_id                   uuid references auth.users(id) on delete set null,
  add column links                     jsonb not null default '[]'::jsonb check (jsonb_typeof(links) = 'array' and jsonb_array_length(links) <= 5),
  add column photo_rights_confirmed_at timestamptz,
  add column bio_draft                 text check (bio_draft is null or char_length(bio_draft) <= 1200),
  add column bio_status                text not null default 'none' check (bio_status in ('none','pending','approved','rejected')),
  add column bio_flags                 jsonb not null default '[]'::jsonb check (jsonb_typeof(bio_flags) = 'array'),
  add column bio_submitted_at          timestamptz,
  add column bio_reviewed_by           uuid references auth.users(id),
  add column bio_reviewed_at           timestamptz,
  -- True for every author made from now on (studio or client insert). Rows
  -- from before this migration (seed and demo authors) keep their 0002
  -- behaviour until staff touch them.
  add column bio_review_required       boolean not null default false;
create index authors_user_idx on public.authors(user_id) where user_id is not null;

-- links are public with the profile; the rest is read through the studio functions.
grant select (links) on public.authors to anon, authenticated;

-- The public bio changes only through staff review. Runs as the caller, as
-- the workbook status guard does, so server code and security definer
-- functions pass through. A client insert always needs review; a client
-- update may not touch the public bio of an author that needs review, nor the
-- review fields or the login link.
create or replace function app.guard_author_bio() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated') and not app.is_platform(array['owner','editor']) then
    if tg_op = 'INSERT' then
      if new.bio is not null or new.bio_status in ('approved','rejected') or new.user_id is not null then
        raise exception 'the public bio is set by staff review' using errcode = 'insufficient_privilege';
      end if;
      new.bio_review_required := true;
    elsif (old.bio_review_required and new.bio is distinct from old.bio)
       or new.bio_review_required is distinct from old.bio_review_required
       or (new.bio_status is distinct from old.bio_status and new.bio_status in ('approved','rejected'))
       or new.bio_reviewed_by is distinct from old.bio_reviewed_by
       or new.bio_reviewed_at is distinct from old.bio_reviewed_at
       or new.user_id is distinct from old.user_id then
      raise exception 'the public bio is set by staff review' using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end $$;
create trigger authors_bio_guard before insert or update on public.authors
  for each row execute function app.guard_author_bio();

-- ---------------------------------------------------------------------------
-- 3. Books: series, imprint and genre are public with the book. The rights
-- record is private to the organisation and staff.
-- ---------------------------------------------------------------------------
alter table public.books
  add column series        text check (series is null or char_length(series) <= 200),
  add column series_number numeric(6,1) check (series_number is null or series_number > 0),
  add column imprint_id    uuid references public.imprints(id) on delete set null,
  add column genre_id      text references public.genres(id);
create index books_imprint_idx on public.books(imprint_id);

create table public.book_rights (
  book_id                   uuid primary key references public.books(id) on delete cascade,
  org_id                    uuid not null references public.organisations(id),
  cover_rights_confirmed_at timestamptz,
  kdp_select                boolean,             -- null: not yet declared
  kdp_select_declared_at    timestamptz,
  updated_by                uuid references auth.users(id),
  updated_at                timestamptz not null default now(),
  constraint book_rights_kdp check ((kdp_select is null) = (kdp_select_declared_at is null))
);
create index book_rights_org_idx on public.book_rights(org_id);

-- ISBNs: ten or thirteen characters once spaces and hyphens are gone, and
-- one book per ISBN across every organisation.
create or replace function app.normalise_isbns(p jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
  from (select upper(regexp_replace(x, '[\s-]', '', 'g')) v
        from jsonb_array_elements_text(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) x) s
  where v <> ''
$$;

create or replace function app.guard_book_isbns() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v text;
begin
  new.isbns := app.normalise_isbns(new.isbns);
  if tg_op = 'UPDATE' and new.isbns = old.isbns then return new; end if;
  for v in select jsonb_array_elements_text(new.isbns) loop
    if v !~ '^([0-9]{9}[0-9X]|97[89][0-9]{10})$' then
      raise exception 'book_invalid: isbn %', v using errcode = 'AKS02';
    end if;
    perform pg_advisory_xact_lock(hashtext('isbn:' || v));
    if exists (select 1 from public.books b where b.id <> new.id and b.isbns ? v) then
      raise exception 'book_exists: isbn % is already on another book', v using errcode = 'AKS05';
    end if;
  end loop;
  return new;
end $$;
create trigger books_isbn_guard before insert or update of isbns on public.books
  for each row execute function app.guard_book_isbns();

-- ---------------------------------------------------------------------------
-- 4. Invitations.
-- ---------------------------------------------------------------------------
create table public.org_invitations (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organisations(id) on delete cascade,
  email        text not null check (char_length(email) between 3 and 254 and email = lower(email) and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  role         text not null check (role in ('owner','editor','finance','author','viewer')),
  author_id    uuid references public.authors(id) on delete set null,
  token_hash   text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  invited_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  last_sent_at timestamptz not null default now(),
  send_count   int not null default 1 check (send_count between 1 and 10),
  expires_at   timestamptz not null,
  accepted_at  timestamptz,
  accepted_by  uuid references auth.users(id) on delete set null,
  revoked_at   timestamptz,
  constraint org_invitations_window check (expires_at > created_at),
  constraint org_invitations_once check (accepted_at is null or revoked_at is null)
);
create index org_invitations_org_idx on public.org_invitations(org_id, created_at desc);
-- One open invitation per address per organisation.
create unique index org_invitations_open_idx on public.org_invitations(org_id, email) where accepted_at is null and revoked_at is null;

-- ---------------------------------------------------------------------------
-- 5. Licence texts and licences.
-- ---------------------------------------------------------------------------
create table public.licence_texts (
  version        text primary key check (version ~ '^[0-9]+\.[0-9]+\.[0-9]+(-draft)?$'),
  title          text not null,
  status         text not null default 'draft' check (status in ('draft','approved','retired')),
  -- A placeholder text can never be approved. The lawyer's text arrives as a new version.
  is_placeholder boolean not null default true,
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  source_file    text not null,
  approved_by    uuid references auth.users(id),
  approved_at    timestamptz,
  created_at     timestamptz not null default now(),
  constraint licence_texts_approved check ((status = 'approved') = (approved_at is not null) or status = 'retired'),
  constraint licence_texts_placeholder check (not (is_placeholder and status = 'approved'))
);

insert into public.licence_texts (version, title, status, is_placeholder, content_sha256, source_file) values
  ('0.1.0-draft', 'Interactive workbook licence', 'draft', true,
   'ba074f6ee1aaf06f4b0ba947ad210cd244b29aefad772d103d3ff55f9223893e', 'docs/legal/author-licence.md');

create table public.licences (
  id                    uuid primary key default gen_random_uuid(),
  ref                   text not null unique check (ref ~ '^LIC-[0-9A-HJKMNP-TV-Z]{5}$'),
  book_id               uuid not null references public.books(id),
  org_id                uuid not null references public.organisations(id),
  text_version          text not null references public.licence_texts(version),
  text_sha256           text not null check (text_sha256 ~ '^[0-9a-f]{64}$'),
  method                text not null check (method in ('clickwrap','signed_upload')),
  -- test_only: signed on a draft text by a demo organisation. Never counts.
  status                text not null check (status in ('test_only','pending_verification','active','rejected','superseded')),
  territories           text[] not null default array['WORLD'] check (cardinality(territories) between 1 and 250),
  excluded_territories  text[] not null default '{}',
  term_months           int not null check (term_months between 1 and 600),
  starts_at             timestamptz not null default now(),
  ends_at               timestamptz,
  exclusive_until       timestamptz,
  subscription_included boolean not null,
  cover_rights          boolean not null,
  audio_rights          boolean not null,
  warranties            jsonb not null,
  signer_user_id        uuid references auth.users(id) on delete set null,
  signer_name           text not null check (char_length(btrim(signer_name)) between 2 and 200 and signer_name !~ '[<>[:cntrl:]]'),
  signer_capacity       text not null check (char_length(btrim(signer_capacity)) between 2 and 120 and signer_capacity !~ '[<>[:cntrl:]]'),
  signed_at             timestamptz not null default now(),
  signer_ip_hash        text check (signer_ip_hash is null or signer_ip_hash ~ '^[0-9a-f]{64}$'),
  signed_document_path  text check (signed_document_path is null or char_length(signed_document_path) <= 400),
  document_sha256       text check (document_sha256 is null or document_sha256 ~ '^[0-9a-f]{64}$'),
  verified_by           uuid references auth.users(id),
  verified_at           timestamptz,
  review_reason         text check (review_reason is null or char_length(review_reason) <= 500),
  created_at            timestamptz not null default now(),
  constraint licences_upload check ((method = 'signed_upload') = (signed_document_path is not null))
);
create index licences_book_idx on public.licences(book_id, status);
create index licences_org_idx on public.licences(org_id);
create unique index licences_one_active_idx on public.licences(book_id) where status = 'active';

-- ---------------------------------------------------------------------------
-- 6. Submissions. status is what the staff review queue reads.
-- ---------------------------------------------------------------------------
create table public.workbook_submissions (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organisations(id),
  book_id         uuid not null references public.books(id),
  workbook_id     uuid not null unique references public.workbooks(id),
  route           text not null check (route in ('upload','develop')),
  brief           text not null check (char_length(btrim(brief)) between 1 and 4000),
  status          text not null default 'submitted'
                  check (status in ('submitted','accepted','quoted','deposit_paid','changes_requested','completed','declined','withdrawn')),
  quote_minor     bigint check (quote_minor is null or quote_minor > 0),
  deposit_minor   bigint check (deposit_minor is null or deposit_minor > 0),
  quote_currency  char(3) check (quote_currency is null or quote_currency ~ '^[A-Z]{3}$'),
  payment_url     text check (payment_url is null or payment_url ~ '^https://(buy\.stripe\.com|invoice\.stripe\.com|checkout\.stripe\.com)/'),
  status_reason   text check (status_reason is null or char_length(status_reason) <= 500),
  submitted_by    uuid references auth.users(id),
  submitted_at    timestamptz not null default now(),
  status_changed_at timestamptz not null default now(),
  status_changed_by uuid references auth.users(id),
  constraint workbook_submissions_quote check ((quote_minor is null) = (quote_currency is null))
);
create index workbook_submissions_status_idx on public.workbook_submissions(status, submitted_at);
create index workbook_submissions_org_idx on public.workbook_submissions(org_id, submitted_at desc);

create table public.submission_files (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.workbook_submissions(id) on delete cascade,
  org_id        uuid not null references public.organisations(id),
  kind          text not null check (kind in ('manuscript','existing_workbook','other')),
  storage_path  text not null unique check (char_length(storage_path) <= 400 and storage_path !~ '\.\.'),
  file_name     text not null check (char_length(file_name) between 1 and 200 and file_name !~ '[<>/\\[:cntrl:]]'),
  mime          text not null check (mime in (
                  'application/pdf',
                  'application/epub+zip',
                  'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  size_bytes    bigint not null check (size_bytes between 1 and 26214400),
  sha256        text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by   uuid references auth.users(id),
  created_at    timestamptz not null default now()
);
create index submission_files_submission_idx on public.submission_files(submission_id);

-- ---------------------------------------------------------------------------
-- 7. Helpers.
-- ---------------------------------------------------------------------------
create or replace function app.studio_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_platform(array['owner','editor'])
$$;

create or replace function app.caller_email() returns text
language sql stable security definer set search_path = '' as $$
  select lower(u.email) from auth.users u where u.id = app.uid()
$$;

-- j***@example.com: enough for the right person to recognise it.
create or replace function app.mask_email(p text) returns text
language sql immutable set search_path = '' as $$
  select case when p is null or position('@' in p) < 2 then '***'
              else left(p, 1) || '***' || substr(p, position('@' in p)) end
$$;

create or replace function app.clean_text(p text, p_max int) returns text
language sql immutable set search_path = '' as $$
  select nullif(left(btrim(regexp_replace(coalesce(p, ''), '[[:cntrl:]]', ' ', 'g')), p_max), '')
$$;

-- The same, keeping line breaks, for a bio or a brief.
create or replace function app.clean_multiline(p text, p_max int) returns text
language sql immutable set search_path = '' as $$
  select nullif(left(btrim(regexp_replace(replace(coalesce(p, ''), E'\r\n', E'\n'), E'[\001-\011\013-\037\177]', ' ', 'g'), E' \n'), p_max), '')
$$;

-- Does a book have a licence that lets its workbooks go live?
create or replace function app.book_has_active_licence(p_book uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.licences l
    join public.licence_texts t on t.version = l.text_version
    where l.book_id = p_book and l.status = 'active' and t.status = 'approved'
      and l.starts_at <= now() and (l.ends_at is null or l.ends_at > now()))
$$;

-- A workbook needs no author licence when it is demo, Akana's own, or a public domain book.
create or replace function app.workbook_licence_exempt(p_workbook uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workbooks w
    join public.organisations o on o.id = w.org_id
    join public.books b on b.id = w.book_id
    where w.id = p_workbook
      and (w.is_demo or o.kind = 'akana_house' or w.badge = 'public_domain' or b.rights_status = 'public_domain'))
$$;

-- Going live needs an active licence (F-036). Sets licence_ref when it is empty.
create or replace function app.guard_workbook_licence() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_ref text;
begin
  if new.status = 'live' and old.status is distinct from 'live' and old.status <> 'paused' then
    if app.workbook_licence_exempt(new.id) then return new; end if;
    select l.ref into v_ref from public.licences l
     where l.book_id = new.book_id and l.status = 'active' order by l.signed_at desc limit 1;
    if v_ref is null or not app.book_has_active_licence(new.book_id) then
      raise exception 'workbook % cannot go live without an active licence for its book', new.code using errcode = 'AKS08';
    end if;
    if new.licence_ref is null then new.licence_ref := v_ref; end if;
  end if;
  return new;
end $$;
-- Named to fire after the role guards (0002 status guard), which sort earlier.
create trigger workbooks_status_licence_gate before update of status on public.workbooks
  for each row execute function app.guard_workbook_licence();

-- ---------------------------------------------------------------------------
-- 8. Invitations: send, resend, revoke, view, accept.
-- The server mints the token and passes only its hash.
-- ---------------------------------------------------------------------------
create or replace function app.can_invite(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.studio_staff() or app.org_can(p_org, 'members', 'manage')
$$;

create or replace function app.org_invite(p_org uuid, p_email text, p_role text, p_author uuid, p_token_hash text)
returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_id    uuid;
  v_org   public.organisations;
  n       int;
begin
  if app.uid() is null or p_org is null or not app.can_invite(p_org) then
    raise exception 'not allowed to invite to this organisation' using errcode = 'AKS01';
  end if;
  select * into v_org from public.organisations o where o.id = p_org;
  if not found or v_org.kind = 'akana_house' or v_org.status in ('suspended','closed') then
    raise exception 'studio_invalid: organisation' using errcode = 'AKS02';
  end if;
  if p_role is null or p_role not in ('owner','editor','finance','author','viewer') then
    raise exception 'studio_invalid: role' using errcode = 'AKS02';
  end if;
  if p_role = 'owner' and not app.studio_staff() then
    raise exception 'only Akana staff invite an owner' using errcode = 'AKS01';
  end if;
  if char_length(v_email) not between 3 and 254 or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'studio_invalid: email' using errcode = 'AKS02';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'studio_invalid: token' using errcode = 'AKS02';
  end if;
  if p_author is not null and not exists (select 1 from public.authors a where a.id = p_author and a.org_id = p_org and a.user_id is null) then
    raise exception 'studio_invalid: author' using errcode = 'AKS02';
  end if;
  perform pg_advisory_xact_lock(hashtext('org_invite:' || p_org::text));

  if exists (select 1 from public.org_members m join auth.users u on u.id = m.user_id
             where m.org_id = p_org and lower(u.email) = v_email) then
    raise exception 'this address is already a member' using errcode = 'AKS05';
  end if;

  -- 20 invitations and resends per organisation a day, counted from the audit log.
  select count(*) into n from public.audit_log a
   where a.action in ('org.invited','org.invite_resent') and a.org_id = p_org and a.at > now() - interval '1 day';
  if n >= 20 then
    raise exception 'too many invitations today' using errcode = 'AKS29';
  end if;

  -- A newer invitation replaces an open one to the same address.
  update public.org_invitations i set revoked_at = now()
   where i.org_id = p_org and i.email = v_email and i.accepted_at is null and i.revoked_at is null;

  insert into public.org_invitations (org_id, email, role, author_id, token_hash, invited_by, expires_at)
  values (p_org, v_email, p_role, p_author, p_token_hash, app.uid(), now() + interval '14 days')
  returning id into v_id;

  perform app.audit('org.invited', 'org_invitation:' || v_id::text, null, null, p_org, null,
    jsonb_build_object('role', p_role, 'author_id', p_author, 'by_staff', app.studio_staff()));
  return v_id;
end $$;

create or replace function app.org_invite_resend(p_invite uuid, p_token_hash text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare i public.org_invitations; n int;
begin
  select * into i from public.org_invitations x where x.id = p_invite for update;
  if not found or app.uid() is null or not app.can_invite(i.org_id) then
    raise exception 'not allowed' using errcode = 'AKS01';
  end if;
  if i.accepted_at is not null or i.revoked_at is not null then
    raise exception 'this invitation is closed' using errcode = 'AKS08';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'studio_invalid: token' using errcode = 'AKS02';
  end if;
  if i.send_count >= 5 then
    raise exception 'this invitation has been sent five times' using errcode = 'AKS29';
  end if;
  select count(*) into n from public.audit_log a
   where a.action in ('org.invited','org.invite_resent') and a.org_id = i.org_id and a.at > now() - interval '1 day';
  if n >= 20 then
    raise exception 'too many invitations today' using errcode = 'AKS29';
  end if;
  update public.org_invitations x
     set token_hash = p_token_hash, last_sent_at = now(), send_count = x.send_count + 1, expires_at = now() + interval '14 days'
   where x.id = i.id;
  perform app.audit('org.invite_resent', 'org_invitation:' || i.id::text, null, null, i.org_id, null,
    jsonb_build_object('send_count', i.send_count + 1));
  return i.id;
end $$;

create or replace function app.org_invite_revoke(p_invite uuid) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare i public.org_invitations;
begin
  select * into i from public.org_invitations x where x.id = p_invite for update;
  if not found or app.uid() is null or not app.can_invite(i.org_id) then
    raise exception 'not allowed' using errcode = 'AKS01';
  end if;
  if i.accepted_at is not null or i.revoked_at is not null then
    return false;
  end if;
  update public.org_invitations x set revoked_at = now() where x.id = i.id;
  perform app.audit('org.invite_revoked', 'org_invitation:' || i.id::text, null, null, i.org_id, null, null);
  return true;
end $$;

-- Anyone holding a link may ask what it is for. Never the full address.
create or replace function app.org_invite_view(p_token_hash text)
returns table (state text, organisation_name text, role text, email_hint text)
language plpgsql stable security definer set search_path = '' as $$
declare i public.org_invitations; v_name text;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return query select 'unknown'::text, null::text, null::text, null::text; return;
  end if;
  select * into i from public.org_invitations x where x.token_hash = p_token_hash;
  if not found then
    return query select 'unknown'::text, null::text, null::text, null::text; return;
  end if;
  select o.display_name into v_name from public.organisations o where o.id = i.org_id;
  return query select
    case when i.accepted_at is not null then 'used'
         when i.revoked_at is not null then 'revoked'
         when i.expires_at <= now() then 'expired'
         else 'ok' end,
    v_name, i.role, app.mask_email(i.email);
end $$;

create or replace function app.org_invite_accept(p_token_hash text)
returns table (org_id uuid, role text)
language plpgsql volatile security definer set search_path = '' as $$
declare
  i      public.org_invitations;
  v_uid  uuid := app.uid();
  v_mail text := app.caller_email();
  v_have text;
begin
  if v_uid is null then
    raise exception 'sign in first' using errcode = 'AKS01';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'unknown link' using errcode = 'AKS04';
  end if;
  select * into i from public.org_invitations x where x.token_hash = p_token_hash for update;
  if not found or i.revoked_at is not null or i.accepted_at is not null or i.expires_at <= now() then
    raise exception 'this link cannot be used' using errcode = 'AKS04';
  end if;
  if v_mail is null or v_mail <> i.email then
    raise exception 'this invitation is for a different address' using errcode = 'AKS03';
  end if;

  select m.role into v_have from public.org_members m where m.org_id = i.org_id and m.user_id = v_uid;
  if v_have is null then
    insert into public.org_members (org_id, user_id, role, invited_by) values (i.org_id, v_uid, i.role, i.invited_by);
  end if;
  update public.org_invitations x set accepted_at = now(), accepted_by = v_uid where x.id = i.id;
  if i.author_id is not null then
    update public.authors a set user_id = v_uid, bio_review_required = true
     where a.id = i.author_id and a.org_id = i.org_id and a.user_id is null;
  end if;
  update public.organisations o set status = 'active' where o.id = i.org_id and o.status = 'invited';

  perform app.audit('org.invite_accepted', 'org_invitation:' || i.id::text, null, null, i.org_id, null,
    jsonb_build_object('user', v_uid, 'role', coalesce(v_have, i.role), 'already_member', v_have is not null));
  return query select i.org_id, coalesce(v_have, i.role);
end $$;

-- ---------------------------------------------------------------------------
-- 9. Members (F-055). Owners change roles and remove people; only staff make
-- or unmake an owner. The 0001 trigger keeps one owner.
-- ---------------------------------------------------------------------------
create or replace function app.org_roster(p_org uuid)
returns table (user_id uuid, email text, display_name text, role text, joined_at timestamptz, is_me boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (app.org_can(p_org, 'members', 'read') or app.is_staff()) then
    raise exception 'not allowed' using errcode = 'AKS01';
  end if;
  return query
    select m.user_id, lower(u.email)::text, p.display_name, m.role, m.created_at, m.user_id = app.uid()
    from public.org_members m
    join auth.users u on u.id = m.user_id
    left join public.profiles p on p.user_id = m.user_id
    where m.org_id = p_org
    order by case m.role when 'owner' then 0 when 'editor' then 1 when 'finance' then 2 when 'author' then 3 else 4 end, m.created_at;
end $$;

create or replace function app.org_member_set_role(p_org uuid, p_user uuid, p_role text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare v_old text;
begin
  if app.uid() is null or not (app.org_can(p_org, 'members', 'manage') or app.is_platform(array['owner'])) then
    raise exception 'not allowed' using errcode = 'AKS01';
  end if;
  if p_role is null or p_role not in ('owner','editor','finance','author','viewer') then
    raise exception 'studio_invalid: role' using errcode = 'AKS02';
  end if;
  select m.role into v_old from public.org_members m where m.org_id = p_org and m.user_id = p_user for update;
  if v_old is null then
    raise exception 'not a member' using errcode = 'AKS08';
  end if;
  if (p_role = 'owner' or v_old = 'owner') and not app.is_platform(array['owner']) then
    raise exception 'ownership changes are made by Akana staff' using errcode = 'AKS01';
  end if;
  if v_old = p_role then return p_role; end if;
  update public.org_members m set role = p_role where m.org_id = p_org and m.user_id = p_user;
  perform app.audit('org.member_role_changed', 'user:' || p_user::text, null, null, p_org,
    jsonb_build_object('role', v_old), jsonb_build_object('role', p_role));
  return p_role;
end $$;

create or replace function app.org_member_remove(p_org uuid, p_user uuid) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare v_old text;
begin
  if app.uid() is null or not (app.org_can(p_org, 'members', 'manage') or app.is_platform(array['owner'])) then
    raise exception 'not allowed' using errcode = 'AKS01';
  end if;
  select m.role into v_old from public.org_members m where m.org_id = p_org and m.user_id = p_user for update;
  if v_old is null then return false; end if;
  if v_old = 'owner' and not app.is_platform(array['owner']) then
    raise exception 'ownership changes are made by Akana staff' using errcode = 'AKS01';
  end if;
  delete from public.org_members m where m.org_id = p_org and m.user_id = p_user;
  -- Their roster entry stays, without the login.
  update public.authors a set user_id = null where a.org_id = p_org and a.user_id = p_user;
  perform app.audit('org.member_removed', 'user:' || p_user::text, null, null, p_org,
    jsonb_build_object('role', v_old), null);
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- 10. Authors: roster and profile (F-034, F-056).
-- ---------------------------------------------------------------------------
create or replace function app.can_edit_author(p_author uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.studio_staff() or exists (
    select 1 from public.authors a
    where a.id = p_author and a.org_id is not null
      and (app.org_can(a.org_id, 'books', 'write') or a.user_id = app.uid()))
$$;

create or replace function app.studio_authors(p_org uuid)
returns table (id uuid, code text, slug text, display_name text, legal_name text, bio text, bio_draft text,
               bio_status text, bio_flags jsonb, bio_submitted_at timestamptz, country char(2), website text,
               links jsonb, spelling text, photo_path text, photo_rights_confirmed_at timestamptz,
               has_login boolean, is_me boolean, can_edit boolean, is_demo boolean, status text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (app.is_org_member(p_org) or app.is_staff()) then
    raise exception 'not allowed' using errcode = 'AKS01';
  end if;
  return query
    select a.id, a.code, a.slug, a.display_name,
           case when app.org_can(p_org, 'books', 'write') or a.user_id = app.uid() or app.is_staff() then a.legal_name end,
           a.bio, a.bio_draft, a.bio_status, a.bio_flags, a.bio_submitted_at, a.country, a.website, a.links, a.spelling,
           a.photo_path, a.photo_rights_confirmed_at, a.user_id is not null, a.user_id = app.uid(),
           app.can_edit_author(a.id), a.is_demo, a.status
    from public.authors a
    where a.org_id = p_org
    order by (a.user_id = app.uid()) desc nulls last, a.display_name;
end $$;

create or replace function app.author_save(
  p_org uuid, p_author uuid, p_display_name text, p_legal_name text, p_country text,
  p_website text, p_links jsonb, p_spelling text, p_photo_rights boolean, p_link_self boolean default false
) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id      uuid := p_author;
  v_display text := app.clean_text(p_display_name, 120);
  v_legal   text := app.clean_text(p_legal_name, 200);
  v_country text := upper(btrim(coalesce(p_country, '')));
  v_site    text := app.clean_text(p_website, 300);
  v_links   jsonb := coalesce(p_links, '[]'::jsonb);
  v_spell   text := coalesce(nullif(p_spelling, ''), 'en-GB');
  v_slug    text;
  v_code    text;
  v_n       int := 0;
  l         text;
begin
  if app.uid() is null then raise exception 'sign in first' using errcode = 'AKS01'; end if;
  if v_display is null or v_display ~ '[<>]' then
    raise exception 'studio_invalid: display_name' using errcode = 'AKS02';
  end if;
  if v_legal is not null and v_legal ~ '[<>]' then
    raise exception 'studio_invalid: legal_name' using errcode = 'AKS02';
  end if;
  if v_country <> '' and v_country !~ '^[A-Z]{2}$' then
    raise exception 'studio_invalid: country' using errcode = 'AKS02';
  end if;
  if v_site is not null and v_site !~ '^https://[^\s<>"]+$' then
    raise exception 'studio_invalid: website' using errcode = 'AKS02';
  end if;
  if jsonb_typeof(v_links) <> 'array' or jsonb_array_length(v_links) > 5 then
    raise exception 'studio_invalid: links' using errcode = 'AKS02';
  end if;
  for l in select jsonb_array_elements_text(v_links) loop
    if l !~ '^https://[^\s<>"]+$' or char_length(l) > 300 then
      raise exception 'studio_invalid: links' using errcode = 'AKS02';
    end if;
  end loop;
  if v_spell not in ('en-GB','en-US') then
    raise exception 'studio_invalid: spelling' using errcode = 'AKS02';
  end if;

  if v_id is null then
    if p_org is null or not (app.org_can(p_org, 'books', 'write') or app.studio_staff()) then
      raise exception 'not allowed' using errcode = 'AKS01';
    end if;
    v_id := gen_random_uuid();
    loop
      v_code := app.mint_code('AU', 'author:' || v_id::text, v_n);
      exit when not exists (select 1 from public.authors a where a.code = v_code)
            and not exists (select 1 from public.organisations o where o.code = v_code);
      v_n := v_n + 1;
      if v_n > 100 then raise exception 'could not mint an author code' using errcode = 'unique_violation'; end if;
    end loop;
    v_slug := trim(both '-' from left(regexp_replace(lower(v_display), '[^a-z0-9]+', '-', 'g'), 50));
    v_slug := case when v_slug = '' then '' else v_slug || '-' end || lower(substr(v_code, 4));
    insert into public.authors (id, code, org_id, slug, display_name, legal_name, country, website, links, spelling,
                                photo_rights_confirmed_at, status, bio_review_required)
    values (v_id, v_code, p_org, v_slug, v_display, v_legal, nullif(v_country, ''), v_site, v_links, v_spell,
            case when p_photo_rights then now() end, 'draft', true);
    -- From the caller's own profile page: this entry is them, unless they already have one here.
    if coalesce(p_link_self, false)
       and not exists (select 1 from public.authors a where a.org_id = p_org and a.user_id = app.uid()) then
      update public.authors a set user_id = app.uid() where a.id = v_id;
    end if;
    perform app.audit('author.created', 'author:' || v_id::text, null, null, p_org, null, jsonb_build_object('code', v_code));
  else
    if not app.can_edit_author(v_id) then
      raise exception 'not allowed' using errcode = 'AKS01';
    end if;
    update public.authors a set
      display_name = v_display, legal_name = v_legal, country = nullif(v_country, ''), website = v_site,
      links = v_links, spelling = v_spell,
      photo_rights_confirmed_at = case when p_photo_rights then coalesce(a.photo_rights_confirmed_at, now()) else null end
    where a.id = v_id;
    perform app.audit('author.updated', 'author:' || v_id::text, null, null,
      (select a.org_id from public.authors a where a.id = v_id), null, null);
  end if;
  return v_id;
end $$;

-- The author's bio goes to staff. p_flags are the claim-word findings the
-- server found with packages/validate, kept so staff see them.
create or replace function app.author_bio_submit(p_author uuid, p_bio text, p_flags jsonb) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare v_bio text := app.clean_multiline(p_bio, 1200);
begin
  if app.uid() is null or not app.can_edit_author(p_author) then
    raise exception 'not allowed' using errcode = 'AKS01';
  end if;
  if v_bio is null or v_bio ~ '[<>]' then
    raise exception 'studio_invalid: bio' using errcode = 'AKS02';
  end if;
  if p_flags is null or jsonb_typeof(p_flags) <> 'array' or jsonb_array_length(p_flags) > 50 then
    raise exception 'studio_invalid: flags' using errcode = 'AKS02';
  end if;
  update public.authors a set bio_draft = v_bio, bio_status = 'pending', bio_flags = p_flags, bio_submitted_at = now(),
                              bio_review_required = true
   where a.id = p_author;
  perform app.audit('author.bio_submitted', 'author:' || p_author::text, null, null,
    (select a.org_id from public.authors a where a.id = p_author), null,
    jsonb_build_object('flags', jsonb_array_length(p_flags)));
  return 'pending';
end $$;

-- Staff approve or reject a bio. A flagged bio needs a reason to approve: the override is logged.
create or replace function app.author_bio_review(p_author uuid, p_approve boolean, p_flag_count int, p_reason text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare a public.authors; v_reason text := app.clean_text(p_reason, 500);
begin
  if not app.studio_staff() then
    raise exception 'only platform owners and editors review bios' using errcode = 'AKS01';
  end if;
  select * into a from public.authors x where x.id = p_author for update;
  if not found or a.bio_status <> 'pending' or a.bio_draft is null then
    raise exception 'no bio waiting for review' using errcode = 'AKS08';
  end if;
  if p_approve and coalesce(p_flag_count, 0) > 0 and v_reason is null then
    raise exception 'a reason is needed to approve a flagged bio' using errcode = 'AKS02';
  end if;
  if not p_approve and v_reason is null then
    raise exception 'a reason is needed to reject a bio' using errcode = 'AKS02';
  end if;
  update public.authors x set
    bio = case when p_approve then a.bio_draft else x.bio end,
    bio_status = case when p_approve then 'approved' else 'rejected' end,
    bio_reviewed_by = app.uid(), bio_reviewed_at = now()
  where x.id = p_author;
  perform app.audit(case when p_approve then 'author.bio_approved' else 'author.bio_rejected' end,
    'author:' || p_author::text, v_reason, null, a.org_id, null,
    jsonb_build_object('flags', coalesce(p_flag_count, 0), 'override', p_approve and coalesce(p_flag_count, 0) > 0));
  return case when p_approve then 'approved' else 'rejected' end;
end $$;

-- Staff see bios waiting for review across organisations.
create or replace function app.staff_pending_bios()
returns table (author_id uuid, org_id uuid, organisation_name text, display_name text, bio_draft text, bio_flags jsonb, bio_submitted_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_staff() then
    raise exception 'staff only' using errcode = 'AKS01';
  end if;
  return query
    select a.id, a.org_id, o.display_name, a.display_name, a.bio_draft, a.bio_flags, a.bio_submitted_at
    from public.authors a left join public.organisations o on o.id = a.org_id
    where a.bio_status = 'pending'
    order by a.bio_submitted_at nulls last
    limit 200;
end $$;

create or replace function app.imprint_save(p_org uuid, p_name text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v_name text := app.clean_text(p_name, 120); v_id uuid;
begin
  if app.uid() is null or not (app.org_can(p_org, 'books', 'write') or app.studio_staff()) then
    raise exception 'not allowed' using errcode = 'AKS01';
  end if;
  if v_name is null or v_name ~ '[<>]' then
    raise exception 'studio_invalid: name' using errcode = 'AKS02';
  end if;
  if (select count(*) from public.imprints i where i.org_id = p_org) >= 50 then
    raise exception 'fifty imprints is the limit' using errcode = 'AKS29';
  end if;
  insert into public.imprints (org_id, name) values (p_org, v_name)
  on conflict (org_id, name) do update set name = excluded.name
  returning id into v_id;
  perform app.audit('imprint.saved', 'imprint:' || v_id::text, null, null, p_org, null, jsonb_build_object('name', v_name));
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 11. Books (F-035).
-- ---------------------------------------------------------------------------
create or replace function app.book_save(
  p_org uuid, p_book uuid, p_title text, p_subtitle text, p_series text, p_series_number numeric,
  p_edition text, p_language text, p_isbns jsonb, p_asin text, p_publisher text, p_imprint uuid,
  p_year int, p_genre text, p_rights_status text, p_store_link text,
  p_cover_rights boolean, p_kdp_select text
) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id    uuid := p_book;
  v_org   uuid := p_org;
  v_title text := app.clean_text(p_title, 300);
  v_slug  text;
  v_kdp   boolean;
  v_lang  text := coalesce(nullif(btrim(p_language), ''), 'en');
  v_link  text := app.clean_text(p_store_link, 500);
begin
  if app.uid() is null then raise exception 'sign in first' using errcode = 'AKS01'; end if;
  if v_id is not null then
    select b.org_id into v_org from public.books b where b.id = v_id;
    if v_org is null then raise exception 'studio_invalid: book' using errcode = 'AKS02'; end if;
  end if;
  if v_org is null or not (app.org_can(v_org, 'books', 'write') or app.studio_staff()) then
    raise exception 'not allowed' using errcode = 'AKS01';
  end if;
  if v_title is null or v_title ~ '[<>]' then
    raise exception 'studio_invalid: title' using errcode = 'AKS02';
  end if;
  if v_lang !~ '^[a-z]{2}(-[A-Z]{2})?$' then
    raise exception 'studio_invalid: language' using errcode = 'AKS02';
  end if;
  if p_rights_status is null or p_rights_status not in ('licensed','public_domain','own_work') then
    raise exception 'studio_invalid: rights_status' using errcode = 'AKS02';
  end if;
  if p_genre is not null and p_genre <> '' and not exists (select 1 from public.genres g where g.id = p_genre) then
    raise exception 'studio_invalid: genre' using errcode = 'AKS02';
  end if;
  if p_imprint is not null and not exists (select 1 from public.imprints i where i.id = p_imprint and i.org_id = v_org) then
    raise exception 'studio_invalid: imprint' using errcode = 'AKS02';
  end if;
  if p_year is not null and (p_year < 1000 or p_year > 2100) then
    raise exception 'studio_invalid: year' using errcode = 'AKS02';
  end if;
  if p_asin is not null and btrim(p_asin) <> '' and upper(btrim(p_asin)) !~ '^[A-Z0-9]{10}$' then
    raise exception 'studio_invalid: asin' using errcode = 'AKS02';
  end if;
  if v_link is not null and v_link !~ '^https://[^\s<>"]+$' then
    raise exception 'studio_invalid: store_link' using errcode = 'AKS02';
  end if;
  v_kdp := case p_kdp_select when 'yes' then true when 'no' then false else null end;

  if v_id is null then
    v_id := gen_random_uuid();
    v_slug := trim(both '-' from left(regexp_replace(lower(v_title), '[^a-z0-9]+', '-', 'g'), 60));
    v_slug := case when v_slug = '' then 'book' else v_slug end || '-' || lower(substr(app.mint_code('BK', 'book:' || v_id::text), 4));
    insert into public.books (id, org_id, slug, title, subtitle, series, series_number, edition, language, isbns, asin,
                              publisher, imprint_id, year, genre_id, rights_status, store_links)
    values (v_id, v_org, v_slug, v_title, app.clean_text(p_subtitle, 300), app.clean_text(p_series, 200), p_series_number,
            app.clean_text(p_edition, 100), v_lang, coalesce(p_isbns, '[]'::jsonb), nullif(upper(btrim(coalesce(p_asin, ''))), ''),
            app.clean_text(p_publisher, 200), p_imprint, p_year, nullif(p_genre, ''), p_rights_status,
            case when v_link is null then '{}'::jsonb else jsonb_build_object('default', v_link) end);
    perform app.audit('book.created', 'book:' || v_id::text, null, null, v_org, null, jsonb_build_object('slug', v_slug));
  else
    update public.books b set
      title = v_title, subtitle = app.clean_text(p_subtitle, 300), series = app.clean_text(p_series, 200),
      series_number = p_series_number, edition = app.clean_text(p_edition, 100), language = v_lang,
      isbns = coalesce(p_isbns, '[]'::jsonb), asin = nullif(upper(btrim(coalesce(p_asin, ''))), ''),
      publisher = app.clean_text(p_publisher, 200), imprint_id = p_imprint, year = p_year,
      genre_id = nullif(p_genre, ''), rights_status = p_rights_status,
      store_links = case when v_link is null then b.store_links - 'default' else b.store_links || jsonb_build_object('default', v_link) end
    where b.id = v_id;
    perform app.audit('book.updated', 'book:' || v_id::text, null, null, v_org, null, null);
  end if;

  insert into public.book_rights (book_id, org_id, cover_rights_confirmed_at, kdp_select, kdp_select_declared_at, updated_by)
  values (v_id, v_org, case when p_cover_rights then now() end, v_kdp, case when v_kdp is not null then now() end, app.uid())
  on conflict (book_id) do update set
    cover_rights_confirmed_at = case when p_cover_rights then coalesce(public.book_rights.cover_rights_confirmed_at, now()) end,
    kdp_select = v_kdp,
    kdp_select_declared_at = case when v_kdp is null then null
                                  when v_kdp is not distinct from public.book_rights.kdp_select then public.book_rights.kdp_select_declared_at
                                  else now() end,
    updated_by = app.uid(), updated_at = now();
  return v_id;
end $$;

-- Contributors come from the organisation's roster.
create or replace function app.book_contributor_set(p_book uuid, p_author uuid, p_role text, p_death_year int, p_sort int, p_remove boolean)
returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare v_org uuid;
begin
  select b.org_id into v_org from public.books b where b.id = p_book;
  if v_org is null or app.uid() is null or not (app.org_can(v_org, 'books', 'write') or app.studio_staff()) then
    raise exception 'not allowed' using errcode = 'AKS01';
  end if;
  if p_role is null or p_role not in ('author','translator','editor') then
    raise exception 'studio_invalid: role' using errcode = 'AKS02';
  end if;
  if p_remove then
    delete from public.book_contributors c where c.book_id = p_book and c.author_id = p_author and c.role = p_role;
  else
    if not exists (select 1 from public.authors a where a.id = p_author and a.org_id = v_org) then
      raise exception 'studio_invalid: author' using errcode = 'AKS02';
    end if;
    if p_death_year is not null and (p_death_year < 0 or p_death_year > extract(year from now())::int) then
      raise exception 'studio_invalid: death_year' using errcode = 'AKS02';
    end if;
    if (select count(*) from public.book_contributors c where c.book_id = p_book) >= 20 then
      raise exception 'twenty contributors is the limit' using errcode = 'AKS29';
    end if;
    insert into public.book_contributors (book_id, author_id, role, death_year, sort)
    values (p_book, p_author, p_role, p_death_year, coalesce(p_sort, 0))
    on conflict (book_id, author_id, role) do update set death_year = excluded.death_year, sort = excluded.sort;
  end if;
  perform app.audit(case when p_remove then 'book.contributor_removed' else 'book.contributor_set' end,
    'book:' || p_book::text, null, null, v_org, null, jsonb_build_object('author', p_author, 'role', p_role));
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- 12. Licences (F-036).
-- ---------------------------------------------------------------------------
create or replace function app.mint_licence_ref(p_id uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare v text; n int := 0;
begin
  loop
    v := app.mint_code('LIC', 'licence:' || p_id::text, n);
    exit when not exists (select 1 from public.licences l where l.ref = v);
    n := n + 1;
    if n > 100 then raise exception 'could not mint a licence ref' using errcode = 'unique_violation'; end if;
  end loop;
  return v;
end $$;

create or replace function app.licence_check_terms(
  p_territories text[], p_excluded text[], p_term_months int, p_exclusive_months int,
  p_signer_name text, p_signer_capacity text
) returns void
language plpgsql immutable set search_path = '' as $$
declare t text;
begin
  if p_territories is null or cardinality(p_territories) < 1 then
    raise exception 'studio_invalid: territories' using errcode = 'AKS02';
  end if;
  foreach t in array p_territories || coalesce(p_excluded, '{}') loop
    if t !~ '^([A-Z]{2}|WORLD)$' then raise exception 'studio_invalid: territories' using errcode = 'AKS02'; end if;
  end loop;
  if p_term_months is null or p_term_months not between 1 and 600 then
    raise exception 'studio_invalid: term_months' using errcode = 'AKS02';
  end if;
  if p_exclusive_months is not null and (p_exclusive_months < 0 or p_exclusive_months > p_term_months) then
    raise exception 'studio_invalid: exclusive_months' using errcode = 'AKS02';
  end if;
  if char_length(btrim(coalesce(p_signer_name, ''))) < 2 or p_signer_name ~ '[<>[:cntrl:]]' then
    raise exception 'studio_invalid: signer_name' using errcode = 'AKS02';
  end if;
  if char_length(btrim(coalesce(p_signer_capacity, ''))) < 2 or p_signer_capacity ~ '[<>[:cntrl:]]' then
    raise exception 'studio_invalid: signer_capacity' using errcode = 'AKS02';
  end if;
end $$;

-- Clickwrap. The server passes the hash of the text it showed, so a text
-- changed under the same version number is refused. All three warranties
-- must be ticked. On a draft text only a demo organisation may sign, as a
-- test, and the row is test_only.
create or replace function app.licence_accept(
  p_book uuid, p_version text, p_text_sha256 text,
  p_territories text[], p_excluded text[], p_term_months int, p_exclusive_months int,
  p_subscription boolean, p_cover boolean, p_audio boolean,
  p_warrant_rights boolean, p_warrant_no_clash boolean, p_warrant_no_claims boolean,
  p_signer_name text, p_signer_capacity text, p_ip_hash text
) returns table (licence_id uuid, licence_ref text, licence_status text)
language plpgsql volatile security definer set search_path = '' as $$
declare
  b      public.books;
  o      public.organisations;
  t      public.licence_texts;
  v_id   uuid := gen_random_uuid();
  v_ref  text;
  v_stat text;
  n      int;
begin
  select * into b from public.books x where x.id = p_book;
  if not found or app.uid() is null or not app.org_can(b.org_id, 'licences', 'write') then
    raise exception 'only an organisation owner signs a licence' using errcode = 'AKS01';
  end if;
  select * into o from public.organisations x where x.id = b.org_id;
  select * into t from public.licence_texts x where x.version = p_version;
  if not found or t.status = 'retired' then
    raise exception 'studio_invalid: version' using errcode = 'AKS02';
  end if;
  if p_text_sha256 is distinct from t.content_sha256 then
    raise exception 'the licence text does not match its version' using errcode = 'AKS08';
  end if;
  if t.status <> 'approved' and not o.is_demo then
    raise exception 'licence % is a draft and cannot be signed yet', t.version using errcode = 'AKS06';
  end if;
  if not (coalesce(p_warrant_rights, false) and coalesce(p_warrant_no_clash, false) and coalesce(p_warrant_no_claims, false)) then
    raise exception 'studio_invalid: warranties' using errcode = 'AKS02';
  end if;
  if p_subscription is null or p_cover is null or p_audio is null then
    raise exception 'studio_invalid: terms' using errcode = 'AKS02';
  end if;
  perform app.licence_check_terms(p_territories, p_excluded, p_term_months, p_exclusive_months, p_signer_name, p_signer_capacity);
  if p_ip_hash is not null and p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'studio_invalid: ip_hash' using errcode = 'AKS02';
  end if;
  select count(*) into n from public.audit_log a
   where a.action like 'licence.%' and a.org_id = b.org_id and a.at > now() - interval '1 day';
  if n >= 30 then raise exception 'too many licence actions today' using errcode = 'AKS29'; end if;

  perform pg_advisory_xact_lock(hashtext('licence:' || p_book::text));
  v_stat := case when t.status = 'approved' then 'active' else 'test_only' end;
  if v_stat = 'active' then
    update public.licences l set status = 'superseded' where l.book_id = p_book and l.status in ('active','pending_verification');
  end if;
  v_ref := app.mint_licence_ref(v_id);

  insert into public.licences (id, ref, book_id, org_id, text_version, text_sha256, method, status, territories, excluded_territories,
                               term_months, starts_at, ends_at, exclusive_until, subscription_included, cover_rights, audio_rights,
                               warranties, signer_user_id, signer_name, signer_capacity, signer_ip_hash)
  values (v_id, v_ref, p_book, b.org_id, t.version, t.content_sha256, 'clickwrap', v_stat, p_territories, coalesce(p_excluded, '{}'),
          p_term_months, now(), now() + make_interval(months => p_term_months),
          case when coalesce(p_exclusive_months, 0) > 0 then now() + make_interval(months => p_exclusive_months) end,
          p_subscription, p_cover, p_audio,
          jsonb_build_object('rights_held', now(), 'no_clash', now(), 'no_health_claims', now()),
          app.uid(), btrim(p_signer_name), btrim(p_signer_capacity), p_ip_hash);

  perform app.audit('licence.accepted', 'licence:' || v_id::text, null, null, b.org_id, null,
    jsonb_build_object('ref', v_ref, 'book', p_book, 'version', t.version, 'status', v_stat, 'method', 'clickwrap'));
  return query select v_id, v_ref, v_stat;
end $$;

-- A signed PDF for houses that insist on paper. The server has already put
-- the file in the private org-files bucket under <org_id>/licences/. Staff
-- verify it before it counts.
create or replace function app.licence_upload(
  p_book uuid, p_version text, p_path text, p_document_sha256 text,
  p_territories text[], p_excluded text[], p_term_months int, p_exclusive_months int,
  p_subscription boolean, p_cover boolean, p_audio boolean,
  p_signer_name text, p_signer_capacity text, p_ip_hash text
) returns table (licence_id uuid, licence_ref text, licence_status text)
language plpgsql volatile security definer set search_path = '' as $$
declare b public.books; t public.licence_texts; v_id uuid := gen_random_uuid(); v_ref text; n int;
begin
  select * into b from public.books x where x.id = p_book;
  if not found or app.uid() is null or not app.org_can(b.org_id, 'licences', 'write') then
    raise exception 'only an organisation owner records a licence' using errcode = 'AKS01';
  end if;
  select * into t from public.licence_texts x where x.version = p_version;
  if not found or t.status = 'retired' then
    raise exception 'studio_invalid: version' using errcode = 'AKS02';
  end if;
  if p_path is null or p_path !~ ('^' || b.org_id::text || '/licences/[0-9a-f-]{36}\.pdf$') then
    raise exception 'studio_invalid: path' using errcode = 'AKS02';
  end if;
  if p_document_sha256 is null or p_document_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'studio_invalid: document' using errcode = 'AKS02';
  end if;
  if p_subscription is null or p_cover is null or p_audio is null then
    raise exception 'studio_invalid: terms' using errcode = 'AKS02';
  end if;
  perform app.licence_check_terms(p_territories, p_excluded, p_term_months, p_exclusive_months, p_signer_name, p_signer_capacity);
  select count(*) into n from public.audit_log a
   where a.action like 'licence.%' and a.org_id = b.org_id and a.at > now() - interval '1 day';
  if n >= 30 then raise exception 'too many licence actions today' using errcode = 'AKS29'; end if;
  v_ref := app.mint_licence_ref(v_id);
  insert into public.licences (id, ref, book_id, org_id, text_version, text_sha256, method, status, territories, excluded_territories,
                               term_months, exclusive_until, subscription_included, cover_rights, audio_rights, warranties,
                               signer_user_id, signer_name, signer_capacity, signer_ip_hash, signed_document_path, document_sha256)
  values (v_id, v_ref, p_book, b.org_id, t.version, t.content_sha256, 'signed_upload', 'pending_verification',
          p_territories, coalesce(p_excluded, '{}'), p_term_months,
          case when coalesce(p_exclusive_months, 0) > 0 then now() + make_interval(months => p_exclusive_months) end,
          p_subscription, p_cover, p_audio, '{"in_document": true}'::jsonb,
          app.uid(), btrim(p_signer_name), btrim(p_signer_capacity), p_ip_hash, p_path, p_document_sha256);
  perform app.audit('licence.uploaded', 'licence:' || v_id::text, null, null, b.org_id, null,
    jsonb_build_object('ref', v_ref, 'book', p_book, 'version', t.version));
  return query select v_id, v_ref, 'pending_verification'::text;
end $$;

-- Staff check a signed upload. It becomes active only on an approved text;
-- a demo organisation's upload on a draft text becomes test_only.
create or replace function app.licence_verify(p_licence uuid, p_accept boolean, p_reason text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare l public.licences; t public.licence_texts; o public.organisations; v_stat text; v_reason text := app.clean_text(p_reason, 500);
begin
  if not app.studio_staff() then
    raise exception 'only platform owners and editors verify a licence' using errcode = 'AKS01';
  end if;
  select * into l from public.licences x where x.id = p_licence for update;
  if not found or l.status <> 'pending_verification' then
    raise exception 'nothing to verify' using errcode = 'AKS08';
  end if;
  if v_reason is null then
    raise exception 'a reason is needed' using errcode = 'AKS02';
  end if;
  select * into t from public.licence_texts x where x.version = l.text_version;
  select * into o from public.organisations x where x.id = l.org_id;
  if p_accept and t.status <> 'approved' and not o.is_demo then
    raise exception 'licence % is a draft and cannot be made active', t.version using errcode = 'AKS06';
  end if;
  v_stat := case when not p_accept then 'rejected' when t.status = 'approved' then 'active' else 'test_only' end;
  if v_stat = 'active' then
    perform pg_advisory_xact_lock(hashtext('licence:' || l.book_id::text));
    update public.licences x set status = 'superseded' where x.book_id = l.book_id and x.status = 'active';
  end if;
  update public.licences x set status = v_stat, verified_by = app.uid(), verified_at = now(), review_reason = v_reason,
                               starts_at = case when v_stat = 'active' then now() else x.starts_at end,
                               ends_at = case when v_stat = 'active' then now() + make_interval(months => x.term_months) else x.ends_at end
   where x.id = l.id;
  perform app.audit('licence.verified', 'licence:' || l.id::text, v_reason, null, l.org_id,
    jsonb_build_object('status', l.status), jsonb_build_object('status', v_stat, 'ref', l.ref));
  return v_stat;
end $$;

-- The lawyer's text arrives as a new licence_texts row in a migration, with
-- is_placeholder false. A platform owner then marks it approved here.
create or replace function app.licence_text_approve(p_version text, p_reason text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare t public.licence_texts; v_reason text := app.clean_text(p_reason, 500);
begin
  if not app.is_platform(array['owner']) then
    raise exception 'only a platform owner approves a licence text' using errcode = 'AKS01';
  end if;
  select * into t from public.licence_texts x where x.version = p_version for update;
  if not found then raise exception 'studio_invalid: version' using errcode = 'AKS02'; end if;
  if t.is_placeholder then
    raise exception 'licence % is placeholder text and can never be approved', p_version using errcode = 'AKS06';
  end if;
  if t.status <> 'draft' then raise exception 'licence % is not a draft', p_version using errcode = 'AKS08'; end if;
  if v_reason is null then raise exception 'a reason is needed' using errcode = 'AKS02'; end if;
  update public.licence_texts x set status = 'approved', approved_by = app.uid(), approved_at = now() where x.version = p_version;
  perform app.audit('licence_text.approved', 'licence_text:' || p_version, v_reason, null, null, null, jsonb_build_object('version', p_version));
  return 'approved';
end $$;

-- ---------------------------------------------------------------------------
-- 13. Submissions (F-037). Both routes create a Draft workbook.
-- ---------------------------------------------------------------------------
create or replace function app.submission_create(p_book uuid, p_route text, p_title text, p_genre text, p_brief text)
returns table (submission_id uuid, workbook_id uuid, workbook_code text)
language plpgsql volatile security definer set search_path = '' as $$
declare
  b       public.books;
  v_title text := app.clean_text(p_title, 200);
  v_brief text := app.clean_multiline(p_brief, 4000);
  v_wb    uuid := gen_random_uuid();
  v_sub   uuid;
  v_code  text;
  v_slug  text;
  n       int := 0;
begin
  select * into b from public.books x where x.id = p_book;
  if not found or app.uid() is null or not app.org_can(b.org_id, 'workbooks', 'write') then
    raise exception 'not allowed' using errcode = 'AKS01';
  end if;
  if p_route is null or p_route not in ('upload','develop') then
    raise exception 'studio_invalid: route' using errcode = 'AKS02';
  end if;
  v_title := coalesce(v_title, left(b.title, 200));
  if v_title ~ '[<>]' then raise exception 'studio_invalid: title' using errcode = 'AKS02'; end if;
  if p_genre is null or not exists (select 1 from public.genres g where g.id = p_genre) then
    raise exception 'studio_invalid: genre' using errcode = 'AKS02';
  end if;
  if v_brief is null or v_brief ~ '[<>]' then
    raise exception 'studio_invalid: brief' using errcode = 'AKS02';
  end if;
  select count(*) into n from public.audit_log a
   where a.action = 'submission.created' and a.org_id = b.org_id and a.at > now() - interval '1 day';
  if n >= 10 then raise exception 'ten submissions a day is the limit' using errcode = 'AKS29'; end if;

  n := 0;
  loop
    v_code := app.mint_code('AK', 'workbook:' || v_wb::text, n);
    exit when not exists (select 1 from public.workbooks w where w.code = v_code);
    n := n + 1;
    if n > 100 then raise exception 'could not mint a workbook code' using errcode = 'unique_violation'; end if;
  end loop;
  v_slug := trim(both '-' from left(regexp_replace(lower(v_title), '[^a-z0-9]+', '-', 'g'), 60));
  v_slug := case when v_slug = '' then 'workbook' else v_slug end || '-' || lower(substr(v_code, 4));

  insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, depth, badge, status)
  values (v_wb, v_code, p_book, b.org_id, v_slug, v_title, '', p_genre, 'listing', 'official', 'draft');
  insert into public.workbook_submissions (org_id, book_id, workbook_id, route, brief, submitted_by, status_changed_by)
  values (b.org_id, p_book, v_wb, p_route, v_brief, app.uid(), app.uid())
  returning id into v_sub;

  perform app.audit('submission.created', 'submission:' || v_sub::text, null, null, b.org_id, null,
    jsonb_build_object('route', p_route, 'workbook', v_wb, 'code', v_code, 'book', p_book));
  return query select v_sub, v_wb, v_code;
end $$;

-- The server has stored the file in the private org-files bucket under
-- <org_id>/manuscripts/. This records it against the submission.
create or replace function app.submission_add_file(
  p_submission uuid, p_kind text, p_path text, p_file_name text, p_mime text, p_size bigint, p_sha256 text
) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare s public.workbook_submissions; v_id uuid;
begin
  select * into s from public.workbook_submissions x where x.id = p_submission;
  if not found or app.uid() is null or not app.org_can(s.org_id, 'workbooks', 'write') then
    raise exception 'not allowed' using errcode = 'AKS01';
  end if;
  if s.status in ('completed','declined','withdrawn') then
    raise exception 'this submission is closed' using errcode = 'AKS08';
  end if;
  if p_path is null or p_path !~ ('^' || s.org_id::text || '/manuscripts/[0-9a-f-]{36}\.(pdf|epub|docx)$') then
    raise exception 'studio_invalid: path' using errcode = 'AKS02';
  end if;
  if (select count(*) from public.submission_files f where f.submission_id = s.id) >= 10 then
    raise exception 'ten files is the limit' using errcode = 'AKS29';
  end if;
  insert into public.submission_files (submission_id, org_id, kind, storage_path, file_name, mime, size_bytes, sha256, uploaded_by)
  values (s.id, s.org_id, p_kind, p_path, app.clean_text(p_file_name, 200), p_mime, p_size, p_sha256, app.uid())
  returning id into v_id;
  perform app.audit('submission.file_added', 'submission:' || s.id::text, null, null, s.org_id, null,
    jsonb_build_object('file', v_id, 'kind', p_kind, 'size', p_size, 'mime', p_mime));
  return v_id;
end $$;

create or replace function app.submission_withdraw(p_submission uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare s public.workbook_submissions;
begin
  select * into s from public.workbook_submissions x where x.id = p_submission for update;
  if not found or app.uid() is null or not app.org_can(s.org_id, 'workbooks', 'write') then
    raise exception 'not allowed' using errcode = 'AKS01';
  end if;
  if s.status in ('completed','declined','withdrawn') then
    raise exception 'this submission is closed' using errcode = 'AKS08';
  end if;
  update public.workbook_submissions x set status = 'withdrawn', status_changed_at = now(), status_changed_by = app.uid() where x.id = s.id;
  perform app.audit('submission.status', 'submission:' || s.id::text, null, null, s.org_id,
    jsonb_build_object('status', s.status), jsonb_build_object('status', 'withdrawn'));
  return 'withdrawn';
end $$;

-- For the staff review queue (0016): move a submission on, with a reason
-- where it goes back to the author.
create or replace function app.submission_set_status(p_submission uuid, p_status text, p_reason text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare s public.workbook_submissions; v_reason text := app.clean_text(p_reason, 500);
begin
  if not app.studio_staff() then
    raise exception 'only platform owners and editors move a submission' using errcode = 'AKS01';
  end if;
  if p_status is null or p_status not in ('submitted','accepted','quoted','deposit_paid','changes_requested','completed','declined') then
    raise exception 'studio_invalid: status' using errcode = 'AKS02';
  end if;
  select * into s from public.workbook_submissions x where x.id = p_submission for update;
  if not found then raise exception 'studio_invalid: submission' using errcode = 'AKS02'; end if;
  if s.status in ('completed','declined','withdrawn') then
    raise exception 'this submission is closed' using errcode = 'AKS08';
  end if;
  if p_status in ('changes_requested','declined') and v_reason is null then
    raise exception 'a reason is needed' using errcode = 'AKS02';
  end if;
  update public.workbook_submissions x set status = p_status, status_reason = v_reason, status_changed_at = now(), status_changed_by = app.uid()
   where x.id = s.id;
  perform app.audit('submission.status', 'submission:' || s.id::text, v_reason, null, s.org_id,
    jsonb_build_object('status', s.status), jsonb_build_object('status', p_status));
  return p_status;
end $$;

-- Route two: staff send a quote and a deposit link (a Stripe payment link or invoice).
create or replace function app.submission_set_quote(p_submission uuid, p_quote_minor bigint, p_currency text, p_deposit_minor bigint, p_payment_url text)
returns text
language plpgsql volatile security definer set search_path = '' as $$
declare s public.workbook_submissions;
begin
  if not app.studio_staff() then
    raise exception 'only platform owners and editors send a quote' using errcode = 'AKS01';
  end if;
  select * into s from public.workbook_submissions x where x.id = p_submission for update;
  if not found or s.route <> 'develop' or s.status not in ('submitted','accepted','quoted') then
    raise exception 'this submission cannot take a quote' using errcode = 'AKS08';
  end if;
  if p_quote_minor is null or p_quote_minor <= 0 or p_currency is null or upper(p_currency) !~ '^[A-Z]{3}$' then
    raise exception 'studio_invalid: quote' using errcode = 'AKS02';
  end if;
  if p_deposit_minor is not null and (p_deposit_minor <= 0 or p_deposit_minor > p_quote_minor) then
    raise exception 'studio_invalid: deposit' using errcode = 'AKS02';
  end if;
  update public.workbook_submissions x set quote_minor = p_quote_minor, quote_currency = upper(p_currency), deposit_minor = p_deposit_minor,
         payment_url = nullif(btrim(coalesce(p_payment_url, '')), ''), status = 'quoted', status_changed_at = now(), status_changed_by = app.uid()
   where x.id = s.id;
  perform app.audit('submission.quoted', 'submission:' || s.id::text, null, null, s.org_id,
    jsonb_build_object('status', s.status), jsonb_build_object('status', 'quoted', 'quote_minor', p_quote_minor, 'currency', upper(p_currency)));
  return 'quoted';
end $$;

-- ---------------------------------------------------------------------------
-- 14. RPC wrappers. Security invoker: the app functions do the checks.
-- ---------------------------------------------------------------------------
create or replace function public.org_invite(p_org uuid, p_email text, p_role text, p_author uuid, p_token_hash text) returns uuid
language sql volatile security invoker set search_path = '' as $$ select app.org_invite(p_org, p_email, p_role, p_author, p_token_hash) $$;
create or replace function public.org_invite_resend(p_invite uuid, p_token_hash text) returns uuid
language sql volatile security invoker set search_path = '' as $$ select app.org_invite_resend(p_invite, p_token_hash) $$;
create or replace function public.org_invite_revoke(p_invite uuid) returns boolean
language sql volatile security invoker set search_path = '' as $$ select app.org_invite_revoke(p_invite) $$;
create or replace function public.org_invite_view(p_token_hash text)
returns table (state text, organisation_name text, role text, email_hint text)
language sql stable security invoker set search_path = '' as $$ select * from app.org_invite_view(p_token_hash) $$;
create or replace function public.org_invite_accept(p_token_hash text) returns table (org_id uuid, role text)
language sql volatile security invoker set search_path = '' as $$ select * from app.org_invite_accept(p_token_hash) $$;
create or replace function public.org_roster(p_org uuid)
returns table (user_id uuid, email text, display_name text, role text, joined_at timestamptz, is_me boolean)
language sql stable security invoker set search_path = '' as $$ select * from app.org_roster(p_org) $$;
create or replace function public.org_member_set_role(p_org uuid, p_user uuid, p_role text) returns text
language sql volatile security invoker set search_path = '' as $$ select app.org_member_set_role(p_org, p_user, p_role) $$;
create or replace function public.org_member_remove(p_org uuid, p_user uuid) returns boolean
language sql volatile security invoker set search_path = '' as $$ select app.org_member_remove(p_org, p_user) $$;
create or replace function public.studio_authors(p_org uuid)
returns table (id uuid, code text, slug text, display_name text, legal_name text, bio text, bio_draft text,
               bio_status text, bio_flags jsonb, bio_submitted_at timestamptz, country char(2), website text,
               links jsonb, spelling text, photo_path text, photo_rights_confirmed_at timestamptz,
               has_login boolean, is_me boolean, can_edit boolean, is_demo boolean, status text)
language sql stable security invoker set search_path = '' as $$ select * from app.studio_authors(p_org) $$;
create or replace function public.author_save(
  p_org uuid, p_author uuid, p_display_name text, p_legal_name text, p_country text,
  p_website text, p_links jsonb, p_spelling text, p_photo_rights boolean, p_link_self boolean default false) returns uuid
language sql volatile security invoker set search_path = '' as $$
  select app.author_save(p_org, p_author, p_display_name, p_legal_name, p_country, p_website, p_links, p_spelling, p_photo_rights, p_link_self) $$;
create or replace function public.author_bio_submit(p_author uuid, p_bio text, p_flags jsonb) returns text
language sql volatile security invoker set search_path = '' as $$ select app.author_bio_submit(p_author, p_bio, p_flags) $$;
create or replace function public.author_bio_review(p_author uuid, p_approve boolean, p_flag_count int, p_reason text) returns text
language sql volatile security invoker set search_path = '' as $$ select app.author_bio_review(p_author, p_approve, p_flag_count, p_reason) $$;
create or replace function public.staff_pending_bios()
returns table (author_id uuid, org_id uuid, organisation_name text, display_name text, bio_draft text, bio_flags jsonb, bio_submitted_at timestamptz)
language sql stable security invoker set search_path = '' as $$ select * from app.staff_pending_bios() $$;
create or replace function public.imprint_save(p_org uuid, p_name text) returns uuid
language sql volatile security invoker set search_path = '' as $$ select app.imprint_save(p_org, p_name) $$;
create or replace function public.book_save(
  p_org uuid, p_book uuid, p_title text, p_subtitle text, p_series text, p_series_number numeric,
  p_edition text, p_language text, p_isbns jsonb, p_asin text, p_publisher text, p_imprint uuid,
  p_year int, p_genre text, p_rights_status text, p_store_link text, p_cover_rights boolean, p_kdp_select text) returns uuid
language sql volatile security invoker set search_path = '' as $$
  select app.book_save(p_org, p_book, p_title, p_subtitle, p_series, p_series_number, p_edition, p_language, p_isbns, p_asin,
                       p_publisher, p_imprint, p_year, p_genre, p_rights_status, p_store_link, p_cover_rights, p_kdp_select) $$;
create or replace function public.book_contributor_set(p_book uuid, p_author uuid, p_role text, p_death_year int, p_sort int, p_remove boolean)
returns boolean
language sql volatile security invoker set search_path = '' as $$ select app.book_contributor_set(p_book, p_author, p_role, p_death_year, p_sort, p_remove) $$;
create or replace function public.licence_accept(
  p_book uuid, p_version text, p_text_sha256 text, p_territories text[], p_excluded text[], p_term_months int, p_exclusive_months int,
  p_subscription boolean, p_cover boolean, p_audio boolean, p_warrant_rights boolean, p_warrant_no_clash boolean,
  p_warrant_no_claims boolean, p_signer_name text, p_signer_capacity text, p_ip_hash text)
returns table (licence_id uuid, licence_ref text, licence_status text)
language sql volatile security invoker set search_path = '' as $$
  select * from app.licence_accept(p_book, p_version, p_text_sha256, p_territories, p_excluded, p_term_months, p_exclusive_months,
    p_subscription, p_cover, p_audio, p_warrant_rights, p_warrant_no_clash, p_warrant_no_claims, p_signer_name, p_signer_capacity, p_ip_hash) $$;
create or replace function public.licence_upload(
  p_book uuid, p_version text, p_path text, p_document_sha256 text, p_territories text[], p_excluded text[], p_term_months int,
  p_exclusive_months int, p_subscription boolean, p_cover boolean, p_audio boolean, p_signer_name text, p_signer_capacity text, p_ip_hash text)
returns table (licence_id uuid, licence_ref text, licence_status text)
language sql volatile security invoker set search_path = '' as $$
  select * from app.licence_upload(p_book, p_version, p_path, p_document_sha256, p_territories, p_excluded, p_term_months,
    p_exclusive_months, p_subscription, p_cover, p_audio, p_signer_name, p_signer_capacity, p_ip_hash) $$;
create or replace function public.licence_verify(p_licence uuid, p_accept boolean, p_reason text) returns text
language sql volatile security invoker set search_path = '' as $$ select app.licence_verify(p_licence, p_accept, p_reason) $$;
create or replace function public.licence_text_approve(p_version text, p_reason text) returns text
language sql volatile security invoker set search_path = '' as $$ select app.licence_text_approve(p_version, p_reason) $$;
create or replace function public.submission_create(p_book uuid, p_route text, p_title text, p_genre text, p_brief text)
returns table (submission_id uuid, workbook_id uuid, workbook_code text)
language sql volatile security invoker set search_path = '' as $$ select * from app.submission_create(p_book, p_route, p_title, p_genre, p_brief) $$;
create or replace function public.submission_add_file(
  p_submission uuid, p_kind text, p_path text, p_file_name text, p_mime text, p_size bigint, p_sha256 text) returns uuid
language sql volatile security invoker set search_path = '' as $$
  select app.submission_add_file(p_submission, p_kind, p_path, p_file_name, p_mime, p_size, p_sha256) $$;
create or replace function public.submission_withdraw(p_submission uuid) returns text
language sql volatile security invoker set search_path = '' as $$ select app.submission_withdraw(p_submission) $$;
create or replace function public.submission_set_status(p_submission uuid, p_status text, p_reason text) returns text
language sql volatile security invoker set search_path = '' as $$ select app.submission_set_status(p_submission, p_status, p_reason) $$;
create or replace function public.submission_set_quote(p_submission uuid, p_quote_minor bigint, p_currency text, p_deposit_minor bigint, p_payment_url text)
returns text
language sql volatile security invoker set search_path = '' as $$
  select app.submission_set_quote(p_submission, p_quote_minor, p_currency, p_deposit_minor, p_payment_url) $$;

-- Execute: revoke from everyone, then give back to the one role that needs it.
revoke execute on function
  app.normalise_isbns(jsonb), app.guard_book_isbns(), app.guard_author_bio(), app.studio_staff(), app.caller_email(),
  app.mask_email(text), app.clean_text(text, int), app.clean_multiline(text, int), app.book_has_active_licence(uuid), app.workbook_licence_exempt(uuid),
  app.guard_workbook_licence(), app.can_invite(uuid), app.can_edit_author(uuid), app.mint_licence_ref(uuid),
  app.licence_check_terms(text[], text[], int, int, text, text),
  app.org_invite(uuid, text, text, uuid, text), app.org_invite_resend(uuid, text), app.org_invite_revoke(uuid),
  app.org_invite_view(text), app.org_invite_accept(text), app.org_roster(uuid),
  app.org_member_set_role(uuid, uuid, text), app.org_member_remove(uuid, uuid), app.studio_authors(uuid),
  app.author_save(uuid, uuid, text, text, text, text, jsonb, text, boolean, boolean), app.author_bio_submit(uuid, text, jsonb),
  app.author_bio_review(uuid, boolean, int, text), app.staff_pending_bios(), app.imprint_save(uuid, text),
  app.book_save(uuid, uuid, text, text, text, numeric, text, text, jsonb, text, text, uuid, int, text, text, text, boolean, text),
  app.book_contributor_set(uuid, uuid, text, int, int, boolean),
  app.licence_accept(uuid, text, text, text[], text[], int, int, boolean, boolean, boolean, boolean, boolean, boolean, text, text, text),
  app.licence_upload(uuid, text, text, text, text[], text[], int, int, boolean, boolean, boolean, text, text, text),
  app.licence_verify(uuid, boolean, text), app.licence_text_approve(text, text),
  app.submission_create(uuid, text, text, text, text), app.submission_add_file(uuid, text, text, text, text, bigint, text),
  app.submission_withdraw(uuid), app.submission_set_status(uuid, text, text), app.submission_set_quote(uuid, bigint, text, bigint, text)
  from public, anon, authenticated;
revoke execute on function
  public.org_invite(uuid, text, text, uuid, text), public.org_invite_resend(uuid, text), public.org_invite_revoke(uuid),
  public.org_invite_view(text), public.org_invite_accept(text), public.org_roster(uuid),
  public.org_member_set_role(uuid, uuid, text), public.org_member_remove(uuid, uuid), public.studio_authors(uuid),
  public.author_save(uuid, uuid, text, text, text, text, jsonb, text, boolean, boolean), public.author_bio_submit(uuid, text, jsonb),
  public.author_bio_review(uuid, boolean, int, text), public.staff_pending_bios(), public.imprint_save(uuid, text),
  public.book_save(uuid, uuid, text, text, text, numeric, text, text, jsonb, text, text, uuid, int, text, text, text, boolean, text),
  public.book_contributor_set(uuid, uuid, text, int, int, boolean),
  public.licence_accept(uuid, text, text, text[], text[], int, int, boolean, boolean, boolean, boolean, boolean, boolean, text, text, text),
  public.licence_upload(uuid, text, text, text, text[], text[], int, int, boolean, boolean, boolean, text, text, text),
  public.licence_verify(uuid, boolean, text), public.licence_text_approve(text, text),
  public.submission_create(uuid, text, text, text, text), public.submission_add_file(uuid, text, text, text, text, bigint, text),
  public.submission_withdraw(uuid), public.submission_set_status(uuid, text, text), public.submission_set_quote(uuid, bigint, text, bigint, text)
  from public, anon, authenticated;

-- Anyone holding an invitation link may ask what it is for.
grant execute on function app.org_invite_view(text), public.org_invite_view(text) to anon, authenticated, service_role;
-- Signed-in callers. Each function checks the caller's organisation role or staff role itself.
grant execute on function
  app.org_invite(uuid, text, text, uuid, text), app.org_invite_resend(uuid, text), app.org_invite_revoke(uuid),
  app.org_invite_accept(text), app.org_roster(uuid),
  app.org_member_set_role(uuid, uuid, text), app.org_member_remove(uuid, uuid), app.studio_authors(uuid),
  app.author_save(uuid, uuid, text, text, text, text, jsonb, text, boolean, boolean), app.author_bio_submit(uuid, text, jsonb),
  app.author_bio_review(uuid, boolean, int, text), app.staff_pending_bios(), app.imprint_save(uuid, text),
  app.book_save(uuid, uuid, text, text, text, numeric, text, text, jsonb, text, text, uuid, int, text, text, text, boolean, text),
  app.book_contributor_set(uuid, uuid, text, int, int, boolean),
  app.licence_accept(uuid, text, text, text[], text[], int, int, boolean, boolean, boolean, boolean, boolean, boolean, text, text, text),
  app.licence_upload(uuid, text, text, text, text[], text[], int, int, boolean, boolean, boolean, text, text, text),
  app.licence_verify(uuid, boolean, text), app.licence_text_approve(text, text),
  app.submission_create(uuid, text, text, text, text), app.submission_add_file(uuid, text, text, text, text, bigint, text),
  app.submission_withdraw(uuid), app.submission_set_status(uuid, text, text), app.submission_set_quote(uuid, bigint, text, bigint, text),
  public.org_invite(uuid, text, text, uuid, text), public.org_invite_resend(uuid, text), public.org_invite_revoke(uuid),
  public.org_invite_accept(text), public.org_roster(uuid),
  public.org_member_set_role(uuid, uuid, text), public.org_member_remove(uuid, uuid), public.studio_authors(uuid),
  public.author_save(uuid, uuid, text, text, text, text, jsonb, text, boolean, boolean), public.author_bio_submit(uuid, text, jsonb),
  public.author_bio_review(uuid, boolean, int, text), public.staff_pending_bios(), public.imprint_save(uuid, text),
  public.book_save(uuid, uuid, text, text, text, numeric, text, text, jsonb, text, text, uuid, int, text, text, text, boolean, text),
  public.book_contributor_set(uuid, uuid, text, int, int, boolean),
  public.licence_accept(uuid, text, text, text[], text[], int, int, boolean, boolean, boolean, boolean, boolean, boolean, text, text, text),
  public.licence_upload(uuid, text, text, text, text[], text[], int, int, boolean, boolean, boolean, text, text, text),
  public.licence_verify(uuid, boolean, text), public.licence_text_approve(text, text),
  public.submission_create(uuid, text, text, text, text), public.submission_add_file(uuid, text, text, text, text, bigint, text),
  public.submission_withdraw(uuid), public.submission_set_status(uuid, text, text), public.submission_set_quote(uuid, bigint, text, bigint, text)
  to authenticated;
-- Policies and triggers call these helpers.
grant execute on function app.book_has_active_licence(uuid), app.studio_staff() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 15. Row level security. Reads only; every write goes through a function.
-- ---------------------------------------------------------------------------
alter table public.imprints             enable row level security;
alter table public.book_rights          enable row level security;
alter table public.org_invitations      enable row level security;
alter table public.licence_texts        enable row level security;
alter table public.licences             enable row level security;
alter table public.workbook_submissions enable row level security;
alter table public.submission_files     enable row level security;

revoke all on public.imprints, public.book_rights, public.org_invitations, public.licence_texts, public.licences,
  public.workbook_submissions, public.submission_files from anon, authenticated;

-- imprints: a public label.
grant select on public.imprints to anon, authenticated;
create policy imprints_read on public.imprints for select to anon, authenticated using (true);

-- book_rights: the organisation and staff.
grant select on public.book_rights to authenticated;
create policy book_rights_read on public.book_rights for select to authenticated
  using ((select app.is_org_member(org_id)) or (select app.is_staff()));

-- org_invitations: whoever may invite, and staff. Never the token hash.
grant select (id, org_id, email, role, author_id, invited_by, created_at, last_sent_at, send_count, expires_at, accepted_at, revoked_at)
  on public.org_invitations to authenticated;
create policy org_invitations_read on public.org_invitations for select to authenticated
  using ((select app.org_can(org_id, 'members', 'manage')) or (select app.is_staff()));

-- licence_texts: everyone may see which versions exist and whether they are approved.
grant select on public.licence_texts to anon, authenticated;
create policy licence_texts_read on public.licence_texts for select to anon, authenticated using (true);

-- licences: the organisation's roles with licences read, and staff.
grant select on public.licences to authenticated;
create policy licences_read on public.licences for select to authenticated
  using ((select app.org_can(org_id, 'licences', 'read')) or (select app.is_staff()));

-- submissions and their files: the organisation's members and staff.
grant select on public.workbook_submissions to authenticated;
create policy workbook_submissions_read on public.workbook_submissions for select to authenticated
  using ((select app.org_can(org_id, 'workbooks', 'read')) or (select app.is_staff()));
grant select on public.submission_files to authenticated;
create policy submission_files_read on public.submission_files for select to authenticated
  using ((select app.org_can(org_id, 'workbooks', 'read')) or (select app.is_staff()));

grant select, insert, update, delete on public.imprints, public.book_rights, public.org_invitations, public.licence_texts,
  public.licences, public.workbook_submissions, public.submission_files to service_role;
