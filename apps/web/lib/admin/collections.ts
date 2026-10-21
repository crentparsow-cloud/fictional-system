/**
 * Form parsing for /admin/collections (build list 2.3) and the shelf pages
 * (2.2). Pure, so the rules are tested. The database checks every field
 * again in public.save_collection and public.set_shelf_editorial (0043).
 */
import { COVER_PATTERNS } from "@/lib/covers";

export const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const AK_CODE = /^AK-[0-9A-HJKMNP-TV-Z]{5}$/;
export const NAME_MAX = 80;
export const LINE_MAX = 200;
export const SHELF_LINE_MAX = 280;
export const MAX_TITLES = 60;

export interface CollectionInput {
  id: string | null;
  slug: string;
  name: string;
  line: string;
  coverGenre: string;
  coverPattern: string | null;
  status: "draft" | "live";
  sort: number;
  codes: string[];
}

/** AK codes from a textarea: one per line, or separated by commas or spaces. Upper-cased, blanks dropped. */
export function parseCodes(raw: unknown): string[] {
  return String(raw ?? "")
    .split(/[\s,;]+/)
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
}

/** A checked collection from form fields, or null when anything is off. Duplicate codes are refused, not merged. */
export function parseCollectionForm(f: { get(name: string): unknown }, genreIds: readonly string[]): CollectionInput | null {
  const id = String(f.get("id") ?? "").trim();
  const slug = String(f.get("slug") ?? "").trim().toLowerCase();
  const name = String(f.get("name") ?? "").trim();
  const line = String(f.get("line") ?? "").trim();
  const coverGenre = String(f.get("cover_genre") ?? "");
  const pattern = String(f.get("cover_pattern") ?? "");
  const status = String(f.get("status") ?? "");
  const sortRaw = Number(String(f.get("sort") ?? "0"));
  const codes = parseCodes(f.get("codes"));
  if (!SLUG.test(slug) || slug.length > 60) return null;
  if (!name || name.length > NAME_MAX || line.length > LINE_MAX) return null;
  if (!genreIds.includes(coverGenre)) return null;
  if (pattern && !(COVER_PATTERNS as readonly string[]).includes(pattern)) return null;
  if (status !== "draft" && status !== "live") return null;
  if (codes.length > MAX_TITLES || codes.some((c) => !AK_CODE.test(c)) || new Set(codes).size !== codes.length) return null;
  if (id && !/^[0-9a-f-]{36}$/.test(id)) return null;
  return {
    id: id || null,
    slug,
    name,
    line,
    coverGenre,
    coverPattern: pattern || null,
    status,
    sort: Number.isInteger(sortRaw) && sortRaw >= 0 && sortRaw <= 9999 ? sortRaw : 0,
    codes,
  };
}

export interface ShelfEditorialInput {
  shelfId: string;
  line: string | null;
  featuredCode: string | null;
}

export function parseShelfForm(f: { get(name: string): unknown }): ShelfEditorialInput | null {
  const shelfId = String(f.get("shelf") ?? "").trim();
  const line = String(f.get("line") ?? "").trim();
  const code = String(f.get("featured") ?? "").trim().toUpperCase();
  if (!SLUG.test(shelfId)) return null;
  if (line.length > SHELF_LINE_MAX) return null;
  if (code && !AK_CODE.test(code)) return null;
  return { shelfId, line: line || null, featuredCode: code || null };
}
