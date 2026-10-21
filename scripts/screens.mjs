// Renders the marketing screenshots (plan 1.8) from the running app with
// Playwright, at phone and desktop width, into apps/web/public/screens as
// WebP under 150 KB each. Needs `next dev` (the reader screens at
// /dev/screens and /dev/player are open outside production).
//
//   pnpm --filter @akana/web dev -p 3101   (placeholder Supabase settings are fine)
//   BASE=http://localhost:3101 node scripts/screens.mjs
import { createRequire } from "node:module";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const web = path.resolve(import.meta.dirname, "..", "apps", "web");
const req = createRequire(path.join(web, "package.json"));
const { chromium } = req("@playwright/test");
const sharp = createRequire(req.resolve("next/package.json"))("sharp");

const BASE = process.env.BASE ?? "http://localhost:3101";
const OUT = path.join(web, "public", "screens");
const LIMIT = 150 * 1024;
mkdirSync(OUT, { recursive: true });

const PHONE = { width: 390, height: 750, scale: 2 };
const DESKTOP = { width: 1280, height: 800, scale: 1 };
const SHOTS = [
  ["today-phone", "/dev/screens/today", PHONE],
  ["explore-phone", "/dev/screens/explore", PHONE],
  ["workbook-phone", "/dev/screens/workbook", PHONE],
  ["unit-phone", "/dev/player", PHONE],
  ["start-phone", "/start", PHONE],
  ["trust-desktop", "/trust", DESKTOP],
  ["explore-desktop", "/dev/screens/explore", DESKTOP],
];

const browser = await chromium.launch({ executablePath: process.env.E2E_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
for (const [name, route, v] of SHOTS) {
  const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: v.scale, colorScheme: "light", reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(BASE + route, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  const png = await page.screenshot();
  let q = 80;
  let out = await sharp(png).webp({ quality: q, effort: 6 }).toBuffer();
  while (out.length > LIMIT && q > 30) out = await sharp(png).webp({ quality: (q -= 10), effort: 6 }).toBuffer();
  writeFileSync(path.join(OUT, `${name}.webp`), out);
  console.log(name, Math.round(out.length / 1024) + " KB", `q${q}`);
  await ctx.close();
}
await browser.close();
