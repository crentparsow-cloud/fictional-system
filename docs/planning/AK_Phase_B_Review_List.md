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
- [ ] 35 analytics events for Phase B features were added in the hardening round (PR 8). Check the event list in docs before launch.

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
- [x] Migrations 0049 to 0066 were applied to staging and production on 22 October 2026, 0069 and 0070 on 30 October, and 0067, 0068, 0071 and 0072 on 7 November. Both databases are at 0072.
- [ ] The workbook-gift preview function was renamed workbook_gift_preview in migration 0053 so it does not clash with the gift membership preview in 0054.
- [ ] The Stripe webhook now runs gift and bundle handling first, then the existing handler, then the growth handler. Test one gift purchase, one bundle purchase and one referral in the Stripe sandbox before launch.

## Demo period switches to reverse before launch

These were turned on for the demo period only (Crent, 30 October 2026). Each must be reversed before launch.

- [ ] Demo titles fully open to signed-in readers. Make app.demo_fully_open() return false in a new migration (it is defined in 0070_demo_fully_open.sql) and make demoFullyOpen() in apps/web/lib/demo-period.ts return false. Update the tests in supabase/tests/0070_demo_fully_open.sql and apps/web/lib/demo-period.test.ts to match. Demos then show only their free first part again, with "Demo titles cannot be bought".
- [ ] The prepared switch for the item above is supabase/launch/demo_period_off.sql. Copy it into the next numbered migration at launch; it is not applied by the migration runner.
- [ ] themes.min_books is set to 1 on staging and production. Set it back to the launch value.
- [ ] 135 demo and Maya Vaughn titles are set live (115 demos, of which 18 are faith titles with no theological review, and 20 Maya Vaughn titles). Decide which stay live at launch and take the rest down.
- [ ] The programme_friends flag is on in staging. Decide whether it stays on before production.

## Findings from the external static audit (received 31 October 2026)

An outside reviewer read the core code (sealing, answers, checkout, webhook, tenancy, validator) without running anything. Four findings stand and are not yet closed. The rest of the report either confirmed the design or described work done since (Phase B, hardening, Stripe test purchases, publishing).

- [ ] Accessibility: nobody has done the manual keyboard and screen reader pass on the signed-in player (docs/ACCESSIBILITY.md). Until it is done and the defects closed, /trust must not claim WCAG AA.
- [ ] Shared identity on tenant hosts (F-133) is not built. Tenant hosts serve the catalogue and locked pages only, with no sign-in or checkout. Decide the route (sign in on the tenant host with its own cookie, or hop to the Akana apex and back) before selling any white-label deal.
- [x] Progress durability: done on 7 November 2026 (migration 0071 and apps/web/lib/progress-client.ts, PR 11). One-off kinds are stored once and client writes queue and retry on the device.
- [ ] Runtime headers: the Content-Security-Policy header was confirmed at runtime on the hardening-2 preview on 7 November. Still to confirm on the live site in a browser: the auth cookies are __Host- scoped.
- [ ] Refund path: charge.refunded revokes entitlement in code, but a refund has not been exercised end to end with a test card. Run one refund and one cooling-off cancel in the Stripe sandbox alongside the approved live test purchase.

## Syracuse Program review of 21 November 2026

The report is the project doc claude/akana-syracuse-review-2026-11-21.md. The code fixes are on branch review-fixes (migrations 0074 to 0077). These are the items that code cannot close.

### Settings only Crent can change

- [ ] Supabase production, Authentication, URL Configuration: remove `https://akana-one.vercel.app/**`, the preview wildcard and the localhost entry. Keep the one exact callback (H4).
- [ ] Supabase production, Authentication, Sessions: set an inactivity timeout and a time box (M6).
- [ ] Supabase production, Authentication, Attack Protection: turn on a CAPTCHA with a non-puzzle route, and set its keys in the app (M5).
- [ ] Vercel: move the team to Pro before launch, set a spend limit with pause, and give production its own CRON_SECRET (M33). Hobby allows no spend cap and no test traffic.
- [ ] Stripe: add the dispute, refund.failed and payout.failed events to the two webhook endpoints. Until then the new handling does nothing (M10, L7).
- [ ] Resend: create the webhook to /api/email/resend for bounces and complaints and set RESEND_WEBHOOK_SECRET (M17).
- [ ] Set SECURITY_CONTACT (M28), EMAIL_REPLY_TO as the support address (M12), and NEXT_PUBLIC_COMPANY_NUMBER once the company exists.
- [ ] Backups: do the restore test and the off-site copy of uploaded files (L8).
- [ ] GitHub: turn on required status checks for main, and Dependabot alerts (M27).

### Decisions and paperwork, with the solicitor and accountant

Drafts are in docs/compliance. All are unsigned.

- [ ] Sign the data protection impact assessment before wellbeing titles take answers from anyone outside the team (H5).
- [ ] Adopt the breach plan: name the roles and choose where the log is kept (H6).
- [ ] Legal pages: company name, number, address and ICO registration are stated as fact today. Correct them or make them true (M12, M25). Gift and bundle terms (M13).
- [ ] Decide: the age gate (M32), win-back email opt-out (M24), whether Google sign-in, Sentry and web push are on at launch and named in the notice (M22), whether Ireland opens at launch (M25), gift emails to people who are not users (M31), the cookie table (M23).
- [ ] The solicitor's written view on the Online Safety Act (M15). The accountant's view on HMRC platform reporting for author payouts (M16).

### Decisions built into the fixes, to confirm

- [ ] Staff actions in the database now need a second-factor session and a row in platform_roles. A staff member with only the claim is refused everywhere, at once.
- [ ] A reader who has turned on two-step sign-in must pass it before answers, marks and export will load.
- [ ] Sign-in and export are refused when the rate limit counter cannot be kept. An outage of the counter stops sign-in until it is fixed.
- [ ] A dispute suspends what the payment gave until it is won. A cooling-off cancel takes back the referrer's reward.
- [ ] One live membership per reader. A second checkout that completes is cancelled and refunded by the webhook.
- [ ] Erasing an account removes its uploaded files only where the person is or was a member of that organisation.
- [ ] Retention periods are off until set. Money, consent, deletion and staff-privilege audit rows are never pruned. A legal hold stops every prune.

### Still open in code

- [ ] Nonce-based content security policy (M26). Zod 4 upgrade, assessed in docs (M30). Share previews on pages other than workbooks (L11).

### Before launch at tier 4

- [ ] An outside, human-led penetration test. The manual accessibility pass. A signed-out probe of the live app once the plan permits testing.

