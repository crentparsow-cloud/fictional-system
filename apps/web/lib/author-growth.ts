/**
 * Author growth words and rules (14.12, 14.13, 6.4), pure so they can be
 * tested. The money is in the database (migration 0052): 25 percent of the
 * membership revenue base for 12 months, from public.app_config 'author_share'.
 */

const CODE = /^[0-9a-f]{10}$/;
export const isAuthorLinkCode = (v: unknown): v is string => typeof v === "string" && CODE.test(v);

export type AuthorLinkUse = "attached" | "already" | "unknown_code" | "own_link" | "not_new";

export const AUTHOR_LINK_MESSAGES: Readonly<Record<AuthorLinkUse, string>> = {
  attached: "Saved. If you join the membership, this author earns a share of it.",
  already: "You have already used an author's link, so that one stays.",
  unknown_code: "That link is not valid.",
  own_link: "This is your own organisation's link, so it cannot be used on your own account.",
  not_new: "Author links are for people who are new to Akana.",
};

export function isAuthorLinkUse(v: unknown): v is AuthorLinkUse {
  return typeof v === "string" && v in AUTHOR_LINK_MESSAGES;
}

export const AUTHOR_LINK_STATEMENTS: readonly string[] = [
  "If you join the membership after using this link, the author earns a share of what you pay for your first 12 months.",
  "It costs you nothing extra. The price is the same as everyone else pays.",
  "The author never sees who you are or what you write. Your answers stay sealed and private.",
  "The link only works if you are new to Akana.",
];

/** The share as a sentence for the Studio, from the config value. */
export function shareSentence(rate: number, months: number): string {
  const pct = Math.round(rate * 100);
  return `You earn ${pct} percent of the membership revenue from each member you refer, for ${months} months from their first payment.`;
}

export interface ShareConfig {
  rate: number;
  months: number;
}

export function shareConfigFrom(value: unknown): ShareConfig {
  const v = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const rate = typeof v.rate === "number" && v.rate > 0 && v.rate <= 1 ? v.rate : Number(v.rate);
  const months = typeof v.months === "number" ? v.months : Number(v.months);
  return {
    rate: Number.isFinite(rate) && rate > 0 && rate <= 1 ? rate : 0.25,
    months: Number.isInteger(months) && months >= 1 && months <= 60 ? months : 12,
  };
}

export const MAX_RECOMMENDATIONS = 3;

export interface RecommendationRow {
  direction: "recommends" | "recommended_by";
  orgId: string;
  name: string;
  slug: string;
}

/**
 * The next list of recommended organisations after adding one: no duplicates,
 * at most three, nothing added past the limit. Returns the same list when the
 * add is not allowed, plus why.
 */
export function addRecommendation(current: readonly string[], orgId: string): { list: string[]; ok: boolean; reason?: "full" | "already" } {
  if (current.includes(orgId)) return { list: [...current], ok: false, reason: "already" };
  if (current.length >= MAX_RECOMMENDATIONS) return { list: [...current], ok: false, reason: "full" };
  return { list: [...current, orgId], ok: true };
}

export function removeRecommendation(current: readonly string[], orgId: string): string[] {
  return current.filter((id) => id !== orgId);
}

/** Authors who recommend you that you have not recommended back, in order. */
export function recommendBackCandidates(rows: readonly RecommendationRow[]): RecommendationRow[] {
  const mine = new Set(rows.filter((r) => r.direction === "recommends").map((r) => r.orgId));
  return rows.filter((r) => r.direction === "recommended_by" && !mine.has(r.orgId));
}
