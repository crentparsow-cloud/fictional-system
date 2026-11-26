DRAFT for review by a solicitor. Not legal advice. Unsigned. Prepared 25 November 2026.

# Data protection impact assessment: Akana reader workbooks

Status: unsigned draft. It has not been reviewed by a solicitor or approved by anyone. It describes the code on `main` at commit 737f71e and the review of 21 November 2026 (`akana-syracuse-review-2026-11-21.md`). Several fixes from that review are in progress on other branches. Where a fix lands, the "measures still open" table in step 6 must be updated before this is signed.

How this draft was built. The step headings follow the ICO page "How do we do a DPIA?", read on 25 November 2026 (sources at the end). The ICO's sample template file could not be opened as text from the build environment, so the table columns in steps 5 to 7 follow the ICO's guidance wording and should be checked against the template itself. Every fact about the service comes from the repository. Where a fact is needed and is not in the repository, it is marked "TO CONFIRM". Every rating in step 5 is a proposal for the people who sign this, and is marked as one.

Where this draft says "question for the solicitor", nothing has been decided.

## Step 1. Identify the need for a DPIA

**What the project is.** Akana turns published books into guided workbooks. A reader reads a section, does the exercises and types answers. Answers are stored so the reader can return to them on any device. Some workbooks are on wellbeing subjects, including mental health. Some are on the Faith and Spirituality shelf.

**Why a DPIA is needed.** The ICO's guide says "You must do a DPIA for processing that is likely to result in a high risk to individuals", and its screening list includes processing special category data on a large scale (source 2). The reasons that apply here, taken from the code and the review:

1. What a reader writes in a wellbeing workbook may reveal their mental or physical health. That is special category data. The consent migration says so in terms (`supabase/migrations/0006_consent.sql`).
2. Using or writing in a workbook on the Faith and Spirituality shelf may reveal religious belief. That is also special category data (`supabase/migrations/0015_taxonomy_faith_consent.sql`).
3. Some readers of mental health titles may be vulnerable at the time they write.
4. The service takes payments, and several client businesses can share the platform (white-label sites and customer organisations).
5. The review placed the app in its tier 4, which requires a signed DPIA before launch (review, section 2).

Whether the processing is "large scale" at launch is a question for the solicitor. Expected reader numbers: TO CONFIRM (no figure is in the repository).

**The published notice.** Until 25 November 2026 the privacy notice said an assessment "has been prepared". None existed (review finding H5). The sentence now says one is being completed before launch. This document is that assessment in draft.

## Step 2. Describe the processing

### 2.1 Nature of the processing

**Who the controller is.** The privacy notice names "Akana Holdings" as controller for the marketplace, and as processor for a publisher's white-label site, where the publisher is controller. The code marks the company as not yet registered (`apps/web/lib/company.ts`, review finding M25). Legal entity name, company number and ICO registration: TO CONFIRM. For customer organisations (Akana for organisations), the draft data processing agreement treats the organisation as controller of its roster data and Akana as processor (`docs/legal/organisation-dpa.md`). Whether Akana is controller or processor for the answers of a reader who joined through an organisation seat is a question for the solicitor.

**How data is collected.** Directly from the reader, through the web app. From an organisation admin, who uploads a roster of names and email addresses. From a reader or buyer about someone else, in three places: a check-in partner's name and email address, a gift recipient's email address and name, and the recipient address of a "send this workbook" gift.

**What is collected, and where it is kept.**

| Data | Where it comes from in code | Notes |
|---|---|---|
| Account: email address, name, region (a two-letter country code), language | Supabase Auth and `public.profiles` | Sign-in is by emailed link. Google sign-in exists in code and is off while `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is blank. Staff use a TOTP second factor. |
| Answers, check-ins, daily checks, plans | `PUT /api/answers` (`apps/web/app/api/answers/route.ts`), `public.answers` | Sealed with AES-256-GCM before storage (`packages/seal`). See step 6. |
| Highlights and notes | `public.reader_marks` (0058) | Note text and the marked paragraph are sealed with the same key ring. |
| Then and now entries (a feeling score and a step) | `lib/then-now-server.ts` | Sealed, opened only for the owner. |
| Progress: units opened, steps finished | `step_completions`, enrolments | Used for the reader's own progress, the membership pool split for authors, and aggregate counts. |
| Health consent and faith consent | Two timestamp and version pairs on the reader's profile (0006, 0015) | Current state only. No history is kept (review finding M20). |
| Adult confirmation and terms acceptance | `profiles.adult_confirmed_at`; `accept_terms` (0018) | A self-declared tick (`apps/web/app/(auth)/welcome/action.ts`). |
| Purchases, memberships, gifts, bundles | `purchases`, `subscriptions`, `gift_memberships`, `bundle_purchases`, `entitlements` | Card details stay with Stripe. Purchase rows outlive the account with the user link set to null (0007). |
| Check-in partner | `public.partners` (0012) | Reader's first name, partner's first name and email, an optional note of up to 200 characters written by the reader, and short replies of up to 280 characters from the partner. The partner has no account and acts through emailed links. |
| Gift membership | `public.gift_memberships` (0054) | Recipient email and name, sender name and a message of up to 300 characters. The address and claim link are cleared on claim, refund or expiry. |
| Daily counts (first-party analytics) | `public.funnel_counts`, `public.funnel_visitors` (0016, 0036), `apps/web/lib/funnel.ts` | Counts per event, workbook and unit. A visitor hash made from a salt, the UTC date and either the user id or the IP address with the user agent. The hash changes daily and rows holding it are deleted the next day. No cookie is set for it. Not counted when the visitor has opted out at `/counting`, or sends Global Privacy Control or Do Not Track. Counts are kept 13 months. |
| Support messages, contact and takedown forms, enquiries, title requests | 0005, 0016, 0022, 0027, 0056 | Free text typed by the sender. A salted hash of the IP address is kept with some forms for rate limits. |
| Newsletter | 0063 | Email address. Keyed by email, separate from the account. |
| Web push | `apps/web/lib/push`, 0065 | A push subscription (an endpoint address at the browser maker's push service, and keys) per device. The push has no body. The wording is fixed in the service worker. |
| Staff audit log | `audit_log` | Staff actions on user records. No retention rule is set (review finding M21). |
| Organisation roster | 0024, 0028, 0030 | Names and email addresses uploaded by the organisation. Deleted 30 days after the last licence ends (`.env.example`, organisation billing note). |
| Server and operational logs | Vercel, Supabase, `ops_events` (kept 90 days, 0016) | Retention of the Vercel and Supabase logs on the current plans: TO CONFIRM. |

**Who has access.** The reader, to their own rows, under row level security. Staff, to account records through gated staff pages, with actions written to the audit log. No staff screen or function unseals answers (`packages/seal/src/index.ts`, review section 4). Authors, publishers and organisation owners see counts only, with small counts suppressed.

**Who data is shared with (processors and other recipients actually present in code).**

| Recipient | What for | When it is active | What it receives |
|---|---|---|---|
| Supabase | Database, sign-in, file storage, realtime | Always | Everything stored, with answers, notes and then and now entries as ciphertext. The sealing keys are not held in Supabase. |
| Vercel | Hosting and running the server code, scheduled jobs | Always | Every request passes through it. Answers are sealed and unsealed in server code running on Vercel, and the sealing keys are held in Vercel environment variables. Functions are set to run in `lhr1` (`apps/web/vercel.json`). |
| Stripe | Checkout, tax calculation, subscriptions, Connect payouts to authors | Always for payments. Payout runs and organisation billing refuse anything but a Stripe test key today. | What a checkout sends: the buyer's payment and tax details, collected on Stripe's own page, with amounts and Akana's internal ids. The exact fields sent were not listed for this draft: TO CONFIRM. For gifts, the code says Stripe is told the length and nothing about the recipient or the message. |
| Resend | Sending email | When `RESEND_API_KEY` is set. Without it nothing is sent. | Recipient address and the email content. Emails never name a workbook title (a unit test enforces this). A gift email carries the sender's name and message. A check-in partner email can carry the reader's note. |
| Google (Google Identity Services) | Sign-in with Google | Only when `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is set | When on, Google's script loads on `/sign-in` when the page opens, and on a `/try/<slug>` page when the sign-in step appears, whether or not the visitor chooses Google (`apps/web/components/auth/GoogleOneTap.tsx`, `apps/web/csp.mjs`). Google therefore receives the visitor's IP address and browser details on those pages. If the visitor signs in, Google returns an ID token that the server exchanges for a session. Not named in the privacy notice (review finding M22). |
| Sentry | Error tracking | Only when `SENTRY_DSN` or `NEXT_PUBLIC_SENTRY_DSN` is set | Error events after scrubbing (`apps/web/lib/sentry-scrub.ts`): request bodies, cookies, IP addresses, query strings, email addresses and answer-like fields are removed. The user id and the page path are kept. Not named in the privacy notice (review finding M22). The Sentry region depends on the DSN: TO CONFIRM. |
| Browser push services (run by the browser maker, for example Google, Mozilla or Apple) | Daily "your step is ready" notification | Only when the three `VAPID_*` variables are set, the `web_push` flag is on and the reader has asked for push on a device | A request with no body to the reader's push endpoint. Never sent for a title above safety tier none. Not named in the privacy notice. |
| Cloudflare DNS-over-HTTPS | Checking a tenant's custom domain records | Daily job (`.env.example`, `TENANT_CNAME_TARGET` note) | Domain names of tenant sites only. No reader data seen in code. Listed for completeness. |

Whether each of these is a processor, a separate controller or neither, and whether a contract that meets Article 28 is in place with each, is a question for the solicitor. Contracts and paperwork outside the repository were not checked by the review (review, section 2). Processor agreements signed: TO CONFIRM for each.

**Retention, as built.**

| Data | Rule in code |
|---|---|
| Account and work | Kept while the account exists. |
| Account deletion | A 7-day undo, then a daily job deletes the reader's work, clears the profile and removes the sign-in record (0007, 0067). |
| Purchases, bundle purchases, organisation packs | Kept as tax records with the link to the person set to null. |
| Visitor hashes | Current and previous UTC day only. |
| Daily counts | 13 months. |
| Operational events | 90 days. |
| Gift recipient address and claim link | Cleared on claim, refund or expiry. |
| Leads, support messages, takedown notices, audit log, roster archive, unsubscribed newsletter rows | No rule (review finding M21). |
| Consent records | The notice promises six years. The code keeps current state only and deletion erases it (review finding M20). |

**Screening criteria flagged.** Special category data. Possibly vulnerable individuals. A risk that children use the service despite the adult gate (step 2.3).

### 2.2 Scope of the processing

**Nature of the data.** Personal data, and two special categories: health (answers in wellbeing workbooks) and religious belief (use of, and answers in, faith workbooks). No criminal offence data is asked for. A reader could type anything into a free text answer, including information about other people.

**Volume, frequency, duration.** Number of readers expected in the first year: TO CONFIRM. Answers are written each time a reader works through a step. Data is kept for the life of the account.

**Geography.** The code has six launch markets and an "everywhere else" market (`apps/web/lib/markets.ts`): United States, United Kingdom, Canada, Australia, Ireland and New Zealand. Ireland is priced in euro. Which markets are open at launch: TO CONFIRM.

### 2.3 Context of the processing

**Relationship with individuals.** Readers are customers. Some come through an employer, church or community group that bought seats. That is a relationship where a reader may feel less free to refuse. The code keeps organisation owners and group leaders to counts, with small counts suppressed, and group check-ins are three fixed choices with no free text (0028).

**Control and expectations.** The reader gives consent before the first wellbeing workbook and, separately, before the first faith workbook. Each consent can be withdrawn in the account. Withdrawal stops new saves in those workbooks and does not delete what is already written. Deletion is the reader's separate choice. Export and deletion are self-service. The reader is told that answers are encrypted and that staff cannot read them.

**Children.** The service is for adults. The gate is a tick box at sign-up (`confirmAdult` in `apps/web/app/(auth)/welcome/action.ts`), which sets `adult_confirmed_at`. Nothing else checks age. The terms say an under-18 account will be closed and refunded. See step 5, risk 9, and the options in step 6.3 (review finding M32).

**Vulnerable people.** Mental health titles carry a safety tier of standard or higher. Every wellbeing workbook has a Help now element, and `/help-now` lists crisis lines by market (`apps/web/lib/markets.ts`). The terms say Akana is not an emergency service and does not monitor what readers write. Because answers are sealed, nobody at Akana can read a reader's disclosure of risk. That is a deliberate privacy choice. Whether it is the right balance for mental health titles is a question for the people who sign this.

**Prior concerns and the state of the art.** The review of 21 November found no way for one reader to read another's data and found the sealing sound. It also found faults that bear on this processing. They are listed in step 6.2.

**Codes of conduct or certification.** None claimed. The Children's code is discussed in step 6.3.

### 2.4 Purposes of the processing

To let a reader do a workbook and keep their own work. To take payment and keep tax records. To pay authors a share, using step counts and never answer content. To send service email, and optional reminders the reader turns on. To keep the service secure. To count use in aggregate.

Intended benefit to readers: a private place to work through a book, with their work kept safe and exportable. Benefit to Akana and authors: revenue.

## Step 3. Consultation process

| Who | Consulted? | Notes |
|---|---|---|
| Readers or their representatives | TO CONFIRM | The ICO guidance says to seek individuals' views unless there is a good reason not to, and to record the reason if not (source 1). No consultation is recorded in the repository. Options: a short survey of early readers, or a recorded decision not to consult before launch, with the reason. |
| Processors (Supabase, Vercel, Stripe, Resend, and Sentry and Google if switched on) | TO CONFIRM | The ICO guidance says to ask processors for information and help. Their security and transfer documents should be collected and filed. |
| Information security | Partly | The Syracuse review of 21 November 2026 is an internal review. The outside, human-led penetration test that tier 4 requires has not been done. |
| Legal adviser | Not yet | This draft is for that review. |
| Data protection officer | None appointed | The privacy notice says "We do not currently have a data protection officer." Whether one is required is a question for the solicitor. |
| Authors, publishers, organisations | TO CONFIRM | |

## Step 4. Assess necessity and proportionality

**Lawful basis, as the published notice states it.** The notice gives: contract for account details, the reader's work, progress, purchases and service emails; legal obligation for tax records and consent records; legitimate interests for aggregate improvement, paying authors fairly, security logs and support; consent for optional emails. These are the notice's statements. Whether each is the right basis is a question for the solicitor. Two points to look at in particular. First, the notice gives both contract and consent for the reader's work in a wellbeing workbook. Second, the notice says optional emails are sent only if the reader turns them on, while the win-back email in code is opt-out (review finding M24).

**Special category condition, as the published notice states it.** "Your explicit consent (UK GDPR Article 9(2)(a))", for health data. The faith consent migration says Akana relies on explicit consent for religious belief as well, but the privacy notice does not mention religious belief at all. Whether explicit consent is the right condition, whether the consent screens as worded meet the standard for explicit consent, and whether a second condition or a Schedule 1 condition with an appropriate policy document is needed, are questions for the solicitor. The consent wording versions in code are `health-2026-10` and the faith version in `apps/web/lib/consent.ts`.

**Does the processing achieve the purpose, and is there a less intrusive way?** Storing answers is the service. The alternative of keeping answers on the device only would remove the main risk, at the cost of the reader losing their work when they change device. The code already keeps drafts on the device and keeps the free first unit on the device until the reader makes an account. Search runs on the device and what the reader types is not sent.

**Data minimisation.** Only a two-letter country code is stored for location. Counts carry no free text. Emails never name a workbook, so an inbox does not reveal a mental health title. A push has no body. Check-in partners see a stage number only, never a title. Win-back email is never sent to anyone with a wellbeing title in their enrolments.

**Function creep.** Answers cannot be read by staff, authors or analytics, by construction. Progress counts are used for author pay. No advertising profile is built.

**Data quality.** The reader types and edits their own data.

**Information given to individuals.** The privacy notice and cookie statement are drafts with known errors, listed in `docs/compliance/legal-corrections.md`. They must be corrected before this is signed.

**Rights.** Export and deletion are built into the account. The export leaves out profile, purchases, subscriptions, entitlements, consents, progress, settings and support messages (review finding M19). Deletion fails for people who also acted as an author, organisation admin or staff member (review finding M18).

**Processor compliance.** Contracts: TO CONFIRM (step 2.1).

**International transfers.** This is a question for the solicitor, not a finding. What the code and documents show: the notice says the database is in London (AWS eu-west-2); the Supabase project region is not recorded in the repository: TO CONFIRM. Vercel functions are pinned to `lhr1`. Stripe, Resend, Vercel, Sentry and Google are, as the notice says of "some of our providers", headquartered in the United States. The notice says transfers rely on the UK International Data Transfer Agreement, the UK Addendum or an adequacy decision. Which mechanism applies to which provider, whether a transfer risk assessment is needed for each, and whether the notice's wording is accurate: questions for the solicitor. Evidence of the mechanism in each provider's terms: TO CONFIRM.

## Step 5. Identify and assess risks

Every likelihood, severity and overall rating below is a PROPOSAL by the drafter, for the signatories to change. The scale is the three-point one the drafter recalls from the ICO's sample template (likelihood remote, possible or probable; severity minimal, significant or severe; overall low, medium or high). The template file could not be opened, so check the scale against it.

| # | Source of risk and potential impact on individuals | Likelihood (proposed) | Severity (proposed) | Overall (proposed) |
|---|---|---|---|---|
| 1 | Answers revealing mental health are disclosed through a database breach. Distress, discrimination, loss of confidentiality. | Remote, because answers are ciphertext in the database and keys are held elsewhere | Severe | Medium |
| 2 | The sealing keys and the database are both compromised (for example through the hosting account). All answers readable. | Remote | Severe | Medium to high |
| 3 | An author switches off the safety tier on their own live wellbeing title, which switches off the health consent gate (review finding H1). Health data stored without consent. | Possible while H1 is open | Significant | High while open |
| 4 | A staff token without the second factor calls staff functions directly (review finding M1). Account data, not answers, exposed. | Possible while open | Significant | Medium |
| 5 | A reader's account is taken over through their email inbox or an unexpired session. The attacker reads the reader's own answers. Sessions never expire today (M6) and a reader's second factor does not protect the answers routes (M3). | Possible | Severe for that reader | High while open |
| 6 | The fact that a person uses a mental health or faith title leaks without any answer leaking: through an email subject, a shared device, a gift, a check-in partner message, a group, an organisation report, or an error tracker receiving a page path with a workbook slug. | Possible | Significant | Medium |
| 7 | A reader in crisis writes about self-harm and nobody sees it, because answers are sealed and unmonitored. | Possible | Severe | High. To be accepted or reduced by the signatories; see Help now measures. |
| 8 | Consent cannot be evidenced later, because only current state is kept and withdrawal or deletion erases it (M20). | Probable while open | Minimal to the individual, significant for compliance | Medium |
| 9 | A child uses the service and writes about their mental health, because the age gate is a self-declared tick (M32). | Possible | Significant | Medium to high. See step 6.3. |
| 10 | A reader cannot fully exercise erasure or access (M18, M19). | Probable for the affected groups while open | Significant | Medium |
| 11 | Personal data kept longer than needed where no retention rule exists (M21). | Probable while open | Minimal | Low to medium |
| 12 | A recipient not named in the notice receives data (Google, Sentry, push services) if the variables are switched on before the notice is corrected (M22). | Possible | Minimal to significant | Medium |
| 13 | Data is transferred outside the UK without a valid mechanism. | TO CONFIRM after the solicitor's review | Significant | Not rated |
| 14 | A member of an organisation or church group is identified to their employer or leader as using a wellbeing title, or by their check-in choice. | Remote, because counts are suppressed and check-ins are private | Significant | Low to medium |
| 15 | A breach is not recognised or reported in time, because there was no plan or log (H6). | Possible until the plan in `docs/compliance/breach-plan.md` is adopted | Significant | Medium |
| 16 | Loss of availability or of the reader's work: no tested restore of the backup (review finding L8), or loss of a sealing key, which would make answers unreadable. | Remote | Significant | Medium |
| 17 | A non-user's details (check-in partner, gift recipient) are processed without that person being told. | Probable, by design of the features | Minimal | Low to medium. Question for the solicitor. |

## Step 6. Identify measures to reduce risk

### 6.1 Measures already built (from the code and the review)

| Measure | Evidence | Risks it reduces |
|---|---|---|
| Answers, check-ins, daily checks, notes and then and now entries sealed with AES-256-GCM, bound to user, tenant and field. Keys held in the hosting environment, never in the database. A key ring allows rotation. | `packages/seal/src/index.ts`; `apps/web/app/api/answers/route.ts` | 1, 2 |
| No staff route unseals. Decryption only in server code acting for the signed-in owner. | Review section 4; `packages/seal` header | 1, 4 |
| Row level security on every table. The review probed 154 tables and views as nine roles and found no reader able to read another's data. | Review sections 2 and 4 | 1, 4 |
| Explicit consent screens before the first wellbeing workbook and the first faith workbook, versioned. Saves refused without current consent. A tier that cannot be read is treated as wellbeing. | 0006, 0015, `apps/web/lib/consent.ts` | 3 |
| Withdrawal of each consent in the account. | 0006, 0015 | 3 |
| Self-service export and deletion with a 7-day undo. Writes refused while deletion is pending. | 0007, 0067, `lib/account-data*.ts` | 10 |
| Emails never name a workbook title. Gift emails name no title. A push has no body. Partners see a stage number only. Sharing progress on a wellbeing title with a partner is off unless the reader ticks it. | `packages/emails`, 0012, `lib/push` | 6 |
| No streaks, badges, pushes, pairs, social proof counts or win-back email on wellbeing titles. | 0049, 0055, 0066, `lib/push/run.ts` | 6, 7 |
| Help now in every wellbeing workbook and at `/help-now`, with lines per market. A "report a concern about a group" route that goes to Akana support, not the group leader. | `lib/markets.ts`, `app/(reader)/groups` | 7 |
| The validator blocks claim words in wellbeing workbooks, and staff review each title before release. | Architecture, principle 5 | 7 |
| First-party counting only. Daily-rotating visitor hash, deleted after a day. Opt-out and browser signals honoured. Small counts suppressed. | 0036, `lib/funnel.ts` | 6, 12 |
| No third-party script unless Google sign-in is switched on. Content security policy enforced and checked in the build. | `apps/web/csp.mjs`, `scripts/check-csp.mjs` | 12 |
| Error tracking, when on, scrubs bodies, cookies, IP addresses, query strings, emails and answer-like fields. Session replay is off unless a variable is set. | `lib/sentry-scrub.ts`, `.env.example` | 6, 12 |
| Staff second factor (TOTP), staff actions in an audit log. | 0032, review | 4 |
| Webhook signatures, idempotent processing, cron routes that fail closed. | Review section 4 | 1 |
| Adults-only confirmation and terms acceptance at sign-up. | `(auth)/welcome/action.ts` | 9 |
| Organisation owners and leaders see counts only, never who. Group check-ins have no free text. | 0028, 0061 | 14 |

### 6.2 Measures still open

Taken from the review's open findings and its tier 4 requirements. "Effect" and "residual" are proposals. "Approved" is left for the signatories.

| Risk | Measure | Review id | Effect on risk (proposed) | Residual risk (proposed) | Measure approved |
|---|---|---|---|---|---|
| 3 | Stop authors changing the safety tier on their own title. | H1 | Eliminated | Low | |
| 4 | Enforce the staff second factor and role table in the database. | M1 | Reduced | Low | |
| 5 | Set session timeouts. Check the second factor for enrolled readers on the answers, marks and export routes. | M6, M3 | Reduced | Medium | |
| 1, 5 | Tighten the sign-in redirect list. Add a CAPTCHA and fail closed on sign-in limits. Upgrade the framework to the patched release. | H4, M5, H3 | Reduced | Low to medium | |
| 8 | An append-only consent history. | M20 | Eliminated | Low | |
| 10 | Fix erasure for authors, organisation admins and staff. Complete the export. | M18, M19 | Eliminated | Low | |
| 11 | Retention periods and a nightly prune for the tables that have none. | M21 | Reduced | Low | |
| 12 | Name Google, Sentry and push services in the notice, or keep them off. Link `/counting` and list all cookies. | M22, M23 | Eliminated | Low | |
| 6 | Record bounces and complaints so mail stops going to addresses that reject it. | M17 | Reduced | Low | |
| 15 | Adopt the breach plan and log. Name who decides and who reports. | H6 | Reduced | Low | |
| 16 | Do a test restore. Keep an off-site copy of uploaded files. Record where a copy of the sealing keys is held. | L8 | Reduced | Low | |
| 13 | Solicitor to confirm the transfer mechanism for each provider. | none | TO CONFIRM | TO CONFIRM | |
| 9 | Decide the age assurance approach (step 6.3). | M32 | Depends on option | TO CONFIRM | |
| 7 | Decide whether sealed, unmonitored answers with Help now is an acceptable position for mental health titles, and record it. | none | Accepted or reduced | TO CONFIRM | |
| 17 | Decide what, if anything, non-users are told. | M31 | TO CONFIRM | TO CONFIRM | |
| All | Outside, human-led penetration test. | Tier 4 | Reduced | TO CONFIRM | |
| All | Retest by a second reviewer after the fixes, and a signed-out probe of the live app once the hosting plan permits testing. | Tier 4 | Reduced | TO CONFIRM | |
| All | Manual accessibility pass. | Tier 4 | Not a data risk; listed because tier 4 requires it | | |
| All | Expert sign-off of this DPIA. | Tier 4, H5 | | | |
| 2 | Consider a dedicated secret manager for the sealing keys. The architecture note asks whether hosting environment variables meet the bar for health data. | Architecture 7.3 | Reduced | TO CONFIRM | |

### 6.3 Children and the Children's code (review finding M32)

**What the code does.** One tick at sign-up confirming the reader is an adult, required together with the terms tick. The time is stored. There is no date of birth, no age estimation, no document check and no parental route. Payment needs a card, which is some friction, but the first unit of most workbooks is free with an account.

**What the ICO says, as read on 25 November 2026 (source 7).** The Children's code applies to "relevant information society services which are likely to be accessed by children" and is "not restricted to services specifically directed at children". A child is "a person under 18". On likelihood, "the possibility of this happening needs to be more probable than not". For an "adult only, restricted, or otherwise child-inappropriate service" the focus should be on "how you prevent access (in which case this code does not apply)". If you decide children are not likely to access the service, you should "document and support your reasons for your decision", and the page gives "testing of access restriction measures" as an example of evidence. The page as read does not mention self-declaration.

**The question.** Is a self-declared tick enough to support a decision that the service is not likely to be accessed by children, given that some titles are about mental health and the first unit is free? This is a question for the solicitor. It is not decided here.

**Options, for the owner and the solicitor.**

1. Keep the tick. Record in this DPIA why children are not likely to access the service, with evidence (who the titles are written for, where the service is promoted, any data on who signs up). Review after launch.
2. Keep the tick for the service as a whole, and add a stronger check before a mental health title opens, for example a date of birth question asked neutrally, or a card check.
3. Use an age assurance provider for sign-up. This adds a processor and new data, and needs its own assessment.
4. Decide that children are likely to access the service and apply the Children's code standards to it.

Decision: TO CONFIRM. Reason: TO CONFIRM. Decided by: TO CONFIRM.

## Step 7. Sign off and record outcomes

Left blank on purpose. Nothing below has been agreed.

| Item | Name, position and date | Notes |
|---|---|---|
| Measures approved by | | Integrate actions back into the project plan, with a date and a person for each. |
| Residual risks approved by | | If accepting any residual high risk, consult the ICO before going ahead (see below). |
| DPO advice provided | | No data protection officer is appointed. Record who gave data protection advice instead. |
| Summary of advice | | |
| Advice accepted or overruled by | | If overruled, explain why. |
| Comments | | |
| Consultation responses reviewed by | | If the decision departs from individuals' views, explain why. |
| Comments | | |
| This DPIA will be kept under review by | | Review when the processing changes: for example when Google sign-in, Sentry or push is switched on, when reader sign-in opens on tenant sites, or when a new market opens. |

**Consulting the ICO.** The ICO's guide says consultation is required if "your DPIA identifies a high risk and you cannot take measures to reduce that risk", that you cannot start the processing until you have consulted, and that "we will generally respond within eight weeks (although we can extend this by a further six weeks in complex cases)" (source 2, read 25 November 2026). Whether any risk here stays high after the open measures is for the signatories and the solicitor.

## TO CONFIRM list for this document

1. Legal entity name, company number and ICO registration.
2. Controller or processor role for readers who join through an organisation seat.
3. Expected reader numbers, and whether the processing is "large scale".
4. Which markets open at launch.
5. Supabase project region. Sentry region if Sentry is switched on.
6. Retention of Vercel and Supabase logs on the current plans.
7. A signed processor agreement and transfer mechanism for each provider.
8. Whether readers, processors, authors and organisations were consulted, or the reason they were not.
9. The age assurance decision, the reason and who made it.
10. The position on sealed, unmonitored answers for mental health titles.
11. Whether Google sign-in, Sentry and web push will be on at launch.
12. The exact fields sent to Stripe at checkout.
13. Every name and date in step 7.

## Sources

Read on 25 November 2026 through a web fetch tool that returns extracts of each page. Check each quotation against the live page before relying on it. The ICO pages carry a notice that the guidance is under review following the Data (Use and Access) Act 2025.

1. ICO, "How do we do a DPIA?": https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/data-protection-impact-assessments-dpias/how-do-we-do-a-dpia/
2. ICO, "Data protection impact assessments" (guide to accountability and governance): https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/guide-to-accountability-and-governance/data-protection-impact-assessments/
3. ICO sample DPIA template (linked from source 1; the file could not be read as text): https://ico.org.uk/media2/migrated/2553993/dpia-template.docx
7. ICO, Children's code, "Services covered by this code": https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/services-covered-by-this-code/

Source numbers match the full list at the end of `docs/compliance/legal-corrections.md`.
