# Catalogue research: summary and merge plan

Prepared Wednesday 7 October 2026. This file sums up the five catalogue files in this folder: `mind-health`, `growth-love-family`, `work-money`, `learning-creativity` and `faith`, each as `.json` and `.md`. It reads them against `docs/planning/AK_Demo_Catalogue.json` (version 1, 50 workbooks), `content/catalog/catalog.json` (the 20 Maya Vaughn titles) and the draft taxonomy in `docs/research/taxonomy.json` (10 shelves, 51 Themes). It changes none of them.

Counts were taken from the `coverage` and `workbooks_new` arrays in each JSON file on 7 October 2026. Title checks were still being added to the five files while this was written, so `title_check` values are not summarised here.

## The numbers

| | Workbooks |
|---|---|
| Existing titles placed in a Theme | 68 (45 demo, 5 public-domain classics, 18 Maya Vaughn) |
| Existing titles with no Theme in the draft taxonomy | 2 (Maya Vaughn: Finding Your People, Wired Differently) |
| New titles proposed | 124 (74 demo, 50 public-domain classics) |
| **Grand total if every proposal is accepted** | **194** (119 demo, 55 public-domain classics, 20 Maya Vaughn) |

All 51 Themes would hold at least three workbooks, which is the shelf rule (`SHELF_MIN_COUNT`, default 3). Every new AK- and AU- code is provisional.

"Public domain" means a real public-domain text with a new Akana workbook around it. "Demo" means an invented author and title, labelled Demo and never buyable (B4). Maya Vaughn titles are real, licensed and neither of those, so they have their own column.

A check run for this summary found no clash between any two groups, or between any group and version 1, on workbook ids, url slugs, AK- codes, AU- author codes or PB- imprint codes. It should be run again after the title-check edits land and before the merge.

## Counts by shelf

| Shelf | Existing | New | Total | Public domain | Demo | Maya Vaughn |
|---|---|---|---|---|---|---|
| Mind and Mood | 21 | 6 | 27 | 1 | 10 | 16 |
| Health and Body | 2 | 7 | 9 | 2 | 5 | 2 |
| Personal Growth | 4 | 12 | 16 | 8 | 8 | 0 |
| Love and Relationships | 6 | 4 | 10 | 1 | 9 | 0 |
| Family and Parenting | 5 | 9 | 14 | 1 | 13 | 0 |
| Work and Career | 18 | 9 | 27 | 3 | 24 | 0 |
| Money | 6 | 7 | 13 | 3 | 10 | 0 |
| Learning and Skills | 6 | 10 | 16 | 5 | 11 | 0 |
| Faith and Spirituality | 0 | 51 | 51 | 29 | 22 | 0 |
| Creativity and Making | 0 | 9 | 9 | 2 | 7 | 0 |
| **Placed in a Theme** | **68** | **124** | **192** | **55** | **119** | **18** |
| Not placed (Maya Vaughn) | 2 | 0 | 2 | 0 | 0 | 2 |
| **Grand total** | **70** | **124** | **194** | **55** | **119** | **20** |

Faith and Spirituality is the largest shelf by some way. Growing in Faith alone holds 16 classics. Four faith Themes (Reading Scripture, Faith at Home, Generous Living, Mercy and Comfort) hold demo titles only.

## Counts by Theme

### 1. Mind and Mood (`mind-and-mood`)

Source file: `mind-health.json`.

| Theme | Existing | New | Total | Public domain | Demo | Maya Vaughn |
|---|---|---|---|---|---|---|
| Noticing More (`noticing-more`) | 2 | 1 | 3 | 0 | 2 | 1 |
| Softer Nights (`softer-nights`) | 2 | 1 | 3 | 0 | 2 | 1 |
| Even Pace (`even-pace`) | 3 | 1 | 4 | 1 | 1 | 2 |
| Seeing Yourself Fairly (`seeing-yourself-fairly`) | 2 | 1 | 3 | 0 | 2 | 1 |
| Renewing Energy (`renewing-energy`) | 2 | 1 | 3 | 0 | 2 | 1 |
| Settled Mind (`settled-mind`) | 4 | 0 | 4 | 0 | 0 | 4 |
| Brighter Days (`brighter-days`) | 2 | 1 | 3 | 0 | 1 | 2 |
| Gentle Mending (`gentle-mending`) | 4 | 0 | 4 | 0 | 0 | 4 |
| **Shelf total** | **21** | **6** | **27** | **1** | **10** | **16** |

### 2. Health and Body (`health-and-body`)

Source file: `mind-health.json`.

| Theme | Existing | New | Total | Public domain | Demo | Maya Vaughn |
|---|---|---|---|---|---|---|
| Everyday Movement (`everyday-movement`) | 1 | 2 | 3 | 1 | 1 | 1 |
| Nourishing Meals (`nourishing-meals`) | 1 | 2 | 3 | 0 | 2 | 1 |
| Ageing Well (`ageing-well`) | 0 | 3 | 3 | 1 | 2 | 0 |
| **Shelf total** | **2** | **7** | **9** | **2** | **5** | **2** |

### 3. Personal Growth (`personal-growth`)

Source file: `growth-love-family.json`.

| Theme | Existing | New | Total | Public domain | Demo | Maya Vaughn |
|---|---|---|---|---|---|---|
| Chosen Habits (`chosen-habits`) | 3 | 1 | 4 | 2 | 2 | 0 |
| Quiet Confidence (`quiet-confidence`) | 0 | 3 | 3 | 1 | 2 | 0 |
| Clearer Choices (`clearer-choices`) | 0 | 3 | 3 | 1 | 2 | 0 |
| Living With Purpose (`living-with-purpose`) | 0 | 3 | 3 | 1 | 2 | 0 |
| Wisdom for Living (`wisdom-for-living`) | 1 | 2 | 3 | 3 | 0 | 0 |
| **Shelf total** | **4** | **12** | **16** | **8** | **8** | **0** |

### 4. Love and Relationships (`love-and-relationships`)

Source file: `growth-love-family.json`.

| Theme | Existing | New | Total | Public domain | Demo | Maya Vaughn |
|---|---|---|---|---|---|---|
| Partners in Step (`partners-in-step`) | 3 | 0 | 3 | 0 | 3 | 0 |
| Companionable Days (`companionable-days`) | 3 | 1 | 4 | 1 | 3 | 0 |
| New Chapters (`new-chapters`) | 0 | 3 | 3 | 0 | 3 | 0 |
| **Shelf total** | **6** | **4** | **10** | **1** | **9** | **0** |

### 5. Family and Parenting (`family-and-parenting`)

Source file: `growth-love-family.json`.

| Theme | Existing | New | Total | Public domain | Demo | Maya Vaughn |
|---|---|---|---|---|---|---|
| Raising With Care (`raising-with-care`) | 5 | 0 | 5 | 1 | 4 | 0 |
| Early Days (`early-days`) | 0 | 3 | 3 | 0 | 3 | 0 |
| Changing Families (`changing-families`) | 0 | 3 | 3 | 0 | 3 | 0 |
| Caring Hands (`caring-hands`) | 0 | 3 | 3 | 0 | 3 | 0 |
| **Shelf total** | **5** | **9** | **14** | **1** | **13** | **0** |

### 6. Work and Career (`work-and-career`)

Source file: `work-money.json`.

| Theme | Existing | New | Total | Public domain | Demo | Maya Vaughn |
|---|---|---|---|---|---|---|
| Work Worth Choosing (`work-worth-choosing`) | 4 | 0 | 4 | 0 | 4 | 0 |
| Purposeful Time (`purposeful-time`) | 4 | 0 | 4 | 1 | 3 | 0 |
| Words That Land (`words-that-land`) | 0 | 3 | 3 | 1 | 2 | 0 |
| Shared Direction (`shared-direction`) | 6 | 0 | 6 | 0 | 6 | 0 |
| Welcoming Workplaces (`welcoming-workplaces`) | 0 | 3 | 3 | 0 | 3 | 0 |
| Ventures Taking Shape (`ventures-taking-shape`) | 4 | 0 | 4 | 0 | 4 | 0 |
| Wider Reach (`wider-reach`) | 0 | 3 | 3 | 1 | 2 | 0 |
| **Shelf total** | **18** | **9** | **27** | **3** | **24** | **0** |

### 7. Money (`money`)

Source file: `work-money.json`.

| Theme | Existing | New | Total | Public domain | Demo | Maya Vaughn |
|---|---|---|---|---|---|---|
| Considered Spending (`considered-spending`) | 3 | 0 | 3 | 1 | 2 | 0 |
| Money for Later (`money-for-later`) | 3 | 1 | 4 | 1 | 3 | 0 |
| Paying It Down (`paying-it-down`) | 0 | 3 | 3 | 0 | 3 | 0 |
| Patient Investing (`patient-investing`) | 0 | 3 | 3 | 1 | 2 | 0 |
| **Shelf total** | **6** | **7** | **13** | **3** | **10** | **0** |

### 8. Learning and Skills (`learning-and-skills`)

Source file: `learning-creativity.json`.

| Theme | Existing | New | Total | Public domain | Demo | Maya Vaughn |
|---|---|---|---|---|---|---|
| Unrushed Learning (`unrushed-learning`) | 3 | 1 | 4 | 1 | 3 | 0 |
| Practical Know-How (`practical-know-how`) | 3 | 0 | 3 | 0 | 3 | 0 |
| Digital Ease (`digital-ease`) | 0 | 3 | 3 | 0 | 3 | 0 |
| Guiding Learners (`guiding-learners`) | 0 | 3 | 3 | 1 | 2 | 0 |
| Curious Reading (`curious-reading`) | 0 | 3 | 3 | 3 | 0 | 0 |
| **Shelf total** | **6** | **10** | **16** | **5** | **11** | **0** |

### 9. Faith and Spirituality (`faith-and-spirituality`)

Source file: `faith.json`.

| Theme | Existing | New | Total | Public domain | Demo | Maya Vaughn |
|---|---|---|---|---|---|---|
| Reading Scripture (`reading-scripture`) | 0 | 4 | 4 | 0 | 4 | 0 |
| Rhythms of Prayer (`rhythms-of-prayer`) | 0 | 7 | 7 | 6 | 1 | 0 |
| Growing in Faith (`growing-in-faith`) | 0 | 16 | 16 | 16 | 0 | 0 |
| Faith at Home (`faith-at-home`) | 0 | 4 | 4 | 0 | 4 | 0 |
| Work as Calling (`work-as-calling`) | 0 | 4 | 4 | 1 | 3 | 0 |
| Generous Living (`generous-living`) | 0 | 3 | 3 | 0 | 3 | 0 |
| Mercy and Comfort (`mercy-and-comfort`) | 0 | 4 | 4 | 0 | 4 | 0 |
| Serving Together (`serving-together`) | 0 | 4 | 4 | 1 | 3 | 0 |
| Quiet Contemplation (`quiet-contemplation`) | 0 | 5 | 5 | 5 | 0 | 0 |
| **Shelf total** | **0** | **51** | **51** | **29** | **22** | **0** |

### 10. Creativity and Making (`creativity-and-making`)

Source file: `learning-creativity.json`.

| Theme | Existing | New | Total | Public domain | Demo | Maya Vaughn |
|---|---|---|---|---|---|---|
| Steady Writing (`steady-writing`) | 0 | 3 | 3 | 1 | 2 | 0 |
| Life Stories (`life-stories`) | 0 | 3 | 3 | 0 | 3 | 0 |
| Creative Habits (`creative-habits`) | 0 | 3 | 3 | 1 | 2 | 0 |
| **Shelf total** | **0** | **9** | **9** | **2** | **7** | **0** |

## To reconcile before the merge

### Real authors shared across groups or with version 1

Each of these must end up as one author record in v2, with every workbook pointing at it.

| Author | Code | Workbooks | Where | Point to settle |
|---|---|---|---|---|
| Henry David Thoreau | AU-F4SW6 | Walking (Everyday Movement); Walden (Living With Purpose) | Minted by `mind-health`, reused by `growth-love-family` | One record. `learning-creativity` dropped its own Walden to avoid a duplicate and asks for a Curious Reading cross-listing instead. |
| Marcus Tullius Cicero | AU-48E8W | On Old Age (Ageing Well); On Friendship (Companionable Days) | Minted by `mind-health`, reused by `growth-love-family` | One record. Both use Shuckburgh's translation, Gutenberg #2808, so one edition check serves both house records. |
| Benjamin Franklin | AU-BXMPD | The Way to Wealth (live, version 1); The Autobiography of Benjamin Franklin (Chosen Habits) | Version 1 and `growth-love-family` | Use the Eliot text, Gutenberg #148, not #20203 (editor's death year unknown). `learning-creativity` dropped the same title as a duplicate and suggests a Life Stories cross-listing. |
| Arnold Bennett | AU-7FGRT | How to Live on 24 Hours a Day (live); The Human Machine; Literary Taste; The Author's Craft | Version 1, `growth-love-family`, `learning-creativity` | Four titles on three shelves. The author page and bio must cover all four. |
| Samuel Smiles | AU-HX8HW | Self-Help (live); Thrift (Money for Later) | Version 1 and `work-money` | No conflict. Confirm which printing the Thrift file transcribes. |
| Marcus Aurelius | (version 1) | Meditations (live) | Version 1 | `growth-love-family` counts it under the new Wisdom for Living, not Chosen Habits. That moves a live title to a new Theme. It is a data change, not a safety change, but it needs Crent's yes. |

### Demo authors reused by new groups

| Author | Code | Existing titles | New titles | Point to settle |
|---|---|---|---|---|
| Tama Rāwiri-Hughes | AU-1ZS6X | 2 (Shared Direction, Work Worth Choosing) | Welcome at the Door (`faith`); The New Starter's Desk (`work-money`) | Reused by two groups at once. The bio would need a line for church volunteer teams, which means a version 1 edit [Crent]. |
| Wanjiru Kamau-Otieno | AU-JKGDQ | 3 (Money) | Content With Daily Bread (`faith`) | Same bio question [Crent]. |
| Clodagh Ní Fhaoláin-Burke, Sofia Hedlund-Ahl | AU-PVT1E, AU-ARMK7 | Relationships titles | One or more each in `growth-love-family` | Fits their existing bios. No action beyond a bio read. |
| Matilda Kershaw-Nguyen, Olivier Tremblay-Singh, Rafael Moreira Lins | AU-9WVE6, AU-0TKBN, AU-1DYWF | Learning and relationships titles | One each in `learning-creativity` | Rafael Moreira Lins moves from friendship to life stories. Check the bio still reads true. |
| Haruka Tanabe-Ellis, Nadia Farouk-Hassan | AU-PZ9DF, AU-7WKXG | Mind and Mood titles | One each in `mind-health` | No action. |

### Maya Vaughn titles with no home

Finding Your People (loneliness) and Wired Differently (focus) fit no Theme in Mind and Mood or Health and Body. The nearest Themes elsewhere are Companionable Days (friendship) and Purposeful Time (focus). Both are tier none on non-wellbeing genres, while the Maya Vaughn titles are wellbeing. Placing them there would put a Help now title among titles without it. The other options are a new Mind and Mood Theme, or leaving them on the shelf with no Theme. Whether the Library can show a title with no Theme is not confirmed [check]. Crent decides.

### Cross-listing requests

The catalogue gives each workbook one `theme_id`. Cross-listing would need a new join table. These requests came up:

| Workbook | Held in | Also asked for |
|---|---|---|
| Walden | Living With Purpose | Curious Reading |
| The Autobiography of Benjamin Franklin | Chosen Habits | Life Stories |
| Home Education (Charlotte Mason, live) | Raising With Care | Guiding Learners |
| The Sunday Morning Circle | Guiding Learners | Serving Together |

`mind-health` also counts Moving Through It and Nourished (Maya Vaughn) under Health and Body Themes by Theme only. Their genre and tier stay as they are. Moving a live title's genre or tier gives `SAFETY_CHANGED` and a fresh sign-off.

### Field values that differ between files

| Field | What differs | What the merge needs |
|---|---|---|
| `genre` | `learning-creativity` writes `life_skills` and `personal_development`. Version 1 and the other four files write `life-skills` and `personal-development`. | One spelling, the one the seed loader reads today. |
| `safety_profile` | Version 1 uses `none` and `wellbeing_standard` only. `growth-love-family` (12 titles) and `work-money` (3) add `standard` for non-wellbeing titles on standard-tier Themes. `mind-health` adds `wellbeing_higher` (One Window Open). | Loader mapping for both values, confirmed by the Clinical Safety Lead. |
| `advice_guardrail` | `work-money` writes `not_financial_advice` (5 titles). Version 1 and `faith` write `money_guidance_not_advice` (6 and 4). `growth-love-family` writes `not_medical_advice` (4), which `mind-health.md` says the schema does not have. | One money value. `not_medical_advice` needs an additive schema value or must be dropped [Crent]. |
| `support_signpost` | Five new values: `money_worries_lines` (3 titles), `new_parent_support_lines` (3), `carer_support_lines` (3), `eating_support_lines` (2), `bereavement_support_lines` (1). None is in `support_lines.json`. Only `money_worries_lines` has draft entries, for GB and IE. | Entries checked by market, or the field set to null until they are. |
| `area_id` | The 7 new Health and Body titles have none. `categories.md` proposes `everyday-health`. | Use `everyday-health` if Crent approves the new areas. |
| `depth` | 10 `growth-love-family` titles and 1 `work-money` title say `full` with `fully_written` false. In version 1, `full` means fully written. | Set to `first_week`, or add them to the writing waves on purpose. |
| `price_tier` | The Ignatius retreat runs in 8 day units and says `short [Crent]`. | Crent picks a tier. |
| Optional fields | New files add `group_suitable`, `pd_record`, `tradition`, `scripture_text`, `code_status` and editorial notes. Version 1 has none of them. | Keep them optional. Version 1 records take `group_suitable` from their Theme. |

### Public-domain points

- **Tier B titles.** The house rule ships only Tier A classics at launch (F-118): published before 1931 and every author, translator and editor died before 1946. Three new classics fail that test. In His Steps (Sheldon died 1946) and How We Think (Dewey died 1952) are already marked Tier B. The Elements of Style is marked Tier A in `work-money.md`, but Strunk died in 1946, so by the same rule as Sheldon it is Tier B.
- **No text yet.** Scientific Advertising has no Project Gutenberg text. A 1923 Lord and Thomas scan must be found and transcribed. Modern facsimiles cannot be copied.
- **Other traditions.** The Dhammapada (Max Müller) and The Song Celestial (Edwin Arnold) sit in Quiet Contemplation, labelled Buddhist and Hindu. Each needs a reviewer from its tradition before release.
- **Dale Carnegie.** `work-money.md` notes that The Art of Public Speaking (1915, with J. Berg Esenwein) may now be public domain in the UK and US. It is not in any file. Carnegie died in 1955, so it would be Tier B [Crent].
- **Records.** All 50 new classics need a house record in `docs/public-domain/` and a named reviewer. Canada, Australia and New Zealand terms are still marked [to confirm] for every classic.

### Imprints and names

- Kettlebrook Editions and Larchmere Atlas Books gain new kinds of title. Their imprint notes need widening.
- Brackenfold Books (PB-7AFQE, `work-money`) is a new demo imprint. It still needs a register search.
- Several demo titles and one or two names still wait for an exact-phrase search, as each `.md` file lists. The concurrent title-check pass covers them.

## Merge plan: Demo Catalogue v2

The target is a new file, `docs/planning/AK_Demo_Catalogue_v2.json`. It is not created yet. It waits for Crent's approval of the taxonomy and the open questions in `AK_Questions_for_Crent.md` (section dated 7 October 2026). Version 1 stays as it is until v2 replaces it in the seed.

1. **Gates.** Crent approves the 10 shelves, 51 Themes and 7 new areas, and answers the faith genre, sixth shelf, tier mismatch, cross-listing and Tier B questions. The title-check pass on the five files is finished, and any title or name that failed is replaced.
2. **Freeze the inputs.** Take the five JSON files as they stand after the title checks, record a content hash for each, and make no further edits to them.
3. **Shape.** Keep version 1's top-level keys (`code_rule`, `price_tiers`, `publishers`, `authors`, `workbooks`, `maya_vaughn`). Replace `shelves_proposed`, `areas_proposed`, `themes_new` and `themes_existing_used` with full `shelves`, `areas` and `themes` lists from `taxonomy.json`. Add `support_signposts` for the five new groups.
4. **Authors.** Take the union by code. Keep one record each for Thoreau and Cicero. Keep the version 1 records for Franklin, Bennett, Smiles and the reused demo authors, with bio lines added only where Crent agrees.
5. **Workbooks.** Copy the 124 new records. Normalise `genre`, `safety_profile`, `advice_guardrail`, `area_id` and `depth` as in the table above. Leave the 50 version 1 records unchanged, except for moves Crent approves (Meditations to Wisdom for Living, any Maya Vaughn placements).
6. **Codes.** Re-run the code rule collision check across every workbook, author and imprint, then mark codes final.
7. **Checks.** Run the registry check (claims, style, first words, app words) on all new lines, the hidden-topic leak test with the 34 new Themes, the v3 validator on any first-week content, and the seed builder twice to confirm it is deterministic.
8. **Load.** Demo titles go live with the Demo badge, as now. New classics load as draft and stay there until their house record is signed, as the first five did. Tier B classics stay in draft at launch. Faith titles load only after the faith genre decision, and release only after theological review. Maya Vaughn titles stay in review.
9. **What shows on day one.** A Theme shows only once it holds three live titles (`SHELF_MIN_COUNT`, default 3). If v2 loads with demo titles live and new classics in draft, 26 of the 51 Themes reach three: the ones filled by demo titles and the live version 1 titles. The other 25 rely on new classics or on Maya Vaughn titles still in review, so they stay hidden until those are released. They are Rhythms of Prayer, Growing in Faith, Quiet Contemplation, Wisdom for Living, Curious Reading, Even Pace, Everyday Movement, Brighter Days (none or one live title), Settled Mind and Gentle Mending (all four titles are Maya Vaughn), plus 15 Themes that reach two: Quiet Confidence, Clearer Choices, Living With Purpose, Guiding Learners, Steady Writing, Creative Habits, Noticing More, Softer Nights, Seeing Yourself Fairly, Renewing Energy, Nourishing Meals, Ageing Well, Words That Land, Wider Reach and Patient Investing. Signing the house records for the classics in those Themes is what opens them, so the first batch of records should follow that list.

The build work for this is F-148 (taxonomy seed), F-152 (house records), F-153 (v2 seeding) and F-154 (signposts) in `AK_Feature_List.json`, scheduled in `AK_3_Week_Plan.md`.
