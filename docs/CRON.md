# Cron: Vercel and Supabase together

Migration 0040 adds three Supabase Cron (pg_cron) jobs. They call Today routes over HTTP with the same `CRON_SECRET` the Vercel crons use. Vercel Cron in `apps/web/vercel.json` is unchanged. Both can run, because the new routes are idempotent.

| Job | Schedule (UTC) | Route |
| --- | --- | --- |
| akana-today-reminders | every 15 minutes | /api/today/reminders |
| akana-review-candidates | 03:05 daily | /api/today/review-candidates |
| akana-pickup-check | 09:20 daily | /api/today/pickup |

## One-off set-up (only the owner can do this)

1. In Supabase, enable the extensions pg_cron, pg_net and supabase_vault (Database, Extensions). The migration tries to create them and skips with a notice if it cannot.
2. Store the secret: `select vault.create_secret('<same value as CRON_SECRET>', 'cron_secret');`
3. Set the site origin: `update public.app_config set value = to_jsonb('https://your-domain'::text) where key = 'cron_base_url';`
4. Check the runs: `select * from public.cron_runs order by started_at desc limit 20;` (staff can also read it). Each run logs sent, skipped or error with an SQL state only, never a secret or an address.

While the secret or base URL is missing, the job logs a skipped run and does nothing.

## Idempotency

- Reminders: the mailer claims a key per reader, programme, step and local date in `email_claims` before sending. A second run, or the same job from Vercel as well, sends nothing new.
- Stopping email: sent once, then the programme's reminders are switched off.
- Pick-up: one win-back per gap, and not within 36 hours of a reminder.
- Review candidates: the list is rebuilt for the day and replaced, ids only.

## Settings in app_config

reminder_stop_after (4), pickup_gap_days (14), break_after_minutes (45), cron_base_url (blank).

## Not tested here

The pg_cron, pg_net and Vault calls need a Supabase project. The SQL tests cover the tables, grants, targets and the skip path.
