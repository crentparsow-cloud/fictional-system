DRAFT for review by a solicitor. Not legal advice. Prepared 25 November 2026.

# Incident and personal data breach plan

This answers review finding H6: there was no breach process, no breach log and no incident plan. Part 1 is the one-page plan. Part 2 is the first steps for this stack. Part 3 lists every secret and where it is rotated. The log to fill in is `docs/compliance/breach-log-template.md`.

Names are left blank on purpose. Nobody has been appointed yet. Until the roles below are filled, the owner of Akana holds every one of them: the owner leads, decides whether a breach is reportable, makes the report and signs what readers are told.

## Part 1. The plan on one page

**Roles.**

| Role | Name | Contact out of hours |
|---|---|---|
| Incident lead: decides what is done, in what order | TO CONFIRM | TO CONFIRM |
| Decides whether the breach is reportable | TO CONFIRM | TO CONFIRM |
| Reports to the ICO and signs what readers are told | TO CONFIRM | TO CONFIRM |
| Technical lead: contains and investigates | TO CONFIRM | TO CONFIRM |
| Stand-in if any of the above cannot be reached | TO CONFIRM | TO CONFIRM |
| Solicitor to call | TO CONFIRM | TO CONFIRM |
| Insurer and policy number, if there is cyber cover | TO CONFIRM | TO CONFIRM |

**1. Prepare.** Fill in the roles above. Keep this plan, the log template and the secrets table where they can be reached if the site and the repository are both down: TO CONFIRM where. Check each quarter that every person named can sign in to Supabase, Vercel, Stripe and Resend. Run one practice a year.

**2. Identify.** Anything may be the first sign: an ops alert email (`OPS_ALERT_TO`, staff page `/admin/ops`), a reader's message, a message to the security contact, a notice from a provider, or something odd in the logs. Whoever sees it tells the incident lead at once. Write down the time. The ICO says "The clock starts from when you discovered the breach, not when it actually happened" (source 4). Open a log entry straight away, even if it may turn out to be nothing: "You might end up not needing to report it, but start a log anyway" (source 4).

**3. Contain.** Stop the harm before finding the cause. Use Part 2. Do not delete logs or data that show what happened.

**4. Assess.** Find out what data, whose, how many people, and what could happen to them. Remember what is and is not readable here. Answers, notes and then and now entries are sealed in the database. A copy of the database alone does not reveal them. A copy of the database together with the sealing keys does. Email addresses, names, purchase records, consent flags and which workbooks a person is enrolled on are not sealed. Enrolment on a mental health or faith title is itself sensitive.

**5. Report.** The ICO's guide says: "You must report a notifiable breach to the ICO without undue delay, but not later than 72 hours after becoming aware of it" (source 6). On the threshold, the ICO says "If a risk is likely, you must notify us" and "if a risk is unlikely, you don't have to report it" (sources 5 and 6). If unsure, use the ICO's self-assessment tool or call the ICO advice line, which the ICO's small organisations page gives as 0303 123 1113 (source 4). The report is made online. The ICO says you do not need every fact before reporting. The report must contain what source 6 lists: a description of the nature of the breach, including where possible the categories and approximate numbers of people and records; a contact point; the likely consequences; and the measures taken or proposed. A decision not to report is written in the log with the reason.

Where Akana is the processor (a publisher's white-label site, or an organisation's roster), tell the controller. The ICO's guide says a processor "must inform you without undue delay as soon as it becomes aware" (source 6). The draft organisation agreement promises more than that: "within 48 hours of becoming aware" (`docs/legal/organisation-dpa.md`, line 48), and it says what the notice will contain (line 71). So for roster data the working deadline is 48 hours, not 72. The controller, not Akana, then decides on reporting.

Where one of Akana's own providers has the breach (Supabase, Vercel, Stripe, Resend, and Sentry or Google if switched on), the same rule runs the other way: they must tell Akana, and Akana's clock starts when Akana becomes aware. Whether each provider's contract says so: TO CONFIRM with the solicitor.

Other reports to consider, as questions for the solicitor at the time: the card schemes through Stripe if payment data is involved; the police or Action Fraud if a crime is suspected; the insurer; authors and publishers if their manuscripts or payout details are involved; a data protection authority in another country if readers there are affected.

**6. Tell people.** The ICO says "If the risk to people is high, you must also notify those people without undue delay" (source 5). The message must be "in clear and plain language" and give at least a contact point, the likely consequences and the measures taken or proposed (source 6). Send it by email through Resend if Resend is not the thing that was breached. Say what happened, what data, what Akana has done and what the reader can do. Do not name a workbook title in the email. House rule: emails never name a title.

**7. Learn.** Within two weeks, write what happened, why, and what changes. Close the log entry. Update this plan, the DPIA (`docs/compliance/dpia-draft.md`) and the lessons file.

## Part 2. First steps for this stack

Work from the top. Stop when the harm is contained.

**If a secret may be exposed.** Rotate it using the table in Part 3, then redeploy. Rotate the one that leaked and anything stored beside it.

**If someone is in an account they should not be in.** For a reader: sign the reader out of all sessions from the Supabase dashboard (the exact control: TO CONFIRM). For a staff account: remove the role from `platform_roles`, remove the user's factors and sign them out. Note that the review found a removed staff role keeps working until the token expires (finding M1) until that fix is live, so also rotate the Supabase JWT secret if a staff account is compromised: TO CONFIRM this step with whoever runs the Supabase project, because it signs everyone out.

**If the app itself is doing harm (a bad release).** Roll back in Vercel with Instant Rollback. The steps are in `docs/ROLLBACK.md`.

**If the site must be taken offline.** There is no maintenance switch in the code. The options that exist are:

1. Vercel. Roll back to a known good deployment (`docs/ROLLBACK.md`). To take the site down entirely, pause the project or remove the production domain in the Vercel dashboard: TO CONFIRM the exact control on the current plan, and try it once on a preview.
2. Features. Cohort flags such as `web_push` and `programme_friends` can be switched off by a platform owner at `/admin/flags`, and each change is written to the audit log (migration 0064). The `live_payments` flag cannot be moved from that page. To stop payments, the routes to check are that flag in the database and the Stripe keys in Vercel: TO CONFIRM the quickest safe way and write it here.
3. Scheduled jobs. Blank `CRON_SECRET` in Vercel and redeploy. Every cron route then answers 503 and does nothing (`.env.example`).
4. Email. Set `EMAIL_MODE` to anything other than `live`, or remove `RESEND_API_KEY`, and redeploy. Mail then goes only to the test recipient or nowhere.
5. Database. Restricting or pausing the Supabase project stops everything, including sign-in: TO CONFIRM how on the current plan. Use only if the database itself is being read by an attacker.

**If the database opened access it should not have (a row level security mistake).** `docs/ROLLBACK.md` already says: treat it as a security incident, ship the closing migration first, then find out who read what from the logs.

**Where the logs are.**

| What | Where | Kept for |
|---|---|---|
| Requests and server errors | Vercel dashboard, the project's Logs | TO CONFIRM on the current plan |
| Database, sign-in and API logs | Supabase dashboard, Logs | TO CONFIRM on the current plan |
| Staff actions on user records, money and consent events | `audit_log` table, read by platform owners | No limit set (review finding M21) |
| Operational events and alerts | `ops_events` table and `/admin/ops` | 90 days |
| Payments, refunds, disputes, webhook deliveries | Stripe dashboard (events and webhook deliveries) | TO CONFIRM |
| Emails sent, bounced, complained | Resend dashboard | TO CONFIRM |
| Errors, if Sentry is switched on | Sentry project | TO CONFIRM |
| Deployments and who made them | Vercel deployments list, GitHub history | |
| Staff actions taken directly in the Supabase dashboard | Not in `audit_log` (`docs/SUPPORT_MFA_RECOVERY.md`). Write them in the incident log by hand. | |

Export or screenshot the relevant logs early. Some are kept only for a short time.

**Backups.** See `docs/BACKUPS.md`. The review found that a restore has not yet been tested (finding L8). Do not rely on a restore during an incident until that test has been done.

## Part 3. Secrets and where each is rotated

Every secret named in `.env.example`. Values are never written here or anywhere in the repository. After changing a value in Vercel, redeploy so running code picks it up. The exact dashboard screens should be checked by the technical lead and added: TO CONFIRM.

| Variable | What it is | Where it is rotated | Where the new value goes | What to know before rotating |
|---|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Full access to the database, past row level security | Supabase dashboard, project API keys | Vercel (production, and preview and staging have their own) | Server routes fail until the new value is deployed. |
| `ANSWERS_KEYS` | The key ring that seals answers, notes and then and now entries | Make a new key with `pnpm tsx scripts/new-seal-key.ts` | Vercel, production only, marked sensitive | Never remove an old key. Add the new key first in the list and keep the old ones, or everything sealed with them becomes unreadable for good. Re-sealing is a separate job. If the key ring leaked together with the database, treat every answer as disclosed. |
| `STRIPE_SECRET_KEY` | Stripe API access | Stripe dashboard, API keys | Vercel | Checkout and Stripe calls fail between the change and the redeploy. Whether Stripe lets the old key run on for a short overlap: TO CONFIRM in the dashboard. |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for the platform webhook endpoint | Stripe dashboard, the platform webhook endpoint's signing secret | Vercel | Events are refused until the values match. Stripe retries. |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Signing secret for the connected accounts endpoint | Stripe dashboard, the Connect webhook endpoint's signing secret | Vercel | As above. |
| `CRON_SECRET` | Shared secret for every scheduled job route | Generate with `openssl rand -hex 32` | Vercel, and Supabase Vault as `cron_secret` (`docs/CRON.md`) | Change both places together or Supabase Cron calls are refused. The review notes previews hold the same value as production (finding M33). |
| `RESEND_API_KEY` | Sending email | Resend dashboard, API keys: create a new key, then delete the old | Vercel | No mail is sent between deleting the old key and the redeploy. |
| `LEAD_HASH_SALT` | Salt for the IP hashes on forms and the daily visitor hash | Generate with `openssl rand -hex 32` | Vercel | Old hashes stop matching, so per-address rate limits and that day's unique counts reset. |
| `VAPID_PRIVATE_KEY` | Signs web push messages | Make a new pair with `pnpm tsx scripts/new-vapid-keys.ts` | Vercel, marked sensitive, with the matching `VAPID_PUBLIC_KEY` | Existing push subscriptions were made against the old public key and are expected to stop working until readers switch notifications on again: TO CONFIRM by test before relying on it. |
| `QUOTE_IMAGE_SECRET` | Signs the line the server draws on a quote image | Generate a random string of at least 32 characters | Vercel | Quote image links signed with the old value stop working. |
| `SENTRY_AUTH_TOKEN` | Uploads source maps at build time, if Sentry is used | Sentry, auth tokens | Vercel | Build-time only. No reader data. |
| `STAGING_SUPABASE_SERVICE_ROLE_KEY` | Staging database access for content publishing | Supabase dashboard, staging project | The owner's own machine only, never Vercel | |
| `PRODUCTION_SUPABASE_SERVICE_ROLE_KEY` | Production database access for content publishing | Supabase dashboard, production project | The owner's own machine only, never Vercel | It is the production project's service role key, so it is expected to be the same value as `SUPABASE_SERVICE_ROLE_KEY` in production. Rotating one means updating both places. |

Named in `.env.example` and not secret, so not in the table: the Supabase URL and publishable key, Stripe price, coupon and portal configuration ids, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, the Sentry DSNs, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`, addresses and switches. A legacy variable `ANSWERS_KEY_V1` is read by `packages/seal` if set and is not in `.env.example`: TO CONFIRM whether it is set anywhere.

Secrets that live outside `.env.example` and should be added to this table by the owner: the Supabase database password and JWT secret, the Supabase, Vercel, Stripe, Resend and GitHub account logins and their second factors, the Google OAuth client secret if one exists, and the domain registrar login. TO CONFIRM.

## TO CONFIRM list for this document

1. Every name and contact in the roles table.
2. Where an offline copy of this plan is kept.
3. Whether each provider's contract requires it to tell Akana of a breach, and how fast.
4. The notification period Akana will promise publishers on white-label sites (no white-label terms exist yet). The organisation draft says 48 hours.
5. The exact control for taking the site offline on Vercel, for restricting the Supabase project, and for stopping payments quickly.
6. Log retention at Vercel, Supabase, Stripe, Resend and Sentry.
7. The exact rotation screens for each secret, and the JWT secret step.
8. Whether rotating the VAPID key ends existing push subscriptions.
9. Whether `ANSWERS_KEY_V1` is set anywhere.
10. Secrets held outside `.env.example`.
11. Whether there is cyber insurance, and the insurer's reporting terms.

## Sources

Read on 25 November 2026 through a web fetch tool that returns extracts. Check each quotation against the live page before relying on it. Each ICO page says the guidance is under review following the Data (Use and Access) Act 2025.

4. ICO, "72 hours: how to respond to a personal data breach": https://ico.org.uk/for-organisations/advice-for-small-organisations/personal-data-breaches/72-hours-how-to-respond-to-a-personal-data-breach/
5. ICO, "UK GDPR data breach reporting (DPA 2018)": https://ico.org.uk/for-organisations/report-a-breach/personal-data-breach/
6. ICO, "Personal data breaches: a guide": https://ico.org.uk/for-organisations/report-a-breach/personal-data-breach/personal-data-breaches-a-guide/

Source numbers match the full list at the end of `docs/compliance/legal-corrections.md`.
