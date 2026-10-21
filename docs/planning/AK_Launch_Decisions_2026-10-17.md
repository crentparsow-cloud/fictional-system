# Akana launch decisions, 17 October 2026

Made on 17 October 2026 at Crent's request, so that the remaining pre-launch content and copy decisions are settled before he reviews them. Each section below states what was decided, why, and where it lives in the build. Where his judgement matters there is a "Crent to confirm" line. Nothing here adds a figure the repository does not already hold. Build list items are from docs/planning/AK_Build_List_Final.md.

## 1. The first ten collections (item 2.3)

The collections are data. Migration 0048_launch_collections.sql writes them into public.collections and public.collection_items (the tables from 0043), as live rows. It can be run twice without changing anything, and a code that is not in the catalogue is skipped. The test is supabase/tests/0048_launch_collections.sql. It stands up stub titles, runs the file twice and checks the shape, the order and the house words.

Only titles that exist in the catalogue are used. Every title is tier none, so no collection holds a wellbeing or mental health title, and no collection counts days. Each collection has five titles. The four classics that fit lead their collection. Demo titles follow them and are labelled Demo on every card, because they cannot be bought.

1. **Using your time well.** "Plans for the hours you have. Starts with Arnold Bennett's evening plan, then short workbooks on priorities, mornings and meetings." Titles: How to Live on 24 Hours a Day (AK-QCRRE), The Unhurried To-Do List, Deep Mornings, The Agenda on a Postcard, The Tidy Week.
2. **Ideas for how to live.** "Two classics, Marcus Aurelius and Samuel Smiles, with workbooks on small rules, big decisions and what you would like to pass on." Titles: Meditations (AK-FN9KB), Self-Help (AK-7SWKN), Small Rules for Ordinary Days, The Kitchen-Table Decision, The Small Legacy.
3. **Money, plainly.** "Franklin's sayings on thrift, then workbooks on budgets, saving and steady plans. General information, not financial advice." Titles: The Way to Wealth (AK-3TQX1), Budgets for Busy Households, A Little Each Month, Lumpy Income, Steady Plans, Your Workplace Pension, Explained Slowly.
4. **Family routines.** "Charlotte Mason's short lessons at home, then workbooks on shared meals, screens and house rules." Titles: Home Education (AK-B9XEG), Ubuntu at the Dinner Table, Screens, Sleep and Sundays, The Teenager on the Stairs, Homework Without the War.
5. **Study and learning.** "Workbooks on planning revision, taking notes and fitting study around your life, and on helping someone else learn." Titles: Exam Season, One Week at a Time; Notes That Actually Help; Back to the Books at Thirty-Five; One Learner at a Time; The Sunday Morning Circle.
6. **Working with people.** "Workbooks on giving feedback, starting with a new team and making decisions that others can follow." Titles: Feedback Over Coffee, Your First Team, Decisions in the Open, Teams That Carry It Together, Meetings Where Everyone Speaks.
7. **Moving on at work.** "Workbooks for preparing a change of work, a pay conversation, a first mentoring relationship or a short talk." Titles: A New Trade at Forty, Talking Money with Your Manager, Your Career in Five Stories, Mentoring Someone New, Five Minutes at the Front of the Room.
8. **Partners and friends.** "Workbooks on saying hard things kindly, sharing the load at home and keeping in touch with people who matter." Titles: Gently and Straight, The Long Marriage Notebook, Two Calendars, One Home, Splitting the Load at Home, Friends Worth Calling.
9. **Small business basics.** "Plain workbooks on keeping a cash book, knowing your regulars, taking orders and hiring a first person. Not financial or legal advice." Titles: The Open-Air Ledger, Customers Who Come Back, Selling Beyond the Street, Hiring Your First Five, Selling Like a Good Neighbour.
10. **Everyday know-how.** "Workbooks for a first flat, cooking for one, small repairs, spotting scams and simple spreadsheets." Titles: First Flat, First Bills; Supper for One, Most Nights; Fix It Before You Call Someone; Pause Before You Click; Spreadsheets for the Kitchen Table.

An eleventh row, Start here, is described in section 2. It is not one of the ten.

Why these: they follow the shelves with the most titles and avoid the three with a rule against them. Mind and Mood waits for the clinician. Faith and Spirituality waits for the theological reviewer (C11, Phase B). Health and Body holds wellbeing titles only. The finance and business lines carry a "not advice" sentence because those two genres have an advice guardrail in the genre data.

Three things to know. A collection shows on Explore only when at least three of its titles are visible, so a collection whose demo titles are still unpublished on production would be hidden, not broken. The seed marks the five classics in_review, and they need to be live to be bought. Staff can reorder or rename a collection afterwards in /admin/collections.

Crent to confirm: the ten names and lines, and that no wellbeing title sits in any collection at launch.

## 2. The ten Start here titles (item 2.5)

There is no Start here column in the database, and the cover renderer never receives a Start here flag from the covers route. Rather than add schema the night before launch, Start here is a collection with the slug start-here, sort 0, so it is the first tile in the collections row on Explore. This is the same shape the Today card uses (the shortest complete title with no wellbeing tier, lib/today/suggest.ts), so the two agree. The order is the same rule: buyable classics first, shortest programme first, then fully written demo titles.

1. The Way to Wealth (AK-3TQX1). Four weeks, the shortest classic, and the title already used for the signed-out try.
2. How to Live on 24 Hours a Day (AK-QCRRE). Six weeks, plain and practical, on the Work and Career shelf.
3. Self-Help (AK-7SWKN). Six weeks, the Personal Growth shelf, and it ties with Bennett on length.
4. Home Education (AK-B9XEG). Eight weeks, the only classic on the Family and Parenting shelf.
5. Meditations (AK-FN9KB). Twelve weeks, the longest of the five, so it comes last of the classics.
6. First Flat, First Bills (AK-4Q9CB). Fully written, six weeks, the Learning and Skills shelf.
7. Friends Worth Calling (AK-BJ8GJ). Fully written, six weeks, the Love and Relationships shelf.
8. Lumpy Income, Steady Plans (AK-MBFT8). Fully written, six weeks, a second Money title for a reader who is self-employed.
9. Small Rules for Ordinary Days (AK-RPT7D). Fully written, six weeks, a second Personal Growth title.
10. The Open-Air Ledger (AK-TJWHK). Fully written, six weeks, the small business strand of Work and Career.

Titles 6 to 10 are demo titles and cannot be bought. They are included because they are the fully written ones with no wellbeing tier. They give a reader something real to open on the shelves the classics do not cover.

Four shelves have no Start here title. Mind and Mood waits for the clinician (7.1b). Health and Body, Faith and Spirituality, and Creativity and Making have no fully written title that is safe to put first. So item 2.5's "one per shelf" is met for six of ten shelves, not ten.

The build list calls these "free complete" titles. That is not what the product does. Every classic has one free unit (free_units is 1 in each workbook file), and the rest is paid. The collection line says so: "Each lets you read the first week before you decide." Making whole titles free would cut against the hard paywall evidence in the build list (10.7 percent trial to paid against 2.1 percent for freemium).

Crent to confirm: the order, and that Start here means a free first week, not a free title.

## 3. Marketing copy sign-off (item 1.8)

The home page, pricing page, Publish page, Organisations, White label, Trust and the code page were read as built. The copy is in good order. Home, pricing, organisations and white label needed no change: no em dashes, no countdowns, no struck-through prices, "free" only where nothing is paid (the first week or first unit, and support lines), no US spellings, and no outcome claims. There is no separate About page in the app; Organisations, White label and Trust carry that job.

Seven changes, all on the Publish page and its enquiry form:

1. Step 1 said "We reply within [enquiry response time]". A placeholder was live. It now says "We reply by email".
2. The success message in app/publish/options.ts had the same placeholder. It now says "Thanks. We will reply by email."
3. The note under the enquiry form had the same placeholder. It now says "We reply by email."
4. Step 4 said authors are "paid every Friday for the week before". That does not match the build. A sale is paid on the first Friday after its 14 day refund window ends (migration 0046). It now says so.
5. The "Paid every Friday" promise said "Each week's sales, paid on the Friday after". It now says: "A sale is paid on the first Friday after its 14 day refund window. Balances under £10 carry forward."
6. The headline said "a workbook readers finish", an outcome claim with no completion data behind it. It now reads "Turn your book into a guided workbook".
7. "Across the eleven shelves, from wellbeing to life skills" was wrong; there are ten shelves and life skills is a genre. It now reads "Across the ten shelves, from Mind and Mood to Creativity and Making."

Left alone on purpose. The Trust page still reads "[company details to follow]" for the company name, number and address. That needs Crent's data (gate O1) and cannot be filled from here, so it is a launch blocker on his list below. The pricing page says prices include VAT. That is how the prices are stored, but whether Akana is VAT registered at first sale is the accountant's call. The Publish response time is now unstated; if Crent wants a promise such as "within two working days", he should name it.

Crent to confirm: the seven changes, and whether to promise a response time to authors.

## 4. Cover style (item 1.2)

Confirmed: Direction B, bright editorial, is the launch style. It is the default in lib/design/directions.ts and lib/design/active.ts (blank NEXT_PUBLIC_DESIGN_DIRECTION means bright-editorial), the day log of 15 October records it as the default design direction, and the Satori renderer behind /covers and /og draws it. Format-coded covers are in place: one, two or three bars for 4, 8 and 12 weeks, a collection mark and a Start here mark, with a one-line preview. The design tests, which include the cover spec and the contrast checks, pass.

One gap is recorded, not fixed. The covers route does not yet pass the Start here flag, so a title in the Start here collection shows its programme length bars, not the Start here mark. Collections use their own tile on Explore, which is fine at launch. It is a small change after launch.

Crent to confirm: the style, by looking at /dev/kit and one cover on a phone.

## 5. Launch promotion code (item 5.9)

FIRSTWORKBOOK exists in the Stripe sandbox (promo_1UQss1BLnY1qMMTEgnh6O8lS, coupon jZhwRtQp). The code path accepts it. Nothing in the repository names the code. The /code page and both checkout routes look any promotion code up in Stripe by name, case does not matter, and use it only when Stripe says it is active, not expired, not used up and on a valid coupon.

What the code path enforces. The workbook checkout looks the code up again and pins it to the session, and refuses with "This code does not apply to that price" if the coupon has a minimum the price does not meet or a fixed amount in another currency. The membership checkout pins it too, without that price check, so the coupon's own settings in Stripe decide what it can touch. A first-time-only restriction is shown to the reader on the /code page in the words "This code is for a first payment with us only." The page names the discount ("FIRSTWORKBOOK takes X% off.") and then the total the reader pays.

What the terms are. The terms live in the coupon, and the repository does not record them. The day log says only that the code exists. The percentage or amount, the duration, the redemption limit, the expiry, the first-time restriction and whether it is limited to workbook products are therefore not stated anywhere in the code or docs. They must be read in the Stripe dashboard before the code is announced. Recommended settings, all to be set in Stripe: a percentage or amount off a single workbook, duration once, first-time customers only, restricted to the workbook products so it cannot discount a recurring membership for good, and no expiry unless a date is published.

Whether the wording is lawful. As built, yes. The /code page says "The price shown is the price you pay", shows the paid total in words, and never shows a "was" price, a strike-through or a countdown. That matches the DMCC pass (R3 in docs/legal/DMCC_PASS.md). Wording to avoid in any announcement: "free", a countdown, "last chance", a "normally" price. If the code has an end date, state the date. If it is limited to the first workbook, say so beside the code, because the page only says so after the code is typed. This is an engineering reading, not legal advice. The lawyer signs it off with the rest.

Not yet tested: the day log records that FIRSTWORKBOOK was not applied on the sandbox purchase run. Someone should buy one workbook with it in the sandbox before launch.

Crent to confirm: the discount, the duration, who can use it, and the end date if any.

## 6. Only Crent or his advisers can settle these before launch

This is a checklist.

- [ ] Domain: choose and buy it (A7), then point Vercel at it.
- [ ] Resend sending domain: verify it (C5) so receipts and reminders send from Akana.
- [ ] Lawyer engaged on the terms (C29, L1 to L14), including the DMCC commencement date and the draft reader terms, privacy notice, cookie statement and refund policy.
- [ ] Accountant engaged (A1 to A7): VAT registration, the VAT rate for an interactive workbook, and whether prices stay VAT inclusive at first sale.
- [ ] Stripe Tax: switch on when VAT registration happens, on the accountant's timing.
- [ ] Stripe live activation: switch to the live account, create the four live membership prices, and re-enable the live webhook endpoint at go-live. Live payouts stay locked until the go-live meeting.
- [ ] Google OAuth: create the client and set the secret on production, then turn the Google provider on in Supabase, staging first.
- [ ] Clinician route for Maya Vaughn Focus: who signs it off, so that Mind and Mood can have a Start here title.
- [ ] House-record signature for the five classics: Crent signs the review line in each record.
- [ ] Company details for the Trust page and the terms (gate O1), and the real postal address (O3).
- [ ] Supabase point-in-time recovery at $100 a month: approve the spend.
- [ ] Resend Pro at $20 a month: approve the spend.
- [ ] Sentry: create the EU project and set the DSN values, plus an uptime monitor.
- [ ] The three Vercel email variables: TEST_RECIPIENT, LEADS_NOTIFY_TO, EMAIL_REPLY_TO.
- [ ] The Stripe dashboard terms of FIRSTWORKBOOK, read and confirmed before the code is announced.
- [ ] Apply migrations 0036 to 0048 to production, with Crent's go-ahead and through the SQL editor, not the connector.
