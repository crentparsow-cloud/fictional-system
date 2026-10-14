# Public-domain record: How to Live on 24 Hours a Day (AK-QCRRE)

House record for F-118. Status: not yet reviewed. Facts come from the repo planning files and from the source check of 10 October 2026; anything they do not establish is marked [to confirm].

Workbook: `how-to-live-on-24-hours-a-day`, page `/w/how-to-live-on-24-hours-a-day-qcrre`. JSON twin: `content/public-domain/AK-QCRRE.json`.

## The work

Title: How to Live on 24 Hours a Day

Author: Arnold Bennett

First published: 1908 (London, New Age Press); the file follows a later printing with Bennett's preface, taken as 1910 [to confirm]

## Contributors and death years

| Name | Role | Died | Source |
|---|---|---|---|
| Arnold Bennett | author | 1931 | Project Gutenberg catalogue page, as recorded in docs/planning/AK_Demo_Catalogue_Plan.md section 7 and the public_domain block in docs/planning/AK_Demo_Catalogue.json. Not yet checked against a second source [to confirm]. |

## Edition used

'How to Live on Twenty-Four Hours a Day', Arnold Bennett, in a printing that carries Bennett's 'Preface to this edition' (1910 or later; the printing is not named in the file), Project Gutenberg eBook #2274, posted 23 October 2008, released August 2000, produced by Tony Adam with an HTML version by Al Haines. https://www.gutenberg.org/ebooks/2274

Copyright status of the edition: The file does not name the printing it was transcribed from (no publisher or year). It opens with Bennett's own 'Preface to this edition', which says it should be read at the end, then twelve chapters. The preface answers correspondence about the book, so the file follows a printing made after the first one; whether that is the 1910 edition is [to confirm]. No editor, introducer, translator or illustrator is named, so Bennett is the only contributor whose death year counts. The workbook uses the preface and the twelve chapters.

Workbook use: The Preface and the twelve chapters, six weeks: weeks 1 and 2 use Chapters I to IV; week 3 Chapters V and VI; week 4 Chapters VII and VIII; week 5 Chapters IX to XI; week 6 Chapter XII and the Preface. Bennett's passages on sleep, early rising and bodily health, and his claim that concentration cures worry, are not used.

Typographical arrangement: UK publishers hold a 25-year right in the typographical arrangement of an edition (Research 4, cited in docs/planning/AK_Demo_Catalogue_Plan.md section 7). Quotations must come from the Project Gutenberg transcription, never from a modern reprint layout.

Project Gutenberg: The Project Gutenberg name is a trade mark. Strip the Gutenberg header and licence before use and do not use the name in marketing. Acknowledge as "text from a public-domain edition" with the source in the notes [check the current licence wording].

## Source file

Fetched on 10 October 2026 from the GITenberg mirror (github.com/GITenberg/How-to-Live-on-24-Hours-a-Day_2274). Converted to UTF-8 with LF line endings. SHA-1 of the converted file: 636781674bc0ae23bc1be5b24dbd74cef091ac09. 1,757 lines, 91,022 bytes. The text is not committed whole. It is kept outside the repository, and `docs/content/sources/AK-QCRRE/bennett-24hours.txt` is reserved for it in the workbook's `internal.manuscript_file`.

## Source check (10 October 2026)

Run with `pnpm tsx scripts/classics-source-check.ts <source> --edition "..." --published 1910 --died 1931`.

- Edition named: yes.
- Published before 1931: true (1910).
- UK life plus 70: true. The term ran to 31 December 2001, counted from Bennett's death in 1931.
- Copyright result: clear.
- Gutenberg header and licence cut before the scan.
- Scan: 71,699 characters, 0 unusual (0.000 percent), 0 replacement characters, 0 digits inside words. Result: ok.

The script checks arithmetic, not facts. The death year and the publication year were supplied from the planning files and the writing brief and are not yet checked against a second source.

## Modernisation log

68 changes, all from the reversible rules in `packages/validate/src/classics.ts` (spelling and typography only):

| Rule | Changes |
|---|---|
| double hyphen to comma | 63 |
| hyphenated to-morrow | 3 |
| hyphenated to-day | 2 |

Reverting the log on the modernised text returns the cut source byte for byte (checked). SHA-1 of the modernised text: 5844624ecfd480d8dc9f9570e3b6141474767ee6. The full log is at `docs/public-domain/AK-QCRRE.modernisation-log.json` (SHA-1 b634e1dd7208ab6effac53a4ee798632ec611d8f).

Known issue. The double-hyphen rule writes a comma and a space. Where the printed dash followed a mark of punctuation, the comma lands after it (two cases with an exclamation mark in Chapter I and Chapter VII, for example 'chapters!, in the evening'). There are no doubled commas in the text. No quotation in the workbook crosses either place.

Outside the rules. Bennett's spelling is already British, so the rules left it alone. Period spellings and hyphenations outside the rules stay as printed inside quotations (for example boat-sailing and cabinet-room). The workbook's own prose is en-GB. No [Editorial] changes were made. Quotations in `content/workbooks/classics/how-to-live-on-24-hours-a-day.json` are exact and were checked by chapter against the modernised copy (51 of 51 found).

## Rule applied and conclusion by launch market

Tier: A. Research 4 Tier A: published before 1931 and every author and translator died before 1946 (docs/planning/AK_Demo_Catalogue_Plan.md section 7).

| Market | Rule | Conclusion | Basis |
|---|---|---|---|
| GB | Life plus 70 years (UK). | Clear | Arnold Bennett died 1931. The term ran to the end of 2001. Holds once the death year is confirmed. |
| US | Published before 1931 (Research 4 Tier A test). | Clear | First published 1908, with the printing used from 1910 or later [to confirm]. Both are before 1931. |
| CA | Canadian term is not recorded in the repo planning files [to confirm]. | To confirm | Needs the Canadian rule applied to a death year of 1931 and the edition named here [to confirm]. |
| AU | Australian term is not recorded in the repo planning files [to confirm]. | To confirm | Needs the Australian rule applied to a death year of 1931 and the edition named here [to confirm]. |
| NZ | New Zealand term is not recorded in the repo planning files [to confirm]. | To confirm | Needs the New Zealand rule applied to a death year of 1931 and the edition named here [to confirm]. |
| IE | Life plus 70 years (EU rule; Ireland is an EU member state). | Clear | Arnold Bennett died 1931. The term ran to the end of 2001. Holds once the death year is confirmed. |

## Still to check

- [ ] Confirm Bennett's death year (1931) against a second source.
- [ ] Name the printing the Gutenberg file was transcribed from (publisher and year), and confirm whether it is the 1910 edition.
- [ ] Apply the Canadian, Australian and New Zealand rules to a death year of 1931 and record the result.
- [ ] Check the Project Gutenberg licence wording before the acknowledgement is written.
- [ ] Proofread the workbook against the modernised text and name a second reviewer (pipeline steps 6 and 7).
- [ ] Sign the review line below.

## Sources

- docs/planning/AK_Demo_Catalogue_Plan.md section 7
- docs/planning/AK_Demo_Catalogue.json (workbook how-to-live-on-24-hours-a-day, public_domain block)
- https://www.gutenberg.org/ebooks/2274
- https://github.com/GITenberg/How-to-Live-on-24-Hours-a-Day_2274 (mirror the text was fetched from)
- scripts/classics-source-check.ts output, 10 October 2026

## Review

Reviewed by: ______

Date: ______
