-- 0067 Account deletion covers everything Phase B added (0049 to 0066).
--
-- What was wrong
--   * Two foreign keys would have stopped the final auth.admin.deleteUser():
--       - account_credits.referral_id (0051) points at referrals with no
--         cascade. Deleting a friend who had earned their referrer a credit
--         tried to delete the referral row and was refused.
--       - marketing_pool_ledger.gift_id (0053) points at workbook_gifts, and
--         the ledger is append-only. Deleting a giver whose gift had been
--         claimed tried to delete the gift and was refused.
--   * Rows that survive the user by design (set null links) still carried
--     personal data: the address a giver typed on a workbook gift, the names,
--     message and address on a paid gift membership, the salted IP hash on a
--     title request, and the newsletter subscription, which is keyed by
--     email and so had no link to the account at all.
--   * Phase B tables held rights data until the auth user was removed. The
--     job now removes them in the same step as the reader's answers, so a
--     retry of the auth step never leaves records behind.
--
-- What this does
--   * account_credits.referral_id becomes on delete set null: the credit
--     stays with the referrer, the link to the friend goes.
--   * workbook_gifts.giver_id becomes nullable with on delete set null. A gift
--     the ledger points at is kept as a bare record (no address, no giver);
--     every other gift from the reader is deleted.
--   * app.erase_phase_b(user, email) removes or anonymises every Phase B
--     record for one reader. app.complete_due_deletions() calls it. Its
--     return shape and checks are unchanged from 0007.
--
-- Kept on purpose, with no personal data in them: purchases, bundle_purchases
-- and org_packs (tax records, user link set null), the marketing pool ledger.
--
-- Also in this file: the funnel counter learns the 35 Phase B product events
-- (streaks, milestones, highlights, referrals, gifts, bundles, pauses, search,
-- studio, newsletter, push, passkeys, pairs, certificates, quote images). The
-- list lives in one immutable function that the table check and
-- record_funnel_event both read, so the two cannot drift. Counts only: the
-- function takes no free text and the table has nowhere to put any.
-- Safe to run twice. Nothing earlier is edited.

-- ---------------------------------------------------------------------------
-- 1. Foreign keys that blocked deletion
-- ---------------------------------------------------------------------------
alter table public.account_credits drop constraint if exists account_credits_referral_id_fkey;
alter table public.account_credits add constraint account_credits_referral_id_fkey
  foreign key (referral_id) references public.referrals(id) on delete set null;

alter table public.workbook_gifts alter column giver_id drop not null;
alter table public.workbook_gifts drop constraint if exists workbook_gifts_giver_id_fkey;
alter table public.workbook_gifts add constraint workbook_gifts_giver_id_fkey
  foreign key (giver_id) references auth.users(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 2. One function that clears a reader's Phase B records
-- ---------------------------------------------------------------------------
create or replace function app.erase_phase_b(p_user uuid, p_email text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  n_deleted int := 0;
  n int;
  n_anon int := 0;
begin
  if not (select app.is_service_role()) then
    raise exception 'only the service role erases a reader''s records' using errcode = 'insufficient_privilege';
  end if;

  -- Records that are only ever the reader's own: deleted.
  delete from public.reader_marks where user_id = p_user;                  get diagnostics n = row_count; n_deleted := n_deleted + n;
  delete from public.then_now_entries where user_id = p_user;              get diagnostics n = row_count; n_deleted := n_deleted + n;
  delete from public.habit_settings where user_id = p_user;                get diagnostics n = row_count; n_deleted := n_deleted + n;
  delete from public.milestone_marks where user_id = p_user;               get diagnostics n = row_count; n_deleted := n_deleted + n;
  delete from public.account_credits where user_id = p_user;               get diagnostics n = row_count; n_deleted := n_deleted + n;
  delete from public.referrals where referrer_id = p_user or referred_id = p_user;
                                                                           get diagnostics n = row_count; n_deleted := n_deleted + n;
  delete from public.referral_codes where user_id = p_user;                get diagnostics n = row_count; n_deleted := n_deleted + n;
  delete from public.member_attributions where user_id = p_user;           get diagnostics n = row_count; n_deleted := n_deleted + n;
  delete from public.author_follows where user_id = p_user;                get diagnostics n = row_count; n_deleted := n_deleted + n;
  delete from public.push_subscriptions where user_id = p_user;            get diagnostics n = row_count; n_deleted := n_deleted + n;
  delete from public.push_log where user_id = p_user;                      get diagnostics n = row_count; n_deleted := n_deleted + n;
  -- A pair ends with either member. Finishes and nudges go with it.
  delete from public.programme_pairs where inviter_id = p_user or friend_id = p_user;
                                                                           get diagnostics n = row_count; n_deleted := n_deleted + n;
  delete from public.pair_finishes where user_id = p_user;
  delete from public.pair_nudges where from_user = p_user or to_user = p_user;
  delete from public.certificates where user_id = p_user;                  get diagnostics n = row_count; n_deleted := n_deleted + n;
  delete from public.reader_prompts where user_id = p_user;                get diagnostics n = row_count; n_deleted := n_deleted + n;
  delete from public.marketing_optouts where user_id = p_user;             get diagnostics n = row_count; n_deleted := n_deleted + n;
  delete from public.winback_log where user_id = p_user;                   get diagnostics n = row_count; n_deleted := n_deleted + n;
  delete from public.student_verifications where user_id = p_user;         get diagnostics n = row_count; n_deleted := n_deleted + n;

  -- Workbook gifts. The ledger keeps a pointer to a claimed gift, so those are
  -- kept as bare records. Everything else the reader gave is deleted.
  delete from public.workbook_gifts g
   where g.giver_id = p_user
     and not exists (select 1 from public.marketing_pool_ledger l where l.gift_id = g.id);
  get diagnostics n = row_count; n_deleted := n_deleted + n;
  update public.workbook_gifts
     set recipient_email = null, recipient_norm = 'erased:' || id::text, giver_id = null
   where giver_id = p_user;
  get diagnostics n = row_count; n_anon := n_anon + n;
  -- As the person who received one, the address the giver typed is theirs.
  update public.workbook_gifts
     set recipient_email = null, recipient_norm = 'erased:' || id::text, claimed_by = null
   where claimed_by = p_user;
  get diagnostics n = row_count; n_anon := n_anon + n;

  -- Gift memberships are purchase records and stay. Names, message, address
  -- and claim link go, unless a paid gift is still waiting to be claimed.
  update public.gift_memberships
     set recipient_email = null, recipient_name = null, sender_name = null, message = null, claim_token = null,
         buyer_id = null, claimed_by = null
   where (buyer_id = p_user or claimed_by = p_user) and status <> 'paid';
  get diagnostics n = row_count; n_anon := n_anon + n;
  update public.gift_memberships
     set sender_name = null, buyer_id = null
   where buyer_id = p_user and status = 'paid';
  get diagnostics n = row_count; n_anon := n_anon + n;

  -- Title requests stay as a demand signal, with nothing that points at a person.
  update public.title_requests set user_id = null, ip_hash = null where user_id = p_user;
  get diagnostics n = row_count; n_anon := n_anon + n;

  -- The newsletter is keyed by address, not by account.
  if p_email is not null and btrim(p_email) <> '' then
    delete from public.newsletter_subscribers where email = p_email::extensions.citext;
    get diagnostics n = row_count; n_deleted := n_deleted + n;
  end if;

  return jsonb_build_object('phase_b_deleted', n_deleted, 'phase_b_anonymised', n_anon);
end $$;
revoke execute on function app.erase_phase_b(uuid, text) from public, anon, authenticated;
grant execute on function app.erase_phase_b(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. The job calls it. Same checks, same return shape as 0007.
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
  v_email text;
  v_phase_b jsonb;
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

    select u.email::text into v_email from auth.users u where u.id = r.user_id;
    v_phase_b := app.erase_phase_b(r.user_id, v_email);

    update public.profiles pr
       set display_name = null, country = null, adult_confirmed_at = null, locale = 'en-GB',
           health_consent_at = null, health_consent_version = null
     where pr.user_id = r.user_id;

    update public.account_deletion_requests d set completed_at = now() where d.id = r.id;

    perform app.audit('account.deletion_completed', 'user:' || r.user_id::text,
      'purchases kept for tax records', null, null, null,
      jsonb_build_object('answers', n_answers, 'progress_events', n_events, 'enrolments', n_enrolments,
                         'entitlements', n_entitlements, 'tenant_memberships', n_memberships) || v_phase_b);
  end loop;

  return query
    select d.user_id from public.account_deletion_requests d
     where d.completed_at is not null and d.auth_removed_at is null
     order by d.completed_at;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Product events for the funnel counter
-- ---------------------------------------------------------------------------
create or replace function app.funnel_event_names() returns text[]
language sql immutable set search_path = '' as $$
  select array[
    'page_view', 'sample_view', 'free_week_started', 'checkout_started',
    'purchase', 'week_completed', 'field_answered', 'step_finished',
    'trial_started', 'trial_cancelled', 'membership_cancelled', 'streak_turned_on',
    'streak_turned_off', 'milestone_reached', 'companion_shown', 'highlight_added',
    'note_added', 'shortcut_sheet_opened', 'then_now_checked_in', 'referral_link_shared',
    'referral_claimed', 'referral_rewarded', 'author_link_visited', 'gift_bought',
    'gift_claimed', 'workbook_gift_sent', 'workbook_gift_claimed', 'bundle_viewed',
    'bundle_bought', 'student_verified', 'pause_started', 'pause_ended',
    'winback_sent', 'search_grouped_used', 'title_requested', 'author_followed',
    'studio_outline_generated', 'builder_saved', 'org_plan_started', 'pack_bought',
    'newsletter_confirmed', 'push_enabled', 'passkey_added', 'friend_paired',
    'certificate_viewed', 'quote_image_made'
  ]::text[]
$$;
grant execute on function app.funnel_event_names() to anon, authenticated, service_role;

alter table public.funnel_counts drop constraint if exists funnel_counts_event_check;
alter table public.funnel_counts add constraint funnel_counts_event_check
  check (event = any (app.funnel_event_names()));

create or replace function public.record_funnel_event(
  p_event text, p_tenant uuid, p_workbook uuid default null, p_unit int default null, p_visitor text default null
) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_day date := (now() at time zone 'utc')::date;
  v_new boolean := false;
begin
  if p_event is null or not (p_event = any (app.funnel_event_names())) then
    raise exception 'unknown funnel event' using errcode = 'invalid_parameter_value';
  end if;
  if p_tenant is null or not exists (select 1 from public.tenants where id = p_tenant) then
    raise exception 'unknown tenant' using errcode = 'invalid_parameter_value';
  end if;
  if p_workbook is not null and not exists (select 1 from public.workbooks where id = p_workbook) then
    raise exception 'unknown workbook' using errcode = 'invalid_parameter_value';
  end if;
  if p_unit is not null and (p_unit < 1 or p_unit > 999) then
    raise exception 'unit out of range' using errcode = 'invalid_parameter_value';
  end if;
  if p_visitor is not null and p_visitor !~ '^[0-9a-f]{64}$' then
    raise exception 'visitor must be a sha256 hex digest' using errcode = 'invalid_parameter_value';
  end if;

  if p_visitor is not null then
    insert into public.funnel_visitors (day, event, tenant_id, workbook_id, unit, visitor)
    values (v_day, p_event, p_tenant, p_workbook, p_unit, p_visitor)
    on conflict (day, event, tenant_id, workbook_id, unit, visitor) do nothing;
    v_new := found;
  end if;

  insert into public.funnel_counts (day, event, tenant_id, workbook_id, unit, n, uniques)
  values (v_day, p_event, p_tenant, p_workbook, p_unit, 1, case when v_new then 1 else 0 end)
  on conflict (day, event, tenant_id, workbook_id, unit) do update
    set n = public.funnel_counts.n + 1,
        uniques = public.funnel_counts.uniques + case when v_new then 1 else 0 end;
end $$;
revoke execute on function public.record_funnel_event(text, uuid, uuid, int, text) from public;
grant execute on function public.record_funnel_event(text, uuid, uuid, int, text) to anon, authenticated, service_role;
