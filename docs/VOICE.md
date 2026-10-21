# Akana voice

Build list item 14.39. One page. The voice is constant; the tone moves by channel (Monzo and Mailchimp both work this way, research annex Strand 6). Where the validator already enforces a rule, this page cites it rather than restating it, and nothing here contradicts the code.

## The voice

Akana sounds like one calm, practical person who has read the book and wants you to use it. Second person. Short sentences. Plain words. It tells you what happened and what you can do next. It does not perform warmth, does not cheer, and does not apologise at length. It never speaks for the author: the author's words are the author's, quoted and sourced; Akana's words are the interface, the emails and the help.

Three tests for any line: could a tired reader on a phone take it in once? Does it say the thing, rather than a picture of the thing? Would it still be true if the reader had a hard week?

## Rules already in the code

These come from `packages/validate/src/rules.ts` and `index.ts` and apply to every workbook string the reader sees. They are errors, not advice.

- UK or US spelling to match the workbook's `spelling` setting; UK is the house default (`SPELLING_PAIRS`).
- No em dashes, en dashes, curly quotes or ellipsis characters; no emojis; no exclamation marks (`BANNED_CHARS`, `EMOJI`, the `!` check).
- No sentence starts with "I" or "We" outside quoted speech. Workbook copy is the author's room; Akana does not step into it.
- No contractions in safety, crisis or consent text (`CONTRACTION_RE` on `SAFETY_KEYS` and `SAFETY_WORDS_RE`).
- No claim words: nothing treats, cures, heals or is proven; on wellbeing titles nothing "helps" or "calms" either (`claimPatterns`). Never say how well an exercise works.
- No "you should" or "you must", no "fail", no "bad day", no "journey", "unlock", "simply", "game-changer", "you did it", and no comparison with other people (`BANNED_PHRASES`).
- No streak, no missed-day count, no reproach (`checkSafety` and the `Milestone` trigger pattern in the schema). A return after a gap is a welcome back.
- Emails never name a workbook title, theme, topic or condition in the subject or the body (`packages/emails/src/layout.ts` and the title guards in `organisation.ts`).

The plain English lint (`pnpm validate --style`, `packages/validate/src/plain.ts`) adds warnings for sentences over 25 words, negative contractions, a banned word list and unit titles under five words. Interface strings in `apps/web/messages` go through it too. Warnings inform the copy pass; they do not block a build.

## Channel matrix

Plainness is the baseline everywhere. Warmth is a permission granted to a few channels, never a requirement. Humour is permitted nowhere on a mental health shelf and sparingly elsewhere.

| Channel | Register | Allowed | Not allowed | Example |
|---|---|---|---|---|
| Receipts, invoices, refunds | Full plainness | Amounts, dates, what access changed, how to get help | Warmth, thanks beyond one word, marketing, any title | "Paid: 12.00 GBP on 9 October 2026. Access to this workbook continues for a year." |
| Errors | Full plainness | What happened, what to do, "We're sorry" where the fault is ours | Blame, jokes, "Oops", "Something went wrong" with nothing after it | "We're sorry. That could not be saved just now. Please try again." |
| Consent, privacy, health data | Full plainness, no contractions | The choice, what each option means, how to change it later | Pre-ticked boxes, urgency, bundled choices, softening words | "This workbook asks about your mood. That is health data. You can say no and still read the book." |
| Settings, account, cancel, unsubscribe | Full plainness | What the switch does now, what it does not undo | Guilt, "Are you sure?", offers in the cancel path beyond the one agreed in docs/REVIEW_GATE.md | "Cancel membership. Your access ends on 9 November 2026. Your answers stay yours." |
| Help now and safety | Full plainness, no contractions | Who to contact, that the reader is not alone, the exact phone number or route | Reassurance about outcomes, "you will feel better", exercises offered as a response to risk | "If you need help now, you are not alone. Help now has people you can talk to today." |
| Home and Today | Warmth allowed | A plain greeting, where you left off, one next step | Counting days, "you missed", praise with adjectives, more than one nudge | "Welcome back. Week 3 is where you left off." |
| Finish sequence | Warmth allowed | Naming what the reader did, in their own words from their answers; the book bridge | Scores, comparison, "you did it", certificates presented as rewards for speed | "Twelve weeks, and a plan written in your words. The book goes on from here." |
| Milestones | Warmth allowed, 25 words | What was finished, once | Streaks, consecutive anything, "keep it up" | "Your first answer is saved. The list is yours to add to all year." |
| Reminders and emails | Plain, with the one line of substance | "Akana today:" then one line; the honest end of a series | Any title, theme or condition; "last chance"; a second nudge | "Akana today: one step is waiting where you left off. This is the last reminder in this series." |
| Marketing pages and listings | Plain, confident | What the book argues, who it is for, the full price | Superlatives, claim words, countdowns, struck-through prices, "free" where anything is paid | "A twelve-week workbook on the Meditations. 12.00 GBP, or free with membership." |
| Author and studio portal | Plain, collegial | The fee breakdown, what happens next, dates | Jargon, "leverage", cheerleading | "Paid out every Friday once your balance reaches 10.00 GBP." |
| Content on a mental health shelf (tier standard or higher) | The author's register, never humorous | The author's own terms, examples with named characters | Jokes, irony, lightness about symptoms, exclamation marks | "Some days go wrong for reasons that are hard to name." |
| Content on every other shelf | The author's register | A light touch where the author has one | Jokes at the reader's expense; humour in an exercise prompt | "A list of six is for reading. One line is for living." |

## Saying sorry

"We're sorry." Then the fact, then the next step. Never "We'd like to apologise", "We apologise for any inconvenience" or "Apologies for". The lint flags the long forms. Say sorry once, where the fault is Akana's, and not at all where it is not (a declined card is a fact to state, not a thing to apologise for).

## Words we use

Workbook, not course or product. Exercise, not task or activity. Unit as the engine's word; a reader sees week, day, module or chapter. Toolkit, one word, never "toolkit cards". Help now, capital H, as the name of the safety screen. Membership, not subscription, in reader copy; the legal pages may say subscription where the law does. Answer, never response or submission. Sealed, for what we do with answers. Finished step, never streak. Pause, never freeze.

## Where this is enforced and where it is not

Enforced: every workbook string (validator), every email template (emails package guards), and interface strings when `--style` is run. Not enforced: metaphor, humour, and register. Those are the proofreader's and the reviewer's. When a line passes the lint and still sounds like a brochure, the lint is not wrong; the line is.
