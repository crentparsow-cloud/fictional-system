# Launch checklist

Thursday 8 October 2026. Feature F-145. For the go or no-go meeting on Friday 23 October at 15:00.

This list gathers every gate in section 7 of `docs/planning/AK_3_Week_Plan.md` (O1 to O21), every item on `docs/planning/AK_Post_Build_List.md`, and the M9 checks in the code track. Each line has an owner and a way to verify it. At the meeting every line is marked **Done**, **Waiting** (in hand, date known) or **Blocked** (cannot move without someone else).

No figure here is new. Prices, shares and dates are quoted from the source named. Where the post-build list and section 7 name the same thing, the line gives both numbers.

**What "launch" means.** The build finishes in Stripe test mode on 23 October. Taking real money needs the lines marked **Live gate** below. The plan's proposed live switch-on is Monday 26 October, only if every live gate is Done. Otherwise the product is ready and waits.

## 1. Code track (M9)

| # | Check | Owner | How to verify | Status |
|---|---|---|---|---|
| M1 | Feature freeze held from the end of Wednesday 21 October | Coordinator | `git log` shows only fix commits after the freeze | |
| M2 | Types, lint, unit tests green | Coordinator | `pnpm typecheck && pnpm lint && pnpm test` on the release commit | |
| M3 | Database tests green on a fresh database | Coordinator | `bash scripts/db-test.sh` passes for every migration | |
| M4 | Content checks green | Coordinator | `pnpm validate --parked` and `pnpm check:ids` report 0 findings | |
| M5 | Harness renders every screen of every workbook | Coordinator | `pnpm tsx scripts/harness-all.ts` exits 0 | |
| M6 | Production build and CSP check clean | Coordinator | `pnpm --filter @akana/web build` and `node scripts/check-csp.mjs` | |
| M7 | Smoke suite green locally and against the release preview | T12 | `pnpm e2e` (local) and `E2E_BASE_URL=<preview> pnpm e2e` | |
| M8 | Automated accessibility sweep green, both themes, phone and desktop | T12 | `pnpm e2e e2e/a11y.spec.ts`, local and remote. See `docs/ACCESSIBILITY.md` | |
| M9 | Manual accessibility pass done: keyboard, VoiceOver, TalkBack (F-144) | Named tester | The record table in `docs/ACCESSIBILITY.md` section 2.5 is filled in and every Fail is retested | |
| M10 | Accessibility line on `/trust` matches the manual results | T12 and Crent | Read `/trust` against the record table | |
| M11 | End-to-end: buy a single workbook in test mode | T12 with the staging test reader | Purchase row, entitlement, receipt email (or its log), ledger line all present | |
| M12 | End-to-end: membership start, renewal reminder, cancel | T12 | Subscription row, membership entitlement, cancellation email; cooling-off refund within 14 days refunds pro rata | |
| M13 | End-to-end: refund from the console reverses the author's share | T12 | Refund in Stripe test mode, entitlement revoked, reversing ledger line | |
| M14 | End-to-end: account deletion | T12 | Answers gone, Stripe customer redacted, deletion email sent, sign-in refused | |
| M15 | Load test in test mode on a preview | T12 | `node scripts/load/checkout-webhook.mjs` against the preview passes every scenario. Never against production. See section 4 | |
| M16 | Webhook signature rejection holds under load | T12 | The load test's two webhook scenarios return only 400 | |
| M17 | Backups confirmed | Crent | Every line in `docs/BACKUPS.md` section 6 | |
| M18 | Rollback plan read and a dry run done on a preview | Coordinator and Crent | One Instant Rollback and Undo Rollback on the project, noted in `DAY_LOG.md`. See `docs/ROLLBACK.md` | |
| M19 | Signed-in journey test runs on staging | T12, after T7 | Needs the staging test reader and the staging service role key in CI (`docs/TESTING.md`) | |
| M20 | Migrations 0026 onwards applied to staging, then production, on Crent's go-ahead | Crent says yes; agent applies | `select version, name from supabase_migrations.schema_migrations` matches `supabase/migrations/` | |
| M21 | Supabase Security and Performance Advisors show no issues on production | Coordinator | Advisors page after the last migration | |
| M22 | Demo visibility on the live site decided (B4) | Crent | Decision in `DAY_LOG.md`; `demo_visible` set to match | |
| M23 | Live-mode switch rehearsed | Crent with an agent | The steps in section 3 read through on a preview with test keys, no live keys used | |

## 2. Parallel track outside the code (plan section 7)

| # | Gate | Owner | How to verify | Live gate | Status |
|---|---|---|---|---|---|
| O1 / C15 | UK company that sells as Akana confirmed or registered | Crent | Companies House number, recorded in the company details page and the terms | Yes | |
| O2 / C16 | Business bank account for Stripe payouts | Crent | Account added and verified in Stripe | Yes | |
| O3 / C17 | Real business postal address | Crent | `POSTAL_ADDRESS` set in Vercel; the mailer stops refusing marketing and progress mail | Yes | |
| O4 / C18 | AKANA trade mark clearance (classes 9, 16, 41, 44; UK, US, EU) | Trade mark attorney, engaged by Crent | Attorney's written opinion | Yes (gate G1 for the domain) | |
| O5 / C5 | Domains: main apex and tenant apex, DNS for Vercel and Resend | Crent buys; agent prepares records | Domains show Valid in Vercel; Resend shows SPF, DKIM and DMARC verified | Yes | |
| O6 / C19 | Support address on the domain, shared inbox with a DPA | Crent | Test email to the address arrives and the not-a-crisis-service auto-reply comes back | Yes | |
| O7 / S2, S3 | Stripe platform account under the company, Stripe Tax on, Connect profile submitted and approved, live activation | Crent | Stripe dashboard shows the account activated and Connect approved | Yes (Connect only for author payouts) | |
| O8 / A1, A2, A6 | VAT approach: UK registration, EU or not, US sales tax monitoring | Accountant | Written advice; Stripe Tax registrations match it | Yes | |
| O9 / A4 | Royalty withholding on non-UK authors | Accountant | Written advice. Until then payouts to them stay on manual hold | Before the first overseas payout | |
| O10 / L1 to L8 | Reader terms, privacy notice, cookie statement, refund policy, author licence, publisher terms, white-label terms, DPA and sub-processors | Lawyer | Signed-off text replaces each draft in `docs/legal/`; DRAFT banner removed from `/legal/*` | Yes (gate L3) | |
| O11 / L9, C28 | DPIA and records of processing | Crent signs, lawyer reviews | Signed copy on file | Yes, for wellbeing titles | |
| O12 / C20 | ICO data protection fee | Crent | ICO register entry for the company | Yes | |
| O13 / C21, L13 | DMCA designated agent | Crent | US Copyright Office directory entry | Before third-party titles go on sale | |
| O14 / C22 | EU legal representative under the DSA | Crent | Appointment letter, only if selling to the EU | Only for EU sales | |
| O15 / C23 | Clinician sign-off for higher-tier titles and the crisis word list (gate C1) | Clinician, booked by Crent | Signed review. Until then higher tier stays paused and the word list stays interim (T12) | Not for launch if higher tier stays paused | |
| O16 / C24 | Sellable content on day 1 | Crent | At least one title live and buyable in test mode that is not a demo: a signed-off classic, a cleared Maya Vaughn title or a licensed title | Yes | |
| O17 / C25 | Paid plans: Vercel Pro, Supabase paid plan | Crent | Billing pages show both. Supabase Pro is also needed for backups (`docs/BACKUPS.md`) | Yes | |
| O18 / C27 | Apple developer account, only if Sign in with Apple is wanted | Crent | Account active and the Apple provider set in Supabase Auth | Only if wanted | |
| O19 / C30 | Author outreach | Crent | First approach sent, after the licence and revenue share exist | No | |
| O20 / C11 | Theological Reviewer, ideally a panel | Crent | Named reviewers; their sign-off kind recorded in the release gate | Before any faith title leaves review | |
| O21 / L10, L11, L12 | Lawyer scope widened: organisation terms, group use, Online Safety Act view, KJV wording | Lawyer | Written advice for each | Before faith titles or any organisation go live | |

## 3. Live-mode switch-on (only when every live gate is Done)

| # | Step | Owner | How to verify | Status |
|---|---|---|---|---|
| L-1 | Real prices set: membership (C1, interim £7.99 a month and £69.99 a year) and the workbook ladder (C2) | Crent | Price points in the database match Crent's decision; checkout no longer shows "Price to be confirmed" | |
| L-2 | D1 to D5 decided: charge model, shares, pool, royalty base, payout settings (C3, C4) | Crent | Config rows match; placeholder marks removed | |
| L-3 | Live keys, live webhook secrets and live membership price ids in Vercel (S5, T14) | Crent only | Vercel Production variables present; a redeploy done after | |
| L-4 | Live webhook endpoints created for the platform and for connected accounts, same events as test (S4) | Crent | Stripe live dashboard lists both endpoints and their events | |
| L-5 | Customer portal settings carried to live (S7) | Crent | Live portal opens from `/you` with the same options | |
| L-6 | API version checked at live (S8) | Agent | Code pin and dashboard version recorded in `DAY_LOG.md` | |
| L-7 | Stripe Tax test checkouts from a UK and a US address (S1) | Crent | Tax lines on the test receipts match the accountant's advice | |
| L-8 | Checkout consents live before the first live payment (T9) | Agent | A test checkout records the consent wording and version | |
| L-9 | First live purchase by Crent, then a refund | Crent | Purchase, ledger line, receipt, refund and reversal all present in live mode | |
| L-10 | Email warm-up on the new sending domain | Crent | Small volumes first (sign-in links and receipts only); Resend shows no bounces or complaints after the first days | |

## 4. Running the load test

The load test only sends requests that are safe on any deployment: the health check, a few public pages, the webhook with no signature and with a forged one, and a signed-out checkout. None reaches Stripe, writes to the database or sends an email. It refuses `akana-one.vercel.app` and any host in `LOAD_DENY_HOSTS`, and any host other than localhost needs `LOAD_CONFIRM_PREVIEW=1`.

Against a Vercel preview:

1. Open the preview for the release branch in Vercel and copy its URL (it ends in `.vercel.app` and is not the production domain).
2. If the preview has deployment protection, have the automation bypass secret to hand as `VERCEL_AUTOMATION_BYPASS_SECRET`. Do not paste it into any file.
3. From the repo root:

   ```
   LOAD_BASE_URL=https://<preview>.vercel.app LOAD_CONFIRM_PREVIEW=1 node scripts/load/checkout-webhook.mjs
   ```

4. Defaults: 200 requests per scenario, 10 at a time, p95 budget 2000 ms. Change them with `LOAD_REQUESTS`, `LOAD_CONCURRENCY` and `LOAD_P95_MS`. `LOAD_ONLY=health,webhook-forged-signature` runs a subset.
5. It exits 0 when every scenario returns only its expected status inside the budget. Paste the summary table into `DAY_LOG.md`.

Against a local production build: `pnpm --filter @akana/web build && pnpm --filter @akana/web start -p 3100`, then `LOAD_BASE_URL=http://localhost:3100 node scripts/load/checkout-webhook.mjs`.

A full checkout under load (a real test-mode Checkout Session for each request) is not in this script, because it needs a signed-in reader and creates Stripe objects. Run it, if wanted, only on staging with the test reader, at low volume, and within Stripe's test-mode rate limits [check Stripe's current limits].

## 5. Post-build list, the items not already above

### Crent

| # | Item | Owner | How to verify | Status |
|---|---|---|---|---|
| C6 | `OPS_ALERT_TO`: real staff alerts address (deferred; alerts go to `LEADS_NOTIFY_TO` meanwhile) | Crent | Variable set in Vercel; a test alert arrives | Deferred |
| C7 | `LEADS_NOTIFY_TO`: address that receives enquiries | Crent | A test enquiry arrives there | |
| C8 | Staff owner role and TOTP | Crent | `/admin` opens after a TOTP challenge | |
| C9 | Board codes for the 20 Maya Vaughn titles | Crent | Codes replace the provisional AK- codes before any of them goes live | |
| C10 | Public-domain record signer | Crent | Each record in `docs/public-domain/` shows a reviewer and date | |
| C12 | Second reviewer besides Crent | Crent | A second staff account with the reviewer role; one override tested | |
| C13 | Schema v3 freeze sign-off and its open questions | Crent | Initials and date on `docs/SCHEMA_V3_FREEZE.md` | |
| C14 | Order of the three new shelves | Crent | Shelf `sort` values match his order | |
| C26 | Google OAuth client for Google sign-in | Crent | Google provider on in Supabase Auth; a test sign-in works | |
| C29 | Lawyer and accountant engaged, drafts sent | Crent | Engagement letters; drafts acknowledged | |

### Lawyer

| # | Item | Owner | How to verify | Status |
|---|---|---|---|---|
| L5 | Author licence (deferred to after the build) | Lawyer | Approved text loaded as a new licence version | Deferred |
| L14 | Titles close to existing books (12 close, 1 clash) | Lawyer | Written view per title; renames done where advised | |
| L15, L16 | Faith consent wording and the religious belief line | None | Closed by Crent on 7 October | Closed |

### Accountant

| # | Item | Owner | How to verify | Status |
|---|---|---|---|---|
| A3 | Managed Payments split option | Accountant | Written view; decision in `DAY_LOG.md` | |
| A5 | Whether a code-only email receipt is a valid VAT invoice; record retention | Accountant | Written view; receipt template changed if needed | |
| A7 | Self-billing for author statements | Accountant | Written view; statement wording changed if needed | |

### Stripe

| # | Item | Owner | How to verify | Status |
|---|---|---|---|---|
| S6 | Test keys in Vercel (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) | Crent | A test checkout on the preview reaches Stripe and the webhook returns 200 | |
| S4 (test) | `STRIPE_CONNECT_WEBHOOK_SECRET` in Vercel for the test Connect endpoint | Crent | A test `account.updated` event is accepted | |

### Technical

| # | Item | Owner | How to verify | Status |
|---|---|---|---|---|
| T1 | `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`; sending domain verified; Supabase Auth templates pasted | Crent | A magic link arrives from Akana's own address | |
| T2 | `LEAD_HASH_SALT` in Vercel | Crent | The enquiry form on `/publish` accepts a test enquiry | |
| T3 | `CRON_SECRET` in Vercel | Crent | Vercel cron logs show all eight crons (listed below) returning 200 | |
| T4 | `ANSWERS_KEYS` in Vercel, and a safe copy kept apart from backups | Crent | An answer saves and reads back on the preview | |
| T5 | DMCC six-month reminder rule rechecked when final regulations are published (expected January 2027) | Agent | Note in `DAY_LOG.md` | After launch |
| T6 | Scotland and Northern Ireland signposts | Agent, checked on each provider's own site | New lines in `apps/web/lib/support-lines.ts` with their source | |
| T7 | Demo login accounts and the staging test reader | Crent approves addresses | Accounts exist on staging only | |
| T8 | Reading Scripture follow-ups | Agent; Crent approves apply | 0025 on staging and production; seed and app filters updated | |
| T10 | Retry a failed Stripe redaction on a later run | Agent | Ops sweep log shows the retry | |
| T11 | Tenant host lookup on (`TENANT_DB_LOOKUP=1`) once the tenant apex exists | Agent | A tenant host resolves from the database | After C5 |
| T12 | Crisis phrase list in `apps/web/lib/search-safety.ts` stays interim until clinician sign-off | Clinician | Signed list replaces the interim one | Interim |
| T13 | External penetration test before the first paying white-label tenant | Crent books | Report received and findings closed | After launch |

The eight crons in `apps/web/vercel.json`. Vercel runs them on UTC, once a day each.

| Path | Schedule | Time (UTC) | What it does |
|---|---|---|---|
| `/api/ops/demo-reset` | `37 2 * * *` | 02:37 | Puts the demo publisher, its site and logins back to the start |
| `/api/account/complete` | `17 3 * * *` | 03:17 | Finishes account deletions whose 7-day undo has passed |
| `/api/ops/sweep` | `23 4 * * *` | 04:23 | Retention sweep and organisation offboarding |
| `/api/money/daily` | `13 5 * * *` | 05:13 | Stripe reconciliation, then closes pool and statement months |
| `/api/ops/domain-check` | `29 6 * * *` | 06:29 | Checks each white-label host's verification record |
| `/api/membership/reminders` | `41 8 * * *` | 08:41 | Six-monthly terms reminder for monthly members |
| `/api/org/billing-mail` | `53 8 * * *` | 08:53 | Organisation billing emails and consumer terms reminders |
| `/api/money/payout-run` | `47 9 * * *` | 09:47 | Payout run; acts only on the payout day (test mode only) |

## 6. The go or no-go call

Crent decides on Friday 23 October at 15:00:

1. The live switch-on date, against section 2 (every line marked Live gate must be Done) and section 3.
2. Whether demo titles are visible on the live site (B4, line M22).
3. What moves after launch, if any M line is not Done.

Record the decision, who was there and every line's status in `docs/DAY_LOG.md`.
