# Standing rules for AI coding tools on this repository

Read this before any change. It is short on purpose. The longer sources are docs/LESSONS_LEARNED.md, docs/TESTING.md and docs/REVIEW_GATE.md. If a rule here clashes with a request, stop and say so. Do not choose quietly.

## Secrets and accounts

1. No secrets in code, tests, fixtures, docs, commit messages or logs. Keys come from the environment. New variables go in .env.example with a line saying what happens while they are blank. A feature must degrade quietly when its variable is blank.
2. The Supabase service role key is for server code only. It must never appear in browser code, in a client component, or in anything under NEXT_PUBLIC_. CI fails the build if the key name reaches the client bundle.
3. Never type, guess or invent a secret. If a value must match across two systems, the owner sets both.
4. Do not create accounts, accept terms, spend money or change billing on anyone's behalf.

## Production and destructive commands

5. Never run anything against production: not the production database, Supabase project, Stripe live account, Vercel production or any deployed address. Work locally or on staging only, and only when the task says so.
6. Ask before any command that deletes or migrates: drop, truncate, delete, reset, force push, rm -r, applying a migration, changing a lockfile you were not asked to touch. Ask first even when the command looks routine.
7. Do not push unless asked. Never push to a branch another session is using. Use a new branch and a pull request.
8. No auto-run, bypass or "accept everything" mode for tool permissions. Every command that writes, deletes or reaches the network goes through normal approval.

## Database

9. Never edit an applied migration. Add a new one with the next number. Migrations must be safe to run twice.
10. Every new table gets, in the same migration: row level security switched on, explicit policies, explicit revokes from anon and authenticated, then only the grants the app needs.
11. Every new table gets a signed-out test in supabase/tests that proves anon reads and writes nothing. Blank request.jwt.claims between cases in every test that sets claims.
12. Client roles get column grants, never table-wide update or insert. Anything a reader must not change (price, role, status, ownership, counters) is not in the grant.
13. A SECURITY DEFINER function that takes a caller-chosen id, hash or amount is service role only. Wrap it so the server passes the signed-in user and the database works out the rest.
14. Staff checks live in the database as well as the app. A hidden button or a route check is not access control.
15. After merging branches, grep new migrations for repeated function names, then run the database suite.

## Application code

16. No file or storage path built from user input. Look the path up from a record you own, or generate it on the server.
17. Validate every request body with a schema, and enforce a body size limit before parsing.
18. Prices, limits, rates and thresholds come from config or the database, never from literals in a component.
19. No third-party scripts, fonts, trackers or embeds. The CSP allows js.stripe.com only, and scripts/check-csp.mjs enforces it.
20. Before removing a grant or tightening a function, grep apps/web and packages for every caller and keep each one working.
21. Do not weaken or delete a test to make it pass. If a test encodes old, faulty behaviour, change it to assert the fixed behaviour and say so.
22. Every fix has a test that fails before the fix and passes after.

## Product rules

23. Sealed answers stay sealed. Answers are encrypted with packages/seal, bound to user, tenant and field. Decryption runs only in server code acting for the signed-in owner. No admin route, log line or email unseals or prints an answer.
24. No streaks, missed-day counts or reproach, and no mechanics offered as a response to risk on mental health titles. A return after a gap is a welcome back. Say finished step, not streak.
25. Emails never name a workbook title, theme, topic or condition, in the subject or the body.
26. Help now stays one tap from every screen in a reader flow.
27. Copy follows docs/VOICE.md. Run `pnpm validate --parked --style` when you change reader-facing text.

## Writing

28. UK English. Short sentences. No em dashes. No emojis. Prose over bullets except in checklists. This covers code comments, commit messages, docs and copy.
29. Do not edit docs/DAY_LOG.md, docs/LESSONS_LEARNED.md or docs/planning unless asked.

## How to run the checks

Run from the repo root. Everything below must pass before you say a change is done.

- Types: `pnpm typecheck`
- Lint: `pnpm lint`
- Unit tests: `pnpm test`
- One web test file: `pnpm --filter @akana/web exec vitest run path/to/file.test.ts`
- Content: `pnpm migrate:v1 --check` then `pnpm validate --parked`
- All of the above except content migration: `pnpm check`
- Web build: `NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=placeholder pnpm --filter @akana/web build`
- Database: `DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres bash scripts/db-test.sh` (needs a local Postgres 16; it builds and drops a throwaway database)
- End to end, signed out, local build: `cd apps/web && pnpm e2e` (see docs/TESTING.md)

## Working habits

- Read files in parts. Cap command output with head and tail.
- After any timeout, read the state before retrying. A write may have landed.
- Keep changes small and in the area you were asked about. Report anything you noticed outside it instead of fixing it.
