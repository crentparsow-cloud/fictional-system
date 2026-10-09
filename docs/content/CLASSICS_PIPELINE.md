# Classics pipeline

Build list item 14.41. How a public-domain text becomes an Akana workbook. Modelled on the Standard Ebooks production steps (research annex, Strand 6): choose the most accurate source, check the copyright, make every change to the text reversible and reviewable, lint, proofread the whole thing, and let nothing out without a named reviewer. The five live classics (7.1) go through this first: The Way to Wealth (AK-3TQX1), Self-Help (AK-7SWKN), Home Education (AK-B9XEG), Meditations (AK-FN9KB) and How to Live on 24 Hours a Day (AK-QCRRE).

The tool for steps 1 to 4 is `scripts/classics-source-check.ts`. The pure functions behind it are in `packages/validate/src/classics.ts` with tests beside them.

## The steps

### 1. Choose the most accurate source, not the most downloaded

Project Gutenberg often holds several transcriptions of one work. Pick by accuracy, in this order: a transcription of a scholarly or first-edition printing with its page scans available; a later transcription that names its printed source; the most downloaded file last, and only when nothing names its source. Record the exact edition, printer, year and URL in the house record (`docs/public-domain/<code>.md`, "Edition used") and its JSON twin (`content/public-domain/<code>.json`, `edition`). The script reports "Edition: NOT NAMED" when the record has no edition and stops there.

Quotations in the workbook come from this transcription and no other. UK publishers hold a 25-year right in the typographical arrangement of an edition, so a modern reprint's layout is never copied.

### 2. Copyright and date check

Two tests, both in `checkCopyright`:

- Published before 1931. The Tier A publication test from Research 4, applied to the work's first publication and to the edition used.
- UK life plus 70. Every contributor (author, translator, editor, illustrator, introducer) died more than 70 full calendar years ago. The term runs to 31 December of the seventieth year, so a death in 1956 clears on 1 January 2027. A contributor with no death year is never clear, however old the book.

The script reads the people and dates from the house record JSON (`--code AK-FN9KB`) or from the command line (`--published 1862 --died 180,1879`). Anything the record marks "[to confirm]" is still to confirm: the script checks arithmetic, not facts. The "Still to check" list in each house record is cleared by a person with a second source, and the result is written into the record.

### 3. Scan quality check

`checkScanQuality` counts characters a clean transcription would not contain: control characters, the replacement character U+FFFD, and anything outside printable ASCII, Latin-1 and the ordinary typographic marks. It also counts digits inside words ("wh0", "s1x"), a common OCR slip. Over 0.5 percent unusual, or any replacement character, marks the file SUSPECT. A suspect file goes back to step 1 for a better source or is read against the page scans before any other step.

The Gutenberg header and licence are cut before the count (`stripGutenbergBoilerplate`). The Project Gutenberg name is a trade mark: it does not appear in the workbook or in marketing. The acknowledgement reads "text from a public-domain edition" with the edition named.

### 4. Reversible modernisation

The source stays as it was printed, in `docs/content/sources/<code>/` (the path is recorded in the workbook's `internal.manuscript_file`). Modernisation is a separate, logged pass that can be undone:

- `modernise` applies only the rules in `MODERNISATION_RULES`: hyphenated to-day, to-morrow and to-night; two-word any one and every one; connexion; shew; "&c."; curly quotes to straight; em dashes and double hyphens to commas. Spelling and typography only. No rule changes a word's meaning.
- Every change is logged with its line, column, original and replacement. `--write out.txt` saves the modernised text and `out.log.json` beside it. `--revert out.log.json` applies the log backwards and prints the original, and refuses if the text has been edited since the log was written.
- Anything beyond the rule list is an editorial change. It is made by hand, in its own commit, with the subject line starting `[Editorial]` and the message saying what changed and why (for example, "[Editorial] Meditations: cut Long's footnotes on Greek variants"). `git log --grep='^\[Editorial\]'` lists every such change. One kind of change per commit, so each can be reverted alone.

Modernisation and editorial commits never touch the source file. They write to the modernised copy.

### 5. Lint

The workbook JSON passes `pnpm validate` with no errors: schema, style, claims, limits, references, safety and counts. `pnpm validate --style` is run and read; its plain English warnings are fixed or accepted with a reason in the pull request. Quotations from the source may run over 25 words and keep their original punctuation inside the quotation marks; the lint reports them and the proofreader decides. `pnpm check:ids` reports no removed or reused ids against the last committed version.

### 6. Cover-to-cover proofread

One person reads the whole workbook in the reader, start to finish, on a phone, with the modernised source open beside it. They check every quotation against the source, every chapter reference in `exercises[].source.chapter`, and every unit against `docs/content/UNIT_SPEC.md`. Findings go in the pull request as a list, each fixed in its own commit. A proofread is not a skim of the JSON.

### 7. Named reviewer gate

Nothing moves from `draft` to `approved` without a second named person, not the writer, recording in the pull request that they read the proofread findings and the fixes and that steps 1 to 6 are done. The admin review screen (`apps/web/app/admin/(gated)/review/[id]/page.tsx`) asks for the licence reference; for a classic it is the house record, `public-domain:/public-domain/<code>`.

### 8. House record signer (C10)

Already in the repo and still open. Each classic has a house record at `docs/public-domain/<code>.md` with a JSON twin in `content/public-domain/`. The record ends with a review line, "Reviewed by" and "Date", that is blank on all fifty records. Post-build item C10 asks Crent to name who signs. The demo catalogue sets every classic's release to `after_house_record_signed`, and the catalogue note says a classic stays draft until then. Step 8 is the signer filling in that line after steps 2 and 7, including the Canadian, Australian and New Zealand rules marked "[to confirm]". A classic is not live, and not sold, until the record is signed.

## Order and ownership

| Step | Who | Evidence |
|---|---|---|
| 1. Source | Writer | Edition in the house record |
| 2. Copyright | Writer, then signer | Script output in the pull request; record updated |
| 3. Scan | Writer | Script output in the pull request |
| 4. Modernisation | Writer | `.log.json` committed beside the modernised text; `[Editorial]` commits |
| 5. Lint | Writer | `pnpm validate` and `pnpm check:ids` clean in CI |
| 6. Proofread | A reader who is not the writer | Findings list and fix commits in the pull request |
| 7. Reviewer gate | Named reviewer | Approval comment on the pull request; status to `approved` |
| 8. House record | Signer named under C10 | Review line filled in; status to `live` |

## Running the script

```
pnpm tsx scripts/classics-source-check.ts source.txt --code AK-FN9KB
pnpm tsx scripts/classics-source-check.ts source.txt --code AK-FN9KB --write docs/content/sources/AK-FN9KB/long-1862.modern.txt
pnpm tsx scripts/classics-source-check.ts docs/content/sources/AK-FN9KB/long-1862.modern.txt --revert docs/content/sources/AK-FN9KB/long-1862.modern.log.json
```

The script exits 1 when the copyright check is not clear or the scan is suspect, so it can sit in CI in front of the content publish step (10.10) once sources are in the repo.
