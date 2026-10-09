# Akana log

The one log. From 9 October 2026 every working session, test run and decision is recorded here, newest at the bottom of each section. `docs/DAY_LOG.md` holds the three-week build history (5 to 9 October) and is closed. The test plan lives in `docs/testing/AK_Test_Plan.md` and the open items in `docs/planning/AK_Post_Build_List.md`; this file records what happened to them, so neither needs its own log any more.

## Where things stand (updated 9 October 2026)

- **Code.** `crentparsow-cloud/fictional-system`, main at 6d2aad9 and later. Live at akana-one.vercel.app. CI green. 947 web unit tests.
- **Database.** Production `akana-saas` (suiuyolccgyjglfwgwnw, Pro plan) and staging `akana-staging` (qddsfkontkjdblidqxym). Migrations 0001 to 0035 on both.
- **Catalogue.** Production: 102 live titles (97 demo, 5 classics), 18 faith demo and 50 classics in draft, 20 Maya Vaughn in review. Every title has a price point.
- **Prices.** Permanent until Crent changes them: £7.99, £8.99, £9.99, £11.99, £12.99, £14.99 (p1 to p6), VAT inclusive, GBP only. Membership interim £7.99 a month, £69.99 a year.
- **Secrets in Vercel.** All set except `OPS_ALERT_TO` (placeholder by decision).
- **First sale blockers.** Stripe Tax head office address (S1); a title that has both content and a price (T15); Stripe live activation and the company behind it (S2, C15, C16).
- **Next big piece of work.** The build list v2 (`docs/planning/AK_Build_List_v2.md`), from which Crent chooses the final list.

## Sessions

### 9 October 2026, afternoon

Asked: build one log; research what would make the app better, pulling from Blinkist, Headway, Finch, Shortform, Imprint, Fabulous, Readwise and the faith apps; produce a comprehensive build list covering structure, design, content, copywriting, UI and UX, growth models and services, for Crent to choose from.

Done: this file created as the master log. Research run across eight searches. `docs/planning/AK_Build_List_v2.md` written: 160-odd items in twelve sections, each with the comparator it comes from, how it fits Akana, effort, what only Crent can supply, and a suggested phase (before first sale, first 90 days, within 12 months).

Decisions recorded from Crent today:
- Prices on the six-point ladder are permanent until he changes them.
- The no-streak, no-countdown, no-pressure rule now applies to mental health titles only. Other shelves may use habit mechanics, provided nothing crosses into a dark pattern or breaks the law.
- The current design is to be replaced, not polished. Blinkist's category ordering is the model for the library.
- Web only. No native app route.
- Research covers all three audiences; growth models prioritised.

Earlier in the day (full detail in `docs/DAY_LOG.md`, Day 8): PR #4 merged; email variables set; `app.uid()` defect found and fixed with migration 0035; prices set on all workbooks; checkout route hardened; test plan written.

### 9 October 2026, late afternoon

Asked: confirm Gmail sign-up with easy verification and optional two-factor; run top-quality research across the audiences with seven or eight agents; research again.

Done: no parallel agents exist in this session, so the nine strands were run in sequence by one agent, two to three searches each. Report: `docs/research/AK_Market_Research_2026-10.md`. Twenty additions folded into the build list as section 13, with the Phase A order amended to start with analytics and sign-in. On sign-in: Google One Tap with account linking gives Gmail users one-tap sign-up with verification done by Google; magic link stays for others; two-factor for readers becomes optional in the You tab (items 13.1 to 13.3). Google OAuth client (C26) remains the one thing only Crent can create.

Research headlines: hard paywalls convert about five times freemium with the same retention, and long trials convert far better than short ones (RevenueCat 2026); Google One Tap roughly doubles sign-up conversion in Google's case studies; Duolingo's Streak Freeze cut at-risk churn 21 percent, so pausable streaks are the ethical and effective version; the CMA has fined under the DMCC Act for drip pricing and fake urgency is blacklisted; Hallow sells a six-person family plan at about 1.7 times single; Gumroad takes 10 percent on creator-sourced sales and 30 percent on marketplace-sourced, a precedent for the author share; Headspace for Work prices at $12 to $36 per employee per year; on iOS, Web Push works only after Home Screen install and installed web apps start signed out.

## Test runs

| Date | Tester | Test | Where | Result | Notes |
|---|---|---|---|---|---|
| 2026-10-09 | Claude | A2.3 welcome page | Prod | Fail then Pass | AKT01 from `app.uid()`; fixed by 0035 |
| 2026-10-09 | Claude | A9.2 app.uid() | Staging, Prod | Pass | |
| 2026-10-09 | Claude | A4.1 price ladder | Staging, Prod | Pass | 194 and 190 workbooks priced |
| 2026-10-09 | Claude | A4.3, A4.4, A4.9, A4.10 | Local | Pass | 947 unit tests |
| 2026-10-09 | Claude | A4.6 checkout | Prod sandbox | Blocked | Stripe Tax address (S1) |
| 2026-10-09 | Claude | A3.2 paywall on a classic | Prod | Blocked | Classics have no content (T15) |

## Decisions

| Date | Decision | By |
|---|---|---|
| 2026-10-09 | Workbook prices permanent on the six-point ladder until changed | Crent |
| 2026-10-09 | No-streak and no-pressure rule limited to mental health titles | Crent |
| 2026-10-09 | Full redesign, Blinkist category model for the library | Crent |
| 2026-10-09 | Web only | Crent |
| 2026-10-09 | `app.uid()` redefined to read JSON claims (0035), applied to both databases | Claude, logged |

## Post-build list changes

| Date | Item | Change |
|---|---|---|
| 2026-10-09 | C2 | Set (permanent ladder) |
| 2026-10-09 | C7 | Done |
| 2026-10-09 | S1 | Marked blocking |
| 2026-10-09 | T15, T16, T17 | Added |
