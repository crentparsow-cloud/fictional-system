-- 0027 Support operations: the account lookup actions (F-087), the
-- workbook comment thread between an author organisation and Akana staff
-- (F-039 gap), and the database rate limits F-143 still lacked.
--
-- Depends on 0001 to 0025 only (applied in production). Nothing earlier is
-- edited. One function from 0022, app.lookup_account, is replaced with the
-- same signature so the lookup also returns the ids the actions need
-- (entitlement ids, the deletion state). Same rules as before: every new
-- table has RLS on, grants to anon and authenticated are revoked and given
-- back narrowly, every function is security definer with search_path pinned
-- to '', and PostgREST reaches thin public wrappers.
--
-- What this adds:
--   * Lookup actions (F-087). Four actions, no more:
--       refund             reuses 0021 public.record_refund from the refund
--                          path in the app (owner and finance). Nothing new
--                          here.
--       resend an email    public.staff_resend_context: checks the role,
--                          the reason and that the purchase or membership
--                          belongs to the reader, audits, and hands back
--                          what the email needs. Owners, editors, support.
--                          Five resends per reader in 24 hours.
--       restore access     public.staff_restore_access: re-activates a
--                          revoked or lapsed purchase or gift entitlement,
--                          or grants a gift entitlement for one workbook
--                          code. Never membership, seat, tenant or free-unit
--                          rows: those follow their own records. Never a
--                          title under an active takedown. Owners, support.
--       cancel a deletion  public.staff_cancel_deletion: the reader's own
--                          0007 cancel, done for them inside the undo
--                          window, with a reason. Owners, support.
--     Every action needs a reason of 5 to 500 characters, writes one audit
--     row, and counts towards 30 support actions an hour per member of staff.
--   * Workbook comments (F-039). One thread per workbook. Plain text, up to
--     2000 characters, no attachments. Organisation members who may read
--     workbooks read it; owners, editors and authors post. Reviewers (owner,
--     editor, safety reviewer) read and post for Akana. Append-only. Every
--     post is audited without its text. The post says whether to notify the
--     other side: not when the same side posted on the same thread in the
--     last 10 minutes, so a burst of comments sends one email. The service
--     role reads who to notify (public.workbook_comment_recipients). The
--     email never carries the comment text.
--   * Rate limits (F-143). A small counter table with fixed rules, in the
--     shape 0005 uses: an advisory lock per key makes the count and the
--     insert one step. Keys are salted hashes from the server, or a hash of
--     the caller's own user id. Rules:
--       signin_email        5 an hour     magic link requests per address
--       signin_ip           20 an hour    magic link requests per address IP
--       checkout_user       10 an hour    Checkout Sessions per reader
--       export_user         10 an hour    answer downloads per reader
--       partner_respond_ip  30 in 10 min  check-in partner link actions
--     The contact, enquiry and takedown forms already limit in their own
--     functions (0005, 0016, 0022) and are not changed.
--
-- Error codes, for the server to map:
--   AKX01  not allowed (wrong role, or not signed in)
--   AKX02  a field failed validation (the message names the field)
--   AKX04  not found (or not this reader's)
--   AKX08  not in a state that allows this
--   AKX29  rate limited

-- ===========================================================================
-- 1. Rate limits (F-143)
-- ===========================================================================

create table public.rate_limit_rules (
  bucket         text primary key check (bucket ~ '^[a-z_]{1,40}$'),
  max_hits       int not null check (max_hits between 1 and 10000),
  window_seconds int not null check (window_seconds between 10 and 86400),
  -- true: a signed-in caller may count against their own user id
  self_service   boolean not null default false
);
insert into public.rate_limit_rules (bucket, max_hits, window_seconds, self_service) values
  ('signin_email', 5, 3600, false),
  ('signin_ip', 20, 3600, false),
  ('checkout_user', 10, 3600, true),
  ('export_user', 10, 3600, true),
  ('partner_respond_ip', 30, 600, false)
on conflict (bucket) do nothing;

create table public.rate_hits (
  id       bigint generated always as identity primary key,
  bucket   text not null references public.rate_limit_rules(bucket),
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  at       timestamptz not null default now()
);
create index rate_hits_key_idx on public.rate_hits(bucket, key_hash, at desc);
create index rate_hits_at_idx on public.rate_hits(at);

-- Count one attempt. True when it is allowed (and counted), false when the
-- key is over the limit (and not counted, so a blocked caller does not keep
-- extending their own window).
create or replace function app.rate_hit(p_bucket text, p_key_hash text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  r public.rate_limit_rules%rowtype;
  n int;
begin
  select * into r from public.rate_limit_rules x where x.bucket = p_bucket;
  if not found then
    raise exception 'rate_invalid: bucket' using errcode = 'AKX02';
  end if;
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'rate_invalid: key' using errcode = 'AKX02';
  end if;
  perform pg_advisory_xact_lock(hashtext('rate:' || p_bucket || ':' || p_key_hash));
  select count(*) into n from public.rate_hits h
   where h.bucket = p_bucket and h.key_hash = p_key_hash and h.at > now() - make_interval(secs => r.window_seconds);
  if n >= r.max_hits then
    return false;
  end if;
  insert into public.rate_hits (bucket, key_hash) values (p_bucket, p_key_hash);
  return true;
end $$;

-- Server code (service role) with a salted hash of an email or an IP.
create or replace function public.rate_limit_hit(p_bucket text, p_key_hash text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not app.is_service_role() then
    raise exception 'only the service role counts by key' using errcode = 'insufficient_privilege';
  end if;
  return app.rate_hit(p_bucket, p_key_hash);
end $$;

-- A signed-in reader counts against their own user id, for buckets marked
-- self_service. The key is a hash of the user id, so the table holds no id.
create or replace function public.rate_limit_self(p_bucket text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := app.uid();
begin
  if v_uid is null then
    raise exception 'sign in first' using errcode = 'AKX01';
  end if;
  if not exists (select 1 from public.rate_limit_rules x where x.bucket = p_bucket and x.self_service) then
    raise exception 'rate_invalid: bucket' using errcode = 'AKX02';
  end if;
  return app.rate_hit(p_bucket,
    encode(pg_catalog.sha256(pg_catalog.convert_to(p_bucket || ':' || v_uid::text, 'UTF8')), 'hex'));
end $$;

-- Daily sweep: nothing older than the longest window (a day) is needed.
create or replace function public.prune_rate_hits() returns bigint
language plpgsql volatile security definer set search_path = '' as $$
declare n bigint;
begin
  if not app.is_service_role() then
    raise exception 'only the service role prunes rate counts' using errcode = 'insufficient_privilege';
  end if;
  delete from public.rate_hits where at < now() - interval '1 day';
  get diagnostics n = row_count;
  return n;
end $$;

-- ===========================================================================
-- 2. Account lookup, with the ids the actions need (replaces 0022's body)
-- ===========================================================================

-- Same checks, audit row and rate limit as 0022. Adds the entitlement id and
-- its workbook's takedown state, so staff can pick the row to restore. Still
-- nothing about enrolments, answers, progress, check-ins or partners, and
-- workbooks by AK code only.
create or replace function app.lookup_account(p_email text, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_hash   text;
  v_user   jsonb;
  v_uid    uuid;
  v_recent int;
  v_out    jsonb;
begin
  if app.uid() is null or not app.can_lookup_accounts() then
    raise exception 'only owners, editors and support look up accounts' using errcode = 'AKD01';
  end if;
  if v_email = '' or char_length(v_email) > 254 or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'lookup_invalid: email' using errcode = 'AKD02';
  end if;
  if v_reason is null or char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception 'lookup_invalid: reason (5 to 500 characters)' using errcode = 'AKD02';
  end if;

  perform pg_advisory_xact_lock(hashtext('lookup:' || app.uid()::text));
  select count(*) into v_recent from public.audit_log
   where actor = app.uid() and action = 'account.lookup' and at > now() - interval '1 hour';
  if v_recent >= 60 then
    raise exception 'rate_limited: too many lookups this hour' using errcode = 'AKD29';
  end if;

  v_hash := encode(pg_catalog.sha256(pg_catalog.convert_to(v_email, 'UTF8')), 'hex');

  select u.id, jsonb_build_object(
           'id', u.id,
           'email', u.email,
           'created_at', u.created_at,
           'email_confirmed_at', to_jsonb(u) -> 'email_confirmed_at',
           'last_sign_in_at', to_jsonb(u) -> 'last_sign_in_at',
           'banned_until', to_jsonb(u) -> 'banned_until',
           'staff', exists (select 1 from public.platform_roles pr where pr.user_id = u.id))
    into v_uid, v_user
    from auth.users u
   where lower(u.email::text) = v_email
   limit 1;

  perform app.audit('account.lookup',
    case when v_uid is null then 'lookup:no_match' else 'user:' || v_uid::text end,
    v_reason, null, null, null,
    jsonb_build_object('found', v_uid is not null, 'email_sha256', v_hash));

  if v_uid is null then
    return jsonb_build_object('found', false);
  end if;

  select jsonb_build_object(
    'found', true,
    'user', v_user,
    'profile', (select jsonb_build_object(
        'display_name', p.display_name, 'locale', p.locale, 'country', p.country,
        'adult_confirmed_at', p.adult_confirmed_at, 'created_at', p.created_at)
      from public.profiles p where p.user_id = v_uid),
    'consents', (select jsonb_build_object(
        'health_at', p.health_consent_at, 'health_version', p.health_consent_version,
        'faith_at', p.faith_consent_at, 'faith_version', p.faith_consent_version)
      from public.profiles p where p.user_id = v_uid),
    'terms', coalesce((select jsonb_agg(jsonb_build_object(
        'doc', t.doc, 'version', t.version, 'context', t.context, 'was_draft', t.was_draft, 'accepted_at', t.accepted_at)
        order by t.doc)
      from (select distinct on (a.doc) a.doc, a.version, a.context, a.was_draft, a.accepted_at
              from public.terms_acceptances a where a.user_id = v_uid
             order by a.doc, a.accepted_at desc, a.id desc) t), '[]'::jsonb),
    'deletion', (select jsonb_build_object(
        'requested_at', d.requested_at, 'cancel_before', d.cancel_before,
        'cancelled_at', d.cancelled_at, 'completed_at', d.completed_at, 'auth_removed_at', d.auth_removed_at,
        'state', case when d.completed_at is not null then 'completed'
                      when d.cancelled_at is not null then 'cancelled'
                      else 'pending' end,
        'can_cancel', d.completed_at is null and d.cancelled_at is null and d.cancel_before > now())
      from public.account_deletion_requests d where d.user_id = v_uid),
    'purchases', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'kind', p.kind, 'workbook_code', w.code, 'currency', p.currency,
        'amount_minor', p.amount_minor, 'tax_minor', p.tax_minor, 'status', p.status,
        'created_at', p.created_at, 'paid_at', p.paid_at, 'refunded_at', p.refunded_at,
        'stripe_payment_intent_id', p.stripe_payment_intent_id) order by p.created_at desc)
      from public.purchases p left join public.workbooks w on w.id = p.workbook_id
     where p.user_id = v_uid), '[]'::jsonb),
    'subscriptions', coalesce((select jsonb_agg(jsonb_build_object(
        'plan', s.plan, 'status', s.status, 'current_period_end', s.current_period_end,
        'cancel_at_period_end', s.cancel_at_period_end, 'cancel_at', s.cancel_at,
        'canceled_at', s.canceled_at, 'ended_at', s.ended_at, 'past_due_since', s.past_due_since,
        'created_at', s.created_at, 'stripe_subscription_id', s.stripe_subscription_id) order by s.created_at desc)
      from public.subscriptions s where s.user_id = v_uid), '[]'::jsonb),
    'entitlements', coalesce((select jsonb_agg(jsonb_build_object(
        'id', e.id, 'workbook_code', w.code, 'source', e.source, 'status', e.status,
        'starts_at', e.starts_at, 'ends_at', e.ends_at,
        'taken_down', case when e.workbook_id is null then false else app.workbook_taken_down(e.workbook_id) end)
        order by e.created_at desc)
      from public.entitlements e left join public.workbooks w on w.id = e.workbook_id
     where e.user_id = v_uid), '[]'::jsonb),
    'lookups', coalesce((select jsonb_agg(jsonb_build_object('at', l.at, 'actor_role', l.actor_role, 'reason', l.reason) order by l.at desc)
      from (select a.at, a.actor_role, a.reason from public.audit_log a
             where a.action = 'account.lookup' and a.target = 'user:' || v_uid::text
             order by a.at desc limit 10) l), '[]'::jsonb),
    'actions', coalesce((select jsonb_agg(jsonb_build_object('at', a.at, 'action', a.action, 'actor_role', a.actor_role, 'reason', a.reason) order by a.at desc)
      from (select x.at, x.action, x.actor_role, x.reason from public.audit_log x
             where x.target = 'user:' || v_uid::text
               and x.action in ('account.access_restored', 'account.email_resent', 'account.deletion_cancelled_by_staff')
             order by x.at desc limit 10) a), '[]'::jsonb)
  ) into v_out;
  return v_out;
end $$;

-- ===========================================================================
-- 3. Lookup actions (F-087)
-- ===========================================================================

-- Owners and support restore access and cancel deletions. Editors look
-- accounts up and resend service emails, nothing more.
create or replace function app.can_support_act() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_platform(array['owner','support'])
$$;

-- The shared checks: signed in with the role, a reason, the reader exists,
-- and under 30 support actions an hour for this member of staff.
create or replace function app.support_action_checks(p_user uuid, p_reason text, p_allowed boolean) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_reason text := app.clean_text(p_reason, 600);
  n int;
begin
  if app.uid() is null or not coalesce(p_allowed, false) then
    raise exception 'your role cannot take this action' using errcode = 'AKX01';
  end if;
  if v_reason is null or char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception 'support_invalid: reason (5 to 500 characters)' using errcode = 'AKX02';
  end if;
  if p_user is null or not exists (select 1 from auth.users u where u.id = p_user) then
    raise exception 'support_invalid: reader' using errcode = 'AKX04';
  end if;
  perform pg_advisory_xact_lock(hashtext('support:' || app.uid()::text));
  select count(*) into n from public.audit_log a
   where a.actor = app.uid() and a.at > now() - interval '1 hour'
     and a.action in ('account.access_restored', 'account.email_resent', 'account.deletion_cancelled_by_staff');
  if n >= 30 then
    raise exception 'rate_limited: too many support actions this hour' using errcode = 'AKX29';
  end if;
  return v_reason;
end $$;

-- Restore access. Either p_entitlement (a revoked or lapsed purchase or gift
-- row of this reader) or p_workbook_code (grant a gift for one live or
-- paused title). p_ends_at is for gifts only: null means no end, otherwise
-- it must be in the future and within two years. Returns the entitlement id.
create or replace function app.staff_restore_access(
  p_user uuid, p_entitlement uuid, p_workbook_code text, p_ends_at timestamptz, p_reason text
) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_reason   text;
  e          public.entitlements%rowtype;
  w          public.workbooks%rowtype;
  v_id       uuid;
  v_refunded boolean := false;
  v_code     text := upper(btrim(coalesce(p_workbook_code, '')));
begin
  v_reason := app.support_action_checks(p_user, p_reason, app.can_support_act());
  if (p_entitlement is null) = (v_code = '') then
    raise exception 'support_invalid: choose an access row or a workbook code' using errcode = 'AKX02';
  end if;
  if exists (select 1 from public.account_deletion_requests d where d.user_id = p_user and d.completed_at is not null) then
    raise exception 'this account has been deleted' using errcode = 'AKX08';
  end if;
  if p_ends_at is not null and (p_ends_at <= now() or p_ends_at > now() + interval '2 years') then
    raise exception 'support_invalid: ends_at (in the future, within two years)' using errcode = 'AKX02';
  end if;

  if p_entitlement is not null then
    select * into e from public.entitlements x where x.id = p_entitlement and x.user_id = p_user for update;
    if not found then
      raise exception 'support_invalid: access row' using errcode = 'AKX04';
    end if;
    if e.source not in ('purchase', 'gift') then
      raise exception 'membership, seat and free access follow their own records' using errcode = 'AKX08';
    end if;
    if e.status = 'active' and (e.ends_at is null or e.ends_at > now()) then
      raise exception 'this access is already active' using errcode = 'AKX08';
    end if;
    if e.workbook_id is not null and app.workbook_taken_down(e.workbook_id) then
      raise exception 'the title is taken down; reinstate it first' using errcode = 'AKX08';
    end if;
    if e.source = 'purchase' and e.purchase_id is not null then
      select p.status = 'refunded' into v_refunded from public.purchases p where p.id = e.purchase_id;
    end if;
    update public.entitlements
       set status = 'active',
           ends_at = case when e.source = 'gift' then p_ends_at else null end
     where id = e.id;
    v_id := e.id;
    select * into w from public.workbooks x where x.id = e.workbook_id;
    perform app.audit('account.access_restored', 'user:' || p_user::text, v_reason, e.tenant_id, w.org_id,
      jsonb_build_object('status', e.status, 'ends_at', e.ends_at),
      jsonb_build_object('entitlement_id', e.id, 'workbook_code', w.code, 'source', e.source,
        'ends_at', case when e.source = 'gift' then p_ends_at else null end, 'purchase_refunded', coalesce(v_refunded, false)));
    return v_id;
  end if;

  if v_code !~ '^AK-[0-9A-Z]{5}$' then
    raise exception 'support_invalid: workbook code' using errcode = 'AKX02';
  end if;
  select * into w from public.workbooks x where x.code = v_code;
  if not found then
    raise exception 'support_invalid: workbook code' using errcode = 'AKX04';
  end if;
  if w.status not in ('live', 'paused') or w.is_demo then
    raise exception 'only a live or paused title can be given' using errcode = 'AKX08';
  end if;
  if app.workbook_taken_down(w.id) then
    raise exception 'the title is taken down' using errcode = 'AKX08';
  end if;
  insert into public.entitlements (user_id, tenant_id, workbook_id, source, status, starts_at, ends_at)
  values (p_user, w.tenant_id, w.id, 'gift', 'active', now(), p_ends_at)
  on conflict on constraint entitlements_user_tenant_workbook_source_licence_key
  do update set status = 'active', starts_at = now(), ends_at = excluded.ends_at
  returning id into v_id;
  perform app.audit('account.access_restored', 'user:' || p_user::text, v_reason, w.tenant_id, w.org_id, null,
    jsonb_build_object('entitlement_id', v_id, 'workbook_code', w.code, 'source', 'gift', 'ends_at', p_ends_at));
  return v_id;
end $$;

-- Cancel a pending deletion for the reader, inside the undo window. Returns
-- the address and first name for the confirmation email.
create or replace function app.staff_cancel_deletion(p_user uuid, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_reason text;
  r        public.account_deletion_requests%rowtype;
  v_email  text;
  v_name   text;
begin
  v_reason := app.support_action_checks(p_user, p_reason, app.can_support_act());
  update public.account_deletion_requests
     set cancelled_at = now()
   where user_id = p_user and cancelled_at is null and completed_at is null and cancel_before > now()
   returning * into r;
  if not found then
    raise exception 'there is no deletion to cancel' using errcode = 'AKX08';
  end if;
  select lower(u.email::text) into v_email from auth.users u where u.id = p_user;
  select p.display_name into v_name from public.profiles p where p.user_id = p_user;
  perform app.audit('account.deletion_cancelled_by_staff', 'user:' || p_user::text, v_reason, null, null,
    jsonb_build_object('requested_at', r.requested_at, 'cancel_before', r.cancel_before),
    jsonb_build_object('cancelled_at', r.cancelled_at));
  return jsonb_build_object('email', v_email, 'name', v_name, 'requested_at', r.requested_at);
end $$;

-- Resend a service email. p_kind 'purchase' takes a purchase id (a paid
-- single workbook); 'membership' takes a Stripe subscription id that is
-- active, trialing or past due. Returns what the email needs: the address,
-- first name, amount and currency, and for a membership the plan and next
-- payment date. Five resends per reader in 24 hours, whoever sends them.
create or replace function app.staff_resend_context(p_user uuid, p_kind text, p_ref text, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_reason text;
  v_email  text;
  v_name   text;
  n        int;
  p        public.purchases%rowtype;
  s        public.subscriptions%rowtype;
  v_amount bigint;
  v_cur    text;
  v_out    jsonb;
begin
  v_reason := app.support_action_checks(p_user, p_reason, app.can_lookup_accounts());
  if p_kind is null or p_kind not in ('purchase', 'membership') then
    raise exception 'support_invalid: kind' using errcode = 'AKX02';
  end if;
  if exists (select 1 from public.account_deletion_requests d where d.user_id = p_user and d.completed_at is not null) then
    raise exception 'this account has been deleted' using errcode = 'AKX08';
  end if;
  select count(*) into n from public.audit_log a
   where a.action = 'account.email_resent' and a.target = 'user:' || p_user::text and a.at > now() - interval '24 hours';
  if n >= 5 then
    raise exception 'rate_limited: five emails resent to this reader today' using errcode = 'AKX29';
  end if;
  select lower(u.email::text) into v_email from auth.users u where u.id = p_user;
  if v_email is null then
    raise exception 'the reader has no email address' using errcode = 'AKX08';
  end if;
  select pr.display_name into v_name from public.profiles pr where pr.user_id = p_user;

  if p_kind = 'purchase' then
    if p_ref is null or p_ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'support_invalid: purchase' using errcode = 'AKX02';
    end if;
    select * into p from public.purchases x where x.id = p_ref::uuid and x.user_id = p_user;
    if not found then
      raise exception 'support_invalid: purchase' using errcode = 'AKX04';
    end if;
    if p.kind <> 'workbook' or p.status <> 'paid' then
      raise exception 'only a paid single workbook has a purchase email' using errcode = 'AKX08';
    end if;
    v_out := jsonb_build_object('kind', 'purchase', 'email', v_email, 'name', v_name,
      'amount_minor', p.amount_minor, 'currency', p.currency, 'ref', p.id);
  else
    if p_ref is null or p_ref !~ '^sub_[A-Za-z0-9]+$' then
      raise exception 'support_invalid: membership' using errcode = 'AKX02';
    end if;
    select * into s from public.subscriptions x where x.stripe_subscription_id = p_ref and x.user_id = p_user;
    if not found then
      raise exception 'support_invalid: membership' using errcode = 'AKX04';
    end if;
    if s.status not in ('active', 'trialing', 'past_due') then
      raise exception 'only a current membership has a membership email' using errcode = 'AKX08';
    end if;
    select i.amount_minor, i.currency into v_amount, v_cur from public.subscription_invoices i
     where i.stripe_subscription_id = s.stripe_subscription_id and i.status = 'paid'
     order by coalesce(i.paid_at, i.created_at) desc limit 1;
    if v_amount is null and s.plan is not null then
      select (pp.amounts ->> 'GBP')::bigint, 'GBP' into v_amount, v_cur from public.price_points pp where pp.id = s.plan;
    end if;
    v_out := jsonb_build_object('kind', 'membership', 'email', v_email, 'name', v_name,
      'amount_minor', v_amount, 'currency', v_cur, 'plan', s.plan, 'current_period_end', s.current_period_end,
      'ref', s.stripe_subscription_id);
  end if;

  perform app.audit('account.email_resent', 'user:' || p_user::text, v_reason, null, null, null,
    jsonb_build_object('kind', p_kind, 'ref', p_ref));
  return v_out;
end $$;

-- ===========================================================================
-- 4. Workbook comments (F-039)
-- ===========================================================================

create table public.workbook_comments (
  id          uuid primary key default gen_random_uuid(),
  workbook_id uuid not null references public.workbooks(id),
  org_id      uuid not null references public.organisations(id),
  author_id   uuid references auth.users(id) on delete set null,
  side        text not null check (side in ('org', 'staff')),
  author_name text not null check (char_length(author_name) between 1 and 120),
  body        text not null check (char_length(body) between 1 and 2000),
  created_at  timestamptz not null default now()
);
create index workbook_comments_thread_idx on public.workbook_comments(workbook_id, created_at);
create index workbook_comments_author_idx on public.workbook_comments(author_id);

-- Append-only. The one change allowed is the author link going to null when
-- an account is removed (the foreign key's on delete set null).
create or replace function app.workbook_comments_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'comments are kept: add a new comment instead' using errcode = 'insufficient_privilege';
  end if;
  if new.author_id is null and old.author_id is not null
     and (new.id, new.workbook_id, new.org_id, new.side, new.author_name, new.body, new.created_at)
         is not distinct from (old.id, old.workbook_id, old.org_id, old.side, old.author_name, old.body, old.created_at) then
    return new;
  end if;
  raise exception 'comments are kept: add a new comment instead' using errcode = 'insufficient_privilege';
end $$;
create trigger workbook_comments_append_only before update or delete on public.workbook_comments
  for each row execute function app.workbook_comments_guard();

-- Who may read a thread: reviewers, and organisation members who may read
-- the organisation's workbooks.
create or replace function app.can_read_comments(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_reviewer() or app.org_can(p_org, 'workbooks', 'read')
$$;

-- Post a comment. Reviewers post for Akana; owners, editors and authors of
-- the organisation post for it. 20 comments an hour per person.
create or replace function app.workbook_comment_post(p_workbook uuid, p_body text)
returns table (comment_id uuid, side text, notify boolean)
language plpgsql volatile security definer set search_path = '' as $$
declare
  w       public.workbooks%rowtype;
  v_side  text;
  v_body  text := app.clean_multiline(p_body, 2001);
  v_name  text;
  v_id    uuid;
  v_quiet boolean;
  n       int;
begin
  if app.uid() is null then
    raise exception 'sign in first' using errcode = 'AKX01';
  end if;
  select * into w from public.workbooks x where x.id = p_workbook;
  if not found then
    raise exception 'comment_invalid: workbook' using errcode = 'AKX04';
  end if;
  if app.is_reviewer() then
    v_side := 'staff';
  elsif app.org_can(w.org_id, 'workbooks', 'write') then
    v_side := 'org';
  elsif app.org_can(w.org_id, 'workbooks', 'read') then
    raise exception 'owners, editors and authors post comments' using errcode = 'AKX01';
  else
    raise exception 'comment_invalid: workbook' using errcode = 'AKX04';
  end if;
  if v_body is null or char_length(v_body) > 2000 then
    raise exception 'comment_invalid: body (1 to 2000 characters)' using errcode = 'AKX02';
  end if;

  perform pg_advisory_xact_lock(hashtext('comment:' || app.uid()::text));
  select count(*) into n from public.audit_log a
   where a.actor = app.uid() and a.action = 'workbook.comment' and a.at > now() - interval '1 hour';
  if n >= 20 then
    raise exception 'rate_limited: too many comments this hour' using errcode = 'AKX29';
  end if;

  select left(coalesce(nullif(btrim(p.display_name), ''), case when v_side = 'staff' then 'Akana team' else 'A team member' end), 120)
    into v_name from public.profiles p where p.user_id = app.uid();
  v_name := coalesce(v_name, case when v_side = 'staff' then 'Akana team' else 'A team member' end);

  select not exists (
    select 1 from public.workbook_comments c
     where c.workbook_id = w.id and c.side = v_side and c.created_at > now() - interval '10 minutes')
    into v_quiet;

  insert into public.workbook_comments (workbook_id, org_id, author_id, side, author_name, body)
  values (w.id, w.org_id, app.uid(), v_side, v_name, v_body)
  returning id into v_id;
  perform app.audit('workbook.comment', 'workbook:' || w.id::text, null, w.tenant_id, w.org_id, null,
    jsonb_build_object('comment_id', v_id, 'side', v_side, 'chars', char_length(v_body)));
  return query select v_id, v_side, v_quiet;
end $$;

-- Who to tell about a comment: the other side, never the comment's author.
-- A staff comment goes to the organisation's owners, editors and authors. An
-- organisation comment goes to the reviewers assigned to the workbook's
-- versions and any member of staff who has posted on the thread. Service
-- role only. An empty staff list means the app uses its review inbox.
create or replace function app.workbook_comment_recipients(p_comment uuid)
returns table (email text, display_name text, audience text, workbook_code text, workbook_title text, workbook_id uuid)
language plpgsql stable security definer set search_path = '' as $$
declare
  c public.workbook_comments%rowtype;
  w public.workbooks%rowtype;
begin
  if not app.is_service_role() then
    raise exception 'only the service role reads comment recipients' using errcode = 'insufficient_privilege';
  end if;
  select * into c from public.workbook_comments x where x.id = p_comment;
  if not found then return; end if;
  select * into w from public.workbooks x where x.id = c.workbook_id;
  if c.side = 'staff' then
    return query
      select lower(u.email)::text, p.display_name, 'org'::text, w.code, w.title, w.id
        from public.org_members m
        join public.organisations o on o.id = m.org_id and o.kind <> 'akana_house'
        join auth.users u on u.id = m.user_id
        left join public.profiles p on p.user_id = m.user_id
       where m.org_id = w.org_id and m.role in ('owner', 'editor', 'author')
         and u.email is not null and m.user_id is distinct from c.author_id
       order by case m.role when 'owner' then 0 when 'author' then 1 else 2 end, m.created_at
       limit 20;
  else
    return query
      select lower(u.email)::text, p.display_name, 'staff'::text, w.code, null::text, w.id
        from (select a.assignee as uid from public.review_assignments a
                join public.workbook_versions v on v.id = a.version_id
               where v.workbook_id = w.id
              union
              select x.author_id from public.workbook_comments x
               where x.workbook_id = w.id and x.side = 'staff' and x.author_id is not null) s
        join auth.users u on u.id = s.uid
        left join public.profiles p on p.user_id = s.uid
       where u.email is not null and s.uid is distinct from c.author_id
         and exists (select 1 from public.platform_roles pr where pr.user_id = s.uid
                      and pr.role in ('owner', 'editor', 'safety_reviewer'))
       limit 20;
  end if;
end $$;

-- ===========================================================================
-- 5. Public wrappers
-- ===========================================================================

create or replace function public.staff_restore_access(p_user uuid, p_entitlement uuid, p_workbook_code text, p_ends_at timestamptz, p_reason text)
returns uuid
language sql volatile security invoker set search_path = '' as $$
  select app.staff_restore_access(p_user, p_entitlement, p_workbook_code, p_ends_at, p_reason)
$$;
create or replace function public.staff_cancel_deletion(p_user uuid, p_reason text) returns jsonb
language sql volatile security invoker set search_path = '' as $$
  select app.staff_cancel_deletion(p_user, p_reason)
$$;
create or replace function public.staff_resend_context(p_user uuid, p_kind text, p_ref text, p_reason text) returns jsonb
language sql volatile security invoker set search_path = '' as $$
  select app.staff_resend_context(p_user, p_kind, p_ref, p_reason)
$$;
create or replace function public.workbook_comment_post(p_workbook uuid, p_body text)
returns table (comment_id uuid, side text, notify boolean)
language sql volatile security invoker set search_path = '' as $$
  select * from app.workbook_comment_post(p_workbook, p_body)
$$;
create or replace function public.workbook_comment_recipients(p_comment uuid)
returns table (email text, display_name text, audience text, workbook_code text, workbook_title text, workbook_id uuid)
language sql stable security invoker set search_path = '' as $$
  select * from app.workbook_comment_recipients(p_comment)
$$;

-- ===========================================================================
-- 6. Row level security and grants
-- ===========================================================================

alter table public.rate_limit_rules  enable row level security;
alter table public.rate_hits         enable row level security;
alter table public.workbook_comments enable row level security;
revoke all on public.rate_limit_rules, public.rate_hits, public.workbook_comments from anon, authenticated;

-- Rate tables: no client reads or writes them. The functions do.
grant select, insert, delete on public.rate_hits to service_role;
grant select on public.rate_limit_rules to service_role;

-- Comments: read under the policy, written only through the function.
grant select on public.workbook_comments to authenticated;
grant select on public.workbook_comments to service_role;
create policy workbook_comments_read on public.workbook_comments for select to authenticated
  using ((select app.can_read_comments(org_id)));

-- Internal helpers.
revoke execute on function app.rate_hit(text, text) from public, anon, authenticated;
revoke execute on function app.can_support_act() from public, anon;
revoke execute on function app.support_action_checks(uuid, text, boolean) from public, anon, authenticated;
revoke execute on function app.staff_restore_access(uuid, uuid, text, timestamptz, text) from public, anon;
revoke execute on function app.staff_cancel_deletion(uuid, text) from public, anon;
revoke execute on function app.staff_resend_context(uuid, text, text, text) from public, anon;
revoke execute on function app.can_read_comments(uuid) from public, anon;
revoke execute on function app.workbook_comment_post(uuid, text) from public, anon;
revoke execute on function app.workbook_comment_recipients(uuid) from public, anon, authenticated;
revoke execute on function app.workbook_comments_guard() from public, anon, authenticated;
grant execute on function app.can_support_act() to authenticated;
grant execute on function app.staff_restore_access(uuid, uuid, text, timestamptz, text) to authenticated;
grant execute on function app.staff_cancel_deletion(uuid, text) to authenticated;
grant execute on function app.staff_resend_context(uuid, text, text, text) to authenticated;
grant execute on function app.can_read_comments(uuid) to authenticated;
grant execute on function app.workbook_comment_post(uuid, text) to authenticated;
grant execute on function app.workbook_comment_recipients(uuid) to service_role;

-- Public functions.
revoke execute on function public.rate_limit_hit(text, text) from public, anon, authenticated;
revoke execute on function public.rate_limit_self(text) from public, anon;
revoke execute on function public.prune_rate_hits() from public, anon, authenticated;
revoke execute on function public.staff_restore_access(uuid, uuid, text, timestamptz, text) from public, anon;
revoke execute on function public.staff_cancel_deletion(uuid, text) from public, anon;
revoke execute on function public.staff_resend_context(uuid, text, text, text) from public, anon;
revoke execute on function public.workbook_comment_post(uuid, text) from public, anon;
revoke execute on function public.workbook_comment_recipients(uuid) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, text) to service_role;
grant execute on function public.rate_limit_self(text) to authenticated;
grant execute on function public.prune_rate_hits() to service_role;
grant execute on function public.staff_restore_access(uuid, uuid, text, timestamptz, text) to authenticated;
grant execute on function public.staff_cancel_deletion(uuid, text) to authenticated;
grant execute on function public.staff_resend_context(uuid, text, text, text) to authenticated;
grant execute on function public.workbook_comment_post(uuid, text) to authenticated;
grant execute on function public.workbook_comment_recipients(uuid) to service_role;
