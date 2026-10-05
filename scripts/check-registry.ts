/**
 * Run the claims and style rules over every public string in the registry
 * (content/registry) and the demo catalogue (docs/planning/AK_Demo_Catalogue.json).
 *
 *   pnpm tsx scripts/check-registry.ts
 *
 * Claims findings fail the run (exit 1). Style findings are printed as
 * warnings: names and card lines are checked with the strictest profile
 * (wellbeing, standard tier), and a title can legitimately carry a US
 * spelling or a quoted phrase that the reader-copy rules would flag.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GENRES, type Genre, type SafetyTier } from "@akana/schema";
import { validateCopy, type Finding } from "@akana/validate";
import type { z } from "zod";

type Tier = z.infer<typeof SafetyTier>;
type Spelling = "en-GB" | "en-US";

const ROOT = join(import.meta.dirname, "..");
const read = (p: string) => JSON.parse(readFileSync(join(ROOT, p), "utf8")) as Record<string, unknown>;

interface Item {
  where: string;
  text: string;
  genre: Genre;
  tier: Tier;
  spelling: Spelling;
}

const items: Item[] = [];
const strict = { genre: "wellbeing" as Genre, tier: "standard" as Tier, spelling: "en-GB" as Spelling };
const add = (where: string, text: unknown, profile = strict) => {
  if (typeof text === "string" && text.length) items.push({ where, text, ...profile });
};

// Registry
const genres = read("content/registry/genres.json").genres as { id: string; name: string }[];
for (const g of genres) add(`genres.${g.id}.name`, g.name);
const shelves = read("content/registry/shelves.json").shelves as { id: string; name: string }[];
for (const s of shelves) add(`shelves.${s.id}.name`, s.name);
const areas = read("content/registry/areas.json").areas as { id: string; name: string }[];
for (const a of areas) add(`areas.${a.id}.name`, a.name);
const themes = read("content/registry/themes.json").themes as { id: string; name: string; line: string | null; topics: string[] }[];
for (const t of themes) {
  add(`themes.${t.id}.name`, t.name);
  add(`themes.${t.id}.line`, t.line);
  for (const [i, topic] of t.topics.entries()) add(`themes.${t.id}.topics[${i}]`, topic);
}

// Demo catalogue
const catalogue = read("docs/planning/AK_Demo_Catalogue.json");
for (const p of catalogue.publishers as { id: string; name: string; note: string }[]) {
  add(`publishers.${p.id}.name`, p.name);
  add(`publishers.${p.id}.note`, p.note);
}
for (const a of catalogue.authors as { id: string; name: string; bio: string; genre?: string; spelling: string }[]) {
  const genre = toGenre(a.genre);
  const profile = { genre, tier: genre === "wellbeing" ? ("standard" as Tier) : ("none" as Tier), spelling: toSpelling(a.spelling) };
  add(`authors.${a.id}.name`, a.name, profile);
  add(`authors.${a.id}.bio`, a.bio, profile);
}
for (const w of catalogue.workbooks as {
  code: string;
  title: string;
  subtitle: string;
  card_line: string;
  theme: string;
  genre: string;
  safety_profile: string;
  spelling: string;
  outline: string[];
}[]) {
  const genre = toGenre(w.genre);
  const tier: Tier = w.safety_profile === "wellbeing_higher" ? "higher" : w.safety_profile === "wellbeing_standard" ? "standard" : "none";
  const profile = { genre, tier, spelling: toSpelling(w.spelling) };
  add(`workbooks.${w.code}.title`, w.title, profile);
  add(`workbooks.${w.code}.subtitle`, w.subtitle, profile);
  add(`workbooks.${w.code}.card_line`, w.card_line, profile);
  add(`workbooks.${w.code}.theme`, w.theme, profile);
  for (const [i, line] of w.outline.entries()) add(`workbooks.${w.code}.outline[${i}]`, line, profile);
}

function toGenre(g: string | undefined): Genre {
  const id = (g ?? "wellbeing").replace(/-/g, "_");
  return (GENRES as readonly string[]).includes(id) ? (id as Genre) : "wellbeing";
}
function toSpelling(s: string): Spelling {
  // en-AU and en-CA follow British spelling for the pairs the validator checks.
  return s === "en-US" ? "en-US" : "en-GB";
}

let claims = 0;
let style = 0;
for (const item of items) {
  const findings: Finding[] = validateCopy(item.text, item.genre, item.tier, item.spelling);
  for (const f of findings) {
    const isClaim = f.category === "claims";
    if (isClaim) claims++;
    else style++;
    const tag = isClaim ? "CLAIM" : "warn ";
    console.log(`${tag} ${item.where}: ${f.message} : ${JSON.stringify(item.text.length > 70 ? item.text.slice(0, 70) + "..." : item.text)}`);
  }
}

console.log(`\n${items.length} strings checked, ${claims} claims finding(s), ${style} style warning(s)`);
process.exit(claims ? 1 : 0);
