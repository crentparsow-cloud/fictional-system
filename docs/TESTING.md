# Testing Akana

This page explains how to run each kind of test, what the end-to-end smoke suite covers, and what the signed-in journey test still needs. Commands run from the repo root unless a step says otherwise.

## The test layers

| Layer | What it proves | Command |
|---|---|---|
| Unit | Engine, schema, seal, validator, emails and web helpers behave as specified | `pnpm test` |
| Types and lint | The code compiles and follows the lint rules | `pnpm typecheck` and `pnpm lint` |
| Content | Every v3 workbook validates and v1 files migrate cleanly | `pnpm migrate:v1 --check` then `pnpm validate --parked` |
| Plain English (optional) | Sentences over 25 words, negative contractions, banned words and short unit titles, over the workbooks and `apps/web/messages`. Warnings only; see docs/VOICE.md | `pnpm validate --parked --style` |
| Classics source | Edition named, copyright and date, scan quality, reversible modernisation log for a public-domain source text. See docs/content/CLASSICS_PIPELINE.md | `pnpm tsx scripts/classics-source-check.ts source.txt --code AK-XXXXX` |
| Database | Migrations apply to a fresh database and the RLS isolation tests pass | `DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres bash scripts/db-test.sh` |
| Harness | Every screen of every workbook renders through the engine | `pnpm tsx scripts/harness-all.ts` |
| End to end | The built site serves its public pages safely to a signed-out visitor | `pnpm --filter @akana/web e2e` |

`pnpm check` runs types, lint, unit tests and content validation in one go.

The database tests need a Postgres 16 server. Locally, `docker run --rm -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16` is enough. The script creates a throwaway database, applies `supabase/migrations`, runs `supabase/tests`, and drops it again.

The harness writes its table to `docs/reports/harness-<date>.md` and exits 1 on any render failure.

## End-to-end tests

The suite lives in `apps/web/e2e` and uses Playwright with Chromium. The config is `apps/web/playwright.config.ts`. It has two projects, and `E2E_BASE_URL` decides which one runs.

### Locally (the "local" project)

```
cd apps/web
pnpm e2e
```

With `E2E_BASE_URL` unset, Playwright builds the app, starts it with `next start` on port 3100 and runs the suite against it. Supabase gets placeholder settings (`https://example.supabase.co`), so pages that need data show their empty or error states. Server logs will show `fetch failed` for those reads. That is expected.

Useful switches:

- `E2E_SKIP_BUILD=1 pnpm e2e` reuses the existing `.next` build.
- Outside CI, a server already listening on port 3100 is reused.
- `pnpm e2e e2e/help-now.spec.ts` runs one file.
- `pnpm e2e --ui` opens the Playwright UI.
- `E2E_CHROMIUM_PATH` points at a specific Chromium. Without it, `/opt/pw-browsers/chromium` is used when present, otherwise Playwright's own download. On a fresh machine run `pnpm exec playwright install chromium` once.

Results and the HTML report go to `apps/web/node_modules/.e2e`, which git and ESLint already ignore.

Several people build in `apps/web` at once during the sprint. A build started by someone else replaces `.next` underneath a running server, and the local run then fails with missing manifest errors. Run the full suite when nobody else is building, or rely on CI.

### Against a preview or production (the "remote" project)

```
cd apps/web
E2E_BASE_URL=https://akana-one.vercel.app pnpm e2e
```

With `E2E_BASE_URL` set, no server is started and only the "remote" project is registered. The specs make GET requests and page loads only. They never sign in and never submit a form, so they are safe against production.

For a Vercel preview behind deployment protection, also set `VERCEL_AUTOMATION_BYPASS_SECRET`. The config sends it as the `x-vercel-protection-bypass` header.

## What the smoke suite covers

| Spec | Checks |
|---|---|
| `pages.spec.ts` | `/`, `/help-now`, `/publish`, the four legal pages and `/sign-in` return 200 with one visible, non-empty h1 inside `<main>`. Help now and Sign in headings carry their names. `/library` and `/admin` send a signed-out visitor to `/sign-in?next=%2Flibrary` and `/sign-in?next=%2Fadmin`, both as a raw redirect and in the browser. |
| `headers.spec.ts` | `/` sends a Content-Security-Policy whose only third-party script origin is `https://js.stripe.com`, with `frame-ancestors 'none'` and `object-src 'none'`. `X-Frame-Options: DENY` and `X-Content-Type-Options: nosniff` are present. Strict-Transport-Security is checked on the remote project only. Locally, a request with an unconfigured Host header gets a 404. |
| `third-party.spec.ts` | Every request made while `/`, `/help-now` and `/publish` load goes to the app's own origin or `*.supabase.co`. `js.stripe.com` is allowed only on a page that carries a Stripe.js script tag, and none of these do. |
| `help-now.spec.ts` | Every `tel:` link on `/help-now` is a dialable number and has an accessible name. The first line is emergency services. A UK browser (en-GB) is shown 999. |
| `a11y.spec.ts` | axe with WCAG 2.2 A and AA rules on `/`, `/help-now` and `/publish`. Fails on serious or critical violations. |

Heading text is not asserted on pages that are still being rewritten. When a page settles, add its heading to `pages.spec.ts`.

A test marked `test.fixme` records a real defect in the app. Its comment names the defect. Remove the `fixme` once the fix lands.

The axe run is the automated part of F-144 only. The manual keyboard, VoiceOver and TalkBack pass, both themes, 320px width and 200% text are still a separate job in week 3.

## The signed-in journey test (not built yet)

The Friday smoke run in the plan is: sign in, open a workbook, answer, reload, check the answer is still there, open Help now on a wellbeing title. It cannot run unattended until two things exist.

1. **A test reader account on staging.** A dedicated reader on the staging Supabase project, adult confirmed, with access to at least one wellbeing workbook (free first week is enough). It must never exist in production.
2. **A way to sign in without email.** Sign-in is a magic link, and CI cannot read an inbox. The plan is a staging-only step that uses the Supabase service role to generate a magic link for the test reader (`auth.admin.generateLink`), then opens it in the browser to set the session. That needs the staging service role key as a CI secret, which only Crent can provide. It must be scoped to the staging project and never set for production.

Once both exist, the journey test belongs in its own project pointed at staging, with the service role key read only inside the test setup and never sent to the browser.

## Wiring end-to-end tests into CI

Add this job to `.github/workflows/ci.yml` under `jobs:`.

```yaml
  e2e:
    name: End-to-end smoke (local build)
    runs-on: ubuntu-latest
    timeout-minutes: 20
    env:
      CI: "true"
      NEXT_PUBLIC_SUPABASE_URL: https://example.supabase.co
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ci-placeholder
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: pnpm install
      - run: pnpm --filter @akana/web exec playwright install --with-deps chromium
      - run: pnpm --filter @akana/web build
      - run: pnpm --filter @akana/web e2e
        env:
          E2E_SKIP_BUILD: "1"
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: apps/web/node_modules/.e2e
          retention-days: 7
```

A remote run against a Vercel preview can follow later as a job triggered by `deployment_status`, with `E2E_BASE_URL: ${{ github.event.deployment_status.target_url }}` and `VERCEL_AUTOMATION_BYPASS_SECRET` from repository secrets.
