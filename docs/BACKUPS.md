# Backups

Thursday 8 October 2026. Feature F-145. Facts about Supabase are from its documentation, read on 8 October 2026 (sources at the end). Recheck them before go-live, because plans and prices change.

## The short answer

On the Free plan, Supabase takes **no automatic backups** of the database. If `akana-saas` is still on the Free plan, production has no backup at all today. That must change before the first real reader signs up, because sealed answers, purchases, entitlements and the royalty ledger live only in this database.

What Crent must do:

1. **Check the plan.** Supabase dashboard, Organization settings, Billing. The Day 3 log records the organisation on the Free plan (two active projects allowed). Today the organisation has three projects: `akana-saas` (production, active), `akana-staging` (active) and `workbooks-dev` (paused), which fits the Free plan limit. Confirm which plan it is now.
2. **Move the organisation to Pro before launch** if it is not already. Pro gives daily backups kept for 7 days. This is also item C25 on the post-build list.
3. **Decide on point-in-time recovery (PITR).** See section 3. Recommended once real money is taken.
4. **Start an off-site logical backup** (section 4) whatever the plan, and test a restore once before launch.
5. **Back up Storage files separately.** Database backups do not include them (section 5).

## 1. What Supabase backs up, by plan

| Plan | Automatic daily backups | Kept for | PITR |
|---|---|---|---|
| Free | None. Supabase advises Free projects to export their own data with the CLI and keep it off site | None | Not available |
| Pro | Yes | Last 7 days | Paid add-on |
| Team | Yes | Last 14 days | Paid add-on |
| Enterprise | Yes | Up to 30 days | Paid add-on |

Projects on Postgres 15.8.1.079 and newer use physical backups. `akana-saas` runs Postgres 17 (17.11.0.002), so its backups, once on a paid plan, are physical.

A Free project is also paused after a period of inactivity [check the current rule on the Supabase pricing page]. A paused production database means the site cannot sign anyone in. This is another reason not to launch on Free.

## 2. Restoring from a daily backup

- Restores are done from the dashboard: Database, Backups. Pick the day.
- **The project is offline while it restores.** Downtime depends on the size of the database.
- Everything written after the backup was taken is lost: answers, purchases, ledger lines, sign-ups. Stripe still holds the payments, so purchases and the ledger can be rebuilt from Stripe events (resend them from the Stripe dashboard). Answers written since the backup cannot be rebuilt.
- Only Crent decides a restore. If readers' answers were lost, tell them plainly by email.
- For a schema mistake, do not restore. Fix forward with a new migration (`docs/ROLLBACK.md`).

## 3. Point-in-time recovery

PITR lets you restore to a chosen minute instead of a whole day, so far less is lost.

- It is an add-on for Pro, Team and Enterprise. Supabase's pricing at the time of writing: about $100 a month for 7 days of history, $200 for 14 days and $400 for 28 days, billed by the hour ($0.137, $0.274 and $0.55 an hour).
- The project must run at least the Small compute add-on.
- The PITR add-on is **not** covered by the Spend Cap, so it adds to the bill even with the cap on.

Recommendation for Crent to decide: daily backups on Pro are enough while the site runs in test mode. Turn PITR on (7 days) at the live switch-on, when lost purchases and answers start to matter.

## 4. Our own off-site backup (all plans)

Supabase's own guide for a CLI backup uses three dumps. Run them on Crent's machine, with the connection string from the dashboard (Connect, Session pooler or direct). Never commit the connection string or the dump files.

```
supabase db dump --db-url "$DB_URL" -f roles.sql --role-only
supabase db dump --db-url "$DB_URL" -f schema.sql
supabase db dump --db-url "$DB_URL" -f data.sql --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
```

Notes:

- The schema dump leaves out the Supabase-managed schemas (`auth`, `storage` and extension schemas). The data dump includes their data, including `auth.users`. Keep all three files together.
- The data dump holds sealed answers as ciphertext. They cannot be read without `ANSWERS_KEYS`, which lives only in Vercel and on Crent's machine. Keep a copy of the keys somewhere safe and separate from the dumps: a backup with no key cannot be restored to anything a reader can read, and a key stored with the dump weakens the seal.
- The dumps hold personal data, including health-related answers in sealed form. Store them encrypted, in the UK or EU, and delete old copies on a fixed schedule. The DPIA and records of processing (O11) should name this store.
- Suggested rhythm: daily while live, keep 30 days. Test a restore into a scratch project once before launch and once a quarter.
- Account deletions still apply. A reader who deleted their account must not come back after a restore. After any restore, list the deletion requests made since the backup date (from the audit log or the Stripe and email records) and complete them again before the site reopens.

## 5. Storage files

Database backups do not include files stored through Supabase Storage. The database only holds their metadata.

Akana has one bucket today, `org-files` (private, created in migration 0014), which holds files authors and organisations upload, such as manuscripts and signed documents. Copy it separately: Supabase's migration guide uses a small script with the Storage API to copy every object. Until that runs on a schedule, a restore brings back the file list but not the files.

## 6. Checklist

| # | Item | Owner | How to verify | Status |
|---|---|---|---|---|
| B1 | Organisation plan confirmed | Crent | Billing page shows the plan | Open |
| B2 | Pro plan on before launch | Crent | Database, Backups shows daily backups listed | Open |
| B3 | PITR decision recorded (on at live switch-on, or not) | Crent | Add-ons page; decision in `DAY_LOG.md` | Open |
| B4 | Off-site CLI dump runs and is stored encrypted | Crent | Three files from the latest run, dated | Open |
| B5 | Restore tested into a scratch project | Crent with an agent | Row counts match production for key tables | Open |
| B6 | `ANSWERS_KEYS` kept safe, apart from the dumps | Crent | Crent confirms where | Open |
| B7 | `org-files` copied off site | Crent with an agent | Object count matches the bucket | Open |

## Sources

- Supabase, Database Backups: https://supabase.com/docs/guides/platform/backups
- Supabase, Manage Point-in-Time Recovery usage: https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery
- Supabase CLI reference, `supabase db dump`: https://supabase.com/docs/reference/cli/supabase-db-dump
- Supabase, Backup and restore using the CLI: https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
- Project list and Postgres version from the Supabase dashboard API, 8 October 2026.
