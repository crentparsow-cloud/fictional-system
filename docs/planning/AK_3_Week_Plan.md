# Akana three-week build plan

Version 1, Monday 5 October 2026. Written by the Managing Director with the Product Lead and the Technical Architect.

Inputs: AK_Feature_List.md and .json (147 features, 100 committed), AK_Architecture.md, AK_Demo_Catalogue_Plan.md and .json, AK_Handover_2026-10-05.md, the four research notes in this folder, WB_Decisions.md and WB_Board_Decisions_2026-10-02.md. No figure in this plan is invented. Prices, shares and thresholds are left for Crent. Points we could not confirm are marked [check].

Window: Monday 5 October to Friday 23 October 2026. Fifteen working days.

## 1. The plan on one page

**What Crent will have on Friday 23 October.** A working Akana marketplace on Vercel and the akana-saas Supabase project, code in the private GitHub repo `crentparsow-cloud/akana`. A reader can browse a library across eleven genres, read a public workbook page, sign in, use the free first week in the ported player, buy a single workbook or a membership in GBP, and keep their sealed answers. An invited author or publisher can sign a licence, connect payouts, submit a book and sign off a workbook. Akana staff can review, release, pause, refund and take down. A royalty ledger and monthly statements run on net receipts. A demo white-label tenant runs on its own host with locked safety standards. The demo catalogue holds 50 workbooks from 18 invented authors and 5 public-domain classics, all labelled, plus the 20 Maya Vaughn workbooks held in review.

**Built and tested is not the same as live.** On 23 October the product will be complete in Stripe test mode. Taking real money needs things no agent can do: a company and Stripe live activation, Connect platform approval, a domain and sending address, lawyer-approved terms and licence, and an accountant's view on VAT. If those clear, the live switch-on is Monday 26 October, as the feature list proposed. If they do not, the product is ready and waits on them.

**The honest verdict.** The committed scope is 163 size points across 100 features. That needs about 11 build streams working in parallel every day, Crent reviewing every day, and his decisions landing by the dates in section 6. The stream count is a planning assumption, not a measured figure [check]. Week 3 carries 53.5 points, which leaves no room for the three protected test days the feature list asked for. This plan fixes that by starting the ledger and the review queue in week 2 and protecting two days, not three: feature freeze at the end of Wednesday 21 October, then Thursday 22 and Friday 23 for testing, fixes and the launch checklist. If a milestone slips, we cut in the feature list's order: author dashboard (F-042), the three new field types (F-113), the white-label demo set (F-066 to F-069, F-074), then My plan prefill (F-017).

**White-label.** It ships as a working demo tenant, not a tier that takes money. Tenant checkout, custom domains, tenant billing and per-tenant identity follow after launch for the first signed publisher. We say this plainly to publishers.

**Demo volume.** Crent's original request asked for 15 workbooks for each of at least 17 authors. The decision record says about 50. This plan builds the 50 at mixed depth in weeks 1 and 2, and adds a scale-up to 15 listings per invented author (18 x 15 = 270 listings with cover and outline only) in weeks 2 and 3 if Crent confirms. That work sits with the demo team and does not compete with code streams. See question B1.

## 2. Where the source papers disagree, and what this plan follows

| Point | Feature list says | Architecture says | This plan |
|---|---|---|---|
| Launch date | Live Monday 26 October | Build ends Friday 23 October | Build and tests finish Friday 23. Live switch-on Monday 26 if the outside gates clear. |
| Charging single sales | Destination charge to the payee's Connect account (F-096) | Separate charges and transfers for everything, paid monthly from statements | Separate charges and transfers, subject to question D1. It gives one money model, fits the payout holds and monthly statements, and works with self-serve cross-border payouts (research_money.md). Build effort is the same or less. |
| Passkeys | Carried over at launch (F-132) | Deferred until after launch | Magic link and Google for readers at launch. Staff use TOTP as their second factor. Reader passkeys move after launch unless the port proves cheap. Question E3. |
| DOCX import and structured editor | After launch (F-047, F-048) | Week 2 | After launch. Akana editors build in JSON with the live validator (F-086). |
| Fully written demo workbooks | About ten | (not stated) | 20, as the demo catalogue plan sets out, in two waves: 7 by Friday 9 October, 13 by Wednesday 21 October. Question B2. |
| Protected test days | Last three days | (not stated) | Last two days, with the ledger and review queue started in week 2. |

## 3. Agent teams

Each team is a parallel workflow with one owner surface, its own branch per feature, and pull requests into `main`. CI must be green before merge. The QA team reviews every merge that touches money, sealing or RLS.

| Team | Owns | Main features |
|---|---|---|
| T1 Platform and security | Repo, CI, database, RLS, auth, sealing, flags, logs | F-128, F-129, F-130, F-131, F-132, F-134, F-135, F-136, F-125, F-080, F-081, F-141, F-142, F-143 |
| T2 Content engine | Schema v3, validator, catalogue tables, versioning, migration | F-107, F-108, F-109, F-110, F-111, F-112, F-114, F-113 |
| T3 Player | The ported reader engine and everything a reader does inside a workbook | F-015, F-016, F-017, F-018, F-019, F-020, F-022, F-023, F-024, F-140 |
| T4 Store and marketing | App shell, library, workbook, author and Theme pages, search, marketing pages | F-001 to F-011, F-014, F-138, F-139 |
| T5 Commerce | Stripe platform, prices, entitlements, checkout, membership, receipts | F-092 to F-098 |
| T6 Payouts and ledger | Connect onboarding, ledger, statements, refunds, payout holds | F-099 to F-103, F-041 |
| T7 Studio and console | Author portal and publisher console | F-033 to F-040, F-042 to F-045, F-055, F-056, F-058 |
| T8 Admin and review | Organisations, kill switch, review queue, release gate, JSON editor, account lookup, support inbox, takedown | F-082 to F-087, F-090, F-123 |
| T9 Demo catalogue | Seed data, writing, covers, public-domain file, demo logins | F-115, F-116, F-117, F-118, seeds for F-045 and F-074 |
| T10 Safety, trust and legal drafting | Help now, health data consent, legal pages, terms acceptance, DPIA, email guards, drafts for the lawyer | F-021, F-025, F-026, F-121, F-122, F-126, F-127, F-137 |
| T11 White-label | Tenant routing, branding, locked standards, tenant catalogue, demo tenant | F-066, F-067, F-068, F-069, F-074 |
| T12 QA, accessibility and red team | End-to-end tests, isolation checks, axe, manual accessibility pass, launch checklist | F-144, F-145, review of F-131 |

T6 and T11 start in week 2. In week 1 about ten teams run at once.

## 4. Week 1, day by day: foundations and content

Week 1 commits 25 features and 51.5 points. Schema v3 freezes at the end of day 4.

### Monday 5 October

**Built today**
- T1: repo scaffold in `crentparsow-cloud/akana` (pnpm workspace, Next.js App Router, TypeScript, lint, type check, Vitest), GitHub Actions CI, Vercel project linked with preview deploys, Supabase CLI linked to akana-saas, first migration skeleton (F-128).
- T2: schema v3 first draft in Zod, from the current schema and architecture section 5 (F-107).
- T3: player port starts. Field renderers extracted from `app/src/index.html` into `packages/engine`. Parity harness skeleton that loads every workbook JSON.
- T9: seed loader that reads AK_Demo_Catalogue.json. Wave 1 writing starts: one full workbook per shelf (seven).
- T10: Help now data (markets.json, support_lines.json) prepared as seed. Outline of every legal document the lawyer will need.
- T5: Stripe platform set-up steps and the Connect platform profile text, written so Crent can paste it.

**Crent today**
- Give this session write access to the GitHub repo. The old session could not reach it.
- Install the Vercel GitHub app on the repo, or approve the link when asked.
- Add the Supabase URL, publishable key and service role key to Vercel environment variables himself. Agents never see the service role key.
- Decide the staging question (E1) so preview deploys have a database.
- Send three short briefs, which T10 drafts today, to a trade mark attorney (AKANA), a lawyer (terms and licence) and an accountant (VAT, withholding).
- Answer the day-1 questions: A1 seller of record, B1 demo volume, E1 staging.

**Demo at end of day:** a Vercel preview URL with a placeholder Akana page, a green CI run, and the schema v3 draft to read.

### Tuesday 6 October

**Built today**
- T1: tenancy and organisation model with RLS helpers (F-129), fixed org roles (F-130), feature flags (F-136), Content Security Policy with a CI test that fails on any new external script (F-125). Sign-in with magic link and Google starts (F-132).
- T2: TypeScript validator port starts (F-108). Themes, areas and card lines for the ten new genres loaded to the registry as pending clearance (F-112).
- T3: every current field type renders from v1 JSON on a test page.
- T4: app shell with Akana design tokens and the five-tab reader nav (F-014), en-GB and en-US message files (F-139), markets and locale data (F-138).
- T9: all 50 listings and outlines in seed JSON. Cover design rules per genre.
- T10: adults-only confirmation on a generic sign-up screen (F-127). Email system port starts (F-137).

**Crent today**
- Create a Google OAuth client in Google Cloud with the redirect URL T1 gives him, and paste the client secret into Supabase himself.
- Open a Resend account. No domain yet.
- Read the schema v3 draft summary (one page, about 20 minutes) and raise anything that worries him.
- Confirm whether a company and Stripe account exist (outside track O1 and O7).

**Demo at end of day:** sign in on the preview by magic link, using Supabase's test mailer, and land in the empty app shell with five tabs in UK English.

### Wednesday 7 October

**Built today**
- T1: sealed answer storage with the key ring and AAD bound to user, tenant and field (F-134). Cross-tenant isolation test suite in CI (F-131). Staff roles (F-080) and the append-only audit log (F-081).
- T2: catalogue tables in Postgres (F-109). Demo flag and one-switch hide (F-114). Validator port checked against the Python validator on the 20 Maya Vaughn files.
- T3: weeks, stages and autosave wired to the sealed answers route.
- T4: library list page reading from the database.
- T9: 50 listings and outlines loaded into the database. Wave 1 first drafts run through the validator.
- T10: email templates ported with the render test that fails on any catalogue title (F-137). First drafts of reader terms, privacy notice, cookie statement and refund policy, marked draft for the lawyer.

**Crent today**
- Generate the answer sealing keys with the one-line command T1 provides and add them to Vercel as sensitive production variables himself. Keys are never pasted into a chat.
- Confirm the lawyer can start this week. Their text is needed by Friday 16 October for the licence and terms to be built in.
- Approve the two new shelves and twelve new Themes for demo use (question B3).

**Demo at end of day:** open a Maya Vaughn workbook's first week in the new player on the preview, type an answer, reload, and see it saved. The isolation test report shows that organisation A cannot read organisation B.

### Thursday 8 October

**Built today**
- T2: schema v3 frozen at the end of the day (F-107). Content versioning with content hashes and stable ids (F-110). The 20 Maya Vaughn workbooks migrated to v3 and loaded as in review, not published (F-111).
- T1: staff second factor. Hardening from the isolation results.
- T3: parity harness runs over all 70 workbooks and reports every field it cannot draw.
- T4: Publish with Akana page and enquiry form live on the preview, writing to a leads table (F-001). No revenue figures on it.
- T9: all 50 demo workbooks with a full first week pass the v3 validator (F-115 first pass). Cover generator starts early (F-117).
- T5: Stripe test-mode set-up and the price ladder held as config, waiting on Crent's figures (prepares F-093).

**Crent today**
- Approve the schema freeze from a one-page summary of what changed.
- Approve the Publish with Akana page copy.
- Answer the money structure questions: D1 charge model, D2 one or two sale rates, D3 pool basis, D4 royalty base.

**Demo at end of day:** the Publish with Akana page with a working enquiry form. Until a domain exists, the lead email only reaches Crent's own address through Resend's test sender [check]. The library shows 70 cards with Demo badges on the 50 demo titles.

### Friday 9 October

**Built today**
- All teams close their week 1 features or carry them with a written reason.
- T9: wave 1 complete, seven fully written workbooks, one per shelf.
- T12: first end-to-end smoke run: sign in, open a workbook, answer, reload, Help now on a wellbeing title.
- T5: Stripe test-mode products created with generic names ('Akana workbook') so bank statements never name a title (F-092 in test mode).
- T11: tenant resolution design ready for week 2.

**Crent today**
- Week review, about an hour.
- Supply the GBP price ladder figures, the single-sale revenue share and the payout settings (questions C4 and D5). Without them, prices in checkout stay as test values.
- Tell us whether the company is registered, whether it is VAT registered, and whether the Stripe platform account and Connect profile have been submitted.
- Decide the domain route (A7).

**Demo at end of day:** a guided walk-through on the preview: sign in, browse the library, open a demo workbook, use week 1 in the new player, see answers saved and sealed, see Help now on a wellbeing title, and see the CI dashboard with the isolation suite passing.

**Week 1 exit test:** all 25 week 1 features merged. Schema frozen. 70 workbooks pass the validator. Isolation suite green. If the player harness still shows more than a handful of unrendered fields, T3 gets a second stream in week 2 and F-017 moves to the cut list.

## 5. Weeks 2 and 3, by milestone

Each milestone has a date, the teams, what Crent must do, and what he can see.

### Week 2, 12 to 16 October: a reader can buy and use a workbook

Week 2 commits 39 features and 58 points, plus early starts on F-100 and F-084 from week 3.

**M1. Player at parity. Tuesday 13 October.**
- Built: F-015 player at parity with the old app (T3, two streams). Help now and safety hub by market (F-021, T10). Safety tier gating and the hardest answer card (F-022). Today and Home across several workbooks with a genre-aware daily check (F-016).
- Crent: test the player on his own phone for 30 minutes and list anything that feels different from the current app.
- Demo: every one of the 70 workbooks opens and renders in the new player. The old Cloudflare app stays live until Crent accepts parity.

**M2. The store is browsable. Wednesday 14 October.**
- Built: marketing home (F-002), library with genre shelves and Themes (F-003), badges and demo labels on every surface (F-004), public workbook pages on slug URLs (F-005), generated covers (F-117), public-domain file for the five classics (F-118), price ladder in Stripe (F-093) and local currency display (F-094). Teams T4, T9, T5.
- Crent: approve the home page line and trust points. Decide the launch countries and currencies (C5).
- Demo: a public library and workbook pages with covers, outlines, a readable first exercise and local prices.

**M3. A reader can pay, in test mode. Thursday 15 October.**
- Built: entitlements engine (F-095), single workbook checkout and webhook (F-096), membership with the customer portal (F-097), receipts that never name a title in email (F-098), free first week and calm paywall (F-019), completed-step capture (F-020), first-party funnel events (F-141), operational alerts (F-142). T6 starts the royalty ledger tables (F-100) so week 3 is lighter. Teams T5, T3, T1, T6.
- Crent: buy a workbook and a membership with a Stripe test card, cancel the membership, and say whether the flow is calm enough. Decide the single-purchase refund policy (C6).
- Demo: free week, paywall, test purchase, access unlocks, membership subscribe and cancel, receipt email without a title.

**M4. Authors and publishers are in the door. Friday 16 October.**
- Built: invite-only onboarding (F-033), author profile (F-034), book records (F-035), licence capture by clickwrap or signed upload (F-036), submission routes (F-037), organisation console and roster (F-055, F-056), staff create and approve organisations (F-082), Connect Express onboarding in test mode (F-099), private storage (F-135), payee sign-in hardening (F-143), kill switch (F-083), support inbox (F-090), legal and trust pages (F-121), versioned terms acceptance (F-122), account and data rights (F-025), health data consent (F-026), DPIA draft (F-126), tenant resolution by hostname (F-066). T8 starts the review queue statuses (F-084). Teams T7, T8, T6, T10, T11, T1.
- Crent: receive the lawyer's first text, or accept that the licence and terms stay marked draft and no real author signs until they arrive. Name the reviewers (E5). Week review.
- Demo: Crent invites a test author, who signs in, adds a book, accepts the draft licence, completes Stripe test onboarding and submits. Crent pauses a workbook with the kill switch and watches it leave sale.

**Demo team in week 2 (T9).** Wave 2 writing continues (13 full workbooks). If Crent confirms B1, the scale-up to 15 listings per invented author starts: title checks, listing, card line, cover and outline only, generated in batches through the validator.

### Week 3, 19 to 23 October: authors, money and launch

Week 3 commits 36 features and 53.5 points, less what started in week 2. Feature freeze at the end of Wednesday 21 October.

**M5. Review, release and author sign-off. Monday 19 October.**
- Built: review queue with validator results (F-084), release gate with sign-off records and the two-person override (F-085), staff JSON editor with live validation (F-086), preview in the real engine (F-038), author review and sign-off against a content hash (F-039), pricing from the ladder (F-040), author status emails (F-043), author help pages (F-044). Teams T8, T7.
- Crent: take one demo workbook from submitted to live himself, acting as editor and safety reviewer.
- Demo: the full release path, with the gate refusing a workbook that lacks a licence record or a safety sign-off.

**M6. Money out. Tuesday 20 October.**
- Built: royalty ledger on net receipts with daily reconciliation (F-100), monthly statements as PDF and CSV (F-101), refunds from the console with transfer reversal (F-102), payout holds and fraud controls (F-103), earnings view (F-041), privacy-safe dashboard (F-042), publisher roll-up (F-058), account lookup console (F-087), notice and takedown (F-123). Teams T6, T7, T8.
- Crent: check a sample statement line by line against the test sale, and confirm the wording of the method. Confirm withholding stays a manual hold (D8).
- Demo: test sale, ledger line, statement, refund that reverses the author's share, takedown that removes a title and leaves buyers with what question D9 decides.

**M7. White-label demo and demo logins. Tuesday 20 October.**
- Built: tenant branding with a contrast check (F-067), locked standards on tenant sites (F-068), tenant catalogue and own prices (F-069), seeded demo publisher and demo tenant (F-074), resettable demo author and publisher logins (F-045). Teams T11, T9.
- Crent: choose the demo tenant's look from two options.
- Demo: a branded demo publisher site on its own host, selling nothing, with Help now and the wellness notice locked in place.

**M8. Feature complete. Wednesday 21 October, end of day.**
- Built: author and publisher pages (F-006), Theme pages (F-007), on-device search with Help now first (F-008), publisher, white-label and pricing pages saying 'talk to us' until plans are set (F-009), help centre (F-010), sitemap and hreflang (F-011), My plan prefill and finish (F-017), progress without streaks (F-018), export of the reader's own work (F-023), calendar reminder (F-024), offline Help now page and allowlist service worker (F-140), three new field types (F-113). Teams T4, T3, T2.
- Crent: confirm the cut list if anything is late. Anything not merged by the end of the day moves after launch.
- Demo: the whole site, end to end, on the preview.

**M9. Tested and launch-ready. Thursday 22 and Friday 23 October.**
- Built: no new features. T12 runs the WCAG 2.2 AA manual pass with keyboard, VoiceOver and TalkBack (F-144), end-to-end tests for buy, membership, refund and deletion, a test-mode load test on checkout and webhook, backups confirmed, rollback plan and the go-live checklist (F-145). All teams fix only.
- Crent, Friday 23 October at 15:00: go or no-go meeting. He decides the live switch-on date against the gate table in section 7, and whether demo titles are visible on the live site (B4).
- Demo: the launch checklist with every line marked done, waiting or blocked, and a full run-through of reader, author and admin journeys.

## 6. Crent's decision deadlines

| By | Decisions | Why |
|---|---|---|
| Mon 5 Oct | A1 seller of record, B1 demo volume, E1 staging | Shapes the data model, seed load and preview databases from day 1 |
| Thu 8 Oct | D1 charge model, D2 sale rates, D3 pool basis, D4 royalty base | Ledger tables and checkout are designed on day 4 |
| Fri 9 Oct | C1 to C4, D5, A7 | Prices and payout config go into Stripe in week 2 |
| Wed 14 Oct | C5 launch countries, A2 to A6 | Tax set-up, currencies, Help now markets, tenant scope |
| Fri 16 Oct | C6 refunds, D6 to D9, E5 reviewers | Refunds, payouts and release gate are built in week 3 |
| Fri 23 Oct | Live switch-on date, B4 demo visibility | Go or no-go |

The full list with recommended answers is in AK_Questions_for_Crent.md.

## 7. The parallel track outside the code

A sellable product needs these. Agents prepare drafts and checklists. The owner named must do the act.

| # | Item | Owner | Agent support | Needed by | Blocks |
|---|---|---|---|---|---|
| O1 | UK company that sells as Akana: confirm the existing entity or register a new one at Companies House | Crent | Checklist of what Stripe, HMRC and the terms need from the entity | Fri 9 Oct | Stripe live, VAT, terms, DMCA |
| O2 | Business bank account for Stripe payouts | Crent | None | Fri 16 Oct | Stripe live |
| O3 | Real business postal address (a virtual office is fine) | Crent | None | Fri 9 Oct | Marketing and progress email (mailer refuses a placeholder), DMCA, company details page |
| O4 | AKANA trade mark clearance in classes 9, 16, 41 and 44 (UK, US, EU). Perforce sells an API product under the name (handover) | Trade mark attorney, engaged by Crent | Knock-out searches on UKIPO, USPTO and EUIPO recorded for the attorney. Brand held in one config file so a rename is cheap | Opinion by Wed 14 Oct [check attorney timing] | Domain purchase under gate G1, printing, paid ads, app stores |
| O5 | Domains: Akana main apex and a separate apex for tenant subdomains | Crent buys, after O4 is clear enough | DNS records for Vercel and Resend (SPF, DKIM, DMARC) | Fri 9 Oct for the tenant apex; main apex as soon as O4 allows | Magic links and receipts from Akana's own address, public URLs, tenant hosts |
| O6 | Support address on the domain, routed to a shared inbox that signs a data processing agreement | Crent | Saved replies and the not-a-crisis-service auto-reply (F-090) | Fri 16 Oct | Help pages, receipts, Stripe profile |
| O7 | Stripe platform account under the company, Stripe Tax on, Connect platform profile submitted, live activation | Crent | Platform description text: interactive workbooks for published books, wellness not treatment | Submit Mon 5 to Fri 9 Oct; approval timing unknown [check] | Live sales and payouts |
| O8 | VAT approach: UK registration, whether to sell to the EU (non-Union OSS from the first sale), US sales tax monitoring through Stripe Tax | Accountant, engaged by Crent | Summary of research_money.md section on tax for the accountant | View by Fri 16 Oct | Live sales outside the UK; receipts wording |
| O9 | Royalty withholding on payments to non-UK authors | Accountant | Manual hold built (F-103, F-099) | Before the first overseas payout | Overseas payouts |
| O10 | Reader terms, privacy notice, cookie statement, refund policy, author licence, publisher terms, white-label SaaS terms, DPA and sub-processor list | Lawyer, engaged by Crent | First drafts from research_rights.md heads of terms, each marked draft [check legal] | Text by Fri 16 Oct, sign-off by Thu 22 Oct | Any real author signing, any live sale (gate L3) |
| O11 | DPIA and records of processing for health data, marketplace and white-label | Crent signs, lawyer reviews | Draft (F-126) | Thu 22 Oct | Live sales of wellbeing titles |
| O12 | ICO data protection fee registration for the company [check whether already paid] | Crent | None | Before launch | Lawful processing |
| O13 | DMCA designated agent with the US Copyright Office ($6, renewed every three years, research_rights.md citing the Copyright Office) | Crent | Form details prepared | Before third-party titles go on sale | Safe harbour claim, which may not apply to a curated store [check legal] |
| O14 | EU legal representative under the DSA | Crent, only if selling to the EU | None | Before EU sales | EU launch. Avoided by not selling to the EU at launch (question C5) |
| O15 | Clinician sign-off for higher-tier wellbeing titles and the crisis word list (gate C1) | Clinician, booked by Crent | Review pack ready | Not needed for launch if higher tier stays paused | Higher-tier titles |
| O16 | Sellable content: at least the five classics with a signed-off public-domain file, Maya Vaughn standard-tier titles once their parked content issues are cleared, or a first licensed third-party title | Crent | Public-domain file (F-118) | Thu 22 Oct | Anything to sell on day 1. Demo titles cannot be sold |
| O17 | Paid plans: Vercel Pro (commercial use) and Supabase paid plan if staging or branching needs it [check current terms] | Crent | None | Mon 5 Oct for Vercel, per E1 for Supabase | Production hosting |
| O18 | Apple developer account, only if Sign in with Apple is wanted at launch | Crent | None | Wed 14 Oct | Apple sign-in |
| O19 | Author outreach: the Publish with Akana page is live on Thursday 8 October, but real approaches wait for the licence text and revenue share | Crent | Pitch pack, enquiry handling | After O10 and D2 | First real authors |

## 8. What cannot be finished by agents alone

Agents can build, test and draft everything in the code track. They cannot do the following, and the product cannot take real money until each is done.

- Form or confirm the company, open its bank account, or give it a postal address.
- Open, verify or activate the Stripe platform account, or obtain Connect approval. Stripe sets that timing.
- Buy domains or verify DNS without Crent's registrar access and payment.
- Clear the AKANA trade mark. Only an attorney can give that opinion.
- Write legally reliable terms, the licence, the DPA or the immediate-access consent wording. Agents draft. A lawyer approves.
- Decide VAT registrations, OSS, withholding and self-billing. An accountant must advise.
- Sign off higher-tier wellbeing content. Only a clinician can.
- Add production secrets. Crent adds every live key himself.
- Set prices, revenue shares, the pool split, payout thresholds and the refund policy. These are Crent's commercial calls.
- Sign real authors or publishers, or supply real licensed content.
- Review and sign off workbooks as a second named person, if the two-person override is to work as designed.

## 9. Main risks

| Risk | Effect | What we do |
|---|---|---|
| Player port (XL) runs long | Everything a reader does slips | Starts day 1 with a harness; second stream added on day 6 if the harness is not near green |
| Crent's decisions land late | Ledger, prices or release gate built on guesses | Rates and thresholds are config columns, so figures can arrive late; structure decisions cannot |
| Stripe Connect approval is slow or asks questions about wellbeing | No live payouts on 26 October | Submit in week 1 with plain wording; launch can sell Akana-owned and public-domain titles without Connect |
| No lawyer text by 16 October | No real author can sign | Licence capture is built with versioning, so the approved text drops in without code change |
| AKANA fails clearance | Rename | Brand in one config file; domain bought only after the knock-out |
| Crent is the only reviewer | Release gate override cannot work; queue caps real titles | Question E5 |
| Week 3 overload | Feature freeze missed | Cut order from section 1, decided at the Wednesday 21 October check |

## Sources

Internal papers listed at the top. External facts (Stripe cross-border payout regions, EU OSS from the first sale, the DMCA designation fee) are carried from research_money.md and research_rights.md, which cite Stripe documentation, HMRC and EU guidance, and the US Copyright Office. No new web research was run for this plan.
