# Questions for Crent

Version 1, Monday 5 October 2026. Managing Director, Product Lead and Technical Architect.

The planning run raised about 130 questions across the feature list, architecture, demo catalogue and research papers. Many were the same question asked by different teams. This list merges them and keeps only the ones that change what gets built. Each has a recommended answer. Where a figure is needed, we say so and leave it for you. Points we could not confirm are marked [check].

Questions that do not change the build, such as which lawyer or accountant you use, have moved to the outside-code track in AK_3_Week_Plan.md section 7. They are listed at the end so nothing is lost.

## The ten that matter most

Answer these first. Each one changes the data model, the checkout or the launch scope.

| # | Question | Recommended answer | Needed by |
|---|---|---|---|
| A1 | Is Akana the seller of record that curates and publishes every workbook under licence? | Yes | Mon 5 Oct |
| B1 | Demo volume: about 50 workbooks, or 15 for each author as your first message said? | 50 at mixed depth, plus 15 listings per invented author with cover and outline only | Mon 5 Oct |
| E1 | Staging database: a second Supabase project or branching? | A second project, akana-staging | Mon 5 Oct |
| D1 | One charge model for all sales: separate charges and transfers, paid monthly? | Yes | Thu 8 Oct |
| D2 | One single-sale revenue share, or two rates? | One rate at launch, second rate column kept for later | Thu 8 Oct |
| D3 | Subscription pool: what share, split how? | User-centric split by capped completed steps; your share figure | Thu 8 Oct |
| C4 | Fixed price ladder, and its GBP points? | Fixed ladder by workbook length; you set the figures | Fri 9 Oct |
| C5 | Which countries do we sell to on launch day? | UK and US only | Wed 14 Oct |
| B4 | Can demo workbooks be bought, and are they on the live site? | Never buyable. Visible with a Demo badge until real titles arrive, then hidden with one switch | Wed 14 Oct |
| E5 | Who reviews and signs off workbooks besides you? | Name at least one second person | Fri 16 Oct |

## A. Business model and white-label

**A1. Seller of record.** Do you confirm that Akana curates and publishes every workbook under licence as seller of record, rather than authors self-publishing as traders on a marketplace?
Recommended: yes. It is the only route research found that takes payment with Stripe Tax on Akana's registrations, keeps sign-up invite-only, and keeps Akana outside the UK Online Safety Act user-to-user scope and the heavier DSA tiers (research_rights.md, research_money.md) [check legal]. It is also why the no-code builder waits until after launch.
Changes: invite-only onboarding, portal wording, VAT set-up, release gate.

**A2. White-label scope in the three weeks.** Do you accept white-label shipping as a working demo tenant on 23 October, with the first paying tenant about two weeks after launch?
Recommended: yes. The marketplace with real payouts comes first. Tenant checkout, custom domains, tenant billing, self-serve sign-up, ONIX and SSO follow for the first signed publisher. The white-label launch-must items do not all fit beside the reader app, portal and payments with sound isolation and tests.
Changes: T11 scope, the B2B pages say 'talk to us'.

**A3. Seller of record on white-label sites, when tenant checkout is built.** Akana, or the publisher?
Recommended: Akana for the first tenant, on the same payment path as the marketplace. It reuses tested code and needs no direct-charge build. The cost is that Akana owes the VAT on tenant sales. Publisher as merchant of record, with direct charges on their own Stripe account, comes later if a publisher insists.
Changes: whether F-075 (L) moves up, which would push something else out.

**A4. Reader identity across sites.** One Akana login shared across the marketplace and every tenant site, with separate membership and consent per tenant?
Recommended: yes. Separate login pools per tenant would be a much larger build. The per-tenant membership tables go in from the first migration even though the tenant sign-in flow ships after launch.
Changes: the tenancy migration on day 2.

**A5. Who gets paid for a publisher's titles.** The publisher organisation only, or each author under it?
Recommended: the publisher organisation only, which pays its own authors. Per-author payouts inside a publisher come after launch.
Changes: payee model in Connect onboarding and the ledger.

**A6. Locked standards on tenant sites.** Can a tenant switch off Help now, the safety lines or the wellness notice? Do tenant wellbeing titles go through Akana's safety review? Does 'Powered by Akana' show?
Recommended: tenants cannot switch off any safety element or inject scripts. Tenant wellbeing titles pass Akana's safety review, written into the contract. 'Powered by Akana' shows by plan.
Changes: F-068.

**A7. Domains.** Can we buy a domain and set up a sending address now, or does the AKANA trade mark check (gate G1) still block it? Which domain hosts tenant subdomains?
Recommended: buy a neutral tenant apex now, since it does not carry the Akana name. Buy the main Akana domain as soon as the attorney's knock-out view is clear enough. Until then, magic links use Supabase's test mailer on previews only. Without a domain, sign-in and receipts cannot go live.
Changes: email sending, public URLs, tenant routing, cookie scope.

**A8. A named first publisher.** Is there a publisher or prospect for week 3 who needs a custom domain, SAML SSO, ONIX feeds or invoiced billing to sign?
Recommended: tell us by Friday 9 October if so. If not, these stay after launch.
Changes: priorities in weeks 2 and 3.

## B. Catalogue, content and safety

**B1. Demo volume.** Your first message asked for 15 dummy workbooks for each of at least 17 authors. The decision record says about 50. Which?
Recommended: both, at different depths. The 50 in the demo catalogue plan are built at mixed depth (every one with listing, cover, outline and a full first week; 20 fully written). On top, each of the 18 invented authors gets up to 15 listings with cover and outline only, which is 18 x 15 = 270 listings in all. The demo team does this in weeks 2 and 3 without taking code streams.
Changes: seed volume, catalogue performance tests, cover generation.

**B2. Fully written workbooks.** Is 20 fully written the right number, in two waves?
Recommended: yes. Wave 1, one per shelf (seven), by Friday 9 October, so every shelf shows a complete workbook. Wave 2, the other 13, by Wednesday 21 October.

**B3. Shelves and Themes.** Do you approve the two new shelves, Personal Growth and Learning and Skills, and the twelve new Themes for demo use before register searches?
Recommended: yes for demo use. Themes stay in-app and renameable until searches clear (gate T1).

**B4. Demo workbooks on the live site.** Can they be bought with real money, and are they on the public site at launch?
Recommended: never buyable. Checkout refuses a demo id, and demo rows never reach the ledger, payouts, tax or funnel views. They show on the live site with a Demo badge on every surface while the catalogue is thin, then hide with one switch once real titles arrive. A separate showroom site is not needed.
Changes: F-004, F-114, checkout.

**B5. The five public-domain classics.** May they be sold as real products?
Recommended: yes, once the public-domain file for each is signed off. They are Tier A in the UK, US and EU, need no licence, and give Akana something genuinely sellable on day 1. They need no Connect payee.
Changes: the classics carry the Public domain classic badge, not Demo.

**B6. Maya Vaughn.** Are the 20 Maya Vaughn workbooks in the launch catalogue while their content issues are parked? Do the six higher-tier titles stay paused until a clinician signs off? Are any Maya Vaughn ebooks enrolled in KDP Select?
Recommended: load all 20 as in review. Release the standard-tier titles only when you clear their content issues. Keep the six higher-tier titles paused (gate C1). Tell us about KDP Select, because the licence warranty asks about it [check whether Select exclusivity reaches a separate workbook].
Changes: release states in the seed.

**B7. Which genres count as wellbeing for Help now and health data consent?**
Recommended: wellbeing only gets Help now on every screen and the health data consent. Relationships and parenting workbooks get the lighter signposts the Clinical Safety Lead asked for ('when home is not safe' and family support lines by market). Every other page gets a quiet 'Need support?' footer link. Named helplines stay for the six launch markets, with the helpline finder elsewhere.
Changes: F-021, F-026, new support_lines entries [check each line].

**B8. Daily check.** One daily check across workbooks, or only where a workbook defines one?
Recommended: only where the workbook defines one, so a finance reader never gets a mood question.

**B9. Reviews and ratings.** Do they stay off at launch?
Recommended: yes. Earlier decisions treat ratings as an effectiveness claim, reviews bring health disclosures, and they would add a moderation queue and user-to-user duties. Revisit for non-wellbeing titles with a lawyer's view.

**B10. Messaging.** No reader-to-author messaging at all?
Recommended: none. Author welcome letters and end-of-week notes ship as reviewed workbook content.

**B11. Adults only.** Is Akana 18 and over across every genre, including education and parenting?
Recommended: yes, with a confirmation at sign-up.

**B12. Languages.** English only at launch, with en-GB as the default and en-US for US readers? Will you accept workbooks in other languages from foreign publishers in the first three weeks?
Recommended: yes to en-GB default and en-US for US readers. Each workbook keeps its own spelling setting, so Maya Vaughn's US English copy stays as it is. No other languages in the three weeks; interface strings are ready for them.

**B13. Who builds the first real authors' workbooks?** Akana editors, authors, or both? How many real authors do you expect by launch?
Recommended: Akana editors, in JSON with the live validator. Wellbeing titles only through Akana with safety review. The author builder comes after launch. A rough number of expected authors helps size the review queue. If you charge a development fee, take it by Stripe payment link or invoice at launch rather than through a built feature; the figure is yours.

## C. Reader offer and checkout

**C1. Membership coverage.** Does membership cover every workbook, or only titles whose authors opt in? Are there premium programmes outside it?
Recommended: titles join membership by licence choice, with inclusion offered by default. No separate premium tier at launch.

**C2. Free first week.** On by default for every workbook, or the author's choice? A cap per reader? A free trial on membership?
Recommended: on by default, and the author may switch it off. No per-reader cap at launch; rate limits deter scraping. No membership trial, because the free first week already does that job.

**C3. Lifetime library and topic sets.** Do you agree to drop the complete library for life tier and the topic set of four, which were designed for 20 titles by one author?
Recommended: yes. Membership is the all-access option. Bundles come later.

**C4. Price ladder.** Do authors choose from a fixed ladder you set, or set any price? What are the GBP points, and the monthly and annual membership prices?
Recommended: a fixed ladder tied to length, as in the demo catalogue: short (4 weeks), standard (6), extended (8) and programme (12), each with fixed local prices. The figures are yours. The market benchmark in research_market.md is done, so the board's hold on setting prices can lift.

**C5. Launch countries.** Which countries do we sell to on launch day?
Recommended: UK and US, with fixed GBP and USD prices. The EU only once non-Union OSS registration and an EU legal representative are in place, because a UK seller owes EU VAT from the first sale (research_money.md) [check]. Australia, Canada and New Zealand follow with their registrations.
Changes: checkout country rules, currencies, Help now markets, tax set-up.

**C6. Refunds on single workbooks.** The current pro rata rule covers passes only. What applies to a single purchase?
Recommended: the immediate-access consent at checkout, which ends the statutory cancellation right for digital content once access starts [check legal], plus a short goodwill window handled in the console. The window length is yours.

**C7. Receipts.** Is an email receipt showing only the plan or AK code acceptable, with the full titled VAT receipt in the account? Does the never-name-a-title rule apply to every genre?
Recommended: yes to both. One rule for every genre is simpler to enforce and test.

**C8. Trying before signing up.** Can readers try the first exercise without an account?
Recommended: not at launch. The public page shows a readable sample. The interactive signed-out sample comes later.

**C9. Apps and Apple sign-in.** Is a native app store app out of scope, with web and an installable PWA only? Do you have, or want to pay for, an Apple developer account for Sign in with Apple?
Recommended: web and PWA only. Magic link and Google at launch. Apple sign-in only if you already hold the account.

**C10. Corporate buyers.** Is a manual Stripe invoice plus a bulk access grant acceptable before team seats exist?
Recommended: yes, through the admin grant.

## D. Money to authors and publishers

**D1. One charge model.** Should every sale use separate charges and transfers, with all author money held on the platform and paid monthly from statements?
Recommended: yes. It gives one ledger, one payout day and simpler refunds, fits the payout holds, and works with self-serve cross-border payouts (research_money.md). The feature list had destination charges for single sales; this replaces that. Stripe may limit how long funds can be held before transfer [check].

**D2. Single-sale revenue share.** One rate, or two (higher for the author when they bring the reader through their own link)?
Recommended: one rate at launch. The licence table keeps a second rate column and checkout records the source, so two rates can switch on later. The figure is yours and must be set before any outreach.

**D3. Subscription pool.** What share of membership income goes to authors, and on what basis?
Recommended: a user-centric split weighted by capped completed steps, as research_money.md leans, rather than weeks opened. Completed steps are captured from day one. The pool job runs after launch, but the rule and your share figure must be in the licence before outreach.

**D4. Royalty base.** Net of VAT only, or also net of Stripe fees, Connect fees and refunds? Who carries the fees?
Recommended: price less VAT, Stripe and Connect fees, and refunds, with the rate stored on every ledger line.

**D5. Payout settings.** Payout day, minimum payout, first-payout hold for a new author, the amount above which you approve by hand, and payout currency?
Recommended: monthly, after the refund window, paid in GBP. The figures are yours; they are config, not code.

**D6. Refunds after a statement or pool has closed.** Claw back from the author's next statement, or absorb?
Recommended: claw back from the next statement, written into the licence.

**D7. Earnings on the author dashboard.** Exact, or thresholded like counts?
Recommended: exact money on statements, because payees need it for tax and audit. Counts on the dashboard show 'Fewer than 10' below ten. The licence explains that a small author can work out unit numbers from their own statement.

**D8. Overseas authors and withholding.** Which author countries matter most outside the US, UK, EEA, Canada and Switzerland? Do payouts to non-UK payees stay on manual hold until the accountant confirms withholding?
Recommended: launch with the self-serve countries. Authors elsewhere are told at sign-up and held as payout pending; Global Payouts or a Stripe sales conversation comes after launch. Yes to the manual hold.

**D9. What buyers keep.** When a licence ends, or a title is taken down after a valid copyright notice, what do existing buyers keep?
Recommended: when a licence ends, lifetime access to the version they bought and their answers. After a valid takedown, the content goes, the reader keeps their own answers and export, and we refund [check legal]. This must be in the reader terms before the first sale.
Changes: entitlements engine, takedown flow.

## E. Build and operations

**E1. Staging.** A second Supabase project, or branching?
Recommended: a second project, akana-staging, for preview deploys. Local Supabase in CI covers tests either way. Your organisation already runs workbooks-dev and akana-saas, so a third project may need a paid plan [check current Supabase limits].

**E2. Live money in week 3.** Will week 3 take real money, or finish in test mode with live onboarding of authors only?
Recommended: finish in test mode on Friday 23 October. Switch to live at the go or no-go meeting, only for real or public-domain titles, once Stripe live activation, the lawyer's terms and the accountant's view are in.

**E3. Sign-in at launch.** Magic link and Google for readers, with passkeys after launch?
Recommended: yes. Staff, finance and payee roles use TOTP as a second factor at launch.

**E4. Support partner.** Cut until after launch?
Recommended: yes.

**E5. Reviewers.** Who reviews and signs off submissions at launch? Is there a second editor and a safety reviewer?
Recommended: name at least one person besides you. If you are the only reviewer, the two-person override cannot work as designed and the queue caps how many real titles go live.

**E6. Clinician.** Without one booked, higher-tier wellbeing workbooks stay blocked by the release gate at launch. Is that acceptable?
Recommended: yes.

**E7. Support tool.** A shared mailbox you already use, or a basic helpdesk?
Recommended: a shared mailbox that signs a data processing agreement and carries no tracking, with saved replies. No helpdesk at launch.

**E8. Marketing content.** Is editing copy through the repo or a Claude session acceptable for the first months, instead of a CMS?
Recommended: yes.

**E9. Error tracking.** A service configured to scrub answers and personal data, or Vercel and Supabase logs only?
Recommended: logs only at launch, scrubbed of form values, with email alerts to you.

**E10. Penetration test.** Book an external test inside the three weeks, or launch without one?
Recommended: launch with the internal security review, the isolation suite and Supabase advisors. Book an external test before the first paying white-label tenant goes live.

**E11. Status page.** A public status page or a white-label uptime commitment?
Recommended: neither at launch.

## Moved to the outside-code track

These were asked but do not change what gets built. They are actions with owners in AK_3_Week_Plan.md section 7.

- Is there an Akana company, is it UK VAT registered, and under which name? (O1, O8)
- Does the company have a Stripe platform account that can be approved for Connect? (O7)
- Which lawyer writes the licence and terms, and can they start this week? Clickwrap or e-signature for publishers? The build supports both. (O10)
- Which accountant advises on VAT, OSS, withholding and self-billing? (O8, O9)
- Who is the DMCA designated agent, at which address? (O13)
- Support hours and reply times. (O6)
- Who owns exercises Akana or an author writes? This is a licence term for the lawyer. (O10)
- White-label plan names, prices and limits, and Akana's fee on tenant sales. Pages say 'talk to us' until set; tenant billing is after launch.
- Can tenant titles also list on the marketplace? After launch.
- Is the catalogue scan a free sales tool or a paid service? After launch, done by hand meanwhile.
- Will publishers send sample chapters for catalogue analysis? After launch.

## Added Wednesday 7 October 2026: categories, faith and Akana Business

These come from the research landed on 7 October: `docs/research/categories.md` and `taxonomy.json`, `faith-workbooks.md` and `faith-titles.json`, `akana-business.md`, and the five catalogue files summed up in `docs/research/catalogue/SUMMARY.md`. The build side is in `AK_3_Week_Plan.md` (Revision, 7 October 2026) and in F-148 to F-155 and F-201 to F-228 in `AK_Feature_List.json`. Prices in N2 are research proposals, not evidence.

| # | Question | Recommended answer | Needed by |
|---|---|---|---|
| N1 | Run the Akana Business manual-sales pilot (F-201 to F-206, about 10.5 points) as an extra stream, T13, from week 2? | Only if a stream can be added without taking from T1 to T12. Otherwise move it after launch and use C10 (manual invoice plus admin grant) for any early organisation | Fri 9 Oct |
| N2 | Akana Business prices? | Pilot free for one group cycle (up to 12 weeks) for the first three organisations. Set paid figures before the first invoice. The research proposals are listed below | Fri 16 Oct |
| N3 | Add an optional `faith` genre? | Yes. It is additive under the freeze. The 0002 test that expects 11 genres changes in the same pull request | Fri 9 Oct |
| N4 | World English Bible as the default Bible text? | Yes. WEBBE for en-GB, WEB for en-US, WEBBE with the Deuterocanon for Catholic and Orthodox titles | Fri 9 Oct |
| N5 | Who is the Theological Reviewer? | Name one person before any faith title leaves review. Aim for a small panel: Protestant (evangelical), Catholic, and Orthodox or Anglican | Fri 16 Oct |
| N6 | Which faith titles go first? | Four short titles for church groups: The Greatest Thing in the World, Absolute Surrender, Power Through Prayer, How to Pray | Wed 14 Oct |
| N7 | Are the faith classics sold, or free? | Sold, on the same rule as the five classics (B5), once each house record is signed. Tier A only at launch | Wed 14 Oct |
| N8 | Four Maya Vaughn titles are standard tier but sit in Settled Mind and Brighter Days, which the taxonomy marks higher. Which wins? | The workbook's own tier. Keep the four at standard and treat the Theme tier as the floor for new titles only. Ask the clinician when booked (O15) | Fri 16 Oct |
| N9 | Cross-listing and duplicates: one Theme per workbook, or a second listing? | One primary Theme each at launch. One author record per person (Thoreau, Cicero). Cross-listing later, if wanted | Fri 16 Oct |
| N10 | Dale Carnegie, The Art of Public Speaking (1915, with J. Berg Esenwein)? | Not at launch. Ask the Legal Lead for a house record later. It would be Tier B | Fri 16 Oct |
| N11 | Tier B classics: In His Steps, How We Think, The Elements of Style? | Seed as draft and keep off sale at launch, as F-118 already says for anything below Tier A | Wed 14 Oct |
| N12 | Approve the seven new areas? | Yes, as internal labels | Fri 16 Oct |
| N13 | The demo catalogue plan names six fixed shelves. Only five are in the repo. Which is the sixth? | Tell us if there is one. If not, go with the 10-shelf proposal | Fri 9 Oct |
| N14 | No free text shared between users in groups, at least at launch? | Agreed. Fixed-choice check-ins only. Ask the lawyer about the check-in partner's level 3 note at the same time | Fri 16 Oct |
| N15 | Other traditions now, or later? | Later. The Dhammapada and The Song Celestial wait for a Buddhist and a Hindu reviewer | Wed 14 Oct |
| N16 | New catalogue values and small calls (listed below)? | Accept the values marked below. The small calls are yours | Fri 16 Oct |

**N1. The Akana Business pilot.** `akana-business.md` says a full Akana Business build does not fit the three weeks. The pilot lets staff create an organisation, record a manual invoice and set seats and titles. The organisation's owner invites people by email. People claim a seat and read. The owner sees seats claimed and people started as suppressed counts. There are no groups, no organisation billing in Stripe and no branding. It fits only on its own stream. The plan's stream count is an assumption [check], and no figure exists for whether a thirteenth stream is free.
Changes: T13, week 2 and 3 load, `app.has_entitlement`.

**N2. Akana Business prices.** The research proposes the following, each anchored to a named comparable. None is evidence of what buyers will pay.
- Akana Teams, businesses and charities of 5 to 250 people: £5 per seat per month, billed yearly (£60 a seat), plus VAT, minimum 5 seats. Seats rise at any time and fall at renewal.
- Teams above 250: by quote.
- Church, by average adult attendance: up to 50, £20 a month; 51 to 150, £40; 151 to 400, £75; over 400, by quote. Yearly at ten months' price. Shown with VAT. Each band capped at its top figure in active readers.
- Group, 4 to 15 people: £3 per member per month including VAT, minimum 4, one title at a time.
- Charity discount on Teams: 20%. The research gathered no evidence on norms here.
- Pilot: free for one group cycle of up to 12 weeks, in return for feedback and a case study.
Also open: whether Teams opens the whole membership catalogue (recommended) or a list, whether organisations can buy higher-tier wellbeing titles (recommended no, while O15 is open), and whether the church plan is open to non-church charities (recommended no).
Changes: price points, the organisation page, F-220 later.

**N3. A `faith` genre.** None of the 11 genres fits Bible study and prayer. The taxonomy can map faith Themes onto existing genres, mostly personal development, so this is not forced. A genre lets faith titles carry their own rules: no healing or answered-prayer claims, a pastoral signpost beside Help now, and a scripture licence check. It also gives the consent screen and the release gate something to key on. The migration recreates the genres CHECK with 12 ids and never edits 0002. `supabase/tests/0002_catalogue.sql` asserts 11 genres and must change with it.
Changes: F-149, F-150, F-155.

**N4. Bible text.** The King James Version is under Crown rights in the UK, and Cambridge University Press grants permission for commercial use. The NIV, ESV, NLT, NRSV and CSB carry verse and percentage limits, and Biblica says commercial and AI uses need an explicit licence. The World English Bible is public domain with no limit. Its wording must never be edited, because a changed text cannot carry the name. KJV wording that appears inside a public-domain classic is a separate question for the lawyer [check legal].
Changes: F-151.

**N5. Theological Reviewer.** The role signs off each faith workbook before it is approved, checks that the author is represented fairly and that Akana's own material adds no doctrine the author did not hold, and approves the tradition label. It does not sign off safety copy. A title labelled for one tradition needs a reviewer from that tradition.
Changes: F-155, O20.

**N6. The first faith titles.** The research offers two routes: a handful of short titles for church groups, or one flagship such as The Pilgrim's Progress. We recommend the short titles. All four are 4 weeks, tier none and Tier A. The Pilgrim's Progress is 12 weeks and tier standard, because Giant Despair urges the pilgrims to kill themselves, so it carries Help now and needs more review. How to Pray relies on a HathiTrust edition and CCEL's terms are not checked [check].
Changes: the first batch of F-152 and the titles seeded by F-153.

**N7. Faith classics sold or free.** The five classics are sold once their record is signed (B5). The same rule keeps one model for every classic. A free route would need its own rule in checkout and the pool. Your call.

**N8. Tier mismatch.** The taxonomy marks Settled Mind and Brighter Days as higher, because their hidden topics name conditions. Quieting the Noise, Still Standing, Facing the Room and Finding Your Way Back are standard in the seed. Re-tiering them gives `SAFETY_CHANGED`, needs a fresh sign-off, and would pause them while higher tier stays blocked (gate C1).
Changes: Theme tier data, Maya Vaughn release states.

**N9. Cross-listing and duplicates.** Requests: Walden also in Curious Reading, Franklin's Autobiography also in Life Stories, Home Education also in Guiding Learners, The Sunday Morning Circle also in Serving Together. The catalogue gives each workbook one Theme, so a second listing needs a join table. Related calls: moving the live Meditations from Chosen Habits to Wisdom for Living, and where Finding Your People and Wired Differently go, since no Theme in Mind and Mood or Health and Body fits them. The nearest Themes are Companionable Days and Purposeful Time, which carry no Help now.
Changes: v2 merge, any join table.

**N10. Carnegie.** `work-money.md` notes that The Art of Public Speaking may now be public domain in both markets: Carnegie died in 1955, Esenwein in 1946, and it was published in 1915. It is not in any catalogue file. Both deaths fall after the Tier A cut-off.

**N11. Tier B classics.** Sheldon died in 1946 and Dewey in 1952. `work-money.md` calls The Elements of Style Tier A, but Strunk died in 1946, so under the Tier A test (every death before 1946) it is Tier B, like In His Steps.

**N12. New areas.** Everyday Health, Direction and Meaning, Long-Term Money, Scripture and Prayer, Faith in Daily Life, Church and Groups, and Writing and Making. The seven new Health and Body titles have no area until Everyday Health exists.

**N13. The sixth shelf.** `categories.md` notes that the demo catalogue plan refers to six fixed shelves, while the seed and registry hold five non-proposed shelves [check]. The 10-shelf proposal is at the top of the naming board's six to ten. The fallback folds Creativity and Making into Learning and Skills and moves Life Stories to Personal Growth, which gives nine.

**N14. Free text in groups.** A user-to-user service under the Online Safety Act is one where users can share content with other users. Shared free-text answers, threads or a group chat would very likely bring Akana into scope (Online Safety Act 2023 s.3, as summarised by Herbert Smith Freehills Kramer, February 2024) [check legal]. Fixed-choice check-ins avoid that. The check-in partner's level 3 note is reader-written text sent to one person with no account; the lawyer should look at it too.
Changes: F-213, F-030 level 3.

**N15. Other traditions.** The Dhammapada (Max Müller, 1881) and The Song Celestial (Edwin Arnold, 1885) are Tier A and sit in Quiet Contemplation. The listing must not present them as Christian titles, and each needs a reviewer from its tradition.

**N16. New catalogue values and small calls.**
- `safety_profile: standard` for non-wellbeing titles on standard-tier Themes (15 titles) and `wellbeing_higher` for One Window Open. Recommended: accept both, with the Clinical Safety Lead's confirmation.
- `not_medical_advice` on four titles (the three Early Days titles and Visits With My Mother), which the schema does not have. Recommended: add it as an additive value, or drop it and rely on the claims check. Your call.
- One spelling for the money note: `not_financial_advice` or `money_guidance_not_advice`. Both load today. Recommended: `not_financial_advice`, the value the schema stores.
- Five new signposts (money worries, eating, bereavement, new parents, carers). Recommended: seed each only once its lines are checked by market; otherwise null.
- Price tier for the 8-day Ignatius retreat.
- Bio lines for Tama Rāwiri-Hughes and Wanjiru Kamau-Otieno saying they also write for church groups, which needs a version 1 edit.
