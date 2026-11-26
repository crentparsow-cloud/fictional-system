-- 0076 Privacy fixes from the November 2026 review (M17, M18, M20, M21, L12).
--
-- Same rules as every migration here: RLS on, grants revoked then given back
-- narrowly, helpers security definer with search_path pinned. Safe to run
-- twice. Nothing in 0001 to 0072 is edited, and nothing here needs 0073.
--
-- 1. Private keys. Two random values made here and held in app.private_keys,
--    a table no API role can read. One salts the hash of a suppressed email
--    address. One keys the hash that stands in for a deleted reader's id in
--    the consent history.
-- 2. M17. Bounces and complaints. email_webhook_events holds each provider
--    event id once, so a replay does nothing. email_suppressions holds a
--    salted hash of the address, the reason and the date. No address is
--    stored. Service role only. A bounce or a complaint also unsubscribes
--    that address from the newsletter. Suppressions are kept until staff
--    remove one: there is no period for them, on purpose.
-- 3. M18. Erasure was blocked by "who did this" foreign keys to auth.users
--    with no delete action. Found with:
--      select c.conrelid::regclass, a.attname, c.conname
--        from pg_constraint c
--        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
--       where c.contype = 'f' and c.confrelid = 'auth.users'::regclass and c.confdeltype in ('a', 'r');
--    All seventeen become on delete set null. Each key is replaced only if
--    it still has no delete action, added NOT VALID and then validated, so
--    the strong lock is held for an instant and a second run does nothing:
--      org_members.invited_by (0001), platform_roles.granted_by (0001),
--      feature_flags.updated_by (0001), authors.bio_reviewed_by (0002),
--      workbook_versions.author_approved_by, editor_approved_by and
--      safety_approved_by (0002), book_rights.updated_by (0013),
--      org_invitations.invited_by (0013), licence_texts.approved_by (0013),
--      licences.verified_by (0013), workbook_submissions.submitted_by and
--      status_changed_by (0013), submission_files.uploaded_by (0013),
--      release_overrides.requested_by and approved_by (0016),
--      demo_accounts.added_by (0029).
--    Only release_overrides.requested_by was not null; it becomes nullable.
--    release_overrides_approved said approved_by and approved_at are set
--    together. An erased approver would break it and block the erasure, so
--    it now says: an approver needs an approval time. An override whose
--    approver has been erased reads as not approved and cannot be used.
--    None of these rows is the deleted person's own data: each is an
--    organisation or platform record that only noted who acted. The record
--    stays and the name goes. A second query found no table that cascades
--    from auth.users and is itself the target of a key with no delete action.
--
--    Files. The org-files bucket holds an organisation's manuscripts and
--    signed licences. The rule decided here:
--      * A manuscript the deleted person uploaded is THEIRS, and is removed,
--        when they are the only member of the organisation and the workbook
--        it was sent for has never been published (not live, paused or
--        retired). That is a lone author's own unpublished writing.
--      * A file in the bucket that they uploaded and that no submission and
--        no licence points at is an abandoned upload, and is removed.
--      * Everything else is the organisation's record (a manuscript behind a
--        published workbook, a file of an organisation that still has other
--        members, a signed licence, which is the proof of rights). It stays,
--        and the link to the uploader is cleared.
--    SQL cannot delete a stored file safely, so the paths go into
--    storage_erasure_queue (no user id in it) and the nightly job
--    (/api/account/complete) removes them through the Storage API and marks
--    them done. A failed removal is tried again the next night.
--    All of this runs from a trigger when a deletion request is completed,
--    in the same transaction, so app.complete_due_deletions() is not edited.
-- 4. M20. consent_history: one row for every time health or faith consent is
--    given or withdrawn, written by a trigger on the profiles columns from
--    0006 and 0015. The owner can read their rows. Nobody can change one.
--    The privacy notice (section 6) says consent records are kept for 6
--    years after the account is deleted. So when the auth user goes, the row
--    stays, the user id is replaced by a keyed hash and the date is stamped.
--    The retention prune removes it 6 years after that date.
--    This is independent of health_consent_withdrawals (an unmerged branch).
-- 5. M21. retention_periods holds the periods as rows. app.prune_retention()
--    applies them and returns counts only. The nightly sweep calls it.
--    THE PERIODS ARE CONSERVATIVE DEFAULTS. THE OWNER AND THE SOLICITOR MUST
--    CONFIRM THEM. A null period switches that prune off. Two start null,
--    because a record a law or a contract may need must not be pruned on a
--    guess: the audit log (the organisation terms say audit records are kept
--    for 7 years; the privacy notice says security logs are kept for 90
--    days) and takedown notices (a legal record; when a period is set they
--    are redacted, not deleted, because the takedown record points at them).
--    The audit period, once set, covers ordinary entries only (RX-3 below).
--    The prune never touches answers, purchases, entitlements, any ledger,
--    payouts, invoices or terms acceptances.
-- 6. L12. The newsletter token and the gift claim token were stored in plain
--    form. From here only a SHA-256 hash is stored and every lookup is by
--    hash. Existing values are hashed in place, so links already sent keep
--    working. The plain columns are emptied and no longer written. They are
--    kept for one release so the previous build still runs against this
--    schema if a rollback is needed. Drop them in a later migration.
--
-- Changed on 26 November 2026 after the retest, before this was applied
-- anywhere:
--   RX-2. Erasing an account removes an organisation's file only when that
--         person is or was a member of the organisation. A file uploaded by
--         someone who was never a member (a staff upload) always stays.
--   RX-3. The general audit period prunes ordinary entries only. Money,
--         commerce, payout, royalty, refund, tax, consent, deletion and
--         staff-privilege entries are never pruned by it, and neither is any
--         action this file does not know. A legal hold (public.legal_hold)
--         stops every prune while it is set.
--   RX-4. consent_history cannot be truncated by anyone, and the service
--         role holds select on it and nothing else.

-- ---------------------------------------------------------------------------
-- 1. Private keys
-- ---------------------------------------------------------------------------
create table if not exists app.private_keys (
  name       text primary key check (name ~ '^[a-z_]{1,40}$'),
  key        bytea not null check (octet_length(key) = 32),
  created_at timestamptz not null default now()
);
alter table app.private_keys enable row level security;
revoke all on app.private_keys from public, anon, authenticated, service_role;

insert into app.private_keys (name, key)
select k, sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8'))
  from unnest(array['email_suppression', 'consent_subject']) as k
on conflict (name) do nothing;

create or replace function app.keyed_hash(p_name text, p_value text) returns text
language sql stable security definer set search_path = '' as $$
  select encode(sha256(k.key || convert_to(p_value, 'UTF8') || k.key), 'hex')
    from app.private_keys k where k.name = p_name
$$;
revoke execute on function app.keyed_hash(text, text) from public, anon, authenticated, service_role;

-- Plain SHA-256 for tokens is app.sha256_hex(text) from 0068.

-- ---------------------------------------------------------------------------
-- 2. M17: provider events and suppressed addresses
-- ---------------------------------------------------------------------------
create table if not exists public.email_webhook_events (
  event_id    text primary key check (char_length(event_id) between 1 and 200),
  type        text not null check (char_length(type) between 1 and 80),
  received_at timestamptz not null default now()
);
create index if not exists email_webhook_events_received_idx on public.email_webhook_events(received_at);
alter table public.email_webhook_events enable row level security;
revoke all on public.email_webhook_events from public, anon, authenticated;
grant select, insert, delete on public.email_webhook_events to service_role;

-- reason: bounced (a hard bounce) or complained (marked as spam).
create table if not exists public.email_suppressions (
  address_hash text not null check (address_hash ~ '^[0-9a-f]{64}$'),
  reason       text not null check (reason in ('bounced', 'complained')),
  created_at   timestamptz not null default now(),
  primary key (address_hash, reason)
);
alter table public.email_suppressions enable row level security;
revoke all on public.email_suppressions from public, anon, authenticated;
grant select, insert, delete on public.email_suppressions to service_role;

create or replace function app.email_address_hash(p_email text) returns text
language sql stable security definer set search_path = '' as $$
  select app.keyed_hash('email_suppression', lower(btrim(p_email)))
$$;
revoke execute on function app.email_address_hash(text) from public, anon, authenticated, service_role;

-- One call per provider event. Returns 'recorded' the first time and 'replay'
-- after that. p_reason null records the event and suppresses nobody.
create or replace function public.email_webhook_record(p_event_id text, p_type text, p_reason text, p_addresses text[])
returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_address text;
begin
  if not (select app.is_service_role()) then
    raise exception 'only the service role records email events' using errcode = 'insufficient_privilege';
  end if;
  if p_event_id is null or char_length(p_event_id) not between 1 and 200 or p_type is null or char_length(p_type) not between 1 and 80 then
    raise exception 'email event not valid' using errcode = 'invalid_parameter_value';
  end if;
  if p_reason is not null and p_reason not in ('bounced', 'complained') then
    raise exception 'email event reason not valid' using errcode = 'invalid_parameter_value';
  end if;
  insert into public.email_webhook_events (event_id, type) values (p_event_id, p_type) on conflict (event_id) do nothing;
  if not found then return 'replay'; end if;
  if p_reason is not null then
    foreach v_address in array coalesce(p_addresses, '{}'::text[]) loop
      if v_address is not null and btrim(v_address) <> '' and char_length(v_address) <= 254 then
        insert into public.email_suppressions (address_hash, reason)
        values (app.email_address_hash(v_address), p_reason)
        on conflict (address_hash, reason) do nothing;
        -- They do not get the newsletter again unless they confirm a new sign-up.
        update public.newsletter_subscribers
           set status = 'unsubscribed', unsubscribed_at = coalesce(unsubscribed_at, now())
         where email = lower(btrim(v_address))::extensions.citext and status <> 'unsubscribed';
      end if;
    end loop;
  end if;
  return 'recorded';
end $$;

-- Why an address is suppressed, if it is. The mailer and the export call this.
create or replace function public.email_suppression_state(p_email text)
returns table (reason text, since timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select app.is_service_role()) then
    raise exception 'only the service role reads suppressions' using errcode = 'insufficient_privilege';
  end if;
  if p_email is null or btrim(p_email) = '' then return; end if;
  return query
    select s.reason, s.created_at from public.email_suppressions s
     where s.address_hash = app.email_address_hash(p_email)
     order by s.created_at;
end $$;

revoke execute on function public.email_webhook_record(text, text, text, text[]), public.email_suppression_state(text)
  from public, anon, authenticated;
grant execute on function public.email_webhook_record(text, text, text, text[]), public.email_suppression_state(text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 3. M18: foreign keys that blocked erasure
-- ---------------------------------------------------------------------------
alter table public.release_overrides alter column requested_by drop not null;

-- An approver needs an approval time. An approval time may outlive the approver.
alter table public.release_overrides drop constraint if exists release_overrides_approved;
alter table public.release_overrides add constraint release_overrides_approved
  check (approved_by is null or approved_at is not null);

do $$
declare
  r record;
  c record;
begin
  for r in
    select * from (values
      ('org_members', 'invited_by'),
      ('platform_roles', 'granted_by'),
      ('feature_flags', 'updated_by'),
      ('authors', 'bio_reviewed_by'),
      ('workbook_versions', 'author_approved_by'),
      ('workbook_versions', 'editor_approved_by'),
      ('workbook_versions', 'safety_approved_by'),
      ('book_rights', 'updated_by'),
      ('org_invitations', 'invited_by'),
      ('licence_texts', 'approved_by'),
      ('licences', 'verified_by'),
      ('workbook_submissions', 'submitted_by'),
      ('workbook_submissions', 'status_changed_by'),
      ('submission_files', 'uploaded_by'),
      ('release_overrides', 'requested_by'),
      ('release_overrides', 'approved_by'),
      ('demo_accounts', 'added_by')
    ) as t(tbl, col)
  loop
    -- Only a key that still has no delete action. Found by column, not by
    -- name, so a renamed constraint is handled and a second run does nothing.
    for c in
      select k.conname
        from pg_constraint k
        join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
       where k.contype = 'f' and k.conrelid = format('public.%I', r.tbl)::regclass
         and k.confrelid = 'auth.users'::regclass and cardinality(k.conkey) = 1
         and a.attname = r.col and k.confdeltype in ('a', 'r')
    loop
      execute format('alter table public.%I drop constraint %I', r.tbl, c.conname);
      -- NOT VALID, then validate: the rows were already checked by the old
      -- key, and validating takes only a light lock.
      execute format('alter table public.%I add constraint %I foreign key (%I) references auth.users(id) on delete set null not valid',
                     r.tbl, c.conname, r.col);
      execute format('alter table public.%I validate constraint %I', r.tbl, c.conname);
    end loop;
  end loop;

  -- Anything a later branch added shows here when the migration runs. It is
  -- reported, not changed: whether a row is a record or personal data is a
  -- decision for whoever added it.
  for r in
    select k.conrelid::regclass::text as tbl, k.conname
      from pg_constraint k
     where k.contype = 'f' and k.confrelid = 'auth.users'::regclass and k.confdeltype in ('a', 'r')
  loop
    raise notice '0076: % still has a key to auth.users with no delete action (%)', r.tbl, r.conname;
  end loop;
end $$;

-- The last-owner guard (0001, 0030) also blocked erasure: removing the auth
-- user cascades to org_members, and the guard refused when that person was
-- the organisation's only owner. 0030's guard, with a second way through: a
-- membership whose auth user no longer exists may go. The organisation is
-- then left without an owner for staff to reassign or close.
create or replace function app.guard_last_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- 0030
  if coalesce(current_setting('app.offboarding_org', true), '') = old.org_id::text
     and app.org_offboard_due(old.org_id) is not null then
    return coalesce(new, old);
  end if;
  -- 0076: the account has been erased.
  if tg_op = 'DELETE' and not exists (select 1 from auth.users u where u.id = old.user_id) then
    return old;
  end if;
  if (tg_op = 'DELETE' and old.role = 'owner') or (tg_op = 'UPDATE' and old.role = 'owner' and new.role <> 'owner') then
    if not exists (select 1 from public.org_members where org_id = old.org_id and role = 'owner' and user_id <> old.user_id) then
      raise exception 'an organisation must keep at least one owner' using errcode = 'check_violation';
    end if;
  end if;
  return coalesce(new, old);
end $$;

-- Files waiting to be removed from Storage. No user id: a path and a date.
create table if not exists public.storage_erasure_queue (
  id         bigint generated always as identity primary key,
  bucket     text not null check (char_length(bucket) between 1 and 100),
  path       text not null check (char_length(path) between 1 and 400),
  queued_at  timestamptz not null default now(),
  removed_at timestamptz,
  attempts   int not null default 0,
  unique (bucket, path)
);
create index if not exists storage_erasure_queue_due_idx on public.storage_erasure_queue(queued_at) where removed_at is null;
alter table public.storage_erasure_queue enable row level security;
revoke all on public.storage_erasure_queue from public, anon, authenticated;
grant select on public.storage_erasure_queue to service_role;

-- Is this person a member of the organisation, or were they ever one (RX-2)?
-- Now: a row in org_members. Before: an invitation to it that they accepted
-- (0013), or the audit entry written when they were removed (0013). Staff who
-- upload on an organisation's behalf are none of these.
create or replace function app.is_or_was_org_member(p_user uuid, p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user is not null and p_org is not null and (
    exists (select 1 from public.org_members m where m.org_id = p_org and m.user_id = p_user)
    or exists (select 1 from public.org_invitations i
                where i.org_id = p_org and i.accepted_by = p_user and i.accepted_at is not null)
    or exists (select 1 from public.audit_log a
                where a.action = 'org.member_removed' and a.org_id = p_org and a.target = 'user:' || p_user::text))
$$;
revoke execute on function app.is_or_was_org_member(uuid, uuid) from public, anon, authenticated, service_role;

-- Queue the deleted person's own files and clear the uploader link on the rest.
create or replace function app.erase_personal_files(p_user uuid) returns int
language plpgsql volatile security definer set search_path = '' as $$
declare
  n int := 0;
  n_more int := 0;
begin
  if p_user is null then return 0; end if;

  -- Their own unpublished manuscripts: they are or were a member of the
  -- organisation, no other member remains, and the workbook was never
  -- published. A file they uploaded to an organisation they never belonged
  -- to is that organisation's record and is never removed here (RX-2).
  with mine as (
    select f.id, f.storage_path
      from public.submission_files f
     where f.uploaded_by = p_user
       and app.is_or_was_org_member(p_user, f.org_id)
       and not exists (select 1 from public.org_members m where m.org_id = f.org_id and m.user_id <> p_user)
       and not exists (
         select 1 from public.workbook_submissions s
           join public.workbooks w on w.id = s.workbook_id
          where s.id = f.submission_id and w.status in ('live', 'paused', 'retired'))
  ), queued as (
    insert into public.storage_erasure_queue (bucket, path)
    select 'org-files', storage_path from mine
    on conflict (bucket, path) do nothing
    returning 1
  ), gone as (
    delete from public.submission_files f using mine where f.id = mine.id returning 1
  )
  select (select count(*) from gone) into n;

  -- Abandoned uploads, then the uploader link on what stays. Supabase Storage
  -- owns storage.objects, so a refusal here must never stop a deletion. Two
  -- separate blocks: a refused update must not undo what was queued.
  -- The first part of a path in org-files is the organisation's id (0013).
  -- The same membership rule applies: an upload left in the folder of an
  -- organisation the person never belonged to stays (RX-2).
  begin
    if exists (select 1 from information_schema.columns
                where table_schema = 'storage' and table_name = 'objects' and column_name = 'owner') then
      execute $q$
        with orphan as (
          insert into public.storage_erasure_queue (bucket, path)
          select 'org-files', o.name from storage.objects o
           where o.bucket_id = 'org-files' and o.owner = $1 and o.name is not null and char_length(o.name) <= 400
             and split_part(o.name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             and app.is_or_was_org_member($1, split_part(o.name, '/', 1)::uuid)
             and not exists (select 1 from public.submission_files f where f.storage_path = o.name)
             and not exists (select 1 from public.licences l where l.signed_document_path = o.name)
          on conflict (bucket, path) do nothing
          returning 1
        ) select count(*) from orphan $q$ into n_more using p_user;
    end if;
  exception when others then
    n_more := 0;
    raise warning '0076: abandoned uploads not queued (%)', sqlstate;
  end;
  begin
    if exists (select 1 from information_schema.columns
                where table_schema = 'storage' and table_name = 'objects' and column_name = 'owner') then
      execute 'update storage.objects set owner = null where owner = $1' using p_user;
    end if;
    if exists (select 1 from information_schema.columns
                where table_schema = 'storage' and table_name = 'objects' and column_name = 'owner_id') then
      execute 'update storage.objects set owner_id = null where owner_id = $1' using p_user::text;
    end if;
  exception when others then
    raise warning '0076: storage owner link not cleared (%)', sqlstate;
  end;

  return n + coalesce(n_more, 0);
end $$;
revoke execute on function app.erase_personal_files(uuid) from public, anon, authenticated, service_role;

create or replace function app.deletion_erases_files() returns trigger
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  n := app.erase_personal_files(new.user_id);
  if n > 0 then
    perform app.audit('account.files_queued_for_removal', 'user:' || new.user_id::text, null, null, null, null,
      jsonb_build_object('files', n));
  end if;
  return null;
end $$;
drop trigger if exists account_deletion_requests_files on public.account_deletion_requests;
create trigger account_deletion_requests_files after update of completed_at on public.account_deletion_requests
  for each row when (old.completed_at is null and new.completed_at is not null)
  execute function app.deletion_erases_files();

-- The nightly job reads what is waiting, removes it through the Storage API
-- and reports back.
create or replace function public.storage_erasure_due(p_limit int default 100)
returns table (id bigint, bucket text, path text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select app.is_service_role()) then
    raise exception 'only the service role reads the file removal queue' using errcode = 'insufficient_privilege';
  end if;
  return query
    select q.id, q.bucket, q.path from public.storage_erasure_queue q
     where q.removed_at is null
     order by q.queued_at, q.id
     limit greatest(1, least(coalesce(p_limit, 100), 1000));
end $$;

create or replace function public.storage_erasure_mark(p_ids bigint[], p_removed boolean) returns int
language plpgsql volatile security definer set search_path = '' as $$
declare n int;
begin
  if not (select app.is_service_role()) then
    raise exception 'only the service role marks file removals' using errcode = 'insufficient_privilege';
  end if;
  update public.storage_erasure_queue q
     set removed_at = case when p_removed then now() else q.removed_at end,
         attempts = q.attempts + 1
   where q.id = any (coalesce(p_ids, '{}'::bigint[])) and q.removed_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.storage_erasure_due(int), public.storage_erasure_mark(bigint[], boolean) from public, anon, authenticated;
grant execute on function public.storage_erasure_due(int), public.storage_erasure_mark(bigint[], boolean) to service_role;

-- ---------------------------------------------------------------------------
-- 4. M20: append-only consent history
-- ---------------------------------------------------------------------------
create table if not exists public.retention_periods (
  key        text primary key check (key ~ '^[a-z_]{1,60}$'),
  months     int check (months is null or months between 1 and 1200),
  note       text not null check (char_length(note) between 1 and 300),
  updated_at timestamptz not null default now()
);
alter table public.retention_periods enable row level security;
revoke all on public.retention_periods from public, anon, authenticated;
grant select on public.retention_periods to authenticated;
grant select, insert, update on public.retention_periods to service_role;
drop policy if exists retention_periods_owner_read on public.retention_periods;
create policy retention_periods_owner_read on public.retention_periods for select to authenticated
  using ((select app.is_platform(array['owner'])));

-- Conservative defaults. The owner and the solicitor must confirm each one.
-- A null months value switches that prune off. The audit log and takedown
-- notices start off. Rows are only added here, never overwritten, so a period
-- the owner has changed survives a second run.
insert into public.retention_periods (key, months, note) values
  ('leads', 24, 'Sales enquiries, from the date received. Default, to be confirmed.'),
  ('support_messages', 24, 'Contact form messages, from the date received. Default, to be confirmed.'),
  ('takedown_notices', null, 'Notices and counter notices, from the decision. Personal details are redacted, the record is kept. Off until the solicitor sets a period.'),
  ('audit_log', null, 'Ordinary audit entries, from the date written. Money, consent, deletion and staff-privilege entries are never pruned. Off until the owner and solicitor set a period: the organisation terms say 7 years.'),
  ('org_roster_archive', 12, 'Archived organisation roster addresses, from the date archived. Default, to be confirmed.'),
  ('newsletter_unsubscribed', 12, 'Unsubscribed newsletter addresses, from the unsubscribe. A salted hash is kept so the address is not mailed again. Default, to be confirmed.'),
  ('consent_history_after_deletion', 72, 'Health and faith consent records, from the date the account was deleted. Privacy notice section 6.'),
  ('email_webhook_events', 3, 'Provider event ids kept to refuse replays.'),
  ('storage_erasure_done', 3, 'Paths of files already removed from storage.')
on conflict (key) do nothing;

create or replace function app.retention_months(p_key text) returns int
language sql stable security definer set search_path = '' as $$
  select r.months from public.retention_periods r where r.key = p_key
$$;
revoke execute on function app.retention_months(text) from public, anon, authenticated;

create table if not exists public.consent_history (
  id           bigint generated always as identity primary key,
  user_id      uuid references auth.users(id) on delete set null,
  -- Set when the account is deleted: a keyed hash of the old user id.
  subject_hash text check (subject_hash is null or subject_hash ~ '^[0-9a-f]{64}$'),
  kind         text not null check (kind in ('health', 'faith')),
  version      text not null check (version ~ '^[a-z0-9][a-z0-9._-]{0,31}$'),
  action       text not null check (action in ('given', 'withdrawn')),
  at           timestamptz not null default now(),
  source       text not null check (source in ('reader', 'service', 'account_deletion', 'backfill')),
  erased_at    timestamptz,
  constraint consent_history_subject check (user_id is not null or subject_hash is not null)
);
create index if not exists consent_history_user_idx on public.consent_history(user_id, at);
create index if not exists consent_history_erased_idx on public.consent_history(erased_at) where erased_at is not null;
alter table public.consent_history enable row level security;
revoke all on public.consent_history from public, anon, authenticated;
grant select on public.consent_history to authenticated, service_role;
drop policy if exists consent_history_own on public.consent_history;
create policy consent_history_own on public.consent_history for select to authenticated
  using (user_id = (select app.uid()));

-- Never updatable, with one exception: the auth user going (on delete set
-- null) swaps the id for the keyed hash. Never deletable until the retention
-- period after that has passed.
create or replace function app.consent_history_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_months int;
begin
  if tg_op = 'DELETE' then
    v_months := coalesce(app.retention_months('consent_history_after_deletion'), 72);
    if old.erased_at is null or old.erased_at > now() - make_interval(months => v_months) then
      raise exception 'consent history is append only' using errcode = 'insufficient_privilege';
    end if;
    return old;
  end if;
  if new.id is distinct from old.id or new.kind is distinct from old.kind or new.version is distinct from old.version
     or new.action is distinct from old.action or new.at is distinct from old.at or new.source is distinct from old.source then
    raise exception 'consent history is append only' using errcode = 'insufficient_privilege';
  end if;
  if old.user_id is not null and new.user_id is null and old.subject_hash is null then
    new.subject_hash := app.keyed_hash('consent_subject', old.user_id::text);
    new.erased_at := now();
    return new;
  end if;
  raise exception 'consent history is append only' using errcode = 'insufficient_privilege';
end $$;
drop trigger if exists consent_history_append_only on public.consent_history;
create trigger consent_history_append_only before update or delete on public.consent_history
  for each row execute function app.consent_history_guard();

-- RX-4. Row triggers do not fire on TRUNCATE, and Supabase gives the service
-- role every privilege on a new table by default. So: every role loses
-- everything on the table and gets back only what it needs (select), and a
-- statement trigger refuses TRUNCATE for whoever still could run it (the
-- owner). Update and delete stay with the row guard above, which is what
-- lets the two erasure steps through: the swap of the user id for the keyed
-- hash when the account goes (on delete set null), and the prune of a row
-- six years after that. Rows are written only by the security definer
-- trigger on profiles, as the table's owner.
revoke all on public.consent_history from public, anon, authenticated, service_role;
grant select on public.consent_history to authenticated, service_role;

create or replace function app.consent_history_no_truncate() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'consent history is append only' using errcode = 'insufficient_privilege';
end $$;
drop trigger if exists consent_history_no_truncate on public.consent_history;
create trigger consent_history_no_truncate before truncate on public.consent_history
  for each statement execute function app.consent_history_no_truncate();

-- Who made the change: the reader (their own session), the deletion job (a
-- deletion request for them is due), or other server code.
create or replace function app.consent_source(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when app.uid() is not null and app.uid() = p_user then 'reader'
    when exists (select 1 from public.account_deletion_requests d
                  where d.user_id = p_user and d.cancelled_at is null and d.cancel_before <= now()) then 'account_deletion'
    else 'service' end
$$;
revoke execute on function app.consent_source(uuid) from public, anon, authenticated;

create or replace function app.record_consent_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old_at timestamptz; v_old_version text; v_new_at timestamptz; v_new_version text;
  v_kind text;
begin
  -- The profile row itself going (the auth user was removed some other way
  -- than the deletion job): record the end of any consent still held. The
  -- user row is already on its way out, so only the hash can be kept.
  if tg_op = 'DELETE' then
    foreach v_kind in array array['health', 'faith'] loop
      v_old_version := case v_kind when 'health' then old.health_consent_version else old.faith_consent_version end;
      if v_old_version is not null then
        insert into public.consent_history (user_id, subject_hash, kind, version, action, source, erased_at)
        values (null, app.keyed_hash('consent_subject', old.user_id::text), v_kind, v_old_version, 'withdrawn', 'account_deletion', now());
      end if;
    end loop;
    return old;
  end if;

  foreach v_kind in array array['health', 'faith'] loop
    if v_kind = 'health' then
      v_new_at := new.health_consent_at; v_new_version := new.health_consent_version;
      v_old_at := case when tg_op = 'UPDATE' then old.health_consent_at end;
      v_old_version := case when tg_op = 'UPDATE' then old.health_consent_version end;
    else
      v_new_at := new.faith_consent_at; v_new_version := new.faith_consent_version;
      v_old_at := case when tg_op = 'UPDATE' then old.faith_consent_at end;
      v_old_version := case when tg_op = 'UPDATE' then old.faith_consent_version end;
    end if;
    if v_new_at is not distinct from v_old_at and v_new_version is not distinct from v_old_version then
      continue;
    end if;
    if v_new_version is not null then
      insert into public.consent_history (user_id, kind, version, action, at, source)
      values (new.user_id, v_kind, v_new_version, 'given', coalesce(v_new_at, now()), app.consent_source(new.user_id));
    elsif v_old_version is not null then
      insert into public.consent_history (user_id, kind, version, action, source)
      values (new.user_id, v_kind, v_old_version, 'withdrawn', app.consent_source(new.user_id));
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists profiles_consent_history on public.profiles;
create trigger profiles_consent_history after insert or update on public.profiles
  for each row execute function app.record_consent_change();
drop trigger if exists profiles_consent_history_end on public.profiles;
create trigger profiles_consent_history_end before delete on public.profiles
  for each row execute function app.record_consent_change();

-- Consent held today gets its first row, once.
insert into public.consent_history (user_id, kind, version, action, at, source)
select p.user_id, 'health', p.health_consent_version, 'given', coalesce(p.health_consent_at, now()), 'backfill'
  from public.profiles p
 where p.health_consent_version is not null
   and not exists (select 1 from public.consent_history h where h.user_id = p.user_id and h.kind = 'health');
insert into public.consent_history (user_id, kind, version, action, at, source)
select p.user_id, 'faith', p.faith_consent_version, 'given', coalesce(p.faith_consent_at, now()), 'backfill'
  from public.profiles p
 where p.faith_consent_version is not null
   and not exists (select 1 from public.consent_history h where h.user_id = p.user_id and h.kind = 'faith');

-- ---------------------------------------------------------------------------
-- 5. M21: the retention prune
-- ---------------------------------------------------------------------------
-- RX-3. Which audit entries the general audit_log period may prune.
--
-- The action names in use were read from every app.audit call in 0001 to
-- 0076 and from the web app. An action is "<area>.<what>". Only the areas
-- listed here are ordinary housekeeping. Every other area is kept for good
-- by this prune, and so is any area added later until someone lists it here
-- on purpose: an unknown action is kept.
--
-- Kept because of their area: money, commerce, payout, price, referral
-- (money and royalties); org and organisation (invoices, plan prices,
-- licences, seats, cooling-off cancels, member roles); account (deletion,
-- staff look-ups and restores); terms and licence (consent and rights);
-- takedown and release (legal records, staff overrides); mfa_recovery, demo,
-- flag and legal_hold (staff privilege); retention (the record of pruning).
--
-- Kept whatever their area: any action whose name mentions a refund, tax,
-- royalties, a payout, an invoice, a credit, a gift, a dispute, a price,
-- consent, a deletion or erasure, a role or a privilege.
create or replace function app.audit_action_prunable(p_action text) returns boolean
language sql immutable set search_path = '' as $$
  select p_action is not null
     and p_action ~ '^[a-z_]+\.[a-z_.]*$'
     and split_part(p_action, '.', 1) = any (array[
           'author', 'book', 'collection', 'editorial_slot', 'facilitator_guide', 'file', 'imprint',
           'leads', 'newsletter', 'ops', 'partner', 'programme_question', 'review', 'shelf',
           'submission', 'support', 'tenant', 'tenant_domain', 'theme', 'title_request', 'workbook'])
     and p_action !~ '(refund|tax|royalt|payout|invoice|credit|gift|dispute|price|consent|delet|eras|forgot|role|privilege|mfa)'
$$;
revoke execute on function app.audit_action_prunable(text) from public, anon, authenticated;

-- RX-3. The legal hold. One row at most is open (released_at null). While
-- one is open, app.prune_retention() removes and redacts nothing at all:
-- leads, contact messages, takedown notices, the audit log, the roster
-- archive, newsletter addresses and the rest of that sweep. A platform owner
-- places and releases it, under the staff rule of 0074 (a platform_roles row
-- and a second-factor session), with a reason, and each is audited. The
-- audit entries are legal_hold.*, an area the audit prune never touches.
create table if not exists public.legal_hold (
  id              bigint generated always as identity primary key,
  reason          text not null check (char_length(btrim(reason)) between 10 and 500),
  placed_by       uuid references auth.users(id) on delete set null,
  placed_at       timestamptz not null default now(),
  released_by     uuid references auth.users(id) on delete set null,
  released_at     timestamptz,
  release_reason  text check (release_reason is null or char_length(btrim(release_reason)) between 10 and 500),
  constraint legal_hold_release check ((released_at is null) = (release_reason is null))
);
create unique index if not exists legal_hold_one_open_idx on public.legal_hold ((true)) where released_at is null;
alter table public.legal_hold enable row level security;
revoke all on public.legal_hold from public, anon, authenticated, service_role;
grant select on public.legal_hold to authenticated, service_role;
drop policy if exists legal_hold_owner_read on public.legal_hold;
create policy legal_hold_owner_read on public.legal_hold for select to authenticated
  using ((select app.is_platform(array['owner'])));

create or replace function app.legal_hold_active() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.legal_hold h where h.released_at is null)
$$;
revoke execute on function app.legal_hold_active() from public, anon, authenticated;
grant execute on function app.legal_hold_active() to service_role;

create or replace function public.legal_hold_set(p_reason text) returns bigint
language plpgsql volatile security definer set search_path = '' as $$
declare v_id bigint;
begin
  if not app.is_platform(array['owner']) then
    raise exception 'only a platform owner places a legal hold' using errcode = 'insufficient_privilege';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 10 and 500 then
    raise exception 'a reason of 10 to 500 characters is required' using errcode = 'check_violation';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('legal_hold', 0));
  select h.id into v_id from public.legal_hold h where h.released_at is null;
  if v_id is not null then
    raise exception 'a legal hold is already in place' using errcode = 'object_not_in_prerequisite_state';
  end if;
  insert into public.legal_hold (reason, placed_by) values (btrim(p_reason), app.uid()) returning id into v_id;
  perform app.audit('legal_hold.placed', 'legal_hold:' || v_id::text, btrim(p_reason), null, null, null,
    jsonb_build_object('active', true));
  return v_id;
end $$;

create or replace function public.legal_hold_clear(p_reason text) returns bigint
language plpgsql volatile security definer set search_path = '' as $$
declare v_id bigint;
begin
  if not app.is_platform(array['owner']) then
    raise exception 'only a platform owner releases a legal hold' using errcode = 'insufficient_privilege';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 10 and 500 then
    raise exception 'a reason of 10 to 500 characters is required' using errcode = 'check_violation';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('legal_hold', 0));
  update public.legal_hold h
     set released_at = now(), released_by = app.uid(), release_reason = btrim(p_reason)
   where h.released_at is null
  returning h.id into v_id;
  if v_id is null then
    raise exception 'no legal hold is in place' using errcode = 'object_not_in_prerequisite_state';
  end if;
  perform app.audit('legal_hold.released', 'legal_hold:' || v_id::text, btrim(p_reason), null, null,
    jsonb_build_object('active', true), jsonb_build_object('active', false));
  return v_id;
end $$;
revoke execute on function public.legal_hold_set(text), public.legal_hold_clear(text) from public, anon, service_role;
grant execute on function public.legal_hold_set(text), public.legal_hold_clear(text) to authenticated;

create or replace function app.prune_retention() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  m int;
  n_leads int := 0; n_support int := 0; n_takedown int := 0; n_audit int := 0; n_roster int := 0;
  n_news int := 0; n_consent int := 0; n_events int := 0; n_files int := 0;
  v_out jsonb;
begin
  if not (select app.is_service_role()) then
    raise exception 'only the service role prunes' using errcode = 'insufficient_privilege';
  end if;

  -- RX-3: a legal hold stops every prune below. Nothing is removed, nothing
  -- is redacted, and the answer says why the counts are all nought.
  if app.legal_hold_active() then
    return jsonb_build_object('leads', 0, 'support_messages', 0, 'takedown_notices_redacted', 0,
      'audit_log', 0, 'org_roster_archive', 0, 'newsletter_unsubscribed', 0,
      'consent_history', 0, 'email_webhook_events', 0, 'storage_erasure_done', 0, 'legal_hold', true);
  end if;

  m := app.retention_months('leads');
  if m is not null then
    delete from public.leads where created_at < now() - make_interval(months => m);
    get diagnostics n_leads = row_count;
  end if;

  m := app.retention_months('support_messages');
  if m is not null then
    delete from public.support_messages where created_at < now() - make_interval(months => m);
    get diagnostics n_support = row_count;
  end if;

  -- Decided notices only. The record (reference, basis, what was decided)
  -- stays because the takedown points at it; the person's details go.
  m := app.retention_months('takedown_notices');
  if m is not null then
    update public.takedown_notices
       set name = 'removed', email = 'removed', address = 'removed', phone = null, acting_for = case when relationship = 'agent' then 'removed' end,
           signature = 'removed', ip_hash = null
     where status not in ('received', 'reviewing')
       and coalesce(decided_at, created_at) < now() - make_interval(months => m)
       and (name <> 'removed' or email <> 'removed' or address <> 'removed' or signature <> 'removed' or phone is not null or ip_hash is not null);
    get diagnostics n_takedown = row_count;
  end if;

  m := app.retention_months('audit_log');
  if m is not null then
    -- RX-3: ordinary entries only. Money, consent, deletion, staff-privilege
    -- and unknown actions are never pruned by this period.
    delete from public.audit_log
     where at < now() - make_interval(months => m) and app.audit_action_prunable(action);
    get diagnostics n_audit = row_count;
  end if;

  m := app.retention_months('org_roster_archive');
  if m is not null then
    delete from public.org_roster_archive where archived_at < now() - make_interval(months => m);
    get diagnostics n_roster = row_count;
  end if;

  m := app.retention_months('newsletter_unsubscribed');
  if m is not null then
    delete from public.newsletter_subscribers
     where status = 'unsubscribed' and coalesce(unsubscribed_at, created_at) < now() - make_interval(months => m);
    get diagnostics n_news = row_count;
  end if;

  m := app.retention_months('consent_history_after_deletion');
  if m is not null then
    delete from public.consent_history where erased_at is not null and erased_at < now() - make_interval(months => m);
    get diagnostics n_consent = row_count;
  end if;

  m := app.retention_months('email_webhook_events');
  if m is not null then
    delete from public.email_webhook_events where received_at < now() - make_interval(months => m);
    get diagnostics n_events = row_count;
  end if;

  m := app.retention_months('storage_erasure_done');
  if m is not null then
    delete from public.storage_erasure_queue where removed_at is not null and removed_at < now() - make_interval(months => m);
    get diagnostics n_files = row_count;
  end if;

  v_out := jsonb_build_object('leads', n_leads, 'support_messages', n_support, 'takedown_notices_redacted', n_takedown,
    'audit_log', n_audit, 'org_roster_archive', n_roster, 'newsletter_unsubscribed', n_news,
    'consent_history', n_consent, 'email_webhook_events', n_events, 'storage_erasure_done', n_files);
  -- Counts only, and only when something went.
  if n_leads + n_support + n_takedown + n_audit + n_roster + n_news + n_consent > 0 then
    perform app.audit('retention.pruned', 'retention', null, null, null, null, v_out);
  end if;
  return v_out;
end $$;
create or replace function public.prune_retention() returns jsonb
language sql volatile security invoker set search_path = '' as $$ select app.prune_retention() $$;
revoke execute on function app.prune_retention() from public, anon, authenticated;
revoke execute on function public.prune_retention() from public, anon, authenticated;
grant execute on function app.prune_retention(), public.prune_retention() to service_role;

-- ---------------------------------------------------------------------------
-- 6. L12: newsletter tokens stored as hashes
--
-- newsletter_subscribers.token_hash is the confirmation token. Each issue
-- sent mints a fresh link token per recipient and keeps only its hash in
-- newsletter_link_tokens, so every unsubscribe link ever sent keeps working.
-- The functions keep their names and signatures: the app passes and receives
-- the plain token as before and never sees a hash.
-- ---------------------------------------------------------------------------
alter table public.newsletter_subscribers add column if not exists token_hash text
  check (token_hash is null or token_hash ~ '^[0-9a-f]{64}$');
create unique index if not exists newsletter_subscribers_token_hash_key on public.newsletter_subscribers(token_hash);
update public.newsletter_subscribers set token_hash = app.sha256_hex(token) where token is not null and token_hash is null;
-- Kept for one release (rollback). Emptied and no longer written.
alter table public.newsletter_subscribers alter column token drop not null;
alter table public.newsletter_subscribers alter column token drop default;
update public.newsletter_subscribers set token = null where token is not null;

create table if not exists public.newsletter_link_tokens (
  token_hash    text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  subscriber_id uuid not null references public.newsletter_subscribers(id) on delete cascade,
  created_at    timestamptz not null default now()
);
create index if not exists newsletter_link_tokens_subscriber_idx on public.newsletter_link_tokens(subscriber_id);
alter table public.newsletter_link_tokens enable row level security;
revoke all on public.newsletter_link_tokens from public, anon, authenticated;
grant select, insert, delete on public.newsletter_link_tokens to service_role;

create or replace function app.new_link_token() returns text
language sql volatile set search_path = '' as $$
  select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
$$;

create or replace function app.newsletter_subscriber_for(p_token text) returns uuid
language sql stable security definer set search_path = '' as $$
  select x.id from (
    select s.id from public.newsletter_subscribers s
     where p_token is not null and s.token_hash = app.sha256_hex(p_token)
    union all
    select t.subscriber_id from public.newsletter_link_tokens t
     where p_token is not null and t.token_hash = app.sha256_hex(p_token)
  ) x limit 1
$$;
revoke execute on function app.newsletter_subscriber_for(text) from public, anon, authenticated;

create or replace function app.newsletter_subscribe(p_email text, p_ip_hash text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_email  text := lower(nullif(btrim(p_email), ''));
  v_recent int;
  v_total  int;
  v_row    public.newsletter_subscribers;
  v_token  text := app.new_link_token();
begin
  if not app.is_service_role() then
    raise exception 'only the service role signs people up' using errcode = 'insufficient_privilege';
  end if;
  if v_email is null or char_length(v_email) > 254 or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
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
    insert into public.newsletter_subscribers (email, last_ip_hash, confirm_sent_at, token, token_hash)
    values (v_email, p_ip_hash, now(), null, app.sha256_hex(v_token));
    return v_token;
  end if;
  if v_row.status = 'confirmed' then
    return null;
  end if;
  if v_row.confirm_sent_at > now() - interval '10 minutes' and v_row.status = 'pending' then
    return null;
  end if;
  update public.newsletter_subscribers
     set status = 'pending', token = null, token_hash = app.sha256_hex(v_token),
         last_ip_hash = p_ip_hash, confirm_sent_at = now(), unsubscribed_at = null
   where id = v_row.id;
  return v_token;
end $$;

create or replace function app.newsletter_confirm(p_token text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare v_row public.newsletter_subscribers;
begin
  if not app.is_service_role() then
    raise exception 'only the service role confirms sign-ups' using errcode = 'insufficient_privilege';
  end if;
  -- Only the confirmation token confirms. A link token from an issue does not.
  select * into v_row from public.newsletter_subscribers
   where p_token is not null and token_hash = app.sha256_hex(p_token) for update;
  if not found or v_row.status = 'unsubscribed' then return false; end if;
  if v_row.status = 'pending' then
    update public.newsletter_subscribers set status = 'confirmed', confirmed_at = now() where id = v_row.id;
  end if;
  return true;
end $$;

create or replace function app.newsletter_unsubscribe(p_token text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not app.is_service_role() then
    raise exception 'only the service role unsubscribes people' using errcode = 'insufficient_privilege';
  end if;
  update public.newsletter_subscribers
     set status = 'unsubscribed', unsubscribed_at = coalesce(unsubscribed_at, now())
   where id = app.newsletter_subscriber_for(p_token) returning id into v_id;
  return v_id is not null;
end $$;

-- Each recipient gets a link token made now. Only its hash is kept.
create or replace function app.newsletter_next_recipients(p_issue uuid, p_limit int)
returns table (subscriber_id uuid, email text, token text)
language plpgsql volatile security definer set search_path = '' as $$
declare r record;
begin
  if not app.is_service_role() then
    raise exception 'only the service role runs the newsletter' using errcode = 'insufficient_privilege';
  end if;
  for r in
    select s.id, s.email::text as email
      from public.newsletter_subscribers s
      left join public.newsletter_sends x on x.issue_id = p_issue and x.subscriber_id = s.id
     where s.status = 'confirmed'
       and (x.subscriber_id is null or (x.status = 'failed' and x.attempts < 3))
     order by s.created_at
     limit greatest(1, least(coalesce(p_limit, 100), 2000))
  loop
    subscriber_id := r.id;
    email := r.email;
    token := app.new_link_token();
    insert into public.newsletter_link_tokens (token_hash, subscriber_id) values (app.sha256_hex(token), r.id);
    return next;
  end loop;
end $$;
create or replace function public.newsletter_next_recipients(p_issue uuid, p_limit int)
returns table (subscriber_id uuid, email text, token text)
language sql volatile security invoker set search_path = '' as $$ select * from app.newsletter_next_recipients(p_issue, p_limit) $$;

-- ---------------------------------------------------------------------------
-- 6b. L12: gift claim tokens stored as hashes
--
-- claim_token_hash is the hash of the token the gift was made with. The app
-- now derives the token on the server from a secret and the Checkout Session
-- id, so it can show or resend the link without the database holding it.
-- For a gift made before this migration the derived token differs from the
-- one already emailed, so its hash is registered in claim_token_hash_alt.
-- Both open the gift. A trigger hashes anything written to the old plain
-- column and empties it, so the functions from 0054, 0068 and 0072 that
-- write or clear claim_token keep working without being edited.
-- ---------------------------------------------------------------------------
alter table public.gift_memberships
  add column if not exists claim_token_hash text check (claim_token_hash is null or claim_token_hash ~ '^[0-9a-f]{64}$'),
  add column if not exists claim_token_hash_alt text check (claim_token_hash_alt is null or claim_token_hash_alt ~ '^[0-9a-f]{64}$');
create unique index if not exists gift_memberships_claim_token_hash_key on public.gift_memberships(claim_token_hash);
create unique index if not exists gift_memberships_claim_token_hash_alt_key on public.gift_memberships(claim_token_hash_alt);

create or replace function app.gift_token_hashing() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.claim_token is not null then
    new.claim_token_hash := app.sha256_hex(new.claim_token);
    -- The plain column is kept for one release (rollback) and stays empty.
    new.claim_token := null;
  end if;
  -- A gift that is no longer waiting has no link. 0054 cleared the plain
  -- token at these points; the hashes go the same way.
  if new.status not in ('pending', 'paid') then
    new.claim_token_hash := null;
    new.claim_token_hash_alt := null;
  elsif tg_op = 'UPDATE' and new.status = 'pending' and old.buyer_id is not null and new.buyer_id is null then
    new.claim_token_hash := null;
    new.claim_token_hash_alt := null;
  end if;
  return new;
end $$;
drop trigger if exists gift_memberships_token_hashing on public.gift_memberships;
create trigger gift_memberships_token_hashing before insert or update on public.gift_memberships
  for each row execute function app.gift_token_hashing();

-- Existing rows: the trigger hashes the plain value and empties the column.
update public.gift_memberships set claim_token = claim_token where claim_token is not null;

create or replace function app.gift_preview(p_token text) returns table (months int, sender_name text, message text, status text, claim_by timestamptz)
language sql stable security definer set search_path = '' as $$
  select g.months, g.sender_name, g.message, g.status, g.claim_by
    from public.gift_memberships g
   where p_token is not null and char_length(p_token) >= 32
     and (g.claim_token_hash = app.sha256_hex(p_token) or g.claim_token_hash_alt = app.sha256_hex(p_token))
     and g.status in ('paid', 'claimed')
$$;

-- As 0054, with the gift found by the hash of the token.
create or replace function app.claim_gift(p_token text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  g public.gift_memberships%rowtype;
  e public.entitlements%rowtype;
  v_user uuid := app.uid();
  v_start timestamptz;
  v_end timestamptz;
  v_id uuid;
  v_hash text;
begin
  if v_user is null then
    raise exception 'sign in to claim a gift' using errcode = 'insufficient_privilege';
  end if;
  if p_token is null or char_length(p_token) < 32 then return 'invalid'; end if;
  v_hash := app.sha256_hex(p_token);
  select * into g from public.gift_memberships
   where claim_token_hash = v_hash or claim_token_hash_alt = v_hash
   for update;
  if not found then return 'invalid'; end if;
  if g.status <> 'paid' then return 'invalid'; end if;
  if g.claim_by is not null and g.claim_by <= now() then return 'expired'; end if;

  select * into e from public.entitlements
   where user_id = v_user and tenant_id = g.tenant_id and workbook_id is null and source = 'gift' and org_licence_id is null
   for update;
  if not found then
    v_start := now();
    v_end := v_start + make_interval(months => g.months);
    insert into public.entitlements (user_id, tenant_id, workbook_id, source, status, starts_at, ends_at)
    values (v_user, g.tenant_id, null, 'gift', 'active', v_start, v_end) returning id into v_id;
  else
    v_start := case when e.status = 'active' and coalesce(e.ends_at, now()) > now() then e.starts_at else now() end;
    v_end := greatest(coalesce(e.ends_at, now()), now()) + make_interval(months => g.months);
    update public.entitlements set status = 'active', starts_at = v_start, ends_at = v_end where id = e.id;
    v_id := e.id;
  end if;

  update public.gift_memberships
     set status = 'claimed', claimed_by = v_user, claimed_at = now(), starts_at = v_start, ends_at = v_end,
         entitlement_id = v_id, claim_token = null, recipient_email = null
   where id = g.id;
  perform app.audit('commerce.gift_claimed', 'gift:' || g.id::text, null, g.tenant_id, null, null,
    jsonb_build_object('months', g.months, 'ends_at', v_end));
  return 'claimed';
end $$;

-- The server registers the hash of the link it is about to show or send for
-- a paid gift. True when that hash now opens the gift.
create or replace function public.gift_link_register(p_id uuid, p_token_hash text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare g public.gift_memberships%rowtype;
begin
  if not (select app.is_service_role()) then
    raise exception 'only the service role registers gift links' using errcode = 'insufficient_privilege';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then return false; end if;
  select * into g from public.gift_memberships where id = p_id for update;
  if not found or g.status <> 'paid' then return false; end if;
  if g.claim_token_hash = p_token_hash or g.claim_token_hash_alt = p_token_hash then return true; end if;
  if g.claim_token_hash is null then
    update public.gift_memberships set claim_token_hash = p_token_hash where id = g.id;
  else
    update public.gift_memberships set claim_token_hash_alt = p_token_hash where id = g.id;
  end if;
  return true;
end $$;
revoke execute on function public.gift_link_register(uuid, text) from public, anon, authenticated;
grant execute on function public.gift_link_register(uuid, text) to service_role;
