# Akana post-build list

Started Wednesday 7 October 2026. One checklist of everything left to sort after the build. It gathers the open items from `docs/DAY_LOG.md`, `AK_Questions_for_Crent.md`, sections 7 and 8 of `AK_3_Week_Plan.md`, and Crent's decisions of 7 October 2026. The source papers keep the detail. This list is for ticking off.

Items are grouped by who does the work. **Only Crent** marks an item that needs Crent himself: his money, his accounts, his secrets, his signature or his decision. Agents can draft or prepare around those items but cannot finish them.

Status values: **Open** (not started or not known to be done), **Deferred** (Crent moved it here on 7 October), **Placeholder** (works now with a stand-in value), **Interim** (a working value is set, the real one is still to come), **Confirm** (last seen open in the log, may since be done), **Closed** (no action needed).

No figure here is new. Prices and dates are quoted from the source named.

## Decisions recorded on 7 October 2026

- Bible study is out of scope for now. Faith titles stay Bible-based. The Reading Scripture Theme is retired (migration 0025). Bible quotation handling stays as quotation support only (F-151).
- The faith consent wording and the privacy notice line about religious belief need no lawyer review now. Closed.
- The author licence goes to lawyer review after the build. Deferred.
- `OPS_ALERT_TO` stays a placeholder for now. Deferred.
- Daily ratings and self-check answers are kept, sealed and readable only by the reader, as in the old app. Decided and already built.

## 1. Crent

| # | Item | Source | Status | Only Crent |
|---|---|---|---|---|
| C1 | Real membership prices. Interim prices are £7.99 a month and £69.99 a year, VAT included, no free trial. Then the live Stripe price ids | DAY_LOG Day 6 second batch | Interim | Yes |
| C2 | Real workbook prices: the fixed ladder by length (short, standard, extended, programme) and its GBP and USD points. Checkout shows "Price to be confirmed" until then | Questions C4; DAY_LOG Day 3 | Open | Yes |
| C3 | D1 to D4: charge model, single-sale revenue share, subscription pool share and basis, royalty base | Questions D1 to D4; plan section 6 | Open | Yes |
| C4 | D5 payout settings: payout day, minimum payout, first-payout hold, hand-approval threshold, payout currency | Questions D5 | Open | Yes |
| C5 | Domain (A7): buy the main Akana apex once the trade mark view allows, and a neutral tenant apex. Then DNS for Vercel and Resend | Questions A7; plan O5; DAY_LOG Day 4 (f) | Open | Yes |
| C6 | `OPS_ALERT_TO`: the real staff alerts address. Alerts go to `LEADS_NOTIFY_TO` while it is unset | DAY_LOG Day 6 evening; decision (d) | Placeholder, deferred | Yes |
| C7 | `LEADS_NOTIFY_TO`: the address that receives enquiries | DAY_LOG Day 4 | Confirm | Yes |
| C8 | Staff owner role and TOTP: sign in once, add the owner role (SQL in the Day 4 log), turn on TOTP under Supabase Authentication, Multi-Factor, enrol an authenticator, open `/admin` | DAY_LOG Day 4 item 4 | Confirm | Yes |
| C9 | Board codes for the 20 Maya Vaughn titles. AK- codes are provisional until the naming board sends them | DAY_LOG Day 1 and Day 4; `SCHEMA_V3_FREEZE.md` | Open | Yes |
| C10 | Public-domain record signer: who signs each house record in `docs/public-domain/`. Every new classic waits for this | DAY_LOG Day 5 (e), Day 6; F-118, F-152 | Open | Yes |
| C11 | Theological reviewer, ideally a panel: Protestant (evangelical), Catholic, and Orthodox or Anglican. No faith title leaves review without one | Questions N5; plan O20 | Open | Yes |
| C12 | Second reviewer besides Crent, so the two-person release override works | Questions E5; plan section 8 | Open | Yes |
| C13 | Schema v3 freeze sign-off and its open questions (finance advice wording, safety sign-off reset rule) | DAY_LOG Day 4 and Day 6 | Confirm | Yes |
| C14 | Order of the three new shelves (Health and Body, Faith and Spirituality, Creativity and Making) | DAY_LOG Day 6 evening | Open | Yes |
| C15 | The company that sells as Akana: confirm or register it | Plan O1 | Open | Yes |
| C16 | Business bank account for Stripe payouts | Plan O2 | Open | Yes |
| C17 | Real business postal address. `POSTAL_ADDRESS` is a placeholder and the mailer refuses marketing and progress mail until it is real | Plan O3; DAY_LOG Day 2 | Placeholder | Yes |
| C18 | Engage the trade mark attorney for AKANA clearance (classes 9, 16, 41, 44; UK, US, EU) | Plan O4 | Open | Yes |
| C19 | Support address on the domain, routed to a shared inbox that signs a data processing agreement | Plan O6; Questions E7 | Open | Yes |
| C20 | ICO data protection fee [check whether already paid] | Plan O12 | Confirm | Yes |
| C21 | DMCA designated agent with the US Copyright Office, before third-party titles go on sale | Plan O13 | Open | Yes |
| C22 | EU legal representative under the DSA, only if selling to the EU | Plan O14 | Open | Yes |
| C23 | Book a clinician for higher-tier titles and the crisis word list (gate C1). Higher tier stays paused until then | Plan O15; Questions E6 | Open | Yes |
| C24 | Sellable content for day 1, and clearance of the 102 parked Maya Vaughn content findings | Plan O16; DAY_LOG Day 2 | Open | Yes |
| C25 | Paid plans: Vercel Pro for commercial use; Supabase paid plan if needed [check current terms] | Plan O17 | Confirm | Yes |
| C26 | Google OAuth client for Google sign-in | DAY_LOG Day 2 and Day 3 | Open | Yes |
| C27 | Apple developer account, only if Sign in with Apple is wanted | Plan O18; Questions C9 | Open | Yes |
| C28 | Sign the DPIA and records of processing after the lawyer's review | Plan O11 | Open | Yes |
| C29 | Engage the lawyer and the accountant, and send them the drafts in `docs/legal/` | DAY_LOG Day 3; plan O8, O10 | Confirm | Yes |
| C30 | Author outreach once the licence and revenue share exist | Plan O19 | Open | Yes |

## 2. Lawyer

| # | Item | Source | Status | Only Crent |
|---|---|---|---|---|
| L1 | Reader terms (`docs/legal/reader-terms.md`), including what buyers keep after a licence ends or a takedown (D9) | Plan O10; Questions D9 | Open | No |
| L2 | Privacy notice (`privacy-notice.md`), including a section for organisations | Plan O10, O21 | Open | No |
| L3 | Refund policy (`refund-policy.md`), with the immediate-access consent and the 14-day refund consent wording at checkout | Plan O10; DAY_LOG Day 6 evening | Open | No |
| L4 | Cookie statement (`cookie-statement.md`) | Plan O10 | Open | No |
| L5 | Author licence (`author-licence.md`). Real organisations cannot sign the draft until then | Decision (c); DAY_LOG Day 6 evening | Deferred | No |
| L6 | Publisher terms | Plan O10 | Open | No |
| L7 | Organisation terms and DPA, with the sub-processor list | Plan O10, O21 | Open | No |
| L8 | White-label SaaS terms | Plan O10 | Open | No |
| L9 | DPIA and records of processing (health data, marketplace, white-label) | Plan O11 | Open | No |
| L10 | Licence grant for group use and facilitator guides | Plan O21 | Open | No |
| L11 | Online Safety Act view on group features and the check-in partner's level 3 note | Plan O21; Questions N14 | Open | No |
| L12 | KJV wording quoted inside public-domain classics: does it need Cambridge University Press permission in the UK | Plan O21; Questions N4 | Open | No |
| L13 | DMCA safe harbour for a curated store | Plan O13 | Open | No |
| L14 | Titles close to existing books from the title checks (12 close, kept on Crent's approval of Demo Catalogue v2, 8 October; the clash was renamed), for example The Year Before the Wedding | DAY_LOG Day 6 evening; `catalogue/faith.md` | Open | No |
| L15 | Faith consent wording | Decision (b) | Closed | No |
| L16 | Privacy notice line about religious belief | Decision (b) | Closed | No |

## 3. Accountant

| # | Item | Source | Status | Only Crent |
|---|---|---|---|---|
| A1 | VAT treatment of single workbooks and of memberships, and the Stripe tax code. Products currently use SaaS for personal use | DAY_LOG Day 6 second batch; plan O8 | Open | No |
| A2 | Seller of record: confirm Akana as seller (A1) and the VAT registration it needs | Questions A1; plan O8 | Open | No |
| A3 | Managed Payments split option: Stripe Managed Payments for Akana's own titles and memberships only, Connect for author sales | DAY_LOG Day 6 | Open | No |
| A4 | Treaty declaration wording on `/payouts` and royalty withholding for non-UK payees. Payouts to them stay on manual hold until then | Plan O9; Questions D8 | Open | No |
| A5 | Whether a code-only email receipt is a valid VAT invoice (F-098), and tax record retention | DAY_LOG Day 3 follow-up 2 | Open | No |
| A6 | EU sales and non-Union OSS; US sales tax monitoring through Stripe Tax | Plan O8; Questions C5 | Open | No |
| A7 | Self-billing for author statements | Plan section 8 | Open | No |

## 4. Stripe

| # | Item | Source | Status | Only Crent |
|---|---|---|---|---|
| S1 | Stripe Tax set-up: turn it on with the business address and tax registrations, check the product tax codes, then run test checkouts for a workbook and both membership prices from a UK and a US address and check the tax lines | DAY_LOG Day 3 and follow-up 2 | Open | Yes |
| S2 | Live activation of the platform account under the company | Plan O7 | Open | Yes |
| S3 | Connect platform profile submitted and approved. Stripe sets the timing | Plan O7; plan section 8 | Open | Yes |
| S4 | Second webhook endpoint for connected accounts (`account.updated`, `account.external_account.*`), then `STRIPE_CONNECT_WEBHOOK_SECRET` in Vercel | DAY_LOG Day 6 evening | Open | Yes |
| S5 | At switch-on: live keys, live webhook secrets and live membership price ids in Vercel | DAY_LOG Day 3; plan section 8 | Open | Yes |
| S6 | Confirm the test keys are in Vercel (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) | DAY_LOG Day 3 follow-up | Confirm | Yes |
| S7 | Customer portal settings carried to live | DAY_LOG Day 6 | Open | Yes |
| S8 | API version: the dashboard offered 2026-08-26.dahlia, the code pins 2026-09-30.endive. Recheck at live | DAY_LOG Day 3 follow-up | Open | No |
| S9 | Stripe Radar rules (F-143). Custom rules need Radar for Fraud Teams, a paid add-on: decide whether to buy it first. Then add, in test mode first and live at switch-on: block when `:cvc_check: = 'fail'`; block when `:address_zip_check: = 'fail'`; request 3D Secure when `:risk_level: = 'elevated'`; keep the default block on `:risk_level: = 'highest'`; block a card after repeated declines in an hour and an email address after many cards in a day, using the velocity attributes the rule editor offers (check their exact names there); review any charge above a set amount once real prices exist (C1). Akana's own limit of 10 Checkout Sessions an hour per reader (0027) sits in front of these | 0027 build, F-143 | Open | Yes, dashboard |

## 5. Technical

| # | Item | Source | Status | Only Crent |
|---|---|---|---|---|
| T1 | `RESEND_API_KEY`, `EMAIL_FROM` and `EMAIL_REPLY_TO` in Vercel, with the sending domain verified (SPF, DKIM, DMARC) and the sign-in templates pasted into Supabase Auth. Nothing is sent until then | DAY_LOG Day 2 and Day 3 | Open | Yes, account and secret |
| T2 | `LEAD_HASH_SALT` in Vercel as a Secret, Production only. The enquiry form stays closed until then | DAY_LOG Day 4 | Confirm | Yes, secret |
| T3 | `CRON_SECRET` in Vercel as a Secret, Production only. Deletions and reminders do not run until then | DAY_LOG Day 5 | Confirm | Yes, secret |
| T4 | `ANSWERS_KEYS` generated on Crent's machine and in Vercel | DAY_LOG Day 3 | Confirm | Yes, secret |
| T5 | DMCC six-month reminder rule: when the final regulations are published (expected January 2027), check the rule in migration 0011 and `apps/web/lib/membership-reminders.ts`, and the 15-day yearly renewal notice | DAY_LOG Day 6 second and third batches | Open | No |
| T6 | Scotland and Northern Ireland signposts. Money worries and new-parent signposts name England and Wales services only. No Northern Ireland crisis or domestic abuse line is listed. Check each line on the provider's own site before adding it | `apps/web/lib/support-lines.ts` | Open | No |
| T7 | Demo login accounts: a staging test reader for the signed-in smoke tests and demo sign-ins for showing the product. Crent approves the addresses | DAY_LOG Day 5 | Open | No |
| T8 | Reading Scripture follow-ups: apply 0025 to staging and production; the seed builder does not carry `themes.status`; app pages do not yet filter retired Themes (the hidden flag and the 0025 guard keep it hidden meanwhile); `content/registry/shelves.json` still gives the faith shelf the line "Guided workbooks for Bible study, prayer and growing in faith."; `apps/web/lib/theme-visibility.test.ts` uses `reading-scripture` as a fixture | This change | Open | No, apply needs his go-ahead |
| T9 | Checkout consents (immediate access for single workbooks, 14-day refund consent for membership) live before the first live payment | DAY_LOG Day 6 evening | Confirm | No |
| T10 | Retry a failed Stripe redaction on a later run | DAY_LOG Day 6 second batch | Confirm | No |
| T11 | Tenant host lookup behind `TENANT_DB_LOOKUP=1`, switched on once the tenant apex (C5) exists | DAY_LOG Day 5 and Day 6 | Open | No |
| T12 | Crisis phrase list in `apps/web/lib/search-safety.ts` is interim until clinician sign-off (C23) | DAY_LOG Day 6 | Interim | No |
| T13 | External penetration test before the first paying white-label tenant | Questions E10 | Open | No |
| T14 | Production secrets: Crent adds every live key himself | Plan section 8 | Open | Yes |

## Counts

| Group | Items | Only Crent | Closed |
|---|---|---|---|
| Crent | 30 | 30 | 0 |
| Lawyer | 16 | 0 | 2 |
| Accountant | 7 | 0 | 0 |
| Stripe | 9 | 8 | 0 |
| Technical | 14 | 5 | 0 |
| **Total** | **76** | **43** | **2** |
