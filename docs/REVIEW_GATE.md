# Mechanic review gate

Build list item 14.4. A written checklist applied to every habit, paywall, trial, cancel and unsubscribe flow before it ships, and again whenever one changes. It is drawn from the ICO and CMA joint position paper on harmful design in digital markets (the "harmful design" paper, research annex Strand 4), from the CMA's unfair commercial practices guidance CMA207 under the DMCC Act (Strand 2), and from the rules that apply to every item in the build list. The ICO Children's Code standard 13 on nudge techniques supplies the one nudge Akana does allow.

The gate is a pull request comment. The reviewer, who is not the author of the change, copies the relevant sections, answers every line, and names themself. A "no" on any line in sections 1 to 3 blocks the merge. A "no" in sections 4 to 6 blocks the merge for the flows it names.

## How to use it

1. Name the flow and the screens it touches. Say which shelves it reaches: mental health (safety tier standard or higher) or every other shelf.
2. Walk the flow on a phone, signed in as a reader, including the exit path (cancel, unsubscribe, decline, close).
3. Answer each line below with yes, no or not applicable, with one sentence of evidence for each yes.
4. Record the reviewer's name and the date in the pull request.

## 1. Harmful design (ICO and CMA paper)

The paper names five practices. Each has a line here.

**Harmful nudges and sludge.** Nudges push a person towards a choice; sludge makes the other choice slow or tiring.
- [ ] Every choice in the flow takes the same number of taps either way. Cancel is as short as subscribe. Decline is as short as accept.
- [ ] No step repeats a question the reader has already answered.
- [ ] Nothing in the flow uses a timer, a count of other people, or "only" or "last" wording to hurry a choice.
- [ ] The one permitted nudge, a single line suggesting a break after a long session (14.5), appears at most once and is not used anywhere else.

**Confirmshaming.** Wording that shames the reader for the choice they are making.
- [ ] The decline, cancel and unsubscribe labels are neutral statements of the action: "Cancel membership", "Unsubscribe", "No thanks". No "No, I don't want to do better", no guilt, no sad face.
- [ ] The confirmation after cancelling states the fact and what the reader keeps. It does not ask them to reconsider.

**Biased framing.** Presenting one option as the only sensible one.
- [ ] Options are shown in the same type size, weight and colour. The option that costs the reader less or shares less is never greyed out, smaller or below the fold.
- [ ] Annual and monthly prices are both shown as totals, with the yearly total as prominent as the monthly figure (CMA207 4.16).
- [ ] Nothing describes a legal right (refund, cooling-off, data access) as a feature or a favour (CMA207 banned practice 11).

**Bundled consent.** One tick covering several unrelated things.
- [ ] Each consent is its own control: terms, health data, marketing email, reminders, sharing. None is pre-ticked.
- [ ] Health data consent on a wellbeing title stands alone, with no contractions in its wording, and can be declined while the reader keeps reading (`checkStyle` enforces the wording rule).
- [ ] Declining any optional consent leaves the reader where they were, with nothing lost.

**Default settings.** Settings chosen for the reader that favour Akana.
- [ ] Reminders, emails, sharing and any habit mechanic are off until the reader turns them on.
- [ ] A reader who changes nothing gets the most private, least noisy version of the flow.
- [ ] Every default is written down in the pull request with the reason it is the default.

## 2. CMA207 and the DMCC rules

From the "rules that apply to every item" and the Strand 2 rows.
- [ ] The full price, including every mandatory charge, is on every invitation to buy (CMA207 4.16). Local currency display does not hide the total.
- [ ] No countdown timer anywhere. A seasonal launch shows a date (banned practice 7; the Emma Sleep order of May 2026 is the reason).
- [ ] No struck-through "was" price on a new title or code.
- [ ] "Free" appears only where nothing is paid. The trial is labelled with its length and the price that follows: "14 days, then X a month" (banned practice 23).
- [ ] Counts (readers, finished steps, reviews) are true, current and from verified buyers where they are reviews.
- [ ] Before purchase, the key subscription terms are shown together on one screen: price, renewal date, how to cancel, cooling-off.
- [ ] A reminder goes out before a trial converts and before each renewal, and the flow says when that reminder arrives.
- [ ] Cancellation is a clearly labelled button, reachable from settings in at most two taps, and the confirmation arrives within 24 hours (CMA207 7.9 on multi-click cancellation).
- [ ] The cancel flow is one screen, one optional reason, at most one offer, and the offer is never shown on a mental health shelf.

## 3. Rules Akana sets for itself

**The sharing rule.** A reader can share a blank exercise, a completion mark, a pre-written nudge or a whole workbook. Never an answer.
- [ ] Nothing in the flow puts an answer, a field value, a plan line or a check-in result into a share sheet, a URL, an image or an email.
- [ ] Sharing goes through the reader's own channels. Akana never emails the friend (ASA Beer52 ruling; ICO PECR instigator rule).
- [ ] Every referral message states its conditions, including that the friend pays before any credit lands.
- [ ] The facilitator guide rule holds: nothing asks a reader to read out or hand over what they wrote (`SHARE_ANSWERS_RE` in `packages/validate/src/guide.ts`).

**The mental health rule.** On tier standard and higher, nothing counts days, nothing expires, nothing nags, no streaks, no countdowns.
- [ ] No number of consecutive days is computed, stored or shown. The milestone trigger pattern in the schema permits none, and `checkSafety` refuses streak or missed-day wording.
- [ ] A missed step causes nothing to happen except an optional reflection. A return after a gap is a welcome back.
- [ ] No leaderboard, no comparison with other readers, anywhere, on any shelf.
- [ ] No humour in any mechanic on a mental health shelf (docs/VOICE.md).
- [ ] Help now is one tap from every screen in the flow on these tiers, and no mechanic is offered as a response to risk.

**Habit mechanics on other shelves.**
- [ ] Opt-in, and the opt-in explains the mechanic in plain words before it starts.
- [ ] Counts the finished step, never the day or the open.
- [ ] Pauses for free, automatically, with nothing lost and nothing to earn back.
- [ ] Is never sold, bundled with a price or used as a reason to pay.
- [ ] Reminders stop themselves and say so: "This is the last reminder in this series."

## 4. Paywall and trial flows

- [ ] Week 1 (or the free units set in `structure.free_units`) opens without a card.
- [ ] The paywall names the exact thing being bought: this workbook, or membership, with its price and its term.
- [ ] Buy and Start are distinct buttons with distinct labels. Neither is styled to look like a continue button.
- [ ] Declining the paywall returns the reader to the free unit, not to Home.
- [ ] Demo titles cannot be bought and say so.

## 5. Cancel and unsubscribe flows

- [ ] "Cancel membership" and "Unsubscribe" are the exact labels.
- [ ] The confirmation states the end date and that the reader's answers stay theirs and remain exportable.
- [ ] One optional reason field, skippable. One offer at most, never on a mental health shelf, never a countdown.
- [ ] Unsubscribe from any email works in one tap from the email itself and does not need a sign-in.
- [ ] A cancelled reader receives no further marketing or reminder email. Receipts and legal notices continue.

## 6. Copy

- [ ] Every string passes the validator rules it is subject to and has been run through `pnpm validate --style`.
- [ ] Register matches the channel matrix in docs/VOICE.md: receipts, errors, consent and settings at full plainness.
- [ ] "We're sorry", never a formal apology, and only where the fault is Akana's.

## Record

```
Flow:
Screens:
Shelves reached: mental health / other / both
Sections applied: 1 2 3 4 5 6
Blocking findings:
Reviewer:
Date:
```
