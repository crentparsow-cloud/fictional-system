# Fonts

Akana uses two typefaces. Sans is the interface and the voice: buttons, prompts, navigation, headings. Serif is content: workbook text, book titles, quotes. Every face is self-hosted from `/fonts` under the SIL Open Font Licence 1.1, so the CSP `font-src` stays `'self'` and no third party is contacted.

This page records the licence check (plan 14.11) and the weight budget (plan 1.4). Rebuild commands are at the end.

## Faces by design direction

| Direction | Sans (interface) | Serif (content) | Latin files, upright and italic | Bytes |
|---|---|---|---|---|
| Paper and ink | Akana Sans (Source Sans 3, renamed) | Literata | 3 | 135,036 |
| Bright editorial | Bricolage Grotesque | Akana Serif (Source Serif 4, renamed) | 3 | 143,752 |
| Quiet confidence | Lexend | Literata | 3 | 145,904 |

Each total is under the 250 KB budget, which a unit test enforces (`lib/design/design.test.ts`). Only the active direction's upright faces are preloaded, so an unchosen direction costs nothing. The Latin-extended files (Bricolage, Lexend, Atkinson) load only when a page needs a character in them. The reader options, Atkinson Hyperlegible Next and the dyslexia-friendly face, load only when a reader chooses them.

Libre Franklin was on the 1.4 shortlist. None of the three mock-ups uses it, so it is not shipped. It is a drop-in sans if a fourth direction wants it: add it to `scripts/build-direction-fonts.py`.

## Licence check

All faces are OFL-1.1, confirmed from the `license` field of the pinned Fontsource 5.3.0 package at build time. The OFL text for each ships in `/fonts/LICENCES`.

| Face | Licence text in repo | Reserved Font Name | Action |
|---|---|---|---|
| Literata | `literata-OFL.txt` | None named | Shipped unchanged (Latin subset by Fontsource) |
| Source Serif 4 | `akana-serif-from-source-serif-4-OFL.txt` | "Source" (Adobe) | Renamed to **Akana Serif**. Name table rewritten, file renamed |
| Source Sans 3 | `akana-sans-from-source-sans-3-OFL.txt` | "Source" (Adobe) | Renamed to **Akana Sans**. Name table rewritten, file renamed |
| Bricolage Grotesque | `bricolage-grotesque-OFL.txt` | None named | Shipped unchanged |
| Lexend | `lexend-OFL.txt` | None named | Shipped unchanged |
| Atkinson Hyperlegible Next | `atkinson-hyperlegible-next-OFL.txt` | None named | Shipped unchanged |
| OpenDyslexic | `opendyslexic-OFL.txt` | "OpenDyslexic" | Renamed to **Akana Dyslexia Friendly** (earlier work) |

Why the renames. The OFL says a modified version may not use a Reserved Font Name. Fontsource files are Latin subsets, which counts as modification, and the Source families reserve "Source". The renamed files carry the new family, full and PostScript names (name IDs 1, 3, 4, 6 and 16). The original copyright line stays in name ID 0, as the licence requires. No other name ID mentions "Source" as a family.

The Satori faces in `lib/design/og-fonts` (static, one weight, Basic Latin and Latin-1) follow the same rule: Akana Serif and Akana Sans keep their new names, and Literata, Bricolage Grotesque and Lexend are unchanged apart from the weight pin and the subset, which those licences allow without a rename. They are used only to draw share images and covers.

## Reading size

Reading text is set in `rem`: `--fs-read` is 1.18rem, about 20px at the standard root size, at `--lh-read` 1.4. The root size `--fs` moves with the reader's text setting in the Aa panel (`data-text-size`, six steps from 17px to 28px), so reading text grows with it. The 65 character line is `--read-measure`.

The reader's font choice in the Aa panel sets `--f-read`: the direction's serif by default, or Atkinson Hyperlegible, Lexend or the dyslexia-friendly face. Those three also replace the sans, so the whole page follows, as it did before the directions existed.

## Rebuild

```
python3 scripts/build-direction-fonts.py    # Literata, Akana Serif, Akana Sans into apps/web/public/fonts
python3 scripts/build-og-fonts.py           # static WOFF faces for the share images
node scripts/fetch-fonts.mjs                # Bricolage, Lexend, Atkinson (earlier script)
```

Both Python scripts need `fonttools` and `brotli`. Packages are pinned to 5.3.0. After a rebuild, run `pnpm --filter @akana/web test` to recheck the budget, then update the byte totals above.
