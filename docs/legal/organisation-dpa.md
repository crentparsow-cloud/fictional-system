DRAFT for the lawyer. Not published. Not for use with any organisation until the lawyer approves it (gate O10). Prepared 7 October 2026 by the build team from docs/research/akana-business.md section 3. Points marked [check legal] need a view.

# Data processing agreement: Akana for organisations

This agreement is between the organisation named in the order form (the **Organisation**, the controller) and [company name] (**Akana**, the processor). It forms part of the Akana for organisations terms (docs/legal/organisation-terms.md). It meets Article 28 of the UK GDPR.

## 1. What is in scope

Akana processes the following for the Organisation, and nothing else:

- **The Roster**: the email addresses the Organisation invites, whether each invitation is open, accepted, declined, cancelled or expired, which Seats are taken and when, and which Seats were released and why.
- **Administrator details**: the names and email addresses of the people the Organisation names to run its account.
- **Counts**: the number of Seats bought and taken, open invitations, and how many Members have started, shown only when the number is at or above the threshold (currently five).

## 2. What is out of scope

The following are not processed for the Organisation and are never disclosed to it, whatever instruction it gives:

- anything a Member writes in Akana: answers, check-ins, daily checks and plans;
- a Member's progress, by person or by title;
- a Member's consents, including health and faith consent;
- a Member's own account details, including the email address they sign in with if it differs from the one the Organisation invited.

For these, Akana is an independent controller under its privacy notice and the reader terms. A Member's relationship with Akana for their own work does not depend on the Organisation [check legal].

## 3. Details of the processing

| Item | Detail |
|---|---|
| Subject matter | Running the Organisation's access to Akana: invitations, Seats and counts. |
| Duration | The term of the contract, then until deletion under section 9. |
| Nature | Storing, sending invitation emails, recording acceptance and release, counting. |
| Purpose | To let the Organisation give its people access to Akana and see uptake as counts. |
| Data subjects | The Organisation's staff, volunteers, members or attenders whom it invites, and its Administrators. |
| Personal data | Email addresses, Seat status and dates, Administrator names and email addresses. |
| Special category data | None is collected for the Organisation. A church's Roster can reveal religious belief by its nature. The church is responsible for its lawful condition (normally Article 9(2)(d)) and for telling its people [check legal]. |

## 4. Akana's obligations

Akana will:

1. process Roster data only on the Organisation's documented instructions, which are these terms and the Organisation's use of the console, unless the law requires otherwise, in which case it will tell the Organisation first unless the law forbids it;
2. make sure everyone who can reach Roster data is bound to confidentiality;
3. keep the security measures in Annex 1;
4. use only the sub-processors in Annex 2, and give the Organisation at least 30 days' notice of any new one, during which the Organisation may object and, if the objection cannot be resolved, end the contract;
5. help the Organisation, as far as it reasonably can, to answer requests from people exercising their rights over Roster data;
6. help the Organisation with security, breach notification, data protection impact assessments and consultation with the ICO, as far as they concern Roster data;
7. tell the Organisation without undue delay, and within 48 hours of becoming aware [check legal], of any personal data breach affecting Roster data;
8. delete or return Roster data at the end of the contract, as set out in section 9;
9. make available the information needed to show it meets this agreement, and allow audits on reasonable notice, no more than once a year unless there is a breach [check legal].

## 5. The Organisation's obligations

The Organisation will:

- have a lawful basis to give Akana each address it invites, and tell those people, in its own privacy notice, that Akana processes the Roster for it;
- invite only adults;
- not instruct Akana to disclose or process anything listed in section 2;
- not use the counts to try to identify any one person.

## 6. International transfers

Roster data is stored in the United Kingdom. Where a sub-processor processes it outside the UK, Akana relies on an adequacy decision, the UK International Data Transfer Agreement or the UK Addendum to the EU Standard Contractual Clauses [check legal for each sub-processor].

## 7. People's rights

If a person asks Akana directly about Roster data, Akana will pass the request to the Organisation and will not answer it except on the Organisation's instruction. If a person asks about their own account or Member Work, Akana answers as controller.

## 8. Breach

A breach notice will say what happened, the data and people affected as far as known, the likely consequences, and what Akana has done and will do. Akana will keep the Organisation informed until it is closed.

## 9. Deletion at the end

When a Licence ends, Akana releases every Seat and removes the invited email addresses from the Roster at once. Administrator details are deleted 30 days after the contract ends, unless the Organisation asks within that time for a copy of its Roster first [check legal; at launch the 30-day step is done by hand]. Audit records that show an invitation was sent or a Seat taken keep ids, dates and a one-way hash of the address, never the address itself, and are kept for [retention period].

Members keep their own Akana accounts and their Member Work. Deleting the Roster does not delete them.

## Annex 1: security measures

- Roster data is held in a database in the London region with row level security on every table. Only the Organisation's own Administrators and Akana staff can read it, and staff need it only for support.
- Invitation links carry a random token. Only a one-way hash of the token is stored. A link works once, expires after 14 days and can be cancelled.
- The invited email address is removed from the invitation record when the invitation is accepted, declined or cancelled. A declined address is kept only as a one-way hash, so it is not invited again.
- Akana staff need two-factor authentication. Every staff change to an Organisation, a Licence or a Seat is written to an append-only audit log.
- Member Work is encrypted with AES-256-GCM before storage, bound to the Member, the site and the field, and unsealed only for the Member. No Akana tool can unseal it.
- Counts below the threshold are not shown, and the started count changes only once a week.
- Invitation emails never name a workbook.

## Annex 2: sub-processors for Roster data

| Sub-processor | What it does | Where [check legal] |
|---|---|---|
| Supabase | Database and sign-in | London region (AWS eu-west-2) |
| Vercel | Hosting the web application | [to confirm] |
| Resend | Sending invitation emails | [to confirm] |

Stripe is not given Roster data. It is used only if the Organisation pays by card, as an independent controller for payment data.

## Placeholders

- [company name]
- [retention period]
