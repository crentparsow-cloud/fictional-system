# Akana pricing decisions, 15 October 2026

Decided by Crent on 15 October 2026. This record sets down what was decided, the evidence it rests on, and where each decision lives in the build. The evidence is in docs/research/AK_Build_Research_2026-10-09.md. Row names below are the "Idea" column of that file. Nothing here adds a figure the research does not support. Where the research is silent, this record says so.

## What was decided

### Membership prices

One person pays GBP 7.99 a month, or GBP 69.99 a year. The annual plan is shown as GBP 5.83 a month, billed yearly, with the yearly total shown at the same size beside it. Two people pay GBP 11.99 a month, or GBP 104.99 a year. All prices include VAT and are for the GBP market only.

The workbook ladder is unchanged from 9 October. It has six points, from GBP 7.99 to GBP 14.99.

### Trials

The monthly plan has a 14 day trial. The annual plan has a 21 day trial. A card is required to start either. The two-person plans have no trial. The shared-membership build set that rule and it stands.

### Author shares

Shares are of the net sale value after card processing. That means the price paid, less VAT, less the card fee.

An author receives 80 percent of the net on a sale that arrives through the author's own link. That is channel author_link. An author receives 65 percent of the net on a marketplace sale. That is channel marketplace.

Half of net membership revenue goes into the author pool each period. The pool is shared on the existing basis, which is finished steps. Income from a two-person plan counts once, as the buyer's single payment.

### Author payouts

Payouts run weekly, on Fridays. There is a floor of GBP 10.00. A balance below the floor carries forward to the next payout. These are no longer placeholders.

### House-record signer (C10)

Crent Parsow, owner, signs the house records for the five classics. His name is on each record as signer. The signature line is left to sign, so the act of signing stays his.

## The evidence

### Trial lengths

The research row "Trial length" reports RevenueCat data from more than 17,000 apps. Monthly plans did best at 10 to 16 days, at 46.6 percent. Annual plans did best at 17 to 32 days, at 44.6 percent, against 24 percent for trials of four days or less. First renewal was 77.5 percent after a long trial, against 49.5 percent with none. The row says the data is correlational. Its fit note reads "14 days monthly, 21 or more annual", which is the decision.

The row "Card-required trials about 30 percent, no-card 4 to 15 percent" is ChartMogul B2B data, so it is weaker evidence for a consumer product. It supports requiring a card. The row "55.4 percent of 3-day trial cancels on day zero" supports a long trial with a reminder, and the build already sends one three days before the first payment.

### Annual price display

The row "Annual shown as monthly equivalent with yearly total equally prominent" cites CMA207 4.16, which says the total price must include all mandatory charges. That is why GBP 69.99 a year sits beside GBP 5.83 a month at the same size, and why the pay screen states the yearly total. The monthly figure is GBP 69.99 divided by twelve, rounded to the nearest penny.

The same applies to the annual two-person plan. GBP 104.99 a year is shown beside GBP 8.75 a month.

### Two-person plans

The row "Two-person membership as a retention product" is Second Measure data on Spotify. Twelve-month retention was 83 percent on Duo against 69 percent on Individual. The research uses it to confirm item 6.1. The research gives no price ratio. The two-person prices were set at about one and a half times the single prices, as the shared build seeded them. That ratio is a decision, not a finding.

### Weekly payouts and the floor

The row "Weekly payout with low floor" shows Gumroad paying weekly with a USD 10 minimum, Patreon at USD 25 by default, Thinkific with no hold and Teachable paying daily. The Gumroad and Patreon figures come from third-party pages. The row "Payout calendar and Payments Report" shows KDP paying about 60 days after month end, with a GBP 100 minimum on the UK store. The research note is "Beat 60 days and say so". Weekly payouts with a GBP 10 floor do that.

### Net of card processing

The row "Per-sale fee breakdown" cites Gumroad and Patreon pricing pages, and Beehiiv on the Substack dashboard mismatch. The point is to show the arithmetic on each sale so an author never has to work it out. The Studio payments page already shows price, VAT, card fee, the author share and the Akana share for each sale. Basing the share on the net after card processing is the build's existing fee_treatment of deduct.

### Author shares and the pool

The research has two rows that bear on the shares.

The row "Publisher pilot: Perlego pays 65 percent, publishers keep rights control" is the nearest precedent for a 65 percent marketplace share.

The row "Author referred-membership recurring share" notes that Medium pays half of a referred member's fee, recurring. It is the nearest precedent for putting half of membership income into the author pool.

The affiliate benchmarks row gives a range for what others pay for referrals: Readwise 33 percent, Kajabi up to 20 percent recurring, Bookshop.org 10 percent. These are for referral commission, not for a share of a sale, so they do not bear on the 80 percent.

The research has no row that supports 80 percent on an author's own link. That figure is Crent's decision. The reasoning is that an author who brings their own reader has done the selling, so Akana takes less.

## Where each decision lives

Migration 0046 sets the prices, the trial lengths and the royalty figures. The prices are rows in public.price_points. The trial lengths are in public.app_config. The shares and the payout calendar are a new row in public.royalty_config, because that table is append-only.

| Item | Name or key | Value |
|---|---|---|
| Price point | member_month | GBP 7.99 a month |
| Price point | member_year | GBP 69.99 a year |
| Price point | member_two_month | GBP 11.99 a month |
| Price point | member_two_year | GBP 104.99 a year (new in 0046) |
| Trial days | app_config membership_trial_days_monthly | 14 |
| Trial days | app_config membership_trial_days_yearly | 21 |
| Own-link share | royalty_config sale_rate_author_link | 0.80 |
| Marketplace share | royalty_config sale_rate_author | 0.65 |
| Pool share | royalty_config pool_share_author | 0.50 |
| Fee treatment | royalty_config fee_treatment | deduct |
| Payout cadence | royalty_config payout_cadence | weekly |
| Payout weekday | royalty_config payout_weekday | 5 (Friday) |
| Floor | royalty_config min_payout_minor | GBP 1000 (GBP 10.00) |
| Placeholder flag | royalty_config is_placeholder | false |

The Stripe prices are matched by environment variable. STRIPE_PRICE_MEMBERSHIP_MONTHLY is member_month. STRIPE_PRICE_MEMBERSHIP_YEARLY is member_year. STRIPE_PRICE_MEMBERSHIP_TWO_MONTHLY is member_two_month. STRIPE_PRICE_MEMBERSHIP_TWO_YEARLY is member_two_year. A plan opens when its variable holds a recurring price id. Until then its checkout says "Membership is not open yet" and its offer stays hidden.

The two-person yearly plan is new in the code. It has its own checkout plan (two_yearly), its own card on the pricing page, and its own price id. The subscription, consent and seat functions in the database accept member_two_year. The renewal notice that goes to annual members before each renewal now covers it too.

## One change to how payouts work

Until now the payout run could only pay money from months whose statement had closed. A weekly run on that rule would have paid monthly in practice. Migration 0046 changes the rule when the config says weekly. A ledger line is payable once it is older than the refund window, which is 14 days. When the config says monthly, the closed-statement rule stands as before.

So a sale is paid on the first Friday after its 14 day refund window ends. The Studio payments page says this in those words. The daily payout job acts on the configured weekday when the cadence is weekly, and on the payout day of the month when it is monthly.

Live payouts stay locked. The route still refuses to run with a live Stripe key. That lock is for the go-live meeting, whatever the config says.

## What is still open

Crent creates the four recurring prices in Stripe, on the "Akana membership" product with tax behaviour inclusive, and puts their ids in the environment.

Author links do not exist yet. The 80 percent rate is in the ledger and tested, but no sale can arrive through an author link until the link and referral code are built. Every sale today is a marketplace sale.

The per-point share estimate in the Studio price picker is still off. The share is now set. The VAT rate for an interactive workbook waits on the accountant, and the card fee is Stripe's, so the estimate would otherwise be a guess. Real sales use the actual VAT and fee.

The paywall inside the reader still offers only the monthly two-person plan as its quiet third option. The annual two-person plan is on the pricing page and in the checkout.

The house records name Crent as signer but are not signed. The public-domain pages are built from files in the repository, so there is no Sign button in the console. He signs by filling in the review line in each record. The tests keep the line empty until he does.

The DMCC subscription rules are not yet in force, and sources differ on the date. The build follows them now. The lawyer confirms the date.
