import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorised } from "@/lib/cron-auth";
import { runNewsletterSend, sendReadiness, type DueIssue, type Recipient } from "@/lib/newsletter";
import { sendIssue } from "@/lib/newsletter-server";
import { reportOps } from "@/lib/ops-alerts";
import { siteOrigin } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The weekly newsletter send (6.11). Runs once a day from Vercel Cron and
 * sends the issue staff scheduled, in batches, until everyone confirmed has
 * had it.
 *
 *   GET or POST /api/newsletter/send
 *   Authorization: Bearer <CRON_SECRET>   (Vercel Cron sends this itself)
 *   -> { status, reason?, purged, sent, failed }
 *
 * Nothing happens while NEWSLETTER_SENDING_DOMAIN is blank, or while the
 * API key, the From address, EMAIL_MODE=live or a real POSTAL_ADDRESS are
 * missing: the route answers status "not_ready" with the reason and touches
 * neither the database nor the mailer. NEWSLETTER_BATCH_SIZE (default 200)
 * sets how many people one run mails. Each person is claimed once per issue
 * in public.email_claims before the send, so a repeated run cannot mail
 * anyone twice. Addresses and tokens are never logged or returned, only counts.
 *
 * With CRON_SECRET unset the route answers 503 and does nothing.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const DEFAULT_BATCH = 200;

type IssueRow = {
  id: string;
  subject: string;
  preheader: string;
  intro: string;
  exercise_heading: string;
  exercise_body: string;
  sponsor_name: string | null;
  sponsor_text: string | null;
  sponsor_url: string | null;
};

class SqlError extends Error {
  constructor(public code: string | undefined) {
    super("sql_failed");
  }
}

async function run(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 503, headers: NO_STORE });
  if (!cronAuthorised(request.headers, secret)) return NextResponse.json({ error: "unauthorised" }, { status: 401, headers: NO_STORE });

  const readiness = sendReadiness();
  if (!readiness.ok) {
    // The guard comes first: no admin client, no query, no email.
    return NextResponse.json({ status: "not_ready", reason: readiness.reason, purged: 0, sent: 0, failed: 0 }, { headers: NO_STORE });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "not_configured" }, { status: 503, headers: NO_STORE });
  }

  const origin = siteOrigin();
  const batch = Number.parseInt(process.env.NEWSLETTER_BATCH_SIZE ?? "", 10);
  try {
    const result = await runNewsletterSend({
      readiness,
      batchSize: Number.isFinite(batch) && batch > 0 ? batch : DEFAULT_BATCH,
      async purgePending() {
        const { data, error } = await admin.rpc("newsletter_purge_pending");
        if (error) throw new SqlError(error.code);
        return typeof data === "number" ? data : 0;
      },
      async takeDue(): Promise<DueIssue | null> {
        const { data, error } = await admin.rpc("newsletter_take_due_issue");
        if (error) throw new SqlError(error.code);
        const row = ((data ?? []) as IssueRow[])[0];
        if (!row) return null;
        return {
          id: row.id,
          subject: row.subject,
          preheader: row.preheader,
          intro: row.intro,
          exerciseHeading: row.exercise_heading,
          exerciseBody: row.exercise_body,
          sponsor: row.sponsor_name && row.sponsor_text && row.sponsor_url ? { name: row.sponsor_name, text: row.sponsor_text, url: row.sponsor_url } : null,
        };
      },
      async recipients(issueId, limit): Promise<Recipient[]> {
        const { data, error } = await admin.rpc("newsletter_next_recipients", { p_issue: issueId, p_limit: limit });
        if (error) throw new SqlError(error.code);
        return ((data ?? []) as { subscriber_id: string; email: string; token: string }[]).map((r) => ({ subscriberId: r.subscriber_id, email: r.email, token: r.token }));
      },
      send: (issue, to) => sendIssue(admin, issue, to, origin),
      async record(issueId, subscriberId, ok) {
        const { error } = await admin.rpc("newsletter_record_send", { p_issue: issueId, p_subscriber: subscriberId, p_ok: ok });
        if (error) throw new SqlError(error.code);
      },
      async finish(issueId) {
        const { data, error } = await admin.rpc("newsletter_finish_issue", { p_issue: issueId });
        if (error) throw new SqlError(error.code);
        return data === true;
      },
      log: (code, detail) => console.error(code, detail ?? ""),
    });
    if (result.failed) await reportOps(admin, "email_failure", "api/newsletter/send", "send_failed");
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (err) {
    console.error("newsletter_send_failed", err instanceof SqlError ? err.code : "unknown");
    await reportOps(admin, "cron_failure", "api/newsletter/send", err instanceof SqlError ? (err.code ?? "sql_failed") : "unknown");
    return NextResponse.json({ error: "sql_failed" }, { status: 500, headers: NO_STORE });
  }
}

export const GET = run;
export const POST = run;
