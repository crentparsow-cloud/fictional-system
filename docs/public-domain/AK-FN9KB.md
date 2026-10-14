# Public-domain record: Meditations (AK-FN9KB)

House record for F-118. Status: not yet reviewed. Facts come from the repo planning files and from the source check of 10 October 2026; anything they do not establish is marked [to confirm].

Workbook: `meditations`, page `/w/meditations-fn9kb`. JSON twin: `content/public-domain/AK-FN9KB.json`.

## The work

Title: Meditations

Author: Marcus Aurelius

First published: Long's translation first published 1862 [second source to confirm]. The original was written about 170 to 180 CE

## Contributors and death years

| Name | Role | Died | Source |
|---|---|---|---|
| Marcus Aurelius | author | 180 | Project Gutenberg catalogue page, as recorded in docs/planning/AK_Demo_Catalogue_Plan.md section 7 and the public_domain block in docs/planning/AK_Demo_Catalogue.json. Not yet checked against a second source [to confirm]. |
| George Long | translator | 1879 | Project Gutenberg catalogue page, as recorded in docs/planning/AK_Demo_Catalogue_Plan.md section 7 and the public_domain block in docs/planning/AK_Demo_Catalogue.json. Not yet checked against a second source [to confirm]. |

## Edition used

'Thoughts of Marcus Aurelius Antoninus', translated and edited by George Long (1862), Project Gutenberg eBook #15877, released 22 May 2005, transcribed by the Online Distributed Proofreading Team. https://www.gutenberg.org/ebooks/15877

Copyright status of the edition: The translation carries its own copyright, so the translator's death year decides the UK and EU term. Long died 1879. The file's header names Long as translator and editor. It opens with a biographical sketch and an essay on the philosophy of Antoninus, both in Long's voice, then the twelve books with Long's footnotes, then an index of terms. No introduction by another hand appears in the file. The workbook draws on the twelve books only. The file does not name the printing it was transcribed from (publisher and year are not stated). It is an illustrated edition in American spelling, which suggests a later American printing of Long's text, so the printing is [to confirm]. The Gregory Hays and Robin Hard translations are in copyright and are not used.

Typographical arrangement: UK publishers hold a 25-year right in the typographical arrangement of an edition (Research 4, cited in docs/planning/AK_Demo_Catalogue_Plan.md section 7). Quotations must come from the Project Gutenberg transcription, never from a modern reprint layout.

Project Gutenberg: The Project Gutenberg name is a trade mark. Strip the Gutenberg header and licence before use and do not use the name in marketing. Acknowledge as "text from a public-domain edition" with the source in the notes [check the current licence wording].

## Source file

Fetched on 10 October 2026 from the GITenberg mirror (github.com/GITenberg/Thoughts-of-Marcus-Aurelius-Antoninus_15877). Converted to UTF-8 with LF line endings from the ISO-8859-1 file named in its header. SHA-1 of the converted file: c81cb6289cadfb030dffb8d34ecb2191684e74ff. 8,205 lines, 443,480 bytes. The text is not committed whole. It is kept outside the repository, and `docs/content/sources/AK-FN9KB/long-1862.txt` is reserved for it in the workbook's `internal.manuscript_file`.

## Source check (10 October 2026)

Run with `pnpm tsx scripts/classics-source-check.ts <source> --edition "..." --published 1862 --died 180,1879`.

- Edition named: yes (Long, 1862).
- Published before 1931: true (1862).
- UK life plus 70: true. The term ran to 31 December 1949, counted from the later death (Long, 1879).
- Copyright result: clear.
- Gutenberg header and licence cut before the scan.
- Scan: 423,779 characters, 0 unusual (0.000 percent), 0 replacement characters, 0 digits inside words. Result: ok.

The script checks arithmetic, not facts. The death years and the publication year were supplied from the planning files and are not yet checked against a second source.

## Modernisation log

203 changes, all from the reversible rules in `packages/validate/src/classics.ts` (spelling and typography only):

| Rule | Changes |
|---|---|
| Double hyphen to comma | 164 |
| Two-word "any one" to "anyone" (not before "of") | 18 |
| "&c." to "etc." | 8 |
| Two-word "every one" to "everyone" (not before "of") | 5 |
| "to-morrow" | 5 |
| "to-day" | 1 |
| "To-day" | 1 |
| "To-morrow" | 1 |

Reverting the log on the modernised text returns the cut source byte for byte (checked). SHA-1 of the modernised text: 76137dd2933843d35a245dfdede6e239c589bba8. The full log is at `docs/public-domain/AK-FN9KB.modernisation-log.json` (SHA-1 a3f9fc1f0120ae105e3c7954e9ba8b08a4e2ae2b).

Known issue. The double-hyphen rule writes a comma and a space. Where the printed text had a comma before the dash, the result is a doubled comma. There are 39 in the twelve books. No quotation in the workbook includes one. A fix in the tooling (consume the preceding comma) is a separate commit.

Outside the rules. Long's American spellings (labor, honor, favor) stay as printed inside quotations. The workbook's own prose is en-GB. No [Editorial] changes were made. Quotations in `content/workbooks/classics/meditations.json` are exact and were checked by book and section against the modernised copy.

## Rule applied and conclusion by launch market

Tier: A. Research 4 Tier A: published before 1931 and every author and translator died before 1946 (docs/planning/AK_Demo_Catalogue_Plan.md section 7).

| Market | Rule | Conclusion | Basis |
|---|---|---|---|
| GB | Life plus 70 years (UK). | Clear | George Long (translator, the later of the two deaths) died 1879. The term ran to the end of 1949. Holds once the death year is confirmed. |
| US | Published before 1931 (Research 4 Tier A test). | Clear | Long's translation was first published in 1862 [to confirm], before 1931. |
| CA | Canadian term is not recorded in the repo planning files [to confirm]. | To confirm | Needs the Canadian rule applied to a death year of 1879 and the edition named here [to confirm]. |
| AU | Australian term is not recorded in the repo planning files [to confirm]. | To confirm | Needs the Australian rule applied to a death year of 1879 and the edition named here [to confirm]. |
| NZ | New Zealand term is not recorded in the repo planning files [to confirm]. | To confirm | Needs the New Zealand rule applied to a death year of 1879 and the edition named here [to confirm]. |
| IE | Life plus 70 years (EU rule; Ireland is an EU member state). | Clear | George Long (translator, the later of the two deaths) died 1879. The term ran to the end of 1949. Holds once the death year is confirmed. |

## Still to check

- [ ] Confirm George Long's death year (1879) against a second source.
- [ ] Confirm the first publication year of Long's translation (1862) against a second source.
- [ ] Name the printing the Gutenberg file was transcribed from (publisher and year), and record it as the edition used.
- [ ] Apply the Canadian, Australian and New Zealand rules and record the result.
- [ ] Check the Project Gutenberg licence wording before the acknowledgement is written.
- [ ] Proofread the workbook against the modernised text and name a second reviewer (pipeline steps 6 and 7).
- [ ] Sign the review line below.

## Sources

- docs/planning/AK_Demo_Catalogue_Plan.md section 7
- docs/planning/AK_Demo_Catalogue.json (workbook meditations, public_domain block)
- https://www.gutenberg.org/ebooks/15877
- https://github.com/GITenberg/Thoughts-of-Marcus-Aurelius-Antoninus_15877 (mirror the text was fetched from)
- scripts/classics-source-check.ts output, 10 October 2026

## Review

Reviewed by: ______

Date: ______
