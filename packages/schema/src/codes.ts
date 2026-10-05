import { createHash } from "node:crypto";

/**
 * Permanent identity codes: AK- for workbooks, AU- for authors, PB- for publishers.
 *
 * Rule carried from AK_Demo_Catalogue.json (code_rule):
 *   prefix plus five Crockford base32 characters taken from
 *   sha256("akana:<key>:<n>"), least significant digit first.
 *   n starts at 0 and is raised on collision.
 *
 * Codes are minted once and never reused. The codes already in
 * AK_Demo_Catalogue.json could not be reproduced from the slug, title or author
 * with this rule, so the catalogue's key is unknown [check]. Codes that already
 * exist are carried as given and never re-minted. This function is used only
 * for new identities, and for the 20 Maya Vaughn workbooks until the codes from
 * WB_Naming_System_Board.md are supplied (the migration marks them provisional).
 */

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export type CodePrefix = "AK" | "AU" | "PB";

export function mintCode(prefix: CodePrefix, key: string, n = 0): string {
  const digest = createHash("sha256").update(`akana:${key}:${n}`).digest();
  // Read the digest as a big integer and peel off base32 digits from the least
  // significant end.
  let value = BigInt("0x" + digest.toString("hex"));
  let out = "";
  for (let i = 0; i < 5; i++) {
    const digit = Number(value & 31n);
    out += CROCKFORD[digit];
    value >>= 5n;
  }
  return `${prefix}-${out}`;
}

export const CODE_PATTERN = /^(AK|AU|PB)-[0-9A-HJKMNP-TV-Z]{5}$/;

export function isCode(value: string, prefix?: CodePrefix): boolean {
  if (!CODE_PATTERN.test(value)) return false;
  return prefix ? value.startsWith(prefix + "-") : true;
}
