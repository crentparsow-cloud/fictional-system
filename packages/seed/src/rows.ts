import type { Depth, SafetyTier, Badge, Genre } from "@akana/schema";
import { z } from "zod";

export type DepthValue = z.infer<typeof Depth>;
export type SafetyTierValue = z.infer<typeof SafetyTier>;
export type BadgeValue = z.infer<typeof Badge>;
export type GenreValue = Genre;

/** Fixed ids from migration 0001. */
export const AKANA_HOUSE_ORG_ID = "00000000-0000-0000-0000-000000000001";
export const MARKETPLACE_TENANT_ID = "00000000-0000-0000-0000-00000000000a";
export const MAYA_VAUGHN_AUTHOR_CODE = "AU-2DA6H";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export interface GenreRow {
  id: string;
  name: string;
  default_safety_tier: SafetyTierValue;
  guardrails: Json;
}

export interface ShelfRow {
  id: string;
  name: string;
  status: string;
  sort: number;
  /** Added after launch: hidden from readers until min_books live titles (0015, F-148). */
  hidden_until_min_books: boolean;
}

export interface AreaRow {
  id: string;
  shelf_id: string;
  name: string;
}

export interface ThemeRow {
  id: string;
  name: string;
  line: string | null;
  shelf_id: string;
  area_id: string;
  topics: string[];
  clearance_status: string;
  min_books: number;
  /** Suits a team, church or small group (0015, F-148). */
  group_suitable: boolean;
  /** Added after launch: hidden from readers until min_books live titles (0015, F-148). */
  hidden_until_min_books: boolean;
}

export interface OrganisationRow {
  id: string;
  code: string | null;
  kind: "akana_house" | "publisher" | "author_company" | "individual";
  legal_name: string;
  display_name: string;
  slug: string;
  country: string | null;
  is_demo: boolean;
}

export interface AuthorRow {
  id: string;
  code: string;
  org_id: string;
  slug: string;
  display_name: string;
  legal_name: string | null;
  bio: string | null;
  country: string | null;
  photo_path: string | null;
  website: string | null;
  spelling: string;
  is_demo: boolean;
  is_public_domain: boolean;
  status: string;
}

export interface BookRow {
  id: string;
  org_id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  edition: string | null;
  language: string;
  isbns: Json;
  asin: string | null;
  store_links: Json;
  cover_path: string | null;
  rights_status: "licensed" | "public_domain" | "own_work";
  publisher: string | null;
  year: number | null;
  is_demo: boolean;
}

export interface BookContributorRow {
  book_id: string;
  author_id: string;
  role: "author" | "translator" | "editor";
  death_year: number | null;
  sort: number;
}

export interface WorkbookRow {
  id: string;
  code: string;
  book_id: string;
  org_id: string;
  tenant_id: string;
  slug: string;
  title: string;
  short_title: string | null;
  card_line: string;
  genre_id: GenreValue;
  theme_id: string | null;
  safety_tier: SafetyTierValue;
  depth: DepthValue;
  badge: BadgeValue;
  is_demo: boolean;
  status: string;
  current_version_id: string | null;
  licence_ref: string | null;
}

export interface WorkbookVersionRow {
  id: string;
  workbook_id: string;
  semver: string;
  schema_version: string;
  content: Json;
  content_hash: string;
  validated_at: string | null;
  published_at: string | null;
}

export interface TenantListingRow {
  tenant_id: string;
  workbook_id: string;
  visible: boolean;
  sort: number;
  featured: boolean;
}

export interface Seed {
  genres: GenreRow[];
  shelves: ShelfRow[];
  areas: AreaRow[];
  themes: ThemeRow[];
  organisations: OrganisationRow[];
  authors: AuthorRow[];
  books: BookRow[];
  book_contributors: BookContributorRow[];
  workbooks: WorkbookRow[];
  workbook_versions: WorkbookVersionRow[];
  tenant_listings: TenantListingRow[];
}

/** Insert order that respects foreign keys. workbooks.current_version_id is set in a second pass. */
export const TABLE_ORDER = [
  "genres",
  "shelves",
  "areas",
  "themes",
  "organisations",
  "authors",
  "books",
  "book_contributors",
  "workbooks",
  "workbook_versions",
  "tenant_listings",
] as const satisfies readonly (keyof Seed)[];

/** Conflict targets per table. Tables without an id column key on their natural key. */
export const CONFLICT_KEYS: Record<keyof Seed, string[]> = {
  genres: ["id"],
  shelves: ["id"],
  areas: ["id"],
  themes: ["id"],
  organisations: ["id"],
  authors: ["id"],
  books: ["id"],
  book_contributors: ["book_id", "author_id", "role"],
  workbooks: ["id"],
  workbook_versions: ["id"],
  tenant_listings: ["tenant_id", "workbook_id"],
};
