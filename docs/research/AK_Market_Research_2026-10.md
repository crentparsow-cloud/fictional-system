# Akana market and product research, October 2026

Nine strands, run on 9 October 2026 to the brief: top-quality research across all three audiences, growth models first, with findings that fit Akana's model rather than reshaping Akana to fit a competitor. Each strand gives what was examined, what the evidence says, and what it means for Akana. Figures are quoted only where a source gave them; where a source is secondary or promotional that is said. The build list additions that follow from this are in `docs/planning/AK_Build_List_v2.md`, section 13.

## 1. Sign-up, verification and account security

**Examined.** Google Identity case studies, Google's own developer documentation, three identity vendors' guides, and the 2026 passwordless decision frameworks.

**Findings.** Google's published case studies report Reddit's conversion almost doubling after adding the Sign in with Google button and One Tap prompt together, Pinterest users twice as likely to use One Tap as other sign-in options, and eBay's sign-ins doubling across desktop and mobile web after One Tap. Google's own page claims up to 8x improvements in sign-up conversion; treat that as marketing, the case studies as evidence. Vendor guides agree that One Tap works because the person is already signed in to Google in their browser, so a new account is one tap and no email round trip. A Google ID token carries a verified email, which lets a site skip its own verification step. The 2026 consumer guidance is that the right answer is a primary method plus a fallback chain: a synced passkey or social sign-in as primary, email link or code as fallback, and step-up (a second factor) only when something risky happens such as a payment method change.

**Implications for Akana.** Gmail users should get One Tap on the web, with account linking by email so an existing magic-link reader who later taps Google lands in the same account. Verification is then automatic for Google users and the magic link stays for everyone else. Two-factor for readers should be optional and offered in the You tab, with the existing authenticator and passkey code opened to readers; it is required only for staff and money roles, as now. Passkeys for returning readers on the same device are the fastest path and already exist behind a flag.

## 2. Onboarding, trials and conversion

**Examined.** RevenueCat's State of Subscription Apps 2026 (115,000 apps), Adapty's 2026 report as summarised by third parties, and four paywall guides built on them.

**Findings.** RevenueCat reports a median Day 35 trial-to-paid conversion of 10.7 percent for apps with a hard paywall against 2.1 percent for freemium, with revenue per install at Day 60 of $3.09 against $0.38, while year-one retention is the same for both (27 and 28 percent). Trials of 17 to 32 days convert at a median 42.5 percent against 25.5 percent for trials under four days, yet nearly half of apps are shortening trials anyway. Onboarding accounts for about half of all trial starts in the apps surveyed, and people who skip the paywall in onboarding rarely come back to it. One guide notes that the hard-paywall advantage slipped from 12.1 to 10.7 percent year on year as people learned to bounce off it. Apps that charge more see nearly twice the download-to-trial rate of cheaper ones.

**Implications for Akana.** The free first week per workbook is a soft trial and should stay, because it is honest and matches the product. But the membership should be offered inside onboarding, after the quiz and the first exercise, not left for the paywall card deep in a title. A longer membership trial (14 to 21 days, card required, cancel in two taps) is supported by the data and sits within the DMCC rules if the reminder before the first charge is sent. The paywall card itself should be a clear single offer, with the price visible, not a soft nudge. The pricing data supports the ladder as set; cheaper is not better for conversion.

## 3. Habit mechanics, retention and the law

**Examined.** Duolingo's published and reported metrics, Trophy's 2026 gamification intelligence report, the Octalysis framework, and the UK consumer law position under the Digital Markets, Competition and Consumers Act (DMCC).

**Findings.** Duolingo reports that users with a seven-day streak retain at about 2.4 times the rate of those who never form one, and that introducing Streak Freeze cut churn among at-risk users by 21 percent. Trophy's data shows freezes make streaks about 4.5 times longer by day 21. The Weekend Amulet lifted next-week return by 4 percent. Every analyst agrees the surrounding infrastructure (recovery, pausing, no shame) does most of the work, and that a streak powered purely by loss aversion is the "black hat" version. On the law: the DMCC Act's unfair commercial practices regime is in force, with a blacklist that includes fake urgency, fake reviews, and omitting the full price (drip pricing); the CMA has used its new direct powers, fining the AA £4.2 million over drip pricing in 2026. The subscription contract rules (pre-renewal reminders, cooling-off, easy cancellation) are the spring 2026 tranche.

**Implications for Akana.** Streaks on non-mental-health shelves are defensible if they are opt-in, count the work rather than the day, can be paused for free, and never sell protection. Weekly rhythm beats daily streak for programmes written in weeks. Nothing in the app may show a countdown, "only today", or a false stock line; social proof must be true counts. The reminder-before-renewal and two-tap cancel already built are the right side of the subscription rules.

## 4. Visual identity and reading design

**Examined.** Readwise and Readwise Reader design breakdowns and token files, Imprint and Headway design showcases, Blinkist's category system, and one independent reading-app design case study.

**Findings.** The reading apps that feel premium share a vocabulary: a warm paper-coloured canvas rather than pure white, a serif for reading paired with a quiet sans for interface, a single warm accent (Readwise's tangerine, its signature yellow highlight wash), generous margins, and a line length of about 65 characters. Reader's marketing is dramatic and dark while its reading surface is plain; the contrast works because each fits its job. Keyboard-first interaction on desktop produces flow. Imprint wins on visual cards and a visible learning path; Headway on bright, inviting colour; Blinkist on an ordered category grid where every category has a colour and an icon.

**Implications for Akana.** Three directions worth mocking up: paper and ink (Readwise lineage, calm, bookish), bright editorial (Headway and Imprint lineage, colour per shelf, illustrated covers), and quiet confidence (Blinkist lineage, white space, strong grid). Whichever is chosen, the reading surface should be plain and the marketing surface may be bold. Line length, margins and reading type are not taste; they are the floor.

## 5. Growth loops: sharing, referral, gifting, household plans

**Examined.** Referral benchmark compilations from four vendors, Blinkist Connect reporting, Hallow's and YouVersion's family and friends mechanics.

**Findings.** Subscription businesses see 7 to 12 percent of revenue from referrals against 2 to 5 percent for one-off sellers; 78 percent of programmes are double-sided; a friend who receives a reward converts at 15 to 22 percent against 8 to 12 percent with no reward; strong programmes earn $15 to $40 per share. These are e-commerce-weighted sources, so treat the ranges as directional. Blinkist Connect (two people on one membership) is reported to have lifted organic growth by about a quarter. Hallow sells a Friends and Family annual plan for up to six people at $119.99 against $69.99 individual, about 1.7 times. YouVersion's Plans with Friends lets up to 150 people run a plan together and discuss it inside the app, and churches promote it to small groups with ready-made materials.

**Implications for Akana.** A household or friends plan at roughly 1.5 to 1.7 times the single membership, for two to four people with separately sealed answers, is the single growth feature with the best evidence. A double-sided referral with a modest credit paid on first purchase comes second. "Do a programme with a friend" is the Akana-shaped version of Plans with Friends, with the privacy rule that only completion is shared, never answers. Gifting should be a code, not a card, and sold at Christmas and to new parents.

## 6. Authors and the marketplace take

**Examined.** Pricing pages and comparisons of Gumroad, Substack, Teachable, Thinkific, Kajabi, Payhip and Patreon, and a creator-economy analysis of when creators switch platforms.

**Findings.** Gumroad charges 10 percent plus 50 cents on sales the creator brings and 30 percent on sales Gumroad's own marketplace originates; this split between creator-sourced and platform-sourced sales is the clearest precedent for Akana's revenue share question. Substack takes 10 percent of paid subscriptions. Teachable's starter plan carries a 7.5 percent fee, dropping to zero on higher plans; Kajabi charges a flat monthly fee and no cut. Creators move from pay-per-sale tools to flat-fee suites once monthly revenue passes a few hundred dollars, and what pulls them is a dashboard, email, community and a branded site in one place.

**Implications for Akana.** The author share (D1 to D4) can be two figures rather than one: a higher author share on sales the author's own link brings, a lower one on marketplace-originated sales, exactly as Gumroad does. Authors will judge Akana by the Studio dashboard first, so it needs sales, readers started, readers finished and next payout on one screen. A launch kit (link, code, graphics, stats) is what the course platforms provide and authors expect.

## 7. Organisations: what buyers pay for and expect

**Examined.** Headspace for Work and Headspace Core for Small Business, Calm Business, Blinkist Business, Vendr's pricing benchmarks and two HR buyer guides.

**Findings.** Vendr puts Headspace for Work at $12 to $36 per employee per year for organisations over 100 people, falling with headcount; an HR guide quotes enterprise wellbeing apps at $50 to $70 per employee per year and smaller tools at $3 to $6 per employee per month. Headspace's small-business product is self-serve, sold in USD, GBP and EUR, does not auto-renew, can be paid by invoice, allows seat reassignment, and includes an admin portal with engagement and adoption reporting plus a launch toolkit. Blinkist Business sells a self-serve Team plan for 5 to 50 seats billed annually per seat, Enterprise above 50 through sales, and reports that business is about a fifth of its revenue. Every buyer guide names aggregate engagement reporting as the thing HR must have.

**Implications for Akana.** Price organisation seats in the $12 to $36 per person per year band for teams and churches, higher for programmes with facilitator support. The admin portal must show adoption and completion in aggregate (Akana already suppresses small counts, which is a selling point). Offer invoice payment, no auto-renew on the small plan, seat reassignment, and a launch kit. Self-serve for 5 to 50 seats is the standard shape; the flag-off code already matches it.

## 8. Faith apps: programmes, churches and seasons

**Examined.** Hallow's parish programme and pricing pages, YouVersion for Churches and Plans with Friends, Glorify's positioning, and the three apps' joint Global Bible Month.

**Findings.** Hallow sells parishes a package with physical materials (banner, pew cards), live training for staff, usage analytics for the parish, private prayer groups, and a seasonal offer (Lent for $1 per parishioner). Parish partnerships run annually with a free period then a discount. YouVersion gives each church a profile page, a featured plan that notifies followers, a unique share link, Plans with Friends for small groups, and promotional resources. All three leading apps anchor campaigns on Lent, Advent and a November Bible month. Hallow's Friends and Family plan covers six.

**Implications for Akana.** The organisation product for churches needs a church profile page with a featured programme and a share link, a leader kit with printable materials, seasonal 30-day programmes timed to Lent and Advent, and analytics the church can see in aggregate. A parish-style annual partnership (free period then discount) is a tested sales shape. The theological reviewer (C11) is the gate on all of it.

## 9. Web only: what the browser can and cannot do in 2026

**Examined.** Current PWA capability guides for iOS and Android, and Apple's 2026 changes.

**Findings.** Web Push works on all major browsers, including iOS, but on iOS only after the person adds the site to their Home Screen, and iOS shows no automatic install prompt; iOS 26 does open Home Screen sites as web apps by default. A person signed in inside Safari arrives signed out when they open the installed web app, because the two data stores are separate. Android shows an install prompt when the manifest and service worker criteria are met, and the site can control its timing. Several teams report PWA users on older devices engaging more than native users (Lyft's figure is often quoted).

**Implications for Akana.** The web-only decision holds. The costs to design for: an iOS install guide of our own ("tap Share, Add to Home Screen"), a sign-in that recovers instantly in the installed app (Google One Tap and passkeys make this painless), email as the primary reminder channel with Web Push as an opt-in for installed users, and install prompts timed after the second visit, not the first.

## Where the evidence is thin

Referral and gifting figures come from e-commerce vendors; no comparator published its own numbers. Blinkist Connect's growth figure is from a business-model analysis site, not Blinkist. Headway's and Imprint's revenue estimates are from app-intelligence tools. Hallow's parish pricing bands were not visible without a sales conversation. None of the comparators publishes trial length or paywall conversion, so Akana's own analytics (build list 10.4) are the only way to know its figures.
