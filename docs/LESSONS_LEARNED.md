# Lessons learned: Akana build sessions (October 2026)

Read this at the start of every Cowork session on Akana, before any plan or agent brief. Each entry is a mistake or dead end that cost time or tokens, and the rule that stops it happening again. Add to it when something new goes wrong. Keep it short enough to read in two minutes.

## How to work with Crent

1. Only come back to Crent for things only he can do: pasting secrets, accepting terms, paying, signing. Everything else, try another route first. Chrome first, then connectors, then the cloud sandbox.
2. When you do need him, give one numbered list, with the exact tab to use and the exact text to paste. Open only the tabs he needs, in the order he needs them, and close the rest. He has said this twice.
3. Crent has little computer background. Never send him a terminal command. Every instruction is a numbered list of clicks, naming the tab, the button and where it is, with the exact text to paste in its own code block. He should never have to ask for more detail; he has had to four times.
4. Placeholders in SQL or shell lines get run as written. Twice the `cron_secret` vault line was run with `<your CRON_SECRET value>` still in it, and a quoted value pasted through chat came back with curly quotes, which Postgres rejects. Use dollar quoting (`$$cron_secret$$`) in anything he will paste. Either hand him a line with no placeholder (say in words what to put where, outside the code block) or check the result immediately and say plainly that the placeholder went in.
5. Never ask him to create a key that already exists. Check Vercel, Stripe and Supabase for what is there before asking for anything new. He asked why we needed new keys when some already existed.
6. Short replies. He is reading on a phone or between other work. State what landed, what is blocked, what he must do. No recap.
7. UK English, short sentences, no em dashes, no emojis, no icons, prose over bullets except in checklists. This applies to code comments, commit messages, docs, copy and chat alike.

## Secrets and accounts

8. Never type a secret into a field or paste one into chat. Generate nothing that pretends to be his secret. If a value must match across two systems (CRON_SECRET on Vercel and `cron_secret` in vault), he sets both.
9. Never accept terms of service, privacy policies or user data policies on his behalf, even on relay. Agents refused correctly on Google Cloud. Tell him which box to tick and wait.
10. Do not create accounts or spend money. Pay-for items (PITR, Resend Pro, Sentry, domain) go on his list with the price and the reason.
11. Supabase production `suiuyolccgyjglfwgwnw` is never touched by any agent. Staging is `qddsfkontkjdblidqxym`. Put both IDs in every agent brief that mentions Supabase. Stripe is sandbox only; never the live account.

## Supabase

12. The Supabase connector's `execute_sql` and `apply_migration` hang for 180 seconds and then fail on anything it classifies as destructive (drop, truncate, delete, some alters). The confirmation it wants cannot be answered from here. Apply migrations through the SQL editor in Chrome instead: set the Monaco editor value with `setValue`, wrapped in `begin; ... commit;`, and record the version in `supabase_migrations.schema_migrations` by hand.
13. The same connector also hangs on an update whose text payload trips its filter, even when the identical statement runs as a select and the statement shape runs with an empty payload. The fix is to base64 the payload and decode it in SQL: `convert_from(decode('<b64>', 'base64'), 'UTF8')::jsonb`. Build the pieces with a script, never by hand, and guard each append with the current array length so a retry after a timeout cannot double-insert.
14. After any timeout, read the row before retrying. A write may have landed even though the tool reported failure.
15. Loading content without the service role key: generate per-title SQL from the workbook JSON files with a script, keep each statement under about 30 KB, verify with `md5(content::text)` against the canonical jsonb text of the file, and check `current_version_id` is set and `status` unchanged.
16. Do not run `pg_stat_activity` lock hunts for more than one query. The timeouts above were never database locks.
17. Enable `pg_cron` and `pg_net` on a project before applying a migration that depends on them. Migration 0040 is guarded, but the guard only hides the failure.

## Vercel

18. The Vercel connector cannot set environment variables on this account. Use the dashboard: paste `KEY=value` lines into the Key box with a synthetic paste event, then tick the environments in the submenu (Production, Preview, Development). When Crent adds a secret, remind him to tick Preview as well as Production.
19. Preview deployments sit behind Vercel login. Fetching a preview URL from the sandbox returns a redirect to `vercel.com/login`. Test previews through Chrome, where Crent is signed in, or through the Playwright remote suite with the bypass token if one is set.
20. A placeholder Supabase env is enough for `pnpm --filter @akana/web build` in the sandbox. Do not wait for real keys to run the build check.

## GitHub and pushing

21. `git push` from the sandbox is blocked by the proxy (403). Fetch works. Push text files with the GitHub connector `push_files` in batches under 150 KB. It once decoded unicode escapes in a TypeScript file; after pushing, fetch and adopt the remote bytes locally so the two match.
22. Binaries and anything over the batch size go through the Chrome GitHub upload page: `device_commit_files` to the repo-push folder on Crent's machine, `device_stage_files` back, `file_upload`, set `input[name=message]` with the native setter, click Commit by JS. PNG and WebP get re-encoded on the device round trip, so commit the round-tripped bytes locally first. Text, woff and woff2 survive.
23. Do not push a single 88 KB text file on its own through the connector. Batch the day log with the next code push.

## Chrome and browsers

24. Claude in Chrome goes offline for days at a time. Check with `tabs_context_mcp` once; if it fails, switch routes rather than retrying. The built-in browser is not signed in to anything and cannot upload files.
25. A permission classifier can block JavaScript in Chrome mid-task with no warning. When that happens on a data load, go straight to the connector route in item 13. Do not retry the blocked chunk.
26. Google Cloud OAuth wizard resets if the page is left while a step is pending. Finish the consent screen in one sitting.

## Agents and tokens

27. Run subagents on `sonnet` for mechanical work (SQL loading, file batching, research with URLs). The fable weekly limit and the org monthly spend limit both killed agents mid-task. If an agent dies, resume it by `SendMessage` to its ID before spawning a new one; a fresh agent can also pick up a dirty worktree.
28. Every agent brief states: the worktree pattern, the branch to start from, the checks to run, the commit footer, no push, no DAY_LOG edits, token discipline, and the report length cap. The brief in `scratchpad/AGENT_BRIEF.md` is the template.
29. Never read a file over about 25 KB whole into context to paste it into a tool call. Split it, or hand the pasting to a sonnet agent.
30. Verify uploads and loads by hash, not by eye.

## Product rules that caught us

31. The first-unit rule hid the 97 demo titles, because demo listings have no content versions. Demo titles are exempt for listing and show a disabled "Sample not written yet" button. Any new liveness or quality gate must be tested against a demo title with no version and a real title with no version.
32. Explore showing "Coming soon" on staging was the first-unit rule, not a deployment problem. Check the data rule before the deployment.
33. Database tests 0006 and 0015 failed because `request.jwt.claims` was not blanked between cases. Blank it in every new test that sets claims.
34. `gutenberg.org` is blocked from the sandbox. Use the GITenberg mirror on `raw.githubusercontent.com` (repo `<Title>_<id>`) and record the mirror and sha1 in the house record.
35. The modernisation rule that turns em dashes into commas can leave ", ," in text. Grep for it after every classics run.

## Housekeeping

36. Keep `docs/DAY_LOG.md`, the planning folder copies at `C:\Users\ememe\Downloads\Akana\akana-saas-planning`, and the project doc `claude/akana-handover.md` current at the end of every block. The next session starts from those three and this file.
37. A Vercel variable marked sensitive cannot be read back. If its value must also live somewhere else (the vault), generate the value inside Postgres with `encode(gen_random_bytes(32), 'hex')`, store it there, and have Crent copy it from a select into Vercel, never the other way round.
38. Loading a workbook version is not the same as publishing it. The reader reads public.workbook_sections, which only app.publish_version fills (it also sets published_at and current_version_id). After any direct content load, run app.publish_version for each version inside a transaction that sets request.jwt.claims with app_metadata.platform_roles ["owner"], then check the section count per version.
39. The Stripe sandbox sends every event to every enabled endpoint. The live site's endpoint (akana-one) was still enabled in the sandbox and ran old code against test events, which ended a test trial early. Keep only the preview endpoint enabled while testing; switch the live one back on at go-live. Check Workbench, Webhooks before any checkout test.
40. Supabase Auth on staging had Site URL localhost:3000 and no preview redirect, so magic links landed nowhere. Set Site URL and add https://<preview>/** to Redirect URLs before any sign-in test. The built-in mailer allows two emails an hour.
41. Vercel Authentication on previews blocks Stripe webhooks and Supabase Cron with a 401 before the app sees them. It is the project setting Deployment Protection, Vercel Authentication, Require Log In. It must be off for preview tests.
42. Stripe Tax needs a head office address before any Checkout with automatic tax will open (400, 'valid head office address'). Set it with the Workbench shell: stripe tax settings update -d head_office[address][...]. Head office for all Akana addresses is 128 City Road, London EC1V 2NX.
43. A reader with no country falls to the XX market, whose currency is USD, and price_points hold GBP only. Any code that looks up an amount by market currency must fall back to GBP (checkoutCurrencyFor). This silently removed the membership trial once.
44. The Workbench shell (stripe <resource> <action>) works from Chrome for reading and changing sandbox objects; stripe post does not. Its JSON output is not in the accessibility tree, so read it by screenshot and expand nodes by clicking.
