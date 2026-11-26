DRAFT for review by a solicitor. Not legal advice. Prepared 25 November 2026.

# Breach log template

One entry per incident, whether or not it is reported. The ICO's guide says: "Article 33(5) requires you to document the facts regarding the breach, its effects and the remedial action taken", and "You should ensure that you record all breaches, regardless of whether or not they need to be reported to the ICO" (source 6). The ICO's small organisations page says to start a log when the breach is discovered and to "write down facts about the incident as you uncover them" (source 4).

The three things the ICO's guide says the record must hold are marked (ICO). The other fields are practical additions so the entry can stand on its own later. The ICO page also offers its own template log, which was not opened for this draft: the solicitor may prefer it.

Never write a reader's answers, a password, a key or a token in this log. Refer to people by user id, not by name, where that is enough.

Where the log is kept: TO CONFIRM. It should be somewhere that survives the loss of the site and the repository, with access limited to the people named in the plan.

## Entry

| Field | Entry |
|---|---|
| Log number | |
| Entry opened by, and when | |
| **Facts of the breach (ICO)** | |
| When it happened, if known | |
| When Akana became aware, to the minute, and how | |
| Who first saw it | |
| What happened, in plain words | |
| Cause, if known | |
| Systems involved (Supabase, Vercel, Stripe, Resend, other) | |
| Was Akana controller or processor for the data? If processor, for whom? | |
| Kinds of personal data involved | |
| Was special category data involved (health, religious belief)? Were sealed answers readable, or only ciphertext? Were the sealing keys exposed? | |
| Could enrolment on a mental health or faith title be seen? | |
| Kinds of people affected (readers, authors, organisation members, staff, non-users such as gift recipients or check-in partners) | |
| Approximate number of people | |
| Approximate number of records | |
| Countries of the people affected | |
| **Effects (ICO)** | |
| What has happened to people so far | |
| What could happen to them | |
| Risk to people: unlikely, likely or high, with the reasons | |
| **Remedial action (ICO)** | |
| Containment steps taken, each with a time and a name | |
| Secrets rotated, each with a time | |
| Steps taken to protect the people affected | |
| Steps taken to stop it happening again | |
| **Decisions** | |
| Reported to the ICO? Yes or no | |
| If yes: date and time, ICO reference, who reported | |
| If yes and later than 72 hours after becoming aware: the reason for the delay | |
| If no: the reason, and who decided | |
| People told? Yes or no | |
| If yes: date, how, what they were told, who signed it off | |
| If no: the reason, and who decided | |
| Controller told (where Akana is processor)? Date and time, to whom | |
| Others told (provider, insurer, police, bank or Stripe, solicitor), with dates | |
| **Close** | |
| Review meeting date and who attended | |
| What changes as a result, each with an owner and a date | |
| DPIA updated? | |
| Entry closed by, and when | |

## Running timeline

Use UTC or UK time and say which.

| Time | What happened or what was done | By whom |
|---|---|---|
| | | |

## Sources

Source numbers match the full list at the end of `docs/compliance/legal-corrections.md`.

Read on 25 November 2026 through a web fetch tool that returns extracts. Check each quotation against the live page.

4. ICO, "72 hours: how to respond to a personal data breach": https://ico.org.uk/for-organisations/advice-for-small-organisations/personal-data-breaches/72-hours-how-to-respond-to-a-personal-data-breach/
6. ICO, "Personal data breaches: a guide": https://ico.org.uk/for-organisations/report-a-breach/personal-data-breach/personal-data-breaches-a-guide/
