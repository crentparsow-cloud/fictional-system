-- 0007 Account and data rights: deletion with a 7-day undo (F-025), and the
-- request list staff see (F-091).
--
-- Same rules as 0001 to 0005. RLS is on. Grants to anon and authenticated
-- are revoked for the new table and given back narrowly. Policies call the
-- app.* helpers as (select app.fn(...)).
--
-- The shape of trust here:
--   * A reader asks for deletion, and can change their mind, only through
--     app.request_account_deletion() and app.cancel_account_deletion(). There
--     is no client insert, update or delete grant on the table.
--   * The reader reads their own row. Platform owners and support read all
--     rows, so the staff list (F-091) can show open requests and due dates.
--   * app.complete_due_deletions() is for the service role alone. It removes
--     the reader's work and clears their profile. It never touches
--     purchases: purchase and tax records are kept for the period UK tax law
--     requires (privacy notice, section 6).
--   * The auth.users row is not deleted here. A server job running with the
--     service role (apps/web/app/api/account/complete/route.ts) calls
--     complete_due_deletions() and then auth.admin.deleteUser() for each id
--     it returns, then stamps auth_removed_at.
--
-- The request row has no foreign key to auth.users on purpose. It outlives
-- the account as the record that the request was made and carried out. It
-- holds an id and dates only, never an email or a name.

-- ---------------------------------------------------------------------------
-- Purchases outlive the account. 0004 made purchases.user_id cascade from
-- auth.users, which would have deleted tax records along with the auth user.
-- From here on the link is set to null instead: the purchase row, its
-- amounts, tax and Stripe ids stay, and nothing in it points at a person.
-- ---------------------------------------------------------------------------
alter table public.purchases alter column user_id drop not null;
alter table public.purchases drop constraint purchases_user_id_fkey;
alter table public.purchases add constraint purchases_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Deletion requests: one row per reader. A cancelled request can be made
-- again, which reuses the row with fresh dates. A completed one is final.
-- ---------------------------------------------------------------------------
create table public.account_deletion_requests (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null unique,
  requested_at    timestamptz not null default now(),
  cancel_before   timestamptz not null,
  cancelled_at    timestamptz,
  completed_at    timestamptz,
  auth_removed_at timestamptz,
  reason          text check (reason is null or length(reason) <= 500),
  constraint account_deletion_requests_one_end check (cancelled_at is null or completed_at is null),
  constraint account_deletion_requests_window check (cancel_before > requested_at)
);
create index account_deletion_requests_due_idx on public.account_deletion_requests(cancel_before)
  where cancelled_at is null and completed_at is null;

-- The undo window. app_config.deletion_undo_days is seeded to 7 in 0001.
create or replace function app.deletion_undo_days() returns int
language sql stable security definer set search_path = '' as $$
  select coalesce((select (value #>> '{}')::int from public.app_config where key = 'deletion_undo_days'), 7)
$$;

-- cancel_before is always requested_at plus the undo window. Set here, not
-- by the caller. A generated column cannot do it: timestamptz plus an
-- interval is not immutable.
create or replace function app.set_deletion_window() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.cancel_before := new.requested_at + make_interval(days => app.deletion_undo_days());
  return new;
end $$;
create trigger account_deletion_requests_window before insert or update of requested_at
  on public.account_deletion_requests for each row execute function app.set_deletion_window();

-- ---------------------------------------------------------------------------
-- Reader functions. Security definer: the reader has no table write grant.
-- ---------------------------------------------------------------------------

-- Ask for deletion. Idempotent while a request is pending: the window is not
-- extended by asking twice. After a cancel, asking again starts a fresh
-- 7 days. Refused once a deletion has completed.
create or replace function app.request_account_deletion(p_reason text default null)
returns public.account_deletion_requests
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app.uid();
  r public.account_deletion_requests;
begin
  if v_uid is null then
    raise exception 'sign in to delete your account' using errcode = 'insufficient_privilege';
  end if;
  select * into r from public.account_deletion_requests where user_id = v_uid for update;
  if found then
    if r.completed_at is not null then
      raise exception 'this account has already been deleted' using errcode = 'check_violation';
    end if;
    if r.cancelled_at is null then
      return r;
    end if;
    update public.account_deletion_requests
       set requested_at = now(), cancelled_at = null, reason = left(p_reason, 500)
     where id = r.id
     returning * into r;
  else
    insert into public.account_deletion_requests (user_id, requested_at, reason)
    values (v_uid, now(), left(p_reason, 500))
    returning * into r;
  end if;
  perform app.audit('account.deletion_requested', 'user:' || v_uid::text, null, null, null, null,
    jsonb_build_object('cancel_before', r.cancel_before));
  return r;
end $$;

-- Change your mind. Allowed until cancel_before. Raises no_data_found when
-- there is nothing to cancel.
create or replace function app.cancel_account_deletion()
returns public.account_deletion_requests
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app.uid();
  r public.account_deletion_requests;
begin
  if v_uid is null then
    raise exception 'sign in to cancel a deletion' using errcode = 'insufficient_privilege';
  end if;
  update public.account_deletion_requests
     set cancelled_at = now()
   where user_id = v_uid and cancelled_at is null and completed_at is null and cancel_before > now()
   returning * into r;
  if not found then
    raise exception 'there is no deletion to cancel' using errcode = 'no_data_found';
  end if;
  perform app.audit('account.deletion_cancelled', 'user:' || v_uid::text);
  return r;
end $$;

-- ---------------------------------------------------------------------------
-- The server job. Service role only. For every request past cancel_before
-- and not cancelled:
--   * deletes the reader's answers, progress events and enrolments
--   * deletes their entitlements and tenant memberships (privacy notice,
--     section 6: "your entitlements and your memberships are deleted")
--   * clears the personal fields on their profile, including the health
--     consent columns 0006 added
--   * marks the request completed and writes one audit row with counts
-- It does not touch public.purchases. Purchase and tax records are kept.
--
-- Returns every user id whose data is gone but whose auth user has not yet
-- been removed, including ones completed by an earlier run, so a failed
-- auth.admin.deleteUser() is retried next time.
-- ---------------------------------------------------------------------------
create or replace function app.complete_due_deletions()
returns table (user_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  n_answers int;
  n_events int;
  n_enrolments int;
  n_entitlements int;
  n_memberships int;
begin
  if not (select app.is_service_role()) then
    raise exception 'only the service role completes deletions' using errcode = 'insufficient_privilege';
  end if;

  for r in
    select d.id, d.user_id from public.account_deletion_requests d
     where d.cancelled_at is null and d.completed_at is null and d.cancel_before <= now()
     order by d.cancel_before
     for update skip locked
  loop
    delete from public.answers a using public.enrolments e
     where a.enrolment_id = e.id and e.user_id = r.user_id;
    get diagnostics n_answers = row_count;
    delete from public.progress_events p using public.enrolments e
     where p.enrolment_id = e.id and e.user_id = r.user_id;
    get diagnostics n_events = row_count;
    delete from public.enrolments e where e.user_id = r.user_id;
    get diagnostics n_enrolments = row_count;
    delete from public.entitlements en where en.user_id = r.user_id;
    get diagnostics n_entitlements = row_count;
    delete from public.tenant_members tm where tm.user_id = r.user_id;
    get diagnostics n_memberships = row_count;

    update public.profiles pr
       set display_name = null, country = null, adult_confirmed_at = null, locale = 'en-GB',
           health_consent_at = null, health_consent_version = null
     where pr.user_id = r.user_id;

    update public.account_deletion_requests d set completed_at = now() where d.id = r.id;

    perform app.audit('account.deletion_completed', 'user:' || r.user_id::text,
      'purchases kept for tax records', null, null, null,
      jsonb_build_object('answers', n_answers, 'progress_events', n_events, 'enrolments', n_enrolments,
                         'entitlements', n_entitlements, 'tenant_memberships', n_memberships));
  end loop;

  return query
    select d.user_id from public.account_deletion_requests d
     where d.completed_at is not null and d.auth_removed_at is null
     order by d.completed_at;
end $$;

-- The job stamps this once auth.admin.deleteUser() has succeeded.
create or replace function app.mark_auth_removed(p_user uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not (select app.is_service_role()) then
    raise exception 'only the service role marks auth removal' using errcode = 'insufficient_privilege';
  end if;
  update public.account_deletion_requests
     set auth_removed_at = now()
   where user_id = p_user and completed_at is not null and auth_removed_at is null;
  return found;
end $$;

-- ---------------------------------------------------------------------------
-- RPC wrappers. PostgREST exposes the public schema only. Security invoker:
-- the app functions do the checks.
-- ---------------------------------------------------------------------------
create or replace function public.request_account_deletion(p_reason text default null)
returns public.account_deletion_requests
language sql security invoker set search_path = '' as $$
  select * from app.request_account_deletion(p_reason)
$$;
create or replace function public.cancel_account_deletion()
returns public.account_deletion_requests
language sql security invoker set search_path = '' as $$
  select * from app.cancel_account_deletion()
$$;
create or replace function public.complete_due_deletions()
returns table (user_id uuid)
language sql security invoker set search_path = '' as $$
  select * from app.complete_due_deletions()
$$;
create or replace function public.mark_auth_removed(p_user uuid) returns boolean
language sql security invoker set search_path = '' as $$
  select app.mark_auth_removed(p_user)
$$;

revoke execute on function app.request_account_deletion(text), app.cancel_account_deletion(),
  app.complete_due_deletions(), app.mark_auth_removed(uuid) from public;
revoke execute on function public.request_account_deletion(text), public.cancel_account_deletion(),
  public.complete_due_deletions(), public.mark_auth_removed(uuid) from public, anon, authenticated;
grant execute on function app.request_account_deletion(text), app.cancel_account_deletion() to authenticated;
grant execute on function public.request_account_deletion(text), public.cancel_account_deletion() to authenticated;
grant execute on function app.complete_due_deletions(), app.mark_auth_removed(uuid) to service_role;
grant execute on function public.complete_due_deletions(), public.mark_auth_removed(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from anon, authenticated;

-- Own row, plus platform owners and support (F-091). No client writes.
grant select on public.account_deletion_requests to authenticated;
grant select on public.account_deletion_requests to service_role;
create policy account_deletion_requests_read on public.account_deletion_requests for select to authenticated
  using (user_id = (select app.uid()) or (select app.is_platform(array['owner','support'])));
