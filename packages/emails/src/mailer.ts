// Sending, with the guards carried over from legacy/functions/_shared/mailer.ts.
//
//  - Marketing and progress mail is refused while POSTAL_ADDRESS is empty or
//    "PLACEHOLDER". Transactional mail (sign-in, receipts, security) still goes.
//  - Marketing and progress mail must carry a working unsubscribe link.
//  - One-click unsubscribe is POST only: the List-Unsubscribe-Post header is
//    set whenever a one-click URL is given, and isOneClickUnsubscribeRequest()
//    is what the receiving route uses to accept nothing but that POST.
//  - Bounce and complaint suppression runs through a callback the app
//    provides, so this package needs no database.
//  - Every attempt writes one send log entry. The log holds a hash of the
//    address, never the address, and never any key material.
//  - Sending goes to Resend when RESEND_API_KEY is set, otherwise to a dev
//    transport that records what would have gone out.

import { type Rendered, isPostalPlaceholder } from "./layout";
import { type AuthorProps, type AuthorTemplateName, renderAuthor } from "./author";
import { type ReaderProps, type ReaderTemplateName, renderReader } from "./reader";
import type { FooterLinks } from "./layout";

export type SendCategory = "transactional" | "progress" | "marketing" | "partner";
export type SendStatus = "sent" | "sent_test" | "skipped" | "refused" | "suppressed" | "failed";
export type Audience = "reader" | "author";

/** One row of the send log. Shape is fixed here; the app maps it onto its table. */
export type SendLogEntry = {
  id: string;
  at: string;
  /** sha256 of the lower-cased address. The address itself is never logged. */
  to_hash: string;
  user_id: string | null;
  audience: Audience;
  template: string;
  template_version: string;
  category: SendCategory;
  status: SendStatus;
  reason: string | null;
  provider_id: string | null;
  dedupe_key: string | null;
};

export type OutboundMessage = {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
  headers: Record<string, string>;
};

export type TransportResult = { ok: true; id: string | null } | { ok: false; error: string };
export type Transport = (message: OutboundMessage) => Promise<TransportResult>;

export type MailerEnv = {
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  EMAIL_REPLY_TO?: string;
  POSTAL_ADDRESS?: string;
  /** "live" sends to the real recipient. Anything else sends to TEST_RECIPIENT with a [Test] subject. */
  EMAIL_MODE?: string;
  TEST_RECIPIENT?: string;
};

export type MailerOptions = {
  env: MailerEnv;
  /** Bounce and complaint suppression. True means the address must not be mailed. */
  isSuppressed: (address: string) => Promise<boolean> | boolean;
  /** Receives one entry per attempt. */
  log: (entry: SendLogEntry) => Promise<void> | void;
  /** Claims a dedupe key. Return false when another run already owns it. Defaults to an in-memory set. */
  claim?: (dedupeKey: string) => Promise<boolean> | boolean;
  /** Frees a claimed key after a failure so a later run can retry. */
  release?: (dedupeKey: string) => Promise<void> | void;
  /** Overrides the transport chosen from env. */
  transport?: Transport;
  fetch?: typeof fetch;
  now?: () => Date;
  id?: () => string;
};

export type SendOptions = {
  to: string;
  userId?: string | null;
  dedupeKey?: string | null;
  links?: FooterLinks;
  lang?: string;
};

export type SendResult = { status: SendStatus; reason?: string; providerId?: string | null; entry: SendLogEntry };

export const TEMPLATE_VERSION = "v2";
const RESEND_URL = "https://api.resend.com/emails";
const DEV_FROM = "Akana <dev@localhost>";

const te = new TextEncoder();
export async function sha256(s: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", te.encode(s)));
  return Array.from(h, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Removes any occurrence of secret material from a string before it is logged. */
export function redact(s: string, secrets: (string | undefined)[]): string {
  let out = s;
  for (const sec of secrets) {
    if (sec && sec.length >= 8) out = out.split(sec).join("[redacted]");
  }
  return out;
}

/** True only for the POST a mail client sends for RFC 8058 one-click unsubscribe. GET never unsubscribes anyone. */
export function isOneClickUnsubscribeRequest(method: string, body: string | URLSearchParams | null | undefined): boolean {
  if (method.toUpperCase() !== "POST") return false;
  const params = typeof body === "string" ? new URLSearchParams(body) : body;
  return params?.get("List-Unsubscribe") === "One-Click";
}

/** Headers for a message with a one-click unsubscribe URL. The URL must accept POST and nothing else. */
export function unsubscribeHeaders(oneClickUrl: string | undefined): Record<string, string> {
  if (!oneClickUrl) return {};
  return { "List-Unsubscribe": `<${oneClickUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
}

/** A transport that records sends instead of making them. */
export function createDevTransport(): { transport: Transport; sends: OutboundMessage[] } {
  const sends: OutboundMessage[] = [];
  const transport: Transport = async (message) => {
    sends.push(message);
    return { ok: true, id: `dev_${sends.length}` };
  };
  return { transport, sends };
}

/** Resend-compatible transport. The key is used in the Authorization header and nowhere else. */
export function createResendTransport(apiKey: string, fetchImpl: typeof fetch = fetch): Transport {
  return async (m) => {
    try {
      const res = await fetchImpl(RESEND_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: m.from,
          to: [m.to],
          reply_to: m.replyTo || undefined,
          subject: m.subject,
          text: m.text,
          html: m.html,
          headers: m.headers,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!res.ok) return { ok: false, error: redact(String(body?.message ?? res.status), [apiKey]) };
      return { ok: true, id: body?.id ?? null };
    } catch (e) {
      return { ok: false, error: redact(e instanceof Error ? e.message : "fetch_failed", [apiKey]) };
    }
  };
}

const defaultId = () => (typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

export function createMailer(o: MailerOptions) {
  const env = o.env;
  const secrets = [env.RESEND_API_KEY];
  const owned = new Set<string>();
  const claim = o.claim ?? ((k: string) => (owned.has(k) ? false : (owned.add(k), true)));
  const release = o.release ?? ((k: string) => void owned.delete(k));
  const dev = o.transport ? null : env.RESEND_API_KEY ? null : createDevTransport();
  const transport: Transport = o.transport ?? (env.RESEND_API_KEY ? createResendTransport(env.RESEND_API_KEY, o.fetch ?? fetch) : dev!.transport);
  const now = o.now ?? (() => new Date());
  const id = o.id ?? defaultId;

  async function deliver(rendered: Rendered, category: SendCategory, audience: Audience, template: string, s: SendOptions): Promise<SendResult> {
    const entry: SendLogEntry = {
      id: id(),
      at: now().toISOString(),
      to_hash: await sha256(s.to.trim().toLowerCase()),
      user_id: s.userId ?? null,
      audience,
      template,
      template_version: TEMPLATE_VERSION,
      category,
      status: "failed",
      reason: null,
      provider_id: null,
      dedupe_key: s.dedupeKey ?? null,
    };
    const finish = async (status: SendStatus, reason?: string, providerId?: string | null): Promise<SendResult> => {
      entry.status = status;
      entry.reason = reason ? redact(reason, secrets).slice(0, 300) : null;
      entry.provider_id = providerId ?? null;
      await o.log(entry);
      return { status, reason: entry.reason ?? undefined, providerId: entry.provider_id, entry };
    };

    const needsConsentFooter = category === "marketing" || category === "progress";
    if (needsConsentFooter && isPostalPlaceholder(env.POSTAL_ADDRESS)) return finish("refused", "postal_placeholder");
    if (needsConsentFooter && !s.links?.unsubscribe && !s.links?.oneClick) return finish("refused", "no_unsubscribe");
    if (await o.isSuppressed(s.to)) return finish("suppressed", "address_suppressed");
    if (s.dedupeKey && !(await claim(s.dedupeKey))) return finish("skipped", "already_sent");

    const testMode = env.EMAIL_MODE !== "live";
    const to = testMode ? (env.TEST_RECIPIENT ?? "") : s.to;
    const fail = async (reason: string) => {
      if (s.dedupeKey) await release(s.dedupeKey);
      return finish("failed", reason);
    };
    if (!to) return fail("no_test_recipient");
    const from = env.EMAIL_FROM || (dev ? DEV_FROM : "");
    if (!from) return fail("no_from_address");

    const result = await transport({
      from,
      to,
      replyTo: env.EMAIL_REPLY_TO || undefined,
      subject: testMode ? `[Test] ${rendered.subject}` : rendered.subject,
      text: rendered.text,
      html: rendered.html,
      headers: unsubscribeHeaders(s.links?.oneClick),
    });
    if (!result.ok) return fail(result.error);
    return finish(testMode ? "sent_test" : "sent", undefined, result.id);
  }

  return {
    /** What the dev transport recorded. Empty when a real transport is in use. */
    devSends: dev?.sends ?? [],

    async sendReader<K extends ReaderTemplateName>(template: K, props: ReaderProps[K], s: SendOptions): Promise<SendResult> {
      const r = renderReader(template, props, s.links ?? {}, env.POSTAL_ADDRESS, s.lang);
      return deliver(r, r.category, "reader", template, s);
    },

    async sendAuthor<K extends AuthorTemplateName>(template: K, props: AuthorProps[K], s: SendOptions): Promise<SendResult> {
      const r = renderAuthor(template, props, s.links ?? {}, env.POSTAL_ADDRESS, s.lang);
      return deliver(r, "transactional", "author", template, s);
    },
  };
}

export type Mailer = ReturnType<typeof createMailer>;
