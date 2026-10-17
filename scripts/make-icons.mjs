// Renders the PWA icons (10.1) from the two SVG marks in apps/web/public/icons.
//
//   icon.svg           the mark on the brand colour, full bleed
//   icon-maskable.svg  the same mark inside the 80 percent safe zone, for
//                      Android's adaptive icons
//
// Writes icon-192.png, icon-512.png, icon-maskable-512.png and
// apple-touch-icon.png (180). The PNGs are committed, so this only needs
// running when the mark changes. When the visual identity (build list step 1)
// settles, replace the two SVGs and run it again. It needs sharp, which Next
// brings in: from the repo root,
//   node scripts/make-icons.mjs
// If sharp does not resolve, run `pnpm add -w -D sharp` temporarily.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "web", "public", "icons");
const mark = readFileSync(join(dir, "icon.svg"));
const maskable = readFileSync(join(dir, "icon-maskable.svg"));

const jobs = [
  ["icon-192.png", mark, 192],
  ["icon-512.png", mark, 512],
  ["icon-maskable-512.png", maskable, 512],
  ["apple-touch-icon.png", mark, 180],
];
for (const [name, svg, size] of jobs) {
  writeFileSync(join(dir, name), await sharp(svg).resize(size, size).png().toBuffer());
  console.log("wrote", name);
}
