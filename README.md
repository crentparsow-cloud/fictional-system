# Akana

The place where books become practical. A SaaS that turns published books into interactive guided workbooks, for many authors and publishers across genres, with a curated marketplace, a membership library, an invite-only author and publisher portal, Akana for organisations, and a white-label tier.

Build window: Monday 5 October to Friday 23 October 2026. Go or no-go at 15:00 on Friday 23 October. The plan, architecture, feature list, demo catalogue and open questions are in `docs/planning/`. Read `AK_Handover_2026-10-05.md` first. What has been built, day by day, is in `docs/DAY_LOG.md`. The "As built" section at the top of `docs/planning/AK_Architecture.md` lists every migration, route group, cron job and environment variable.

## Layout

```
apps/web/            Next.js 16 App Router: marketing, library, reader, studio, console, org, admin
apps/web/e2e/        Playwright smoke suite
packages/schema/     Workbook schema v3 as Zod, identity codes
packages/validate/   Validator: structure, house style, claims by genre, limits, refs, counts
packages/seal/       AES-256-GCM sealing for reader answers, key ring
packages/engine/     Reader components for every field type and screen
packages/emails/     Email templates and the mailer with its guards
packages/seed/       Builds the seed rows from the catalogue and the v3 workbooks
content/             Workbook JSON, catalogue, registry, help and studio help pages
supabase/            Migrations, database tests, seed SQL
scripts/             Migration, validation, seeding, key generation, database test runner, checks
legacy/              The old single-page app and edge functions, kept as the behaviour spec
docs/                Day log, testing, rollback, backups, launch checklist, legal drafts, planning
```

## Install

You need Node 22 or later and pnpm 10 (the version is pinned in `package.json`). For the database tests you also need Postgres 16 and `psql`.

```
pnpm install
cp .env.example apps/web/.env.local
```

Fill in `apps/web/.env.local`. Local work uses the staging project, `akana-staging`, never production. The comments in `.env.example` say what each variable does and what happens while it is blank. Production secrets are set in Vercel by Crent. Agents never see the service role key or the sealing keys. To make a sealing key for your own machine, run `pnpm tsx scripts/new-seal-key.ts`.

## Run

```
pnpm dev                     # http://localhost:3000
```

The demo white-label site answers on `http://demo.localhost:3000` once the demo has been reset from `/admin/demo`.

## Test

All commands run from the repo root unless a step says otherwise. `docs/TESTING.md` has the detail.

**Unit tests, types and lint.**

```
pnpm test                    # every package
pnpm --filter @akana/web test
pnpm typecheck
pnpm lint
pnpm check                   # typecheck, lint, unit tests and content validation together
```

**Content.**

```
pnpm migrate:v1 --check      # the 20 Maya Vaughn v1 files convert cleanly
pnpm validate --parked       # every v3 workbook validates
pnpm check:ids               # live workbooks keep their ids
pnpm tsx scripts/harness-all.ts   # every screen of every workbook renders
```

**Database, against a local Postgres.** Start a throwaway Postgres 16, then run the script. It creates a fresh database, applies every file in `supabase/migrations` in order on top of `supabase/tests/_shim.sql`, runs every test in `supabase/tests`, and drops the database again.

```
docker run --rm -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16
DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres bash scripts/db-test.sh
```

Any Postgres 16 works, including one on a local socket: `DATABASE_URL="postgres://postgres@localhost:5499/postgres" PGHOST=/tmp bash scripts/db-test.sh`.

**End to end.** Playwright with Chromium. Run `pnpm exec playwright install chromium` once on a fresh machine.

```
cd apps/web
pnpm e2e                                     # builds, starts on port 3100, runs the suite
E2E_SKIP_BUILD=1 pnpm e2e                    # reuse the existing build
E2E_BASE_URL=https://akana-one.vercel.app pnpm e2e   # read-only run against a deployed site
```

The remote run only makes GET requests and never signs in, so it is safe against production. For a protected Vercel preview, also set `VERCEL_AUTOMATION_BYPASS_SECRET`. If someone else is building in `apps/web` at the same time, a local run can fail with missing manifest errors; run it again when they are done.

CI (`.github/workflows/ci.yml`) runs the checks, the build with the client bundle and CSP guards, and the database tests on every push to `main` and every pull request. The end-to-end suite is run by hand.

## Build

```
pnpm --filter @akana/web build
node scripts/check-csp.mjs   # no third-party script origins in the CSP
```

`pnpm build` builds every package. Vercel builds `apps/web` with the settings in `apps/web/vercel.json` (Next.js, region `lhr1`, the cron jobs).

## Apply a migration

Migrations are applied by hand in the Supabase SQL editor, staging first, then production. Crent gives the go-ahead for production each time. The full steps, and what to do when one goes wrong, are in `docs/ROLLBACK.md`.

1. Never edit a migration that has been applied. A fix is a new file with the next free number, plus a test in `supabase/tests` with the same number. Run the database tests first.
2. In the Supabase dashboard, pick the project (`akana-staging`, then `akana-saas`) and check its name at the top.
3. Open SQL Editor, New query. Paste the whole committed file from `main`. Do not split it.
4. Type `begin;` above the pasted text and `commit;` below it, so an error part way through undoes the lot. Run it and read the result.
5. Record it in a new query, with a timestamp later than the last one and the file name without `.sql`:

   ```sql
   insert into supabase_migrations.schema_migrations (version, name)
   values ('<yyyymmddhhmmss>', '<file name>');
   select version, name from supabase_migrations.schema_migrations order by version;
   ```

6. Prove the change is there with a query, then run the Security Advisor and the Performance Advisor. Neither may report a new issue.
7. Note the migration, project, time and advisor result in `docs/DAY_LOG.md`.

The seed file is too large for the SQL editor. Load it on Crent's machine with `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm tsx scripts/seed.ts --apply`, or with `psql "<connection string>" -f supabase/seed/seed.sql`.

## Pushing when git push is blocked

The build session's git proxy has at times refused to push to the GitHub repository (the `origin` remote). When that happens, the commits are made locally as usual and the changed files go up through GitHub's web upload instead. The `Day 6 batch 4 (part N)` commits in the history were pushed this way, in parts.

1. List what changed since the last commit GitHub has: `git diff --name-status origin/main...HEAD` (or against the branch you are pushing).
2. On github.com, open the repository and create a branch for the batch, for example `day6-night`. Do not upload straight to `main`.
3. On that branch, open the folder the files belong in, choose **Add file**, then **Upload files**, and drop the files in. Dragging a folder keeps its paths. Keep each upload small (GitHub takes up to 100 files at a time) and give each commit a clear name, such as `Day 6 batch 4 (part 12)`.
4. Uploading cannot delete or rename a file. For a deleted file, open it on GitHub and delete it in its own commit. A rename is a delete plus an upload.
5. When every part is up, check the branch matches your local tree: the file list from step 1 against the branch on GitHub, and CI green on the branch.
6. Open a pull request into `main`, wait for CI, and merge it. Then fetch locally (`git fetch origin`) so your tree and GitHub agree before the next batch.

Vercel deploys from `main` once it is merged.

## Rules the code enforces

Reader answers are sealed before they reach Postgres and only the reader can unseal them. Emails never name a workbook title. Help now is one tap away in every wellbeing workbook. Nothing counts streaks or missed days. No third-party scripts or pixels on any host. Demo content is labelled on every surface and cannot be bought. Wellbeing copy runs the full claims check; other genres run a reduced one plus income promise rules. No organisation, author or member of staff can read a reader's answers.
