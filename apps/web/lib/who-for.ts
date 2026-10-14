/**
 * Three plain lines for "Who this is for" (3.1), from the catalogue fields in
 * this order, each with a fallback so the block is never empty and nothing
 * is invented. The tagline comes first, then the first two lines of how it
 * works, then what the catalogue says about the kind of workbook and the time.
 */
export function whoIsItFor(f: { tagline?: string | null; cardLine: string; howItWorks?: string[] | null; genre: string; theme?: string | null; minutes?: number | null }): string[] {
  const how = (f.howItWorks ?? []).filter(Boolean);
  const kind = f.theme ? `A ${f.genre.toLowerCase()} workbook on ${f.theme.toLowerCase()}.` : `A ${f.genre.toLowerCase()} workbook.`;
  const pace = f.minutes ? `Set aside about ${f.minutes} minutes a day, and go at your own pace.` : "Go at your own pace.";
  return [f.tagline || f.cardLine, how[0] ?? kind, how[1] ?? pace];
}
