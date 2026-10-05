-- Workbooks: core schema v1 (build plan D1.1, D1.2)
-- Every table has row-level security. Readers can only reach their own rows.
-- Tables with RLS on and no policies are reachable only by the server (service role).
-- Health data tables are marked [HEALTH]. Answer values move to field-level
-- encryption (D1.3) before any real reader data is stored.

create extension if not exists pgcrypto;

-- ---------- Identity ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  time_zone text default 'America/New_York',
  daily_check_time time,
  created_at timestamptz not null default now()
);

-- ---------- Consent ----------
create table public.consent_versions (
  id text primary key,                      -- e.g. 'store_v1'
  consent_type text not null check (consent_type in
    ('store','progress_emails','personalised_recs','partner_share','immediate_access','auto_renewal')),
  wording text not null,
  created_at timestamptz not null default now()
);

create table public.consents (               -- append-only history
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  consent_type text not null,
  version_id text not null references public.consent_versions(id),
  granted boolean not null,
  created_at timestamptz not null default now()
);
create index on public.consents (user_id, consent_type, created_at desc);

create or replace function public.has_consent(p_user uuid, p_type text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select granted from public.consents
    where user_id = p_user and consent_type = p_type
    order by created_at desc limit 1), false);
$$;

-- Callable by readers, but only ever about themselves
create or replace function public.my_consent(p_type text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_consent(auth.uid(), p_type);
$$;

-- ---------- Commerce ----------
create table public.products (
  id text primary key,                      -- e.g. 'single:focus', 'set:stress-and-overload', 'pass:annual'
  kind text not null check (kind in ('single','set','pass_monthly','pass_annual','library')),
  workbook_ids text[] not null default '{}',-- empty for passes and library (all workbooks)
  stripe_price_id text,
  active boolean not null default true
);

create table public.orders (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null references public.products(id),
  stripe_checkout_id text unique,
  amount_minor integer,
  currency text,
  status text not null check (status in ('pending','paid','refunded','disputed')),
  immediate_access_consent text references public.consent_versions(id),
  renewal_consent text references public.consent_versions(id),
  created_at timestamptz not null default now()
);

create table public.subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_subscription_id text unique not null,
  product_id text not null references public.products(id),
  status text not null,
  current_period_end timestamptz,
  cancel_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.entitlements (          -- written only by the payment webhook
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  workbook_id text,                          -- null means all workbooks (pass or library)
  source text not null check (source in ('single','set','pass','library','comp')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,                       -- null means lifetime
  order_id bigint references public.orders(id),
  subscription_id bigint references public.subscriptions(id)
);
create index on public.entitlements (user_id);

-- Week 1 is always free. Help now and the Toolkit are never gated (handled in the app).
create or replace function public.has_access(p_user uuid, p_workbook text, p_week int)
returns boolean language sql stable security definer set search_path = public as $$
  select p_week <= 1 or exists (
    select 1 from public.entitlements e
    where e.user_id = p_user
      and (e.workbook_id = p_workbook or e.workbook_id is null)
      and e.starts_at <= now()
      and (e.ends_at is null or e.ends_at > now()));
$$;

-- ---------- Progress [HEALTH] ----------
create table public.enrolments (
  user_id uuid not null references auth.users(id) on delete cascade,
  workbook_id text not null,
  started_at timestamptz not null default now(),
  current_week int not null default 1 check (current_week between 1 and 12),
  week_opened_at timestamptz not null default now(),
  slow_mode boolean not null default false,
  last_active_at timestamptz not null default now(),
  primary key (user_id, workbook_id)
);

create table public.exercise_completions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  workbook_id text not null,
  exercise_id text not null,
  week int not null check (week between 1 and 12),
  mode text not null check (mode in ('full','short')),
  is_repeat boolean not null default false,
  completed_at timestamptz not null default now()
);
create index on public.exercise_completions (user_id, workbook_id);

create table public.answers (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  workbook_id text not null,
  exercise_id text not null,
  field_id text not null,
  week int not null check (week between 1 and 12),
  attempt int not null default 1,            -- 2 for the repeat of a repeatable exercise
  value jsonb,                               -- moves to value_ciphertext in D1.3
  updated_at timestamptz not null default now(),
  unique (user_id, workbook_id, exercise_id, field_id, attempt)
);

create table public.daily_checks (
  user_id uuid not null references auth.users(id) on delete cascade,
  workbook_id text not null,
  check_date date not null,
  score smallint not null check (score between 0 and 10),
  tags text[] not null default '{}',
  primary key (user_id, workbook_id, check_date)
);

create table public.weekly_checkins (
  user_id uuid not null references auth.users(id) on delete cascade,
  workbook_id text not null,
  week int not null check (week between 1 and 12),
  short_version boolean not null default false,
  answers jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, workbook_id, week)
);

create table public.selfcheck_results (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  workbook_id text not null,
  taken_week int not null check (taken_week in (0,6,12) or taken_week > 12), -- >12 = Keep Going quarterly
  item_scores jsonb not null,
  area_scores jsonb not null,
  created_at timestamptz not null default now()
);

create table public.toolkit_uses (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  workbook_id text not null,
  card_id text not null,
  used_at timestamptz not null default now()
);

create table public.milestones_earned (
  user_id uuid not null references auth.users(id) on delete cascade,
  workbook_id text not null,
  milestone_id text not null,
  earned_at timestamptz not null default now(),
  primary key (user_id, workbook_id, milestone_id)
);

-- Paywall enforcement in the database, not only in the app.
create or replace function public.enforce_access() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_access(new.user_id, new.workbook_id, new.week) then
    raise exception 'Week % of % needs a purchase', new.week, new.workbook_id;
  end if;
  if not public.has_consent(new.user_id, 'store') then
    raise exception 'Storage consent is required';
  end if;
  return new;
end $$;
create trigger exercise_access before insert or update on public.exercise_completions
  for each row execute function public.enforce_access();
create trigger answers_access before insert or update on public.answers
  for each row execute function public.enforce_access();
create trigger checkin_access before insert or update on public.weekly_checkins
  for each row execute function public.enforce_access();

create or replace function public.enforce_enrolment_week() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_access(new.user_id, new.workbook_id, new.current_week) then
    raise exception 'Week % needs a purchase', new.current_week;
  end if;
  return new;
end $$;
create trigger enrolment_week before insert or update on public.enrolments
  for each row execute function public.enforce_enrolment_week();

-- ---------- Accountability partner ----------
create table public.partners (
  id bigint generated always as identity primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade, -- one partner per reader
  partner_name text not null,
  partner_email text not null,
  share_level smallint not null check (share_level between 1 and 3),
  status text not null default 'invited'
    check (status in ('invited','accepted','declined','stopped','paused','removed')),
  invited_at timestamptz not null default now(),
  responded_at timestamptz
);
create table public.partner_tokens (         -- server only
  partner_id bigint not null references public.partners(id) on delete cascade,
  token_hash text not null,
  purpose text not null check (purpose in ('respond','stop','report')),
  expires_at timestamptz not null,
  used_at timestamptz
);
create table public.partner_sends (          -- server only
  id bigint generated always as identity primary key,
  partner_id bigint not null references public.partners(id) on delete cascade,
  kind text not null,
  sent_at timestamptz not null default now()
);
create table public.blocked_addresses (      -- server only; stores a hash, not the address
  email_hash text primary key,
  reason text not null check (reason in ('declined','reported')),
  created_at timestamptz not null default now()
);

-- ---------- Email, analytics, operations (server only unless stated) ----------
create table public.email_sends (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  kind text not null,
  template_version text,
  status text not null,
  sent_at timestamptz not null default now()
);
create table public.events (                 -- readers may insert their own; never read
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (name in ('signup','free_week_started','purchase','week_unlocked',
    'exercise_done','checkin_done','selfcheck_taken','toolkit_used','prompt_shown','prompt_acted',
    'reminder_returned','partner_invited','partner_accepted','cancelled','daily_check')),
  props jsonb not null default '{}',         -- ids and counts only, never answer text
  created_at timestamptz not null default now()
);
create table public.admin_access_log (
  id bigint generated always as identity primary key,
  admin_id uuid not null,
  user_id uuid not null,
  reason text not null,
  accessed_at timestamptz not null default now()
);
create table public.deletion_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);

-- ---------- Row-level security ----------
do $$ declare t text; begin
  foreach t in array array['profiles','consent_versions','consents','products','orders','subscriptions',
    'entitlements','enrolments','exercise_completions','answers','daily_checks','weekly_checkins',
    'selfcheck_results','toolkit_uses','milestones_earned','partners','partner_tokens','partner_sends',
    'blocked_addresses','email_sends','events','admin_access_log','deletion_requests']
  loop execute format('alter table public.%I enable row level security', t); end loop;
end $$;

-- Public reference data
create policy "read consent wording" on public.consent_versions for select to anon, authenticated using (true);
create policy "read products" on public.products for select to anon, authenticated using (active);

-- Own profile
create policy "own profile" on public.profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Consents: readers add and read their own history, never edit or delete it
create policy "read own consents" on public.consents for select to authenticated using (user_id = (select auth.uid()));
create policy "add own consents" on public.consents for insert to authenticated with check (user_id = (select auth.uid()));

-- Commerce: readers can see their own; only the server writes
create policy "read own orders" on public.orders for select to authenticated using (user_id = (select auth.uid()));
create policy "read own subscriptions" on public.subscriptions for select to authenticated using (user_id = (select auth.uid()));
create policy "read own entitlements" on public.entitlements for select to authenticated using (user_id = (select auth.uid()));

-- Progress tables: readers have full control of their own rows
do $$ declare t text; begin
  foreach t in array array['enrolments','exercise_completions','answers','daily_checks','weekly_checkins',
    'selfcheck_results','toolkit_uses','milestones_earned']
  loop
    execute format('create policy "own rows" on public.%I for all to authenticated
      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Partner: the reader manages their own partner record (status set by server on reply)
create policy "read own partner" on public.partners for select to authenticated using (user_id = (select auth.uid()));
create policy "add own partner" on public.partners for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'invited' and public.my_consent('partner_share'));
create policy "change own partner" on public.partners for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and status in ('invited','accepted','paused','removed'));

-- Events: insert own, never read back from the client
create policy "log own events" on public.events for insert to authenticated with check (user_id = (select auth.uid()));

-- Deletion request: reader can ask
create policy "request own deletion" on public.deletion_requests for insert to authenticated with check (user_id = (select auth.uid()));
create policy "see own deletion request" on public.deletion_requests for select to authenticated using (user_id = (select auth.uid()));

-- Server-only tables (no policies): partner_tokens, partner_sends, blocked_addresses, email_sends, admin_access_log
revoke all on public.partner_tokens, public.partner_sends, public.blocked_addresses,
  public.email_sends, public.admin_access_log from anon, authenticated;

-- Helper functions are not callable directly by clients
revoke execute on function public.has_consent(uuid, text), public.has_access(uuid, text, int),
  public.enforce_access(), public.enforce_enrolment_week(), public.my_consent(text) from public, anon, authenticated;
grant execute on function public.my_consent(text) to authenticated;

-- Profile row on sign-up
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name) values (new.id, new.raw_user_meta_data->>'display_name');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
revoke execute on function public.handle_new_user() from public, anon, authenticated;
