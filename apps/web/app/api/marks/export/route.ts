import { NextResponse, type NextRequest } from "next/server";
import { NO_STORE, requireOwnedEnrolment } from "@/lib/enrolment";
import { loadMarks } from "@/lib/marks-server";
import { exportFileName, exportMarkdown } from "@/lib/reading/marks";

/**
 * GET /api/marks/export?enrolment=<id> -> the reader's highlights and notes
 * for one workbook as a Markdown file. Opened here, on the server, for the
 * signed-in owner only, and sent straight to them with no caching.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UNIT_WORDS = new Set(["week", "day", "module", "chapter"]);

export async function GET(request: NextRequest) {
  const check = await requireOwnedEnrolment(request.nextUrl.searchParams.get("enrolment"));
  if (!check.ok) return check.response;
  const { enrolment, supabase, tenantId } = check;

  const loaded = await loadMarks(supabase, enrolment.id, enrolment.user_id, tenantId);
  if (!loaded) return NextResponse.json({ error: "read_failed" }, { status: 500, headers: NO_STORE });

  const { data: wb } = await supabase.from("workbooks").select("title").eq("id", enrolment.workbook_id).maybeSingle();
  const title = (wb as { title: string | null } | null)?.title ?? "your workbook";
  const { data: version } = await supabase.from("workbook_versions").select("content").eq("id", enrolment.version_id).maybeSingle();
  const unit = (version as { content?: { structure?: { unit?: string } } } | null)?.content?.structure?.unit;

  const body = exportMarkdown({
    title,
    marks: loaded.marks,
    unitWord: unit && UNIT_WORDS.has(unit) ? unit : "unit",
    date: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" }).format(new Date()),
  });
  return new NextResponse(body, {
    headers: {
      ...NO_STORE,
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFileName(title)}"`,
    },
  });
}
