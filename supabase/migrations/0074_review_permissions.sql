-- 0074 Permissions from the 21 November 2026 review.
--
-- Eight findings, all about who may do what in the database.
--
--   H1  workbooks: the table-wide insert and update grant to signed-in
--       callers goes. No page writes the table directly; Studio and staff
--       write through functions, which run as the owner and are unchanged.
--   H2  organisations: the table-wide update grant goes, for the same reason.
--   M2  org_members: client insert, update and delete go. Membership changes
--       run through the invitation and member functions (0013, gated by 0032).
--   M1  Staff power needs a second-factor session and a row in
--       platform_roles. The token claim alone gives nothing.
--   M4  The three public forms that take an address hash (enquiry, contact,
--       takedown) are for the service role only, as the newsletter and the
--       title request already are. The server makes the hash.
--   L1  mfa_recovery_codes and mfa_recovery_attempts lose the default grants
--       a Supabase project gives new public tables. So do the sequences in
--       public and five service-role functions, found the same way.
--   L5  record_signoff applies the publisher rule that author_signoff has.
--   M14 referral_claim_reward locks on the referrer before it counts towards
--       the yearly cap.
--
-- A column added to workbooks, organisations or org_members later is not
-- writable by a client, because no client holds a write grant on the table.
--
-- Safe to run twice. Depends on 0001 to 0072 only.

-- ---------------------------------------------------------------------------
-- 1. H1, H2, M2: no direct client writes on the three tables.
-- ---------------------------------------------------------------------------
-- Every write the app makes on these tables goes through a security definer
-- function (checked against apps/web and the catalogue: no invoker function
-- and no client call writes them). The row policies stay; without a grant
-- they have nothing to allow. Staff changes run through the staff functions
-- and the service role, as before.
revoke insert, update, delete, truncate, references, trigger on public.workbooks from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.organisations from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.org_members from public, anon, authenticated;

-- A column grant would survive the table revoke, so clear any that exist.
do $$
declare c record;
begin
  for c in
    select a.attrelid::regclass as tbl, a.attname
      from pg_attribute a
     where a.attrelid in ('public.workbooks'::regclass, 'public.organisations'::regclass, 'public.org_members'::regclass)
       and a.attnum > 0 and not a.attisdropped and a.attacl is not null
  loop
    execute format('revoke insert (%1$I), update (%1$I), references (%1$I) on %2$s from public, anon, authenticated', c.attname, c.tbl);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. M1: staff power needs a second factor and a platform_roles row.
-- ---------------------------------------------------------------------------
-- The roles the signed token names. This was app.platform_roles() in 0001.
-- It says who must enrol a second factor; it gives no power on its own.
create or replace function app.claimed_platform_roles() returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(
    array(select jsonb_array_elements_text(
      case when jsonb_typeof(c.j -> 'app_metadata' -> 'platform_roles') = 'array'
           then c.j -> 'app_metadata' -> 'platform_roles' else '[]'::jsonb end)),
    '{}'::text[])
  from (select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb as j) c
$$;

-- Does this account hold a staff role, by the token or by the table? Used
-- only to decide that a second factor is required, never to give access. A
-- staff member who has not enrolled yet (aal1) is still held to the rule.
create or replace function app.holds_platform_role() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.uid() is not null and (
    cardinality(app.claimed_platform_roles()) > 0
    or exists (select 1 from public.platform_roles r where r.user_id = app.uid()))
$$;

-- The roles this session may use. Each must be named in the token and still
-- be held in platform_roles, and the session must have passed a second
-- factor (aal2, 0032). A removed role stops at once, even on a token that has
-- not expired; a staff token without the second factor gets nothing.
-- app.is_platform and app.is_staff (0001) read this, and so do the helpers
-- built on them (app.studio_staff, app.is_money_staff), every staff function
-- and every staff read policy. The service role never had staff roles and is
-- recognised by app.is_service_role(), so its paths are unchanged.
create or replace function app.platform_roles() returns text[]
language sql stable security definer set search_path = '' as $$
  select case
    when app.uid() is null or not app.session_mfa_verified() then '{}'::text[]
    else coalesce(
      array(select r.role from public.platform_roles r
             where r.user_id = app.uid() and r.role = any (app.claimed_platform_roles())
             order by r.role),
      '{}'::text[])
  end
$$;

revoke execute on function app.claimed_platform_roles(), app.holds_platform_role() from public, anon, authenticated;

-- Three checks asked "is this person staff" to hold them to a rule, not to
-- give them anything. They now ask app.holds_platform_role(), so a staff
-- account at aal1 is still told to verify and is still refused self-service
-- recovery codes. Bodies otherwise as in 0032 and 0037.
create or replace function app.role_mfa_required(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.uid() is not null and (
    app.holds_platform_role()
    or (p_org is not null and exists (
      select 1 from public.org_members m
       where m.org_id = p_org and m.user_id = app.uid() and m.role in ('owner', 'finance'))))
$$;

create or replace function app.role_mfa_status()
returns table (required boolean, verified boolean)
language sql stable security definer set search_path = '' as $$
  select app.uid() is not null and (app.holds_platform_role() or exists (
           select 1 from public.org_members m where m.user_id = app.uid() and m.role in ('owner', 'finance'))),
         app.session_mfa_verified()
$$;

create or replace function app.mfa_recovery_reader_only() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if app.uid() is null then
    raise exception 'sign in first' using errcode = 'AKR01';
  end if;
  if app.holds_platform_role() or exists (
    select 1 from public.org_members m where m.user_id = app.uid() and m.role in ('owner', 'finance')) then
    raise exception 'this account''s second factor is managed by support' using errcode = 'AKR03';
  end if;
end $$;

-- A staff member reads their own role rows at any assurance level. The /admin
-- gate (apps/web/lib/staff.ts) needs this to tell "staff, not yet verified"
-- (send to /admin/mfa to enrol or verify) from "not staff" (404). Reading the
-- rest of the table still needs a full staff session (platform_roles_read).
drop policy if exists platform_roles_read_own on public.platform_roles;
create policy platform_roles_read_own on public.platform_roles for select to authenticated
  using (user_id = (select app.uid()));

-- ---------------------------------------------------------------------------
-- 3. M4: the public forms are written by the server only.
-- ---------------------------------------------------------------------------
-- The per-address limit counts p_ip_hash. A caller who could choose it could
-- pass the limit, or fill the hourly total and close the form for everyone.
revoke execute on function
  app.submit_lead(text, text, text, boolean, text, text, text, text, text, text, text, text, text, text, text),
  public.submit_lead(text, text, text, boolean, text, text, text, text, text, text, text, text, text, text, text),
  app.submit_support_message(text, text, text, text, boolean, text),
  public.submit_support_message(text, text, text, text, boolean, text),
  app.submit_takedown_notice(text, text, text, text, text, text, text, text, text, text, text, boolean, boolean, boolean, text, text, text),
  public.submit_takedown_notice(text, text, text, text, text, text, text, text, text, text, text, boolean, boolean, boolean, text, text, text)
  from public, anon, authenticated;
grant execute on function
  app.submit_lead(text, text, text, boolean, text, text, text, text, text, text, text, text, text, text, text),
  public.submit_lead(text, text, text, boolean, text, text, text, text, text, text, text, text, text, text, text),
  app.submit_support_message(text, text, text, text, boolean, text),
  public.submit_support_message(text, text, text, text, boolean, text),
  app.submit_takedown_notice(text, text, text, text, text, text, text, text, text, text, text, boolean, boolean, boolean, text, text, text),
  public.submit_takedown_notice(text, text, text, text, text, text, text, text, text, text, text, boolean, boolean, boolean, text, text, text)
  to service_role;

-- The contact form keeps the signed-in sender on the row. The service role
-- has no user of its own, so the server passes the id it verified, as
-- submit_title_request_as does (0068). An id that is not a user is dropped.
create or replace function app.submit_support_message_as(
  p_user uuid, p_topic text, p_name text, p_email text, p_message text, p_consent boolean, p_ip_hash text
) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not app.is_service_role() then
    raise exception 'only the service role records contact messages' using errcode = 'insufficient_privilege';
  end if;
  v_id := app.submit_support_message(p_topic, p_name, p_email, p_message, p_consent, p_ip_hash);
  if p_user is not null and exists (select 1 from auth.users u where u.id = p_user) then
    update public.support_messages set user_id = p_user where id = v_id;
  end if;
  return v_id;
end $$;
create or replace function public.submit_support_message_as(
  p_user uuid, p_topic text, p_name text, p_email text, p_message text, p_consent boolean, p_ip_hash text
) returns uuid
language sql volatile security invoker set search_path = '' as $$
  select app.submit_support_message_as(p_user, p_topic, p_name, p_email, p_message, p_consent, p_ip_hash)
$$;
revoke execute on function
  app.submit_support_message_as(uuid, text, text, text, text, boolean, text),
  public.submit_support_message_as(uuid, text, text, text, text, boolean, text)
  from public, anon, authenticated;
grant execute on function
  app.submit_support_message_as(uuid, text, text, text, text, boolean, text),
  public.submit_support_message_as(uuid, text, text, text, text, boolean, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 4. L1: the recovery code tables lose the default grants.
-- ---------------------------------------------------------------------------
-- 0037 granted select and never revoked what a Supabase project gives every
-- new public table. Row level security held the row verbs; truncate is not
-- covered by it. The reader still reads their own codes; every write is a
-- function. supabase/tests/0074 sweeps every public table for the same slip.
revoke all on public.mfa_recovery_codes, public.mfa_recovery_attempts from public, anon, authenticated;
grant select on public.mfa_recovery_codes to authenticated;

-- The same default covers sequences and functions. With the test shim copying
-- it, a comparison against a plain database found these and no other table.
-- Every sequence in public backs an identity column on a table no client
-- inserts into, so no client needs any of them.
revoke all on all sequences in schema public from public, anon, authenticated;
-- Five service-role functions (0065, 0066) were granted to the service role
-- and never taken from signed-in callers. Each refuses a caller who is not the
-- service role in its body, so this closes the grant and changes no behaviour.
revoke execute on function
  public.certificate_by_hash(text),
  public.prune_push_log(),
  public.pair_invite_state(text),
  public.pair_channels_for(uuid, uuid),
  public.prune_pairs()
  from public, anon, authenticated;
grant execute on function
  public.certificate_by_hash(text),
  public.prune_push_log(),
  public.pair_invite_state(text),
  public.pair_channels_for(uuid, uuid),
  public.prune_pairs()
  to service_role;

-- ---------------------------------------------------------------------------
-- 5. L5: record_signoff applies the publisher rule.
-- ---------------------------------------------------------------------------
-- Body from 0016 with one check added (marked 0074). A publisher sign-off from
-- outside staff is for an owner or editor of a publisher or author company,
-- the rule app.author_signoff (0020) applies before it calls this.
create or replace function public.record_signoff(
  p_version            uuid,
  p_kind               text,
  p_signer_name        text,
  p_reviewer_tradition text default null,
  p_tradition_label    text default null,
  p_note               text default null
) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v      public.workbook_versions%rowtype;
  w      public.workbooks%rowtype;
  v_name text := nullif(btrim(coalesce(p_signer_name, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_rt   text := nullif(btrim(coalesce(p_reviewer_tradition, '')), '');
  v_tl   text := nullif(btrim(coalesce(p_tradition_label, '')), '');
  v_id   uuid;
begin
  if p_version is null or p_kind is null or p_kind not in ('editor','author','publisher','safety','clinician','theological') then
    raise exception 'a version and a sign-off kind are required' using errcode = 'invalid_parameter_value';
  end if;
  select * into v from public.workbook_versions where id = p_version;
  if not found then
    raise exception 'version % not found', p_version using errcode = 'no_data_found';
  end if;
  select * into w from public.workbooks where id = v.workbook_id;

  if p_kind = 'editor' and not app.is_platform(array['owner','editor']) then
    raise exception 'an editor sign-off is given by an owner or editor' using errcode = 'insufficient_privilege';
  elsif p_kind = 'safety' and not app.is_platform(array['safety_reviewer']) then
    raise exception 'a safety sign-off is given by a safety reviewer' using errcode = 'insufficient_privilege';
  elsif p_kind in ('clinician','theological') and not app.is_platform(array['owner','editor']) then
    raise exception 'clinician and theological sign-offs are recorded by an owner or editor' using errcode = 'insufficient_privilege';
  elsif p_kind in ('author','publisher') and not (app.is_platform(array['owner','editor']) or app.org_can(w.org_id, 'workbooks', 'write')) then
    raise exception 'author and publisher sign-offs are recorded by staff or the owning organisation' using errcode = 'insufficient_privilege';
  end if;
  -- 0074: the publisher rule from app.author_signoff, for callers who are not staff.
  if p_kind = 'publisher' and not app.is_platform(array['owner','editor']) and not (
       coalesce(app.org_role_of(w.org_id), '') in ('owner','editor')
       and coalesce((select o.kind from public.organisations o where o.id = w.org_id), '') in ('publisher','author_company')) then
    raise exception 'a publisher sign-off is given by an owner or editor of a publisher' using errcode = 'insufficient_privilege';
  end if;

  if v_name is null or char_length(v_name) > 200 then
    raise exception 'the name of the person signing is required, 200 characters or fewer' using errcode = 'check_violation';
  end if;
  if char_length(v_note) > 500 then
    raise exception 'the note must be 500 characters or fewer' using errcode = 'check_violation';
  end if;
  if p_kind = 'theological' then
    if v_rt is null or v_rt not in ('protestant','catholic','orthodox','anglican','general_christian') then
      raise exception 'the reviewer''s tradition is required' using errcode = 'check_violation';
    end if;
    if v_tl is null or v_tl not in ('protestant','catholic','orthodox','general_christian') then
      raise exception 'the tradition label being approved is required' using errcode = 'check_violation';
    end if;
    -- A title labelled for one tradition needs a reviewer from that tradition (F-155).
    if v_tl <> 'general_christian' and v_tl <> v_rt then
      raise exception 'a % label needs a reviewer from that tradition', v_tl using errcode = 'check_violation';
    end if;
  else
    v_rt := null;
    v_tl := null;
  end if;

  insert into public.release_signoffs (version_id, content_hash, kind, signer_name, reviewer_tradition, tradition_label, note, recorded_by)
  values (p_version, v.content_hash, p_kind, v_name, v_rt, v_tl, v_note, app.uid())
  returning id into v_id;

  perform app.audit('release.signoff', 'workbook_version:' || p_version::text, null, w.tenant_id, w.org_id, null,
    jsonb_build_object('kind', p_kind, 'signer_name', v_name, 'content_hash', v.content_hash, 'code', w.code,
                       'reviewer_tradition', v_rt, 'tradition_label', v_tl));
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 6. M14: lock on the referrer before counting towards the yearly cap.
-- ---------------------------------------------------------------------------
-- Body from 0068 with the lock added (marked 0074). Two friends of one
-- referrer who qualified at the same moment each counted the other as not
-- yet rewarded, so the cap could be passed by one. The lock is held to the
-- end of the transaction, so the second caller counts after the first has
-- committed.
create or replace function public.referral_claim_reward(
  p_referred uuid, p_fingerprint text, p_referrer_fingerprints text[], p_referrer_trialing boolean, p_currency text,
  p_invoice text default null, p_payment_intent text default null, p_disputed boolean default false,
  p_referrer_trial_end timestamptz default null
) returns table (referral_id uuid, referrer_id uuid, reward_kind text, reward_value int, reward_currency text, trial_end_target timestamptz)
language plpgsql volatile security definer set search_path = '' as $$
declare
  r      public.referrals%rowtype;
  cfg    jsonb := app.referral_config();
  v_cap  int := coalesce((cfg ->> 'annual_cap')::int, 12);
  v_cur  text := upper(coalesce(p_currency, 'GBP'));
  v_kind text;
  v_val  int;
  v_target timestamptz;
begin
  if not app.is_service_role() then
    raise exception 'only the service role claims rewards' using errcode = 'insufficient_privilege';
  end if;
  select * into r from public.referrals where referred_id = p_referred for update;
  if not found then return; end if;
  if r.status = 'rewarding' then
    return query select r.id, r.referrer_id, r.reward_kind, r.reward_value, r.reward_currency::text, r.trial_end_target;
    return;
  end if;
  if r.status <> 'pending' then return; end if;
  update public.referrals set first_invoice_id = p_invoice, first_payment_intent = p_payment_intent where id = r.id;  -- 0068
  if coalesce(p_disputed, false) then  -- 0068
    update public.referrals set status = 'blocked', block_reason = 'disputed', card_fingerprint = p_fingerprint, qualified_at = now() where id = r.id;
    return;
  end if;
  if p_fingerprint is not null and p_referrer_fingerprints is not null and p_fingerprint = any (p_referrer_fingerprints) then
    update public.referrals set status = 'blocked', block_reason = 'same_card', card_fingerprint = p_fingerprint, qualified_at = now() where id = r.id;
    return;
  end if;
  -- 0074: one claim at a time for each referrer, so the count below sees every
  -- reward already given. Taken after the friend's row lock, in the same order
  -- by every caller.
  perform pg_advisory_xact_lock(hashtextextended('referral_cap:' || r.referrer_id::text, 0));
  if p_fingerprint is not null and exists (
       select 1 from public.referrals o
        where o.referrer_id = r.referrer_id and o.card_fingerprint = p_fingerprint
          and o.status in ('rewarding','rewarded') and o.id <> r.id) then
    update public.referrals set status = 'blocked', block_reason = 'duplicate_card', card_fingerprint = p_fingerprint, qualified_at = now() where id = r.id;
    return;
  end if;
  if (select count(*) from public.referrals o
       where o.referrer_id = r.referrer_id and o.status in ('rewarding','rewarded')
         and o.qualified_at > now() - interval '1 year') >= v_cap then
    update public.referrals set status = 'blocked', block_reason = 'cap_reached', card_fingerprint = p_fingerprint, qualified_at = now() where id = r.id;
    return;
  end if;
  if p_referrer_trialing then
    v_kind := 'trial_days';
    v_val := coalesce((cfg ->> 'referrer_trial_days')::int, 14);
    v_target := p_referrer_trial_end + make_interval(days => v_val);  -- 0068: null when the caller sent no trial end
  else
    v_kind := 'credit';
    v_val := coalesce((cfg -> 'referrer_credit_minor' ->> v_cur)::int, 0);
  end if;
  if v_val <= 0 then
    update public.referrals set status = 'qualified', card_fingerprint = p_fingerprint, qualified_at = now() where id = r.id;
    return;
  end if;
  update public.referrals
     set status = 'rewarding', card_fingerprint = p_fingerprint, qualified_at = now(),
         reward_kind = v_kind, reward_value = v_val, reward_currency = case when v_kind = 'credit' then v_cur end,
         trial_end_target = v_target
   where id = r.id;
  return query select r.id, r.referrer_id, v_kind, v_val, case when v_kind = 'credit' then v_cur end, v_target;
end $$;
revoke execute on function public.referral_claim_reward(uuid, text, text[], boolean, text, text, text, boolean, timestamptz) from public, anon, authenticated;
grant execute on function public.referral_claim_reward(uuid, text, text[], boolean, text, text, text, boolean, timestamptz) to service_role;
