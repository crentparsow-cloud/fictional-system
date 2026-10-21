/**
 * Book affiliate links (6.9). The "Get the book" link goes to the store link
 * the author gave. When Akana has joined the retailer's own programme, the
 * retailer's tag is added to that link and a plain disclosure line sits next
 * to the button. Akana keeps the commission.
 *
 * Configuration is the environment variable BOOK_AFFILIATE_TAGS, JSON mapping
 * a retailer's host to its tag:
 *
 *   {"amazon.co.uk": "akana-21", "bookshop.org": {"param": "aid", "value": "1234"}}
 *
 * A string value is added as the query parameter "tag". An object names its
 * own parameter. A host matches itself and its subdomains (www.amazon.co.uk
 * matches "amazon.co.uk"). Blank or unreadable means no tag is added and no
 * disclosure line is shown: the link stays exactly as the author gave it.
 */

export type AffiliateTag = { param: string; value: string };
export type AffiliateTags = ReadonlyMap<string, AffiliateTag>;

const HOST = /^[a-z0-9.-]+$/;
const PARAM = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;
const VALUE = /^[A-Za-z0-9._-]{1,64}$/;

export function parseAffiliateTags(raw: string | undefined | null): AffiliateTags {
  const out = new Map<string, AffiliateTag>();
  const text = (raw ?? "").trim();
  if (!text) return out;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return out;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return out;
  for (const [hostRaw, v] of Object.entries(parsed as Record<string, unknown>)) {
    const host = hostRaw.trim().toLowerCase();
    if (!HOST.test(host) || !host.includes(".")) continue;
    if (typeof v === "string") {
      if (VALUE.test(v)) out.set(host, { param: "tag", value: v });
    } else if (v && typeof v === "object") {
      const o = v as { param?: unknown; value?: unknown };
      if (typeof o.param === "string" && typeof o.value === "string" && PARAM.test(o.param) && VALUE.test(o.value)) {
        out.set(host, { param: o.param, value: o.value });
      }
    }
  }
  return out;
}

function tagFor(host: string, tags: AffiliateTags): AffiliateTag | null {
  const h = host.toLowerCase();
  for (const [suffix, tag] of tags) if (h === suffix || h.endsWith(`.${suffix}`)) return tag;
  return null;
}

/** The link with the retailer's tag added when Akana has one for that host. Any existing value for the parameter is replaced. */
export function withRetailerTag(link: string, tags: AffiliateTags): string {
  if (tags.size === 0) return link;
  let u: URL;
  try {
    u = new URL(link);
  } catch {
    return link;
  }
  if (u.protocol !== "https:") return link;
  const tag = tagFor(u.hostname, tags);
  if (!tag) return link;
  u.searchParams.set(tag.param, tag.value);
  return u.toString();
}

/** The plain line shown beside "Get the book" when any retailer tag is set, else undefined. */
export const AFFILIATE_DISCLOSURE = "If you buy through this link, Akana may earn a small commission. It costs you nothing extra.";

export function affiliateDisclosure(tags: AffiliateTags): string | undefined {
  return tags.size > 0 ? AFFILIATE_DISCLOSURE : undefined;
}

export function affiliateTagsFromEnv(env: Record<string, string | undefined> = process.env): AffiliateTags {
  return parseAffiliateTags(env.BOOK_AFFILIATE_TAGS);
}
