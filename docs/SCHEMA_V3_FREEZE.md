# Schema v3 freeze: summary for approval

Thursday 8 October 2026. For Crent to approve today (F-107).

## What v3 is for

The schema is the shape every workbook file must follow. Version 1 assumed one thing: a 12-week wellbeing programme by Maya Vaughn. Version 3 keeps everything v1 had and turns the fixed parts into settings. One engine can then run a 4-week finance course, a 6-week parenting workbook and a 12-week wellbeing programme. All 20 Maya Vaughn workbooks already convert to v3 with no structure or reference errors. Their parked content findings are separate and still wait for you.

The schema only checks shape. Word limits, claim words, house style and per-genre rules sit in the validator, which can change without a schema change.

## What changed from v1

| Area | v1 | v3 | Why |
|---|---|---|---|
| Genre | None. Wellbeing assumed | One of 11 genres | Different rules per genre, such as the finance advice note |
| Language | None | Language code plus en-GB or en-US spelling | US editions and later languages |
| Demo flag | None | `is_demo` yes or no, plus a badge (4 kinds: official, made with author, public domain, demo) | Demo titles are labelled and cannot be bought |
| Programme length | Exactly 12 weeks | 1 to 52 units. A unit is a week, day, module or chapter | Short courses and long ones |
| Stage names | Exactly 4: Explore, Build, Practice, Keep | 0 to 6 stages, any names | Genres name their phases differently |
| Safety tier | standard or higher | none, standard or higher | A tier of none means no Help now and no health data consent |
| Daily check, self-check, check-in | All required | All optional. The self-check stays unscored on wellbeing titles | Many genres do not need them |
| Identity | Topic name and an internal id | Title first: title, AK- code, slug, author code, theme, licence reference, badge | Matches the naming board and the catalogue |
| Stable ids | Ids on exercises and fields | Same ids, now checked between versions (see below) | Saved answers attach to them |
| Author note | None | Optional author welcome note on the Start screen | Authors speak to readers in their own words |
| Field types | 10 | The same 10, plus 4 declared for week 3: number, currency, table, decision matrix | Finance, business and career exercises |
| Milestones | Free text trigger | 13 fixed trigger patterns. None counts days in a row | No streaks, by design |

Other additions, all optional: a free units setting (default 1), depth of content (4 levels, listing to full), a workbook status (7 values, template to retired), an advice note for finance and business, and an internal block that is never sent to a reader.

**Change made today.** The demo catalogue gives its 6 finance titles the advice note `money_guidance_not_advice`, which the schema did not accept. The schema now accepts it and stores it as `not_financial_advice`, the value the genre registry already gives finance. Nothing that passed before has changed. Reader copy: "This workbook is for learning. It is not financial advice."

## What freezing means

After you approve, the schema only grows. We may add new optional fields or new allowed values. We never rename or remove a field, and never make an optional field required. Ids are never reused. Once a workbook version is live, no exercise, field, unit, toolkit card or milestone id may disappear, and no id may be given to a different kind of thing.

A new check now enforces this. It compares each workbook with its last committed version and reports by code: `EXERCISE_REMOVED`, `FIELD_REMOVED`, `CHECKIN_FIELD_REMOVED`, `FIELD_TYPE_CHANGED`, `UNIT_REMOVED`, `TOOLKIT_REMOVED`, `MILESTONE_REMOVED`, `ID_REUSED` and `CODE_CHANGED`. Any change to a safety line gives `SAFETY_CHANGED`, which means safety sign-off must be done again. Safety lines are the safety tier, the advice note, the higher tier note, the extra safety note and the safety hub. Run it with `pnpm check:ids`. Today it reports 0 findings across the 20 workbooks.

## What stays open

- How the 4 week 3 field types draw on screen. Their shape is fixed now. Their renderers land in week 3.
- Any wording the lawyer changes in safety copy. That changes content, not the schema, and triggers `SAFETY_CHANGED` and a fresh sign-off.

## Questions for Crent

1. **Finance advice note.** Is "not financial advice" right for the 6 finance demo titles, or do you want separate "money guidance, not advice" wording? Separate wording is an additive change, but the Start screen needs one more line of copy.
2. **Provisional codes.** The 20 Maya Vaughn workbooks still carry AK- codes minted by us, marked provisional, because the naming board codes have not arrived. Swapping them later is fine while the titles are in review. After they go live a code never changes. Please send the board codes before any Maya Vaughn title goes live.
3. **What resets safety sign-off.** You asked for safety copy. We also count a change of safety tier or advice note. Keep both?

**Approve:** Schema v3.0 frozen as described above.

Initials: ________ Date: ________
