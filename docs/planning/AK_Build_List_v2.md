# Akana build list v2

Written 9 October 2026, after the three-week build. This is the long list for Crent to choose from. Nothing here is decided. Each item says where the idea comes from, how it fits Akana, roughly how much work it is, what only Crent can supply, and a suggested phase.

**Phases.** A: before the first sale, worth front-loading. B: first 90 days after launch. C: within twelve months. **Effort.** S: a day or less. M: two to five days. L: a week or more. **Crent** names what only he can provide: money, an account, a decision, content, a signature.

**What the research found, in one paragraph.** The apps people keep opening share five things. A strong visual identity with illustrated covers and a clear category grid (Blinkist, Imprint, Headway). A daily surface that gives you one small thing to do today, not a library to browse (Headway, Fabulous, Readwise's daily review). Something that persists and grows between sessions, so leaving feels like a loss (Finch's bird, Headway's streaks, YouVersion's plans with friends). A reason to bring someone else in (Blinkist Connect's shared account lifted organic growth by about a quarter; Finch's "send strength" to friends; YouVersion's plans with friends). And a business channel that sells seats, where Blinkist for Business is reported to bring in about a fifth of annual revenue. Akana already has the bones of all five. What it lacks is the visual quality, the daily surface, the persistence and the sharing loops.

**What the research also found, and Akana should not copy.** Blinkist and Headway are summary apps; the product is finished when you have read it. Akana's product is the reader's own work, and that is a stronger retention asset than any summary. The list below leans on that. Where a competitor's trick measures opening the app rather than getting something from it (one reviewer called Headway's home screen a carnival of prompts), it is left out or adapted.

---

## 1. Visual identity and design system

| # | Idea | From | Fit with Akana | Effort | Crent | Phase |
|---|---|---|---|---|---|---|
| 1.1 | New visual identity: palette, type pairing, illustration style, motion rules. One mood board, three directions, Crent picks one | Headway (bright, inviting), Imprint (editorial, visual-first), Blinkist (clean, confident) | Current tokens were carried from the old app and read as bland. Everything else in this section hangs off this | L | Picks a direction | A |
| 1.2 | Illustrated or generated cover system per shelf: a recognisable visual language so a Business title and a Faith title look like siblings from one house | Blinkist covers, Imprint cards | Covers exist (F-117) but are patterns only. Readers judge a library by its covers | M | Approves the style | A |
| 1.3 | Shelf colour and icon set: each of the ten shelves gets a colour, an icon and a short line, used everywhere the shelf appears | Blinkist's 27 categories each have a colour and icon | Gives the library the ordered feel Crent liked | S | | A |
| 1.4 | Typography for reading: a serif for workbook body text, the sans for interface, with sizes that respect the reader's text size setting | Shortform, Readwise | Long-form reading on web needs a reading face, not an interface face | S | | A |
| 1.5 | Dark mode designed, not inverted: deliberate dark palette, cover treatment, dim-at-night tie-in | Headway, Finch | Dark mode exists; it needs design | S | | A |
| 1.6 | Motion rules: page transitions, card lift, save confirmation, finish sequence. Reduced motion honoured | Finch (animation is a core part of its delight), Headway | Small, repeated moments of quality. The finish sequence should feel like something | M | | A |
| 1.7 | Component library in Storybook or a styled page at `/dev/kit`, so every screen uses the same parts | Standard practice | Stops drift as agents build | M | | A |
| 1.8 | Marketing site redesign: home, Publish, Organisations, Pricing, with real screenshots and a demo title you can try without signing in | All comparators lead with product shots | The home page is the first sale | L | Approves copy | A |
| 1.9 | Open Graph images per title, generated from the cover system, so shared links look good | Blinkist, Shortform | Every share becomes a small advert | S | | A |
| 1.10 | White-label tokens derived from the new system, so a tenant brand sits inside Akana's rules rather than fighting them | | Tenant branding exists; it inherits whatever the base looks like | M | | B |

## 2. Library, discovery and categories

| # | Idea | From | Fit with Akana | Effort | Crent | Phase |
|---|---|---|---|---|---|---|
| 2.1 | Explore page in the Blinkist order: a grid of shelf tiles with colour and icon at the top, then rails ("New this week", "Short programmes", "Most started", "Because you read X"), then Themes as a second-level grid | Blinkist Explore | Replaces the flat filtered list. Themes already exist as the second level | M | | A |
| 2.2 | Shelf pages: each shelf has a landing page with its Themes, a featured title, an editor's line and the count | Blinkist category pages | Themes already gate at three live titles; shelves need the same treatment | M | | A |
| 2.3 | Collections: hand-curated groups across shelves ("First job", "New parent", "Starting a business", "Lent") with a cover and a line | Blinkist Collections, Shortform Collections | Cheap to build on tags; gives staff a merchandising tool | M | Names the first ten | A |
| 2.4 | Programme length as a first-class filter and badge: "4 weeks", "8 weeks", "12 weeks" on every card | Headway shows minutes; Fabulous shows journey length | Readers choose by commitment. Length is already in the data | S | | A |
| 2.5 | "Start here" title per shelf: one free, complete workbook per shelf that anyone can finish without paying | Blinkist's free daily Blink | Demonstrates the format. Works as the acquisition hook | S + content | Picks the ten titles | A |
| 2.6 | Related titles on every workbook page: same Theme, same author, same length | Every comparator | Keeps the reader in the library | S | | A |
| 2.7 | Search with results grouped by shelf, Theme, author and collection; recent searches on device | Blinkist, Shortform | Search exists; grouping makes it feel designed | S | | B |
| 2.8 | "Request a title" form that writes to leads with a reason code | Blinkist accepts title suggestions | Feeds the content pipeline and shows demand to authors | S | | B |
| 2.9 | Personalised rails from the reader's own data: shelves they read, length they finish, time of day they open | Headway's recommendations, Blinkist "For you" | Funnel events already count; the model can be a simple rule set, no AI needed | M | | B |
| 2.10 | Author pages with a follow button; new title from a followed author lands on Home | Shortform, Substack pattern | Builds author-led distribution | S | | B |
| 2.11 | Public shelf and Theme pages indexed for search engines, with the collection copy as the landing text | Blinkist's SEO pages | Free acquisition. Demo titles stay noindex | S | | B |
| 2.12 | Library as a reader's own shelf: "My workbooks" with status chips (reading, finished, paused), sortable | Imprint's To Read, Complete filters | Enrolments exist; the view does not | S | | A |

## 3. The reading and working experience

| # | Idea | From | Fit with Akana | Effort | Crent | Phase |
|---|---|---|---|---|---|---|
| 3.1 | Redesigned workbook page: cover hero, what you will do, how long it takes, a sample exercise you can try in place, author, then the price and start button | Blinkist title page, Shortform guide page | The current page is a text block with disabled buttons | M | | A |
| 3.2 | Working buttons on the public page: Buy opens checkout, Start opens the free unit | Everyone | Post-build T16. Nothing on production can be bought through a button today | S | | A |
| 3.3 | Unit map: a visual path through the programme showing done, today, locked; tap any done unit to revisit | Imprint's learning path, Duolingo pattern, Fabulous journeys | The engine knows units; the reader cannot see the shape of the whole | M | | A |
| 3.4 | Highlights and notes on workbook text, sealed like answers, exportable | Shortform, Readwise, Kindle | Readers mark what matters. Also the raw material for 4.3 | M | | B |
| 3.5 | Read aloud across every screen, using the browser's speech synthesis, with a per-title recorded option later | Blinkist (audio over 70 percent of use), Headway | Read aloud exists on one screen. Audio is how most people use these apps | M | Recorded audio later costs money | A for browser voice, C for recorded |
| 3.6 | Session timer that is calm: "About 8 minutes" at the top of a unit, not a countdown | Headway shows minutes | Sets expectation without pressure. Fine on every shelf | S | | A |
| 3.7 | Resume card on Home: the exact field you were on, one tap back | Readwise keeps your place; Headway continue | Enrolment knows the last unit, not the field | S | | A |
| 3.8 | Keyboard shortcuts on desktop: next field, save, jump to toolkit | Readwise Reader | Web-only app should be good on a laptop | S | | B |
| 3.9 | Print and PDF of a finished workbook with the reader's answers, styled | Shortform PDF download | The export exists as JSON and a plain page; make it something to keep | M | | B |
| 3.10 | "Then and now": at the end of a programme, show the first answer and the last answer side by side | Finch insights, journaling apps | Akana's unique asset is the reader's own words. This is the moment they see change | M | | B |
| 3.11 | Focus mode: hides navigation, dims everything but the current field | Reading apps generally | Small, loved | S | | B |
| 3.12 | Companion book link that works: `/go/` to the retailer with the right market, and a "Chapter 3 of the book covers this" line per unit | Blinkist's Amazon and Audible links | Honest about being a companion to a book; also affiliate income (6.9) | S | Affiliate accounts | B |

## 4. Return, habit and persistence

The rule: on mental health titles nothing counts days, nothing expires, nothing nags. On every other shelf these mechanics are allowed, and they should still feel like Akana: calm, honest, no fake urgency.

| # | Idea | From | Fit with Akana | Effort | Crent | Phase |
|---|---|---|---|---|---|---|
| 4.1 | Today as the daily surface: one step, about ten minutes, from the programme you are on, plus one small extra ("a card from your toolkit", "a note you wrote three weeks ago") | Headway daily insight, Readwise daily review, Fabulous morning routine | Today exists but reads as a list. Make it the reason to open the app | M | | A |
| 4.2 | A weekly rhythm not a daily streak: "Week 3 of 8. Two steps this week." Progress by week matches how programmes are written | Fabulous journeys, YouVersion plans | Fits all shelves including mental health, because it counts the work, not the days | S | | A |
| 4.3 | Daily review of your own words: every morning Today shows one answer you wrote earlier, with the question, and an optional "still true?" | Readwise's daily highlight review | Akana's version of spaced repetition, using the reader's own material. Strong return loop; nothing to buy | M | | A |
| 4.4 | Streaks and daily goals on non-mental-health shelves, opt-in, with a "pause my streak" button that always works and never costs anything | Headway, Imprint, Duolingo | Allowed now by decision. Opt-in and pausable keeps it honest | M | | B |
| 4.5 | Milestone marks: finishing a unit, a programme, a shelf, a year. Shown on the You tab and shareable as an image | Headway achievements, Finch | Milestones exist in the engine; they have no face | S | | B |
| 4.6 | A companion that grows: a small living thing on Home (a plant, a lamp, a path) that changes as units are finished, with no decay and nothing lost on a missed day | Finch's bird is the retention engine of a 2M-download-a-quarter app | Persistence without punishment. Fits every shelf including mental health if it never regresses | L | Approves the concept | B |
| 4.7 | Gentle reminders by email, reader-chosen day and time, with the actual step named ("Your Thursday step: the two-minute list") | Headway personalised notifications | Push is out (web only); email is in. Mailer already exists | S | | A |
| 4.8 | Calendar subscription (ICS feed) for the whole programme, not a single file | Group calendar file exists | One tap adds all remaining steps to Google or Apple calendar | S | | A |
| 4.9 | Pick-up prompt after a gap: "Welcome back. Here is where you were, and one easy step." No guilt line | Fabulous, Finch | Readers return after weeks; the app should make that easy | S | | A |
| 4.10 | Year in review: a page each January with programmes finished, words written, the first and last answers of the year | Spotify Wrapped pattern, Readwise annual | Shareable; brings back lapsed readers | M | | C |
| 4.11 | Browser notifications (Web Push) for readers who opt in, for the daily step only | Web Push works on all modern browsers including iOS Safari for installed PWAs | The one push route that keeps the app web-only | M | | C |

## 5. Adoption and conversion

| # | Idea | From | Fit with Akana | Effort | Crent | Phase |
|---|---|---|---|---|---|---|
| 5.1 | Onboarding quiz before sign-in: three questions (what are you working on, how much time, how long a programme) that land on three suggested titles and one you can start now without an account | Headway (its onboarding quiz is widely praised), Fabulous | Akana sends everyone to a login first. Let them try before they sign in | M | | A |
| 5.2 | Try the first unit signed out: answers held on device, offered to save on sign-in | Blinkist free Blink | Removes the biggest drop-off | M | | A |
| 5.3 | Free first week is already the model; show it: "Week 1 is free, no card" on every card and page | Headway free trial clarity | The policy exists; the pages do not say it | S | | A |
| 5.4 | Pricing page with the ladder explained in plain words, membership compared honestly, and "which should I pick" guidance | Blinkist pricing page | Pricing page exists and says little | S | | A |
| 5.5 | Membership positioned as the default once three or more titles interest a reader: "You have started two. Membership covers both and the next six" | Blinkist upsell timing | Shown only after real use, never on first visit | S | | B |
| 5.6 | Gift a workbook: pay once, a code arrives by email, the recipient needs no card | Blinkist gift cards, Audible gifts | Gifts are in the feature list (F-106) as not started. Gifting sells at Christmas and to new parents | M | Stripe product | B |
| 5.7 | Gift membership, three and twelve months | Same | | S after 5.6 | | B |
| 5.8 | Bundles: a Theme's three titles at a lower total | F-106 | Price ladder supports a seventh point for bundles | M | Bundle prices | B |
| 5.9 | Promotion codes shown in checkout are already on; add a public "first workbook" code for launch and for authors to hand out | Stripe promotion codes | Zero build; a decision | S | Sets the code | A |
| 5.10 | Trust strip on checkout: sealed answers, no third-party trackers, 14-day refund, cancel in two taps | Finch's privacy stance, Akana's own trust page | The product's real differentiator, said at the moment of payment | S | | A |
| 5.11 | Receipts that look like Akana, not Stripe's default, still code-only | | Mailer exists | S | | A |
| 5.12 | Social proof that is true: "412 readers finished this", counts above the suppression threshold only | Shortform "Popular books" | Funnel counts exist | S | | B |

## 6. Growth models

| # | Idea | From | Fit with Akana | Effort | Crent | Phase |
|---|---|---|---|---|---|---|
| 6.1 | Shared membership for two: one membership, two accounts, separate sealed answers | Blinkist Connect (reported to have lifted organic growth by about a quarter) | The single strongest growth feature in the comparator set, and it suits workbooks: couples, friends, parent and adult child | M | Price point | A |
| 6.2 | Do a programme with a friend: invite one person, same schedule, each sees only that the other finished a step, never the answers | YouVersion plans with friends, Finch "send strength" | Check-in partner already exists (F-030); this is the two-way version | M | | B |
| 6.3 | Refer a friend: both get a workbook credit or a free month, tracked by code, paid only on first purchase | Standard; Blinkist and Headway run affiliate and referral schemes | Credits need a small ledger; the rest exists | M | Credit value | B |
| 6.4 | Author affiliate links: every author gets a link; sales through it earn a higher share for that author | Blinkist Partner Program pays 20 percent revenue share to referrers | Authors already have a share. Paying more for sales they bring is the cheapest marketing Akana will ever buy | M | Share figure (D1 to D4) | B |
| 6.5 | Embeddable "Try the first exercise" widget authors can put on their own site, which opens the free unit on Akana | Substack embeds, Spotify embeds | Turns every author site into a funnel | M | | C |
| 6.6 | Organisation seats sold self-serve for small teams and groups, already built behind a flag; turn on with the Blinkist for Business framing ("for your team, your church, your group") | Blinkist for Business, 1,500 organisations | Code exists (0030, 0031). The flag is off until the DMCC consumer duties are checked, which they now are | S | Prices and terms (L7) | B |
| 6.7 | Reseller and partner page: coaches, therapists, churches and HR advisers refer organisations and earn a share | Blinkist partner programme | Fits the organisation product; needs the share figure | S | Share figure | C |
| 6.8 | Employee perk listing: Akana membership on benefits marketplaces | Blinkist lists on procurement and benefits marketplaces | Distribution without a sales team | S | Accounts | C |
| 6.9 | Book affiliate links through `/go/`: Amazon, Bookshop.org, Audible | Blinkist's affiliate income | Small income, zero friction | S | Affiliate accounts | B |
| 6.10 | Public programme pages for search engines with the free first unit visible as text | Blinkist's SEO pages drive most of its organic traffic | Each title becomes a landing page | M | | B |
| 6.11 | Newsletter: one short email a week with one exercise anyone can do, no account needed, from a live title | Readwise daily email, every content business | Mailer exists; list needs a double opt-in form | M | | B |
| 6.12 | Faith channel: 30-day programme launches timed to Lent and Advent, with church group pricing | YouVersion and Glorify run 30-day challenges; three faith apps ran a joint Global Bible Month | The faith shelf has 18 demo and 27 verified classics waiting | M | Theological reviewer (C11) | C |
| 6.13 | Author-led launches: a title launches with the author's email list and a code; Akana supplies the page, the graphics and the stats | Course platforms | The author outreach item (C30) needs a launch kit to offer | M | | C |
| 6.14 | Public API or export for organisations' learning systems | Blinkist LMS integrations | Enterprise asks for this before buying | L | | C |

## 7. Content and copywriting

| # | Idea | From | Fit with Akana | Effort | Crent | Phase |
|---|---|---|---|---|---|---|
| 7.1 | Content for the five live classics, so there is one sellable readable title on day one | | Post-build T15. Nothing can be bought and read today | L (content) | Signer (C10) | A |
| 7.2 | Card lines rewritten as outcomes ("Keep a cash book you will actually use") not topics | Headway and Blinkist write outcome lines | Card lines exist; many describe rather than promise | M | | A |
| 7.3 | One-paragraph "What you will have at the end" on every workbook page | Fabulous journeys describe the end state | Sets the value before the price | S + content | | A |
| 7.4 | Interface copy pass: every button, empty state and error in one voice, UK English, no filler | | The app has been built by many agents in a fortnight | M | | A |
| 7.5 | Empty states that teach: Home with no workbooks shows three starters, not a sentence | Finch, Headway | First-run quality | S | | A |
| 7.6 | Author bios in a house style, 60 words, with a photo or generated portrait for demo authors | Blinkist author pages | Authors look thin today | S | | B |
| 7.7 | Theme intros: 80 words each on what the Theme is for | Blinkist category copy | 51 Themes, 51 short paragraphs | M | | B |
| 7.8 | Help centre rewritten around tasks ("I cannot see my answers") with the top ten linked from the You tab | | Help exists; make it findable | S | | B |
| 7.9 | Sample content rule: every live title must have at least its first unit complete before it shows in the library | | Protects the "free first week" promise | S (policy) + content | | A |
| 7.10 | Weekly editorial slot: one title featured on Home and in the newsletter with a 100-word editor's note | Blinkist's editorial team adds titles weekly | Gives staff a weekly rhythm readers can feel | S | | B |

## 8. Authors and publishers (Studio)

| # | Idea | From | Fit with Akana | Effort | Crent | Phase |
|---|---|---|---|---|---|---|
| 8.1 | Studio redesign to the new system, with a dashboard home: sales this month, readers started, readers finished, next payout | Shortform and Blinkist have no author side; Substack and Gumroad do this well | Authors judge a platform by its dashboard | M | | B |
| 8.2 | Workbook builder with a form, not JSON: units, exercises and fields added through a guided editor, validated live | Course platforms | The JSON editor is staff-grade. Authors need a builder | L | | B |
| 8.3 | AI-assisted first draft from the author's book: upload the manuscript, get a proposed unit structure and exercise prompts to edit, never published without the author's sign-off | Blinkist AI summarises uploads | Cuts the "request Akana development" queue. Needs clear rules on data and quality | L | Decision on AI use and the cost | C |
| 8.4 | Author launch kit: cover variants, social images, a code, a landing page link, a stats page | | Pairs with 6.13 | M | | C |
| 8.5 | Reader feedback to authors: a single optional end-of-programme question, aggregated above the threshold | Shortform comments, Blinkist ratings | Authors want to know what landed | S | | B |
| 8.6 | Real figures in the Studio: share, pool basis, payout day | | Every rate is a placeholder until D1 to D5 | S | D1 to D5 | A |
| 8.7 | Publisher imprint pages and bulk import of a backlist as listings | | Publisher console exists | M | | C |

## 9. Organisations (Akana Business)

| # | Idea | From | Fit with Akana | Effort | Crent | Phase |
|---|---|---|---|---|---|---|
| 9.1 | Self-serve flag on, with the three plans named and priced on the Organisations page | Blinkist Business Teams and Enterprise | Built, flag off | S | Prices, terms (L7) | B |
| 9.2 | Group leader kit: facilitator guide, session plan, the week's exercise as a one-page PDF to print | Church small-group materials, YouVersion groups | Facilitator guides exist; package them | M | | B |
| 9.3 | Organisation report as a monthly email, counts only, to the owner | | Reports exist as pages | S | | B |
| 9.4 | Pilot offer: 30 days, ten seats, one programme, one guide, a call at the end | Blinkist Business pilots | The sales motion for the first ten organisations | S | Offer terms | B |
| 9.5 | Church band pricing shown publicly | Glorify and Hallow church plans | Built in 0031; not on the page | S | Prices | B |
| 9.6 | Single sign-on for larger organisations | Blinkist Business SSO | Enterprise expectation | L | | C |

## 10. Platform and services

| # | Idea | From | Fit with Akana | Effort | Crent | Phase |
|---|---|---|---|---|---|---|
| 10.1 | PWA install: manifest, icons, install prompt after the second visit, offline Help now already there | Web-only decision | "Add to home screen" is the mobile app | S | | A |
| 10.2 | Edge caching for public pages and covers; image optimisation | Performance budget in the test plan | Library and covers must load under three seconds on a phone | M | | A |
| 10.3 | Error tracking (Sentry or similar) and uptime checks | Standard | Today errors are found by reading Vercel logs | S | Account | A |
| 10.4 | Product analytics that respect the no-tracker rule: first-party funnel counts extended to screens and drop-offs, ids only | Akana F-141 | Needed to run the experiments in this list | M | | A |
| 10.5 | Feature flags per cohort, so streaks (4.4) and the companion (4.6) can be tested on a tenth of readers | Flags exist | Cohort targeting does not | S | | B |
| 10.6 | Resend sending domain and templates with the new design | | T1 | S | Domain (C5) | A |
| 10.7 | Google sign-in | | C26. Removes a sign-in step for most readers | S | OAuth client | A |
| 10.8 | Passkeys for readers, not just staff | Built behind a flag for staff | Faster return sign-in on the same device | S | | B |
| 10.9 | Backups verified and a restore drill done once | docs/BACKUPS.md | Pro plan now has backups; the drill proves it | S | | A |
| 10.10 | Database content pipeline: a script that validates, versions and publishes a v3 JSON to staging then production in one command | | Content loading today is hand work through the SQL editor | M | | A |
| 10.11 | Recorded audio pipeline: text to speech per unit with a licensed voice, cached as files, behind a flag | Blinkist audio | Audio is the single largest use mode in the category | L | Voice licence cost | C |

## 11. Trust, safety and legal

| # | Idea | From | Fit with Akana | Effort | Crent | Phase |
|---|---|---|---|---|---|---|
| 11.1 | Trust page rewritten as a comparison: what Akana never does that others do (trackers, selling data, reading your answers) | Finch's privacy positioning, Akana `/trust` | The differentiator, stated | S | | A |
| 11.2 | Streak and reminder settings always one tap from Today, with "turn everything off" | | Keeps the new habit mechanics honest | S | | B |
| 11.3 | Mental health shelf rules written into the build system: a lint that fails if a streak or countdown component is rendered on a tier-1 or tier-2 title | | Makes the decision enforceable | S | | B |
| 11.4 | Lawyer and accountant reviews from the post-build list (L1 to L14, A1 to A7) | | Before the first live payment | | Engages them (C29) | A |
| 11.5 | Accessibility manual pass (C2 in the test plan) and a public accessibility statement | | WCAG 2.2 AA is a stated goal | M | | A |

## 12. Little things and perks

| # | Idea | From | Fit with Akana | Effort | Crent | Phase |
|---|---|---|---|---|---|---|
| 12.1 | A handwritten-feeling welcome note from the author at the start of each programme | Course platforms | Warmth. Demo authors get a house-written one | S + content | | A |
| 12.2 | Finish certificate as a styled image with the reader's first name and the programme, shareable or private | Headway, Coursera | Earned, not gamified | S | | B |
| 12.3 | "Send this to someone" on any exercise: a link that opens the exercise blank for the recipient to try | Finch sends gratitude to friends | Share the exercise, never the answer | S | | B |
| 12.4 | Reading time of day: the app notices when you usually open it and offers the reminder at that time | Headway personalisation | Small, feels attentive | S | | B |
| 12.5 | Seasonal collections: January starts, Lent, exam season, new school year, Advent | Glorify and YouVersion seasonal plans | Cheap editorial calendar | S | | B |
| 12.6 | A quiet "You wrote 1,200 words this month" line on the You tab, never a target | Finch insights | Shows the asset growing | S | | B |
| 12.7 | Paper option: a printed workbook with the reader's answers, print on demand | Nothing in the category does this; journaling apps do photo books | Memorable; margin unknown | L | Print partner | C |
| 12.8 | Birthday or anniversary note from Akana with a free workbook credit | Finch | Retention gesture | S | Credit value | C |
| 12.9 | Author "office hours": a live monthly session for readers of a programme, link only, no video hosted by Akana | Blinkist Platinum live expert sessions | Premium feel for zero infrastructure | S | Authors' time | C |
| 12.10 | Lock screen widget alternative for web: a bookmarkable `/today` URL that opens straight to the step | | The web answer to a home screen widget | S | | A |

---

## 13. Additions from the deep research (9 October, afternoon)

Evidence for each is in `docs/research/AK_Market_Research_2026-10.md`, strand numbers in brackets.

| # | Idea | From | Fit with Akana | Effort | Crent | Phase |
|---|---|---|---|---|---|---|
| 13.1 | Google One Tap on the web, with account linking by verified email so a magic-link reader who taps Google lands in the same account (strand 1) | Google case studies: Reddit conversion nearly doubled, eBay sign-ins doubled | Gmail users sign up in one tap with no email round trip; verification is automatic because Google has verified the address | S | OAuth client (C26) | A |
| 13.2 | Optional two-factor for readers in the You tab: authenticator or passkey, never required, with recovery codes (strand 1) | Passwordless decision frameworks: primary method plus fallback, step-up only when risky | Code exists for staff; opening it to readers who want it costs little | S | | A |
| 13.3 | Passkey prompt after the first successful sign-in on a device, so return visits are one touch (strand 1) | Synced platform passkeys are the 2026 default recommendation | Built behind a flag for staff | S | | B |
| 13.4 | Membership offered inside onboarding, after the quiz and the first exercise, as one clear offer with the price visible (strand 2) | RevenueCat: onboarding accounts for about half of trial starts; skippers rarely return | The free first week stays; the membership offer moves earlier | S | | A |
| 13.5 | Longer membership trial, 14 to 21 days, card required, reminder before first charge, cancel in two taps (strand 2) | RevenueCat: trials of 17 to 32 days convert at 42.5 percent against 25.5 percent for short ones | Sits inside the DMCC reminder rules already built | S | Decision: trial length | A |
| 13.6 | Streak rules written down and enforced: opt-in, counts the step not the day, free pause always available, never sell protection, mental health shelves excluded (strand 3) | Duolingo Streak Freeze cut at-risk churn 21 percent; Trophy: freezes make streaks 4.5x longer | Turns the decision into a specification the lint (11.3) can check | S | Approves the rules | B |
| 13.7 | DMCC compliance pass before first sale: no countdowns, no false scarcity, full price on every invitation to buy, true counts only, reviews only from verified buyers (strand 3) | CMA fined the AA £4.2 million over drip pricing in 2026; fake urgency and fake reviews are blacklisted | Mostly confirms what is built; makes it auditable | S | Lawyer (L1 to L4) | A |
| 13.8 | Three design directions to choose from: paper and ink, bright editorial, quiet confidence, each shown on the same four screens (strand 4) | Readwise, Headway and Imprint, Blinkist | Gives 1.1 a concrete decision | M | Picks one | A |
| 13.9 | Reading floor regardless of direction: warm canvas, reading serif, 65-character line length, generous margins, one accent colour, keyboard shortcuts (strand 4) | Readwise Reader design breakdowns | Not taste; the baseline every reading app meets | S | | A |
| 13.10 | Household plan for two to four at about 1.5 to 1.7 times the single membership, separately sealed answers (strand 5, widens 6.1) | Hallow Friends and Family covers six at 1.7x; Blinkist Connect lifted organic growth by about a quarter | Couples, families, friends; the best-evidenced growth feature | M | Price and household size | A |
| 13.11 | Double-sided referral: credit to both on the friend's first purchase, shown after a finished unit, not on first visit (strand 5) | Friend with a reward converts at 15 to 22 percent against 8 to 12 percent without; 78 percent of programmes are double-sided | Small credit ledger needed | M | Credit value | B |
| 13.12 | Two author shares: higher on sales the author's own link brings, lower on marketplace-originated sales (strand 6, informs D1 to D4) | Gumroad charges 10 percent on creator-sourced sales and 30 percent on its own marketplace sales | Pays authors most for the distribution they bring; a tested precedent for the share decision | S (policy) | D1 to D4 | A |
| 13.13 | Studio dashboard home: sales this month, readers started, readers finished, next payout, on one screen (strand 6, sharpens 8.1) | Creators switch platforms for a better dashboard and suite | First screen an author sees | M | | B |
| 13.14 | Organisation pricing in the $12 to $36 per person per year band for teams and churches, with facilitator-supported programmes above it (strand 7) | Vendr benchmarks for Headspace for Work; HR buyer guides | Gives C3 and L7 a market anchor | S | Prices | B |
| 13.15 | Small-organisation plan shape: self-serve 5 to 50 seats, invoice payment, no auto-renew, seat reassignment, launch toolkit, aggregate reporting (strand 7) | Headspace Core for Small Business; Blinkist Business Team plan | Most of this is built behind the flag | S | Terms (L7) | B |
| 13.16 | Church profile page with a featured programme that notifies followers, a share link, and printable leader materials (strand 8) | YouVersion for Churches; Hallow parish kit | Builds on groups (0028) and facilitator guides | M | Reviewer (C11) | C |
| 13.17 | Parish-style annual partnership offer: free period then a discount, seasonal Lent and Advent programmes (strand 8) | Hallow parish partnerships; Global Bible Month | Sales shape for the faith channel | S | Offer terms | C |
| 13.18 | iOS install guide of our own, shown after the second visit, and sign-in that recovers in one tap inside the installed web app (strand 9) | iOS has no automatic install prompt; installed web apps start signed out | Makes the web-only decision work on iPhones | S | | A |
| 13.19 | Web Push for installed readers only, daily step only, email the primary channel (strand 9, sharpens 4.11) | Web Push on iOS works only after Home Screen install | Keeps notifications honest and web-only | M | | B |
| 13.20 | First-party analytics as the first build item, because no comparator publishes trial or paywall figures and Akana will need its own (strand 9 note) | RevenueCat data is category-wide, not Akana's | 10.4 moved to the front of Phase A | M | | A |

## Suggested order if everything in Phase A is chosen

Front-loaded for the first sale, about six weeks of agent work plus Crent's items. Section 13 items are folded in where they belong.

0. First-party analytics (10.4, 13.20) and Google One Tap with optional two-factor (13.1, 13.2), so everything after it can be measured and signed into.
1. Visual identity and design system (1.1 to 1.7), because everything else is painted with it.
2. Content for one sellable title (7.1) and the public-page buttons (3.2), because nothing sells without them.
3. Explore page and shelf pages (2.1 to 2.6, 2.12), the library readers see first.
4. Onboarding quiz and try-before-sign-in (5.1 to 5.3), the top of the funnel.
5. Today as the daily surface, weekly rhythm, daily review of your own words, reminders and pick-up prompt (4.1 to 4.3, 4.7 to 4.9), the reason to return.
6. Shared membership for two (6.1), the one growth feature worth having at launch.
7. Workbook page redesign, unit map, read aloud, resume card (3.1, 3.3, 3.5, 3.6, 3.7).
8. Marketing site, pricing page, checkout trust strip, receipts (1.8, 5.4, 5.10, 5.11).
9. Platform: PWA, caching, error tracking, analytics, content pipeline, backups drill, Google sign-in, sending domain (10.1 to 10.4, 10.6, 10.7, 10.9, 10.10).
10. Copy pass, empty states, card lines, end-state paragraphs, author notes (7.2 to 7.5, 7.9, 12.1, 12.10).
11. Trust page and accessibility pass (11.1, 11.5), with the lawyer and accountant running alongside (11.4).

## Questions this list raises for Crent

- Which three design directions should I mock up for 1.1, and is there any brand you want it to feel like, or not feel like?
- The companion (4.6) is the most ambitious retention idea here. Build a cheap version first, or leave it for Phase B?
- Shared membership (6.1) needs a price. Blinkist charges roughly 1.5 times a single membership for two.
- AI-assisted drafting for authors (8.3) is the one item that changes what Akana is. In or out?
- Recorded audio (10.11) is the biggest cost item. Browser voice first, and decide on recorded audio after launch?
