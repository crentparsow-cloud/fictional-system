import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { NO_STORE, requireOwnedEnrolment } from "@/lib/enrolment";
import { loadMarks, sealMark } from "@/lib/marks-server";
import { privateWriteRefusal } from "@/lib/private-writes";
import { MARK_COLOURS, MAX_EXCERPT_CHARS, MAX_MARKS_PER_ENROLMENT, MAX_NOTE_CHARS } from "@/lib/reading/marks";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Highlights and notes, private to the reader (3.4, migration 0058).
 *
 *   GET    /api/marks?enrolment=<id>               -> { marks: Mark[] }
 *   PUT    /api/marks { enrolment, ref, colour, note?, excerpt? } -> { mark }
 *   DELETE /api/marks?enrolment=<id>&ref=<ref>     -> { ok: true }
 *
 * The write path is the same shape as /api/answers. Clients have no insert or
 * update grant on public.reader_marks, so the route confirms the session and
 * the enrolment under the reader's own client, applies the consent and read
 * only rules, seals the note and the paragraph's words with AAD of user,
 * tenant and "mark:<ref>", and only then writes with the service role. Reads
 * and deletes use the reader's own client, so RLS decides. Nothing here is
 * counted, shared or sent anywhere.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REF = /^[a-z0-9][a-z0-9_:~.#-]{0,119}$/;

const PutBody = z
  .object({
    enrolment: z.string().uuid(),
    ref: z.string().regex(REF),
    colour: z.enum(MARK_COLOURS),
    note: z.string().max(MAX_NOTE_CHARS).optional(),
    excerpt: z.string().max(MAX_EXCERPT_CHARS).optional(),
  })
  .strict();

export async function GET(request: NextRequest) {
  const check = await requireOwnedEnrolment(request.nextUrl.searchParams.get("enrolment"));
  if (!check.ok) return check.response;
  const loaded = await loadMarks(check.supabase, check.enrolment.id, check.enrolment.user_id, check.tenantId);
  if (!loaded) return NextResponse.json({ error: "read_failed" }, { status: 500, headers: NO_STORE });
  return NextResponse.json({ marks: loaded.marks, unreadable: loaded.unreadable }, { headers: NO_STORE });
}

export async function PUT(request: NextRequest) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: NO_STORE });
  }
  const parsed = PutBody.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400, headers: NO_STORE });
  const { enrolment: enrolmentId, ref, colour, note = "", excerpt = "" } = parsed.data;

  const check = await requireOwnedEnrolment(enrolmentId);
  if (!check.ok) return check.response;
  const { enrolment, tenantId, supabase } = check;
  const refusal = await privateWriteRefusal(check);
  if (refusal) return refusal;

  // A cap, so a script cannot fill the table. Changing a mark already there is always allowed.
  const { data: existing } = await supabase.from("reader_marks").select("id").eq("enrolment_id", enrolment.id).eq("ref", ref).maybeSingle();
  if (!existing) {
    const { count } = await supabase.from("reader_marks").select("id", { count: "exact", head: true }).eq("enrolment_id", enrolment.id);
    if ((count ?? 0) >= MAX_MARKS_PER_ENROLMENT) {
      return NextResponse.json({ error: "too_many", message: "That is the most marks one workbook can hold. Remove one to add another." }, { status: 409, headers: NO_STORE });
    }
  }

  let sealed: { sealed: string; keyId: string };
  try {
    sealed = await sealMark(enrolment.user_id, tenantId, ref, { note, excerpt });
  } catch {
    return NextResponse.json({ error: "sealing_unavailable" }, { status: 503, headers: NO_STORE });
  }

  const updatedAt = new Date().toISOString();
  const { data, error } = await createAdminClient()
    .from("reader_marks")
    .upsert(
      { user_id: enrolment.user_id, enrolment_id: enrolment.id, ref, colour, sealed: sealed.sealed, key_id: sealed.keyId, updated_at: updatedAt },
      { onConflict: "enrolment_id,ref" },
    )
    .select("id")
    .single();
  if (error || !data) return NextResponse.json({ error: "write_failed" }, { status: 500, headers: NO_STORE });
  return NextResponse.json({ mark: { id: (data as { id: string }).id, ref, colour, note, excerpt, updatedAt } }, { headers: NO_STORE });
}

export async function DELETE(request: NextRequest) {
  const ref = request.nextUrl.searchParams.get("ref");
  if (!ref || !REF.test(ref)) return NextResponse.json({ error: "invalid_ref" }, { status: 400, headers: NO_STORE });
  const check = await requireOwnedEnrolment(request.nextUrl.searchParams.get("enrolment"));
  if (!check.ok) return check.response;
  const { error } = await check.supabase.from("reader_marks").delete().eq("enrolment_id", check.enrolment.id).eq("ref", ref);
  if (error) return NextResponse.json({ error: "delete_failed" }, { status: 500, headers: NO_STORE });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
