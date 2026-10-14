# Public-domain record: Home Education (AK-B9XEG)

House record for F-118. Status: not yet reviewed. Facts come from the repo planning files and from the source check of 10 October 2026; anything they do not establish is marked [to confirm].

Workbook: `home-education`, page `/w/home-education-b9xeg`. JSON twin: `content/public-domain/AK-B9XEG.json`.

## The work

Title: Home Education

Author: Charlotte M. Mason

First published: 1886 (the preface in the file says the lectures were first published in 1886 under this title). The edition used is the fifth edition, revised and enlarged, of 1906 [second source to confirm]

## Contributors and death years

| Name | Role | Died | Source |
|---|---|---|---|
| Charlotte M. Mason | author | 1923 | Project Gutenberg catalogue page, as recorded in docs/planning/AK_Demo_Catalogue_Plan.md section 7 and the public_domain block in docs/planning/AK_Demo_Catalogue.json. Not yet checked against a second source [to confirm]. |

## Edition used

Home Education, by Charlotte M. Mason. 'Home Education' Series, Volume I. Fifth edition (revised and enlarged), eighth and ninth thousand. London: Kegan Paul, Trench, Trübner & Co., Ltd., Dryden House, Gerrard Street, W., 1906. Project Gutenberg eBook #71087, released 2 July 2023, produced by Carol Brown, Tim Lindell, Turgut Dincer and the Online Distributed Proofreading Team from images made available by the Internet Archive. https://www.gutenberg.org/ebooks/71087

Copyright status of the edition: The title page names the fifth edition of 1906 and the publisher and place of printing. The file opens with a Dante epigraph with Longfellow's translation (Longfellow died 1882), a Preface to the 'Home Education' Series, a Preface to the Fourth Edition dated Scale How, Ambleside, 1905, and the contents list, all in Mason's own voice apart from the epigraph. No introduction, notes or editing by another hand appear apart from the epigraph translation. The body is Parts I to VI, with footnotes. The workbook uses selected chapters only (see selection) and says so.

Typographical arrangement: UK publishers hold a 25-year right in the typographical arrangement of an edition (Research 4, cited in docs/planning/AK_Demo_Catalogue_Plan.md section 7). Quotations must come from the Project Gutenberg transcription, never from a modern reprint layout.

Project Gutenberg: The Project Gutenberg name is a trade mark. Strip the Gutenberg header and licence before use and do not use the name in marketing. Acknowledge as "text from a public-domain edition" with the source in the notes [check the current licence wording].

## Source file

Fetched on 10 October 2026 from the GITenberg mirror (github.com/GITenberg/Home-education-b-Home-Education-Series-Vol-1-of-6_71087). Converted to UTF-8 with LF line endings. SHA-1 of the converted file: dda36fdccf5723642975dba0306166bc78a5cba8. 15,421 lines, 778,922 bytes, about 130,500 words including front matter, footnotes, contents and index. The text is not committed whole. It is kept outside the repository, and `docs/content/sources/AK-B9XEG/mason-1906.txt` is reserved for it in the workbook's `internal.manuscript_file`.

## Source check (10 October 2026)

Run with `pnpm tsx scripts/classics-source-check.ts <source> --code AK-B9XEG`.

- Edition named: yes (fifth edition, 1906).
- Published before 1931: true (1886).
- UK life plus 70: true. The term ran to 31 December 1993 (Mason, died 1923).
- Copyright result: clear.
- Gutenberg header and licence cut before the scan.
- Scan: 752,629 characters, 35 unusual (0.005 percent), 0 replacement characters, 0 digits inside words. Result: ok.

The script checks arithmetic, not facts. The death year and the publication year were supplied from the planning files and the file's own preface and are not yet checked against a second source.

## Selection used in the workbook

Home Education is a long book on bringing up children under nine. `content/workbooks/classics/home-education.json` is not a summary of it. It selects the parts that make a programme for a parent's own practice, over eight weeks as in the catalogue. Every exercise asks about the reader's own time, attention, observation and plan. None asks about a child's health, development or progress, and nothing in the workbook gives advice on those.

| Week | Focus | Chapters used |
|---|---|---|
| 1 | Time outdoors | Part II, chapters 1, 10 and 12 |
| 2 | Looking and describing | Part II, chapters 2 and 3 |
| 3 | Calendar of firsts and nature notebook | Part II, chapters 4 and 5 |
| 4 | Habit | Part III, chapters 5 and 7; Part IV, introduction |
| 5 | Attention and short blocks | Part IV, chapter 1; Part II, chapter 12 (Houdin's game) |
| 6 | Reading once and telling back | Part V, chapters 8 and 9 |
| 7 | The atmosphere of home | Preface, principles 5 and 6; Part IV, introduction; Part III, chapters 4 and 9; Part I, chapter 1 |
| 8 | Reading and a plan | Part V, chapters 1 and 8; Part I, chapter 1 |

In all, Part I ch. 1; Part II ch. 1 to 5, 10, 12; Part III ch. 4, 5, 7, 9; Part IV introduction and ch. 1; Part V ch. 1, 8, 9; and Preface principles 5 and 6. That is about 22,900 of the roughly 105,000 words in the body. Each week has 8 or 9 key ideas and 2 exercises, about 15 minutes in all, and the workbook has about 8,300 reader-facing words.

Left out: Part I ch. 2 to 7 (including ch. 6 on diet, air and health); Part II ch. 6, 7, 8, 9, 11, 13 and 14; Part III ch. 1, 2, 3, 6 and 8; Part IV ch. 2 to 8; Part V ch. 2 to 7 and 10 to 21; Part VI. These are teaching methods for a child, physiology, health advice or religious formation. The reasons are in the workbook's `internal.cut_log`.

The book makes claims about children's health, diet, clothing, wet weather, brain activity and obedience. None is quoted or repeated. Where the workbook states a claim, it is attributed to Mason in her words and is about the parent's own conduct. Mason writes "mother" throughout; the Start screen says so and asks the reader to read it as parent.

## Modernisation log

5,081 changes, all from the reversible rules in `packages/validate/src/classics.ts` (spelling and typography only):

| Rule | Changes |
|---|---|
| Curly single quote to straight | 2,603 |
| Double hyphen to comma | 1,728 |
| Curly double quote to straight | 721 |
| "to-day" | 14 |
| "to-morrow" | 5 |
| Two-word "any one" to "anyone" (not before "of") | 4 |
| Two-word "every one" to "everyone" (not before "of") | 4 |
| "To-morrow" | 1 |
| "To-day" | 1 |

Reverting the log on the modernised text returns the cut source byte for byte (checked). SHA-1 of the modernised text: 4cc0c3d5fb1500a0d44ecf81bcbe421ef52ec486. The full log is at `docs/public-domain/AK-B9XEG.modernisation-log.json` (SHA-1 40001271324885c8cfeaec2c874d5945ec41d72d).

Known issue. The double-hyphen rule writes a comma and a space. Where the printed text had a comma before the dash, the result is a doubled comma. There are 43 in the whole file. No quotation in the workbook includes one. A fix in the tooling (consume the preceding comma) is a separate commit.

Outside the rules. Mason's spelling is already British. Italic markup (underscores) is dropped inside quotations. The workbook's own prose is en-GB. No [Editorial] changes were made. Quotations in `content/workbooks/classics/home-education.json` are exact and were checked by part and chapter against the modernised copy.

## Rule applied and conclusion by launch market

Tier: A. Research 4 Tier A: published before 1931 and every author and translator died before 1946 (docs/planning/AK_Demo_Catalogue_Plan.md section 7).

| Market | Rule | Conclusion | Basis |
|---|---|---|---|
| GB | Life plus 70 years (UK). | Clear | Charlotte M. Mason died 1923. The term ran to the end of 1993. Holds once the death year is confirmed. |
| US | Published before 1931 (Research 4 Tier A test). | Clear | First published 1886. The edition used was printed in 1906. Both are before 1931. |
| CA | Canadian term is not recorded in the repo planning files [to confirm]. | To confirm | Needs the Canadian rule applied to a death year of 1923 and the edition named here [to confirm]. |
| AU | Australian term is not recorded in the repo planning files [to confirm]. | To confirm | Needs the Australian rule applied to a death year of 1923 and the edition named here [to confirm]. |
| NZ | New Zealand term is not recorded in the repo planning files [to confirm]. | To confirm | Needs the New Zealand rule applied to a death year of 1923 and the edition named here [to confirm]. |
| IE | Life plus 70 years (EU rule; Ireland is an EU member state). | Clear | Charlotte M. Mason died 1923. The term ran to the end of 1993. Holds once the death year is confirmed. |

## Still to check

- [ ] Confirm Mason's death year (1923) against a second source.
- [ ] Confirm the 1886 first publication and the 1906 fifth edition against a second source (the file's own preface and title page give both).
- [ ] Clinical Safety and Editorial to agree the chapter selection (see "Selection used in the workbook").
- [ ] Apply the Canadian, Australian and New Zealand rules and record the result.
- [ ] Check the Project Gutenberg licence wording before the acknowledgement is written.
- [ ] Proofread the workbook against the modernised text and name a second reviewer (pipeline steps 6 and 7).
- [ ] Sign the review line below.

## Sources

- docs/planning/AK_Demo_Catalogue_Plan.md section 7
- docs/planning/AK_Demo_Catalogue.json (workbook home-education, public_domain block)
- https://www.gutenberg.org/ebooks/71087
- https://github.com/GITenberg/Home-education-b-Home-Education-Series-Vol-1-of-6_71087 (mirror the text was fetched from)
- scripts/classics-source-check.ts output, 10 October 2026

## Review

Reviewed by: ______

Date: ______
