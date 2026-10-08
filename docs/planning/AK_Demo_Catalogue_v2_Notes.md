# Demo Catalogue v2: notes (F-153)

Prepared Thursday 8 October 2026. **Nothing here has been applied to any database. Crent must approve the titles first.**

The files:

- `docs/planning/AK_Demo_Catalogue_v2.json`: version 1 plus the 120 new titles from `docs/research/catalogue/`. Version 1 (`AK_Demo_Catalogue.json`) is unchanged.
- `supabase/seed/seed_v2_preview.sql`: the seed built from v2. It is headed DO NOT APPLY UNTIL CRENT APPROVES. A guard after `begin;` raises an error unless the session sets `akana.apply_v2_preview = 'yes'`, so pasting it into a project's SQL editor writes nothing.
- `packages/seed`: `buildSeed({ catalogue: "v2" })` or `buildSeedV2()`, `pnpm --filter @akana/seed preview:v2` to rewrite the preview, and `src/seed.v2.test.ts`. `supabase/seed/seed.sql` is still built from v1 and is byte-identical (a test compares it).

## Counts

190 workbooks: 20 Maya Vaughn, 115 demo and 55 public-domain classics. 96 catalogue authors (53 demo, 43 public domain) plus Maya Vaughn. Six demo imprints (Brackenfold Books is new). 120 new codes, all provisional.

| Shelf | From v1 | New | Demo | Classics | Maya Vaughn placed | Total |
|---|---|---|---|---|---|---|
| Mind and Mood | 5 | 6 | 10 | 1 | 16 | 27 |
| Health and Body | 0 | 7 | 5 | 2 | 2 | 9 |
| Personal Growth | 4 | 12 | 8 | 8 | 0 | 16 |
| Love and Relationships | 6 | 4 | 9 | 1 | 0 | 10 |
| Family and Parenting | 5 | 9 | 13 | 1 | 0 | 14 |
| Work and Career | 18 | 9 | 24 | 3 | 0 | 27 |
| Money | 6 | 7 | 10 | 3 | 0 | 13 |
| Learning and Skills | 6 | 10 | 11 | 5 | 0 | 16 |
| Faith and Spirituality | 0 | 47 | 18 | 29 | 0 | 47 |
| Creativity and Making | 0 | 9 | 7 | 2 | 0 | 9 |
| **Placed in a Theme** | **50** | **120** | **115** | **55** | **18** | **188** |
| No Theme (Maya Vaughn) | | | | | 2 | 2 |
| **Total** | | | | | | **190** |

All 50 active Themes hold at least three titles once classics and Maya Vaughn titles are counted. No title sits on the retired Reading Scripture Theme. These numbers match `docs/research/catalogue/SUMMARY.md`.

Every catalogue row loads as `draft`. The 20 Maya Vaughn rows stay `in_review`. Nothing loads live (see "Status" below).

## Merge decisions

**Authors.** One record per real person. The research files had already settled this at code level, and v2 keeps it: Thoreau (AU-F4SW6) for Walking and Walden, Cicero (AU-48E8W) for On Old Age and On Friendship, and the version 1 records for Franklin (AU-BXMPD: The Way to Wealth, the Autobiography), Bennett (AU-7FGRT: four titles) and Smiles (AU-HX8HW: Self-Help, Thrift). No version 1 bio was edited. The Tama Rāwiri-Hughes and Wanjiru Kamau-Otieno church-group bio lines are not added; they need Crent.

**Duplicate works.** Walden and the Autobiography of Benjamin Franklin appear once each, in `growth-love-family`. The Franklin record uses the Eliot text, Gutenberg #148.

**Title clash.** One title check says clash: Letters to Open Later (AK-RMVAJ). It becomes Letters Left in the Drawer, the checked `title_alternative`. Its id and url slug follow the new title (`letters-left-in-the-drawer-rmvaj`); the code is kept. The old title, id and slug are kept on the record. Twelve titles marked "close" are kept as they are and still need the Legal Lead's ISBN check.

**Removed.** The four Bible study titles (`removed_bible_study`) are skipped. They are listed under `removed` so their codes and slugs are never reused.

**Genre spelling.** Hyphens throughout, as version 1 and the loader expect. Nine `learning-creativity` titles changed from `life_skills` or `personal_development`. Three demo authors had a genre outside the 11 (creative-writing, life-writing, creativity); each now takes the genre of its own workbooks.

**Safety tier.** Each record now carries `safety_tier` (the schema value: none, standard or higher) next to `safety_profile`. The 15 non-wellbeing titles marked `standard` are written `wellbeing_standard`, the seed's value for tier standard, so they keep Help now. No tier was lowered. One Window Open stays `wellbeing_higher`. Every new title is at or above its Theme's tier. The loader refuses a record whose `safety_tier` and `safety_profile` disagree.

**Advice notes.** The 10 `money_guidance_not_advice` values (six in v1, four in faith) are written `not_financial_advice`, the value the schema stores; the schema alias already maps one to the other, so nothing changes in meaning. `not_medical_advice` is in the schema, so its four uses stay. Four new titles had no note although the validator requires one for finance and business: Scientific Advertising and Selling Like a Good Neighbour take `not_legal_or_tax_advice`, Extraordinary Popular Delusions and Thrift take `not_financial_advice`.

**Signposts.** The five new signpost values are kept. Since the summary was written, all five have entries in `content/catalog/support_lines.json` (F-154, checked 7 October). Bereavement lines have no US entry yet.

**Areas.** The seven Health and Body titles take `everyday-health`. Five version 1 Mind and Mood demo titles carried draft area ids (`self-and-connection`, `pace-and-balance`) that the registry never adopted; they now take their Theme's area (`self` or `stress`). Every record's area now matches its Theme's area in the registry. The seed reads the area from the Theme, so the SQL is unaffected.

**Depth.** Eleven new titles said `full` with `fully_written` false. They are `first_week` now. Every new title is `fully_written: false`.

**Price tiers.** Every title has one of the four tiers. The Ignatius eight-day retreat (AK-4FDEJ) was `short [Crent]`. It is `short`, the lowest tier, with a note, until Crent picks one. Its `weeks` stays null because it runs in days.

**Badges.** `badge` now holds the schema value (`demo` or `public_domain`) on every record, and the old display text moves to `badge_label`. Every demo title is `is_demo: true`.

**Classics.** Each classic carries a `public_domain` block in the v1 shape, built from its house record twin in `docs/public-domain/json/`, plus a pointer to the record. None of the 55 records is signed, so every classic is `draft`. The death year column takes 0 to 2100, so Cicero's 43 BCE goes in as null; the house record keeps the date.

**Theme moves.** Meditations (AK-FN9KB) moves from Chosen Habits to Wisdom for Living, as the registry already moved stoicism there. Without it Wisdom for Living holds two titles. This needs Crent's yes.

**Maya Vaughn.** 18 titles are placed in Themes, as `mind-health.json` proposes. The placement sets the seeded row's `theme_id` only; the v3 files are not edited, and every tier stays as the file has it. Finding Your People and Wired Differently stay with no Theme.

**Copy.** The registry claims check found four lines in the new files. They were reworded: Drafts, Not Verdicts card line ("Treat a bad day" to "Read a hard day") and week 4, Still Curious at Seventy week 8, and the Franklin Autobiography week 6. The check now finds no claims across 2,311 strings. 25 style warnings remain, none blocking: mostly "practice" as a noun, plus words like journey, failure and circle in real titles and outlines.

**Codes.** Every AK-, AU- and PB- code is unique across v2, the 20 Maya Vaughn files, the removed codes and the rest of the repo. No new code appears anywhere outside the research files and the house records. No workbook id clashes with a registry shelf, area or Theme id. The 120 new workbook codes, 73 new author codes and PB-7AFQE stay marked `provisional`.

Every changed record lists its changes in `v2_changes`.

## Conservative answers assumed (N8 to N13)

These questions are unanswered. v2 takes the recommended option for each.

| # | Assumed |
|---|---|
| N8 | The workbook's own tier wins. Quieting the Noise, Still Standing, Facing the Room and Finding Your Way Back stay standard in higher-tier Themes. The Theme tier is a floor for new titles only. |
| N9 | One primary Theme per workbook, one author record per person, no cross-listing. The four requests (Walden, Franklin, Home Education, The Sunday Morning Circle) are kept under `cross_listing_requests` and not applied. |
| N10 | Carnegie's The Art of Public Speaking is not added. |
| N11 | In His Steps, How We Think and The Elements of Style load as draft and stay off sale at launch (`release: tier_b_off_sale_at_launch`). |
| N12 | The seven new areas are internal labels, approved. Health and Body uses Everyday Health. |
| N13 | No sixth fixed shelf is named, so the 10-shelf proposal stands. |

Also left open and not assumed: the faith genre (N3), the Theological Reviewer (N5), other traditions (N15) and the Ignatius tier (N16). Faith titles use existing genres, as `faith.json` does.

## Status

F-153 says demo titles load live. The preview loads every catalogue row as `draft` instead, because nothing is approved and the release gate (0016) expects a workbook to go live through `public.release_version`. Each record says what it waits for in `release`:

| `release` | Titles |
|---|---|
| `demo_live_after_approval` | 97 |
| `after_faith_genre_decision_and_theological_review` (faith demo) | 18 |
| `after_house_record_signed` | 24 |
| `after_house_record_signed_and_theological_review` (faith classics) | 26 |
| `after_house_record_signed_and_tradition_reviewer` (Dhammapada, Song Celestial) | 2 |
| `tier_b_off_sale_at_launch` | 3 |

One existing behaviour to know: the seed upserts `status`, so re-running any seed after titles go live puts them back to draft. That is true of v1 today.

## Checks run on 8 October 2026

- `pnpm --filter @akana/seed test`: 35 passed (12 v1, 23 v2).
- `pnpm typecheck`: every workspace project passes.
- `pnpm validate --parked`: 20 files, 0 failed. It covers v3 workbook files only, and v2 adds none.
- Registry claims check on v2 (a copy of `scripts/check-registry.ts` pointed at v2, run from the scratchpad): 0 claims, 25 style warnings. The v1 check is unchanged at 0 claims.
- `scripts/db-test.sh`: database tests passed.
- Scratch database built from all migrations, created and dropped for this check: the preview refused to run without the setting and wrote nothing. With the setting it loaded cleanly (190 workbooks, 97 authors, 190 books, contributors and listings, 20 versions, 170 draft, 20 in review, none live). Every active Theme held at least three titles and none sat on a retired Theme. A second run upserted in place. Staging and production were not touched.

## Steps after approval

1. Crent approves the titles, the "close" titles and the assumed answers above, the Meditations move and the Maya Vaughn placements, and picks the Ignatius tier.
2. Make any changes in `AK_Demo_Catalogue_v2.json`, then run `pnpm --filter @akana/seed preview:v2` and `pnpm --filter @akana/seed test`.
3. Run the code collision check again and set `code_status` to `final` on the approved codes. Set `approval` to Crent's name and date.
4. Point the main seed at v2: in `scripts/seed.ts`, call `buildSeed({ root: ROOT, catalogue: "v2" })`. Update the v1 counts in `packages/seed/src/seed.test.ts` (70 workbooks, 17 Themes used, `hidden_until_min_books`), then run `pnpm tsx scripts/seed.ts --sql`. That rewrites `seed.sql` without the guard. Delete `seed_v2_preview.sql`, `src/v2.ts`, `src/preview-v2.ts` and the preview tests in the same pull request.
5. Run the DB tests, then load `seed.sql` into a scratch database. Apply to staging, then production, by the usual route, with Crent's go-ahead for each.
6. Release through `public.release_version`, not the seed: demo titles first, faith demo titles after N3 and N5, each classic once its house record is signed, Tier B never at launch. Move each signed house record twin from `docs/public-domain/json/` to `content/public-domain/` and add it to the RECORDS list, as `INDEX_NEW.md` says.
7. Later, if Crent wants the Maya Vaughn placements in the content too, set `theme_id` in the v3 files. That is a content change with its own review.
