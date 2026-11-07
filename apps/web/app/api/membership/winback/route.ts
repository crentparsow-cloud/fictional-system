import { NextResponse, type NextRequest } from "next/server";
import { sendWinback } from "@/lib/conversion-mail";
import { cronAuthorised } from "@/lib/cron-auth";
import { reportOps } from "@/lib/ops-alerts";
import { hashToken, mintToken } from "@/lib/partner";
import { createAdminClient } from "@/lib/supabase/admin";
import { runWinback, winbackEnabled, type DueWinback } from "@/lib/winback";
import { countEventServer } from "@/lib/funnel";
import { MARKETPLACE_TENANT_ID } from "@/lib/tenant";

/**
 * The win-back note to lapsed monthly members and one-off buyers. Runs once a
 * day and does nothing unless WINBACK_ENABLED is set.
 *
 *   GET or POST /api/membership/winback
 *   Authorization: Bearer <CRON_SECRET>   (Vercel Cron sends this itself)
 *   -> { season, due, sent, already_sent, failed }
 *
 * public.due_winback() (migration 0055) holds the audience rules: lapsed
 * monthly members and one-off buyers, never a lapsed annual member, nobody
 * with a membership running, nobody who opted out, nobody with a wellbeing
 * title. A reader is written to at most once a season: the season is claimed
 * in public.winback_log before the send and handed back if it fails
 * (lib/winback.ts). The note never names a title and every copy carries a
 * one-click unsubscribe link.
 *
 * With CRON_SECRET unset the route does nothing and says so. Addresses and
 * ids are never logged or returned, only counts.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;

type DueRow = { user_id: string; email: string; kind: "monthly" | "one_off" };

class SqlError extends Error {
  constructor(public code: string | undefined) {
    super("sql_failed");
  }
}

async function run(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 503, headers: NO_STORE });
  if (!cronAuthorised(request.headers, secret)) return NextResponse.json({ error: "unauthorised" }, { status: 401, headers: NO_STORE });
  if (!winbackEnabled()) return NextResponse.json({ enabled: false }, { headers: NO_STORE });

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "not_configured" }, { status: 503, headers: NO_STORE });
  }

  try {
    const { data: cfg } = await admin.from("app_config").select("value").eq("key", "winback_max_per_run").maybeSingle();
    const configured = Number((cfg as { value?: unknown } | null)?.value);
    const limit = Number.isInteger(configured) && configured >= 0 ? configured : 200;
    const result = await runWinback({
      now: new Date(),
      limit,
      async due(season, n) {
        const { data, error } = await admin.rpc("due_winback", { p_now: new Date().toISOString(), p_season: season, p_limit: n });
        if (error) throw new SqlError(error.code);
        return ((data ?? []) as DueRow[]).map((r): DueWinback => ({ userId: r.user_id, email: r.email, kind: r.kind }));
      },
      async claim(w, season, tokenHash) {
        const { data, error } = await admin.rpc("winback_claim", { p_user: w.userId, p_kind: w.kind, p_season: season, p_token_hash: tokenHash });
        if (error) throw new SqlError(error.code);
        return data === true;
      },
      async release(w, season) {
        const { error } = await admin.rpc("winback_release", { p_user: w.userId, p_season: season });
        if (error) throw new SqlError(error.code);
      },
      send: async (w, season, token) => {
        const sent = await sendWinback({ email: w.email, userId: w.userId, kind: w.kind, season, unsubscribeToken: token });
        if (sent) await countEventServer(admin, "winback_sent", { tenantId: MARKETPLACE_TENANT_ID });
        return sent;
      },
      mintToken,
      hash: hashToken,
      log: (code, detail) => console.error(code, detail ?? ""),
    });
    if (result.failed) await reportOps(admin, "email_failure", "api/membership/winback", "send_failed");
    return NextResponse.json({ enabled: true, ...result }, { headers: NO_STORE });
  } catch (err) {
    console.error("due_winback_failed", err instanceof SqlError ? err.code : "unknown");
    await reportOps(admin, "cron_failure", "api/membership/winback", err instanceof SqlError ? (err.code ?? "unknown") : "unknown");
    return NextResponse.json({ error: "sql_failed" }, { status: 500, headers: NO_STORE });
  }
}

export const GET = run;
export const POST = run;
