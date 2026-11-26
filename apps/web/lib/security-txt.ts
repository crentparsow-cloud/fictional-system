import { siteOrigin } from "@/lib/site-url";

/**
 * security.txt (RFC 9116). The contact comes from SECURITY_CONTACT: an email
 * address, a mailto: address or an https address. Blank, or anything else, gives
 * null, and the route answers 404 so no half-made file is published. Read at
 * request time, so a change needs no rebuild.
 */
export function securityContact(env: Record<string, string | undefined> = process.env): string | null {
  const raw = env.SECURITY_CONTACT?.trim();
  if (!raw || /[\s<>]/.test(raw)) return null;
  if (/^[^@/:]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(raw)) return `mailto:${raw}`;
  if (/^mailto:[^@/:]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(raw)) return raw;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** The address shown to people, without the mailto: prefix. */
export function securityContactLabel(contact: string): string {
  return contact.replace(/^mailto:/i, "");
}

/** The file body, or null when no contact is set. Expires is one year after `now`. */
export function securityTxt(env: Record<string, string | undefined> = process.env, now: Date = new Date()): string | null {
  const contact = securityContact(env);
  if (!contact) return null;
  const expires = new Date(now.getTime());
  expires.setUTCFullYear(expires.getUTCFullYear() + 1);
  const origin = siteOrigin(env);
  return [
    `Contact: ${contact}`,
    `Expires: ${expires.toISOString().replace(/\.\d{3}Z$/, "Z")}`,
    "Preferred-Languages: en",
    `Canonical: ${origin}/.well-known/security.txt`,
    "",
  ].join("\n");
}
