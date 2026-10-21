# Phase B review list

Items Crent must confirm before launch. Each line is a decision already built, so a "no" means a change. Values and reasons are in AK_Phase_B_Decisions_2026-10-21.md. Tick each line when confirmed.

## Habit and persistence

- [ ] A pause keeps a streak for up to 3 days.
- [ ] "First shelf" means 3 finished programmes on one shelf.
- [ ] Words this month uses the word count method in the habit code, counted from the reader's own answers on the server. Only a count leaves it.
- [ ] A milestone image can be shared by tier 1 and 2 readers, with generic text that names no title.
- [ ] Item 14.4, the written review gate, is not done. It was left out on purpose.
- [ ] Usual-time reminders send at the time the reader chose and only for those who opted in.

## Reading tools

- [ ] The arrow keys move the paragraph marker. There is an off switch in the reading settings.
- [ ] Notes also highlight the passage they sit on.
- [ ] Print defaults to "without answers".
- [ ] The account JSON export does not yet include marks or then-and-now entries.

## Growth

- [ ] Referral links use no cookies. Attribution happens when the signed-in reader presses the button.
- [ ] STRIPE_COUPON_REFERRAL_FRIEND must be created in Stripe. While it is blank there is no 5 pound reduction on the two-person plans. Trial plans still get the extra days.
- [ ] A promotion code beats the referral coupon. Checkout takes one discount only.
- [ ] The 25 percent author share uses the net amount as its base, and is reversed on charge.refunded.
- [ ] Gift and bundle income is not in the royalty ledger.
- [ ] Workbook gifts (one a quarter from a paying member) sit at /send/<token>. Gift memberships sit at /gift/<token>. These are two different features and the routes were separated at integration.
- [ ] Book affiliate links: BOOK_AFFILIATE_TAGS is blank at launch unless you hold retailer tags.

## Conversion and billing

- [ ] Resuming a running pause bills a full month.
- [ ] Create the Stripe student coupon (50 percent, duration forever) and set STRIPE_COUPON_STUDENT. Until then the student price stays hidden.
- [ ] A student coupon wins over the referral coupon if a reader qualifies for both. A student cannot also use a code.
- [ ] WINBACK_ENABLED is off by default. It also needs a real POSTAL_ADDRESS.
- [ ] Bundle prices stay blank until staff set them. No bundle shows before then.
- [ ] The cancel flow now offers only a pause.

## Library and Studio

- [ ] The end-of-programme question is refused on safety-tier titles.
- [ ] Rail retention counts a step finished 7 or more days after it started.
- [ ] STUDIO_QA_DATES, STUDIO_QA_URL and STUDIO_VIDEOS are set for the author onboarding pack at /studio/start-here. Blank shows "Dates will be announced here", a note that the link will be sent, and no videos.
- [ ] The builder never publishes. Staff publish.
- [ ] Title requests store no email.

## Organisations

- [ ] The org_self_serve flag is off.
- [ ] VAT: organisation plans are exclusive of VAT, packs are inclusive.
- [ ] Church unlimited means 10000 seats.
- [ ] A pilot has a minimum of 51 seats.
- [ ] A pack licence lasts 50 years.
- [ ] There is no pilot-expiry email.
- [ ] STRIPE_PRICE_ORG_SMALL_YEARLY: set it if you want a pinned price, otherwise the app uses the table amount in test mode only.

## Public pages

- [ ] SEARCH_INDEXING=on at launch. While blank every public page stays noindex.
- [ ] Set NEWSLETTER_SENDING_DOMAIN and NEWSLETTER_BATCH_SIZE.
- [ ] The newsletter holds until EMAIL_MODE=live and a real POSTAL_ADDRESS are set.
- [ ] The Book Club Hub excludes wellbeing titles, demo titles and titles with no first unit.
- [ ] Bio style errors flag the author but do not block saving.

## Platform

- [ ] Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT for web push. Blank turns push off quietly.
- [ ] Set QUOTE_IMAGE_SECRET for quote images. Blank hides "Make a quote image" and the endpoint answers 404.
- [ ] Feature flags default off. Turn on in /admin/flags: reader_passkeys, web_push, programme_friends.
- [ ] Passkeys are a second check, not passwordless sign-in.
- [ ] Exercise sending covers only the free-unit exercises of tier none titles.
- [ ] No analytics events were added for any Phase B feature.

## New environment variables

All are optional and the feature degrades quietly while blank.

- [ ] STRIPE_PRICE_ORG_SMALL_YEARLY
- [ ] STRIPE_COUPON_REFERRAL_FRIEND
- [ ] BOOK_AFFILIATE_TAGS
- [ ] STRIPE_COUPON_STUDENT
- [ ] STUDENT_EMAIL_SUFFIXES (blank uses .ac.uk and .edu)
- [ ] WINBACK_ENABLED
- [ ] STUDIO_QA_DATES
- [ ] STUDIO_QA_URL
- [ ] STUDIO_VIDEOS
- [ ] SEARCH_INDEXING
- [ ] NEWSLETTER_SENDING_DOMAIN
- [ ] NEWSLETTER_BATCH_SIZE
- [ ] VAPID_PUBLIC_KEY
- [ ] VAPID_PRIVATE_KEY
- [ ] VAPID_SUBJECT
- [ ] QUOTE_IMAGE_SECRET

## Other things found at integration

- [ ] Four new daily or monthly crons are in vercel.json: membership upkeep, win-back, org monthly report and newsletter send. Check CRON_SECRET is set wherever they run.
- [ ] Migrations 0049 to 0066 are applied by supabase/staging/phase-b_apply_0049_0066.sql. Run it on staging first, after a backup. Nothing has been applied anywhere yet.
- [ ] The workbook-gift preview function was renamed workbook_gift_preview in migration 0053 so it does not clash with the gift membership preview in 0054.
- [ ] The Stripe webhook now runs gift and bundle handling first, then the existing handler, then the growth handler. Test one gift purchase, one bundle purchase and one referral in the Stripe sandbox before launch.
