-- 0014 Payouts and private storage: Connect Express onboarding (F-099),
-- private files for manuscripts and signed licences (F-135), and payee
-- sign-in hardening (F-143).
--
-- Same rules as 0001 to 0012, and this file depends on nothing after 0012.
-- Functions are security definer with search_path pinned to ''. Every
-- function an RPC client may call has execute revoked from public first and
-- granted back to the one role that needs it. Nothing earlier is edited.
--
-- Error codes (the app maps these to plain messages):
--   AKY01  not allowed (wrong role, not signed in, or not the service role)
--   AKY02  a field failed validation (the message names the field)
--   AKY03  step-up needed: verify your authenticator code again first
--   AKY04  the organisation does not need or cannot have Connect payouts
--   AKY10  a paid workbook cannot go live until payouts are verified
--   AKY29  rate limited
--
-- What is stored about a Connect account: its id and the derived capability
-- status (not_started, pending, verified, action_needed, held). Bank details,
-- identity documents and the rest stay in Stripe.

-- ---------------------------------------------------------------------------
-- 1. Organisation payout columns are written by the functions below only.
--
-- organisations_update (0001) lets an owner update the row, and the grant is
-- table wide, so without this an owner could mark their own account verified
-- or swap the Connect id. The guard runs as the caller, so the security
-- definer functions here (which run as the owner) pass, as does server code
-- on the service role.
-- ---------------------------------------------------------------------------
alter table public.organisations add column connect_synced_at timestamptz;

create or replace function app.guard_payout_columns() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated') and (
       new.stripe_connect_id  is distinct from old.stripe_connect_id
    or new.connect_status     is distinct from old.connect_status
    or new.connect_synced_at  is distinct from old.connect_synced_at
    or new.tax_residence      is distinct from old.tax_residence
    or new.treaty_declaration is distinct from old.treaty_declaration) then
    raise exception 'payout details change only through the payout functions' using errcode = 'AKY01';
  end if;
  return new;
end $$;
create trigger organisations_payout_guard before update on public.organisations
  for each row execute function app.guard_payout_columns();

-- ---------------------------------------------------------------------------
-- 2. Step-up (F-143).
--
-- Payout changes need a second factor checked a few minutes ago, not just a
-- session that once reached aal2. Supabase Auth puts the methods used in the
-- token's amr claim with the time each was last verified, and verifying a
-- fresh TOTP challenge moves that time forward. Default window 10 minutes.
-- The app checks the same thing before it calls Stripe (lib/payouts/step-up.ts).
-- ---------------------------------------------------------------------------
create or replace function app.recent_step_up(p_max_age_seconds int default 600) returns boolean
language sql stable security definer set search_path = '' as $$
  with c as (select coalesce(current_setting('request.jwt.claims', true), '{}')::jsonb as j)
  select coalesce((
    select (c.j ->> 'aal') = 'aal2' and exists (
      select 1 from jsonb_array_elements(case when jsonb_typeof(c.j -> 'amr') = 'array' then c.j -> 'amr' else '[]'::jsonb end) e
      where e ->> 'method' = 'totp'
        and (e ->> 'timestamp') ~ '^[0-9]{1,12}$'
        and (e ->> 'timestamp')::bigint >= extract(epoch from now())::bigint - greatest(p_max_age_seconds, 0))
    from c), false)
$$;
revoke execute on function app.recent_step_up(int) from public, anon;
grant execute on function app.recent_step_up(int) to authenticated, service_role;

-- Self-serve cross-border payouts from a UK platform: the UK, the EEA, the
-- US, Canada and Switzerland (research_money.md). Anyone else is held.
create or replace function app.payout_country_supported(p_country text) returns boolean
language sql immutable set search_path = '' as $$
  select upper(coalesce(p_country, '')) = any (array[
    'GB','US','CA','CH',
    'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL',
    'PL','PT','RO','SK','SI','ES','SE','IS','LI','NO'])
$$;
grant execute on function app.payout_country_supported(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Starting a payout change (F-099, F-143).
--
-- Called with the user's own client before the app creates a Connect account
-- or an account link. Owner or finance of the organisation only, with a
-- recent step-up. At most 10 a day per organisation. Writes an audit row.
-- An organisation outside the self-serve list is set to held and nothing
-- goes to Stripe; the page tells them plainly.
-- ---------------------------------------------------------------------------
create or replace function public.begin_payout_change(p_org uuid)
returns table (org_id uuid, kind text, country text, stripe_connect_id text, connect_status text)
language plpgsql volatile security definer set search_path = '' as $$
declare
  o        public.organisations%rowtype;
  v_recent int;
begin
  if app.uid() is null or p_org is null or not app.org_can(p_org, 'payouts', 'manage') then
    raise exception 'only the owner or finance contact of this organisation can change payouts' using errcode = 'AKY01';
  end if;
  select * into o from public.organisations where id = p_org for update;
  if not found then
    raise exception 'organisation not found' using errcode = 'AKY01';
  end if;
  if o.kind = 'akana_house' or o.is_demo then
    raise exception 'this organisation is not paid through Connect' using errcode = 'AKY04';
  end if;
  if o.status not in ('invited', 'active') then
    raise exception 'this organisation is %', o.status using errcode = 'AKY04';
  end if;
  if not app.recent_step_up() then
    raise exception 'verify your authenticator code again first' using errcode = 'AKY03';
  end if;
  if o.country is null then
    raise exception 'payout_invalid: country' using errcode = 'AKY02';
  end if;

  select count(*) into v_recent from public.audit_log a
   where a.org_id = p_org and a.action = 'payout.change_started' and a.at > now() - interval '1 day';
  if v_recent >= 10 then
    raise exception 'rate_limited: too many payout changes today, try again tomorrow' using errcode = 'AKY29';
  end if;

  if not app.payout_country_supported(o.country) and o.connect_status <> 'held' then
    update public.organisations set connect_status = 'held', connect_synced_at = now() where id = p_org;
    perform app.audit('payout.held', 'organisation:' || p_org::text, 'country outside self-serve payouts', null, p_org,
      jsonb_build_object('connect_status', o.connect_status), jsonb_build_object('connect_status', 'held', 'country', o.country));
    o.connect_status := 'held';
  end if;

  perform app.audit('payout.change_started', 'organisation:' || p_org::text, null, null, p_org,
    jsonb_build_object('connect_status', o.connect_status, 'has_account', o.stripe_connect_id is not null), null);

  return query select o.id, o.kind, o.country::text, o.stripe_connect_id, o.connect_status;
end $$;
revoke execute on function public.begin_payout_change(uuid) from public, anon;
grant execute on function public.begin_payout_change(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Tax residence and treaty declaration (F-099), behind step-up (F-143).
--
-- The declaration is stored as a small versioned record with who made it and
-- when. Changing it later is a payout change: audited, and the app emails the
-- owner and finance contacts.
-- ---------------------------------------------------------------------------
create or replace function public.set_payout_tax_details(p_org uuid, p_tax_residence text, p_treaty_claimed boolean)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  o       public.organisations%rowtype;
  v_res   text := upper(btrim(coalesce(p_tax_residence, '')));
  v_decl  jsonb;
begin
  if app.uid() is null or p_org is null or not app.org_can(p_org, 'payouts', 'manage') then
    raise exception 'only the owner or finance contact of this organisation can change payouts' using errcode = 'AKY01';
  end if;
  if v_res !~ '^[A-Z]{2}$' then
    raise exception 'payout_invalid: tax_residence' using errcode = 'AKY02';
  end if;
  if p_treaty_claimed is null then
    raise exception 'payout_invalid: treaty_claimed' using errcode = 'AKY02';
  end if;
  select * into o from public.organisations where id = p_org for update;
  if not found then
    raise exception 'organisation not found' using errcode = 'AKY01';
  end if;
  if o.kind = 'akana_house' then
    raise exception 'this organisation is not paid through Connect' using errcode = 'AKY04';
  end if;
  if not app.recent_step_up() then
    raise exception 'verify your authenticator code again first' using errcode = 'AKY03';
  end if;

  v_decl := jsonb_build_object('version', 'treaty-2026-10', 'claimed', p_treaty_claimed, 'residence', v_res,
                               'declared_at', now(), 'declared_by', app.uid());
  update public.organisations set tax_residence = v_res, treaty_declaration = v_decl where id = p_org;

  perform app.audit('payout.tax_details_changed', 'organisation:' || p_org::text, null, null, p_org,
    jsonb_build_object('tax_residence', o.tax_residence, 'treaty_claimed', o.treaty_declaration -> 'claimed'),
    jsonb_build_object('tax_residence', v_res, 'treaty_claimed', p_treaty_claimed));
end $$;
revoke execute on function public.set_payout_tax_details(uuid, text, boolean) from public, anon;
grant execute on function public.set_payout_tax_details(uuid, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Service role: link the Connect account, and keep its status in step.
-- ---------------------------------------------------------------------------
create or replace function public.record_connect_account(p_org uuid, p_account text)
returns text
language plpgsql volatile security definer set search_path = '' as $$
declare o public.organisations%rowtype;
begin
  if not app.is_service_role() then
    raise exception 'only the service role links a Connect account' using errcode = 'AKY01';
  end if;
  if p_account is null or p_account !~ '^acct_[A-Za-z0-9]{6,64}$' then
    raise exception 'payout_invalid: account' using errcode = 'AKY02';
  end if;
  select * into o from public.organisations where id = p_org for update;
  if not found then
    raise exception 'organisation not found' using errcode = 'AKY01';
  end if;
  if o.stripe_connect_id = p_account then
    return 'unchanged';
  end if;
  if o.stripe_connect_id is not null then
    raise exception 'this organisation already has a Connect account' using errcode = 'AKY04';
  end if;
  update public.organisations
     set stripe_connect_id = p_account,
         connect_status = case when connect_status = 'held' then 'held' else 'action_needed' end,
         -- cleared, so the first account.updated is never taken as stale
         connect_synced_at = null
   where id = p_org;
  perform app.audit('payout.account_linked', 'organisation:' || p_org::text, null, null, p_org,
    jsonb_build_object('connect_status', o.connect_status), jsonb_build_object('has_account', true));
  return 'linked';
end $$;
revoke execute on function public.record_connect_account(uuid, text) from public, anon, authenticated;
grant execute on function public.record_connect_account(uuid, text) to service_role;

-- A held organisation stays held whatever Stripe says: a hold is lifted by
-- staff (F-103), never by a webhook. Older observations are ignored, so
-- events that arrive out of order change nothing.
create or replace function public.sync_connect_status(p_account text, p_status text, p_observed_at timestamptz)
returns table (result text, org_id uuid, previous_status text, new_status text)
language plpgsql volatile security definer set search_path = '' as $$
declare
  o     public.organisations%rowtype;
  v_new text;
begin
  if not app.is_service_role() then
    raise exception 'only the service role syncs Connect status' using errcode = 'AKY01';
  end if;
  if p_status is null or p_status not in ('pending','verified','action_needed') then
    raise exception 'payout_invalid: status' using errcode = 'AKY02';
  end if;
  if p_observed_at is null then
    raise exception 'payout_invalid: observed_at' using errcode = 'AKY02';
  end if;
  select * into o from public.organisations where stripe_connect_id = p_account for update;
  if not found then
    return query select 'unlinked'::text, null::uuid, null::text, null::text;
    return;
  end if;
  if o.connect_synced_at is not null and p_observed_at < o.connect_synced_at then
    return query select 'stale'::text, o.id, o.connect_status, o.connect_status;
    return;
  end if;
  v_new := case when o.connect_status = 'held' then 'held' else p_status end;
  update public.organisations set connect_status = v_new, connect_synced_at = p_observed_at where id = o.id;
  if v_new is distinct from o.connect_status then
    perform app.audit('payout.status_changed', 'organisation:' || o.id::text, null, null, o.id,
      jsonb_build_object('connect_status', o.connect_status), jsonb_build_object('connect_status', v_new));
    return query select 'applied'::text, o.id, o.connect_status, v_new;
  else
    return query select 'unchanged'::text, o.id, o.connect_status, v_new;
  end if;
end $$;
revoke execute on function public.sync_connect_status(text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.sync_connect_status(text, text, timestamptz) to service_role;

-- A bank account or card for payouts was added, changed or removed in
-- Stripe. Audited here; the app emails the owner and finance contacts.
create or replace function public.note_payout_details_changed(p_account text, p_change text, p_event text)
returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v_org uuid;
begin
  if not app.is_service_role() then
    raise exception 'only the service role records payout detail changes' using errcode = 'AKY01';
  end if;
  if p_change is null or p_change not in ('created','updated','deleted') then
    raise exception 'payout_invalid: change' using errcode = 'AKY02';
  end if;
  select o.id into v_org from public.organisations o where o.stripe_connect_id = p_account;
  if v_org is null then return null; end if;
  if p_event is not null and exists (
       select 1 from public.audit_log a where a.org_id = v_org and a.action = 'payout.details_changed' and a.after ->> 'event' = p_event) then
    return v_org;
  end if;
  perform app.audit('payout.details_changed', 'organisation:' || v_org::text, null, null, v_org, null,
    jsonb_build_object('change', p_change, 'event', p_event));
  return v_org;
end $$;
revoke execute on function public.note_payout_details_changed(text, text, text) from public, anon, authenticated;
grant execute on function public.note_payout_details_changed(text, text, text) to service_role;

-- Who to tell about a payout change: the organisation's owners and finance
-- contacts. Service role only; addresses never reach a client.
create or replace function public.payout_contacts(p_org uuid)
returns table (user_id uuid, email text, role text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_service_role() then
    raise exception 'only the service role reads payout contacts' using errcode = 'AKY01';
  end if;
  return query
    select m.user_id, u.email::text, m.role
    from public.org_members m join auth.users u on u.id = m.user_id
    where m.org_id = p_org and m.role in ('owner','finance') and u.email is not null
    order by m.role, m.created_at;
end $$;
revoke execute on function public.payout_contacts(uuid) from public, anon, authenticated;
grant execute on function public.payout_contacts(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Paid workbooks wait for verified payouts (F-099).
--
-- Moving a workbook to live from draft, in review or approved needs its
-- organisation's Connect status to be verified. Akana-owned titles, demo
-- titles and public-domain titles are exempt. Resuming a paused title is not
-- blocked: the kill switch stays a kill switch, and payout holds (F-103)
-- deal with money. Applies to every caller, staff included. Named so it
-- fires after workbooks_status_guard.
-- ---------------------------------------------------------------------------
create or replace function app.guard_workbook_payout_ready() returns trigger
language plpgsql security definer set search_path = '' as $$
declare o public.organisations%rowtype;
begin
  if new.status = 'live' and old.status in ('draft','in_review','approved')
     and not new.is_demo and new.badge <> 'public_domain' then
    select * into o from public.organisations where id = new.org_id;
    if o.kind <> 'akana_house' and not o.is_demo and o.connect_status <> 'verified' then
      raise exception 'payouts for this organisation are not verified yet, so % cannot go live', new.code using errcode = 'AKY10';
    end if;
  end if;
  return new;
end $$;
create trigger workbooks_status_payout_gate before update of status on public.workbooks
  for each row execute function app.guard_workbook_payout_ready();

-- ---------------------------------------------------------------------------
-- 7. Private files (F-135).
--
-- One private bucket, org-files. Paths are fixed:
--   <organisation id>/manuscripts/<uuid>.(pdf|docx|epub)
--   <organisation id>/licences/<uuid>.pdf
-- The bucket is not public, files are 25 MB at most, and only PDF, Word and
-- EPUB types are accepted. Read: members of the owning organisation with the
-- matching read permission, and Akana staff. Write: owners and editors for
-- manuscripts (authors too), owners for licences, and platform owners and
-- editors. No client updates or deletes: a file is a record. At most 30
-- uploads an hour per organisation. Downloads use signed URLs that the app
-- makes for 60 seconds, which Storage only signs when this read policy
-- allows it.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('org-files', 'org-files', false, 26214400, array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/epub+zip'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- The organisation a path belongs to, or null when the path is not one of ours.
create or replace function app.org_file_org(p_name text) returns uuid
language sql immutable set search_path = '' as $$
  select case when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(manuscripts|licences)/[^/]+$'
              then split_part(p_name, '/', 1)::uuid end
$$;

-- Is this a well-formed name for a new file?
create or replace function app.org_file_name_ok(p_name text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(
    p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/manuscripts/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|docx|epub)$'
    or p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/licences/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$',
    false)
$$;

create or replace function app.org_file_can(p_name text, p_action text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_org  uuid := app.org_file_org(p_name);
  v_kind text := split_part(coalesce(p_name, ''), '/', 2);
  v_n    int;
begin
  if v_org is null or app.uid() is null then return false; end if;
  if p_action = 'read' then
    if app.is_staff() then return true; end if;
    if v_kind = 'manuscripts' then
      return app.org_can(v_org, 'books', 'read') or app.org_can(v_org, 'workbooks', 'write');
    end if;
    return app.org_can(v_org, 'licences', 'read');
  end if;
  if p_action = 'write' then
    if not app.org_file_name_ok(p_name) then return false; end if;
    if not (app.is_platform(array['owner','editor'])
            or (v_kind = 'manuscripts' and (app.org_can(v_org, 'books', 'write') or app.org_can(v_org, 'workbooks', 'write')))
            or (v_kind = 'licences' and app.org_can(v_org, 'licences', 'write'))) then
      return false;
    end if;
    select count(*) into v_n from storage.objects so
     where so.bucket_id = 'org-files' and so.name like v_org::text || '/%' and so.created_at > now() - interval '1 hour';
    return v_n < 30;
  end if;
  return false;
end $$;
revoke execute on function app.org_file_can(text, text) from public, anon;
grant execute on function app.org_file_can(text, text) to authenticated;

create policy org_files_read on storage.objects for select to authenticated
  using (bucket_id = 'org-files' and (select app.org_file_can(name, 'read')));
create policy org_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'org-files' and (select app.org_file_can(name, 'write')));

-- An audit row when a file is uploaded or a download link is made. The
-- caller must be able to read the file. Staff reads are logged this way.
create or replace function public.note_private_file(p_name text, p_action text)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_org uuid := app.org_file_org(p_name);
begin
  if p_action is null or p_action not in ('uploaded','download_link') then
    raise exception 'file_invalid: action' using errcode = 'AKY02';
  end if;
  if v_org is null or not app.org_file_can(p_name, 'read') then
    raise exception 'not allowed' using errcode = 'AKY01';
  end if;
  perform app.audit('file.' || p_action, 'file:org-files/' || p_name, null, null, v_org, null,
    jsonb_build_object('kind', split_part(p_name, '/', 2)));
end $$;
revoke execute on function public.note_private_file(text, text) from public, anon;
grant execute on function public.note_private_file(text, text) to authenticated;
