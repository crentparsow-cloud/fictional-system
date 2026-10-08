# Rollback plan

Thursday 8 October 2026. Feature F-145. For whoever is on duty at launch.

There are two kinds of rollback. The app (code on Vercel) can go back to an earlier build in seconds. The database (Supabase) cannot go back that way. A bad migration is fixed by a new migration that goes forward. Decide which one you are dealing with before you act.

## 1. Rolling back the app on Vercel

Use this when a deployment breaks pages, sign-in, checkout or the webhook, and the database is fine.

### Steps (dashboard)

1. Open the Vercel project for Akana. On the Overview page, find the Production Deployment tile and click **Instant Rollback**.
2. The dialog shows the current production deployment and the one before it. On the Pro plan, **Choose another deployment** lists every deployment that has been live on production before. On the Hobby plan only the one immediately before is offered.
3. Pick the last known good deployment. Check the domains listed, then click **Continue** and **Confirm Rollback**. The switch is immediate.
4. Run the smoke suite against production (GET requests only, safe): `cd apps/web && E2E_BASE_URL=https://akana-one.vercel.app pnpm e2e e2e/pages.spec.ts e2e/headers.spec.ts e2e/help-now.spec.ts`.
5. Write in `docs/DAY_LOG.md` what you rolled back, from which commit to which, and why.

You can also roll back from the Deployments tab: filter by `main`, open the menu (three dots) on a row and choose **Instant Rollback**.

### What a rollback does and does not do

From Vercel's documentation (Instant Rollback, checked 8 October 2026):

- **New pushes stop going live.** After a rollback Vercel turns off automatic assignment of the production domain. Merging to `main` builds a deployment but does not put it live. This is on purpose, so a fix is not pushed live by accident.
- **Environment variables are not rolled back.** The old build keeps the variable values it was built with. A variable changed in project settings since then is not picked up. If the fault was a wrong variable, fix the variable and redeploy instead of rolling back.
- **Cron jobs go back too.** The six crons in `apps/web/vercel.json` revert to the schedule in the rolled-back build.
- **The database does not move.** If the bad deployment shipped with a migration, the old code now runs against the newer schema. Migrations here only add, so the old code normally still works. Check before you roll back: if the new migration removed or renamed anything the old code reads, read section 2 first.

### Going forward again

When the fix is merged and its preview passes, click **Undo Rollback** on the Production Deployment tile and pick the new deployment, or run `vercel promote <deployment url>`. This puts it live and turns automatic assignment back on.

### Stripe and email during a rollback

Stripe keeps sending webhooks to `/api/stripe/webhook`. The handler returns 500 on a database error, and Stripe retries any delivery that does not get a 2xx answer. In live mode Stripe retries for up to three days; in test mode it retries only a few times. [check the current figures in Stripe's webhook documentation before go-live] Check the Stripe dashboard (Developers, Webhooks, `akana-test-webhook` and `akana-connect-payouts`) for failed deliveries after the incident and resend any that still show as failed.

## 2. A bad migration

### The rule

**Fix forward. Never edit a migration that has been applied.** Migrations 0001 to 0025 (there is no 0017) are applied to production and recorded. Editing one changes the file in the repo but not the database, so the two drift apart, every fresh test database then differs from production, and nobody can tell which version is true. The fix is always a new migration with the next free number.

Do not use the Supabase dashboard to change tables, policies or functions by hand on production. Every change goes through a numbered migration file that is tested first.

### What counts as bad, and what to do

| Situation | Action |
|---|---|
| The migration failed in the SQL editor | If it was wrapped in `begin;` and `commit;` (step 3 below), the failure leaves nothing applied. Do not record it. Fix the file, test it, apply again. If it was not wrapped, check which statements ran before the error and write the next migration to finish or undo them |
| It applied, and a function or policy is wrong | New migration that replaces the function (`create or replace`) or drops and recreates the policy |
| It added a column, table or index that is wrong | New migration that drops or alters it. Check no code reads it first |
| It changed data wrongly | New migration that puts the data right, written from what the audit log, a backup or Stripe shows. If the data cannot be rebuilt, see `docs/BACKUPS.md` |
| It opened access it should not (an RLS mistake) | Treat as a security incident. Ship the closing migration first, then investigate who read what from the logs |

### Writing and testing the fix

1. Take the next free number in `supabase/migrations/` (0026 to 0029 are already written and waiting, so today that is 0030), for example `0030_fix_<what>.sql`.
2. Add a test in `supabase/tests/0030_fix_<what>.sql` in the style of the others (see `_shim.sql`), that fails before the fix and passes after.
3. Run the database tests on a fresh database: `DATABASE_URL="postgres://postgres@localhost:5499/postgres" PGHOST=/tmp bash scripts/db-test.sh`. All migrations must apply in order and every test must pass.
4. Apply to staging (`akana-staging`) first, then production, as below.

### Applying a migration in the Supabase SQL editor

These are the steps used for every migration in this project so far. Crent gives the go-ahead for production each time.

1. Open the Supabase dashboard and pick the project: `akana-staging` first, then `akana-saas` for production. Check the project name at the top before you run anything.
2. Open **SQL Editor** and start a **New query**.
3. Open the committed migration file from the repo (the version on `main`, not a local copy that may differ) and paste the whole file in. Do not split it. The files in this repo have no `begin;` or `commit;` of their own, so type `begin;` on the first line above the pasted text and `commit;` on the last line below it. Then an error part way through undoes the whole migration.
4. Click **Run**. Read the result. With the `begin;` and `commit;` lines in place, any error means nothing was applied: stop and fix the file.
5. Record the migration so the project's history matches the repo. In a new query:

   ```sql
   insert into supabase_migrations.schema_migrations (version, name)
   values ('<yyyymmddhhmmss>', '0030_fix_<what>');
   ```

   The version is a timestamp later than the last one, and the name is the file name without `.sql`. The production history today ends with `20261007122500`, `0025_retire_reading_scripture`. Check it with:

   ```sql
   select version, name from supabase_migrations.schema_migrations order by version;
   ```

6. Check the change is in place with a query that proves it (the new function exists, the policy is there, the row count is right).
7. Open **Advisors**, **Security Advisor**, and run it. It must report no new issues. Do the same for the Performance Advisor.
8. Note in `docs/DAY_LOG.md` the migration, the project, the time, and the advisor result.

The seed file is too large for the SQL editor. It goes through `pnpm tsx scripts/seed.ts --apply` or `psql`, on Crent's machine.

### When the app and the migration must move together

If the fix needs both new code and a new migration:

- Apply the migration first if it only adds (new column, new function, wider policy). The old code ignores it.
- Deploy the code first if the migration removes something the old code still uses. Then apply the migration once the new code is live.
- Never apply a migration that the live code cannot run against.

## 3. Who decides

| Decision | Who |
|---|---|
| Roll back the app | Whoever is on duty, straight away, then tell Crent |
| Apply a fix-forward migration to production | Crent says yes first |
| Restore the database from a backup | Crent only. It takes the project offline and loses everything after the backup point. See `docs/BACKUPS.md` |
| Turn off live payments while investigating | Crent. Stripe live keys are his |
