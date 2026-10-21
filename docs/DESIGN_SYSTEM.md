# Design system

How the design tokens, directions, reading themes, motion, covers and the component kit fit together (plan 1.1 to 1.9). Crent chose bright editorial, which is the default. The other two stay available as one setting.

## Choosing a direction

Set `NEXT_PUBLIC_DESIGN_DIRECTION` at build time to one of:

- `paper-and-ink`
- `bright-editorial` (the default when blank or unknown)
- `quiet-confidence`

`next.config.ts` points `@theme-active` at `app/themes/<direction>.css`, so only that file's CSS reaches the browser. The same value picks the preloaded fonts, the manifest and browser colours, the share image and the covers. Nothing else changes.

## Where colours live

`lib/design/directions.ts` holds each direction's palette (light and dark), shelf colours, type faces, radii and cover style, taken from the mock-ups' token strips. `lib/design/tokens.ts` holds the colours that mean the same everywhere (help, demo, stage tints) and the named reading themes, and builds the CSS. `pnpm design:themes` writes `app/themes/*.css`. A test fails if the committed files differ from the generator, and another fails if a hex value or colour function appears anywhere else in `app`, `components`, `lib` or the engine CSS. The exceptions, listed in the test, are `lib/tenant-brand.ts` (colours the database also checks) and `lib/export.ts` (the print stylesheet).

To change a colour, edit `directions.ts`, run `pnpm design:themes`, commit both.

## Tokens

`app/globals.css` keeps structure only (type scale, spacing, measure). Everything else is a custom property on `:root`.

| Group | Tokens |
|---|---|
| Page | `--canvas`, `--surface`, `--surface-2`, `--line`, `--line-strong`, `--ink`, `--ink-soft` |
| Brand | `--brand`, `--brand-ink`, `--brand-text`, `--brand-wash`, `--highlight` |
| Meaning | `--marigold`, `--rose`, `--help-bg`, `--stage-1..4-t` and `-i` |
| Shelves | `--shelf-<id>-t` (tile), `--shelf-<id>-i` (icon and rule) |
| Type | `--f-sans`, `--f-serif`, `--f-read`, `--fs`, `--fs-read`, `--lh-read` |
| Shape | `--radius`, `--radius-sm`, `--pill`, `--cover-radius` |
| Motion | `--dur-quick`, `-base`, `-slow`, `-page`, `-toast`, `-confetti`, `-reveal`, `--ease`, `--spring` |

The brand colour is reserved for key actions and the logo. Links and small labels use `--brand-text`. In quiet confidence the brand is amber and does not reach 3 to 1 against its light canvas, so there it is only ever a fill behind `--brand-ink`.

## Schemes and reading themes

`data-theme="light"` or `"dark"` on `<html>` forces a scheme. With neither, the device decides. Dim after 9 p.m. (`data-dim="night"`) now also switches to the dark tokens unless the reader chose Light, and keeps its softer filter.

Named reading themes are Paper, Mist (deep blue at night) and Plain, each with a light and a dark version, chosen as Page tone in the Aa panel (`data-reading-theme`). They replace the page neutrals only. The tone is kept on the device because the account record for reading settings (migration 0044) has no field for it. Saving it to the account needs a migration.

`[data-scheme="light" | "dark"]` on any element scopes a scheme to that subtree. The kit uses it to show both side by side.

## Shelves

`lib/shelves.ts` is the one source for each shelf's icon and the key of its line. Its colours are the `--shelf-*` tokens, supplied per direction. The contrast test checks every accent against its tile (4.5 to 1) and against the canvas (3 to 1).

## Motion

`app/motion.css`. Page changes fade through the View Transitions API where the browser supports it. Cards lift on hover and focus. The save toast is two words ("Answer saved", "Not saved") in one fixed spot above the tabs. One burst of confetti ends a unit, a larger reveal ends a programme. `prefers-reduced-motion` and the reader's Reduce motion setting both remove all movement. `lib/motion.ts` mirrors the durations for scripts, and a test keeps them in step.

`SaveToast` follows the reader's autosave state through `AutosaveToast` (in `ReadClient` and `TryClient`). It says "Answer saved" when a save is confirmed after something was owed, and "Not saved" when a save gives up. `toastForTransition` in `lib/motion.ts` holds the rule.

## Covers and share images

`lib/design/cover-spec.ts` (rules) and `cover-render.tsx` (Satori elements). A cover is 3:4. One, two or three bars mean a 4, 8 or 12 week programme (by length: up to 5, 6 to 9, 10 or more units). Four small squares mean a collection. A round play mark means Start here. The label sits beside the mark, the shelf colour fills the cover, and one line of preview is the last line. Each direction sets a corner radius, a hairline frame or none, and one motif (none, circle or wave).

`/og/<slug>` renders the 1200 by 630 share image. `/covers/AK-XXXXX.png?w=240` renders the portrait cover at one of four cached widths (120, 240, 360, 480). `/covers/AK-XXXXX` and `.svg` still serve the older SVG. Both PNG routes read the subset faces in `lib/design/og-fonts` (about 36 KB to 43 KB a direction, 100 KB for all five files, against the 500 KB limit).

## Component kit

`/dev/kit` shows every shared component in every state, light and dark, in the active direction. The switcher injects another direction's token file to preview it. In production it needs a staff session with a second factor, like `/admin`. Elsewhere it is open.

## Reader screens without a database

`/dev/screens/today`, `/dev/screens/explore` and `/dev/screens/workbook` build the reader screens from the real components and fixture data, and `/dev/player` shows a real unit. They are open outside production and gated like `/dev/kit`. The a11y spec runs them with `E2E_DEV=1 E2E_BASE_URL=http://localhost:3101` against `next dev`.

## Marketing screenshots

`node scripts/screens.mjs` (with `next dev` running) renders the screenshots in `apps/web/public/screens` at phone (390 by 750, 2x) and desktop (1280 by 800) width as WebP under 150 KB each. `components/MarketingShot.tsx` lists them and carries the alt text.
