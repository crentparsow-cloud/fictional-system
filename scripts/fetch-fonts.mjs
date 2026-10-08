// One-off copy script for the self-hosted reader fonts (appearance setting).
// Not part of the build and not a dependency of the app: run it by hand only
// when a font version changes, then commit what it writes.
//
//   node scripts/fetch-fonts.mjs
//
// It packs the pinned Fontsource variable packages (all SIL Open Font
// Licence 1.1) into a temp folder with `npm pack`, checks each licence field,
// and copies only the latin and latin-ext weight-axis woff2 files and the
// OFL text into apps/web/public/fonts/. The @font-face rules that use them
// are at the end of apps/web/app/globals.css.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const VERSION = "5.3.0";
const FONTS = [
  { pkg: "@fontsource-variable/atkinson-hyperlegible-next", slug: "atkinson-hyperlegible-next" },
  { pkg: "@fontsource-variable/bricolage-grotesque", slug: "bricolage-grotesque" },
  { pkg: "@fontsource-variable/lexend", slug: "lexend" },
];
const SUBSETS = ["latin", "latin-ext"];

const out = new URL("../apps/web/public/fonts/", import.meta.url).pathname;
const licences = join(out, "LICENCES");
mkdirSync(licences, { recursive: true });

const work = mkdtempSync(join(tmpdir(), "akana-fonts-"));
let total = 0;
try {
  for (const { pkg, slug } of FONTS) {
    const tgz = execFileSync("npm", ["pack", `${pkg}@${VERSION}`, "--silent"], { cwd: work, encoding: "utf8" }).trim();
    const dir = join(work, slug);
    mkdirSync(dir);
    execFileSync("tar", ["xzf", join(work, tgz), "-C", dir]);
    const root = join(dir, "package");
    const meta = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    if (meta.license !== "OFL-1.1") throw new Error(`${pkg}: licence is ${meta.license}, expected OFL-1.1`);
    for (const subset of SUBSETS) {
      const name = `${slug}-${subset}-wght-normal.woff2`;
      copyFileSync(join(root, "files", name), join(out, name));
      const bytes = statSync(join(out, name)).size;
      total += bytes;
      console.log(`${name}  ${bytes} bytes`);
    }
    copyFileSync(join(root, "LICENSE"), join(licences, `${slug}-OFL.txt`));
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
console.log(`total woff2: ${total} bytes`);
