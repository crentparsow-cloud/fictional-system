# Akana handover (9 October 2026, evening)

Read this first in a new session. Repo: crentparsow-cloud/fictional-system. Live site: akana-one.vercel.app. Master log: docs/AKANA_LOG.md. Replaces the 9 October morning handover.

## State
- main at aeb4e50. CI green. 947 web unit tests. Vercel production READY.
- Supabase production akana-saas (suiuyolccgyjglfwgwnw, Pro plan), staging akana-staging (qddsfkontkjdblidqxym). Migrations 0001 to 0035 on both. 0035 fixed app.uid() to read JSON JWT claims; before it no signed-in reader could pass the welcome page.
- Production: 102 live titles (97 demo, 5 classics), 18 faith demo and 50 classics in draft, 20 Maya Vaughn in review. The 5 live classics have no content version, so /read is 404 for them; demo titles cannot be bought. Nothing on production can be read and bought together yet (T15).
- Prices are permanent until Crent changes them: p1 to p6 at £7.99, £8.99, £9.99, £11.99, £12.99, £14.99, VAT inclusive, GBP only. Every workbook has a point (194 production, 190 staging). Each point has a Stripe sandbox price on the product "Akana workbook". lib/pricing.ts carries the same figures. Change all three together.
- Membership interim £7.99 a month, £69.99 a year.
- Vercel secrets: all set, including TEST_RECIPIENT, LEADS_NOTIFY_TO and EMAIL_REPLY_TO. OPS_ALERT_TO is a placeholder by decision.
- Stripe: sandbox only. Checkout reaches Stripe and is refused until the sandbox has a head office address for Stripe Tax (S1). Crent must enter it.
- The three-week build is finished. Everything from here is the post-build list and the build list v2.

## Documents
- docs/AKANA_LOG.md: the one log. Sessions, test runs, decisions, post-build changes. Add to it every session.
- docs/testing/AK_Test_Plan.md: individual tests per surface (A), twelve journeys (B), cross-cutting checks (C), release regression (D), run log (E). Part B needs five staging test accounts (T7).
- docs/planning/AK_Post_Build_List.md: 79 open items, 43 only Crent can do.
- docs/planning/AK_Build_List_v2.md: 180-odd ideas in thirteen sections with phase, effort and what Crent must supply. Section 13 holds the twenty research additions. Ends with a Phase A order and five questions.
- docs/research/AK_Market_Research_2026-10.md: nine research strands with evidence and implications.
- docs/DAY_LOG.md: the build history, closed.

## Decisions on 9 October
- Prices permanent on the six-point ladder.
- No-streak, no-countdown, no-pressure rule applies to mental health titles only. Other shelves may use habit mechanics within the law: opt-in, pausable for free, never sold, no fake urgency.
- Full redesign. Blinkist's category ordering is the model for the library.
- Web only. No native app.
- Gmail sign-up by Google One Tap with account linking, verification by Google; magic link for others; two-factor optional for readers, required for staff and money roles.

## Next
1. Crent answers the five questions at the end of the build list and marks the list up. That produces the final list.
2. Crent enters the Stripe Tax head office address, then run test A4.6 (checkout) end to end and record it in the log.
3. Phase A order from the build list, starting with first-party analytics and Google One Tap, then the design system.
4. Content for one sellable title (T15) so the first sale is possible.

## Only Crent
Google OAuth client (C26), Stripe Tax address (S1), company and bank (C15, C16), domain (C5), lawyer and accountant (C29), D1 to D5 money decisions, house-record signer (C10), theological reviewer (C11), staging test account addresses (T7), the five build-list questions.

## Working rules
- UK English, short sentences, no em dashes, no emojis, plain prose. Prose over bullets except checklists.
- One log: docs/AKANA_LOG.md. Copy planning docs to C:\Users\ememe\Downloads\Akana\akana-saas-planning.
- Never type secrets into fields or paste keys into chat. Do not create accounts or spend money.
- On a technical failure try another route first, Chrome if available. Come back to Crent only for things only he can do.
- Evidence-only figures. Honest negative verdicts, plainly.
- Keep tool output capped, verify uploads by hash, batch browser steps, keep replies short.
- Local test commands: README and docs/TESTING.md. Unit tests: pnpm exec vitest run in apps/web.

## Pushing without git push
Git push is blocked unless the session was started with the repo authorised. The GitHub connector works: push_files for text files (one commit, several files), create_or_update_file for one file, delete_file for deletions. For large or binary files use the GitHub web upload page in Chrome (steps in the README). Verify once by comparing the connector's listing with git ls-tree, then git fetch and reset so local matches.

## Parallel agents
Cowork and Claude Code have a sub-agent tool; the web chat does not. Research and build work that benefits from parallel agents belongs in Cowork. Work that needs Chrome, Stripe or Supabase connectors in the loop can run in either.
