/**
 * The finish certificate (12.2), the pure part. It says who finished which
 * workbook, in a few plain words, and carries no date and no score. It is
 * private by default: only the reader sees it. They may turn on a link, which
 * is never offered for a title above safety tier none (the database refuses
 * it too, migration 0065).
 */

export const NAME_MAX = 60;
const BAD = /[<>\u0000-\u001f\u007f]/;

/** The name as typed, tidied. Null when blank. Throws nothing; bad input gives a reason. */
export function cleanHolderName(raw: unknown): { ok: true; name: string | null } | { ok: false; reason: string } {
  if (raw === null || raw === undefined) return { ok: true, name: null };
  if (typeof raw !== "string") return { ok: false, reason: "The name must be text." };
  const name = raw.replace(/\s+/g, " ").trim();
  if (name === "") return { ok: true, name: null };
  if (name.length > NAME_MAX) return { ok: false, reason: `Keep the name to ${NAME_MAX} characters or fewer.` };
  if (BAD.test(name)) return { ok: false, reason: "The name can use letters, numbers and ordinary punctuation." };
  return { ok: true, name };
}

export interface CertificateWords {
  heading: string;
  line: string;
  title: string;
  foot: string;
}

export function certificateWords(title: string, name: string | null): CertificateWords {
  return {
    heading: "Certificate of finishing",
    line: name ? `${name} finished` : "Finished",
    title,
    foot: "Done at their own pace.",
  };
}

export const CERTIFICATE_NOTICES = {
  saved: "Saved.",
  "not-finished": "The certificate is made once you reach the end of the programme.",
  "bad-name": "The name could not be used. Keep it plain and short.",
  failed: "That did not work just now. Try again in a moment.",
} as const;

export type CertificateNotice = keyof typeof CERTIFICATE_NOTICES;

export function certificateNotice(code: string | string[] | undefined): string | null {
  const c = Array.isArray(code) ? code[0] : code;
  return c && c in CERTIFICATE_NOTICES ? CERTIFICATE_NOTICES[c as CertificateNotice] : null;
}

/** The public address of a shared certificate. */
export function certificateUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/c/${token}`;
}
