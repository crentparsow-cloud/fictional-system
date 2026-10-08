import { NextResponse, type NextRequest } from "next/server";
import { answerKeyRing, unseal } from "@/lib/answers";
import { getReaderSession } from "@/lib/auth";
import { NO_STORE } from "@/lib/enrolment";
import {
  buildExport,
  exportFileName,
  exportJson,
  labelsFromUnitSections,
  partnerForExport,
  renderExportHtml,
  type ExportAnswerInput,
  type ExportEnrolmentInput,
} from "@/lib/export";
import { EXPORT_BUSY_MESSAGE, hitSelf } from "@/lib/limits";
import { createUserClient } from "@/lib/supabase/server";
import { tenantIdForRequest } from "@/lib/tenant-id";

/**
 * Export of the reader's own work (F-023).
 *
 *   GET /api/export?format=json            -> attachment, application/json
 *   GET /api/export?format=html[&titles=show] -> attachment, text/html, printable
 *
 * Everything is read through the reader's own client, so RLS decides what
 * comes back. Enrolments are also filtered to the signed-in user id, because
 * staff can read every enrolment under RLS and an export must never carry
 * anyone else's work. Only enrolments on this request's tenant are included,
 * the same rule the answers route applies. Values are unsealed here, on the
 * server, with the AAD each one was sealed under (user | tenant | field).
 *
 * The check-in partner (0012) is read the same way: the reader's own row,
 * filtered by user id, and only the replies on that row. Only the partner's
 * name, the share level, the status and the kind words go into the file
 * (partnerForExport). If they cannot be read the part is left out.
 *
 * Errors: 401 no session, 404 unknown tenant, 400 bad format, 429 after 10
 * downloads in an hour (0027), 503 when ANSWERS_KEYS is not set, 500 when a
 * read fails. All no-store.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type EnrolmentRow = {
  id: string;
  user_id: string;
  tenant_id: string;
  version_id: string;
  status: string;
  started_at: string;
  workbooks: { code: string | null; title: string | null } | { code: string | null; title: string | null }[] | null;
};

const plain = (message: string, status: number) =>
  new NextResponse(message + "\n", { status, headers: { ...NO_STORE, "Content-Type": "text/plain; charset=utf-8" } });

export async function GET(request: NextRequest) {
  const format = request.nextUrl.searchParams.get("format") ?? "json";
  if (format !== "json" && format !== "html") return plain("Choose format=json or format=html.", 400);
  const showTitles = request.nextUrl.searchParams.get("titles") === "show";

  const session = await getReaderSession();
  if (!session) return plain("Please sign in to download your work.", 401);
  const tenantId = await tenantIdForRequest();
  if (!tenantId) return plain("This site is not set up yet.", 404);

  try {
    answerKeyRing();
  } catch {
    return plain("Downloads are not available right now. Your work is safe. Please try again later.", 503);
  }

  const supabase = await createUserClient();
  // F-143: at most 10 downloads an hour per reader (0027).
  if (!(await hitSelf(supabase, "export_user"))) return plain(EXPORT_BUSY_MESSAGE, 429);
  const { data: enrolData, error: enrolError } = await supabase
    .from("enrolments")
    .select("id, user_id, tenant_id, version_id, status, started_at, workbooks(code, title)")
    .eq("user_id", session.userId)
    .eq("tenant_id", tenantId)
    .order("started_at", { ascending: true });
  if (enrolError) return plain("Could not prepare your download. Please try again.", 500);
  const enrolments = ((enrolData ?? []) as unknown as EnrolmentRow[]).filter((e) => e.user_id === session.userId && e.tenant_id === tenantId);

  const ids = enrolments.map((e) => e.id);
  const versionIds = [...new Set(enrolments.map((e) => e.version_id))];

  const [answersRes, sectionsRes] = ids.length
    ? await Promise.all([
        supabase.from("answers").select("enrolment_id, field, sealed, updated_at").in("enrolment_id", ids),
        supabase.from("workbook_sections").select("version_id, unit_number, body").eq("kind", "unit").in("version_id", versionIds),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (answersRes.error) return plain("Could not prepare your download. Please try again.", 500);
  // Sections are labels only. If they cannot be read, the export falls back to ids.
  const sections = (sectionsRes.error ? [] : (sectionsRes.data ?? [])) as { version_id: string; unit_number: number | null; body: unknown }[];

  const owned = new Map(enrolments.map((e) => [e.id, e]));
  const answers: ExportAnswerInput[] = [];
  const unreadable: Record<string, number> = {};
  for (const row of (answersRes.data ?? []) as { enrolment_id: string; field: string; sealed: string; updated_at: string }[]) {
    const e = owned.get(row.enrolment_id);
    if (!e) continue;
    try {
      const value = await unseal({ userId: session.userId, tenantId: e.tenant_id, field: row.field }, row.sealed);
      answers.push({ enrolmentId: e.id, field: row.field, value, updatedAt: row.updated_at });
    } catch {
      // A row that will not open is counted and left out. Nothing is logged.
      unreadable[e.id] = (unreadable[e.id] ?? 0) + 1;
    }
  }

  const inputs: ExportEnrolmentInput[] = enrolments.map((e) => {
    const wb = Array.isArray(e.workbooks) ? e.workbooks[0] : e.workbooks;
    return {
      id: e.id,
      workbookCode: wb?.code ?? null,
      workbookTitle: wb?.title ?? null,
      status: e.status,
      startedAt: e.started_at,
      labels: labelsFromUnitSections(sections.filter((s) => s.version_id === e.version_id)),
    };
  });

  const partner = await readPartner(supabase, session.userId);

  const now = new Date();
  const doc = buildExport(inputs, answers, unreadable, now, partner);
  const body = format === "json" ? exportJson(doc) : renderExportHtml(doc, { showTitles });
  return new NextResponse(body, {
    status: 200,
    headers: {
      ...NO_STORE,
      "Content-Type": format === "json" ? "application/json; charset=utf-8" : "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFileName(format, now)}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function readPartner(supabase: Awaited<ReturnType<typeof createUserClient>>, userId: string) {
  try {
    const { data: row, error } = await supabase
      .from("partners")
      .select("id, user_id, partner_name, share_level, status")
      .eq("user_id", userId)
      .maybeSingle();
    const p = row as { id: string; user_id: string; partner_name: unknown; share_level: unknown; status: unknown } | null;
    if (error || !p || p.user_id !== userId) return null;
    const { data: replies } = await supabase
      .from("partner_replies")
      .select("body, created_at")
      .eq("partner_id", p.id)
      .order("created_at", { ascending: true })
      .limit(500);
    return partnerForExport({
      partner_name: p.partner_name,
      share_level: p.share_level,
      status: p.status,
      replies: (replies ?? []) as { body: unknown; created_at: unknown }[],
    });
  } catch {
    return null;
  }
}
