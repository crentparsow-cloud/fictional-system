// Writes the theme CSS from lib/design. Run after editing directions.ts or tokens.ts:
//   pnpm design:themes
// A unit test fails if the committed files drift from this output.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DIRECTION_IDS } from "../apps/web/lib/design/directions";
import { buildReadingThemesCss, buildThemeCss } from "../apps/web/lib/design/tokens";

const dir = resolve(import.meta.dirname, "../apps/web/app/themes");
mkdirSync(dir, { recursive: true });
for (const id of DIRECTION_IDS) writeFileSync(resolve(dir, `${id}.css`), buildThemeCss(id));
writeFileSync(resolve(dir, "reading.css"), buildReadingThemesCss());
console.log(`wrote ${DIRECTION_IDS.length + 1} theme files to ${dir}`);
