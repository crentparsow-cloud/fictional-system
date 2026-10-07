# Akana Business: research and advice

Version 1, Wednesday 7 October 2026. Research note for Crent. Not a decision record.

Akana Business means organisations using Akana with their people: businesses (staff wellbeing, leadership, onboarding, team development), churches (discipleship, Bible study, courses) and small groups (book clubs, peer groups, community groups). This note covers the market, the product shape, safeguarding and data, pricing, billing and a phased build plan with database changes.

Inputs read first: `docs/planning/AK_Architecture.md`, `AK_Feature_List.json` (F-009, F-030, F-042, F-054, F-055, F-066 to F-079, F-095, F-097, F-100, F-104, F-106, F-126, F-127, F-129, F-130, F-133), `AK_3_Week_Plan.md`, `AK_Questions_for_Crent.md` (C10, D1 to D7), `docs/TENANT_RESOLUTION.md`, migrations 0001 to 0010, `apps/web/lib/membership.ts`, `docs/legal/*.md` and `docs/DAY_LOG.md` to Day 6.

Rules for this note. Every external figure has a source and the date it was read. All prices were read on 7 October 2026 unless stated. Figures in section 4 marked **Proposal** are suggestions for Crent to accept or change. They are not evidence. Points that need a lawyer or accountant are marked [check legal] or [check accountant]. Points that need Crent are marked [Crent].

One gap in the inputs. The day log ends at Day 6 and does not yet describe the check-in partner feature now being built. The uncommitted working files show it: `0011_membership_reminders.sql` and `0012_checkin_partners.sql` (F-030). In 0012 a reader has one partner with no account, who acts only through single-purpose hashed token links. The partner never sees answers, titles or Themes. Share level 1 sends the stage reached by number, level 2 adds a gentle question, level 3 adds a short note the reader writes. Wellbeing progress is shared only if the reader ticks it. Invitations and updates are rate limited in the database, and audit rows never hold a name, address or note. Akana Business starts at migration 0013 and reuses these patterns.

## Summary

1. The demand is real, and buyers pay for three things: content their people will use, an admin who can see uptake, and privacy they can promise to staff or members. No comparable shows employers or churches reading individual answers. The selling point is that Akana will not let them.
2. Prices are public at the small end and hidden at the large end. Churches pay flat site licences in attendance bands. Businesses pay per seat, billed yearly. Book club tools charge per club.
3. About a third of the plumbing is already in the codebase: organisations, tenants and branding, fixed roles, tenant memberships, a reserved `team_seat` entitlement source, the subscription mirror, suppression thresholds and the audit log. Groups, group pace, invitations, seat licences, facilitator guides and organisation billing are all new.
4. The church offer cannot launch yet. Akana has no faith genre and no faith titles in its eleven genres. Churches can only use general titles until Christian titles are licensed.
5. Free-text sharing inside groups would probably make Akana a user-to-user service under the Online Safety Act. The MVP keeps discussion in the room or on the call, and group check-ins are fixed choices only.
6. Week 3 has no slack. The honest recommendation is a manual-sales pilot at launch (seats, invitations, a minimal admin view, the DPA) and groups about two to three weeks after launch.

## 1. Market and comparables

### 1.1 Workplace learning and wellbeing

| Product | What the buyer gets | Price found | Terms found | Source |
|---|---|---|---|---|
| Blinkist for Business | Book summaries for staff, admin, uptake reports | "from €8 per user/month". Team plan for 5 to 50 people, bought online. Enterprise (50+) by quote. | Billed once a year, per seat. Auto-renews. Seats can rise at any time, fall only at renewal. Cancel any time, access to period end. | blinkist.com/business/pricing |
| Coursera for Teams | Course library for up to 499 users | £297.97 per user per year, minimum 2 seats (£595.94), as shown on Coursera's page on 3 August 2026. Coursera's own page loads the price by script, so this comes from a third-party write-up. | 14-day money-back guarantee. Invoice, card or PayPal. Enterprise (500+) by quote with a minimum annual contract. | marcandrews.com (updated 3 August 2026); coursera.org/business/compare-plans |
| Headspace for Work | Meditation and wellbeing app for the whole workforce | Not public. Vendr reports list prices of $24 to $36 per employee per year for 100 to 300 employees, $18 to $28 for 300 to 1,000, and $12 to $20 above 1,000. Median annual spend $9,761 across 33 deals. | 58% of first purchases are annual. Multi-year deals get 15 to 25% better pricing. | vendr.com/marketplace/headspace (updated February 2026) |
| Unmind | Workplace mental health platform | Quote only. Spill describes Unmind as "enterprise quote-based". | Not public. | spill.chat/eap-review/unmind (2026) |
| Spill (for contrast) | Workplace therapy and support | "from £75 a month" | "rolling 30 day contract with no exit fees" | spill.chat (2026) |
| RightNow Media @ Work (UK) | Christian-values video library for workplaces | £80 a month for 21 to 35 employees, £130 for 36 to 50, £200 for 51 to 75. Quote above 100. | "unlimited access for everyone in your organisation" | uk.rightnowmediaatwork.org/pricing |

What this shows. Whole-workforce wellbeing licences are cheap per head because most staff never open the app. Learning libraries sold per seat cost more per head because seats go to chosen people. Akana is closer to the second: a guided workbook done week by week is used by a chosen cohort, not the whole payroll.

### 1.2 Church platforms

| Product | What the church gets | Price found | Terms found | Source |
|---|---|---|---|---|
| RightNow Media (UK) | 25,000+ Bible study videos, kids' content, custom channels | By average attendance: under 50 £40 a month (£480 a year), 51 to 100 £60, 101 to 200 £80, 201 to 1,000 £110, 1,001 to 2,500 £320, 2,501 to 5,000 £550, over 5,000 by quote. | "Billing will be submitted in US Dollars." Contract length not stated. | rightnowmedia.org/uk/pricing |
| Study Gateway | Bible study videos from Christian publishers | Up to 20 users $17.99 a month or $179.90 a year; 21 to 100 $44.99 or $449.91; 101 to 200 $89.99 or $899.91; up to 4,001+ users $584.99 or $5,849.91. | Annual plans give "two months free". | studygateway.com/church-overview |
| Lifeway (Ministry Grid) | Digital curriculum for preschool to adults | Not shown on the page. Priced by "average weekly attendance and content needs", with PDF price sheets. | Monthly or annual. "Save up to 15% with an Annual Subscription." | lifeway.com digital resources page |
| YouVersion Bible App | Reading plans, Plans with Friends | Free. Life.Church says it "provides our products completely free of charge". | Not applicable. | openblog.life.church (January 2018); churchonlineplatform.com/who-we-are |
| Alpha | Course videos, talks, handouts | Free. "All the training videos, Alpha talks, promotional material and weekly handouts are available online for FREE." Costs are food, venue and printed books. | Registration needed. | support.alpha.org.au (Alpha Australia help article) |
| Church Online Platform | Online service hosting | Free, from Life.Church. | Not applicable. | churchonlineplatform.com/who-we-are |

What this shows. Churches already get group reading plans and course content free from YouVersion and Alpha. They pay for depth and choice of curriculum, priced as a flat site licence by attendance. YouVersion's Plans with Friends lets members read "what stood out most to your friends" in a Talk It Over section. That is shared free text, which Akana should not copy at launch (section 3.6).

### 1.3 Small-group tools

| Product | What the group gets | Price found | Source |
|---|---|---|---|
| Bookclubs | Club logistics: polls, messaging, calendar, recommendations | Premium $60 a year per club; Pro $180 a year per club (branding, text alerts); Pro Plus $228 a year per club (Zoom, membership fees). Business upgrades by quote. | bookclubs.com/for-business |

Book club tools charge per club and sell organisation, not content. Akana sells the content and the weekly structure. Nothing found sells a guided workbook per group.

### 1.4 What buyers pay for

- **Content people finish.** Every comparable sells a library. Akana's difference is a structured weekly programme tied to a real book.
- **Uptake evidence for whoever signs the cheque.** HR wants to show the spend was used. A church leader wants to know the course is running. Counts are enough.
- **A privacy promise the buyer can repeat.** Wellbeing buyers stress that employers cannot see individual use. Akana goes further: answers are sealed and no admin screen can read them (architecture 7.3). That is the pitch.
- **Low effort.** Invitations, a leader view and a facilitator guide that saves the leader preparing.

### 1.5 How seats and site licences work

- **Per seat (named user).** Blinkist and Coursera. A seat is held by one person. Seats can be reassigned. Rises are prorated. Falls wait for renewal (Blinkist).
- **Whole population.** Headspace and RightNow @ Work. The price covers everyone in a size band. Simple to buy, no seat management.
- **Site licence by attendance band.** RightNow Media, Study Gateway, Lifeway. The church declares a band and everyone in the church may use it.
- **Per group.** Bookclubs.

### 1.6 Typical UK contract terms seen

- Annual term, billed up front, auto-renewing (Blinkist; Vendr's Headspace data).
- Monthly rolling at the small end (Spill, RightNow monthly prices, Study Gateway).
- Money-back window at self-serve level (Coursera, 14 days).
- Multi-year for larger buyers, traded for a discount (Vendr: 15 to 25%).
- Public sector buys through frameworks such as G-Cloud, where multi-year terms are common. Not a launch target.
- Invoice and bank transfer for organisations; card for small teams.

## 2. Product shape

### 2.1 The parts

| Part | What it does | Status in the codebase |
|---|---|---|
| Organisation account | A business, church, charity or community group as a customer | **Partly exists.** `organisations` (0001) has kinds `akana_house`, `publisher`, `author_company`, `individual` only. New kinds needed. |
| Admin console | Seats, invitations, groups, billing, reports | **Partly exists.** F-055 (organisation console, members and invites) is planned for week 2 for publishers. `/admin/organisations` exists for staff. Customer-facing screens are new. |
| Org staff roles | Who can manage seats and billing | **Exists, needs new rows.** `org_members` roles owner, editor, finance, author, viewer, with `org_permissions` driving RLS (F-130). Customer orgs reuse owner and finance, and need new resources: seats, groups, reports. |
| Seats and licences | How many people, which titles, for how long | **New.** `entitlements.source` already reserves `team_seat` (0004). Architecture lists a `seats` table that was never built. |
| Inviting members | Email invite, join link, bulk CSV | **New.** The check-in partner migration (0012) shows the pattern to reuse: server-minted single-purpose tokens stored as sha256 hashes, expiry and revocation, nothing happens on a link alone, rate limits counted from the audit log, and a block list of hashed addresses that declined or reported. |
| Groups with a leader | A cohort doing one workbook together | **New.** |
| Group pace | Everyone on the same unit | **New.** `enrolments` and `progress_events` (0003) give per-reader progress. A group schedule sits on top. |
| Facilitator guides | Per unit: aims, opening, discussion questions, timings, closing | **New.** Schema v3 is frozen, so guides should be a separate document type, not a change to the workbook schema. |
| Group check-ins | A light weekly signal for the leader | **New, built on the partner idea.** Fixed choices only. No free text. |
| Aggregate reporting | Uptake for the buyer | **Pattern exists.** `app_config` holds `suppression_threshold_owner` 5 and `suppression_threshold_author` 10 (0001). F-042 sets "Fewer than 10" for authors. New views needed. |
| Custom branding | The organisation's own look and host | **Exists for publishers.** Tenants, `tenant_domains`, `resolve_tenant` (0008), F-067 branding with contrast check (week 3), F-068 locked standards. A private, invite-only tenant kind is new. |
| SSO | SAML for large employers | **Planned after launch** as F-054, for publisher staff. Extend to customer orgs later. |

### 2.2 How it works for each audience

**Business.** HR buys 20 seats. They invite staff by work email. A manager runs a leadership cohort on one title over eight weeks. HR sees seats claimed, people started and units finished as counts. Nobody at the employer sees what anyone wrote.

**Church.** The church buys a site licence. The small groups coordinator creates groups, each with a leader. A group studies one title, one unit a week. The leader gets the facilitator guide and runs the discussion in a home or on a call. Members do the workbook between meetings.

**Small group.** A book club organiser pays for the group. Members join by link. Everyone is on the same unit. The guide gives the organiser the questions for the evening.

### 2.3 Group pace

- A group pins one workbook and its published version, as an enrolment does.
- The group has a schedule: a start date and one row per unit with the date it opens and an optional meeting time.
- **Soft pace at first.** The member's Home shows "Your group is on unit 3 this week". Members can read ahead or catch up. This needs no change to `has_entitlement`.
- **Held pace later.** An option to keep a unit closed until the group reaches it. That needs `has_entitlement` to check the group schedule for group-sourced entitlements. It is a small, risky change to the most important function, so it waits.
- No streaks, no missed-week counts, no "behind" labels. The rule in 0003 (no streak or missed-day derivation from progress events) applies to groups too.

### 2.4 Facilitator guides and discussion questions

- One guide per workbook version, with one section per unit: aim of the session, a two-minute opener, five to eight discussion questions, an optional activity, timings for a 60 or 90-minute session, and a closing line.
- Questions invite people to share only what they choose. The guide reminds the leader that nobody has to share their answers.
- Wellbeing guides carry the Help now line and a short note on what to do if someone discloses distress. They pass the same claim-word and safety review as the workbook.
- Faith guides may add a reading and a prayer prompt. These are written to the author's tradition and signed off by the author.
- Who writes them is a commercial question [Crent]: the author, Akana's editors, or both. The licence must allow it (section 5.6).

### 2.5 Group check-ins

- Each week a member can tap one of a fixed set: "Done this unit", "Part way", "Not this week", "Prefer not to say".
- The member chooses whether the group sees it. Off by default in workplace groups. The leader sees only what members choose to share.
- No mood scores, no wellbeing ratings, no free text in group check-ins. A mood check stays private, as now.
- This mirrors the check-in partner design in 0012: stage by number only, wellbeing sharing off unless ticked, and nothing the reader wrote. Level 3 (the reader's free-text note) is left out for groups, because a note seen by several users is user-generated content (section 3.6).

### 2.6 Reporting and the privacy line

**The privacy line, in the words the product should use:**

> "Your organisation can see how many people have started and finished, never who wrote what. Your answers are sealed. No one at your organisation, your group leader, the author or Akana staff can read them."

What each role sees:

| Viewer | Sees | Never sees |
|---|---|---|
| Org admin (HR, church office) | Seats bought and claimed. People started, finished unit 1, finished the programme, as counts per licence and per group. Counts under the threshold show as "Fewer than 5". Monthly, not daily. | Names against progress. Answers. Check-ins. Mood or daily checks. Which wellbeing title a named person is using. |
| Group leader | The member list (they invited them). The group's schedule. Check-in statuses that members chose to share. The count of members done this unit. | Answers. Private check-ins. Daily checks. Progress of a member who has not shared. |
| Member | Their own work. The group schedule. Shared check-ins of others in the group. | Anyone else's answers. |
| Akana staff | Counts, as admins do. Support lookup through the audited console. | Answers (no endpoint unseals them, architecture 7.3). |

Two harder points.

- **Small groups make counts identifying.** In a group of six, "5 of 6 finished" points at one person. Org admin reports therefore show counts only at licence level or for groups at or above the threshold. The leader's own count of who is done this unit comes only from shared check-ins, which members chose.
- **Which wellbeing title someone uses can itself be health data.** Org reports show counts per title only above the threshold, and never for wellbeing titles chosen by individuals outside a group. A workplace group on a wellbeing title is visible as a group, because the employer set it up.

### 2.7 Custom branding

- Reuse the white-label tenant (F-066, F-067, F-068) with a new tenant kind, `organisation`: invite only, no public catalogue, no checkout, the organisation's logo and colours, Help now locked.
- Sealing binds answers to the tenant (AAD `user|tenant|field`, architecture 7.3). A member's work on the marketplace tenant cannot move to a branded tenant later. Decide the tenant when the organisation starts, not after.
- Branded portals depend on two open decisions: the tenant apex (A7) and how a reader signs in on a tenant host (`TENANT_RESOLUTION.md` question 5, F-133). Until those land, organisations run on the Akana marketplace host with their name shown in the member's Home.

### 2.8 SSO

After launch. SAML through Supabase for large employers, building on F-054. Not needed for churches or small groups. A named prospect may require it to sign [check].

### 2.9 What members keep

- When a seat ends (someone leaves the job, the licence lapses), the entitlement ends and the workbook goes read only, as a lapsed membership does (F-095). Their answers stay theirs.
- The member can export their work (F-023) or carry on with their own membership.
- The organisation is told only that the seat is free.

## 3. Safeguarding and data

### 3.1 Controller and processor split

Recommended model [check legal]:

| Data | Who decides why and how | Role |
|---|---|---|
| The roster: who has a seat, their work or church email, which group they are in, who leads it | The organisation | Organisation is **controller**. Akana is **processor** under a DPA. |
| Aggregate reports | The organisation asks for them, Akana defines them | Organisation controller, Akana processor. |
| The member's Akana account, answers, check-ins, daily checks, consents | The member, under the reader terms with Akana. The organisation has no say and no access. | Akana is an **independent controller**. |
| Billing contact and invoices | Akana, for its own contract with the organisation | Akana controller. |

Why not make Akana a processor for everything? A processor must act on the controller's instructions. If the employer or church were controller of the answers, they could instruct Akana to disclose them, which breaks the sealing promise. Keeping the reader's own work under Akana's controllership, with the reader's explicit consent, is what makes "never visible to your employer" true in law as well as in code. This matches the existing split: Akana is controller on the marketplace and processor on white-label sites (privacy notice section 1).

The privacy notice and reader terms need a new section on joining through an organisation. The organisation's own privacy notice must name Akana as its processor for the roster.

### 3.2 DPA needed

A data processing agreement with every organisation customer, accepted at sign-up through F-122 (versioned terms acceptance), covering: subject matter (roster and reports only), the list of sub-processors (F-126), security measures, deletion at the end of the contract, assistance with rights requests, breach notice, and an express term that answers and check-ins are out of scope and never disclosed to the organisation. The organisation terms also bind the customer not to invite under-18s and not to press staff or members to share their work.

### 3.3 Special category data

**Health.** Wellbeing titles already trigger the health consent screen (F-026, version `health-2026-10`). That stays exactly as it is for organisation members. Consent must be freely given. ICO guidance says consent must be "freely given, specific, affirmative (opt-in) and unambiguous, and able to be withdrawn at any time" (ICO, conditions for processing). In employment there is a power imbalance, so Akana must not let an employer make a wellbeing title compulsory. Wellbeing groups at work are optional by design and the invite says so [check legal]. A DPIA is needed. The ICO's worker health guidance treats DPIAs as necessary for high-risk processing of worker data (ICO guidance, updated 5 March 2024; summary by Hempsons, January 2024).

**Religious belief.** If a church uses Akana, the fact that a person is in a church's Bible study group reveals religious belief. So does using a faith title.

- The church holds its own roster under Article 9(2)(d), the condition for not-for-profit bodies with religious aims. That condition covers members, former members and people in regular contact, and it does not allow disclosure outside the body without consent (ICO, conditions for processing, which gives the example of a church).
- **Akana cannot use 9(2)(d) for itself.** Akana is not a religious body. For its own processing of a member's faith-related use, Akana needs explicit consent under 9(2)(a), as it does for health [check legal].
- Product consequence: a faith consent screen, built like the health one, shown before a member opens a faith title or joins a group run by a church organisation. Record it with a version. Withdrawing it stops new saves in faith titles.
- A business that runs a faith-based group (RightNow @ Work shows the demand exists) creates religious belief data in an employment setting. Treat it as sensitive: optional, never reported by name.

**Data minimisation.** Group names are chosen by organisations. A group called "Anxiety support, Finance team" puts health data into the roster. The admin console should warn on group names and suggest neutral ones.

### 3.4 Employees' answers never visible to the employer

Already true in code: answers are sealed with AES-256-GCM, bound to user, tenant and field, unsealed only in server code acting for the owner, with no admin unseal endpoint (architecture 7.3; 0003). Akana Business adds no read path. The pgTAP suite should gain tests proving an org owner, finance role and group leader cannot read `answers`, `progress_events` rows of members, or private check-ins (extending F-131).

### 3.5 Safeguarding for church groups and under-18s

- **Adults only at launch.** The reader terms already say "You must be 18 or over" and sign-up asks for confirmation (F-127). Keep that for organisations. Youth groups are a large separate product: parental consent, children's code duties and different content rules. Recommendation: no under-18 use at launch, written into the organisation terms, with the invite screen repeating the 18+ confirmation.
- **DBS checks do not apply to Akana as a software provider.** DBS eligibility rests on regulated activity with children or adults (gov.uk DBS guidance on regulated activity). Supplying software is not that. The church's leaders may need checks under the church's own policy if they work with adults at risk or children. That is the church's duty, not Akana's.
- **Church safeguarding policies.** Most churches follow their denomination's policy or thirtyone:eight guidance. That guidance asks churches to avoid unchecked one-to-one online contact, restrict group access to current members, remove people who leave, limit personal data sharing (for example bcc on group emails) and report concerns to the safeguarding lead (thirtyone:eight, online interactions page). Akana's design supports this: no direct messages, no member contact details shown to other members, leaders remove members, and a clear "Report a concern" route that goes to Akana support and tells the member to contact their church's safeguarding lead.
- **Help now stays locked** on every organisation surface (F-068).

### 3.6 Online Safety Act

The architecture assumes Akana curates every workbook and so stays out of the user-to-user scope (principle 2). Groups could change that. A user-to-user service is "an internet service through which users can generate, upload or share content with other users" (Online Safety Act 2023 s.3, as summarised by Herbert Smith Freehills Kramer, February 2024). Exemptions include services where users can only comment on or react to the provider's content, and internal business services for a closed group.

- Shared free-text answers, discussion threads or a group chat would very likely bring Akana into scope.
- Fixed-choice check-ins with no free text are the safest design.
- Recommendation: no in-app free text shared between users at launch. Discussion happens in the meeting. Revisit only with legal advice [check legal].

## 4. Pricing and packaging

### 4.1 Options

| Model | Fits | For | Against |
|---|---|---|---|
| Per seat per month, billed yearly | Businesses | Matches Blinkist and Coursera. Seats map to people, which suits the user-centric pool. | Seat admin. Small churches find it fussy. |
| Per seat, whole population band | Large employers | Simple to buy. | Akana is used by cohorts, not everyone. Underprices active use. |
| Site licence by attendance band | Churches | Matches RightNow, Study Gateway and Lifeway. What church treasurers expect. | Needs an "active readers" cap to protect the pool and to stop a band being undersold. |
| Per group | Book clubs, peer groups | Matches Bookclubs. Easy to understand. | Cheap group access could undercut the individual membership. |
| Per participant per title (group pack) | One-off courses | Ties revenue to one title, so royalties are clear. | Needs the single-sale price ladder, which is not set (C4). |

### 4.2 Recommended interim model

**Proposal for Crent. These are not evidence. Each line says what it is anchored to.**

| Plan | Who | Proposal | Anchor |
|---|---|---|---|
| Akana Teams | Businesses and charities, 5 to 250 people | **£5 per seat per month, billed yearly (£60 a seat), plus VAT. Minimum 5 seats.** Seats rise at any time (prorated), fall at renewal. Membership catalogue titles. Groups, guides and reports included. | Below the interim individual membership of £7.99 a month including VAT (£6.66 excluding, DAY_LOG Day 6). Below Blinkist's "from €8 per user/month". Well below Coursera's £297.97 a year. |
| Akana Teams, 250+ | Larger employers | Quote. Annual or multi-year. SSO when built. | Vendr reports enterprise wellbeing deals by quote, with multi-year discounts of 15 to 25%. |
| Church | Churches by average adult attendance | **Up to 50: £20 a month. 51 to 150: £40. 151 to 400: £75. Over 400: quote. Yearly at ten months' price.** Each band carries an active-reader cap equal to the band's top figure. Prices shown with VAT, since most churches cannot reclaim it. | About half RightNow Media UK (£40 under 50, £60 for 51 to 100, £80 for 101 to 200), because Akana's faith catalogue is empty today. Yearly discount matches Study Gateway's "two months free". |
| Group | Book clubs, peer and community groups, 4 to 15 people | **£3 per member per month including VAT, minimum 4 members, one title at a time, paid by the organiser.** | Bookclubs charges $60 to $228 a year per club for logistics alone. Limiting to one title at a time protects the individual membership. |
| Charity discount | Registered charities on Teams | **20% off Teams.** Churches already have their own lower bands, so no further discount. | No evidence gathered on norms. Crent's call. |
| Pilot | First three organisations | **Free for one group cycle (up to 12 weeks), in return for feedback and a case study.** | Coursera offers a 14-day money-back. A pilot suits founder-led sales better. |

Points to settle [Crent]:

- Whether Teams opens the whole membership catalogue or a chosen list. Recommended: the membership catalogue, so the same `in_membership` flag (0009) and the same pool rules apply.
- Whether organisations can buy wellbeing higher-tier titles. Recommended: no, while higher tier stays paused (O15).
- Whether a church plan opens to non-church charities. Recommended: no. Charities buy Teams with the charity discount.

### 4.3 Contract terms to offer

- Teams and Church: annual, auto-renewing, 30 days' notice before renewal, invoice or card. Monthly rolling for Church at the monthly band price.
- Group: monthly rolling, card. The organiser is usually a consumer, so DMCC Act subscription rules apply here, as for the membership (DAY_LOG Day 6: renewal reminders and a 14-day cooling-off after yearly renewal, expected January 2027 per TLT, August 2026). B2B contracts with businesses and churches are outside those consumer rules [check legal].
- All: the DPA, the organisation terms, adults only, no access to answers, data deletion 30 days after the end of the contract unless members keep their own accounts.

## 5. Billing

### 5.1 Stripe subscriptions with quantity

- Per-seat plans use a recurring price with `usage_type=licensed` and a `quantity` on the subscription item. Stripe prorates when the quantity changes ("you prorate them when the subscription changes. This includes when you change subscription quantities", Stripe docs, subscription quantities).
- Volume tiers, if wanted later, use tiered pricing. `transform_quantity` can bill per block (for example per 5 seats) but cannot be combined with tiers (same page).
- Church bands are separate prices, quantity 1. A band change is a price swap with proration.
- Group plans are per-member quantity, updated when members join or leave, with proration off to avoid tiny credit notes [check with Stripe's proration settings].
- Seat falls at renewal only: the console lets the admin schedule a lower quantity for the next period (Stripe subscription schedules), matching Blinkist's terms.

### 5.2 Invoicing for organisations

- Card through Checkout for small Teams and all Group plans.
- `collection_method=send_invoice` with 30 days to pay for annual Teams and Church plans. Payment by card, Bacs Direct Debit or bank transfer.
- UK fees read on 7 October 2026 (stripe.com/gb/pricing): standard UK cards 1.5% + 20p; Billing pay-as-you-go 0.7% of billing volume; Invoicing Starter 0.4% per paid invoice; Tax Basic 0.5% per transaction where registered; Bacs Direct Debit 1%, minimum 20p, capped at £4.
- Purchase order numbers and the customer's VAT number go on the invoice. The invoice is the VAT invoice for organisations, which avoids the open question on code-only email receipts for readers (F-098, accountant list).
- Before Stripe Billing exists for organisations, C10's recommended answer stands: a manual Stripe invoice plus a bulk access grant from admin.

### 5.3 VAT

- Akana is seller of record (A1), registered in the UK with Stripe Tax.
- **UK business, charity and church customers:** standard rated. Charity VAT reliefs do not cover software or subscriptions; gov.uk's list of reliefs covers advertising, aids for disabled people, construction, medicines, medical and rescue equipment and similar, and nothing for software (gov.uk, VAT for charities, what qualifies). Most churches are not VAT registered and cannot reclaim, so show church prices with VAT.
- **Business customers abroad:** under the B2B general rule "the supply is made where the customer belongs" and the customer accounts for VAT under the reverse charge. Akana must hold "commercial evidence showing that your customer is in business and belongs outside the UK"; a VAT number is the best evidence for EU customers (HMRC VAT Notice 741A, sections 5.6 and 6.3). Collect the tax id at checkout; the code already sets `tax_id_collection` for memberships (`membership.ts`).
- **Churches and charities abroad that are not in business:** Notice 741A says that without a VAT number or other evidence of business activity "the supply should be treated as a B2C (business to consumer) transaction". That brings in the customer country's digital services VAT, including EU OSS from the first sale [check accountant].
- Recommendation: organisation plans in the UK only at launch. Overseas organisations by invoice after the accountant's view (O8).

### 5.4 Fit with seller of record, Connect payouts and the pool

- Organisation money is charged on the Akana platform account like memberships, under separate charges and transfers (D1). Nothing changes in Connect: authors and publishers are still paid monthly from statements (F-100, F-101).
- **Teams and Group revenue feeds the subscription pool (D3).** Net receipts (after VAT, Stripe fees and refunds, per D4) for each organisation subscription are split user-centrically by each seat holder's capped completed steps, exactly as for a reader's membership. A seat is a person, so the rule already fits.
- **Church site licences need one extra rule.** A flat fee has no per-user price. Proposal: divide the church's net receipts for the period equally across its active readers, then split each share by that reader's capped steps. Money from a period with no active readers follows whatever D3 decides for inactive members [Crent].
- **Pilots and free cycles put nothing in the pool.** Authors should be told this in the licence.
- **Ledger change.** `royalty_lines` and `pool_usage` (F-100, F-104) need a source field so statements can show organisation income apart from reader memberships, without naming the organisation to the author (an author must not learn that a named employer runs a wellbeing title) [check legal].
- **Licence change.** Reader terms say "Workbooks are for personal use". The author licence must grant organisational and group use, permit facilitator guides as derived material, and state how organisation income is paid. This must be in the licence text before any organisation goes live (O10) [check legal].

## 6. Phased build plan

### 6.1 The honest position

Week 3 already carries 53.5 points with feature freeze on Wednesday 21 October and no spare stream (AK_3_Week_Plan section 1). The size scale implied by the plan is S = 1, M = 2.5, L = 5. A full Akana Business build is about 40 points. It does not fit. A manual-sales pilot (about 12 points) fits only if it runs as an extra stream (T13) starting in week 2, or if it displaces items on the existing cut list. That choice is Crent's [Crent].

### 6.2 MVP for launch week 3: manual-sales pilot

What it delivers: Akana staff create an organisation, record a manual invoice, set a seat count and titles; the organisation's owner invites people by email; people claim a seat and read; the owner sees seats claimed and people started as suppressed counts. No groups, no organisation billing in Stripe, no branding.

| Id | Feature | Size | Depends on | Notes |
|---|---|---|---|---|
| F-201 | Customer organisation kinds and profile | S | F-129, F-082 | New kinds business, church, charity, community_group. Billing contact, VAT number, charity number, size band. Staff create them from `/admin/organisations`. |
| F-202 | Organisation licences and seats with `team_seat` entitlement | M | F-095, F-201 | Seat count, title scope, start and end. Claiming a seat writes a library-wide `team_seat` entitlement; releasing it ends the entitlement and leaves the work read only. `has_entitlement` respects the licence's title scope. |
| F-203 | Invitations and seat claim | M | F-202, F-137, F-030 | Email invite with a hashed token, accept only on a button press (0012 pattern), 18+ confirmation, link to an existing account. Send limits. Email names the organisation, never a title. |
| F-204 | Minimal organisation console: seats and invitations | M | F-055, F-203 | Invite, resend, revoke, release a seat. Counts: seats bought, claimed, people started. Suppressed under the owner threshold. |
| F-205 | Organisation terms, DPA and privacy notice section | S | F-122, F-126 | Drafts for the lawyer: organisation terms (adults only, no access to answers, no compulsion for wellbeing), DPA, privacy notice section on joining through an organisation. |
| F-206 | Akana for organisations page | S | F-009 | "Talk to us" until prices are set. States the privacy line. No church claims until faith titles exist. |

Total: 3 S + 3 M = about 10.5 points, plus RLS tests.

### 6.3 After launch, phase 2: groups (target two to three weeks after launch)

| Id | Feature | Size | Depends on | Notes |
|---|---|---|---|---|
| F-210 | Groups with leaders | M | F-204 | Create a group, pick one title and pin its version, assign a leader and co-leader, add members from seat holders or by invitation. Group name warning for sensitive words. |
| F-211 | Group schedule and soft pace | M | F-210, F-016 | Start date, unit open dates, meeting time. "Your group is on unit 3" on Home and Today. Calendar file (reuses F-024). |
| F-212 | Facilitator guides | M | F-210, F-084 | Separate Zod schema in `packages/schema`, validator rules (claim words, Help now on wellbeing), editor through the staff JSON editor (F-086), review and sign-off, leader view per unit, print view. |
| F-213 | Group check-ins | S | F-210, F-030 | Fixed choices only, member-controlled sharing, off by default in workplace groups. No free text column exists. |
| F-214 | Aggregate organisation reports | M | F-202, F-210, F-141 | Monthly counts per licence and per group above threshold. CSV. No names against progress. pgTAP tests prove leaders and owners cannot read answers or private check-ins. |
| F-215 | Faith consent screen | S | F-026 | Explicit consent for faith titles and church groups, versioned, withdrawable. Needs a faith genre first (F-221). |
| F-216 | Report a concern | S | F-090 | From any group screen to Akana support, with the safeguarding-lead prompt for church groups. |

About 14.5 points.

### 6.4 After launch, phase 3: self-serve and money

| Id | Feature | Size | Depends on | Notes |
|---|---|---|---|---|
| F-220 | Organisation billing on Stripe | L | F-202, F-092 | Seat quantity, church bands, group per-member plans, invoices with 30-day terms, Bacs, tax ids, scheduled seat falls, dunning. Organisation subscription mirror separate from reader subscriptions. |
| F-221 | Faith genre and first licensed Christian titles | M | F-112, F-036 | New genre with guardrails, Themes and author outreach. Content, licences and review, not only code. Blocks the church offer. |
| F-222 | Pool and ledger for organisation income | M | F-104, F-220 | Source field on ledger and pool lines, the church per-reader split, author statements that do not name the organisation. |
| F-223 | Private organisation tenants with branding | M | F-066, F-067, F-133 | Tenant kind `organisation`, invite only, no checkout. Waits on A7 and the tenant sign-in decision. |
| F-224 | Held pace | S | F-211 | Optional: units open when the group reaches them. Changes `has_entitlement`; needs a full RLS test pass. |
| F-225 | Join links and CSV bulk invite | S | F-203 | Join code with optional email domain restriction. CSV upload with validation. |
| F-226 | Self-serve sign-up for Group and small Teams plans | M | F-220 | Card checkout, the organiser becomes owner. |
| F-227 | SAML SSO for organisation members | M | F-054 | Large employers only. |
| F-228 | Organisation offboarding and export | S | F-077 | Roster and invoices out, roster deleted, members told their work is still theirs. Never answers. |

About 30 points. The church offer goes live only after F-215 and F-221.

### 6.5 Database changes

Numbered from 0013, after 0011 (membership reminders) and 0012 (check-in partners). Every table follows the house rules: RLS on, grants revoked and given back table by table, policies calling `app.*` helpers as `(select app.fn(...))`, security definer functions with `search_path` pinned to `''`, audit rows for privileged changes.

**0013_org_customers (F-201)**
- `organisations.kind` check widened to add `business`, `church`, `charity`, `community_group`.
- `org_profiles`: `org_id` (PK, FK), `sector`, `size_band`, `charity_number`, `vat_number`, `billing_email`, `billing_country`, `dpa_contract_id` (FK `contracts` when built), `created_at`.
- `org_permissions` rows for new resources `seats`, `groups`, `reports`, `billing` for owner and finance. Viewer reads reports.

**0014_org_licences_and_seats (F-202)**
- `org_licences`: `id`, `org_id`, `tenant_id` (marketplace at launch), `kind` (`teams`, `church`, `group`, `pilot`), `title_scope` (`membership`, `list`), `seats_purchased` (int, null for church bands), `active_reader_cap`, `starts_at`, `ends_at`, `status` (`active`, `ending`, `ended`, `suspended`), `stripe_subscription_id` (null until F-220), `manual_invoice_ref`.
- `org_licence_titles`: `licence_id`, `workbook_id` (used when `title_scope = 'list'`).
- `org_seats`: `id`, `licence_id`, `user_id` (null until claimed), `invitation_id`, `claimed_at`, `released_at`, `released_reason`. Partial unique index on (`licence_id`, `user_id`) where `released_at is null`. A trigger refuses a claim when claimed seats would exceed `seats_purchased`.
- `entitlements`: add `org_licence_id` (FK, null). Claim and release go through `app.claim_seat()` and `app.release_seat()`, which write or end the `team_seat` row and an audit row.
- `app.has_entitlement` replaced with `create or replace`: a library-wide `team_seat` row opens a workbook only when the licence is active and the workbook is in its scope (`in_membership` or `org_licence_titles`). Same signature, same body otherwise.

**0015_org_invitations (F-203)**
- `org_invitations`: `id`, `org_id`, `licence_id`, `group_id` (null until 0016), `role` (`member`, `leader`), `email` (held only while pending; cleared on accept, revoke or expiry), `email_hash`, `token_hash`, `invited_by`, `expires_at`, `accepted_at`, `accepted_by`, `revoked_at`.
- Server-only writes through `app.create_invitation()` and `app.accept_invitation()`. Send limits per organisation per day in `app_config`, counted from the audit log as 0012 does. Addresses that declined or reported are refused, using a hashed block list like `partner_blocks`.

**0016_groups (F-210, F-211)**
- `groups`: `id`, `org_id`, `licence_id`, `tenant_id`, `name`, `workbook_id`, `version_id` (pinned), `pace` (`soft`, `held`), `share_default` (bool, false for business kinds), `status` (`draft`, `running`, `finished`, `archived`), `starts_on`, `created_by`.
- `group_members`: `group_id`, `user_id`, `role` (`leader`, `co_leader`, `member`), `joined_at`, `left_at`, `share_checkins` (bool). One open membership per user per group.
- `group_schedule`: `group_id`, `unit_number`, `opens_on`, `meets_at`, `note_for_leader` (staff-controlled length, leader-only read). Primary key (`group_id`, `unit_number`).
- Helpers: `app.is_group_member(group, roles)`, `app.group_current_unit(group)`.
- RLS: members read their group, schedule and member list (display names only, never emails); leaders manage membership; org owners read groups; nobody reads another group.

**0017_group_checkins (F-213)**
- `group_checkins`: `id`, `group_id`, `user_id`, `unit_number`, `status` (`done`, `part_way`, `not_this_week`, `prefer_not`), `shared` (bool), `at`. No text column. Unique per member per unit, last write wins.
- RLS: the member reads and writes their own; other group members and leaders read only rows where `shared` is true; org owners read nothing here.

**0018_org_reporting (F-214)**
- Security definer functions, not views over raw rows: `public.org_licence_summary(licence)` and `public.org_group_summary(group)` return counts with any value under `suppression_threshold_owner` returned as null and shown as "Fewer than 5". Monthly buckets only. Callable by org owner, finance and viewer of that organisation, and by staff.
- pgTAP: an org owner, finance user and group leader cannot select from `answers`, `progress_events` of members, or unshared `group_checkins`.

**0019_facilitator_guides (F-212)**
- `facilitator_guides`: `id`, `workbook_id`, `version_id`, `content` (jsonb, validated by the guide schema), `content_hash`, `status` (`draft`, `in_review`, `approved`, `withdrawn`), `approved_by`, `safety_approved_by`, `published_at`. Immutable once approved, as with workbook versions.
- RLS: readable by leaders and co-leaders of a running group on that workbook, by org owners holding a licence that covers it, and by staff. Writes by platform editors only.

**0020_faith_consent (F-215, with F-221)**
- New consent type `faith` with a version row, following 0006. A check in the enrolment route for faith-genre titles and church-run groups.

**0021_org_billing (F-220)**
- `org_subscriptions`: mirror of Stripe subscriptions owned by an organisation, kept apart from `subscriptions` (0009), whose `user_id` is not null and whose plan check allows membership only. Same `observed_at` ordering rule.
- `org_invoices`: Stripe invoice id, status, amounts, tax, PO number, no titles.
- `price_points` rows for `teams_seat_year`, `church_band_*`, `group_member_month`.

**0022_org_pool (F-222)**
- `source` column on `royalty_lines` and `pool_usage` (`reader_membership`, `org_teams`, `org_church`, `org_group`), and the church per-reader split in the pool close function.

### 6.6 Dependencies outside the code

- Lawyer: organisation terms, DPA, the privacy notice section, the faith consent wording, the licence grant for group use and facilitator guides, the Online Safety Act view on group features (O10).
- Accountant: VAT on overseas churches and charities, whether organisation invoices need anything beyond Stripe's standard invoice (O8).
- DPIA update for employer and church use, health and religious belief (F-126, O11).
- Authors: agreement to group use and to facilitator guides, and who writes them.
- Faith titles: none exist. The church offer waits for them.

## 7. Decisions for Crent

1. Run the manual-sales pilot (F-201 to F-206) as an extra stream from week 2, or move it after launch.
2. The controller split in section 3.1, for the lawyer to confirm.
3. Adults only for organisations at launch.
4. No shared free text in groups at launch.
5. The interim prices in section 4.2, or other figures.
6. Organisation income into the D3 pool, with the church per-reader split.
7. Who writes facilitator guides, and whether authors are paid for them.
8. Whether to pursue churches now (needs a faith genre and licensed titles) or start with businesses and book clubs.

## Sources

All read on 7 October 2026 unless stated.

Market
- Blinkist for Business pricing: https://www.blinkist.com/business/pricing
- Coursera for Business plans: https://www.coursera.org/business/compare-plans
- Coursera for Teams UK price, third-party write-up (published 12 June 2026, updated 3 August 2026): https://marcandrews.com/coursera-for-teams-uk-businesses-2026-worth-it/
- Vendr, Headspace pricing data (updated February 2026): https://www.vendr.com/marketplace/headspace
- Spill review of Unmind (2026): https://www.spill.chat/eap-review/unmind
- RightNow Media @ Work UK pricing: https://uk.rightnowmediaatwork.org/pricing
- RightNow Media UK pricing: https://rightnowmedia.org/uk/pricing
- Study Gateway church subscriptions: https://www.studygateway.com/church-overview/
- Lifeway digital curriculum subscriptions: https://www.lifeway.com/en/shop/bible-studies/sunday-school/digital-resources
- YouVersion Plans with Friends (Life.Church, 31 January 2018): https://openblog.life.church/3-small-group-resources-havent-tried-yet/
- Church Online Platform, Life.Church: https://churchonlineplatform.com/who-we-are
- Alpha, cost to run (Alpha Australia help article): https://support.alpha.org.au/en/articles/7954256-how-much-will-it-cost-to-run-alpha
- Bookclubs for business: https://bookclubs.com/for-business

Data protection and safeguarding
- ICO, special category data, conditions for processing: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/special-category-data/what-are-the-conditions-for-processing/
- ICO, information about workers' health (updated 5 March 2024): https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/employment/information-about-workers-health/
- Hempsons summary of ICO worker health guidance (26 January 2024): https://www.hempsons.co.uk/?p=3370900
- thirtyone:eight, contact and harmful online interactions: https://thirtyoneeight.org/help-and-resources/knowledge-hub/working-safely/online-safety/contact-harmful-online-interactions
- gov.uk, regulated activity with adults (DBS): https://www.gov.uk/government/publications/dbs-guidance-leaflets/regulated-activity-with-adults-in-england-and-wales
- Herbert Smith Freehills Kramer, who is caught by the Online Safety Act (21 February 2024): https://www.hsfkramer.com/insights/key-topics/who-is-caught-by-the-osa

Billing and tax
- Stripe, subscription quantities: https://docs.stripe.com/billing/subscriptions/quantities
- Stripe UK pricing: https://stripe.com/gb/pricing
- HMRC VAT Notice 741A, place of supply of services: https://www.gov.uk/guidance/vat-place-of-supply-of-services-notice-741a
- gov.uk, VAT for charities, what qualifies for relief: https://www.gov.uk/vat-charities/what-qualifies-for-relief

Internal: the files listed under Inputs, plus `docs/planning/AK_Questions_for_Crent.md`, `content/registry/genres.json`, the working copy of `supabase/migrations/0012_checkin_partners.sql`, `legacy/db/001_core_schema.sql` and `legacy/functions/app/partner.ts`.
