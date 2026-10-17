# Akana build list, final (v3)

Written 9 October 2026. Built from AK_Build_List_v2.md, Crent's decisions of 9 October, and six research strands run the same evening (design, onboarding and conversion, growth, retention, reading and platform, authors and organisations and content). The evidence for every figure below is in docs/research/AK_Build_Research_2026-10-09.md, with URLs. Item numbers 1.x to 13.x are v2 numbers. New items from the research are 14.x.

## Decisions recorded on 9 October

- Phase A is fully front-loaded. The first sale follows the redesign, Explore, onboarding, Today and shared membership. About six to seven weeks of agent work plus Crent's items.
- Visual identity: three directions mocked up on the same four screens. Crent picks one.
- First sellable title: the five classics first, Maya Vaughn Focus when the clinician signs off.
- Shared membership: two people at about 1.5 times a single membership.
- Companion that grows: Phase B.
- Streaks and daily goals: Phase B, opt-in, never on mental health shelves.
- AI-assisted author drafting: Phase C.
- Audio: browser voice in Phase A. Recorded audio decided after launch.
- Web only throughout. No native app.

## Decisions the research now puts to Crent

- Membership trial length: 14 days on monthly, 21 or more on annual. RevenueCat data across 17,000 apps shows monthly plans convert best at 10 to 16 days and annual at 17 to 32 days. Recommended: 14 and 21.
- Author payout promise: weekly on Fridays with a low floor (about £10). KDP pays 60 days after month end; Gumroad pays weekly. Recommended: adopt weekly.
- Supabase point-in-time recovery at $100 a month before the first sale. Answers are the asset. Recommended: yes.
- Stripe Tax: switch on when VAT registration happens. Accountant decides timing (A1 to A7).

## Rules that apply to every item

- Mental health shelves (tier 1 and 2): nothing counts days, nothing expires, nothing nags, no streaks, no countdowns. A lint enforces this (11.3) and a written review gate checks every habit feature before it ships (14.4).
- Sharing rule: a reader can share a blank exercise, a completion mark, a pre-written nudge or a whole workbook. Never an answer. The lint enforces this too.
- Habit mechanics on other shelves: opt-in, count the finished step not the day, free and automatic pause, never sold, no leaderboards anywhere, no "last chance" wording.
- DMCC and CMA: full price on every invitation to buy, no countdown timers anywhere (seasonal launches show a date), no struck-through "was" prices on new titles or codes, no legal right presented as a feature, "free" only where nothing is paid, true counts only, reviews from verified buyers only. Key subscription terms shown together before purchase, reminders before conversion and renewals, cooling-off after conversion, cancel by a clearly labelled button, confirmation within 24 hours.
- Referrals: the reader shares the link through their own channels. Akana never emails the friend. Every referral message states the conditions, including that the friend must pay before any credit lands (ASA Beer52 ruling, ICO PECR instigator rule).
- UK English, short sentences, one voice. Voice guide with a channel matrix (14.39). Plain English lint on interface strings (14.40).
- No third-party trackers. First-party analytics with a daily-rotating hashed id (10.4). Retention is measured as finished steps per week, not opens.

---

## Phase A: before the first sale

Ordered as the build should run. Steps 0 to 2 cannot slip. "Detail" rows carry what the research added to a v2 item.

### Step 0. Measure, sign in, protect

| Item | What | Effort | Crent |
|---|---|---|---|
| 10.4, 13.20 | First-party analytics. Daily-rotating hashed id (Plausible model), funnel to screen level, partial-answer counts as the drop-off signal. Headline metrics: finished steps per week by cohort, day-zero trial cancels, first-month annual cancels | M | |
| 13.1, 10.7 | Google One Tap with account linking by verified email | S | OAuth client (C26) |
| 13.2 | Optional two-factor for readers in the You tab, with recovery codes | S | |
| 10.3 | Sentry Developer plan ($0: errors, one uptime and one cron monitor; mask all text in replays) plus Better Stack or UptimeRobot free tier with a public status page | S | Accounts |
| 10.9 | Backups verified, one restore drill, PITR switched on | S | Approves $100 a month |
| 14.8 | Supabase Vault for every key a database job uses; Supabase Cron (pg_cron) for reminders, daily review and pick-up prompts, logged in the database | S | |
| 14.9 | Stripe Adaptive Pricing on (local currency, reader pays the 2 to 4 percent conversion fee, say so on the pricing page) | S | |
| 14.10 | Stripe Link on in Checkout, for one-tap second purchases | S | |
| 14.23 | Stripe Smart Retries and a card-update email on from day one | S | |

### Step 1. Visual identity and design system

| Item | What | Effort | Crent |
|---|---|---|---|
| 13.8, 1.1 | Three directions on the same four screens (Home, Explore, workbook page, a unit). Then palette, type pairing, illustration style, motion rules. Principle: dramatic marketing site, near-invisible product interface | L | Picks a direction |
| Detail | One brand colour reserved for key actions and the logo; everything else neutral; shelf colours do the differentiating. Three named colour combinations (sales, informative, warm) so staff know which to use. Illustration only on editorial surfaces (collection covers, onboarding, editorial cards), never on empty states or transactional email | | |
| 13.9 | Reading floor: warm canvas, reading serif, 65-character line, 20px body at 1.4 spacing, generous margins, one accent colour. Chrome hides while reading and returns on hover or keyboard | S | |
| 1.2, 1.9 | Cover system per shelf and Open Graph images from one Satori (next/og) renderer. Format-coded covers: 4, 8 and 12 week programmes, collections and "Start here" titles each visibly different, with a one-line preview on every cover | M | Approves the style |
| 1.3 | Ten shelves, each with a colour, an icon and a short line | S | |
| 1.4 | Two-typeface rule: sans for Akana's voice (interface, prompts, buttons), serif for content (workbook text, book titles in italic, quotes). Bold for titles only. Shortlist of OFL faces: Literata, Charis SIL, PT Serif, Faustina (serif); Source Sans, Libre Franklin (sans); Atkinson Hyperlegible and OpenDyslexic as reader options | S | |
| 14.11 | Font licence check: OFL Reserved Font Names mean a subset font must be renamed ("Akana Serif"). Check each face before subsetting | S | |
| 1.5 | Dark mode designed: named reading themes each with a light and dark version (Readwise model), deep blue canvas for night, settings Light, Dark, Match device | S | |
| 1.6 | Motion rules. Save is a two-word toast in a fixed spot, not a modal. One confetti moment at unit end, a larger reveal at programme end. Reduced motion honoured | M | |
| Detail | Autosave state model: "Unsaved changes" while typing, "Saving" on the write, "Saved just now" after; debounce to a pause in typing; "Saved" means saved to the server; on failure "Couldn't save, retrying" with a Retry button and the cause named (offline versus session expired) | | |
| 1.7 | Component library at /dev/kit. Starting tokens: pill buttons 18px radius, body 16px | M | |
| 14.1 | Navigation: four tabs, Today, Explore, My workbooks, You. A persistent mini-bar above the tabs while read-aloud plays | S | |

### Step 2. Something to sell

| Item | What | Effort | Crent |
|---|---|---|---|
| 14.38 | Written unit spec before content starts: introduction (why it matters), 5 to 10 key ideas each with a sentence heading, explanation and example, exercises as one set-up paragraph and one direct question, a closing takeaway, about 15 minutes to read | S | |
| 14.41 | Classics pipeline modelled on Standard Ebooks: most accurate source not most downloaded, copyright and scan check, reversible modernisation commits, lint, cover-to-cover proofread, named reviewer gate before release | M | |
| 7.1 | Full content for the five live classics through that pipeline | L (content) | House-record signer (C10) |
| 7.1b | Maya Vaughn Focus moved to sellable when the clinician signs off | S | Clinician |
| 3.2 | Working buttons on the public page: Buy opens checkout, Start opens the free unit | S | |
| 7.9 | Policy: a title shows in the library only when its first unit is complete | S | |
| 8.6, 13.12 | Real figures in the Studio. Two author shares (higher on author-link sales, lower on marketplace sales). Per-sale breakdown line: platform share and card processing shown separately so the arithmetic is visible | S | D1 to D5 |
| 14.27 | Payout calendar published ("sold in month X, paid on Friday Y") and a Payments Report with Pending and Paid per payment | S | Confirms weekly |
| 14.29 | Connect onboarding rule: a title can go live, but earnings hold and the author is nudged until Stripe Connect is complete | S | |
| 5.9 | Public "first workbook" promotion code, plus a /code page that applies it before checkout and shows the price paid. Never "was £Y" | S | Sets the code |

### Step 3. Explore and the library

| Item | What | Effort | Crent |
|---|---|---|---|
| 2.1 | Explore in the Blinkist order: shelf tiles with colour and icon, then rails (New this week, Short programmes, Most started, Because you read X), then Themes. Rails ranked by finish rate, not opens | M | |
| 2.2 | Shelf pages repeat the pattern: Themes, then three short lists, a featured title, an editor's line, the count | M | |
| 2.3 | Collections across shelves with a cover and a line | M | Names the first ten |
| 2.4 | Programme length as a filter and a badge, matching the format-coded covers | S | |
| 2.5 | One free complete "Start here" title per shelf, and no more free content than that (hard paywall data: 10.7 percent trial-to-paid against 2.1 percent for freemium) | S + content | Picks the ten |
| 2.6 | Related titles on every workbook page | S | |
| 2.12 | My workbooks with status chips (reading, finished, paused), filters All, Reading, Finished | S | |

### Step 4. Top of the funnel

| Item | What | Effort | Crent |
|---|---|---|---|
| 5.1 | Onboarding quiz, four to five questions, the most engaging first ("what is going on for you right now"), progress bar from step one, a one-line "why we ask" under each, then three suggested titles. One commitment screen after the quiz ("This week I will do two steps"), no deadline shown | M | |
| 5.2 | Try the first unit signed out. Answers held in IndexedDB with navigator.storage.persist requested. Soft sign-in wall at the end of the unit: "Save your answers", Google One Tap first | M | |
| 14.6 | Offline draft recovery for every field, with the Safari seven-day storage rule in mind (installed web apps keep their own clock, so the install guide says so) | M | |
| 5.3 | "Week 1 is free, no card" on every card and page. The membership trial is labelled "14 days, then £X a month", never "free" | S | |
| 13.4 | Membership offered after the quiz and the first exercise, as one clear offer with the relevant library visible. Plan, billing period, trial length, renewal price, cancellation path and dismiss action readable together | S | |
| 13.5 | Trial: 14 days monthly, 21 days annual, card required. The paywall states the exact day the reminder email arrives (Blinkist's redesign: day-zero complaints down 55 percent) | S | Trial lengths |
| 14.20 | Day-zero email that shows the first week's unit plan, not a receipt (55 percent of short-trial cancels happen on day zero) | S | |
| 14.21 | Annual shown as a monthly equivalent with the yearly total beside it at the same size. Toggle obvious | S | |
| 13.18 | iOS install guide after the second visit; sign-in that recovers in one tap inside the installed web app | S | |
| 10.1 | PWA install: manifest display standalone, icons, prompt after second visit, pre-permission screen before any system dialogue | S | |

### Step 5. The reason to return

| Item | What | Effort | Crent |
|---|---|---|---|
| 4.1 | Today as the daily surface, three cards at most: today's step, one from your toolkit, one suggestion. Tuned for the first 30 days of membership (35 percent of annual cancels happen in month one) | M | |
| 4.2 | Weekly rhythm: "Week 3 of 8. Two steps this week." A week counts only when a step is finished with its fields filled (Khan Academy's rule) | S | |
| 4.3 | Daily review of your own words with a frequency dial per programme and soft actions (keep, set aside) that never delete. Reader chooses which programmes feed it | M | |
| 4.7 | Email reminders on the reader's chosen day and time, "Akana today:" prefix, the step named, no guilt line. Idempotency key per reader per step. Sent by Supabase Cron | S | |
| 14.3 | Reminders that stop themselves: after N ignored emails, one that says they are stopping and how to restart | S | |
| 4.8 | Calendar subscription for the whole programme | S | |
| 4.9 | Pick-up prompt after a gap: where you were, one easy step, and an optional one-line reflection ("what got in the way?") the reader can skip, sealed like any answer. Win-back subject lines short and plain, no discount | S | |
| 14.5 | Pause and save mid-unit that keeps the place; after a long session, one line suggesting a break (the one nudge the ICO recommends) | S | |
| 12.10 | Bookmarkable /today | S | |

### Step 6. Growth at launch

| Item | What | Effort | Crent |
|---|---|---|---|
| 6.1 | Shared membership for two at about 1.5 times single, separate sealed answers. Positioned as "two people, one price, each with sealed answers". Also offered at cancellation and at month three (Spotify Duo retained 83 percent at twelve months against 69 percent for Individual) | M | Confirms price |

### Step 7. Reading and working

| Item | What | Effort | Crent |
|---|---|---|---|
| 3.1 | Workbook page redesigned: cover hero, "What you will do", "Who this is for" in three lines, how long, a sample exercise to try in place, the certificate shown as the destination, author, then price and start | M | |
| 3.3 | Unit map as a vertical path, Start on the active step, done and locked states, a short celebration when each week closes | M | |
| 3.5 | Read aloud on every screen with the browser's voice. Chunk by sentence (Chrome cuts at about 15 seconds), poll getVoices, match language by prefix, set voice on iOS and lang on Android. Listen and Read as two modes of one unit with a switch; resume from the exact passage. Help page says what the voice cannot do | M | |
| 3.6 | Calm estimate at the top of a unit, shown as "time left in unit" | S | |
| 3.7 | Resume card on Home to the exact field. "You can leave any time. Your answers are kept." stated in the interface | S | |
| Detail | Reading settings panel (Aa button): font including OpenDyslexic, size, page colour, margin width, progress display. Synced to the account, not the device | S | |

### Step 8. Selling surfaces

| Item | What | Effort | Crent |
|---|---|---|---|
| 1.8 | Marketing site redesign: home, Publish, Organisations, Pricing, real screenshots, a demo title to try signed out. Publish page says: no monthly fee, you pay only when a reader does; paid every Friday; we answer your readers' questions | L | Approves copy |
| 5.4 | Pricing page: two or three plan cards, recommended first and badged, FAQ including "Can I cancel" and "Which should I pick", cancellation stated. No strike-through, no per-day maths | S | |
| 5.10 | Trust strip inside the payment box, not above the page, one or two recognised marks. Wording: "Your 14-day cancellation right under UK law", sealed answers, no trackers | S | |
| 5.11 | Receipts in Akana's design, idempotent | S | |
| 14.24 | Cancellation flow: one screen, one optional reason, one offer (the shared plan or a pause), then cancel. Confirmation within 24 hours | S | |
| 10.6 | Resend sending domain and templates in the new design. Budget the Pro plan ($20) because reminders exceed the free daily cap early | S | Domain (A7, C5) |

### Step 9. Platform

| Item | What | Effort | Crent |
|---|---|---|---|
| 10.2 | Edge caching for public pages and covers. Vercel Image Optimization priced per transformation, so fix cover sizes to a short list with a long cache TTL | M | |
| 10.10 | Content pipeline: validate, version and publish a JSON to staging then production in one command, with the source-verification and reviewer gates from 14.41 | M | |

### Step 10. Words

| Item | What | Effort | Crent |
|---|---|---|---|
| 14.39 | One-page Akana voice guide with a channel matrix: receipts, errors, consent and settings at full plainness; Home and finish sequence allowed warmth; mental health shelves never humorous. "We're sorry", never "We'd like to apologise" | S | |
| 14.40 | Plain English lint over interface strings and workbook text: 25-word sentence check, no negative contractions, no metaphors, "use" not "utilise", unit titles as full sentences | S | |
| 7.4 | Interface copy pass in one voice | M | |
| 7.2 | Card lines rewritten as outcomes | M | |
| 7.3 | "What you will have at the end" and "Who this is for" on every workbook page | S + content | |
| 7.5 | Empty states: one plain sentence, one visible next step, four types (first-time, cleared, filtered, error). Warmth on first-run screens, plain words on payment and settings | S | |
| 12.1 | Author letters: a welcome note at the start and three or four short letters across the weeks, addressed by name | S + content | |

### Step 11. Trust and law

| Item | What | Effort | Crent |
|---|---|---|---|
| 11.1 | Trust page as a comparison, plus a public status page link and the analytics id rule stated | S | |
| 11.5 | Accessibility manual pass and a public statement naming WCAG 2.2 AA and a contact route. A VPAT-style conformance report follows in Phase B for organisation buyers | M | |
| 13.7 | DMCC compliance pass, auditable, using the rules above | S | Lawyer (L1 to L4) |
| 14.4 | Mechanic review gate: a written checklist from the ICO and CMA harmful design paper (nudges, sludge, confirmshaming, bundled consent, harmful defaults) applied to every habit, cancel and unsubscribe flow | S | |
| 11.4 | Lawyer and accountant reviews (L1 to L14, A1 to A7), including DMCC subscription commencement date, VAT and Stripe Tax timing | | Engages them (C29) |

### Phase A totals

About six to seven weeks of agent work. The research added roughly a week of small items, most of them switches and specifications rather than features.

---

## Phase B: first 90 days after launch

Grouped, not ordered. Order by what the Phase A analytics show.

**Habit and persistence.** 4.4 and 13.6 streaks and daily goals on non-mental-health shelves: opt-in, offered only after a reader has finished a few steps, counts finished steps, automatic free pause, current and longest shown without oversized numbers, no leaderboards. 4.5 milestone marks at several scales (first step, first week, first programme, first shelf), shareable as an image. 4.6 the companion that grows: draws energy from finished steps and returns with a line or question, never loses anything. 11.2 streak and reminder settings one tap from Today. 11.3 the mental health lint. 12.6 "You wrote 1,200 words this month". "On this day" for the reader's own earlier answers (enriches 4.3).

**Growth.** 14.12 author-to-author recommendations: each author recommends up to three others, shown at programme end and on author pages, recommenders get recommended back (Substack: a third of new subscriptions; Patreon: two million memberships a year). 14.13 author referred-membership share: recurring for as long as the member stays (Medium model). 6.2 do a programme with a friend: status and pre-written nudges only, the nudge always comes from the friend, a "Talk it over" prompt at the end of each step (Duolingo: friends make finishing 5.6 times more likely). 6.3 and 13.11 double-sided referral, built to the referral law spec; for readers still on trial the reward extends the trial rather than paying a credit. 14.14 "Send this workbook": a member gives a full workbook to someone who has never paid, one per quarter, author paid from a marketing pool. 6.4 author affiliate links with the higher share; benchmark range 20 to 33 percent recurring, or a longer referred trial. 6.6 and 9.1 organisation self-serve on with prices published (the wellbeing vendors hide theirs). 6.9 book affiliate links. 6.10 public programme pages for search. 6.11 weekly newsletter with one exercise, grown through paid cross-recommendations with author newsletters ($2 to $7 a subscriber, vendor figure). 2.11 public shelf and Theme pages indexed. 14.16 Book Club Hub listing and a "run this with your book club" page. 14.34 "Tell your minister" page with a template email and a demo link.

**Conversion.** 5.5 membership positioned after real use. 5.6 and 5.7 gifts: 1, 3, 6 or 12 months, custom message, recipient needs no card, nothing renews. 5.8 Theme bundles shown beside single prices, never as a strike. 5.12 true social proof above the threshold. 14.22 student price by email verification (a coupon and a help article). 14.25 pause membership for one to three months as the only save offer. Win-back emails to lapsed monthly members and one-off buyers only, timed to seasons; none to lapsed annual members.

**Library.** 2.7 grouped search. 2.8 request a title. 2.9 personalised rails by rule set, ranked by finish and retention. 2.10 author pages with follow.

**Reading.** 3.4 highlights and notes as marginalia in the right margin, paragraph-level keyboard highlighting, highlighter palette that looks like real markers, Markdown export with a template. 3.8 keyboard shortcuts: arrow focus marker, h highlight, n note, z undo, ? shortcut sheet, Cmd/Ctrl+K palette. 3.9 styled print and PDF through a print stylesheet and the browser's own Save as PDF, no render service, answers never leave the device. 3.10 "Then and now" with an optional one-tap check-in before a step, full history on the You tab, every entry deletable. 3.11 focus mode: paragraph dimming for reading, typewriter centring for long answers, optional. 3.12 companion book link per unit. Word-by-word highlight during read-aloud.

**Studio.** 8.1 and 13.13 Studio dashboard home. 8.2 workbook builder with a form, preceded by 14.31 an outline generator (five questions, a unit skeleton to edit). 8.5 one optional end-of-programme question. 14.30 author onboarding pack: a monthly live Q&A, five short videos, help by task. A one-page "how to write for Akana" spec published for authors and publishers.

**Organisations.** 9.2 group leader kit in the Alpha shape: per-unit talk, discussion guide, team training video, welcome slides, a session scheduler that writes to the group calendar. 9.3 monthly report email. 9.4 pilot for larger buyers activated by sales; small teams get a 14-day refund window instead. 9.5 church pricing by attendance band, not seats (RightNow Media model). 13.14 and 13.15 small-organisation plan: 5 to 50 seats, annual, seats added any time and reduced at renewal, a unique sign-up link members use instead of invitations. 14.37 a six-seat group licence at a pack price, matching how UK churches buy study material. VPAT-style accessibility conformance report.

**Platform.** 10.5 feature flags per cohort. 10.8 passkeys for readers. 13.3 passkey prompt after first sign-in. 13.19 Web Push for installed readers, daily step only, plus 14.7 a badge count ("1 step today") which needs no notification permission. PostHog EU as a fallback for cohort flags only if the in-house funnel proves thin, with the trust page updated. Supabase Realtime for "friend finished a step".

**Design.** 1.10 white-label tokens from the new system.

**Words.** 7.6 author bios in house style. 7.7 Theme intros. 7.8 help centre by task. 7.10 weekly editorial slot.

**Little things.** 12.2 finish certificate, private by default, no date. 12.3 send an exercise to someone, and a quote image from a chosen line (never an answer by default). 12.4 reminder at the reader's usual time. 12.5 seasonal collections shown as dates.

---

## Phase C: within twelve months

**Content and authors.** 8.3 AI-assisted first draft from a manuscript, with data rules and author sign-off. 8.4 author launch kit and 6.13 author-led launches: a dated slot in the weekly editorial, the free unit as the magnet, tracked review links for ten early readers. 14.32 author swaps: two authors on one shelf cross-feature each other's free unit. 14.33 opted-in reader export to the author's mailing list, consent captured. 8.7 publisher imprint pages and bulk import, with a pilot shape: ten titles, publisher picks the collection and territories, can withdraw, monthly statement. 6.5 embeddable "Try the first exercise" widget.

**Faith channel.** 6.12 Lent and Advent launches with a retention plan behind the surge (Hallow's Pray40 drove a 26 times download spike then went flat). Faith unit format: scripture, 300 to 500 words, a prayer or application. 13.16 church profile pages with insights only above five members. 13.17 parish-style annual partnership, plus a denominational offer: one link per body, a free month, a standing discount. 14.15 faith ambassador programme: invited readers hand out three-month codes that never convert to a charge. 14.36 custom library so an organisation adds its own material beside Akana titles.

**Organisations.** 6.7 reseller and partner page. 6.8 benefits marketplaces through two doors: an employee discount code and an HR-intermediary commission deal. 6.14 public API or export for learning systems, Enterprise column only. 9.6 single sign-on, Enterprise column only.

**Channels.** 14.17 Reading Well alignment: companion workbooks for titles already on the Reading Well lists (4.3 million library loans, recommended by health professionals), with clinician sign-off and no clinical claim. 14.18 host-read podcast sponsorship tested on two or three book and faith podcasts with an author's code. 14.19 library e-lending through OverDrive noted, not built.

**Audio.** 10.11 recorded audio pipeline. Cost ladder: Google Neural2 and Amazon Polly Neural at $16 per million characters, so a 60,000-character programme renders once for under $1 and is cached; ElevenLabs needs a paid plan for commercial use. Treat audio as a product, not a read-out.

**Return.** 4.10 year in review. 4.11 Web Push widened only if 13.19 earns it.

**Perks.** 12.7 printed workbook with the reader's answers. 12.8 anniversary note with a credit. 12.9 author office hours as a weekly optional slot. Minimap for long units on desktop.

---

## Services and switches, with costs found

| Service | Plan | Cost | Phase |
|---|---|---|---|
| Sentry | Developer | $0; Team $26 a month later | A |
| Better Stack or UptimeRobot | Free | $0 | A |
| Supabase | Pro plus PITR | $25 plus $100 a month | A |
| Resend | Pro | $20 a month for 50,000 emails | A |
| Vercel Image Optimization | Pro, per transformation | small if cover sizes are fixed | A |
| Stripe Link, Adaptive Pricing, Smart Retries | Dashboard toggles | $0 | A |
| Stripe Tax Basic | When VAT registered | 0.5 percent per transaction | B |
| Fonts | OFL faces, self-hosted | $0 | A |
| PostHog Cloud EU | Free tier | $0, fallback only | B |
| Text to speech | Google or Amazon neural | about $16 per million characters | C |

---

## The three design directions

All three share the reading floor in 13.9. The choice is canvas, colour and how loud the marketing site is, not the unit screen.

**Paper and ink.** Readwise Reader, Matter, Shortform. Borrow the 65-character line, chrome that hides while reading, margin notes, a highlighter palette that looks like real markers, a single column, and a question at the end of every section. Literata or Charis SIL for body, Source Sans or Libre Franklin for interface. Risk: can look like a tool; the marketing site must carry the warmth.

**Bright editorial.** Blinkist, Imprint, Headway. Borrow the single reserved brand colour, the sans-voice and serif-content split, illustrated format-coded covers with a preview line, illustration on editorial surfaces only, a two-column illustrated grid with one highlight colour for the selected card, the vertical path with Start on the active step, four tabs and a mini-player bar. Risk: Blinkist's own book warns its yellow and green fail contrast on white; test the shelf palette early.

**Quiet confidence.** Hallow, Fabulous, Finch. Borrow a designed dark canvas in deep blue with Light, Dark and Match device, the chapter metaphor, left-moving transitions, a button that pulses only when a prompt is active, one confetti moment at unit end and a larger reveal at programme end, and Home holding no more than three things. Risk: dark-first feels heavy on business and classics shelves; offer it as the night theme.

---

## Everything Crent supplies, in one place

Before Phase A can finish:

1. Pick a design direction from the three mock-ups (1.1).
2. Approve the cover style (1.2) and the marketing copy (1.8).
3. Name the first ten collections (2.3) and the ten "Start here" titles (2.5).
4. Prices and shares, D1 to D5: the two-share split (13.12), the shared membership price (6.1), the author payout cadence and floor (14.27).
5. Trial lengths: 14 days monthly, 21 annual recommended (13.5).
6. The launch promotion code (5.9).
7. The domain (A7) and the Resend sending domain (C5).
8. Google OAuth client (C26), Sentry and uptime accounts (10.3).
9. Approve PITR at $100 a month and Resend Pro at $20 a month.
10. House-record signer for the classics (C10).
11. Clinician sign-off route for Maya Vaughn Focus.
12. Lawyer and accountant engaged (C29) for L1 to L14 and A1 to A7, including the DMCC commencement date and Stripe Tax timing.
13. The three missing Vercel email variables: TEST_RECIPIENT, LEADS_NOTIFY_TO, EMAIL_REPLY_TO.

Before Phase B: organisation prices and terms (L7) including church attendance bands and the six-seat pack price, referral credit value and trial extension length, affiliate share within the 20 to 33 percent range or a bounty, the "Send this workbook" quarterly cap, theological reviewer (C11), approval of the streak rules and the companion concept.

Before Phase C: decision and budget for AI drafting, voice licence and vendor, print partner, denominational partners to approach, Reading Agency approach.
