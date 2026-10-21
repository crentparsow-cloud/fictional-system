# Public-domain record: The Way to Wealth (AK-3TQX1)

House record for F-118. Status: not yet reviewed. Facts come from the repo planning files and from the source check of 10 October 2026; anything they do not establish is marked [to confirm].

Workbook: `the-way-to-wealth`, page `/w/the-way-to-wealth-3tqx1`. JSON twin: `content/public-domain/AK-3TQX1.json`.

## The work

Title: The Way to Wealth

Author: Benjamin Franklin

First published: 1758 (preface to Poor Richard's Almanack for 1758). The printing used is London, 1810

## Contributors and death years

| Name | Role | Died | Source |
|---|---|---|---|
| Benjamin Franklin | author | 1790 | Project Gutenberg catalogue page, as recorded in docs/planning/AK_Demo_Catalogue_Plan.md section 7 and the public_domain block in docs/planning/AK_Demo_Catalogue.json. Not yet checked against a second source [to confirm]. |

## Edition used

'Franklin's Way to Wealth, or, Poor Richard Improved', printed by and for W. and T. Darton, 58 Holborn Hill, London, 1810, Project Gutenberg eBook #43855, released 1 October 2013, produced by Chris Curnow, Emmy and the Online Distributed Proofreading Team. https://www.gutenberg.org/ebooks/43855

Copyright status of the edition: The file names its printer and year on the title page: W. and T. Darton, London, 1810, with plates dated 1805. It opens with a publisher's advertisement, an unsigned introduction in the publisher's voice and a list of other titles, then Franklin's speech in four numbered sections with a closing paragraph signed Richard Saunders. The unsigned introduction and the advertisements are not Franklin's and are not used. The Darton text may differ from the wording Franklin first published in the 1758 almanac preface. The workbook quotes this printing only. No named editor or illustrator appears in the file, so Franklin is the only contributor whose death year counts. An anonymous introduction from 1810 is long out of any term [to confirm].

Workbook use: The speech in full, four weeks built around its themes: week 1 time (the opening address and Section I to the leisure passage), week 2 industry and self-reliance (the rest of Section I and Section II), week 3 frugality (Section III: the sale, small costs, pride and running costs), week 4 debt, prudence and limits (the debt passage of Section III, Section IV and the closing paragraph). The editor's introduction, the advertisements and the plate captions are not used.

Typographical arrangement: UK publishers hold a 25-year right in the typographical arrangement of an edition (Research 4, cited in docs/planning/AK_Demo_Catalogue_Plan.md section 7). Quotations must come from the Project Gutenberg transcription, never from a modern reprint layout.

Project Gutenberg: The Project Gutenberg name is a trade mark. Strip the Gutenberg header and licence before use and do not use the name in marketing. Acknowledge as "text from a public-domain edition" with the source in the notes [check the current licence wording].

## Source file

Fetched on 10 October 2026 from the GITenberg mirror (github.com/GITenberg/Franklin-s-Way-to-Wealthor-Poor-Richard-Improved-_43855). Converted to UTF-8 with LF line endings. SHA-1 of the converted file: 28ca5dec58c290fa0922b7cff7fe97fc2ebf579a. 866 lines, 40,349 bytes. The text is not committed whole. It is kept outside the repository, and `docs/content/sources/AK-3TQX1/darton-1810.txt` is reserved for it in the workbook's `internal.manuscript_file`.

## Source check (10 October 2026)

Run with `pnpm tsx scripts/classics-source-check.ts <source> --edition "..." --published 1758 --died 1790`.

- Edition named: yes.
- Published before 1931: true (1758).
- UK life plus 70: true. The term ran to 31 December 1860, counted from Franklin's death in 1790.
- Copyright result: clear.
- Gutenberg header and licence cut before the scan.
- Scan: 21,055 characters, 0 unusual (0.000 percent), 0 replacement characters, 0 digits inside words. Result: ok.

The script checks arithmetic, not facts. The death year and the publication year were supplied from the planning files and the writing brief and are not yet checked against a second source.

## Modernisation log

20 changes, all from the reversible rules in `packages/validate/src/classics.ts` (spelling and typography only):

| Rule | Changes |
|---|---|
| double hyphen to comma | 12 |
| hyphenated to-day | 4 |
| hyphenated to-morrow | 2 |
| ampersand c (&c. to etc.) | 1 |
| two-word any one (not before 'of') | 1 |

Reverting the log on the modernised text returns the cut source byte for byte (checked). SHA-1 of the modernised text: d4cab5cce90ccee3185b407e5f663a652c3f6f70. The full log is at `docs/public-domain/AK-3TQX1.modernisation-log.json` (SHA-1 f7f7354175055ee25e79182b83f415b483e2ccee).

Known issue. The double-hyphen rule writes a comma and a space. Where the printed dash followed a full stop, a question mark or a closing quotation mark, the comma lands after it (eight cases, for example 'today.", If you were a servant'). There are no doubled commas. No quotation in the workbook crosses any of them.

Outside the rules. Franklin's spelling (labour, plow, expences, gaol) stays as printed inside quotations. The workbook's own prose is en-GB. The rules do not touch the plural 'to-morrows' in the line 'One to-day is worth two to-morrows', so that line is not quoted; the workbook quotes the sentence before it. No [Editorial] changes were made. Quotations in `content/workbooks/classics/the-way-to-wealth.json` are exact and were checked by section against the modernised copy (35 of 35 found).

## Rule applied and conclusion by launch market

Tier: A. Research 4 Tier A: published before 1931 and every author and translator died before 1946 (docs/planning/AK_Demo_Catalogue_Plan.md section 7).

| Market | Rule | Conclusion | Basis |
|---|---|---|---|
| GB | Life plus 70 years (UK). | Clear | Benjamin Franklin died 1790. The term ran to the end of 1860. Holds once the death year is confirmed. |
| US | Published before 1931 (Research 4 Tier A test). | Clear | First published 1758. The edition used was printed in 1810. Both are before 1931. |
| CA | Canadian term is not recorded in the repo planning files [to confirm]. | To confirm | Needs the Canadian rule applied to a death year of 1790 and the edition named here [to confirm]. |
| AU | Australian term is not recorded in the repo planning files [to confirm]. | To confirm | Needs the Australian rule applied to a death year of 1790 and the edition named here [to confirm]. |
| NZ | New Zealand term is not recorded in the repo planning files [to confirm]. | To confirm | Needs the New Zealand rule applied to a death year of 1790 and the edition named here [to confirm]. |
| IE | Life plus 70 years (EU rule; Ireland is an EU member state). | Clear | Benjamin Franklin died 1790. The term ran to the end of 1860. Holds once the death year is confirmed. |

## Still to check

- [ ] Confirm Franklin's death year (1790) against a second source.
- [ ] Check whether the Darton 1810 wording differs from Franklin's 1758 text, and decide whether that matters for a quotation-based workbook.
- [ ] Apply the Canadian, Australian and New Zealand rules and record the result.
- [ ] Check the Project Gutenberg licence wording before the acknowledgement is written.
- [ ]x Proofread the workbook against the modernised text and name a second reviewer (pipeline steps 6 and 7).
- [x ] Sign the review line below.

## Sources

- docs/planning/AK_Demo_Catalogue_Plan.md section 7
- docs/planning/AK_Demo_Catalogue.json (workbook the-way-to-wealth, public_domain block)
- https://www.gutenberg.org/files/43855/43855-h/43855-h.htm
- https://github.com/GITenberg/Franklin-s-Way-to-Wealthor-Poor-Richard-Improved-_43855 (mirror the text was fetched from)
- scripts/classics-source-check.ts output, 10 October 2026

## Review

Signer: Crent Parsow, owner. The signature line below is left to sign.

Reviewed by: __cole pe____

Date: _16/10/26_____
