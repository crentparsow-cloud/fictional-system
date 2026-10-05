-- 005: account rules decided by Crent on 1 October 2026 (WB_Decisions.md).
--   a) deletion is scheduled with a 7-day undo; the request row is the completion log
--   b) pro rata refund when a pass is cancelled within 14 days
--   c) read-only access after a pass lapses or a free week ends
--   d) at most two active workbooks at once
--   e) sealed columns for daily checks and self-check results (tables locked in 006)
--   f) passkeys, export tokens and emailed export codes for the history download
--   g) user_settings

-- ---------- Settings the rules read ----------
insert into public.app_config(key, value) values
  ('free_week_days', '7'),          -- a free week ends this many days after the enrolment started
  ('max_active_workbooks', '2'),
  ('deletion_grace_days', '7'),
  ('refund_window_days', '14')
on conflict (key) do nothing;

create or replace function public.cfg_int(p_key text, p_default int)
returns int language sql stable security definer set search_path = public as $$
  select coalesce((select nullif(value, '')::int from public.app_config where key = p_key), p_default);
$$;

-- ---------- a) Deletion: scheduled, undoable, and logged after the account is gone ----------
alter table public.deletion_requests drop constraint if exists deletion_requests_user_id_fkey;  -- the row must outlive the user
alter table public.deletion_requests add column if not exists status text not null default 'scheduled';
alter table public.deletion_requests drop constraint if exists deletion_requests_status_check;
alter table public.deletion_requests add constraint deletion_requests_status_check
  check (status in ('scheduled','cancelled','deleting','completed','failed'));
alter table public.deletion_requests add column if not exists scheduled_for timestamptz;
alter table public.deletion_requests add column if not exists cancelled_at timestamptz;
alter table public.deletion_requests add column if not exists billing_cancelled_at timestamptz;
alter table public.deletion_requests add column if not exists attempts int not null default 0;
alter table public.deletion_requests add column if not exists last_error text;
update public.deletion_requests set scheduled_for = coalesce(scheduled_for, requested_at),
  status = case when completed_at is not null then 'completed' else status end;
alter table public.deletion_requests alter column scheduled_for set not null;
-- Applied separately as 005b: a default, so the old app function (which inserts only user_id) still logs a row.
alter table public.deletion_requests alter column scheduled_for set default (now() + interval '7 days');
create index if not exists deletion_requests_due on public.deletion_requests (scheduled_for) where status in ('scheduled','failed','deleting');
comment on table public.deletion_requests is 'One row per account deletion. No foreign key: the row stays as the completion log after the user is deleted. Holds no personal data beyond the user id.';

create or replace function public.deletion_pending(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.deletion_requests d where d.user_id = p_user and d.status in ('scheduled','deleting','failed'));
$$;

-- ---------- b) Refund records ----------
alter table public.subscriptions add column if not exists canceled_at timestamptz;
alter table public.subscriptions add column if not exists cancel_mode text;
alter table public.subscriptions drop constraint if exists subscriptions_cancel_mode_check;
alter table public.subscriptions add constraint subscriptions_cancel_mode_check
  check (cancel_mode is null or cancel_mode in ('period_end','immediate','account_deleted'));
alter table public.subscriptions add column if not exists refund_minor int;
alter table public.subscriptions add column if not exists refund_currency text;
alter table public.subscriptions add column if not exists refund_status text;
alter table public.subscriptions drop constraint if exists subscriptions_refund_status_check;
alter table public.subscriptions add constraint subscriptions_refund_status_check
  check (refund_status is null or refund_status in ('none','pending','succeeded','failed'));
alter table public.subscriptions add column if not exists refund_id text;
alter table public.subscriptions add column if not exists refund_error text;
alter table public.subscriptions add column if not exists refund_target text;   -- pi_... or ch_... the refund goes to

alter table public.orders add column if not exists refunded_minor int not null default 0;
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('pending','paid','refunded','partially_refunded','disputed'));

-- ---------- c) and d) Access, read-only and two active workbooks ----------
alter table public.enrolments add column if not exists status text not null default 'active';
alter table public.enrolments drop constraint if exists enrolments_status_check;
alter table public.enrolments add constraint enrolments_status_check check (status in ('active','paused','finished'));

create or replace function public.is_entitled(p_user uuid, p_workbook text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.entitlements e
    where e.user_id = p_user and (e.workbook_id = p_workbook or e.workbook_id is null)
      and e.starts_at <= now() and (e.ends_at is null or e.ends_at > now()));
$$;

create or replace function public.free_week_ends(p_started timestamptz)
returns timestamptz language sql stable security definer set search_path = public as $$
  select p_started + make_interval(days => public.cfg_int('free_week_days', 7));
$$;

-- 'full' = the reader can save in this workbook. 'read_only' = they can read everything but not save.
-- A workbook not started yet is 'full' (the reader may start a free week, subject to the two-workbook limit).
create or replace function public.workbook_access(p_user uuid, p_workbook text)
returns text language plpgsql stable security definer set search_path = public as $$
declare e record;
begin
  if public.deletion_pending(p_user) then return 'read_only'; end if;
  select * into e from public.enrolments where user_id = p_user and workbook_id = p_workbook;
  if not found then return 'full'; end if;
  if e.status = 'paused' then return 'read_only'; end if;
  if public.is_entitled(p_user, p_workbook) then return 'full'; end if;
  if now() < public.free_week_ends(e.started_at) then return 'full'; end if;
  return 'read_only';
end $$;

-- Account level, for things that are not tied to one workbook (the daily check).
create or replace function public.account_access(p_user uuid)
returns text language plpgsql stable security definer set search_path = public as $$
begin
  if public.deletion_pending(p_user) then return 'read_only'; end if;
  if not exists (select 1 from public.enrolments where user_id = p_user) then return 'full'; end if;
  if exists (select 1 from public.entitlements e where e.user_id = p_user and e.starts_at <= now() and (e.ends_at is null or e.ends_at > now())) then return 'full'; end if;
  if exists (select 1 from public.enrolments x where x.user_id = p_user and public.workbook_access(p_user, x.workbook_id) = 'full') then return 'full'; end if;
  return 'read_only';
end $$;

-- Saving a row for a week: the reader must be enrolled, the workbook must be writable, and weeks
-- after week 1 need an entitlement. Same signature as before, so existing triggers keep working.
create or replace function public.has_access(p_user uuid, p_workbook text, p_week int)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.enrolments where user_id = p_user and workbook_id = p_workbook)
     and public.workbook_access(p_user, p_workbook) = 'full'
     and (p_week <= 1 or public.is_entitled(p_user, p_workbook));
$$;

create or replace function public.enforce_access() returns trigger
language plpgsql security definer set search_path = public as $$
declare o jsonb; n jsonb;
begin
  if tg_op = 'UPDATE' then
    -- Sealing an older plain row changes nothing the reader wrote, so it is allowed even when read-only.
    o := to_jsonb(old); n := to_jsonb(new);
    if o ? 'value_enc' and o->>'value_enc' is null and o->'value' <> 'null'::jsonb
       and n->'value' = 'null'::jsonb and n->>'value_enc' is not null
       and (o - 'value' - 'value_enc' - 'updated_at') = (n - 'value' - 'value_enc' - 'updated_at') then
      return new;
    end if;
    if o ? 'answers_enc' and o->>'answers_enc' is null and n->>'answers_enc' is not null
       and (o - 'answers' - 'answers_enc') = (n - 'answers' - 'answers_enc') then
      return new;
    end if;
  end if;
  if public.workbook_access(new.user_id, new.workbook_id) <> 'full' then
    raise exception using message = 'read_only', detail = 'This workbook is read-only for this reader.';
  end if;
  if not public.has_access(new.user_id, new.workbook_id, new.week) then
    raise exception using message = 'locked', detail = format('Week %s of %s needs a purchase or an enrolment.', new.week, new.workbook_id);
  end if;
  if not public.has_consent(new.user_id, 'store') then
    raise exception using message = 'consent_required', detail = 'Storage consent is required.';
  end if;
  return new;
end $$;

-- Enrolments: the browser may start, pause, resume and move a workbook on, within the rules.
create or replace function public.enforce_enrolment_week() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  client boolean := coalesce(auth.jwt()->>'role', '') in ('authenticated', 'anon');
  ent boolean := public.is_entitled(new.user_id, new.workbook_id);
  active_n int;
begin
  if tg_op = 'INSERT' then
    if client then new.started_at := now(); new.week_opened_at := now(); new.status := 'active'; end if;
    if public.deletion_pending(new.user_id) then
      raise exception using message = 'read_only', detail = 'The account is scheduled for deletion.';
    end if;
    if new.current_week > 1 and not ent then
      raise exception using message = 'locked', detail = format('Week %s needs a purchase.', new.current_week);
    end if;
  else
    if client then  -- the free week clock and the row identity are not the browser's to change
      new.started_at := old.started_at; new.user_id := old.user_id; new.workbook_id := old.workbook_id;
    end if;
    if new.current_week <> old.current_week then
      if public.workbook_access(new.user_id, new.workbook_id) <> 'full' then
        raise exception using message = 'read_only', detail = 'This workbook is read-only for this reader.';
      end if;
      if new.current_week > 1 and not ent then
        raise exception using message = 'locked', detail = format('Week %s needs a purchase.', new.current_week);
      end if;
    end if;
  end if;
  if new.status = 'active' and (tg_op = 'INSERT' or old.status <> 'active') then
    perform pg_advisory_xact_lock(hashtext('enrol:' || new.user_id::text));
    select count(*) into active_n from public.enrolments x
      where x.user_id = new.user_id and x.workbook_id <> new.workbook_id and x.status = 'active'
        and public.workbook_access(x.user_id, x.workbook_id) = 'full';
    if active_n >= public.cfg_int('max_active_workbooks', 2) then
      raise exception using message = 'two_active_limit', detail = 'Pause or finish a workbook before starting another.';
    end if;
  end if;
  return new;
end $$;

-- Readers can no longer delete an enrolment (that would restart the free week).
drop policy if exists "own rows" on public.enrolments;
drop policy if exists "read own enrolments" on public.enrolments;
drop policy if exists "start own enrolment" on public.enrolments;
drop policy if exists "change own enrolment" on public.enrolments;
create policy "read own enrolments" on public.enrolments for select to authenticated using (user_id = (select auth.uid()));
create policy "start own enrolment" on public.enrolments for insert to authenticated with check (user_id = (select auth.uid()));
create policy "change own enrolment" on public.enrolments for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke delete on public.enrolments from anon, authenticated;

-- Other progress rows the browser still writes directly obey read-only too.
create or replace function public.enforce_writable() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.workbook_access(new.user_id, new.workbook_id) <> 'full' then
    raise exception using message = 'read_only', detail = 'This workbook is read-only for this reader.';
  end if;
  return new;
end $$;
-- toolkit_uses is not gated: the Toolkit and Help now are never locked.
drop trigger if exists toolkit_writable on public.toolkit_uses;
drop trigger if exists milestones_writable on public.milestones_earned;
create trigger milestones_writable before insert or update on public.milestones_earned for each row execute function public.enforce_writable();

-- ---------- e) Sealed daily checks and self-check results ----------
alter table public.daily_checks add column if not exists data_enc text;          -- sealed {score, tags}
alter table public.daily_checks alter column score drop not null;
alter table public.daily_checks add column if not exists updated_at timestamptz not null default now();
alter table public.selfcheck_results add column if not exists scores_enc text;   -- sealed {item_scores, area_scores}
alter table public.selfcheck_results alter column item_scores drop not null;
alter table public.selfcheck_results alter column area_scores drop not null;
comment on column public.daily_checks.data_enc is 'AES-256-GCM sealed {score, tags}, owner id as AAD, written by the answers function. check_date and workbook_id stay plain for scheduling.';
comment on column public.selfcheck_results.scores_enc is 'AES-256-GCM sealed {item_scores, area_scores}, owner id as AAD, written by the answers function.';

-- ---------- f) Device-verified history download ----------
create table if not exists public.passkeys (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  credential_id text not null unique,     -- base64url
  public_key text not null,               -- base64url COSE key
  counter bigint not null default 0,
  transports text[] not null default '{}',
  device_type text,
  backed_up boolean,
  nickname text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists passkeys_user on public.passkeys(user_id);

create table if not exists public.webauthn_challenges (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null check (purpose in ('register','authenticate')),
  challenge text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists webauthn_challenges_lookup on public.webauthn_challenges(user_id, purpose, challenge);

create table if not exists public.export_tokens (
  token_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  method text not null check (method in ('passkey','email_code')),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.export_codes (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists export_codes_user on public.export_codes(user_id, created_at desc);

alter table public.passkeys enable row level security;
alter table public.webauthn_challenges enable row level security;
alter table public.export_tokens enable row level security;
alter table public.export_codes enable row level security;
revoke all on public.passkeys, public.webauthn_challenges, public.export_tokens, public.export_codes from anon, authenticated;

-- ---------- g) Settings ----------
create table if not exists public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  prefs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint user_settings_prefs_shape check (
    jsonb_typeof(prefs) = 'object'
    and (prefs - array['theme','text_size','font','reduce_motion','dim_at_night','reminder_days','quiet_hours','region_override']) = '{}'::jsonb
    and pg_column_size(prefs) < 4096)
);
alter table public.user_settings enable row level security;
drop policy if exists "read own settings" on public.user_settings;
drop policy if exists "add own settings" on public.user_settings;
drop policy if exists "change own settings" on public.user_settings;
create policy "read own settings" on public.user_settings for select to authenticated using (user_id = (select auth.uid()));
create policy "add own settings" on public.user_settings for insert to authenticated with check (user_id = (select auth.uid()));
create policy "change own settings" on public.user_settings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.user_settings from anon;
revoke delete, truncate, trigger, references on public.user_settings from authenticated;
grant select, insert, update on public.user_settings to authenticated;

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists user_settings_touch on public.user_settings;
create trigger user_settings_touch before update on public.user_settings for each row execute function public.touch_updated_at();

-- ---------- Function permissions ----------
revoke execute on function public.cfg_int(text, int), public.deletion_pending(uuid), public.is_entitled(uuid, text),
  public.free_week_ends(timestamptz), public.workbook_access(uuid, text), public.account_access(uuid),
  public.has_access(uuid, text, int), public.enforce_access(), public.enforce_enrolment_week(),
  public.enforce_writable(), public.touch_updated_at() from public, anon, authenticated;
grant execute on function public.workbook_access(uuid, text), public.account_access(uuid), public.is_entitled(uuid, text),
  public.free_week_ends(timestamptz), public.deletion_pending(uuid), public.has_access(uuid, text, int) to service_role;
