# Akana log

The one log. From 9 October 2026 every working session, test run and decision is recorded here, newest at the bottom of each section. `docs/DAY_LOG.md` holds the three-week build history (5 to 9 October) and is closed. The test plan lives in `docs/testing/AK_Test_Plan.md` and the open items in `docs/planning/AK_Post_Build_List.md`; this file records what happened to them, so neither needs its own log any more.

## Where things stand (updated 9 October 2026)

- **Code.** `crentparsow-cloud/fictional-system`, main at 8f9ff0a. Live at akana-one.vercel.app. CI green. 947 web unit tests.
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
