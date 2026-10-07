/**
 * The public-domain file (F-118): one evidence record per classic, kept as
 * JSON in content/public-domain/<code>.json with a Markdown twin in
 * docs/public-domain/. The JSON is imported here, so it is read at build
 * time and bundled. Nothing is fetched at runtime.
 *
 * Pure: no Next or Supabase imports, so tests and the static route share it.
 * A record states only what the repo planning files establish. Anything they
 * do not establish carries "[to confirm]" in its text.
 */
import qcrre from "../../../content/public-domain/AK-QCRRE.json";
import fn9kb from "../../../content/public-domain/AK-FN9KB.json";
import x3tqx1 from "../../../content/public-domain/AK-3TQX1.json";
import b9xeg from "../../../content/public-domain/AK-B9XEG.json";
import x7swkn from "../../../content/public-domain/AK-7SWKN.json";

/** The six launch markets every record must conclude on. */
export const LAUNCH_MARKETS = ["GB", "US", "CA", "AU", "NZ", "IE"] as const;
export type LaunchMarket = (typeof LAUNCH_MARKETS)[number];

export const MARKET_NAMES: Record<LaunchMarket, string> = {
  GB: "United Kingdom",
  US: "United States",
  CA: "Canada",
  AU: "Australia",
  NZ: "New Zealand",
  IE: "Ireland",
};

export interface PublicDomainPerson {
  name: string;
  role: "author" | "translator" | string;
  died: number | null;
  diedSource: string;
}

export interface MarketConclusion {
  market: LaunchMarket | string;
  rule: string;
  conclusion: "clear" | "to_confirm" | string;
  basis: string;
}

export interface PublicDomainRecord {
  code: string;
  workbookId: string;
  slug: string;
  title: string;
  author: string;
  people: PublicDomainPerson[];
  firstPublished: string;
  edition: { name: string; url: string; status: string };
  tier: string;
  tierNote: string;
  markets: MarketConclusion[];
  typographicalArrangement: string;
  projectGutenberg: string;
  checks: string[];
  sources: string[];
  status: "unreviewed" | "reviewed" | string;
  reviewedBy: string | null;
  reviewedOn: string | null;
}

const RECORDS: readonly PublicDomainRecord[] = [qcrre, fn9kb, x3tqx1, b9xeg, x7swkn] as PublicDomainRecord[];

const BY_CODE = new Map(RECORDS.map((r) => [r.code, r]));

/** Every record, in file order. */
export function listPublicDomainRecords(): readonly PublicDomainRecord[] {
  return RECORDS;
}

/** One record by AK code, or null. Case-insensitive on the code. */
export function getPublicDomainRecord(code: string): PublicDomainRecord | null {
  return BY_CODE.get(code.trim().toUpperCase()) ?? null;
}

export function hasPublicDomainRecord(code: string): boolean {
  return getPublicDomainRecord(code) !== null;
}

/** The record's conclusion for one market, or null when the record skips it. */
export function conclusionFor(record: PublicDomainRecord, market: LaunchMarket): MarketConclusion | null {
  return record.markets.find((m) => m.market === market) ?? null;
}

export function conclusionLabel(c: MarketConclusion["conclusion"]): string {
  return c === "clear" ? "Clear" : "To confirm";
}
