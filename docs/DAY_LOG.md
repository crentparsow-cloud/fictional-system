# Akana build log

One entry per working day. What landed, what is blocked, what Crent needs to do next.

## Monday 5 October 2026 (Day 1)

**Decisions taken today (Crent):** A1 Akana is seller of record. B1 50 demo workbooks at mixed depth. E1 a second Supabase project for staging. Build in the repo this session can reach, rename later if wanted.

**Landed in the repo**

- pnpm workspace: `apps/web` (Next.js 16, App Router, TypeScript), `packages/schema`, `packages/validate`, `packages/seal`.
- Schema v3 draft in Zod (F-107). Genre list, three safety tiers, flexible programme shape, stable ids, depth levels, three new field types declared for week 3. Freeze is Thursday 8 October.
- TypeScript validator (F-108). Agrees with `tools/validate.py` on all 20 Maya Vaughn files: the same 102 content findings, and the four source title mismatches disappear because v3 takes the title from the catalogue.
- v1 to v3 migration (F-111 start). All 20 convert with no structure or reference errors and load as `in_review`. AK- codes are provisional until the naming board codes arrive.
- Sealing with a key ring and tenant-bound AAD (F-134), with tamper and rotation tests.
- Migration 0001: organisations, tenants, tenant domains, profiles, fixed org roles with a permissions table, tenant members, staff roles, flags, config, append-only audit log, RLS helpers (F-129, F-130, F-136, F-080, F-081). Last-owner guard. Isolation tests pass on a throwaway Postgres (F-131 start).
- App shell: design tokens carried from the old app, tenant resolution proxy, strict CSP with no third-party scripts, security headers, Supabase user and admin clients, health route, placeholder home and Publish with Akana page (F-014, F-066 cut, F-125, F-001 placeholder).
- CI: typecheck, lint, unit tests, migration check, content validation, Python cross-check, build, client bundle grep for the service role key name, CSP check, migrations and RLS tests against Postgres 16.

**Blocked, needs Crent**

1. **Push access.** The GitHub repo `crentparsow-cloud/akana` exists and Vercel is already linked to it, but this session is not authorised to push there (the git proxy refuses). The Day 1 commits sit in the workspace. Add the `akana` repo to this task's connected repositories, or push from your machine, and I push the two commits.
2. **Vercel project settings.** The `akana` project builds from the repo root with no framework set. Set Root Directory to `apps/web`, framework Next.js, Node 22. My Vercel access is read only, so I could not change it.
3. **Environment variables in Vercel:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and on Wednesday `ANSWERS_KEYS` (generate with `pnpm tsx scripts/new-seal-key.ts` on your own machine).
4. **Staging project.** Create `akana-staging` in Supabase for preview deploys (E1).
5. **Migration 0001** is tested locally but not applied to `akana-saas`. Say the word and I apply it, or apply it yourself with the Supabase CLI.
6. **Outside track, today's items:** send the three briefs (trade mark attorney, lawyer, accountant). I can draft them tomorrow morning if you want them from here.

**Tomorrow (Tuesday 6 October)**

Validator port hardening and the Themes registry for the ten new genres (T2), tenancy policies for catalogue tables (T1), sign-in with magic link and Google (T1), five-tab reader shell and message files (T4), demo seed loader reading AK_Demo_Catalogue.json (T9), adults-only confirmation and the email system port (T10).

## Tuesday 6 October 2026 (Day 2)

**Approved by Crent before he left:** apply migration 0001 to `akana-saas` (done), and build the day with agents. Four agents worked in parallel on the catalogue schema, the registry and seed loader, the player engine, and the reader shell with sign-in and the email port. I integrated, fixed two mismatches between agents, ran the full check suite, pushed everything, and watched CI and Vercel.

**Live now**

- `akana-one.vercel.app` runs the Day 2 build. `/dev/player` renders the Focus workbook with the new engine (answers not saved, noindex). `/home` and the other reader tabs send a visitor to `/sign-in`. `/sign-in`, `/welcome` and `/auth/callback` are deployed but need the Supabase Auth settings below before a magic link works end to end.
- CI run 30 is green on the final commit: checks, build with the client bundle and CSP guards, migrations 0001 and 0002 with both test files against Postgres 16.
- Migration 0001 is applied to `akana-saas`. Migration 0002 is not (see item 1 below).

**Landed in the repo** (8 commits, 96 files, about 9,100 lines)

- Migration 0002 (T1): genres, shelves, areas, themes, authors, books, book contributors, workbooks, workbook versions, workbook sections, tenant listings. RLS on every table with grants given back table by table. A published version is immutable. Only platform owners and editors move a workbook to approved or live. `app.publish_version()` splits a document into sections with the internal block dropped, and marks listing, start, safety hub and unit 1 free (F-019). `authors.legal_name` is hidden from clients by a column grant. Two advisor warnings from 0001 fixed (citext moved out of public, `touch_updated_at` search path pinned). 19 scenarios in `supabase/tests/0002_catalogue.sql`, all passing.
- Registry (F-112): `content/registry/{genres,shelves,areas,themes}.json`. 11 genres, 7 shelves, 12 areas, 17 themes. `scripts/check-registry.ts` runs the claims check over 519 registry and catalogue strings: 0 claims findings, 2 style warnings.
- Seed (T9): `packages/seed` builds deterministic rows from the catalogue and the 20 v3 files, with stable ids and a content hash per version. `supabase/seed/seed.sql` (1.5 MB) upserts 11 genres, 7 shelves, 12 areas, 17 themes, 12 organisations, 24 authors, 70 books, 70 contributors, 70 workbooks, 20 versions and 70 marketplace listings. Applies and re-applies cleanly on a fresh database after 0001 and 0002. `pnpm tsx scripts/seed.ts --apply` pushes it with the service role key from the environment; not run.
- Engine (T3): `packages/engine`, React components for all ten v1 field types plus a labelled placeholder for the four week 3 types. Screens for Start, Unit, Exercise (full and short), Toolkit, Daily check, Check-in, Self-check (no totals, scores or bands anywhere), Finish and Keep going. A render harness runs every screen of all 20 workbooks: 1,524 renders, 0 failures. No streaks or missed-day counts exist in the engine. 22 tests.
- Reader shell (F-014): five tabs (Home, Today, Toolkit, Library, You) as a bottom bar on phones and a top bar on wider screens, 44px targets, skip link, tokens only. Gates in the layout: no session goes to sign-in, no adult confirmation goes to welcome.
- Sign-in (F-132): magic link form that names no topic or title, same reply whether or not the address exists, `__Host-` cookies, session refresh in the proxy, callback route with a validated return path. Sign-out action.
- Adults-only (F-127): one checkbox on `/welcome`, writes `profiles.adult_confirmed_at`.
- Locale and markets: en-GB and en-US message files with a typed key check, Accept-Language detection, six launch markets plus a fallback with currency, store domain, date locale and Help now lines.
- Emails (F-137): `packages/emails`. 27 reader and partner templates and 8 author templates ported from the old renderer. A test renders every reader template against every theme and fails if any of the 70 catalogue titles or 20 workbook titles appears. Subjects never carry a theme or an address. The mailer refuses marketing and progress mail while the postal address is a placeholder, refuses consent mail without an unsubscribe link, supports one-click unsubscribe headers, hashes addresses in the send log, and sends nothing without `RESEND_API_KEY`. 19 tests.

**Fixed during integration**

- `book_contributors.death_year` check widened from 1000 to 0 so Marcus Aurelius (180) seeds.
- Genre guardrails in 0002 now match the validator and the registry: income promise rules only for finance, business and career.

**Needs Crent**

1. **Apply migration 0002 to `akana-saas`.** The session's safety classifier refused to run it as a production change, so it is tested but not applied. Paste `supabase/migrations/0002_catalogue.sql` into the Supabase SQL editor, or tell me to apply it when you are back and I will try again with your say so in the chat.
2. **Supabase Auth URLs.** In Authentication, URL Configuration: set Site URL to `https://akana-one.vercel.app` and add these redirect URLs: `https://akana-one.vercel.app/auth/callback`, `https://*-crentparsow-clouds-projects.vercel.app/auth/callback`, `http://localhost:3000/auth/callback`. Without this the magic link lands on the Supabase default page.
3. **Google sign-in.** Needs a Google OAuth client (id and secret) added under Authentication, Providers. The button is one line of code once that exists. I did not create any account.
4. **Resend.** Not created, nothing spent. When you have an account, add `RESEND_API_KEY`, `EMAIL_FROM` and `EMAIL_REPLY_TO` in Vercel and paste the rendered sign-in templates into Supabase Auth email templates. SPF, DKIM and DMARC before launch.
5. **Sealing keys.** `ANSWERS_KEYS` still to be generated on your machine (`pnpm tsx scripts/new-seal-key.ts`) and added in Vercel.
6. **Staging project** `akana-staging` (E1) still to be created. I did not create it because it may cost money.
7. **Decisions to confirm.** (a) The `heal` area is named "Loss and Recovery" because "healing" trips the medical claims check; the v1 name is kept in the file. (b) The themes `self-and-connection` and `pace-and-balance` are mapped to the `self` and `stress` areas. (c) Start and safety hub sections are free before purchase, the spec only fixed unit flags. (d) Partner email subjects carry the reader's first name ("Sam would like your support"); easy to make fixed. (e) The catalogue uses `money_guidance_not_advice` as a finance guardrail note id, which is not in the schema enum; one of them needs changing.
8. **Seed the live database** once 0002 is in. Either `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm tsx scripts/seed.ts --apply` on your machine, or paste `supabase/seed/seed.sql` through psql. It is too large for the SQL editor.

**Loose ends on my side**

- The 102 parked content findings on the Maya Vaughn files are unchanged from Day 1 and still wait for your clearance.
- The seed agent left a throwaway database and a second Postgres cluster running in the session; nothing in the repo depends on them.
- The engine puts an exercise on one page with collapsible why and example; the legacy app paged it across five screens. The app decides paging in week 2.

**Wednesday 7 October (Day 3)**

Commerce tables and Stripe Checkout in test mode (T5), entitlements and the `has_entitlement` hook in the sections policy, the Library and Today tabs reading real sections from Supabase, sealed answer storage wired to the engine's store (F-134), Help now hub by market, and the catalogue pages for the marketplace home. Schema freeze is Thursday.
