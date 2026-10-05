-- 002: changes applied to the live project on 30 September 2026 after 001_core_schema.sql.
-- Written down on 1 October 2026 so a fresh deploy matches live. It is a record of what live
-- already has (migrations webhook_idempotency, orders_payment_intent, service_role_helpers,
-- encrypted_answers_d13, email_partner_account_v1, email_consents_partner_writes_cron) plus the
-- consent wording rows, which live holds but no migration file seeded. Safe to re-run.

-- ---------- Consent wording (without these rows even the required "store" consent fails) ----------
alter table public.consent_versions drop constraint if exists consent_versions_consent_type_check;
alter table public.consent_versions add constraint consent_versions_consent_type_check check (consent_type = any (array[
  'store','progress_emails','personalised_recs','partner_share','immediate_access','auto_renewal','general_marketing']));
insert into public.consent_versions(id, consent_type, wording) values
  ('store_v1', 'store', 'Yes, store my workbook information. (Required to use the workbook)'),
  ('progress_emails_v1', 'progress_emails', 'Send me progress emails and reminders when I''ve been away. (Optional)'),
  ('personalised_recs_v1', 'personalised_recs', 'Suggest other workbooks based on the ones I use. (Optional)'),
  ('partner_share_v1', 'partner_share', 'I agree to share this with my accountability partner.'),
  ('immediate_access_lifetime_v1', 'immediate_access', 'I want access to start right now. I understand that once access starts, I lose my 14-day right to cancel and get a refund.'),
  ('immediate_access_pass_v1', 'immediate_access', 'I want access to start right now. I understand that if I cancel within 14 days, I''ll get a refund minus a proportionate amount for the days I''ve had access.'),
  ('auto_renewal_v1', 'auto_renewal', 'I agree that my pass renews automatically at the price above until I cancel.'),
  ('general_marketing_v1', 'general_marketing', 'Emails about new workbooks and offers. They never use anything about which workbooks you use. Past buyers get these unless they opt out.')
on conflict (id) do nothing;

-- ---------- Payments ----------
create table if not exists public.processed_stripe_events (
  event_id text primary key,
  type text not null,
  processed_at timestamptz not null default now()
);
alter table public.processed_stripe_events enable row level security;
revoke all on public.processed_stripe_events from anon, authenticated;
alter table public.orders add column if not exists workbook_ids text[] not null default '{}';
alter table public.orders add column if not exists stripe_payment_intent text unique;
grant execute on function public.has_consent(uuid, text), public.has_access(uuid, text, int) to service_role;

-- ---------- Sealed answers (D1.3) ----------
alter table public.answers add column if not exists value_enc text;
alter table public.weekly_checkins add column if not exists answers_enc text;
drop policy if exists "own rows" on public.answers;
drop policy if exists "own rows" on public.weekly_checkins;
revoke all on public.answers from anon, authenticated;
revoke all on public.weekly_checkins from anon, authenticated;

-- ---------- Email, partner, account ----------
create table if not exists public.app_config (key text primary key, value text not null);
alter table public.app_config enable row level security;
revoke all on public.app_config from anon, authenticated;
insert into public.app_config(key, value) values
  ('email_mode', 'test'),
  ('from_address', 'Workbooks <onboarding@resend.dev>'),
  ('app_url', 'https://workbooks-app-dev.pages.dev'),
  ('postal_address', '[Postal address to be added before launch]'),
  ('five_day_unlock', 'off')
on conflict (key) do nothing;
-- test_recipient is set by hand on each project.

alter table public.email_sends add column if not exists dedupe_key text;
alter table public.email_sends add column if not exists provider_id text;
alter table public.email_sends add column if not exists error text;
create unique index if not exists email_sends_dedupe on public.email_sends(dedupe_key) where dedupe_key is not null;

alter table public.partners add column if not exists note text;
alter table public.partners add column if not exists note_used_at timestamptz;
alter table public.partner_sends add column if not exists dedupe_key text;
create unique index if not exists partner_sends_dedupe on public.partner_sends(dedupe_key) where dedupe_key is not null;

create table if not exists public.deleted_account_records (   -- no foreign key to auth.users, on purpose
  user_id uuid primary key,
  email text,
  orders jsonb not null default '[]',
  consents jsonb not null default '[]',
  deleted_at timestamptz not null default now()
);
alter table public.deleted_account_records enable row level security;
revoke all on public.deleted_account_records from anon, authenticated;

do $$ begin
  if not exists (select 1 from vault.secrets where name = 'cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'cron_secret', 'Scheduled jobs and server calls');
  end if;
end $$;
create or replace function public.server_secret()
returns text language sql stable security definer set search_path = public, vault as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1;
$$;
revoke all on function public.server_secret() from public, anon, authenticated;
grant execute on function public.server_secret() to service_role;

-- Partner rows are written only by the app function (partner.ts). Readers can read their own.
drop policy if exists "add own partner" on public.partners;
drop policy if exists "change own partner" on public.partners;
revoke insert, update, delete on public.partners from anon, authenticated;

drop policy if exists "read own email log" on public.email_sends;
create policy "read own email log" on public.email_sends for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.email_sends from anon, authenticated;

create extension if not exists pg_cron;
create extension if not exists pg_net;
-- Hourly email run (live job name: workbook-emails-hourly)
-- select cron.schedule('workbook-emails-hourly', '7 * * * *', $$
--   select net.http_post(url := '<SUPABASE_URL>/functions/v1/app/notify',
--     headers := jsonb_build_object('Content-Type','application/json','x-server-secret', public.server_secret()),
--     body := '{"op":"run"}'::jsonb, timeout_milliseconds := 120000); $$);
