import { readFileSync } from "node:fs";
import path from "node:path";
import { TitleCopy } from "@akana/schema";

/**
 * Title copy (7.2, 7.3, 12.1): the end state, who it is for and the author
 * letters for each title, kept in content/catalog/title-copy.json. The reader
 * pages lay an entry over the rebuilt workbook with withTitleCopy().
 */
const FILE = path.join(process.cwd(), "..", "..", "content", "catalog", "title-copy.json");

let cache: Map<string, TitleCopy> | null = null;

/** Entries by AK code. An unreadable or malformed file gives an empty map, so a reader never loses the workbook over a letter. */
export function loadTitleCopy(file: string = FILE): Map<string, TitleCopy> {
  if (file === FILE && cache) return cache;
  const map = new Map<string, TitleCopy>();
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as { titles?: unknown[] };
    for (const entry of raw.titles ?? []) {
      const parsed = TitleCopy.safeParse(entry);
      if (parsed.success) map.set(parsed.data.code, parsed.data);
    }
  } catch {
    // No sidecar, no letters.
  }
  if (file === FILE) cache = map;
  return map;
}

export function titleCopyFor(code: string | null | undefined): TitleCopy | undefined {
  return code ? loadTitleCopy().get(code) : undefined;
}

/** First word of a display name, or undefined. The letters read fine without it. */
export function firstNameOf(display: string | null | undefined): string | undefined {
  const n = (display ?? "").trim().split(/\s+/)[0];
  return n ? n.slice(0, 60) : undefined;
}
