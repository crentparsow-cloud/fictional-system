DRAFT for review by a solicitor and an accountant. Not legal or tax advice. Prepared 25 November 2026.

# Compliance papers

These files answer the words and paperwork findings of the review of 21 November 2026 (H5, H6, M12, M13, M15, M16, M22, M24, M25, M31, M32). They were written from the code by an AI assistant, not by a solicitor or an accountant. Every one is an unsigned draft. Nothing here has been approved by anyone.

Where a fact is needed and is not in the repository, the file says "TO CONFIRM" or "TO COMPLETE". No name, number, date or reference has been made up. The DPIA, the breach plan and the corrections table each end with a list of their blanks.

## What each file is

| File | What it is | Who must review it | What makes it final |
|---|---|---|---|
| `dpia-draft.md` | A working draft of the data protection impact assessment for reader workbooks. It covers what data is held and whose, why, the lawful basis as the notice states it, health and faith data and the consent screens, sealing and who can unseal, the providers found in code, retention as built, risks, measures in place, measures still open, and the age gate options. | Solicitor. Owner. | The blanks filled, the open measures updated as fixes land, the ratings agreed, and step 7 signed and dated. |
| `breach-plan.md` | The incident and personal data breach plan. Part 1 is the plan on one page: prepare, identify, contain, assess, report within 72 hours of becoming aware, tell people, learn. Part 2 is first steps for this stack. Part 3 lists each secret and where it is rotated. | Solicitor for Part 1. Whoever runs the hosting accounts for Parts 2 and 3. Owner. | The roles table filled with names and out-of-hours contacts, the TO CONFIRM steps tried once, and the owner's sign-off with a date. Until roles are named, the owner holds all of them. |
| `breach-log-template.md` | The log to fill in for each incident, whether or not it is reported. | Solicitor. | Agreed as the format, and a place chosen to keep the log that survives loss of the site and the repository. |
| `legal-corrections.md` | A table of every statement in `docs/legal` that the review found untrue, unsupported or missing: current wording with file and line, why it is a problem, proposed wording or the decision needed, and who decides. It also holds the gift and bundle terms that match the code, the Online Safety Act and HMRC items, the questions for the solicitor and the accountant in plain words, and the list of sources. | Solicitor for sections A to G and I. Accountant for G2 and J. | Each row decided, the agreed wording written into `docs/legal`, and the draft banner removed from each page the solicitor approves. |
| `README.md` | This file. | | |

## What was changed in the public pages on 25 November 2026

Only changes that make a false statement true, with no new legal claim.

1. `docs/legal/privacy-notice.md`, line 47. "We have prepared a data protection impact assessment" became "We are completing a data protection impact assessment for this processing before launch". Do not change it back until `dpia-draft.md` is signed.
2. `docs/legal/cookie-statement.md`, line 23. "No third-party scripts ... on any page" now says what the code does when sign-in with Google is switched on. While it is off, no third-party script loads.
3. The legal pages no longer show "[support email]". The page fills the address from `EMAIL_REPLY_TO` when it is built, and points to the contact page while that is blank. The footer and the trust page leave the company number out until `NEXT_PUBLIC_COMPANY_NUMBER` is set. A unit test (`apps/web/lib/legal-render.test.ts`) fails if a legal page shows a square-bracket placeholder.

Every page keeps its DRAFT banner. Everything that needs a legal judgement is a proposal in `legal-corrections.md` and is not in the pages.

## What must be signed or settled before launch

This is the drafter's list from the review. The solicitor may add to it.

1. The company exists and its details are real: full legal name, company number, registered office. Set `NEXT_PUBLIC_COMPANY_NUMBER`. The pages state these as fact today and the code says they are not set (`legal-corrections.md`, rows 2 to 7).
2. The ICO data protection fee is paid and the registration number is known. The privacy notice says "We are registered" today.
3. The DPIA is signed (`dpia-draft.md`, step 7). The review says this must happen before wellbeing titles take answers from anyone outside the team.
4. The breach plan is adopted: roles named, log location chosen.
5. The solicitor has approved the reader terms, refund policy, privacy notice and cookie statement, including gift and bundle terms, and the draft banner is removed from each approved page.
6. The support address is set in `EMAIL_REPLY_TO` and the site is redeployed.
7. Decisions recorded, each with a name and a date: the age gate; win-back email; whether Google sign-in, Sentry and web push are on at launch; whether Ireland opens at launch; gift emails to people who are not users.
8. The solicitor's written view on the Online Safety Act.
9. The accountant's written view on HMRC platform operator reporting, seller of record and VAT.
10. A signed processor agreement and a transfer mechanism confirmed for each provider in use.

Do not switch Stripe to live payments until item 1 is done. That comes from the review (finding M12). The drafter suggests waiting for items 2 and 5 as well, since buyers are asked to accept those pages.

## Keeping these current

Update the DPIA when the processing changes: a new provider, a new market, a switch turned on, or a fix from the review landing. Update the breach plan when a role, a provider or a secret changes. A yearly review of both is suggested.
