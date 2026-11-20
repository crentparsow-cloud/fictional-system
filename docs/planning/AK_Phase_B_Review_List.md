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

- [ ] TENANT_SIGN_IN (F-133). Set to 1 to let tenant hosts offer reader sign-in. Blank means off everywhere.
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
- [x] Shared identity on tenant hosts (F-133): decided on 20 November 2026. The reader signs in on the tenant host. Built behind a flag on branch f133-tenant-signin (migration 0073), off by default, not applied anywhere. The decisions to confirm are under "Tenant sign-in (F-133)" below.
- [x] Progress durability: done on 7 November 2026 (migration 0071 and apps/web/lib/progress-client.ts, PR 11). One-off kinds are stored once and client writes queue and retry on the device.
- [ ] Runtime headers: the Content-Security-Policy header was confirmed at runtime on the hardening-2 preview on 7 November. Still to confirm on the live site in a browser: the auth cookies are __Host- scoped.
- [ ] Refund path: charge.refunded revokes entitlement in code, but a refund has not been exercised end to end with a test card. Run one refund and one cooling-off cancel in the Stripe sandbox alongside the approved live test purchase.

## Tenant sign-in (F-133)

Built on 20 November 2026 on branch f133-tenant-signin. Migration 0073. Off by default and not applied to any database. The design, the threat model and the go-live clicks are in docs/TENANT_SIGN_IN.md. Confirm each of these before it is switched on for any tenant.

- [ ] The decision itself: a reader signs in on the tenant's own domain, with one shared Akana account. The same email is the same account on the Akana site and on every tenant site.
- [ ] Privacy notice: the wording for shared identity needs the lawyer. It must say that an account made on a tenant site is an Akana account, that Akana is the controller, that the tenant cannot read answers, and that the same email signs in on other sites powered by Akana. The sign-in page already says this in plain words; the notice must match it.
- [ ] Consent wording: the health data consent page on a tenant site changes one sentence (consent is withdrawn "on the Akana site, under You", because a tenant site has no You page) and adds that the tenant cannot read what is written. The lawyer should see it. The consent version recorded is the same as on the Akana site (health-2026-10).
- [ ] Emails come from Akana, not the tenant. The sign-in email is Akana's template. It names the tenant's site, carries a code and no link, and names no workbook. Tenant-branded email is not built.
- [ ] No checkout on tenant hosts yet. Only what is free opens: the free part of a listed title, and demo titles in the demo period. Paid parts say "Not on sale on this site yet". No membership either.
- [ ] The access token hook must be enabled in Supabase before the flag is switched on for any tenant, on staging first. It must never be disabled while any tenant has sign-in on. Switch sign-in off first, which signs those readers out.
- [x] Changed by the rework after the first red team pass: no tenant URL goes in the Supabase redirect allow list. There is no link and no callback on a tenant host. The reader types Akana's own code, which is good for that tenant and address only.
- [ ] Only platform owners can switch sign-in on or off for a tenant (/admin/white-label, the tenant, "Reader sign-in on this site"). Confirm that is the right role. After the second red team pass the database also asks for a second factor in the owner's session and a reason every time.
- [ ] An account with two-step sign-in cannot sign in on a tenant site and is told to use the Akana site. Changed after the second red team pass: a reader who turns on two-step sign-in while signed in on a tenant site is signed out there within the hour. Confirm that is acceptable for now.
- [ ] A workbook on the Faith and Spirituality shelf cannot be read on a tenant site yet, because faith consent is not built there.
- [ ] On a tenant site there is no export, deletion, consent withdrawal, Today, habit, friends, push, gifts, referrals, marks or saved reading place. The account page links to the Akana site for export, deletion and consent. Confirm readers of a tenant site should be sent to the Akana site for those.
- [ ] Reader activity on tenant sites is not counted in the funnel figures.
- [ ] Open risk to accept, narrowed by the rework: someone who takes over a tenant's domain can put up their own sign-in page and ask readers for the emailed code. The code is now Akana's own, for that tenant and address. It opens that reader's work in that one tenant and nothing else: not the Akana account, not another tenant. The email names the site that asked. See docs/TENANT_SIGN_IN.md section 7.
- [ ] New after the second red team pass: a reader who has ever withdrawn health data consent cannot give it again on a tenant site. They are sent to the Akana site, under You. Confirm the wording ("This consent cannot be given on this site. Manage this on the Akana site, under You.") and that the lawyer is content with it.
- [ ] New, and needs a decision: withdrawals are recorded from migration 0073 onwards (a new table, health_consent_withdrawals). A withdrawal made before 0073 is applied left no record, so a tenant session could record consent once for such an account. Either accept that, or before go-live ask every account with no health consent on record to consent on the Akana site first. Nothing in the data can tell the two apart.
- [ ] New: while an account's deletion is pending it is read only on tenant sites too. The tenant site says only that the account cannot be added to there, and links to the Akana site. It does not say a deletion is pending.
- [ ] New: asking for a code on a tenant site is limited to five an hour per site and address by the database itself, and is refused outright if the rate limit counter is down or LEAD_HASH_SALT is missing. So a limiter outage stops tenant sign-in until it is fixed. The Akana site's sign-in is unchanged and still lets readers in during such an outage. Confirm that trade.
- [ ] Ten things could only be proved on the real Supabase (docs/TENANT_SIGN_IN.md section 10). Run the staging test in section 9E before production.
