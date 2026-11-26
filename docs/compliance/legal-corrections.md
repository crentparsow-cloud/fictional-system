DRAFT for review by a solicitor and an accountant. Not legal or tax advice. Prepared 25 November 2026.

# Corrections to the legal pages

Every statement in `docs/legal/*.md` that the review of 21 November 2026 found untrue, unsupported or missing, with the current sentence, where it is, why it is a problem and wording to put to the solicitor. The four files that readers see are rendered at `/legal/terms`, `/legal/privacy`, `/legal/cookies` and `/legal/refunds` (`apps/web/lib/legal-docs.ts`). Readers accept the terms and the refund policy at sign-up and checkout.

Line numbers are for `main` at 737f71e with the two edits of 25 November applied. Those two edits changed one line each and moved nothing.

Every "proposed wording" is a starting point for the solicitor. None of it is approved. Two rows (1 and 9) have already been changed in the files, because the old sentences were false. Row 12 is fixed in the application and the files are unchanged. All other rows are unchanged. Section H says who decides each row. Sections I and J are the questions for the solicitor and the accountant in plain words.

## A. Statements that were or are untrue

| # | Finding | File and line | Current sentence | Why it is a problem | Proposed wording for the solicitor |
|---|---|---|---|---|---|
| 1 | H5 | `privacy-notice.md:47` | Was: "We have prepared a data protection impact assessment for this processing and review it when the processing changes." | No assessment existed. The launch list shows it open. | CHANGED on 25 November 2026 to: "We are completing a data protection impact assessment for this processing before launch, and we will review it when the processing changes." Once the assessment is signed, the solicitor may want: "We have carried out a data protection impact assessment for this processing and we review it when the processing changes." Do not restore that wording until `docs/compliance/dpia-draft.md` is signed. |
| 2 | M25, M12 | `privacy-notice.md:9` | "The controller for the Akana marketplace is Akana Holdings, registered in England and Wales, registered office 128 City Road, London EC1V 2NX. We are registered with the Information Commissioner's Office." | The code says the company is not yet registered: `apps/web/lib/company.ts` line 11 reads "PLACEHOLDER until Akana Holdings is registered and the number is known". "Akana Holdings" has no "Limited" or other suffix, so it is not a full company name. The launch list shows the ICO fee as open. Both are stated as fact. | "The controller for the Akana marketplace is [full legal name], a company registered in England and Wales under number [company number], registered office [address]. Our registration number with the Information Commissioner's Office is [ICO number]." Publish only when all four are real. TO CONFIRM: legal name, number, registered office, ICO number. |
| 3 | M12, M25 | `reader-terms.md:5` | "Akana is run by Akana Holdings, a company registered in England and Wales, with its registered office at 128 City Road, London EC1V 2NX." | Same as row 2. The terms are a contract. A contract with a company that does not exist yet is a problem for the solicitor to advise on. | "Akana is run by [full legal name], a company registered in England and Wales under number [company number], with its registered office at [address]." |
| 4 | M12, M25 | `reader-terms.md:33` | "Akana Holdings is the seller of record for every purchase on the Akana marketplace." | Same entity point. Also see the accountant's questions on seller of record. | "[Full legal name] is the seller for every purchase on the Akana marketplace." |
| 5 | M12, M25 | `reader-terms.md:109` | "Akana Holdings, 128 City Road, London EC1V 2NX. Email [support email]." | Entity point, and a literal placeholder (row 12). | "[Full legal name], [address]. Company number [company number]. Email [real address]." |
| 6 | M12, M25 | `refund-policy.md:5` | "Akana is run by Akana Holdings, 128 City Road, London EC1V 2NX." | Entity point. | As row 3. |
| 7 | M12, M25 | `organisation-terms.md:5` and `:102`; `organisation-dpa.md:5`; `publish-with-akana-copy.md:104` | "Akana is run by Akana Holdings, a company registered in England and Wales, with its registered office at 128 City Road, London EC1V 2NX" (terms, line 5). "Akana Holdings, 128 City Road, London EC1V 2NX. Email [support email]." (terms, line 102). "... and Akana Holdings (**Akana**, the processor)." (DPA, line 5). "Akana Holdings is the seller of record." (publish copy, line 104). | Entity point in the documents organisations and authors see. | As row 3, in each place. |
| 8 | M24 | `privacy-notice.md:27` | "Progress emails, reminders, suggestions and news are sent only if you turn them on. You can turn each one off in your account at any time. Lawful basis: performing our contract for service emails; your consent for the rest." | The win-back email does not work this way in code. It goes to lapsed monthly members and one-off buyers unless they are on the opt-out list (`public.marketing_optouts`, migration 0055, lines 280 to 305). Nobody is asked to turn it on, and no opt-out is offered at purchase. The only way out is the unsubscribe link in the email itself. It is off today (`WINBACK_ENABLED` blank). So the sentence is true today only because the feature is off. "You can turn each one off in your account" is also not true of win-back: there is no account setting for it. | Option A, keep win-back off and leave the sentence. Option B, make win-back opt-in, and leave the sentence. Option C, keep it opt-out and say so: "If you have bought from us and are no longer a member, we may email you a few times a year about Akana. We tell you this when you buy and give you the chance to say no then. Every one of these emails has an unsubscribe link. We never send them to anyone using a wellbeing workbook." Option C needs an opt-out at checkout to be built first. The ICO's guidance on the soft opt-in says "You must offer the opt-out when you collect the contact details" and "Including an opt-out in an order confirmation email is not sufficient" (source 12). Which option, and whether the soft opt-in is available at all: question for the solicitor. |
| 9 | M22 | `cookie-statement.md:23` | Was: "No third-party scripts, pixels or tags on any page of any site on the platform. Our content security policy blocks them by construction." | False once Google sign-in is switched on. With `NEXT_PUBLIC_GOOGLE_CLIENT_ID` set, the sign-in component loads `https://accounts.google.com/gsi/client` as soon as it appears: when `/sign-in` opens, and on a `/try/<slug>` page when the sign-in step is shown at the end of the free unit. It does not wait for a click (`apps/web/components/auth/GoogleOneTap.tsx`, lines 40 to 73 and 101 to 117). It also shows Google's One Tap prompt. The policy also allows Stripe's script origin on every page (`apps/web/csp.mjs`, line 53), so "blocks them by construction" overstated it, although no page loads a Stripe script. | CHANGED on 25 November 2026 to: "No third-party scripts, pixels or tags, with one exception. If sign-in with Google is switched on for the site, Google's sign-in script loads from accounts.google.com when you open the sign-in page, and when the sign-in step appears at the end of a free first unit. It loads whether or not you choose Google, and on no other page. While sign-in with Google is switched off, no Google script loads anywhere. Our content security policy allows scripts from our own site, from Google on those two pages only, and from Stripe, our payment provider. No page loads a Stripe script today: you pay on Stripe's own page." The brief suggested saying the script loads only if the reader chooses Google. The code does not do that, so the statement describes what the code does. Questions for the solicitor: whether Google's script sets or reads anything on the reader's device that needs consent under the cookie rules, and whether the statement's "there is no cookie banner" position survives switching Google sign-in on. A code change to load the script only after a click would make the simpler sentence true. |
| 10 | M22 | `privacy-notice.md:33` | "We do not place advertising or analytics trackers on any page." | Supportable as written. Noted because Sentry, if switched on, receives error events from the reader's browser with the user id and page path (`apps/web/lib/sentry-scrub.ts`, line 100). That is error tracking, not analytics, but a reader may not see the difference. | Keep, and add the Sentry line in row 14 if Sentry is to be used. |

## B. Placeholders and the draft banner (M12)

| # | File and line | Current text | Why it is a problem | Proposed wording or fix |
|---|---|---|---|---|
| 11 | Line 1 of `reader-terms.md`, `refund-policy.md`, `privacy-notice.md`, `cookie-statement.md`, `organisation-terms.md`, `organisation-dpa.md`, `privacy-notice-organisations.md`, `publish-with-akana-copy.md` | "DRAFT. Wording prepared 21 October 2026, to be reviewed before launch." | The page shows this banner to every reader, above terms they are asked to accept at checkout. A buyer is agreeing to a document marked as a draft. | Remove the banner from each file only when the solicitor has approved that file. Replace with "Last updated [date]." The privacy notice's section 11 already says "The date at the top shows when it was last changed", and there is no such date today. Until then, do not switch Stripe to live. |
| 12 | `privacy-notice.md:13`, `:88`, `:100`; `reader-terms.md:27`, `:109`; `refund-policy.md:35`; `organisation-terms.md:102` | "[support email]" in each, for example "Tell us straight away at [support email] if you think someone else has used your account." | The literal text "[support email]" is shown to readers. The refund policy tells a buyer to email an address that is not there. The app knows the address when `EMAIL_REPLY_TO` is set (`supportContact()` in `apps/web/lib/help.ts`), but the legal page prints the file as written. | FIXED in the application on 25 November 2026. The files still say "[support email]", so the solicitor reads plain text. The page fills it when it is built (`apps/web/lib/legal-render.ts`). With `EMAIL_REPLY_TO` set, the reader sees the address as a link. While it is blank, the sentence points to the contact page instead, for example "write to us through our contact page". A unit test fails if any of the four pages shows a square-bracket placeholder. The help, trust, accessibility, publish and contact pages and the site footer were changed the same way. The pages are built at deploy, so the address appears after the next deploy once the variable is set. TO CONFIRM: the support address. Question for the solicitor: whether a contact form alone is enough in the terms and the privacy notice, or a real address must be there before launch. |
| 13 | `author-licence.md:1`, `:9`, `:34` | "DRAFT for the lawyer. Not approved. No real author or publisher may sign this version." "... and [company name], a company registered in [country] under number [company number] (\"Akana\")." "... are set out in [schedule to be drafted]." | Already marked as not for signature. Listed so the solicitor has the full set. The author licence is not one of the four pages readers see. Until 25 November 2026 the site footer and the trust page printed "Company number [company number]" while `NEXT_PUBLIC_COMPANY_NUMBER` was blank. They now leave the company number out until it is set. | Solicitor to complete the licence. Owner to set the company number once the company is registered. |

## C. Things the pages do not say and should (M13, M22, M25, M31, and gaps found while drafting)

| # | Finding | Where it should go | What is missing | Why it matters | Proposed wording for the solicitor |
|---|---|---|---|---|---|
| 14 | M22 | `privacy-notice.md`, section 4, after line 56 | Google and Sentry are not named as recipients. Both exist in code and switch on when a variable is set. | A recipient the notice does not name. | If Google sign-in will be used: "**Google**: if sign-in with Google is switched on, Google's sign-in script loads on our sign-in page, so Google receives your IP address and browser details when you open that page. If you choose to sign in with Google, Google tells us your email address and name. Google is an independent controller for its own sign-in service." If Sentry will be used: "**Sentry**: error reports, so we can find and fix faults. A report holds the page address, technical details of the error and your account's internal id. It never holds what you write, your email address or your IP address." Whether Google is a controller or processor here, and Sentry's hosting region: questions for the solicitor. The simpler course is to keep both off at launch and add the lines before either is switched on. |
| 15 | M22 | `privacy-notice.md`, section 4 | Web push services are not named. When a reader turns on the daily notification, the server calls the push service run by the maker of the reader's browser. The call has no body. | A third party is contacted about a reader's device. | "**Your browser's notification service**: if you turn on the daily notification, we ask the notification service run by your browser's maker (for example Google, Mozilla or Apple) to wake your device. We send no message content, only the signal. The words you see are already on your device." |
| 16 | M25 | `privacy-notice.md`, sections 1, 5 and 10; `reader-terms.md:105` | Ireland is a launch market priced in euro (`apps/web/lib/markets.ts`, lines 81 to 88). The notice is "written to the shape of the UK GDPR" (line 5) and says nothing about the EU GDPR, an EU representative or an EU supervisory authority. The market carries a label `legal: "eu"` that nothing in the code reads. | If selling to people in Ireland means the EU GDPR applies, the notice is incomplete for them. | No wording proposed. This is a decision first: either do not open Ireland at launch, or take advice on the EU GDPR, an EU representative and the notice wording. See the solicitor's questions. |
| 17 | M13 | `refund-policy.md`, new section after section 2; `reader-terms.md`, new section after section 5 | Gift memberships are sold and neither document mentions them. | A product with no cancellation or refund terms. | See section D below. |
| 18 | M13 | Same | Theme bundles are sold and neither document mentions them. | Same. | See section D below. |
| 19 | M31 | `privacy-notice.md`, section 2 | The notice is addressed to readers. It does not say what happens to the details of someone who is not a user: a gift recipient, the recipient of a sent workbook, or a check-in partner. | Those people's email addresses are stored and they are emailed. | "**If someone gives you a gift or names you as their check-in partner.** We hold your email address, and your name if they gave it, to send you the invitation. If you do not take it up, we delete your address when the invitation expires. We do not add you to any list." The retention part must be checked against the code for each feature before use. For check-in partners, declined and reported addresses are kept as a hash so the same address is not invited again (migration 0012). See section E for what the gift emails contain. |
| 20 | Found while drafting | `privacy-notice.md`, section 3 | Section 3 covers health only. The app also asks for explicit consent before the first workbook on the Faith and Spirituality shelf, because it may reveal religious belief (migration 0015, `apps/web/lib/consent.ts`). The notice does not mention religious belief. The notice for organisation members has a "Health and faith" paragraph (`privacy-notice-organisations.md:22`). The reader notice has none, although the post-build list marks "Privacy notice line about religious belief" as closed. | Special category data processed and not described. | "Some workbooks are about faith. Using one, or what you write in it, may reveal your religious beliefs. That is also special category data. Before you open your first faith workbook we ask for your explicit consent, separately from the consent for wellbeing workbooks. You can withdraw it at any time from your account." |

## D. Proposed gift and bundle terms that match the code (M13)

These describe what the code does today. Whether what the code does is what the law requires is the solicitor's question. Where the code leaves a gap, it is listed as a decision.

**What the code does: gift memberships** (`apps/web/lib/gift.ts`, `apps/web/lib/gift-webhook.ts`, `apps/web/app/api/checkout/gift/route.ts`, migrations 0054, 0068 and 0072).

1. The buyer must have an account. They pay once through Stripe Checkout. There is no subscription and nothing renews.
2. Lengths are 1, 3, 6 or 12 months. The price is the membership price multiplied out, with 12 months at the annual price.
3. At checkout the buyer accepts the reader terms. The gift checkout does not ask for, or record, the "start right now" acknowledgement that the single workbook and membership checkouts record.
4. When payment succeeds, the recipient is emailed a claim link. The buyer gets a note that it has gone.
5. The recipient has 365 days from payment to claim (`gift_claim_days` in `app_config`). After that the gift expires, its link and the recipient's address are deleted, and the code makes no refund.
6. On claim, the membership library opens for the gift's length from that moment. A second gift adds its length to the end of the first.
7. When the gift ends, the recipient's account goes back to the free state and their answers stay readable.
8. Refunds are made by staff in Stripe. There is no self-service cancel or refund for a gift. A full refund ends the gift at once, whether or not it has been claimed. If it has been claimed, that gift's remaining time is taken off the recipient's access. A partial refund changes nothing automatically and is left to staff. A card dispute is treated like a full refund.
9. If the buyer deletes their account, the names, message and address on the gift are removed (migration 0067).

**Proposed wording, gift memberships, for the refund policy.**

"**Gift memberships.** You pay once and nothing renews. The person you choose gets an email with a link to claim the gift. They have 12 months from the day you pay to claim it.

You can cancel a gift within 14 days of buying it and get a full refund. Email [support email]. If the gift has already been claimed, the membership it gave ends when we refund you.

After 14 days we do not refund a gift, unless something went wrong on our side. A gift that is not claimed within 12 months ends and is not refunded.

A gift cannot be exchanged for money by the person who receives it."

**Decisions the gift wording depends on.**

- Whether a full refund within 14 days, claimed or not, is the right offer. It is what the code can do without change. The alternative, a refund less the days used once claimed, would need the refund to be worked out by staff by hand, because the code acts only on a full refund.
- Whether a gift that is never claimed should be refunded, in whole or part, rather than kept. The code keeps the money. The solicitor should say whether that term is fair.
- Whether "12 months" should be stated as 365 days, to match the code exactly.
- Whether the buyer or the recipient holds the consumer rights once the gift is claimed.
- Whether the gift checkout needs its own pre-payment wording, since it records no "start right now" acknowledgement today.

**What the code does: Theme bundles** (`apps/web/lib/bundle.ts`, `apps/web/lib/bundle-webhook.ts`, `apps/web/app/api/checkout/bundle/route.ts`, migration 0055).

1. A bundle is every live, priced workbook on one Theme, sold together at a price staff set. It is priced in pounds only.
2. It is offered only to a reader who owns none of the titles, and only when it costs less than buying them one at a time. Both prices are shown.
3. At checkout the buyer accepts the reader terms and ticks the same "start right now" acknowledgement as for a single workbook. The version ticked is recorded.
4. Payment opens every title in the bundle at once.
5. A full refund closes access to every title the bundle opened. Titles the buyer owned another way are not touched. A partial refund changes nothing automatically. A card dispute is treated like a full refund.
6. The migration notes that nothing about a bundle is written to the royalty ledger yet. Authors are therefore not credited for bundle sales in code today. That is a commercial and accounting point, raised in the accountant's questions.

**Proposed wording, bundles, for the refund policy.**

"**Bundles.** A bundle is several workbooks on one Theme sold together for one price. Before you pay we ask you to confirm the same thing as for a single workbook: that you want access to start right now and that this ends your 14-day right to cancel.

Changed your mind? Ask us within 14 days of buying. If you have not gone beyond week 1 in any workbook in the bundle, we will refund the whole bundle. We cannot refund one workbook out of a bundle. This is goodwill, on top of your legal rights.

If we refund a bundle, access to every workbook it gave you ends. Your own answers stay in your account and you can still export them.

If one workbook in a bundle is faulty, misdescribed or withdrawn, you have the same rights for that workbook as if you had bought it on its own."

**Decisions the bundle wording depends on.**

- The last paragraph promises a remedy for one title. The code cannot refund one title of a bundle automatically, so staff would do it by hand as a partial refund and adjust access by hand. Confirm that is acceptable or change the promise.
- Whether one acknowledgement can cover several items of digital content bought together.

**"Send this workbook"** (migration 0053). A paying member can give one workbook a quarter to someone who has never paid Akana. No money changes hands with the reader, so there is nothing to refund. The claim window is 30 days. The solicitor may want one sentence in the terms saying the gift is free, cannot be exchanged and lapses if unclaimed.

**For both documents**, section 4 of the reader terms ("Free first unit, purchases and immediate access") and section 5 ("Membership") should each point to the new gift and bundle wording.

## E. The gift emails to people who are not users (M31)

There are two emails, and they differ.

**1. "Send this workbook"** (`packages/emails/src/gift.ts`). Sent when a member gives a workbook. What the recipient gets today, in full:

- Subject: "A workbook has been sent to you on Akana" (the brand name is filled in).
- Preheader: "No card and nothing to pay."
- Headline: "A member has sent you a workbook".
- Body: "A member of Akana chose to give you a full workbook. Akana turns published books into guided workbooks you do a step at a time, in your own words." Then: "You do not need a card, and nothing renews. Sign in or make an account, and it is yours to keep."
- A button, "Claim your workbook", with the claim link.
- "This link works until [date]." and "If you were not expecting it, you can ignore this email."
- Footer: "Sent by Akana for a member who chose to give you a workbook. Questions: [support address, or 'reply to this email']."

It does not name the giver or the workbook. It carries no free text from the giver. It is sent with the "service" footer, which has no unsubscribe link. There is no way for the recipient to say "do not email me again".

**2. Gift membership** (`gift_received` in `packages/emails/src/reader.ts`). Sent when someone buys a gift membership. Subject: "A gift for you: [length] of membership". It names the sender as the buyer typed it, and shows the buyer's own message of up to 300 characters as a quote. It says "If you would rather not have it, ignore this email." It also uses the service footer with no unsubscribe link. The daily upkeep job can send it again if the first attempt failed.

**Why it is a question.** The second sentence of the first email describes what Akana is. The recipient did not ask to hear from Akana. The member is offered the feature by Akana. The ICO's guidance says "You're likely to be instigating if you encourage, incite, incentivise or ask someone else to send" electronic mail containing your direct marketing, and "You must not rely on the soft opt-ins for 'refer a friend' schemes" (source 12, read 25 November 2026). Here Akana sends the email itself, at the member's request.

**Questions for the solicitor** (repeated in the solicitor's list): is either email direct marketing; if so, on what basis can it be sent to someone who has not consented; and does each need a way to stop further emails. The review's proposed fix is a "do not email me again" link and a block list held as a hash. A plainer first email, with the sentence describing Akana removed, is another option to ask about.

## F. Related statements being corrected by other fixes

Listed so the solicitor sees the whole picture. They belong to other batches of the fix plan and are not changed here.

| Finding | File and line | Statement | State of the code at the review |
|---|---|---|---|
| M23 | `cookie-statement.md:9` and `:13`; `privacy-notice.md:96` | "We use one kind of cookie: the cookie that keeps you signed in." "We use only the cookies we need to sign you in." | The review found two more cookies that are not in the table, one being the counting opt-out cookie `akana_no_count`, and that `/counting` is linked from no page. |
| M20 | `privacy-notice.md:71` | "Consent and acceptance records: kept for as long as we need to show that consent was given, and for 6 years after your account is deleted." | Health and faith consent are kept as current state only. Withdrawal and deletion erase them. |
| M19 | `privacy-notice.md:79` to `:80` | The rights of access and export. | The export leaves out profile, purchases, subscriptions, entitlements, consents, progress, settings and support messages. |
| M18 | `privacy-notice.md:82` | "**delete** your account and your data, from your account, with a 7-day undo" | Deletion fails for a person who also invited, submitted or uploaded as an author, organisation admin or staff member. |
| M21 | `privacy-notice.md:66` to `:73` | The retention list. | No period is set for leads, support messages, takedown notices, the audit log, the roster archive or unsubscribed newsletter rows. The daily counts are kept 13 months and are not in the list. |
| M11 | `reader-terms.md:49`; `refund-policy.md:23` | "If you cancel within 14 days of your membership starting ..." | The cancel page and the webhook counted the 14 days from different dates. |
| M10 | `refund-policy.md:53` | "we may suspend access to the workbook while the dispute is open" | The code did not suspend access on a dispute for a workbook or membership. |

One more statement outside `docs/legal`, for the same reason as row 9: `apps/web/lib/pricing-page.ts` line 227 says "There are no advertising trackers, pixels or third-party scripts on Akana." It becomes untrue on the sign-in page when Google sign-in is switched on. It is application copy and was not changed in this batch.

## TO CONFIRM list for this document

1. Full legal name of the company, company number, registered office.
2. ICO registration number, once the fee is paid.
3. The support email address.
4. Whether Google sign-in, Sentry and web push will be on at launch.
5. Whether Ireland opens at launch.
6. Which win-back option (A, B or C).
7. The gift decisions and the bundle decisions in section D.
8. Whether a contact form is enough in place of a support address until the address is set.
9. The Online Safety Act view (section G1).
10. The HMRC platform reporting view (section G2).
11. The age gate decision (section G3).

## G. Three items with no wording in the legal pages (M15, M16, M32)

### G1. The Online Safety Act view (M15)

**Current position, with file and line.** `docs/planning/AK_Post_Build_List.md:68` reads: "L11 | Online Safety Act view on group features and the check-in partner's level 3 note | Plan O21; Questions N14 | Open | No". The last column is "needed for launch". `docs/LAUNCH_CHECKLIST.md:63` lists the same view under the lawyer's scope "before faith titles or any organisation go live". No legal page mentions the Act.

**Why it is a problem.** The view is marked as not needed for launch, while features that pass one person's words to another are built. The planning note (`docs/planning/AK_Questions_for_Crent.md:285`) says shared free text "would very likely bring Akana into scope" and is itself marked "[check legal]". Nobody qualified has looked.

**What the code does today**, so the solicitor can judge from facts:

| Feature | What one person can send another | Where |
|---|---|---|
| Gift membership | The buyer's name and a message of up to 300 characters, emailed to an address the buyer types. The recipient need not be a user. | Migration 0054; `gift_received` in `packages/emails/src/reader.ts` |
| Check-in partner | The reader's note of up to 200 characters, emailed to a partner with no account. The database refuses links, "@" and angle brackets in the note (`0012`, lines 64 to 65). The partner can reply with up to 280 characters. | Migration 0012 |
| Do a programme with a friend | Whether the other finished a step today, and a nudge chosen from a fixed list. No free text. Off unless the `programme_friends` flag is on. Not available on wellbeing titles. | Migration 0066 |
| Organisation groups | A check-in of three fixed choices. No free text. Leaders see counts. | Migration 0028 |
| Send this workbook | No free text and no sender name. | Migration 0053; `packages/emails/src/gift.ts` |
| Reader answers | Never shown to another user. | `packages/seal` |

Nothing in the code lets a reader post text that other readers browse. The free text that exists goes from one person to one named person, by email or inside a pair.

**Decision needed.** Whether any of these makes Akana a user-to-user service under the Act. If yes, what duties apply at this size and what must exist before launch (for example a risk assessment, terms and a reporting route). If no, a short written note saying why, kept with these papers. No wording is proposed here.

**Safest course until advised.** Keep `programme_friends` off. The owner may also choose to ship gifts without the free message until the view is in. That is a product decision and nothing has been changed in code.

**Who decides.** Solicitor advises. Owner decides what ships.

### G2. HMRC reporting by platform operators, for author payouts (M16)

**Current position.** Nothing. No document, list or code mentions it. The review marks this as suspected, to confirm with the accountant.

**Why it is a problem.** Akana collects money from readers and pays a share to authors and publishers through Stripe Connect. The United Kingdom has reporting rules for digital platforms, based on the OECD model rules, under which some platform operators must collect details about the sellers they pay and report them to HMRC each year. The drafter has not checked the current HMRC guidance and does not know whether licensing a book to Akana for a revenue share is an activity those rules cover. If it is, Akana would need to collect and check seller details that the app does not ask for today.

**What the code does today.** Authors and publishers connect a Stripe account to be paid (`apps/web/lib/money/studio-payments.ts`, migration 0014). Stripe collects identity details for its own purposes. Akana's database holds the ledger of what each rights holder is owed (migration 0021) and monthly statements (`apps/web/lib/money/statement.ts`). Akana does not itself collect a tax identification number, date of birth or address for authors. Payout runs refuse anything but a Stripe test key today, so no real payout has been made by this code.

**Decision needed.** Whether Akana is a reporting platform operator for these payments. If yes: what must be collected from each author and by when, whether Stripe's records can be used, the first reporting date, and what authors must be told. Also whether the same or similar rules apply for authors in other countries.

**Who decides.** Accountant advises. Owner decides. The solicitor should see the answer, because the author licence and the privacy notice would need a line on it.

### G3. The self-declared age gate (M32)

**Current wording and code.** `docs/legal/reader-terms.md:11`, section 1, reads: "Akana is for adults. You must be 18 or over to create an account, buy a workbook or take out membership. We ask you to confirm this when you sign up." The gate in code is one tick at sign-up, which sets `profiles.adult_confirmed_at` (`apps/web/app/(auth)/welcome/action.ts`, line 30). Nothing else checks age.

**Why it is a problem.** Some titles are about mental health and the first unit is free with an account. A tick may not be enough to show that children are unlikely to use the service. If children are likely to use it, the ICO's Children's code applies.

**Proposed wording or decision.** No wording. The four options are set out in `docs/compliance/dpia-draft.md`, step 6.3, with a blank line for the decision, the reason and who made it.

**Who decides.** Owner decides, on the solicitor's advice. The decision is recorded in the DPIA before it is signed.

## H. Who decides each item

"Owner" means the person who owns Akana. Where a row says "solicitor advises", the owner still makes the final choice and should have the advice in writing.

| Rows | Subject | Who advises | Who decides |
|---|---|---|---|
| 1 | The DPIA sentence in the privacy notice | Solicitor | Owner, when the DPIA is signed |
| 2 to 7 | Company name, number, registered office, ICO registration, "seller of record" | Solicitor on the wording. Accountant on the entity and seller of record. | Owner. The facts come from Companies House and the ICO once registered. |
| 8 | Win-back email, options A, B or C | Solicitor | Owner |
| 9, 10, 14, 15 | Google sign-in, Sentry and web push: named in the notice, or kept off | Solicitor on the wording and the cookie rules | Owner on whether each is switched on |
| 11 | Removing the draft banner | Solicitor, file by file | Owner |
| 12 | Support address | None needed for the address. Solicitor on whether a contact form is enough. | Owner |
| 13 | Author licence blanks and the revenue schedule | Solicitor. Accountant on the schedule. | Owner |
| 16 | Ireland, euro pricing and the EU GDPR | Solicitor | Owner |
| 17, 18 and section D | Gift and bundle cancellation and refund terms | Solicitor. Accountant on how refunds and unclaimed gifts are treated in the accounts and for VAT. | Owner |
| 19 and section E | Gift emails to people who are not users | Solicitor | Owner |
| 20 | Religious belief in the reader notice | Solicitor | Owner |
| G1 | Online Safety Act view | Solicitor | Owner |
| G2 | HMRC platform operator reporting | Accountant | Owner |
| G3 | Age gate | Solicitor | Owner |
| Section F | Statements being corrected by other fixes | Solicitor reviews the corrected wording | Owner |

## I. Questions for the solicitor, in plain words

1. The company. The pages name "Akana Holdings" at a London address and say it is registered and is registered with the ICO. The code says the company is not registered yet. What must be true, and what must the pages say, before anyone is asked to accept the terms or pay?
2. The impact assessment. Please review `dpia-draft.md`. Is explicit consent the right condition for health and for religious belief, and do the consent screens meet it? Is another condition or a policy document needed? Is the processing large scale?
3. Lawful bases. The notice gives contract and consent for the same data in places. Is each basis in the notice right?
4. Controller or processor. Which is Akana for a reader who joins through an organisation's seat, and on a publisher's white-label site?
5. Providers. Is each provider (Supabase, Vercel, Stripe, Resend, and Google and Sentry if used) a processor or a separate controller, is a proper contract in place with each, and which transfer mechanism covers each one? Is the notice's sentence about transfers accurate?
6. Naming recipients. If Google sign-in, Sentry or web push are switched on, is the proposed wording in rows 14 and 15 right? Does Google's sign-in script need consent under the cookie rules, and does the "no cookie banner" position survive?
7. Win-back email. Can it be sent on an opt-out basis at all? If so, what must be offered at checkout? Which of options A, B or C?
8. Ireland. Does selling in euro to readers in Ireland bring the EU GDPR and a need for an EU representative? Should Ireland wait?
9. Gifts and bundles. Is the proposed wording in section D right? Is keeping the money for an unclaimed gift fair? Who holds the consumer rights once a gift is claimed? Does the gift checkout need its own pre-payment wording? Can one acknowledgement cover a bundle?
10. Gift emails to people who are not users. Is either email direct marketing? On what basis can it be sent? Does each need a way to stop further emails? What must non-users be told about their data?
11. Online Safety Act. Does the gift message, the check-in partner note and reply, or anything else in section G1 bring Akana into scope? If so, what is needed before launch?
12. Children. Is a self-declared tick enough to support a decision that children are unlikely to use the service? Which option in the DPIA, step 6.3?
13. Sealed answers. Nobody at Akana can read what a reader writes, including a disclosure of risk. Is that position acceptable for mental health titles, with the Help now measures?
14. Breach plan. Please review `breach-plan.md`. Is the 48-hour promise to organisations right, and what should be promised to publishers?
15. Data protection officer. Is one required?
16. The draft banner. When may it come off each page, and what "last updated" date goes on?
17. A contact form in place of an email address in the terms and notice: is that enough until the address exists?

## J. Questions for the accountant, in plain words

1. HMRC platform reporting. Does Akana have to report author and publisher payouts to HMRC as a platform operator? If so, what must be collected from each author, by when, and when is the first report due? (Section G2.)
2. Seller of record. The pages say Akana is the seller of every purchase. Is that the right position for VAT in each market the code prices for (United Kingdom, United States, Canada, Australia, Ireland, New Zealand and the rest of the world), and what registrations does it need?
3. Gift memberships. How should the money for a gift be treated before it is claimed, when it is claimed and if it is never claimed? When is the VAT due?
4. Bundles. The code does not credit authors for bundle sales yet (migration 0055 notes that nothing about a bundle is written to the royalty ledger). How should bundle money be shared and recorded?
5. Refunds. The proposed revenue share is worked out on "net receipts, after tax, payment fees and refunds" (`apps/web/lib/company.ts`). Is the treatment of refunds, disputes and VAT on refunds right, in the accounts and in what authors are paid?
6. The entity. Which company trades, from what date, and what must be in place (registration, VAT, bank, Stripe account in the company's name) before live payments?
7. Records. Purchase rows are kept after an account is deleted, with the link to the person removed. For how long must they be kept?
8. Author payouts abroad. Is any tax to be withheld from royalties paid to authors outside the United Kingdom?

## Sources

Read on 25 November 2026 through a web fetch tool that returns extracts or answers about a page. Quotations in sources 2 and 6 were checked a second time the same day and matched. The others were read once. Check each quotation against the live page before relying on it. The ICO pages carry a notice that the guidance is under review following the Data (Use and Access) Act 2025.

1. ICO, "How do we do a DPIA?": https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/data-protection-impact-assessments-dpias/how-do-we-do-a-dpia/
2. ICO, "Data protection impact assessments" (guide to accountability and governance): https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/guide-to-accountability-and-governance/data-protection-impact-assessments/
3. ICO sample DPIA template (the file could not be read as text): https://ico.org.uk/media2/migrated/2553993/dpia-template.docx
4. ICO, "72 hours: how to respond to a personal data breach": https://ico.org.uk/for-organisations/advice-for-small-organisations/personal-data-breaches/72-hours-how-to-respond-to-a-personal-data-breach/
5. ICO, "UK GDPR data breach reporting (DPA 2018)": https://ico.org.uk/for-organisations/report-a-breach/personal-data-breach/
6. ICO, "Personal data breaches: a guide": https://ico.org.uk/for-organisations/report-a-breach/personal-data-breach/personal-data-breaches-a-guide/
7. ICO, Children's code, "Services covered by this code": https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/services-covered-by-this-code/
12. ICO guidance on direct marketing by electronic mail, the parts on the soft opt-in and on instigating. The page address was not recorded when the quotations in rows 8 and section E were taken: TO CONFIRM the page and the wording before relying on them.

Numbers 8 to 11 are not used. The numbering was set by the first drafting pass and is kept so the references in the other files stay right.
