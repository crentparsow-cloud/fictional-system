# Public-domain record: Self-Help (AK-7SWKN)

House record for F-118. Status: not yet reviewed. Facts come from the repo planning files and from the source check of 10 October 2026; anything they do not establish is marked [to confirm].

Workbook: `self-help`, page `/w/self-help-7swkn`. JSON twin: `content/public-domain/AK-7SWKN.json`.

## The work

Title: Self-Help

Author: Samuel Smiles

First published: 1859 (John Murray, London). The text used is the John Murray edition of 1897

## Contributors and death years

| Name | Role | Died | Source |
|---|---|---|---|
| Samuel Smiles | author | 1904 | Project Gutenberg catalogue page, as recorded in docs/planning/AK_Demo_Catalogue_Plan.md section 7 and the public_domain block in docs/planning/AK_Demo_Catalogue.json. Not yet checked against a second source [to confirm]. |

## Edition used

'Self-Help; with Illustrations of Conduct and Perseverance', by Samuel Smiles, LL.D., John Murray edition of 1897, Project Gutenberg eBook #935, released 28 December 2014 (first posted 10 June 1997), transcribed by David Price. https://www.gutenberg.org/ebooks/935

Copyright status of the edition: The file's own header reads "Transcribed from the 1897 John Murray edition by David Price", so the printing is named: John Murray, 1897. The text is a later revised printing of the 1859 book, not the first edition. Footnotes in it refer to "this revised edition" and to events as late as 1866. The file holds a preface dated September 1859, the contents, thirteen chapters and a block of footnotes. No introduction or notes by another hand appear in the file. The edition year is taken from the file header only and is not yet checked against a second source [to confirm]. The workbook draws on six chapters (I, IV, VIII, X, XI and XIII), see the chapter selection below.

Typographical arrangement: UK publishers hold a 25-year right in the typographical arrangement of an edition (Research 4, cited in docs/planning/AK_Demo_Catalogue_Plan.md section 7). Quotations must come from the Project Gutenberg transcription, never from a modern reprint layout.

Project Gutenberg: The Project Gutenberg name is a trade mark. Strip the Gutenberg header and licence before use and do not use the name in marketing. Acknowledge as "text from a public-domain edition" with the source in the notes [check the current licence wording].

## Chapter selection

The book runs to about 139,700 words in the cut text. The catalogue length is six weeks, so six chapters are selected, one a week. The other seven are not summarised.

| Week | Chapter | Title in the book |
|---|---|---|
| 1 | I | Self-Help, National and Individual |
| 2 | IV | Application and Perseverance |
| 3 | VIII | Energy and Courage |
| 4 | X | Money, Its Use and Abuse |
| 5 | XI | Self-Culture, Facilities and Difficulties |
| 6 | XIII | Character, The True Gentleman |

About 62,700 of about 135,400 words of chapter text (footnotes excluded) were read for the selection.

Not used: II (Leaders of Industry), III (Three Great Potters), V (Helps and Opportunities), VI (Workers in Art), VII (Industry and the Peerage), IX (Men of Business) and XII (Example, Models). Chapters II, III, V, VI and VII are long runs of lives of inventors, potters, scientists, artists and peers, and add examples rather than new ideas. Chapters IX and XII overlap with the chapters kept (time and order sit in Chapter IV, example and influence in Chapters I and XIII) and can be added if the programme is lengthened.

Cuts inside the chapters kept are listed in the workbook's `internal.cut_log`: war, empire and race passages in Chapter VIII; health and exercise passages in Chapter XI; drink, class and religious passages in Chapter X; the imperial heroes at the end of Chapter XIII. The workbook is written to avoid the text's gendered and class language where it can, and the start screen, the week 1 note on the limits of his examples, and the introductions to weeks 4 and 6 tell the reader that the book reflects 1859.

Difference from the catalogue. The catalogue outline (weeks 3 and 4: small things and use of time; weeks 5 and 6: money, character and the people who helped you) predates this selection. The workbook follows the usual spine instead: self-help, application and perseverance, energy and courage, money, self-culture, character. Use of time is covered inside Chapter IV (Buffon, Scott, Drew) and Chapter XI (spare minutes). The people who helped you are covered in Chapter I (de Tocqueville). The catalogue outline in docs/planning is not edited here.

Claims. No income, wellbeing, health or treatment claim appears in the workbook. Passages that promise prosperity (for example Lord Erskine's "road to prosperity and wealth" in Chapter XIII) are not quoted. The money unit says in its introduction that it gives no financial advice and makes no promise about money, and its exercises ask for no amounts.

## Source file

Fetched on 10 October 2026 from the GITenberg mirror (github.com/GITenberg/Self-Help-with-Illustrations-of-Conduct-and-Perseverance_935). Converted to UTF-8 with LF line endings. The file names UTF-8 as its character set and opens with a byte order mark, which the header cut removes. SHA-1 of the converted file: fa029ba2e73855d21c95c9b71e84f841b79474bb. 13,309 lines, 853,146 bytes. The text is not committed whole. It is kept outside the repository, and `docs/content/sources/AK-7SWKN/smiles-1897.txt` is reserved for it in the workbook's `internal.manuscript_file`.

## Source check (10 October 2026)

Run with `pnpm tsx scripts/classics-source-check.ts <source> --code AK-7SWKN --write <out>` after the edition name was added to the JSON twin.

- Edition named: yes (John Murray, 1897).
- Published before 1931: true (1859).
- UK life plus 70: true. The term ran to 31 December 1974, counted from Smiles's death in 1904.
- Copyright result: clear.
- Gutenberg header and licence cut before the scan.
- Scan: 824,979 characters, 9 unusual (0.001 percent), 0 replacement characters, 0 digits inside words. Result: ok.

The script checks arithmetic, not facts. The death year and the publication year were supplied from the planning files and are not yet checked against a second source.

## Modernisation log

4,199 changes, all from the reversible rules in `packages/validate/src/classics.ts` (spelling and typography only):

| Rule | Changes |
|---|---|
| Curly double quote to straight | 2,006 |
| Em dash to comma | 1,098 |
| Curly single quote to straight | 1,064 |
| "to-morrow" | 6 |
| Two-word "any one" to "anyone" (not before "of") | 6 |
| "to-day" | 5 |
| Two-word "every one" to "everyone" (not before "of") | 5 |
| "connexion" | 3 |
| "&c." to "etc." | 3 |
| "To-morrow" | 2 |
| "to-night" | 1 |

Reverting the committed log on the modernised text returns the cut source byte for byte (checked; 833,526 bytes, SHA-1 64876da9641f36b5df62ef3365ac89affc1fc6b7). SHA-1 of the modernised text: 184d5b1a74a5d374becc93a247fe08f62824b3c7. The full log is at `docs/public-domain/AK-7SWKN.modernisation-log.json` (SHA-1 8e0969c8d6bcb9e44a2700aed7a3a07863fbd348), one entry per line to keep the file small.

Known issue. The em-dash rule writes a comma and a space. Where the printed text had a comma before the dash, the result is a doubled comma. There are 140 in the whole text. No quotation in the workbook includes one, and each quotation was cut to avoid them. A fix in the tooling (consume the preceding comma) is a separate commit.

Outside the rules. Smiles's 1897 spellings (labour, honour, civilisation) are already British. Italic markers in the transcription (underscores) are left out of every quotation, and no quotation spans one. No [Editorial] changes were made. Quotations in `content/workbooks/classics/self-help.json` are exact and were checked by chapter against the modernised copy.

## Rule applied and conclusion by launch market

Tier: A. Research 4 Tier A: published before 1931 and every author and translator died before 1946 (docs/planning/AK_Demo_Catalogue_Plan.md section 7). The 1897 printing is also before 1931.

| Market | Rule | Conclusion | Basis |
|---|---|---|---|
| GB | Life plus 70 years (UK). | Clear | Samuel Smiles (author, the only contributor named in the file) died 1904. The term ran to the end of 1974. Holds once the death year is confirmed. |
| US | Published before 1931 (Research 4 Tier A test). | Clear | First published 1859 and the printing used is 1897, both before 1931. The 1897 year comes from the file header [second source to confirm]. |
| CA | Canadian term is not recorded in the repo planning files [to confirm]. | To confirm | Needs the Canadian rule applied to a death year of 1904 and the edition named here [to confirm]. |
| AU | Australian term is not recorded in the repo planning files [to confirm]. | To confirm | Needs the Australian rule applied to a death year of 1904 and the edition named here [to confirm]. |
| NZ | New Zealand term is not recorded in the repo planning files [to confirm]. | To confirm | Needs the New Zealand rule applied to a death year of 1904 and the edition named here [to confirm]. |
| IE | Life plus 70 years (EU rule; Ireland is an EU member state). | Clear | Samuel Smiles (author, the only contributor named in the file) died 1904. The term ran to the end of 1974. Holds once the death year is confirmed. |

## Still to check

- [ ] Confirm Smiles's death year (1904) against a second source.
- [ ] Confirm the 1897 John Murray printing against a second source (the Gutenberg header is the only evidence in the repo).
- [ ] Apply the Canadian, Australian and New Zealand rules and record the result.
- [ ] Check the Project Gutenberg licence wording before the acknowledgement is written.
- [ ] Proofread the workbook against the modernised text and name a second reviewer (pipeline steps 6 and 7).
- [ ] Sign the review line below.

## Sources

- docs/planning/AK_Demo_Catalogue_Plan.md section 7
- docs/planning/AK_Demo_Catalogue.json (workbook self-help, public_domain block)
- https://www.gutenberg.org/ebooks/935
- https://github.com/GITenberg/Self-Help-with-Illustrations-of-Conduct-and-Perseverance_935 (mirror the text was fetched from)
- scripts/classics-source-check.ts output, 10 October 2026

## Review

Signer: Crent Parsow, owner. The signature line below is left to sign.

Reviewed by: ______

Date: ______
