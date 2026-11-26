# Zod 4 assessment (review item M30, 25 November 2026)

Decision: do not upgrade zod now. Zod stays on 3.25.76. This page gives the evidence and the trigger for revisiting.

## The advisory

`pnpm audit --prod` reports GHSA-mrhx-c7xc-m3w5 (high, CVSS 8.2, availability only) against zod `<4.6.6`. The advisory page is marked unreviewed. It names Zod 4's array parser (`handleArrayResult`), which records an issue for every failing element with no cap. It does not mention zod 3, so the audit flags 3.25.76 by version range alone.

I tested zod 3.25.76 directly. It behaves the same way. A 4 MB array of numbers against `z.array(z.string()).max(8)` produced 2,000,001 issues, took 1.9 seconds and held about 545 MB. A 900 KB array held about 130 MB. So the flaw exists in practice in zod 3 too. The condition is a collection whose elements fail validation, in a body large enough to matter.

## Where zod parses request input

Eight route handlers parse `await request.json()`: answers, progress, marks, then-now and four checkout routes. Studio, outline, support, leads, takedown and title-request forms parse form fields. None of these routes sets its own body limit before `json()`. The only ceiling is the platform's (Vercel functions refuse bodies over 4.5 MB), so this assessment assumes up to 4.5 MB.

## Is the condition reachable

Mostly no.

- Route bodies contain no arrays except `/api/answers`. Its `value` is a recursive union of JSON types, so every element a JSON parser can produce is valid. No element fails, so no issues pile up. The 32 KB answer cap runs after parsing, which is worth moving earlier (check `content-length`) but is not this flaw.
- `today/settings.ts` has `days` capped at 7 entries of small integers. A long array adds one "too big" issue plus up to one per failing element, so the cost is bounded only by the body size. I did not trace which action calls it, so treat it as the same class as the author paths below.
- The studio builder and the author JSON editor are the real exposure. They parse arrays of objects. Both check byte length before parsing (600 KB and 900 KB). From the test above, a 900 KB hostile array costs about 130 MB and half a second. That is a nuisance for one signed-in author, not an outage.
- Content files (`packages/schema`, `packages/seed`, `packages/validate`) are parsed at build or in scripts from our own repository, not from requests.

Conclusion: no unauthenticated route can be driven into the flaw. Two signed-in author paths can burn a few hundred MB for a second, inside size caps.

## What zod 4 would touch

Zod is imported in 21 files: 17 in apps/web, 2 in packages/schema, 2 in packages/seed. It is declared in four package.json files (web, schema, seed, validate). Changes that affect them:

- `errorMap`, `required_error` and `invalid_type_error` are removed in favour of `error`. Files: support.ts, leads.ts, takedown.ts, studio-outline.ts, schema/guide.ts, seed/build.ts.
- `z.record(z.unknown())` with one argument is no longer allowed (seed/build.ts).
- `.strict()` (11 files), `.uuid()` (5, and zod 4 checks the RFC variant bits), `.email()`, `.url()` and `.finite()` (1 each) are deprecated or stricter in zod 4. Existing ids and test fixtures need checking.
- `.default()` (2 files) now returns the default without parsing it.
- `z.ZodType<unknown>` and `z.lazy` in answers/route.ts need new generics.
- Issue objects and message texts change. Tests that match error text will fail. Code that reads `.error.issues` (validate/index.ts, support.ts and others) mostly keeps working.
- The `zod-validation-error` package from the lint toolchain is separate and unaffected.

Estimate: about 21 source files and an unknown number of tests, one to two days including a full content validation run on all 20 workbooks. The workbook schema is the risk, because it defines the published file format.

## Recommendation

Leave zod 3 for now and record the accepted risk. The audit step in CI is non-blocking for this reason. Do these cheaper things first: reject oversized bodies before parsing (check `content-length` in a shared helper for the eight JSON routes), and keep the size checks on the studio and editor paths. Plan the zod 4 move as its own change, after launch, with the 20 workbooks as the acceptance test. Revisit sooner if the advisory is reviewed and shows an unauthenticated path, or if a route starts accepting arrays of objects from signed-out visitors. When the move is done, make the CI audit step blocking.
