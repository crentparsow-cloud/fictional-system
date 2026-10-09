# Akana build list, final

Written 9 October 2026 from AK_Build_List_v2.md and Crent's decisions of the same day. This replaces v2 as the working list. v2 stays as the record of where each idea came from. Item numbers below are v2 numbers so the two can be read side by side.

## Decisions recorded on 9 October

- Phase A is fully front-loaded. The first sale follows the redesign, Explore, onboarding, Today and shared membership. About six weeks of agent work plus Crent's items.
- Visual identity: three directions mocked up on the same four screens (paper and ink, bright editorial, quiet confidence). Crent picks one.
- First sellable title: the five classics first, Maya Vaughn Focus when the clinician signs off.
- Shared membership: two people at about 1.5 times a single membership.
- Companion that grows: Phase B.
- Streaks and daily goals: Phase B, opt-in, never on mental health shelves.
- AI-assisted author drafting: Phase C.
- Audio: browser voice in Phase A. Recorded audio decided after launch.
- Web only throughout. No native app.

## Rules that apply to every item

- Mental health shelves (tier 1 and 2 titles): nothing counts days, nothing expires, nothing nags, no streaks, no countdowns. A lint enforces this (11.3).
- Every other shelf may use habit mechanics, but they stay calm and honest: opt-in, free pause, no fake urgency, no protection for sale.
- DMCC Act throughout: full price on every invitation to buy, no false scarcity, true counts only, reviews from verified buyers only (13.7).
- UK English, short sentences, one voice across the interface (7.4).
- No third-party trackers. Analytics are first-party and id-only (10.4).

---

## Phase A: before the first sale

Ordered as the build should run. Each step lists its items, the effort and what Crent supplies. Steps 0 to 2 cannot slip; everything else paints onto them.

### Step 0. Measure and sign in

| Item | What | Effort | Crent |
|---|---|---|---|
| 10.4, 13.20 | First-party analytics: funnel counts extended to screens and drop-offs, ids only. Built first so every later step can be measured | M | |
| 13.1, 10.7 | Google One Tap with account linking by verified email | S | OAuth client (C26) |
| 13.2 | Optional two-factor for readers in the You tab, with recovery codes | S | |
| 10.3 | Error tracking and uptime checks | S | Account |
| 10.9 | Backups verified and one restore drill | S | |

### Step 1. Visual identity and design system

| Item | What | Effort | Crent |
|---|---|---|---|
| 13.8, 1.1 | Three design directions on the same four screens (Home, Explore, workbook page, a unit). Crent picks one. Then palette, type pairing, illustration style and motion rules | L | Picks a direction |
| 13.9 | Reading floor regardless of direction: warm canvas, reading serif, 65-character line, generous margins, one accent colour | S | |
| 1.2 | Cover system per shelf so titles from one house look like siblings | M | Approves the style |
| 1.3 | Ten shelves, each with a colour, an icon and a short line, used everywhere | S | |
| 1.4 | Serif for workbook body, sans for interface, sizes that honour the reader's text setting | S | |
| 1.5 | Dark mode designed, not inverted | S | |
| 1.6 | Motion rules: transitions, card lift, save confirmation, finish sequence. Reduced motion honoured | M | |
| 1.7 | Component library at /dev/kit so every screen uses the same parts | M | |
| 1.9 | Open Graph image per title from the cover system | S | |

### Step 2. Something to sell

| Item | What | Effort | Crent |
|---|---|---|---|
| 7.1 | Full content for the five live classics. One readable, sellable title on day one | L (content) | House-record signer (C10) |
| 7.1b | Maya Vaughn Focus moved to sellable when the clinician signs off | S after sign-off | Clinician |
| 3.2 | Working buttons on the public page: Buy opens checkout, Start opens the free unit | S | |
| 7.9 | Policy: a title shows in the library only when its first unit is complete | S | |
| 8.6, 13.12 | Real figures in the Studio. Two author shares: higher on author-link sales, lower on marketplace sales | S | D1 to D5 |
| 5.9 | Public "first workbook" promotion code for launch | S | Sets the code |

### Step 3. Explore and the library

| Item | What | Effort | Crent |
|---|---|---|---|
| 2.1 | Explore in the Blinkist order: shelf tiles with colour and icon, then rails (New this week, Short programmes, Most started, Because you read X), then Themes | M | |
| 2.2 | Shelf landing pages with Themes, a featured title, an editor's line and the count | M | |
| 2.3 | Collections across shelves with a cover and a line | M | Names the first ten |
| 2.4 | Programme length as a filter and a badge on every card | S | |
| 2.5 | One free complete "Start here" title per shelf | S + content | Picks the ten |
| 2.6 | Related titles on every workbook page | S | |
| 2.12 | My workbooks with status chips, sortable | S | |

### Step 4. Top of the funnel

| Item | What | Effort | Crent |
|---|---|---|---|
| 5.1 | Onboarding quiz before sign-in: three questions landing on three titles, one startable without an account | M | |
| 5.2 | Try the first unit signed out; answers held on device, saved on sign-in | M | |
| 5.3 | "Week 1 is free, no card" on every card and page | S | |
| 13.4 | Membership offered inside onboarding, after the quiz and first exercise, price visible | S | |
| 13.5 | Membership trial of 14 to 21 days, card required, reminder before first charge, cancel in two taps | S | Trial length |
| 13.18 | iOS install guide after the second visit; sign-in that recovers in one tap inside the installed web app | S | |
| 10.1 | PWA install: manifest, icons, prompt after second visit | S | |

### Step 5. The reason to return

| Item | What | Effort | Crent |
|---|---|---|---|
| 4.1 | Today as the daily surface: one step of about ten minutes plus one small extra | M | |
| 4.2 | Weekly rhythm: "Week 3 of 8. Two steps this week." Counts the work, not the days | S | |
| 4.3 | Daily review of your own words: one earlier answer each morning with an optional "still true?" | M | |
| 4.7 | Email reminders on the reader's chosen day and time, naming the step | S | |
| 4.8 | Calendar subscription for the whole programme | S | |
| 4.9 | Pick-up prompt after a gap, no guilt line | S | |
| 12.10 | Bookmarkable /today that opens straight to the step | S | |

### Step 6. Growth at launch

| Item | What | Effort | Crent |
|---|---|---|---|
| 6.1 | Shared membership for two at about 1.5 times single, separate sealed answers | M | Confirms price |

### Step 7. Reading and working

| Item | What | Effort | Crent |
|---|---|---|---|
| 3.1 | Workbook page redesigned: cover hero, what you will do, how long, a sample exercise to try in place, author, then price and start | M | |
| 3.3 | Unit map: the whole programme as a path showing done, today and locked | M | |
| 3.5 | Read aloud on every screen with the browser's voice | M | |
| 3.6 | Calm session estimate at the top of a unit | S | |
| 3.7 | Resume card on Home to the exact field | S | |

### Step 8. Selling surfaces

| Item | What | Effort | Crent |
|---|---|---|---|
| 1.8 | Marketing site redesign: home, Publish, Organisations, Pricing, real screenshots, a demo title to try signed out | L | Approves copy |
| 5.4 | Pricing page in plain words with "which should I pick" | S | |
| 5.10 | Trust strip on checkout: sealed answers, no trackers, 14-day refund, cancel in two taps | S | |
| 5.11 | Receipts in Akana's design | S | |
| 10.6 | Resend sending domain and templates in the new design | S | Domain (A7, C5) |

### Step 9. Platform

| Item | What | Effort | Crent |
|---|---|---|---|
| 10.2 | Edge caching for public pages and covers; image optimisation | M | |
| 10.10 | Content pipeline: validate, version and publish a JSON to staging then production in one command | M | |

### Step 10. Words

| Item | What | Effort | Crent |
|---|---|---|---|
| 7.4 | Interface copy pass in one voice | M | |
| 7.2 | Card lines rewritten as outcomes | M | |
| 7.3 | "What you will have at the end" on every workbook page | S + content | |
| 7.5 | Empty states that teach | S | |
| 12.1 | Author welcome note at the start of each programme | S + content | |

### Step 11. Trust and law

| Item | What | Effort | Crent |
|---|---|---|---|
| 11.1 | Trust page rewritten as a comparison | S | |
| 11.5 | Accessibility manual pass and a public statement | M | |
| 13.7 | DMCC compliance pass, auditable | S | Lawyer (L1 to L4) |
| 11.4 | Lawyer and accountant reviews (L1 to L14, A1 to A7) | | Engages them (C29) |

### Phase A totals

Agent work: roughly 10 S items a week plus the M and L items gives about six weeks. Crent's items are listed in one place at the end.

---

## Phase B: first 90 days after launch

Grouped, not ordered. Order them by what the Phase A analytics show.

**Habit and persistence.** 4.4 and 13.6 streaks and daily goals, opt-in, free pause, rules written and enforced by lint. 4.5 milestone marks with a face. 4.6 the companion that grows, no decay. 11.2 streak and reminder settings one tap from Today. 11.3 the mental health lint. 12.6 "You wrote 1,200 words this month".

**Growth.** 6.2 do a programme with a friend. 6.3 and 13.11 double-sided referral with a small credit ledger. 6.4 author affiliate links with the higher share. 6.6 and 9.1 organisation self-serve flag on with three plans priced. 6.9 book affiliate links through /go/. 6.10 public programme pages for search engines. 6.11 weekly newsletter with one exercise. 2.11 public shelf and Theme pages indexed.

**Conversion.** 5.5 membership positioned after real use. 5.6 and 5.7 gift a workbook and gift membership. 5.8 Theme bundles. 5.12 true social proof above the threshold.

**Library.** 2.7 grouped search. 2.8 request a title. 2.9 personalised rails by rule set. 2.10 author pages with follow.

**Reading.** 3.4 highlights and notes. 3.8 keyboard shortcuts. 3.9 styled print and PDF with the reader's answers. 3.10 "Then and now". 3.11 focus mode. 3.12 companion book link per unit.

**Studio.** 8.1 and 13.13 Studio dashboard home. 8.2 workbook builder with a form. 8.5 one optional end-of-programme question for authors.

**Organisations.** 9.2 group leader kit. 9.3 monthly report email. 9.4 pilot offer. 9.5 church band pricing public. 13.14 and 13.15 pricing band and small-organisation plan shape.

**Platform.** 10.5 feature flags per cohort. 10.8 passkeys for readers. 13.3 passkey prompt after first sign-in. 13.19 Web Push for installed readers, daily step only.

**Design.** 1.10 white-label tokens from the new system.

**Words.** 7.6 author bios in house style. 7.7 Theme intros. 7.8 help centre by task. 7.10 weekly editorial slot.

**Little things.** 12.2 finish certificate. 12.3 send an exercise to someone. 12.4 reminder at the reader's usual time. 12.5 seasonal collections.

---

## Phase C: within twelve months

**Content and authors.** 8.3 AI-assisted first draft from a manuscript, with data rules and author sign-off. 8.4 author launch kit. 6.13 author-led launches. 8.7 publisher imprint pages and bulk import. 6.5 embeddable "Try the first exercise" widget.

**Faith channel.** 6.12 Lent and Advent 30-day launches. 13.16 church profile pages. 13.17 parish-style annual partnership.

**Organisations.** 6.7 reseller and partner page. 6.8 employee perk listings. 6.14 public API or export for learning systems. 9.6 single sign-on.

**Audio.** 10.11 recorded audio pipeline with a licensed voice, if the browser-voice usage data justifies the cost.

**Return.** 4.10 year in review. 4.11 Web Push widened beyond the daily step only if 13.19 earns it.

**Perks.** 12.7 printed workbook with the reader's answers. 12.8 anniversary note with a credit. 12.9 author office hours.

---

## Not in the plan

Nothing from v2 is dropped outright. Two items changed shape: 4.11 is narrowed by 13.19, and 10.7 is folded into 13.1. Recorded audio (10.11) and the companion (4.6) are deferred by decision, not removed.

---

## Everything Crent supplies, in one place

Before Phase A can finish:

1. Pick a design direction from the three mock-ups (1.1).
2. Approve the cover style (1.2) and the marketing copy (1.8).
3. Name the first ten collections (2.3) and the ten "Start here" titles (2.5).
4. Prices and shares, D1 to D5, including the two-share split (13.12) and the shared membership price (6.1).
5. The membership trial length, 14 to 21 days (13.5).
6. The launch promotion code (5.9).
7. The domain (A7) and the Resend sending domain (C5).
8. Google OAuth client (C26) and an error tracking account (10.3).
9. House-record signer for the classics (C10).
10. Clinician sign-off route for Maya Vaughn Focus.
11. Lawyer and accountant engaged (C29) for L1 to L14 and A1 to A7.
12. The three missing Vercel email variables: TEST_RECIPIENT, LEADS_NOTIFY_TO, EMAIL_REPLY_TO.

Before Phase B: organisation prices and terms (L7), referral credit value, affiliate accounts, theological reviewer (C11), approval of the streak rules and the companion concept.

Before Phase C: decision and budget for AI drafting, voice licence cost, print partner.
