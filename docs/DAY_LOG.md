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
