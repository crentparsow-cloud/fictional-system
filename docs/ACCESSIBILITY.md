# Accessibility: automated sweep and manual pass

Thursday 8 October 2026. Feature F-144. Target: WCAG 2.2 level AA.

This page has two parts. The first says what the automated sweep checks and what it found. The second is the checklist for the manual pass with a keyboard, VoiceOver and TalkBack. The manual pass is for a person to run. An automated pass on its own is not enough, and the accessibility statement promised on `/trust` must only claim what the manual pass shows.

## 1. The automated sweep

### What it runs

`apps/web/e2e/a11y.spec.ts` runs axe (through `@axe-core/playwright`) with the WCAG 2.0, 2.1 and 2.2 A and AA rule tags. Every page is checked four times: light and dark, each at 320px wide (phone) and 1280px wide (desktop). A test fails on any serious or critical violation.

A second check on each page asks for one `main` landmark, one `h1`, and no content outside a landmark.

Pages checked on every run, local or remote:

- `/`, `/search`, `/search?q=sleep`
- `/help` and every topic in `content/help/` (7 today)
- `/trust`, `/pricing`, `/white-label`, `/organisations`, `/publish`, `/contact`, `/counting`
- `/takedown`, `/takedown/counter`
- `/legal/terms`, `/legal/privacy`, `/legal/cookies`, `/legal/refunds`
- `/public-domain/<code>` for every record in `content/public-domain/` (5 today)
- `/help-now`, `/help-offline`, `/sign-in`
- `/respond/<invalid token>`, `/studio/join/<invalid token>`, `/org/join/<invalid token>`
- an unknown path, which shows the 404 page

Pages that need catalogue data run only against a deployed site (`E2E_BASE_URL` set): `/themes`, `/authors`, the first Theme page, the first workbook page linked from it (`/w/<slug>`, or the one named in `E2E_WORKBOOK_SLUG`), and the first author page.

Signed-in pages (the player, Library, You, Studio, admin) are not in the automated sweep, because the suite never signs in. They are covered by the manual pass below until the signed-in test reader in `docs/TESTING.md` exists.

### How to run it

```
cd apps/web
pnpm e2e e2e/a11y.spec.ts                                    # local build, no data
E2E_BASE_URL=https://<preview>.vercel.app pnpm e2e e2e/a11y.spec.ts   # with data
```

For a preview behind deployment protection, also set `VERCEL_AUTOMATION_BYPASS_SECRET`.

### What it found on 8 October and what was fixed

| Finding | Rule | Where | Fix |
|---|---|---|---|
| Wide tables scrolled sideways at 320px but could not be reached with the keyboard | `scrollable-region-focusable` (serious, WCAG 2.1.1) | `/legal/cookies` and the two tables on every `/public-domain/<code>` page | Each table now sits in a named region that takes focus and scrolls (`.md-table` from `lib/markdown.ts`, `.pd-table-wrap` on the public-domain page). The tables also lost `display: block`, which strips table semantics in some screen readers. The same fix covers help centre and licence pages, which use the same Markdown renderer. |
| The 404 page had no `main` landmark and its heading sat outside any landmark | `landmark-one-main`, `region` (moderate) | Any unknown URL, and every `notFound()` | New `app/not-found.tsx` with a `main`, one `h1`, links home and to help, Help now and the info footer. |

No colour contrast, label, heading or name violations were found on the pages above, in either theme or at either width.

### What the sweep cannot tell you

axe finds roughly the machine-checkable part of WCAG. It does not judge focus order, whether focus moves sensibly between exercises, whether announcements make sense, whether text still works at 200%, or whether a screen reader user can finish a task. That is the manual pass.

## 2. The manual pass

Run it on the latest preview, signed in as a test reader with access to one wellbeing workbook that uses all field types (or the `/dev/player` page where it is enabled). Record each line as Pass, Fail (with a note) or Not tested. Raise every Fail as a defect, fix it, and record the retest.

Devices and software for the pass:

| Check | Device | Browser | Assistive technology |
|---|---|---|---|
| Keyboard | Windows or macOS laptop | Chrome and Firefox | None |
| VoiceOver | iPhone, latest iOS | Safari | VoiceOver |
| VoiceOver (desktop) | Mac | Safari | VoiceOver |
| TalkBack | Android phone | Chrome | TalkBack |

Write down the exact versions when you start.

### 2.1 Keyboard only (no mouse, no trackpad)

| # | Check | Expected |
|---|---|---|
| K1 | Tab from the top of `/`, `/help-now`, `/sign-in`, `/w/<slug>` and the player | Every link, button and field is reached, in reading order, with nothing skipped and nothing hidden receiving focus |
| K2 | The focus ring | Always visible, in light and dark, never hidden behind a sticky bar |
| K3 | Skip link on reader, Studio, organisation and tenant pages | First Tab shows "Skip to content" and Enter moves focus to the main content |
| K4 | Help now | Reachable within the first few Tab stops on every wellbeing page, and opens with Enter |
| K5 | Sign in | Email field, submit and any error can be completed and read without a mouse |
| K6 | Player: move between exercises and units | After Next or Back, focus lands on the new exercise heading, not at the top of the page or on the body |
| K7 | Player: short text, long text, checklist, scale 0 to 10, yes or no, time of day, ranked list, rating grid, weekly grid, two column | Each can be filled and changed with the keyboard alone. Ranked list order can be changed without dragging |
| K8 | Number and currency fields | Typing works, Up and Down change by one step, Shift with Up or Down by ten, and a figure out of range shows a message without losing the text |
| K9 | Table field | Tab moves cell by cell. "Add a row" puts focus in the new row. "Remove row" puts focus on the row above, or on "Add a row" |
| K10 | Decision matrix | Each score is one Tab stop and arrows change it. "Add an option" and "Remove" keep focus somewhere sensible |
| K11 | Dialogs and menus (account deletion, consent, checkout consent) | Focus moves into the dialog, stays there, Escape closes it, and focus returns to the control that opened it |
| K12 | Checkout consent boxes | Ticking with Space works, and the pay button explains why it is not yet available |
| K13 | Wide tables on `/legal/cookies` and `/public-domain/<code>` at 320px | The table region takes focus and scrolls with the arrow keys |
| K14 | No keyboard trap anywhere, including the Stripe checkout hand-off and back | Tab and Shift Tab always move on |

### 2.2 VoiceOver (iPhone, then Mac)

| # | Check | Expected |
|---|---|---|
| V1 | Rotor, headings, on `/`, `/help`, `/w/<slug>` and a player screen | One h1, then a sensible outline with no skipped levels that hides content |
| V2 | Rotor, landmarks | Main, navigation and footer are present and named where there are several |
| V3 | Help now button and the Help now page | Read as "Help now, link". Phone numbers read as numbers and dial when activated |
| V4 | Every form field in the player | Read with its label, any help line, whether it is required, and its current value |
| V5 | Number and currency fields | The unit or currency is read ("Amount in GBP"), not only shown as a symbol |
| V6 | Table field | Read as a table with its name. Each box is read with its column name. The total row is read with its label |
| V7 | Decision matrix | Each score is read with its option and criterion. The "Highest score so far" line is read as plain text, once |
| V8 | Saving | A save, or a failed save, is announced once and does not interrupt typing |
| V9 | Errors on sign-in, checkout consent and the enquiry form | The error is read when it appears and is linked to its field |
| V10 | Milestone and welcome-back notices | Read once, never as a count of days, and never repeated on every change |
| V11 | Images and icons | Covers and decorative icons are silent or have short, useful names |
| V12 | Demo badge and draft banners | Read as text, so a blind reader also knows a title is a demo or a page is a draft |
| V13 | Dark mode (Settings, Display) | Same results as light. Nothing becomes invisible |
| V14 | Text size at the largest Dynamic Type and with browser zoom at 200% | No text is cut off and nothing overlaps; pages reflow to one column with no sideways scroll except wide tables |

### 2.3 TalkBack (Android, Chrome)

Repeat V1 to V12 with TalkBack. Then check:

| # | Check | Expected |
|---|---|---|
| T1 | Explore by touch over the player | Every control has a name and a role; nothing reads as "unlabelled" |
| T2 | Selects in the decision matrix and the time field | The native picker opens and the chosen value is read back |
| T3 | Font size at the largest setting and display size at the largest | As V14 |
| T4 | Tap targets | Every button and link on reader screens is easy to hit; none smaller than 44px |

### 2.4 Settings that change the page

| # | Check | Expected |
|---|---|---|
| S1 | 320px wide, both themes, `/`, `/help-now`, `/w/<slug>`, the player | No sideways scroll on the page itself |
| S2 | Browser zoom 200% and text-only zoom 200% | Content reflows. Nothing is lost or overlaps (WCAG 1.4.4, 1.4.10) |
| S3 | Text spacing bookmarklet (line height 1.5, letter 0.12em, word 0.16em, paragraph 2em) | Nothing is cut off (WCAG 1.4.12) |
| S4 | Reduce motion on (iOS, Android, macOS) | No animation beyond simple fades, including the pacer ring |
| S5 | The reader's own appearance settings (font, text size, theme) on the You page | Each setting applies across the player and survives a reload |
| S6 | Windows high contrast (forced colours) | Focus rings, buttons and field borders are still visible |

### 2.5 Record and sign-off

| Item | Value |
|---|---|
| Tester | |
| Date | |
| Preview URL and commit | |
| Devices and versions | |
| Lines passed / failed / not tested | |
| Defects raised | |
| Retest date | |

Once the pass is complete, update the accessibility line on `/trust` and write the full accessibility statement from the actual results: what meets AA, what does not yet, and how to report a problem. Do not claim conformance that the pass did not show.
