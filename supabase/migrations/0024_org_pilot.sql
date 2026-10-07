-- 0024 Akana Business manual-sales pilot (F-201 to F-204).
--
-- Depends on 0001 to 0018 only. Same rules as before: every table has RLS
-- on, grants to anon and authenticated are revoked and given back narrowly,
-- helpers are security definer with search_path pinned to '', and PostgREST
-- sees thin public wrappers that run as the caller. Nothing in 0001 to 0018
-- is edited; app.has_entitlement is replaced here with create or replace,
-- copying the 0009 body exactly and adding one condition.
--
-- What this adds:
--   * Customer organisations (F-201): kinds business, church, charity and
--     community_group, and a profile with billing contact, VAT number,
--     charity number and size band. Staff create them. A customer
--     organisation has no PB- or AU- code; it never publishes.
--   * Licences and seats (F-202): staff record a licence by hand (the
--     invoice is raised outside the app). A seat is one person. Claiming a
--     seat writes a library-wide entitlement with source team_seat, the
--     source 0004 reserved. has_entitlement opens a title through that row
--     only while the licence is active, inside its dates, the organisation
--     is not suspended or closed, and the title is in the licence's scope.
--     Releasing a seat lapses the row: the work stays the reader's and goes
--     read only, as a lapsed membership does (F-095).
--   * Seat invitations (F-203) on the hashed token pattern (0012, 0013).
--     The plain token goes only into the email; the database keeps its
--     sha256. Claiming needs a signed-in account, a button press and the
--     18+ confirmation. One open seat per person per licence. Revoking an
--     invitation frees its place. Send limits come from the audit log.
--     An address that says no is not invited again by that organisation.
--   * The organisation console's reads (F-204): seats bought, claimed and
--     people started, as counts. People started is suppressed under
--     suppression_threshold_owner and never given per person. Nothing here
--     gives an organisation a read path to answers, enrolments, progress,
--     check-ins or daily checks.
--
-- ===========================================================================
-- TABLES FOR OTHER MIGRATIONS (the 0021 ledger may read these)
-- ===========================================================================
--
-- public.org_profiles          one row per customer organisation
--   org_id            uuid PK, FK organisations
--   size_band         text   'under_10','10_49','50_249','250_999','1000_plus'
--   sector            text   free label, 80 chars
--   charity_number    text   null unless a registered charity or church
--   vat_number        text   null when not VAT registered
--   billing_name      text   billing contact name
--   billing_email     text   billing contact address (lower case)
--   billing_country   char(2)
--
-- public.org_licences          one row per licence Akana staff record
--   id                uuid PK
--   org_id            uuid   FK organisations (a customer kind)
--   tenant_id         uuid   FK tenants; the marketplace at launch
--   kind              text   'teams','church','group','pilot'. A pilot is
--                            free: it puts nothing in the pool.
--   title_scope       text   'membership' (every membership catalogue
--                            title) or 'list' (org_licence_titles)
--   seats_purchased   int    1 to 10000
--   starts_at, ends_at       the paid period; access only inside it
--   status            text   'active','suspended','ended'. ended is final.
--   manual_invoice_ref text  the invoice number raised outside the app
--   stripe_subscription_id text  null until F-220
--
-- public.org_licence_titles    (licence_id, workbook_id) for scope 'list'
--
-- public.org_seats             one row per claim of a seat
--   id, licence_id, org_id
--   user_id           uuid   the seat holder (cascades with the auth user)
--   invitation_id     uuid   the invitation it came from
--   entitlement_id    uuid   the team_seat row in public.entitlements
--   roster_email      text   the address the organisation invited; the
--                            organisation's roster data. Cleared on release.
--   claimed_at, released_at, released_reason
--   A seat is open while released_at is null.
--
-- public.entitlements gains org_licence_id. A team_seat row always has
-- workbook_id null and org_licence_id set; every other row has it null. The
-- unique key becomes (user_id, tenant_id, workbook_id, source,
-- org_licence_id), nulls not distinct, which is the old key for every
-- existing row, so one person can hold seats on two licences. To attribute
-- a reader's use to a licence, join entitlements.org_licence_id to
-- org_licences.id; to know whether a seat was live on a date, use
-- org_seats.claimed_at and released_at together with the licence dates.
--
-- public.org_seat_invitations  pending, accepted, declined and revoked
--   invitations. email is held only while pending and cleared on accept,
--   decline or revoke. token_hash and email_hash are never readable by a
--   client.
--
-- Error codes, for the server to map:
--   AKO01  not allowed (wrong role, or not signed in)
--   AKO02  a field failed validation (the message names the field)
--   AKO04  the link is unknown, expired, used or revoked
--   AKO05  already exists (an open seat or pending invitation for the address)
--   AKO06  the account is scheduled for deletion
--   AKO07  no seats left on the licence
--   AKO08  the row is not in a state that allows this
--   AKO09  this address asked not to be invited by this organisation
--   AKO10  the 18 or over confirmation is missing
--   AKO29  rate limited

-- ---------------------------------------------------------------------------
-- 1. Customer organisation kinds (F-201).
-- ---------------------------------------------------------------------------
alter table public.organisations drop constraint organisations_kind_check;
alter table public.organisations add constraint organisations_kind_check
  check (kind in ('akana_house','publisher','author_company','individual','business','church','charity','community_group'));

create or replace function app.is_customer_kind(p_kind text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p_kind in ('business','church','charity','community_group'), false)
$$;

create or replace function app.is_customer_org(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.organisations o where o.id = p_org and app.is_customer_kind(o.kind))
$$;

create table public.org_profiles (
  org_id          uuid primary key references public.organisations(id) on delete cascade,
  size_band       text check (size_band is null or size_band in ('under_10','10_49','50_249','250_999','1000_plus')),
  sector          text check (sector is null or (char_length(sector) between 1 and 80 and sector !~ '[<>[:cntrl:]]')),
  charity_number  text check (charity_number is null or charity_number ~ '^[A-Za-z0-9 -]{3,20}$'),
  vat_number      text check (vat_number is null or vat_number ~ '^[A-Z]{2}[A-Z0-9]{2,13}$'),
  billing_name    text check (billing_name is null or (char_length(billing_name) between 1 and 120 and billing_name !~ '[<>[:cntrl:]]')),
  billing_email   text check (billing_email is null or (char_length(billing_email) between 3 and 254 and billing_email = lower(billing_email)
                                                       and billing_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$')),
  billing_country char(2) check (billing_country is null or billing_country ~ '^[A-Z]{2}$'),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger org_profiles_touch before update on public.org_profiles for each row execute function app.touch_updated_at();

-- New resources for the fixed roles (F-130). Owners manage seats and see
-- billing; finance sees seats and billing; viewers see seat counts.
insert into public.org_permissions (role, resource, action) values
  ('owner','seats','read'),('owner','seats','manage'),
  ('owner','billing','read'),('owner','billing','write'),
  ('finance','seats','read'),('finance','billing','read'),('finance','billing','write'),
  ('viewer','seats','read')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Licences and seats (F-202).
-- ---------------------------------------------------------------------------
create table public.org_licences (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references public.organisations(id) on delete cascade,
  tenant_id              uuid not null default '00000000-0000-0000-0000-00000000000a' references public.tenants(id),
  kind                   text not null check (kind in ('teams','church','group','pilot')),
  title_scope            text not null check (title_scope in ('membership','list')),
  seats_purchased        int not null check (seats_purchased between 1 and 10000),
  starts_at              timestamptz not null,
  ends_at                timestamptz not null,
  status                 text not null default 'active' check (status in ('active','suspended','ended')),
  manual_invoice_ref     text check (manual_invoice_ref is null or manual_invoice_ref ~ '^[A-Za-z0-9][A-Za-z0-9 ./_-]{0,59}$'),
  stripe_subscription_id text check (stripe_subscription_id is null or stripe_subscription_id ~ '^sub_[A-Za-z0-9]+$'),
  created_by             uuid references auth.users(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  ended_at               timestamptz,
  constraint org_licences_window check (ends_at > starts_at),
  constraint org_licences_ended check ((status = 'ended') = (ended_at is not null))
);
create index org_licences_org_idx on public.org_licences(org_id, created_at desc);
create trigger org_licences_touch before update on public.org_licences for each row execute function app.touch_updated_at();

create table public.org_licence_titles (
  licence_id  uuid not null references public.org_licences(id) on delete cascade,
  workbook_id uuid not null references public.workbooks(id) on delete cascade,
  added_at    timestamptz not null default now(),
  primary key (licence_id, workbook_id)
);
create index org_licence_titles_workbook_idx on public.org_licence_titles(workbook_id);

create table public.org_seat_invitations (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organisations(id) on delete cascade,
  licence_id   uuid not null references public.org_licences(id) on delete cascade,
  -- Held only while the invitation is open.
  email        text check (email is null or (char_length(email) between 3 and 254 and email = lower(email)
                                             and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$')),
  email_hash   text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  token_hash   text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  invited_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  last_sent_at timestamptz not null default now(),
  send_count   int not null default 1 check (send_count between 1 and 10),
  expires_at   timestamptz not null,
  accepted_at  timestamptz,
  accepted_by  uuid references auth.users(id) on delete set null,
  declined_at  timestamptz,
  revoked_at   timestamptz,
  constraint org_seat_invitations_window check (expires_at > created_at),
  constraint org_seat_invitations_one_end check (num_nonnulls(accepted_at, declined_at, revoked_at) <= 1),
  constraint org_seat_invitations_email_closed check (email is not null or accepted_at is not null or declined_at is not null or revoked_at is not null)
);
create index org_seat_invitations_licence_idx on public.org_seat_invitations(licence_id, created_at desc);
create index org_seat_invitations_org_idx on public.org_seat_invitations(org_id, created_at desc);
-- One open invitation per address per licence.
create unique index org_seat_invitations_open_idx on public.org_seat_invitations(licence_id, email_hash)
  where accepted_at is null and declined_at is null and revoked_at is null;

create table public.org_seats (
  id              uuid primary key default gen_random_uuid(),
  licence_id      uuid not null references public.org_licences(id) on delete cascade,
  org_id          uuid not null references public.organisations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  invitation_id   uuid references public.org_seat_invitations(id) on delete set null,
  entitlement_id  uuid references public.entitlements(id) on delete set null,
  roster_email    text check (roster_email is null or (char_length(roster_email) between 3 and 254 and roster_email = lower(roster_email))),
  claimed_at      timestamptz not null default now(),
  released_at     timestamptz,
  released_reason text check (released_reason in ('released_by_organisation','left','licence_ended','released_by_staff','account_deleted')),
  constraint org_seats_released check ((released_at is null) = (released_reason is null))
);
-- One open seat per person per licence.
create unique index org_seats_open_idx on public.org_seats(licence_id, user_id) where released_at is null;
create index org_seats_user_idx on public.org_seats(user_id);
create index org_seats_org_idx on public.org_seats(org_id);

-- Addresses that said no to an organisation's invitation. A hash, never the address.
create table public.org_seat_blocks (
  org_id      uuid not null references public.organisations(id) on delete cascade,
  email_hash  text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  created_at  timestamptz not null default now(),
  primary key (org_id, email_hash)
);

-- Entitlements: a team_seat row names its licence.
alter table public.entitlements add column org_licence_id uuid references public.org_licences(id);
create index entitlements_org_licence_idx on public.entitlements(org_licence_id) where org_licence_id is not null;
alter table public.entitlements drop constraint entitlements_user_id_tenant_id_workbook_id_source_key;
alter table public.entitlements add constraint entitlements_user_tenant_workbook_source_licence_key
  unique nulls not distinct (user_id, tenant_id, workbook_id, source, org_licence_id);
alter table public.entitlements add constraint entitlements_team_seat_shape
  check ((source = 'team_seat') = (org_licence_id is not null) and (source <> 'team_seat' or workbook_id is null));

insert into public.app_config (key, value) values
  ('org_seat_invites_per_day', '50'),
  ('org_seat_invite_days', '14')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Scope and access helpers.
-- ---------------------------------------------------------------------------

-- Is this title inside the licence's scope? Scope only: no dates, no status.
-- Higher-tier wellbeing titles are outside every licence while that tier is
-- paused (O15, akana-business.md 4.3). Demo titles are outside too: they are
-- not in the membership (0010) and cannot be put on a list (below).
create or replace function app.org_licence_scope_has(p_licence uuid, p_workbook uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_licence is not null and p_workbook is not null and exists (
    select 1 from public.org_licences l
    join public.workbooks w on w.id = p_workbook
    where l.id = p_licence
      and w.tenant_id = l.tenant_id
      and not w.is_demo
      and w.safety_tier <> 'higher'
      and case l.title_scope
            when 'membership' then w.in_membership
            when 'list' then exists (select 1 from public.org_licence_titles t where t.licence_id = l.id and t.workbook_id = w.id)
            else false end)
$$;

-- Is the licence open right now? Active, inside its dates, and its
-- organisation is neither suspended nor closed.
create or replace function app.org_licence_live(p_licence uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_licence is not null and exists (
    select 1 from public.org_licences l
    join public.organisations o on o.id = l.org_id
    where l.id = p_licence and l.status = 'active'
      and l.starts_at <= now() and l.ends_at > now()
      and o.status not in ('suspended','closed'))
$$;

-- Does a team_seat entitlement on this licence open this workbook now?
-- A null workbook (a library-wide question) is always no for a seat.
create or replace function app.team_seat_covers(p_licence uuid, p_workbook uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.org_licence_live(p_licence) and app.org_licence_scope_has(p_licence, p_workbook)
$$;

-- ---------------------------------------------------------------------------
-- has_entitlement, extended. The same signature and the same body as 0009,
-- with one added condition: a row whose source is team_seat opens a workbook
-- only when app.team_seat_covers says its licence covers it now. The
-- condition stands on its own, outside the workbook branch, so it holds for
-- any team_seat row whatever its workbook_id (the table check keeps that
-- null as well). Every other source is untouched.
-- ---------------------------------------------------------------------------
create or replace function app.has_entitlement(p_user uuid, p_tenant uuid, p_workbook uuid, p_unit int default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user is not null and p_tenant is not null and exists (
    select 1 from public.entitlements e
    where e.user_id = p_user
      and e.tenant_id = p_tenant
      and (e.workbook_id = p_workbook
           or (e.workbook_id is null
               and (e.source <> 'membership' or p_workbook is null or app.workbook_in_membership(p_workbook))))
      and (e.source <> 'team_seat' or app.team_seat_covers(e.org_licence_id, p_workbook))
      and e.status = 'active'
      and e.starts_at <= now()
      and (e.ends_at is null or e.ends_at > now()))
$$;

create or replace function app.org_email_hash(p_email text) returns text
language sql immutable set search_path = '' as $$
  select encode(pg_catalog.sha256(pg_catalog.convert_to(lower(btrim(coalesce(p_email, ''))), 'UTF8')), 'hex')
$$;

create or replace function app.org_can_manage_seats(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_platform(array['owner','editor']) or app.org_can(p_org, 'seats', 'manage')
$$;

create or replace function app.org_config_int(p_key text, p_default int) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce((select (c.value #>> '{}')::int from public.app_config c where c.key = p_key), p_default)
$$;

-- Keep the team_seat rows of a licence's open seats in step with its dates.
create or replace function app.org_licence_sync_entitlements(p_licence uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  l public.org_licences;
  n int;
begin
  select * into l from public.org_licences x where x.id = p_licence;
  if not found then return 0; end if;
  update public.entitlements e
     set starts_at = l.starts_at, ends_at = l.ends_at
    from public.org_seats s
   where s.licence_id = l.id and s.released_at is null and e.id = s.entitlement_id and e.status = 'active'
     and (e.starts_at is distinct from l.starts_at or e.ends_at is distinct from l.ends_at);
  get diagnostics n = row_count;
  return n;
end $$;

-- End one seat: lapse its entitlement (read only, answers kept), clear the
-- roster address, write the audit row. Internal; callers check the role.
create or replace function app.org_seat_end(p_seat uuid, p_reason text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  s public.org_seats;
begin
  select * into s from public.org_seats x where x.id = p_seat for update;
  if not found or s.released_at is not null then return false; end if;
  update public.org_seats x set released_at = now(), released_reason = p_reason, roster_email = null where x.id = s.id;
  update public.entitlements e
     set status = 'lapsed', ends_at = least(coalesce(e.ends_at, now()), now())
   where e.id = s.entitlement_id and e.status = 'active';
  perform app.audit('org.seat_released', 'org_seat:' || s.id::text, p_reason, null, s.org_id, null,
    jsonb_build_object('licence', s.licence_id, 'reason', p_reason));
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Staff: customer organisations and their profile (F-201).
-- ---------------------------------------------------------------------------
create or replace function app.org_profile_check(
  p_size_band text, p_sector text, p_charity_number text, p_vat_number text,
  p_billing_name text, p_billing_email text, p_billing_country text
) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if p_size_band is not null and p_size_band not in ('under_10','10_49','50_249','250_999','1000_plus') then
    raise exception 'org_invalid: size_band' using errcode = 'AKO02';
  end if;
  if p_sector is not null and (char_length(p_sector) > 80 or p_sector ~ '[<>[:cntrl:]]') then
    raise exception 'org_invalid: sector' using errcode = 'AKO02';
  end if;
  if p_charity_number is not null and p_charity_number !~ '^[A-Za-z0-9 -]{3,20}$' then
    raise exception 'org_invalid: charity_number' using errcode = 'AKO02';
  end if;
  if p_vat_number is not null and p_vat_number !~ '^[A-Z]{2}[A-Z0-9]{2,13}$' then
    raise exception 'org_invalid: vat_number' using errcode = 'AKO02';
  end if;
  if p_billing_name is not null and (char_length(p_billing_name) > 120 or p_billing_name ~ '[<>[:cntrl:]]') then
    raise exception 'org_invalid: billing_name' using errcode = 'AKO02';
  end if;
  if p_billing_email is not null and (char_length(p_billing_email) not between 3 and 254 or p_billing_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$') then
    raise exception 'org_invalid: billing_email' using errcode = 'AKO02';
  end if;
  if p_billing_country is not null and p_billing_country !~ '^[A-Z]{2}$' then
    raise exception 'org_invalid: billing_country' using errcode = 'AKO02';
  end if;
end $$;

create or replace function app.create_customer_organisation(
  p_kind text, p_display_name text, p_legal_name text, p_country text, p_slug text,
  p_size_band text default null, p_sector text default null, p_charity_number text default null, p_vat_number text default null,
  p_billing_name text default null, p_billing_email text default null, p_billing_country text default null
) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id      uuid := gen_random_uuid();
  v_display text := app.clean_text(p_display_name, 201);
  v_legal   text := app.clean_text(p_legal_name, 301);
  v_country text := upper(btrim(coalesce(p_country, '')));
  v_slug    text := lower(btrim(coalesce(p_slug, '')));
  v_sector  text := app.clean_text(p_sector, 81);
  v_charity text := app.clean_text(p_charity_number, 21);
  v_vat     text := upper(regexp_replace(coalesce(p_vat_number, ''), '\s', '', 'g'));
  v_bname   text := app.clean_text(p_billing_name, 121);
  v_bemail  text := lower(app.clean_text(p_billing_email, 255));
  v_bcountry text := nullif(upper(btrim(coalesce(p_billing_country, ''))), '');
begin
  if not app.is_platform(array['owner','editor']) then
    raise exception 'only platform owners and editors create customer organisations' using errcode = 'AKO01';
  end if;
  if not app.is_customer_kind(p_kind) then
    raise exception 'org_invalid: kind' using errcode = 'AKO02';
  end if;
  if v_display is null or char_length(v_display) > 200 then
    raise exception 'org_invalid: display_name' using errcode = 'AKO02';
  end if;
  if v_legal is null or char_length(v_legal) > 300 then
    raise exception 'org_invalid: legal_name' using errcode = 'AKO02';
  end if;
  if v_country !~ '^[A-Z]{2}$' then
    raise exception 'org_invalid: country' using errcode = 'AKO02';
  end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(v_slug) > 80 then
    raise exception 'org_invalid: slug' using errcode = 'AKO02';
  end if;
  v_vat := nullif(v_vat, '');
  perform app.org_profile_check(p_size_band, v_sector, v_charity, v_vat, v_bname, v_bemail, v_bcountry);
  if exists (select 1 from public.organisations o where o.slug = v_slug) then
    raise exception 'an organisation with slug % already exists', v_slug using errcode = 'AKO05';
  end if;

  insert into public.organisations (id, code, kind, legal_name, display_name, slug, country)
  values (v_id, null, p_kind, v_legal, v_display, v_slug, v_country);
  insert into public.org_profiles (org_id, size_band, sector, charity_number, vat_number, billing_name, billing_email, billing_country)
  values (v_id, p_size_band, v_sector, v_charity, v_vat, v_bname, v_bemail, coalesce(v_bcountry, v_country));

  perform app.audit('organisation.created', 'organisation:' || v_id::text, null, null, v_id, null,
    jsonb_build_object('kind', p_kind, 'display_name', v_display, 'slug', v_slug, 'country', v_country, 'customer', true));
  return v_id;
end $$;

-- Staff, or the organisation's billing roles, keep the profile up to date.
create or replace function app.org_profile_save(
  p_org uuid, p_size_band text, p_sector text, p_charity_number text, p_vat_number text,
  p_billing_name text, p_billing_email text, p_billing_country text
) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_sector  text := app.clean_text(p_sector, 81);
  v_charity text := app.clean_text(p_charity_number, 21);
  v_vat     text := nullif(upper(regexp_replace(coalesce(p_vat_number, ''), '\s', '', 'g')), '');
  v_bname   text := app.clean_text(p_billing_name, 121);
  v_bemail  text := lower(app.clean_text(p_billing_email, 255));
  v_bcountry text := nullif(upper(btrim(coalesce(p_billing_country, ''))), '');
begin
  if app.uid() is null or p_org is null
     or not (app.is_platform(array['owner','editor']) or app.org_can(p_org, 'billing', 'write')) then
    raise exception 'not allowed' using errcode = 'AKO01';
  end if;
  if not app.is_customer_org(p_org) then
    raise exception 'org_invalid: organisation' using errcode = 'AKO02';
  end if;
  perform app.org_profile_check(p_size_band, v_sector, v_charity, v_vat, v_bname, v_bemail, v_bcountry);
  insert into public.org_profiles (org_id, size_band, sector, charity_number, vat_number, billing_name, billing_email, billing_country)
  values (p_org, p_size_band, v_sector, v_charity, v_vat, v_bname, v_bemail, v_bcountry)
  on conflict (org_id) do update set
    size_band = excluded.size_band, sector = excluded.sector, charity_number = excluded.charity_number,
    vat_number = excluded.vat_number, billing_name = excluded.billing_name, billing_email = excluded.billing_email,
    billing_country = excluded.billing_country;
  perform app.audit('org.profile_saved', 'organisation:' || p_org::text, null, null, p_org);
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Staff: licences (F-202). Recorded by hand; invoiced outside the app.
-- ---------------------------------------------------------------------------
create or replace function app.org_licence_set_titles_inner(p_licence uuid, p_titles uuid[]) returns int
language plpgsql security definer set search_path = '' as $$
declare
  l public.org_licences;
  v_bad uuid;
  n int;
begin
  select * into l from public.org_licences x where x.id = p_licence;
  if coalesce(cardinality(p_titles), 0) > 200 then
    raise exception 'org_invalid: titles' using errcode = 'AKO02';
  end if;
  select t into v_bad from unnest(coalesce(p_titles, '{}'::uuid[])) t
   where not exists (select 1 from public.workbooks w
                     where w.id = t and w.tenant_id = l.tenant_id and not w.is_demo and w.safety_tier <> 'higher')
   limit 1;
  if v_bad is not null then
    raise exception 'org_invalid: titles (% is demo, higher tier, on another storefront or unknown)', v_bad using errcode = 'AKO02';
  end if;
  delete from public.org_licence_titles x where x.licence_id = l.id and not (x.workbook_id = any(coalesce(p_titles, '{}'::uuid[])));
  insert into public.org_licence_titles (licence_id, workbook_id)
  select l.id, t from (select distinct unnest(coalesce(p_titles, '{}'::uuid[])) t) s
  on conflict do nothing;
  select count(*) into n from public.org_licence_titles x where x.licence_id = l.id;
  return n;
end $$;

create or replace function app.org_licence_create(
  p_org uuid, p_kind text, p_title_scope text, p_seats int, p_starts_at timestamptz, p_ends_at timestamptz,
  p_invoice_ref text default null, p_titles uuid[] default null
) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id  uuid;
  v_ref text := app.clean_text(p_invoice_ref, 61);
  n     int := 0;
begin
  if not app.is_platform(array['owner','editor']) then
    raise exception 'only platform owners and editors record licences' using errcode = 'AKO01';
  end if;
  if not app.is_customer_org(p_org) or exists (select 1 from public.organisations o where o.id = p_org and o.status = 'closed') then
    raise exception 'org_invalid: organisation' using errcode = 'AKO02';
  end if;
  if p_kind is null or p_kind not in ('teams','church','group','pilot') then
    raise exception 'org_invalid: kind' using errcode = 'AKO02';
  end if;
  if p_title_scope is null or p_title_scope not in ('membership','list') then
    raise exception 'org_invalid: title_scope' using errcode = 'AKO02';
  end if;
  if p_seats is null or p_seats not between 1 and 10000 then
    raise exception 'org_invalid: seats' using errcode = 'AKO02';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at or p_ends_at <= now() then
    raise exception 'org_invalid: dates' using errcode = 'AKO02';
  end if;
  if p_ends_at > p_starts_at + interval '3 years' then
    raise exception 'org_invalid: dates (three years at most)' using errcode = 'AKO02';
  end if;
  if v_ref is not null and v_ref !~ '^[A-Za-z0-9][A-Za-z0-9 ./_-]{0,59}$' then
    raise exception 'org_invalid: invoice_ref' using errcode = 'AKO02';
  end if;
  if p_title_scope = 'list' and coalesce(cardinality(p_titles), 0) = 0 then
    raise exception 'org_invalid: titles (a list licence needs at least one title)' using errcode = 'AKO02';
  end if;
  if p_title_scope = 'membership' and coalesce(cardinality(p_titles), 0) > 0 then
    raise exception 'org_invalid: titles (a membership licence takes no list)' using errcode = 'AKO02';
  end if;

  insert into public.org_licences (org_id, kind, title_scope, seats_purchased, starts_at, ends_at, manual_invoice_ref, created_by)
  values (p_org, p_kind, p_title_scope, p_seats, p_starts_at, p_ends_at, v_ref, app.uid())
  returning id into v_id;
  if p_title_scope = 'list' then
    n := app.org_licence_set_titles_inner(v_id, p_titles);
  end if;

  perform app.audit('org.licence_created', 'org_licence:' || v_id::text, null, null, p_org, null,
    jsonb_build_object('kind', p_kind, 'title_scope', p_title_scope, 'seats', p_seats, 'starts_at', p_starts_at,
                       'ends_at', p_ends_at, 'invoice_ref', v_ref, 'titles', n));
  return v_id;
end $$;

-- Change seats, dates, the invoice reference or the status. Seats never go
-- below the seats taken plus open invitations. ended is final: every open
-- seat is released and every open invitation revoked.
create or replace function app.org_licence_update(
  p_licence uuid, p_seats int, p_starts_at timestamptz, p_ends_at timestamptz, p_invoice_ref text, p_status text, p_reason text
) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  l       public.org_licences;
  v_ref   text := app.clean_text(p_invoice_ref, 61);
  v_reason text := app.clean_text(p_reason, 500);
  v_used  int;
  v_seat  uuid;
  v_status text := coalesce(p_status, 'active');
begin
  if not app.is_platform(array['owner','editor']) then
    raise exception 'only platform owners and editors change licences' using errcode = 'AKO01';
  end if;
  select * into l from public.org_licences x where x.id = p_licence for update;
  if not found then
    raise exception 'org_invalid: licence' using errcode = 'AKO02';
  end if;
  if l.status = 'ended' then
    raise exception 'this licence has ended' using errcode = 'AKO08';
  end if;
  if v_status not in ('active','suspended','ended') then
    raise exception 'org_invalid: status' using errcode = 'AKO02';
  end if;
  if v_reason is null then
    raise exception 'org_invalid: reason' using errcode = 'AKO02';
  end if;
  if p_seats is null or p_seats not between 1 and 10000 then
    raise exception 'org_invalid: seats' using errcode = 'AKO02';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at or p_ends_at > p_starts_at + interval '3 years' then
    raise exception 'org_invalid: dates' using errcode = 'AKO02';
  end if;
  if v_ref is not null and v_ref !~ '^[A-Za-z0-9][A-Za-z0-9 ./_-]{0,59}$' then
    raise exception 'org_invalid: invoice_ref' using errcode = 'AKO02';
  end if;

  if v_status <> 'ended' then
    select (select count(*) from public.org_seats s where s.licence_id = l.id and s.released_at is null)
         + (select count(*) from public.org_seat_invitations i where i.licence_id = l.id and i.accepted_at is null
              and i.declined_at is null and i.revoked_at is null and i.expires_at > now())
      into v_used;
    if p_seats < v_used then
      raise exception 'seats cannot go below the % already taken or invited', v_used using errcode = 'AKO08';
    end if;
  end if;

  update public.org_licences x
     set seats_purchased = p_seats, starts_at = p_starts_at, ends_at = p_ends_at, manual_invoice_ref = v_ref,
         status = v_status, ended_at = case when v_status = 'ended' then now() end
   where x.id = l.id;

  if v_status = 'ended' then
    for v_seat in select s.id from public.org_seats s where s.licence_id = l.id and s.released_at is null loop
      perform app.org_seat_end(v_seat, 'licence_ended');
    end loop;
    update public.org_seat_invitations i set revoked_at = now(), email = null
     where i.licence_id = l.id and i.accepted_at is null and i.declined_at is null and i.revoked_at is null;
  else
    perform app.org_licence_sync_entitlements(l.id);
  end if;

  perform app.audit('org.licence_updated', 'org_licence:' || l.id::text, v_reason, null, l.org_id,
    jsonb_build_object('seats', l.seats_purchased, 'starts_at', l.starts_at, 'ends_at', l.ends_at, 'status', l.status, 'invoice_ref', l.manual_invoice_ref),
    jsonb_build_object('seats', p_seats, 'starts_at', p_starts_at, 'ends_at', p_ends_at, 'status', v_status, 'invoice_ref', v_ref));
  return v_status;
end $$;

create or replace function app.org_licence_set_titles(p_licence uuid, p_titles uuid[]) returns int
language plpgsql volatile security definer set search_path = '' as $$
declare
  l public.org_licences;
  n int;
begin
  if not app.is_platform(array['owner','editor']) then
    raise exception 'only platform owners and editors change licences' using errcode = 'AKO01';
  end if;
  select * into l from public.org_licences x where x.id = p_licence for update;
  if not found then
    raise exception 'org_invalid: licence' using errcode = 'AKO02';
  end if;
  if l.status = 'ended' then
    raise exception 'this licence has ended' using errcode = 'AKO08';
  end if;
  if l.title_scope <> 'list' then
    raise exception 'a membership licence takes no list' using errcode = 'AKO08';
  end if;
  if coalesce(cardinality(p_titles), 0) = 0 then
    raise exception 'org_invalid: titles (a list licence needs at least one title)' using errcode = 'AKO02';
  end if;
  n := app.org_licence_set_titles_inner(l.id, p_titles);
  perform app.audit('org.licence_titles', 'org_licence:' || l.id::text, null, null, l.org_id, null, jsonb_build_object('titles', n));
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Seat invitations (F-203). The server mints the token and passes only
-- its hash. Runs as the signed-in owner (or staff); the function checks.
-- ---------------------------------------------------------------------------

-- Open invitations that still hold a place on the licence.
create or replace function app.org_licence_places_used(p_licence uuid) returns int
language sql stable security definer set search_path = '' as $$
  select ((select count(*) from public.org_seats s where s.licence_id = p_licence and s.released_at is null)
        + (select count(*) from public.org_seat_invitations i where i.licence_id = p_licence and i.accepted_at is null
             and i.declined_at is null and i.revoked_at is null and i.expires_at > now()))::int
$$;

create or replace function app.org_seat_invite_rate_check(p_org uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
declare n int;
begin
  select count(*) into n from public.audit_log a
   where a.action in ('org.seat_invited','org.seat_invite_resent') and a.org_id = p_org and a.at > now() - interval '1 day';
  if n >= app.org_config_int('org_seat_invites_per_day', 50) then
    raise exception 'too many invitations today' using errcode = 'AKO29';
  end if;
end $$;

create or replace function app.org_seat_invite(p_licence uuid, p_email text, p_token_hash text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  l       public.org_licences;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_hash  text;
  v_id    uuid;
  n       int;
begin
  select * into l from public.org_licences x where x.id = p_licence;
  if not found or app.uid() is null or not app.org_can_manage_seats(l.org_id) then
    raise exception 'not allowed to invite to this licence' using errcode = 'AKO01';
  end if;
  if char_length(v_email) not between 3 and 254 or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'org_invalid: email' using errcode = 'AKO02';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'org_invalid: token' using errcode = 'AKO02';
  end if;
  -- Serialise every change to this licence's places.
  perform 1 from public.org_licences x where x.id = l.id for update;
  if l.status <> 'active' or l.ends_at <= now()
     or exists (select 1 from public.organisations o where o.id = l.org_id and o.status in ('suspended','closed')) then
    raise exception 'this licence is not open for invitations' using errcode = 'AKO08';
  end if;
  v_hash := app.org_email_hash(v_email);
  if exists (select 1 from public.org_seat_blocks b where b.org_id = l.org_id and b.email_hash = v_hash) then
    raise exception 'this address asked not to be invited' using errcode = 'AKO09';
  end if;
  if exists (select 1 from public.org_seats s where s.licence_id = l.id and s.released_at is null and s.roster_email = v_email) then
    raise exception 'this address already has a seat' using errcode = 'AKO05';
  end if;
  perform app.org_seat_invite_rate_check(l.org_id);
  -- Three invitations to one address in 30 days, from any organisation.
  select count(*) into n from public.audit_log a
   where a.action = 'org.seat_invited' and a.after ->> 'email_hash' = v_hash and a.at > now() - interval '30 days';
  if n >= 3 then
    raise exception 'this address had three invitations in 30 days' using errcode = 'AKO29';
  end if;

  -- A newer invitation replaces an open one to the same address on this licence.
  update public.org_seat_invitations i set revoked_at = now(), email = null
   where i.licence_id = l.id and i.email_hash = v_hash and i.accepted_at is null and i.declined_at is null and i.revoked_at is null;
  -- Expired invitations give up their address.
  update public.org_seat_invitations i set email = null, revoked_at = now()
   where i.org_id = l.org_id and i.expires_at <= now() and i.accepted_at is null and i.declined_at is null and i.revoked_at is null;

  if app.org_licence_places_used(l.id) >= l.seats_purchased then
    raise exception 'no seats left on this licence' using errcode = 'AKO07';
  end if;

  insert into public.org_seat_invitations (org_id, licence_id, email, email_hash, token_hash, invited_by, expires_at)
  values (l.org_id, l.id, v_email, v_hash, p_token_hash, app.uid(),
          now() + make_interval(days => greatest(1, least(60, app.org_config_int('org_seat_invite_days', 14)))))
  returning id into v_id;

  perform app.audit('org.seat_invited', 'org_seat_invitation:' || v_id::text, null, null, l.org_id, null,
    jsonb_build_object('licence', l.id, 'email_hash', v_hash, 'by_staff', app.is_platform(array['owner','editor'])));
  return v_id;
end $$;

create or replace function app.org_seat_invite_resend(p_invite uuid, p_token_hash text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  i public.org_seat_invitations;
  l public.org_licences;
begin
  select * into i from public.org_seat_invitations x where x.id = p_invite for update;
  if not found or app.uid() is null or not app.org_can_manage_seats(i.org_id) then
    raise exception 'not allowed' using errcode = 'AKO01';
  end if;
  if i.accepted_at is not null or i.declined_at is not null or i.revoked_at is not null or i.email is null then
    raise exception 'this invitation is closed' using errcode = 'AKO08';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'org_invalid: token' using errcode = 'AKO02';
  end if;
  select * into l from public.org_licences x where x.id = i.licence_id for update;
  if l.status <> 'active' or l.ends_at <= now() then
    raise exception 'this licence is not open for invitations' using errcode = 'AKO08';
  end if;
  if i.send_count >= 5 then
    raise exception 'this invitation has been sent five times' using errcode = 'AKO29';
  end if;
  perform app.org_seat_invite_rate_check(i.org_id);
  -- An expired invitation that is sent again needs a free place.
  if i.expires_at <= now() and app.org_licence_places_used(l.id) >= l.seats_purchased then
    raise exception 'no seats left on this licence' using errcode = 'AKO07';
  end if;
  update public.org_seat_invitations x
     set token_hash = p_token_hash, last_sent_at = now(), send_count = x.send_count + 1,
         expires_at = now() + make_interval(days => greatest(1, least(60, app.org_config_int('org_seat_invite_days', 14))))
   where x.id = i.id;
  perform app.audit('org.seat_invite_resent', 'org_seat_invitation:' || i.id::text, null, null, i.org_id, null,
    jsonb_build_object('licence', i.licence_id, 'send_count', i.send_count + 1));
  return i.id;
end $$;

-- Revoking frees the place the invitation held.
create or replace function app.org_seat_invite_revoke(p_invite uuid) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare i public.org_seat_invitations;
begin
  select * into i from public.org_seat_invitations x where x.id = p_invite for update;
  if not found or app.uid() is null or not app.org_can_manage_seats(i.org_id) then
    raise exception 'not allowed' using errcode = 'AKO01';
  end if;
  if i.accepted_at is not null or i.declined_at is not null or i.revoked_at is not null then
    return false;
  end if;
  update public.org_seat_invitations x set revoked_at = now(), email = null where x.id = i.id;
  perform app.audit('org.seat_invite_revoked', 'org_seat_invitation:' || i.id::text, null, null, i.org_id, null,
    jsonb_build_object('licence', i.licence_id));
  return true;
end $$;

-- Anyone holding a link may ask what it is for: the organisation's name and
-- a masked address. Never a title, never the full address.
create or replace function app.org_seat_invite_view(p_token_hash text)
returns table (state text, organisation_name text, organisation_kind text, email_hint text, expires_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  i public.org_seat_invitations;
  l public.org_licences;
  o public.organisations;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return query select 'unknown'::text, null::text, null::text, null::text, null::timestamptz; return;
  end if;
  select * into i from public.org_seat_invitations x where x.token_hash = p_token_hash;
  if not found then
    return query select 'unknown'::text, null::text, null::text, null::text, null::timestamptz; return;
  end if;
  select * into l from public.org_licences x where x.id = i.licence_id;
  select * into o from public.organisations x where x.id = i.org_id;
  return query select
    case when i.accepted_at is not null then 'used'
         when i.declined_at is not null then 'declined'
         when i.revoked_at is not null then 'revoked'
         when i.expires_at <= now() then 'expired'
         when l.status <> 'active' or l.ends_at <= now() or o.status in ('suspended','closed') then 'closed'
         else 'ok' end,
    o.display_name, o.kind, app.mask_email(i.email), i.expires_at;
end $$;

-- Claim a seat. Signed in, a button press, the 18 or over confirmation.
-- The invitation is the organisation's: any signed-in account may claim it
-- with the link, so a member can use the account they already have. The
-- organisation sees the address it invited, never the account's address.
-- Idempotent for the same person: a second claim returns the open seat.
create or replace function app.org_seat_claim(p_token_hash text, p_adult boolean)
returns table (seat_id uuid, org_id uuid, organisation_name text, already boolean)
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid  uuid := app.uid();
  i      public.org_seat_invitations;
  l      public.org_licences;
  v_name text;
  v_seat uuid;
  v_ent  uuid;
begin
  if v_uid is null then
    raise exception 'sign in first' using errcode = 'AKO01';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'unknown link' using errcode = 'AKO04';
  end if;
  if p_adult is not true then
    raise exception 'confirm you are 18 or over' using errcode = 'AKO10';
  end if;
  select * into i from public.org_seat_invitations x where x.token_hash = p_token_hash for update;
  if not found or i.accepted_at is not null or i.declined_at is not null or i.revoked_at is not null or i.expires_at <= now() then
    raise exception 'this link cannot be used' using errcode = 'AKO04';
  end if;
  if exists (select 1 from public.account_deletion_requests d where d.user_id = v_uid and d.cancelled_at is null) then
    raise exception 'this account is scheduled for deletion' using errcode = 'AKO06';
  end if;
  select * into l from public.org_licences x where x.id = i.licence_id for update;
  if l.status <> 'active' or l.ends_at <= now()
     or exists (select 1 from public.organisations o where o.id = l.org_id and o.status in ('suspended','closed')) then
    raise exception 'this licence is not open' using errcode = 'AKO08';
  end if;
  select o.display_name into v_name from public.organisations o where o.id = l.org_id;

  -- One open seat per person per licence.
  select s.id into v_seat from public.org_seats s where s.licence_id = l.id and s.user_id = v_uid and s.released_at is null;
  if v_seat is not null then
    update public.org_seat_invitations x set accepted_at = now(), accepted_by = v_uid, email = null where x.id = i.id;
    perform app.audit('org.seat_claimed', 'org_seat:' || v_seat::text, 'already held', null, l.org_id, null,
      jsonb_build_object('licence', l.id, 'invitation', i.id, 'already', true));
    return query select v_seat, l.org_id, v_name, true;
    return;
  end if;

  -- The invitation holds its own place, so this only fails when a place
  -- was lost some other way (seats lowered by staff before the claim).
  if (select count(*) from public.org_seats s where s.licence_id = l.id and s.released_at is null) >= l.seats_purchased then
    raise exception 'no seats left on this licence' using errcode = 'AKO07';
  end if;

  -- The team_seat entitlement: library wide, named by the licence, in step
  -- with the licence dates. A row from an earlier seat on this licence comes back.
  select e.id into v_ent from public.entitlements e
   where e.user_id = v_uid and e.tenant_id = l.tenant_id and e.workbook_id is null
     and e.source = 'team_seat' and e.org_licence_id = l.id
   for update;
  if v_ent is null then
    insert into public.entitlements (user_id, tenant_id, workbook_id, source, status, starts_at, ends_at, org_licence_id)
    values (v_uid, l.tenant_id, null, 'team_seat', 'active', l.starts_at, l.ends_at, l.id)
    returning id into v_ent;
  else
    update public.entitlements e set status = 'active', starts_at = l.starts_at, ends_at = l.ends_at where e.id = v_ent;
  end if;

  insert into public.org_seats (licence_id, org_id, user_id, invitation_id, entitlement_id, roster_email)
  values (l.id, l.org_id, v_uid, i.id, v_ent, i.email)
  returning id into v_seat;
  update public.org_seat_invitations x set accepted_at = now(), accepted_by = v_uid, email = null where x.id = i.id;
  update public.profiles p set adult_confirmed_at = coalesce(p.adult_confirmed_at, now()) where p.user_id = v_uid;
  insert into public.tenant_members (tenant_id, user_id, role) values (l.tenant_id, v_uid, 'reader') on conflict do nothing;

  perform app.audit('org.seat_claimed', 'org_seat:' || v_seat::text, null, null, l.org_id, null,
    jsonb_build_object('licence', l.id, 'invitation', i.id, 'entitlement', v_ent));
  return query select v_seat, l.org_id, v_name, false;
end $$;

-- Say no. No account needed: the link is the key. The address is not
-- invited again by this organisation.
create or replace function app.org_seat_decline(p_token_hash text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare i public.org_seat_invitations;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return 'unknown';
  end if;
  select * into i from public.org_seat_invitations x where x.token_hash = p_token_hash for update;
  if not found then return 'unknown'; end if;
  if i.declined_at is not null then return 'already'; end if;
  if i.accepted_at is not null or i.revoked_at is not null then return 'closed'; end if;
  update public.org_seat_invitations x set declined_at = now(), email = null where x.id = i.id;
  insert into public.org_seat_blocks (org_id, email_hash) values (i.org_id, i.email_hash) on conflict do nothing;
  perform app.audit('org.seat_declined', 'org_seat_invitation:' || i.id::text, null, null, i.org_id, null,
    jsonb_build_object('licence', i.licence_id));
  return 'declined';
end $$;

-- Release a seat: the organisation's seat managers, staff, or the holder.
-- The person keeps their account and their answers; the work goes read only.
create or replace function app.org_seat_release(p_seat uuid) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  s public.org_seats;
  v_reason text;
begin
  select * into s from public.org_seats x where x.id = p_seat;
  if not found or app.uid() is null then
    raise exception 'not allowed' using errcode = 'AKO01';
  end if;
  v_reason := case
    when s.user_id = app.uid() then 'left'
    when app.org_can(s.org_id, 'seats', 'manage') then 'released_by_organisation'
    when app.is_platform(array['owner','editor']) then 'released_by_staff'
    else null end;
  if v_reason is null then
    raise exception 'not allowed' using errcode = 'AKO01';
  end if;
  return app.org_seat_end(s.id, v_reason);
end $$;

-- An account deletion that completes releases the person's seats.
create or replace function app.org_seats_on_deletion_completed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_seat uuid;
begin
  if new.completed_at is not null and old.completed_at is null then
    for v_seat in select s.id from public.org_seats s where s.user_id = new.user_id and s.released_at is null loop
      perform app.org_seat_end(v_seat, 'account_deleted');
    end loop;
  end if;
  return new;
end $$;
create trigger account_deletion_requests_org_seats after update of completed_at on public.account_deletion_requests
  for each row execute function app.org_seats_on_deletion_completed();

-- ---------------------------------------------------------------------------
-- 7. Console reads (F-204). Counts only.
-- ---------------------------------------------------------------------------

-- Seat counts per licence. people_started counts open seat holders with an
-- enrolment on a title in the licence's scope, begun after they claimed the
-- seat and before the start of this week (Monday, UK time), so the number
-- does not move day by day. It is shown only when it and the number who
-- have not started are both at or above suppression_threshold_owner:
--   exact       people_started holds the count
--   at_least    the count is high but close to everyone; people_started
--               holds a lower bound, a multiple of the threshold
--   fewer_than  fewer than the threshold have started
--   hidden      too few seats to say anything
-- No count here is ever given per person, per title or per day.
create or replace function app.org_seat_summary(p_org uuid)
returns table (licence_id uuid, kind text, title_scope text, title_count int, status text, starts_at timestamptz, ends_at timestamptz,
               seats_purchased int, seats_claimed int, invitations_open int, people_started int, started_shown text,
               counted_until timestamptz, threshold int)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_t     int := greatest(1, app.org_config_int('suppression_threshold_owner', 5));
  v_until timestamptz := (date_trunc('week', now() at time zone 'Europe/London')) at time zone 'Europe/London';
  r       record;
  v_claimed int;
  v_started int;
  v_shown text;
  v_value int;
begin
  if app.uid() is null or p_org is null or not (app.org_can(p_org, 'seats', 'read') or app.is_staff()) then
    raise exception 'not allowed' using errcode = 'AKO01';
  end if;
  for r in select l.* from public.org_licences l where l.org_id = p_org order by l.status = 'ended', l.starts_at desc loop
    select count(*) into v_claimed from public.org_seats s where s.licence_id = r.id and s.released_at is null;
    select count(*) into v_started from public.org_seats s
     where s.licence_id = r.id and s.released_at is null
       and exists (select 1 from public.enrolments e
                   where e.user_id = s.user_id and e.tenant_id = r.tenant_id
                     and e.started_at >= s.claimed_at and e.started_at < v_until
                     and app.org_licence_scope_has(r.id, e.workbook_id));
    if v_claimed < 2 * v_t then
      v_shown := case when v_started < v_t then 'fewer_than' else 'hidden' end;
      v_value := null;
    elsif v_started < v_t then
      v_shown := 'fewer_than'; v_value := null;
    elsif v_claimed - v_started >= v_t then
      v_shown := 'exact'; v_value := v_started;
    else
      v_shown := 'at_least'; v_value := ((v_claimed - v_t) / v_t) * v_t;
    end if;
    return query select r.id, r.kind, r.title_scope,
      (select count(*)::int from public.org_licence_titles t where t.licence_id = r.id),
      r.status, r.starts_at, r.ends_at, r.seats_purchased, v_claimed,
      (select count(*)::int from public.org_seat_invitations i where i.licence_id = r.id and i.accepted_at is null
         and i.declined_at is null and i.revoked_at is null and i.expires_at > now()),
      v_value, v_shown, v_until, v_t;
  end loop;
end $$;

-- The roster: the address the organisation invited and when the seat was
-- taken. Nothing about what the person has done.
create or replace function app.org_seat_roster(p_licence uuid)
returns table (seat_id uuid, roster_email text, claimed_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare l public.org_licences;
begin
  select * into l from public.org_licences x where x.id = p_licence;
  if not found or app.uid() is null or not (app.org_can(l.org_id, 'seats', 'read') or app.is_staff()) then
    raise exception 'not allowed' using errcode = 'AKO01';
  end if;
  return query select s.id, s.roster_email, s.claimed_at from public.org_seats s
    where s.licence_id = l.id and s.released_at is null order by s.claimed_at, s.id;
end $$;

-- For the member: which organisations give them access, and until when.
create or replace function app.my_org_seats()
returns table (seat_id uuid, organisation_name text, ends_at timestamptz, live boolean)
language sql stable security definer set search_path = '' as $$
  select s.id, o.display_name, l.ends_at, app.org_licence_live(l.id)
  from public.org_seats s
  join public.org_licences l on l.id = s.licence_id
  join public.organisations o on o.id = s.org_id
  where s.user_id = app.uid() and s.released_at is null
  order by o.display_name
$$;

-- ---------------------------------------------------------------------------
-- 8. RPC wrappers. Security invoker: the app functions do the checks.
-- ---------------------------------------------------------------------------
create or replace function public.create_customer_organisation(
  p_kind text, p_display_name text, p_legal_name text, p_country text, p_slug text,
  p_size_band text default null, p_sector text default null, p_charity_number text default null, p_vat_number text default null,
  p_billing_name text default null, p_billing_email text default null, p_billing_country text default null
) returns uuid
language sql volatile security invoker set search_path = '' as $$
  select app.create_customer_organisation(p_kind, p_display_name, p_legal_name, p_country, p_slug, p_size_band, p_sector,
    p_charity_number, p_vat_number, p_billing_name, p_billing_email, p_billing_country) $$;
create or replace function public.org_profile_save(
  p_org uuid, p_size_band text, p_sector text, p_charity_number text, p_vat_number text,
  p_billing_name text, p_billing_email text, p_billing_country text
) returns boolean
language sql volatile security invoker set search_path = '' as $$
  select app.org_profile_save(p_org, p_size_band, p_sector, p_charity_number, p_vat_number, p_billing_name, p_billing_email, p_billing_country) $$;
create or replace function public.org_licence_create(
  p_org uuid, p_kind text, p_title_scope text, p_seats int, p_starts_at timestamptz, p_ends_at timestamptz,
  p_invoice_ref text default null, p_titles uuid[] default null
) returns uuid
language sql volatile security invoker set search_path = '' as $$
  select app.org_licence_create(p_org, p_kind, p_title_scope, p_seats, p_starts_at, p_ends_at, p_invoice_ref, p_titles) $$;
create or replace function public.org_licence_update(
  p_licence uuid, p_seats int, p_starts_at timestamptz, p_ends_at timestamptz, p_invoice_ref text, p_status text, p_reason text
) returns text
language sql volatile security invoker set search_path = '' as $$
  select app.org_licence_update(p_licence, p_seats, p_starts_at, p_ends_at, p_invoice_ref, p_status, p_reason) $$;
create or replace function public.org_licence_set_titles(p_licence uuid, p_titles uuid[]) returns int
language sql volatile security invoker set search_path = '' as $$ select app.org_licence_set_titles(p_licence, p_titles) $$;
create or replace function public.org_seat_invite(p_licence uuid, p_email text, p_token_hash text) returns uuid
language sql volatile security invoker set search_path = '' as $$ select app.org_seat_invite(p_licence, p_email, p_token_hash) $$;
create or replace function public.org_seat_invite_resend(p_invite uuid, p_token_hash text) returns uuid
language sql volatile security invoker set search_path = '' as $$ select app.org_seat_invite_resend(p_invite, p_token_hash) $$;
create or replace function public.org_seat_invite_revoke(p_invite uuid) returns boolean
language sql volatile security invoker set search_path = '' as $$ select app.org_seat_invite_revoke(p_invite) $$;
create or replace function public.org_seat_invite_view(p_token_hash text)
returns table (state text, organisation_name text, organisation_kind text, email_hint text, expires_at timestamptz)
language sql stable security invoker set search_path = '' as $$ select * from app.org_seat_invite_view(p_token_hash) $$;
create or replace function public.org_seat_claim(p_token_hash text, p_adult boolean)
returns table (seat_id uuid, org_id uuid, organisation_name text, already boolean)
language sql volatile security invoker set search_path = '' as $$ select * from app.org_seat_claim(p_token_hash, p_adult) $$;
create or replace function public.org_seat_decline(p_token_hash text) returns text
language sql volatile security invoker set search_path = '' as $$ select app.org_seat_decline(p_token_hash) $$;
create or replace function public.org_seat_release(p_seat uuid) returns boolean
language sql volatile security invoker set search_path = '' as $$ select app.org_seat_release(p_seat) $$;
create or replace function public.org_seat_summary(p_org uuid)
returns table (licence_id uuid, kind text, title_scope text, title_count int, status text, starts_at timestamptz, ends_at timestamptz,
               seats_purchased int, seats_claimed int, invitations_open int, people_started int, started_shown text,
               counted_until timestamptz, threshold int)
language sql stable security invoker set search_path = '' as $$ select * from app.org_seat_summary(p_org) $$;
create or replace function public.org_seat_roster(p_licence uuid)
returns table (seat_id uuid, roster_email text, claimed_at timestamptz)
language sql stable security invoker set search_path = '' as $$ select * from app.org_seat_roster(p_licence) $$;
create or replace function public.my_org_seats()
returns table (seat_id uuid, organisation_name text, ends_at timestamptz, live boolean)
language sql stable security invoker set search_path = '' as $$ select * from app.my_org_seats() $$;

-- Execute: revoke from everyone, then give back to the roles that need it.
revoke execute on function
  app.is_customer_kind(text), app.is_customer_org(uuid), app.org_licence_scope_has(uuid, uuid), app.org_licence_live(uuid),
  app.team_seat_covers(uuid, uuid), app.org_email_hash(text), app.org_can_manage_seats(uuid), app.org_config_int(text, int),
  app.org_licence_sync_entitlements(uuid), app.org_seat_end(uuid, text),
  app.org_profile_check(text, text, text, text, text, text, text),
  app.create_customer_organisation(text, text, text, text, text, text, text, text, text, text, text, text),
  app.org_profile_save(uuid, text, text, text, text, text, text, text),
  app.org_licence_set_titles_inner(uuid, uuid[]),
  app.org_licence_create(uuid, text, text, int, timestamptz, timestamptz, text, uuid[]),
  app.org_licence_update(uuid, int, timestamptz, timestamptz, text, text, text),
  app.org_licence_set_titles(uuid, uuid[]), app.org_licence_places_used(uuid), app.org_seat_invite_rate_check(uuid),
  app.org_seat_invite(uuid, text, text), app.org_seat_invite_resend(uuid, text), app.org_seat_invite_revoke(uuid),
  app.org_seat_invite_view(text), app.org_seat_claim(text, boolean), app.org_seat_decline(text), app.org_seat_release(uuid),
  app.org_seats_on_deletion_completed(), app.org_seat_summary(uuid), app.org_seat_roster(uuid), app.my_org_seats()
  from public, anon, authenticated;
revoke execute on function
  public.create_customer_organisation(text, text, text, text, text, text, text, text, text, text, text, text),
  public.org_profile_save(uuid, text, text, text, text, text, text, text),
  public.org_licence_create(uuid, text, text, int, timestamptz, timestamptz, text, uuid[]),
  public.org_licence_update(uuid, int, timestamptz, timestamptz, text, text, text),
  public.org_licence_set_titles(uuid, uuid[]),
  public.org_seat_invite(uuid, text, text), public.org_seat_invite_resend(uuid, text), public.org_seat_invite_revoke(uuid),
  public.org_seat_invite_view(text), public.org_seat_claim(text, boolean), public.org_seat_decline(text), public.org_seat_release(uuid),
  public.org_seat_summary(uuid), public.org_seat_roster(uuid), public.my_org_seats()
  from public, anon, authenticated;

-- has_entitlement is security definer, so it calls these helpers as its
-- owner; no client role needs them. The server may.
grant execute on function app.team_seat_covers(uuid, uuid), app.org_licence_live(uuid), app.org_licence_scope_has(uuid, uuid)
  to service_role;
-- Anyone holding an invitation link may ask what it is for, or say no.
grant execute on function app.org_seat_invite_view(text), public.org_seat_invite_view(text),
  app.org_seat_decline(text), public.org_seat_decline(text) to anon, authenticated, service_role;
-- Signed-in callers. Each function checks the caller's role itself.
grant execute on function
  app.create_customer_organisation(text, text, text, text, text, text, text, text, text, text, text, text),
  app.org_profile_save(uuid, text, text, text, text, text, text, text),
  app.org_licence_create(uuid, text, text, int, timestamptz, timestamptz, text, uuid[]),
  app.org_licence_update(uuid, int, timestamptz, timestamptz, text, text, text),
  app.org_licence_set_titles(uuid, uuid[]),
  app.org_seat_invite(uuid, text, text), app.org_seat_invite_resend(uuid, text), app.org_seat_invite_revoke(uuid),
  app.org_seat_claim(text, boolean), app.org_seat_release(uuid),
  app.org_seat_summary(uuid), app.org_seat_roster(uuid), app.my_org_seats(),
  public.create_customer_organisation(text, text, text, text, text, text, text, text, text, text, text, text),
  public.org_profile_save(uuid, text, text, text, text, text, text, text),
  public.org_licence_create(uuid, text, text, int, timestamptz, timestamptz, text, uuid[]),
  public.org_licence_update(uuid, int, timestamptz, timestamptz, text, text, text),
  public.org_licence_set_titles(uuid, uuid[]),
  public.org_seat_invite(uuid, text, text), public.org_seat_invite_resend(uuid, text), public.org_seat_invite_revoke(uuid),
  public.org_seat_claim(text, boolean), public.org_seat_release(uuid),
  public.org_seat_summary(uuid), public.org_seat_roster(uuid), public.my_org_seats()
  to authenticated;
-- Policies call these.
grant execute on function app.is_customer_org(uuid), app.is_customer_kind(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. Row level security. Reads only; every write goes through a function.
-- ---------------------------------------------------------------------------
alter table public.org_profiles         enable row level security;
alter table public.org_licences         enable row level security;
alter table public.org_licence_titles   enable row level security;
alter table public.org_seat_invitations enable row level security;
alter table public.org_seats            enable row level security;
alter table public.org_seat_blocks      enable row level security;

revoke all on public.org_profiles, public.org_licences, public.org_licence_titles, public.org_seat_invitations,
  public.org_seats, public.org_seat_blocks from anon, authenticated;

-- org_profiles: the organisation's billing roles, and staff.
grant select on public.org_profiles to authenticated;
create policy org_profiles_read on public.org_profiles for select to authenticated
  using ((select app.org_can(org_id, 'billing', 'read')) or (select app.is_staff()));

-- org_licences and their titles: whoever reads seats in that organisation, and staff.
grant select on public.org_licences to authenticated;
create policy org_licences_read on public.org_licences for select to authenticated
  using ((select app.org_can(org_id, 'seats', 'read')) or (select app.is_staff()));
grant select on public.org_licence_titles to authenticated;
create policy org_licence_titles_read on public.org_licence_titles for select to authenticated
  using (exists (select 1 from public.org_licences l where l.id = licence_id
                 and ((select app.org_can(l.org_id, 'seats', 'read')) or (select app.is_staff()))));

-- org_seat_invitations: seat managers and staff. Never the token or address hash.
grant select (id, org_id, licence_id, email, invited_by, created_at, last_sent_at, send_count, expires_at,
              accepted_at, declined_at, revoked_at)
  on public.org_seat_invitations to authenticated;
create policy org_seat_invitations_read on public.org_seat_invitations for select to authenticated
  using ((select app.org_can(org_id, 'seats', 'manage')) or (select app.is_staff()));

-- org_seats: the organisation's seat readers, staff, and the holder's own rows.
grant select (id, licence_id, org_id, user_id, roster_email, claimed_at, released_at, released_reason)
  on public.org_seats to authenticated;
create policy org_seats_read on public.org_seats for select to authenticated
  using (user_id = (select app.uid()) or (select app.org_can(org_id, 'seats', 'read')) or (select app.is_staff()));

-- org_seat_blocks: no client reads.

grant select, insert, update, delete on public.org_profiles, public.org_licences, public.org_licence_titles,
  public.org_seat_invitations, public.org_seats, public.org_seat_blocks to service_role;
