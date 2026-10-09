# Akana test plan

Written Friday 9 October 2026, at the end of the three-week build. This is the plan for testing the whole app before and after launch: every built feature on its own first, then the same features working together along the journeys a real person takes. It is a working document. Tick tests off in the log at the end, and add rows when a feature changes.

How to use it. Part A is the individual tests, one surface at a time. Part B is the combination tests, each a journey that crosses several surfaces. Part C is the cross-cutting checks that apply everywhere. Part D is the short regression set to run before every deploy. Part E records runs. `docs/TESTING.md` says how to run the automated layers; this plan says what to test and what a pass looks like.

Where a test runs. **Local** is a Playwright or unit run against a build on the developer's machine. **Staging** is the Supabase staging project with a preview deployment or local build pointed at it. **Production** is akana-one.vercel.app, and only tests marked safe for production run there: reading pages, signed-in browsing with a demo account, and Stripe sandbox payments while the keys are test keys. Nothing that creates organisations, sends mail to strangers, deletes accounts or moves money runs on production.

Test accounts. The plan needs five accounts on staging: a reader with no purchases, a reader with one purchase, a member, the demo author and demo publisher in Quillmoor Demo Press, and a staff owner with an authenticator. It needs two organisation accounts once Akana Business is tested: an owner and a leader. Crent approves the addresses (post-build item T7). Stripe test cards: 4242 4242 4242 4242 for success, 4000 0000 0000 0002 for a decline, 4000 0025 0000 3155 for a 3D Secure challenge.

Status values for the log: **Pass**, **Fail** (with the defect number), **Blocked** (say by what), **Not run**.

Found on 9 October while preparing this plan, and worth knowing before running it:

- Migration 0035 fixed `app.uid()`. Before it, no signed-in reader could pass the welcome page on production, and every RLS rule saw the caller as anonymous. Tests A2.1 to A2.4 and the whole of Part B would have failed on production before that date.
- The five live classics have no content version, so `/read` returns 404 for them. They are listed but cannot be read or bought through the page. Any test that needs a sellable, readable title must use a title that has content and is not a demo. Until one exists, the checkout tests call `/api/checkout` directly.
- The Buy and Membership buttons on the public workbook page (`/w/{slug}`) are still placeholders; the live buttons are on the paywall at `/read/{slug}`.
- Stripe automatic tax needs a head office address in the sandbox before any Checkout Session can be created (post-build item S1).
- All 194 production workbooks now carry a price point on the six-step ladder (£7.99 to £14.99). The ladder is permanent until Crent changes it.

## Part A. Individual feature tests

Each row is one test. The feature ids are from `docs/planning/AK_Feature_List.json`. "Auto" names the automated layer that already covers the row, where one exists; "Manual" means a person follows the steps.

### A1. Public site and library (F-001 to F-011)

| # | Feature | Test | Pass looks like | Where | How |
|---|---|---|---|---|---|
| A1.1 | F-002 | Open `/` signed out | 200, one h1 inside main, no third-party requests except supabase.co, CSP present | Prod | Auto: e2e pages, headers, third-party |
| A1.2 | F-003 | Open `/library` signed out | Redirect to `/sign-in?next=%2Flibrary` | Prod | Auto: e2e pages |
| A1.3 | F-003 | Signed in, open the Library; filter by shelf, Theme, author, length, Mine, In progress | Count line changes with every filter; filters combine; clearing returns the full count | Staging | Manual |
| A1.4 | F-003 | Search "sleep" in the Library | Results appear without a network request leaving the page; Help now comes first for a crisis word | Staging | Manual, with the network panel open |
| A1.5 | F-004 | Open a demo title and a classic | Demo badge and demo note on the demo title; no badge on the classic; demo note says nothing is for sale | Prod | Manual |
| A1.6 | F-005 | Open `/w/{slug}` for a live title signed out, then for a draft title | Live title renders with author, imprint, outline; draft returns 404 | Prod | Manual |
| A1.7 | F-005 | Open `/w/{slug}` for a hidden Theme's title | 404; the Theme name appears nowhere | Staging | Auto: catalogue-guard unit tests, plus manual |
| A1.8 | F-006 | Open an author page and a publisher page | Only live titles listed; demo author carries the demo note | Prod | Manual |
| A1.9 | F-007 | Open `/themes` and one Theme page | A Theme shows only when it has three live titles; its page lists them | Prod | Manual |
| A1.10 | F-008 | Type a crisis word into search | Help now card appears first, before any workbook | Staging | Auto: search-safety unit tests, plus manual |
| A1.11 | F-009 | Open `/publish`, `/publishers`, `/white-label`, `/pricing` | 200; the pricing page shows the six ladder figures £7.99 to £14.99 and both membership prices | Prod | Manual |
| A1.12 | F-001 | Submit the enquiry form with a test address | Row in `leads` with a hashed address; mail to `LEADS_NOTIFY_TO`; a second submission inside the limit is refused calmly | Staging | Manual |
| A1.13 | F-010 | Open `/help` and three topics | 200, headings present, every internal link resolves | Prod | Manual |
| A1.14 | F-011 | Fetch `/sitemap.xml` and `/robots.txt` | Sitemap lists live non-demo titles only; demo pages carry noindex | Prod | Manual |
| A1.15 | F-021 | Open `/help-now` as en-GB and as en-US | UK sees 999 first; US sees 911 first; every tel: link dials | Prod | Auto: e2e help-now |

### A2. Sign-in, gates and consent (F-132, F-127, F-122, F-026, F-150)

| # | Feature | Test | Pass looks like | Where | How |
|---|---|---|---|---|---|
| A2.1 | F-132 | Request a magic link; open it | Signed in; the `next` path is honoured; a tampered `next` goes to `/home` | Staging | Manual |
| A2.2 | F-132 | Open a used or expired link | Calm error, a way to request another | Staging | Manual |
| A2.3 | F-127, F-122 | New reader lands on `/welcome` | Both boxes required; Continue writes `adult_confirmed_at` and one `terms_acceptances` row with context signup | Staging | Manual, then check the rows |
| A2.4 | F-122 | Bump `READER_TERMS_VERSION` on a test build | Existing reader is asked again with context reask; a stale form posts and is refused with error=required | Local | Manual |
| A2.5 | F-026 | Open a wellbeing title with no health consent | Redirect to the consent screen; declining returns to the Library; accepting writes the consent version and opens the title | Staging | Auto: consent unit tests, plus manual |
| A2.6 | F-150 | Open a Faith shelf title | Faith consent asked after the health one where both apply; recorded once | Staging | Manual |
| A2.7 | F-143 | Staff sign in, open `/admin` without a second factor | Sent to `/verify`; after the authenticator, lands on `/admin` (PR #4) | Prod, staff account | Manual |
| A2.8 | F-143 | Owner tries a money change in `/console` on a session without aal2 | Refused by the API and by the database (0032, 0034) | Staging | Auto: db tests, plus manual |
| A2.9 | F-025 | Sign out | Session gone; `/home` redirects to sign-in; back button shows nothing private | Staging | Manual |

### A3. Reader app (F-014 to F-031, F-134, F-140)

| # | Feature | Test | Pass looks like | Where | How |
|---|---|---|---|---|---|
| A3.1 | F-015 | Harness render of every workbook | Every screen renders; report written to `docs/reports` | Local | Auto: `harness-all.ts` |
| A3.2 | F-019 | Open a priced non-demo title with no entitlement | First unit free; unit two shows the calm paywall with the ladder price and both membership prices; Buy enabled | Staging | Manual |
| A3.3 | F-019 | Open a demo title | No paywall buttons; demo message | Prod | Manual |
| A3.4 | F-015, F-134 | Answer three fields, reload, sign out and in | Answers persist and are readable only by that reader; `answers` rows are sealed, not plain text | Staging | Manual, then check the rows |
| A3.5 | F-134 | Rotate `ANSWERS_KEYS` on a test build | Old answers still decrypt; new ones use the new key | Local | Manual |
| A3.6 | F-016 | Enrol in two workbooks | Home shows both with where you left off; Today shows the day's step for each | Staging | Manual |
| A3.7 | F-017 | Set My plan, prefill, finish | Finish sequence runs once; progress shows no streak language | Staging | Manual |
| A3.8 | F-022 | Open a tier-2 answer card | Hardest answer card appears with the safety line; tier-3 titles stay paused | Staging | Manual |
| A3.9 | F-023 | Export my work | File downloads with answers in plain text for that reader only; nothing from another workbook or reader | Staging | Manual |
| A3.10 | F-024 | Add the calendar reminder | .ics downloads and opens; time respects the market locale | Staging | Manual |
| A3.11 | F-030 | Set a check-in partner, trigger a check-in | Partner mail sent once; level-3 note shown where it applies | Staging | Manual |
| A3.12 | F-031 | Turn on hard-day mode | Toolkit reorders; read aloud works on one screen | Staging | Manual |
| A3.13 | F-140 | Go offline, open Help now | Offline page served by the service worker; nothing else cached | Staging | Manual, airplane mode |
| A3.14 | F-025 | Change settings, request data export, request deletion | Settings persist; export arrives; deletion is scheduled and listed in admin F-091 | Staging | Manual |
| A3.15 | F-154 | Open support signposts from a money-worries title | England and Wales lines listed; the T6 gap for Scotland and Northern Ireland is known | Prod | Manual |

### A4. Commerce (F-092 to F-106)

| # | Feature | Test | Pass looks like | Where | How |
|---|---|---|---|---|---|
| A4.1 | F-093 | Read `price_points` and `PRICE_LADDER` | Six active workbook points, £7.99, £8.99, £9.99, £11.99, £12.99, £14.99, each with a Stripe price id; config mirrors the database | Prod, Staging | Auto: pricing unit tests, plus a query |
| A4.2 | F-094 | Open the paywall as GB, IE and US profiles | GB sees £; IE and US see the GBP figure with the sterling note; nothing converted | Staging | Auto: market-price unit tests, plus manual |
| A4.3 | F-096 | POST `/api/checkout` for a demo, a draft, an unpriced and an owned title | 409 with the right plain message each time; no Stripe call, no `purchases` row | Staging | Auto: route unit tests |
| A4.4 | F-096 | POST with a stale terms or consent version | 409 terms_changed or consent_changed | Staging | Auto: route unit tests |
| A4.5 | F-096 | POST eleven times in an hour | Eleventh is 429 | Staging | Manual or script |
| A4.6 | F-096 | Successful checkout with 4242 | `purchases` row pending, then paid by the webhook; `entitlements` row active; `checkout_consents` linked to the session; funnel count up by one; Stripe session shows "Akana workbook" and the AK code only | Staging, Prod sandbox | Manual |
| A4.7 | F-096 | Checkout with the decline card | Session stays open; purchase stays pending; no entitlement | Staging | Manual |
| A4.8 | F-096 | Checkout with the 3D Secure card | Challenge shown; on success the same as A4.6 | Staging | Manual |
| A4.9 | F-096 | Stripe refuses (for example tax not set up) | 502 with "Could not start checkout."; logged by code, not message | Staging | Auto: route unit tests after the 9 October fix |
| A4.10 | F-096 | Replay the same webhook event twice | Second delivery is a no-op; one entitlement | Staging | Auto: stripe-webhook unit tests |
| A4.11 | F-098 | After A4.6, open the receipt mail | Sent through Resend to the reader; carries the AK code and amount, never the title | Staging | Manual |
| A4.12 | F-097 | Join the membership monthly, then switch to yearly in the portal, then cancel | Entitlement with source membership; covers in-membership titles only; cancel sets `ends_at`; reminders scheduled (0011) | Staging | Manual |
| A4.13 | F-095 | Entitlement edge cases | A member can still buy a title outside the membership; a team_seat never blocks a purchase; an expired entitlement does not open content | Staging | Auto: entitlements unit tests |
| A4.14 | F-102 | Refund a purchase from the console | Stripe refund issued; entitlement revoked; ledger reversal written | Staging | Manual |
| A4.15 | F-100, F-104 | Run the month-end ledger and pool jobs | Net receipts split per D1 to D4 settings; pool divided by the basis; statements PDF and CSV generated (F-101) | Staging | Manual, with seeded sales |
| A4.16 | F-099 | Organisation payee onboards with Connect Express | Account created in the sandbox; status mail sent; payout held until the hold rules clear (F-103) | Staging | Manual |

### A5. Author portal (F-033 to F-045)

| # | Feature | Test | Pass looks like | Where | How |
|---|---|---|---|---|---|
| A5.1 | F-033 | Accept an author invite | Author role on the organisation; portal opens; a second use of the invite fails | Staging | Manual |
| A5.2 | F-034, F-035 | Edit profile, add a book with contributors and an edition | Saved; public author page updates after release | Staging | Manual |
| A5.3 | F-036 | Licence by clickwrap, then by signed upload | Both record the version; the upload is stored privately (F-135) and only readable by staff and the author | Staging | Manual |
| A5.4 | F-037, F-108 | Submit a workbook JSON with one validator error | Error shown inline; cannot submit until fixed | Staging | Auto: validator unit tests, plus manual |
| A5.5 | F-038 | Preview the submission | Renders in the real reader engine; answers in preview are not stored | Staging | Manual |
| A5.6 | F-039 | Comment and sign off | Comments visible to staff; sign-off recorded with time and version | Staging | Manual |
| A5.7 | F-040 | Choose a ladder point | Six points with figures; the chosen point lands on the workbook | Staging | Auto: author-release unit tests, plus manual |
| A5.8 | F-041, F-042 | Open earnings and the dashboard | Figures match the ledger; no reader can be identified from the dashboard | Staging | Manual |
| A5.9 | F-043 | Trigger a status change | One mail, correct template, no title in the subject | Staging | Manual |

### A6. Publisher and organisation consoles (F-055 to F-058, F-201 to F-228)

| # | Feature | Test | Pass looks like | Where | How |
|---|---|---|---|---|---|
| A6.1 | F-055, F-130 | Invite a member with each role | Permissions match the role table; a member cannot see money pages | Staging | Auto: RLS db tests, plus manual |
| A6.2 | F-056 | Add an imprint label and assign an author | Label shows on the roster and the public page | Staging | Manual |
| A6.3 | F-058 | Open publisher statements | Roll-up equals the sum of author statements | Staging | Manual |
| A6.4 | F-201, F-202 | Create a customer organisation with a licence of five seats | Seats counted; a sixth claim is refused | Staging | Manual |
| A6.5 | F-203, F-225 | Invite by mail, by join link and by CSV | Each claim creates a team_seat entitlement; a revoked link stops working | Staging | Manual |
| A6.6 | F-210 to F-213 | Create a group with a leader, set a schedule, run a check-in | Leader sees the group; members see the soft pace; check-ins stored | Staging | Manual |
| A6.7 | F-214 | Open the aggregate report | Counts only; no member named; small groups suppressed | Staging | Manual |
| A6.8 | F-216 | Report a concern from a group | Staff alert sent; concern listed in support ops | Staging | Manual |
| A6.9 | F-220, F-226 | Self-serve sign-up for a Group plan | Stripe subscription in the sandbox; the six billing mails fire once each over a seeded month; church band changes prorate (0031) | Staging | Manual |
| A6.10 | F-228 | Offboard an organisation | Export produced; seats end; licence closes; readers keep their own answers | Staging | Manual |

### A7. White-label (F-066 to F-074)

| # | Feature | Test | Pass looks like | Where | How |
|---|---|---|---|---|---|
| A7.1 | F-066 | Open the demo tenant host | Tenant branding and catalogue; cookies isolated from the main site | Staging | Manual |
| A7.2 | F-067 | Set a brand colour with poor contrast | Refused by the contrast check | Staging | Auto: tenant-brand unit tests |
| A7.3 | F-068 | Open Help now and the legal pages on a tenant | Locked standards unchanged by the tenant | Staging | Manual |
| A7.4 | F-069 | Tenant sets its own price on a listing | Price line shows; a demo title stays "Not for sale" | Staging | Auto: white-label unit tests |
| A7.5 | 0033 | Add a custom host, set the records, verify | Verify passes; three failed daily checks stop the host; one pass restores it | Staging | Manual, with a test domain |
| A7.6 | F-066 | Purchase on tenant A, open on tenant B | Content does not open on B (0004 rule) | Staging | Manual |

### A8. Admin and operations (F-080 to F-091, F-155, F-123)

| # | Feature | Test | Pass looks like | Where | How |
|---|---|---|---|---|---|
| A8.1 | F-080 | Each staff role opens `/admin` | Owner sees everything; reviewer sees the queue only; support sees the inbox and lookup | Staging | Manual |
| A8.2 | F-081 | Perform three admin actions | Three audit rows; none can be edited or deleted | Staging | Auto: db tests |
| A8.3 | F-084, F-085 | Move a title through review to release | Statuses in order; validator results shown; two-person override needs a second reviewer (C12) | Staging | Manual |
| A8.4 | F-155 | Faith title release | Blocked without a theological reviewer sign-off (C11) | Staging | Manual |
| A8.5 | F-086 | Edit workbook JSON in the staff editor | Live validation; save creates a new version; readers stay pinned to their version (F-110) | Staging | Manual |
| A8.6 | F-087 | Account lookup, four actions | Each action audited; no sealed answer is readable | Staging | Manual |
| A8.7 | F-083 | Pause a title, then the whole store | Paused title returns 404 publicly; store pause shows the holding page; both reversible | Staging | Manual |
| A8.8 | F-090 | Reply from the support inbox with a saved reply | Mail sent once; thread recorded | Staging | Manual |
| A8.9 | F-091 | Open the data subject request list | Export and deletion requests listed with due dates | Staging | Manual |
| A8.10 | F-123 | Submit a takedown notice | Row created; staff see it; a malformed notice is refused with a calm message (AKN codes) | Staging | Auto: takedown unit tests, plus manual |
| A8.11 | 0027 | Support MFA recovery | Steps in `docs/SUPPORT_MFA_RECOVERY.md` restore access; audited | Staging | Manual |

### A9. Platform and crons (F-128 to F-145)

| # | Feature | Test | Pass looks like | Where | How |
|---|---|---|---|---|---|
| A9.1 | F-131 | RLS suite | `supabase/tests` pass on a fresh database with 0001 to 0035 | Local | Auto: `db-test.sh` |
| A9.2 | 0035 | `app.uid()` with JSON claims | Returns the sub; null with no claims | Staging, Prod | Query, see DAY_LOG Day 8 |
| A9.3 | F-137 | Send each mail template to `TEST_RECIPIENT` | All render; `POSTAL_ADDRESS` guard refuses marketing mail while it is a placeholder | Staging | Manual |
| A9.4 | F-142 | Trigger an alert | Goes to `OPS_ALERT_TO`, or `LEADS_NOTIFY_TO` while unset; log lines carry no personal data | Staging | Manual |
| A9.5 | crons | Run each of the eight crons with `CRON_SECRET`, then once without | Each does its job once; without the secret 401; a second run inside the window is a no-op | Staging | Manual or script |
| A9.6 | F-136 | Flip a feature flag | Takes effect without a deploy | Staging | Manual |
| A9.7 | F-138, F-139 | Switch market and locale | Dates, currency and strings follow; no English hard-coded in a translated screen | Staging | Manual |
| A9.8 | F-141 | Opt out of funnel counting, then check out | No funnel event for that visit | Staging | Manual |
| A9.9 | F-125 | Load ten pages with the network panel | No request to any host other than the app and supabase.co, Stripe only on a page with the script | Prod | Auto: e2e third-party |
| A9.10 | F-128 | CI on a pull request | typecheck, lint, unit, content, db and e2e jobs green | GitHub | Auto |

## Part B. Combination tests: journeys

Each journey is run end to end in one sitting, by one tester, on staging unless marked. Record it as one result, and name the step that failed.

**B1. New reader to first purchase.** Sign in by magic link (A2.1), welcome page (A2.3), Library (A1.3), open a wellbeing title and give health consent (A2.5), read the free unit and answer (A3.4), hit the paywall (A3.2), buy with 4242 (A4.6), land back on the title with unit two open, receive the receipt (A4.11), see the title on Home (A3.6). Then sign out and in again: the entitlement and answers are still there. Also run on production with the sandbox once a sellable title with content exists.

**B2. Member across workbooks.** Join monthly (A4.12), open three in-membership titles and one outside it. The three open fully; the fourth shows the paywall with Buy only, and buying it works (A4.13). Cancel the membership. At `ends_at` the three close and the bought one stays open. Reminder mails fire on the 0011 schedule.

**B3. Author to sale to statement.** Author invite (A5.1), book and licence (A5.2, A5.3), submission with one validator error fixed (A5.4), preview (A5.5), staff review and release (A8.3) with the ladder point set (A5.7), public page live (A1.6), a reader buys it (A4.6), month end runs (A4.15), the author sees the sale in earnings and the statement (A5.8), the publisher roll-up matches (A6.3). A refund (A4.14) reverses the ledger and the next statement shows it.

**B4. Organisation with groups.** Create a customer organisation (A6.4), invite by CSV (A6.5), two readers claim seats, a group is formed with a leader and a schedule (A6.6), members read and check in, the leader sees the check-in, the aggregate report shows counts only (A6.7), a concern is reported (A6.8), the organisation is offboarded (A6.10) and the readers can still open their own answers but not the licensed title.

**B5. Self-serve organisation billing over a month.** Sign up for a Group plan (A6.9), add seats past the band, change band, miss a payment with the decline card, recover with 4242. Each of the six billing mails arrives once. Proration lines on the Stripe invoice match the band change.

**B6. White-label tenant from zero.** Create a tenant (F-074), set branding (A7.2), add a custom host and verify it (A7.5), set a tenant price (A7.4), a reader buys on the tenant and tries to open on the main site (A7.6), Help now and legal pages are the locked versions (A7.3).

**B7. Takedown.** A notice is submitted against a live title (A8.10), staff pause the title (A8.7), existing buyers keep access per the D9 wording, the public page is 404, the author receives the status mail (A5.9), the notice is resolved and the title returns.

**B8. Account deletion with history.** A reader with a purchase, a membership and group membership requests deletion (A3.14). The deletion cron (A9.5) runs: answers, enrolments and personal data go; the ledger keeps the anonymised sale; the organisation seat is freed; terms acceptances cascade (0018). The reader's address is on the suppression list for mail.

**B9. Staff security.** Staff sign in, go to `/verify`, enrol an authenticator, land on `/admin` (A2.7). Attempt a money change from an aal1 session (A2.8), refused. Lose the authenticator and recover through the support steps (A8.11). Every step is in the audit log (A8.2).

**B10. Faith title end to end.** A faith title goes through review with the theological reviewer sign-off (A8.4), a reader opens it and gives faith consent after health consent (A2.6), reads it, and the Theme page shows it once three faith titles are live (A1.9).

**B11. Month end in one run.** With seeded sales, memberships and organisation income, run every money cron in order: ledger, pool, statements, payouts with holds, billing mails. Statements, author dashboards, publisher roll-ups and organisation reports all agree with each other and with Stripe.

**B12. Offline and safety.** Mid-workbook, go offline. Help now opens from the service worker (A3.13). Come back online, the answer typed offline is saved on reconnect or clearly lost with a message, never half-saved.

## Part C. Cross-cutting checks

**C1. Security.** The RLS suite (A9.1) is the floor. On top of it, for every table a reader can touch, try to read another reader's row through the REST API with a real token: nothing comes back. Try the admin routes with a reader token: 401 or 404. Check `request.jwt.claims` handling (A9.2) after every Supabase platform upgrade. Confirm no secret or key ever appears in a log line (F-142).

**C2. Accessibility (F-144).** The axe run in e2e covers `/`, `/help-now` and `/publish`. The manual pass is still owed: keyboard only through B1, VoiceOver on iOS and TalkBack on Android through one unit, both colour themes, 320px width, 200% text. Record results per screen.

**C3. Email.** Every template to `TEST_RECIPIENT` (A9.3), checked in Gmail, Outlook and Apple Mail. Subjects carry no title and no health word. Reply-to is `EMAIL_REPLY_TO`. SPF, DKIM and DMARC pass once the sending domain exists (T1).

**C4. Privacy by design.** Third-party scan (A9.9) on every public page and three signed-in pages. Funnel opt-out honoured (A9.8). Dashboards never show fewer than the suppression threshold. Exports contain only the requester's data.

**C5. Content.** `pnpm migrate:v1 --check` and `pnpm validate --parked` pass; harness renders all titles (A3.1). Each new classic has a signed house record before release (C10).

**C6. Performance.** Library and a long workbook page load under three seconds on a mid-range phone over 4G. The paywall and checkout API respond under one second. Note the figures in the log rather than passing or failing until a budget is agreed.

**C7. Failure injection.** Kill the Supabase connection, Stripe, and Resend one at a time on staging. Each surface shows a calm message, nothing is half-written, and the operation can be retried. The checkout route returns its plain refusal (A4.9).

## Part D. Release regression

Before every production deploy, in this order. It takes about forty minutes with the automated layers already green in CI.

1. `pnpm check` and `db-test.sh` green on the branch.
2. Preview deployment: e2e remote project green.
3. Staging: B1 to the paywall, A4.3, A4.6, A2.7.
4. Production after deploy: A1.1, A1.2, A1.15, A9.9; sign in with a demo account and open one title; `/verify` to `/admin` with the staff account.
5. Watch the Vercel runtime logs for ten minutes for any error line.

## Part E. Run log

Add a row per run. One line per test or journey; group them by date.

| Date | Tester | Test | Where | Result | Notes or defect |
|---|---|---|---|---|---|
| 2026-10-09 | Claude | A2.3 welcome page | Prod | Fail then Pass | AKT01 from `app.uid()`; fixed by migration 0035, re-run passed |
| 2026-10-09 | Claude | A9.2 app.uid() | Staging, Prod | Pass | Returns sub with JSON claims, null anonymous |
| 2026-10-09 | Claude | A4.1 price ladder | Staging, Prod | Pass | Six points active, 194 production and 190 staging workbooks priced |
| 2026-10-09 | Claude | A4.3, A4.4, A4.9, A4.10 | Local | Pass | Unit suites, 947 tests |
| 2026-10-09 | Claude | A4.6 checkout | Prod sandbox | Blocked | Stripe Tax head office address not set (S1); terms and consent steps passed before the Stripe call |
| 2026-10-09 | Claude | A3.2 paywall on a classic | Prod | Blocked | Classics have no content version, `/read` is 404 |
