/**
 * Operational alerts (F-142).
 *
 * Server code reports a failure with a kind, a source and a short code:
 *
 *   await reportOps(admin, "webhook_failure", "api/stripe/webhook", "handler_failed");
 *
 * public.record_ops_event (migration 0016, service role only) stores the
 * event and opens an alert when the kind's threshold is crossed. When an
 * alert opens, one email goes to OPS_ALERT_TO, or LEADS_NOTIFY_TO when that
 * is unset, and the alert is stamped as notified. Staff see and acknowledge
 * alerts on /admin/ops.
 *
 * Nothing personal goes in. The source is a route path and the code is a
 * short token; anything else is stored as "unrecognised" by the database.
 * Sentry (10.3) sees errors only while SENTRY_DSN is set; these alerts work
 * without it.
 *
 * Reporting never throws: a failure to report is logged and swallowed, so
 * it cannot turn a handled error into a worse one.
 */
import { createDevTransport, createMailer, type MailerEnv, type SendLogEntry, type Transport } from "@akana/emails";
import type { OpsKind } from "@/lib/admin/ops";
import { opsKindLabel } from "@/lib/admin/ops";

export type { OpsKind } from "@/lib/admin/ops";

type RpcClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string } | null }>;
};

export type OpsEnv = MailerEnv & { OPS_ALERT_TO?: string; LEADS_NOTIFY_TO?: string; AKANA_HOST?: string };

const SOURCE = /^[a-z0-9_./-]{1,80}$/;
const CODE = /^[A-Za-z0-9_.:-]{1,80}$/;

/** Clean a source path such as "/api/stripe/webhook" into "api/stripe/webhook". */
export function opsSource(raw: string): string {
  const s = raw.trim().toLowerCase().replace(/^\/+/, "").replace(/[^a-z0-9_./-]+/g, "-").slice(0, 80);
  return SOURCE.test(s) ? s : "unknown";
}

/** A short code, or null. Never a message: anything that does not look like a code is dropped. */
export function opsCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().slice(0, 80);
  return CODE.test(s) ? s : null;
}

/** Where the alert email goes. OPS_ALERT_TO first, LEADS_NOTIFY_TO second. */
export function opsRecipient(env: Pick<OpsEnv, "OPS_ALERT_TO" | "LEADS_NOTIFY_TO">): string | null {
  const to = (env.OPS_ALERT_TO || env.LEADS_NOTIFY_TO || "").trim();
  return to || null;
}

function envFromProcess(): OpsEnv {
  const e = process.env;
  return {
    RESEND_API_KEY: e.RESEND_API_KEY,
    EMAIL_FROM: e.EMAIL_FROM,
    EMAIL_REPLY_TO: e.EMAIL_REPLY_TO,
    EMAIL_MODE: e.EMAIL_MODE,
    TEST_RECIPIENT: e.TEST_RECIPIENT,
    POSTAL_ADDRESS: e.POSTAL_ADDRESS,
    OPS_ALERT_TO: e.OPS_ALERT_TO,
    LEADS_NOTIFY_TO: e.LEADS_NOTIFY_TO,
    AKANA_HOST: e.AKANA_HOST,
  };
}

/** Sends ops_alert. Without a recipient or RESEND_API_KEY the dev transport records it and nothing leaves. */
export async function sendOpsAlert(
  alert: { kind: OpsKind; source: string; code: string | null; at: Date },
  o: { env: OpsEnv; transport?: Transport; log?: (e: SendLogEntry) => void },
) {
  const to = opsRecipient(o.env);
  const live = Boolean(to && o.env.RESEND_API_KEY);
  const dev = live || o.transport ? null : createDevTransport();
  const env: MailerEnv = live
    ? o.env
    : { EMAIL_MODE: "live", EMAIL_FROM: o.env.EMAIL_FROM || "Akana <dev@localhost>", POSTAL_ADDRESS: o.env.POSTAL_ADDRESS };
  const mailer = createMailer({
    env,
    isSuppressed: () => false,
    log: o.log ?? ((e) => console.info("ops_alert_email", e.status, e.reason ?? "")),
    transport: o.transport ?? dev?.transport,
  });
  const host = o.env.AKANA_HOST || "localhost:3000";
  const origin = `${host.startsWith("localhost") ? "http" : "https"}://${host}`;
  return mailer.sendAuthor(
    "ops_alert",
    {
      studioUrl: `${origin}/admin/ops`,
      supportEmail: o.env.EMAIL_REPLY_TO || "",
      kind: opsKindLabel(alert.kind),
      source: alert.source,
      code: alert.code ?? undefined,
      at: alert.at.toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/London" }),
    },
    { to: to ?? "ops@localhost" },
  );
}

/**
 * Record one failure and, when it opens an alert, send the one email.
 * Takes the service role client: record_ops_event is not open to readers.
 */
export async function reportOps(
  admin: RpcClient,
  kind: OpsKind,
  source: string,
  code?: string | null,
  o: { env?: OpsEnv; now?: Date; transport?: Transport } = {},
): Promise<{ alertId: string | null; notified: boolean }> {
  const src = opsSource(source);
  const c = opsCode(code ?? null);
  try {
    const { data, error } = await admin.rpc("record_ops_event", { p_kind: kind, p_source: src, p_code: c });
    if (error) {
      console.error("ops_event_failed", kind, error.code ?? "");
      return { alertId: null, notified: false };
    }
    const row = (Array.isArray(data) ? data[0] : data) as { alert_id: string | null; notify: boolean } | undefined;
    if (!row?.alert_id || !row.notify) return { alertId: row?.alert_id ?? null, notified: false };

    const sent = await sendOpsAlert({ kind, source: src, code: c, at: o.now ?? new Date() }, { env: o.env ?? envFromProcess(), transport: o.transport });
    const ok = sent.status === "sent" || sent.status === "sent_test";
    if (ok) {
      const { error: markError } = await admin.rpc("mark_ops_alert_notified", { p_alert: row.alert_id });
      if (markError) console.error("ops_alert_mark_failed", markError.code ?? "");
    }
    return { alertId: row.alert_id, notified: ok };
  } catch (e) {
    console.error("ops_event_failed", kind, e instanceof Error ? e.name : "unknown");
    return { alertId: null, notified: false };
  }
}
