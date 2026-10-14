# DMCC compliance pass

Build list item 13.7. Date of pass: 14 October 2026. Done by the build session against the code on branch `platform`. This is an engineering audit, not legal advice. The lawyer (L1 to L4) signs off, and the rows marked "open for the lawyer" need a decision from them.

## Rules used

From the research annex (Strand 2) and `docs/REVIEW_GATE.md` section 2. The subscription-contract regime (Digital Markets, Competition and Consumers Act 2024, Part 4, Chapter 2) is not yet in force. Sources differ on the start date: not before April 2026, autumn 2026, or spring 2027. The lawyer confirms it. The build follows the rules now. The banned practices in CMA207 (the unfair commercial practices guidance) already apply.

- R1. Total price on every invitation to buy, with every mandatory charge (CMA207 4.16).
- R2. No countdown timers. Seasonal launches show a date (banned practice 7, Emma Sleep order of May 2026).
- R3. No struck-through "was" price (High Court, Emma Sleep, July 2026).
- R4. "Free" only where nothing is paid. A trial is labelled with its length and the price after it (banned practice 23).
- R5. Legal rights are not sold as features (banned practice 11).
- R6. Annual shown with the yearly total as prominent as the monthly figure (CMA207 4.16).
- R7. Key terms together on one screen before purchase: price, renewal date, how to cancel, cooling-off.
- R8. A reminder before a trial converts and before renewals, and the flow says when it arrives.
- R9. Cancellation is a clearly labelled button, reachable in at most two taps, with confirmation inside 24 hours (CMA207 7.9).
- R10. Cancel flow: one screen, one optional reason, at most one offer, and no offer on a mental health shelf.
- R11. Counts shown to the public are true and current. Reviews are from verified buyers.

## Findings

Result key: **Pass** (meets the rule as built), **Fixed** (changed in this pass), **Open** (needs a build change in the next wave), **Lawyer** (needs the lawyer's view).

### Invitations to buy

| Item | Where | Rule | Result | Note |
|---|---|---|---|---|
| Workbook Buy button, "Buy, <price note>" | `components/catalogue/PublicBuy.tsx`, route `/w/[slug]`; price from `lib/public-offer.ts` | R1 | Pass | Button text carries the price. Prices are VAT inclusive (`lib/pricing.ts`), so the figure is the total. A code shows "The total there is the total you pay." |
| Paywall in the reader | `components/reader/PaywallCard.tsx`, route `/read/[slug]` | R1, R2 | Pass | Header comment and `components/reader/paywall.test.ts` forbid "only today", "hurry", "last chance", "ends", "limited" and "countdown". |
| Membership offer | `components/membership/MembershipOffer.tsx` | R1, R4, R7 | Pass | See key terms below. |
| Pricing page | `app/pricing/page.tsx`, route `/pricing` | R1, R4 | Pass | Prices from `lib/price-display.ts`. Trial line comes from `trialLabel`. |
| Promotion code | `lib/promo-code.ts`, route `/code` and `/w/[slug]?code=` | R3 | Pass | Shows the price with the code, never a "was" figure. `lib/promo-code.ts` messages are plain. |
| Checkout hand-off | `app/api/checkout/route.ts`, `app/api/checkout/membership/route.ts` | R1 | Pass | Stripe Checkout shows the final total. Adaptive Pricing (reader pays 2 to 4 percent conversion) is a dashboard toggle that is not yet on. When it is, the lawyer should check that the converted total is shown before payment. |
| Organisation licences | `app/org/billing/page.tsx`, `app/pricing/page.tsx` (organisation text) | n/a | Lawyer | Business to business. DMCC consumer rules do not apply to organisation buyers. The lawyer confirms. |

### Labels and "free"

| Item | Where | Rule | Result | Note |
|---|---|---|---|---|
| "Week 1 is free, no card" | `lib/free-label.ts`, shown on `/w/[slug]`, library cards and the quiz | R4 | Pass | True: the first unit is read with no payment and no card. The label says so. |
| "Start week 1 free" button | `app/w/[slug]/page.tsx` | R4 | Pass | Same free unit. No card asked. |
| "Your free week and your answers stay here" | `components/reader/PaywallCard.tsx` | R4 | Pass | Same. |
| Trial label | `lib/membership-trial.ts` `trialLabel`; `app/pricing/page.tsx`; `components/membership/PlanToggle.tsx` | R4 | Pass | Format "14 days, then £7.99 a month". The word "free" is never used for the trial (file header and `components/membership/MembershipOffer.tsx` header). |
| Pilot "(free)" | `app/org/billing/page.tsx` | R4 | Pass | Staff and organisation admins only. A pilot is never billed. |
| Demo titles | Demo badge; checkout refuses them | R4 | Pass | Not sold, so no price or "free" claim. |
| Legal rights as features | `/legal/refunds`, `app/pricing/page.tsx` lines on 14-day refund | R5 | Lawyer | The pricing page says "Cancel within 14 days of starting, or of a yearly renewal, and the unused days are refunded." This is stated as a fact of the contract, not as a perk. `docs/legal/refund-policy.md` section 2 is headed "What Akana promises beyond the law". The lawyer should confirm the line between the legal right and the extra promise is clear to a reader. |

### Timers and scarcity

| Item | Where | Rule | Result | Note |
|---|---|---|---|---|
| Countdown timers | Whole app | R2 | Pass | No timer in any reader, catalogue or pricing component. The `setInterval` uses found are `components/you/AppearanceApply.tsx` (re-applies the display setting) and `components/reader/PauseBar.tsx` (the pause control). Neither counts down to an offer. |
| Seasonal offers | none built | R2 | Pass | When built, show dates. Not built yet. |
| Scarcity wording | `lib/price-display.test.ts` | R2 | Pass | Test fails on "only today", "ends", "hurry", "countdown", "was", "save", "off". |

### Price display

| Item | Where | Rule | Result | Note |
|---|---|---|---|---|
| Struck-through prices | CSS and components | R3 | Pass | No `line-through`, `<s>` or `<del>` anywhere in `app/`, `components/`. `lib/price-display.test.ts` forbids a "was" figure. |
| Monthly plan line | `lib/price-display.ts` `monthlyPlanLine` | R1 | Pass | "£X a month", with "£X each month until you cancel". |
| Yearly plan line | `lib/price-display.ts` `yearlyPlanLine` | R6 | **Open** | The primary line is the monthly equivalent and the yearly total is the secondary line. The rule needs the total to be as prominent. The billing line does state the total, but the heading does not. Next wave: show "£X a year" at equal size and weight beside the monthly figure (`components/membership/PlanToggle.tsx`, `app/pricing/page.tsx`). Not a wording-only fix. |
| Local currency display | `lib/markets.ts` | R1 | Lawyer | GBP market only for now (`lib/pricing.ts`). Check again when other currencies launch. |

### Trial, key terms and reminders

| Item | Where | Rule | Result | Note |
|---|---|---|---|---|
| Key terms together before purchase | `components/membership/MembershipOffer.tsx` (Trial, Reminder email, First payment, Renews at, To cancel) | R7 | Pass | One panel carries price, renewal, cancel route and trial dates. Cooling-off is on the paywall (`PaywallCard.tsx` consent text) and `/pricing`, not in the same panel. Lawyer to confirm whether cooling-off must sit in the panel. |
| Immediate-access consent | `lib/checkout-consent.ts`, migration 0019 | R5 | Pass | Unticked box, versioned wording, recorded with the session. |
| Trial reminder | `lib/stripe-webhook.ts` (`customer.subscription.trial_will_end`, three days before); offer states the date via `trialDateLines` | R8 | Pass | One reminder per subscription and trial end (email claim). The offer, checkout page and day-zero email use the same dates. |
| Annual renewal notice | `lib/stripe-webhook.ts` (`renewal_notice`) | R8 | Pass | Renewal date, amount and how to cancel. |
| Six-monthly terms reminder, monthly plan | `lib/membership-reminders.ts`, `app/api/membership/reminders`, migration 0011 | R8 | Pass | Sent 3 to 14 days before a renewal, once per six months. Lawyer to confirm the rule once the commencement date is set. |
| Trial lengths | `lib/membership-trial.ts` (14 days monthly, 21 yearly, card required) | R4 | Pass | Settings in `app_config` (migration 0042). |

### Cancellation

| Item | Where | Rule | Result | Note |
|---|---|---|---|---|
| Cancel route | `app/(reader)/you/page.tsx`, `app/api/billing/portal/route.ts`; offer text "Go to You, then Manage membership, then Cancel" | R9 | **Open** | Cancelling happens in Stripe's customer portal, so it is three steps (You, Manage membership, then Cancel inside Stripe) and the final button is not ours. The You page says "Cancel, change your card or see your invoices on Stripe's secure page." The plan wants a labelled Cancel button on You within two taps. Next wave: an own-site "Cancel membership" button on You that ends the subscription at period end through the API. Lawyer to say whether the portal route is enough. |
| Cancel button label | `components/membership/MembershipOffer.tsx` | R9 | Pass | Label is plain "Cancel". |
| Confirmation | `lib/membership-email.ts` (`cancellation` template), sent from the webhook | R9 | Pass | Sent when Stripe reports the change, normally within seconds. A failure is retried by Stripe. The mailer logs failures; there is no 24-hour alarm yet. Next wave: an ops alert if a cancellation has no sent email after 24 hours. |
| Cooling-off cancel and refund | `lib/membership-refund.ts`, `lib/stripe-webhook.ts` | R9 | Pass | A cancel inside 14 days gives a pro rata refund. |
| Cancel flow: reason and offers | none built | R10 | Pass | No reason screen and no retention offer exist, so the rule holds. The planned pause offer (14.25) must stay off mental health shelves when built. |
| Confirmshaming | `lib/membership-email.ts`, `docs/VOICE.md` | R9 | Pass | Cancellation email states the fact and what the reader keeps. |

### Counts and reviews

| Item | Where | Rule | Result | Note |
|---|---|---|---|---|
| Public counts | `/publish`, `/organisations` text | R11 | Pass | Text describes counts shown to organisation leads. No reader count, rating or review is shown on a public page. Counts under five are hidden. |
| Reviews | none built | R11 | Pass | Verified-buyer rule applies when built. |

## Wording fixes made in this pass

None needed. Every label checked already used the approved forms. No file was changed for wording.

## For the next wave

1. Yearly price prominence: show the yearly total as large as the monthly equivalent (R6). Files: `lib/price-display.ts`, `components/membership/PlanToggle.tsx`, `app/pricing/page.tsx`.
2. Own-site cancel button on You, at most two taps from settings, ending the plan at period end (R9). Files: `app/(reader)/you/page.tsx`, a new route under `app/api/membership/`.
3. Ops alert when a cancellation has no confirmation email after 24 hours (R9). Files: `lib/ops-alerts.ts`, `lib/stripe-webhook.ts`.
4. Adaptive Pricing: if the toggle is switched on, show the converted total before payment (R1).
5. Cooling-off line inside the key terms panel if the lawyer says it must sit with the other terms (R7). File: `components/membership/MembershipOffer.tsx`.

## For the lawyer

- Commencement date of the subscription regime.
- Whether the Stripe portal is an acceptable cancel route (R9).
- Whether the pricing page line on the 14-day refund reads as a legal fact or a favour (R5).
- Whether cooling-off must be in the same panel as the other key terms (R7).
- Business to business position for organisation licences.
