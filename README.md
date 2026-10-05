# Akana

The place where books become practical. A SaaS that turns published books into interactive guided workbooks, for many authors and publishers across genres, with a curated marketplace, a membership library, an invite-only author and publisher portal, and a white-label tier.

Build window: Monday 5 October to Friday 23 October 2026. Go or no-go at 15:00 on Friday 23 October. The plan, architecture, feature list, demo catalogue and open questions are in `docs/planning/`. Read `AK_Handover_2026-10-05.md` first.

## Layout

```
apps/web/            Next.js App Router (marketing, library, reader, studio, console, admin)
packages/schema/     Workbook schema v3 as Zod, identity codes
packages/validate/   Validator: structure, house style, claims by genre, limits, refs, counts
packages/seal/       AES-256-GCM sealing for reader answers, key ring
content/             Workbook JSON (v1 source and v3 output), catalogue, markets, support lines
supabase/            Migrations, RLS tests
scripts/             Migration, validation, key generation, database test runner
legacy/              The current single-page app and edge functions, kept as the behaviour spec
docs/planning/       The planning pack from 5 October
```

## Run it

```
pnpm install
pnpm check            # typecheck, lint, unit tests, content validation
pnpm migrate:v1       # convert the 20 Maya Vaughn workbooks to v3
pnpm dev              # http://localhost:3000
DATABASE_URL=postgres://... scripts/db-test.sh   # migrations plus isolation tests
```

Copy `.env.example` to `apps/web/.env.local` for local work. Production secrets are added in Vercel by Crent. Agents never see the service role key or the sealing keys.

## Rules the code enforces

Reader answers are sealed before they reach Postgres and only the reader can unseal them. Emails never name a workbook title. Help now is one tap away in every wellbeing workbook. Nothing counts streaks or missed days. No third-party scripts or pixels on any host. Demo content is labelled on every surface and cannot be bought. Wellbeing copy runs the full claims check; other genres run a reduced one plus income promise rules.

## Status

Day 1 (5 October): workspace, schema v3 draft, TypeScript validator in agreement with the Python one on all 20 files, sealing with key ring, tenancy migration with RLS and passing isolation tests, app shell with tokens and security headers, CI. The 20 Maya Vaughn workbooks convert cleanly and load as in review; their content findings are parked until Crent clears them.
