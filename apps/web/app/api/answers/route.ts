import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { FIELD_PATTERN } from "@/lib/answer-fields";
import { MAX_ANSWER_BYTES, seal, unseal } from "@/lib/answers";
import { answerWriteDecision, faithAnswerWriteDecision } from "@/lib/consent";
import { readerDeletion } from "@/lib/account-server";
import { NO_STORE, requireOwnedEnrolment } from "@/lib/enrolment";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Reader answers, sealed (F-134).
 *
 *   GET /api/answers?enrolment=<id>  -> { answers: { [field]: value } }
 *   PUT /api/answers { enrolment, field, value } -> { updated_at }
 *       403 { error: "consent_required", message } for a wellbeing
 *       workbook when the reader has no health data consent (F-026),
 *       and for a faith workbook with no faith consent (F-150)
 *       403 { error: "read_only", message } while an account deletion
 *       is pending (F-025): the work can be read, not added to
 *
 * Why the admin client is acceptable on the write path. Clients have no
 * insert or update grant on public.answers at all, so a write has to come
 * from the server. Before the service role touches anything, the route has
 * already (1) confirmed the session, (2) read the enrolment through the
 * reader's own client, so RLS proved they own it, and (3) checked the
 * request tenant matches the enrolment. The value is then sealed with AAD
 * of user | tenant | field. A row written this way cannot be replayed to
 * another reader, tenant or field: the ciphertext simply will not open
 * there. The service role never reads answers back; GET uses the user client.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const jsonValue: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string(), z.number().finite(), z.boolean(), z.null(), z.array(jsonValue), z.record(z.string(), jsonValue)]),
);

const PutBody = z
  .object({
    enrolment: z.string().uuid(),
    field: z.string().regex(FIELD_PATTERN),
    value: jsonValue,
  })
  .strict();

export async function GET(request: NextRequest) {
  const check = await requireOwnedEnrolment(request.nextUrl.searchParams.get("enrolment"));
  if (!check.ok) return check.response;
  const { enrolment, supabase, tenantId } = check;

  const { data, error } = await supabase.from("answers").select("field, sealed").eq("enrolment_id", enrolment.id);
  if (error) return NextResponse.json({ error: "read_failed" }, { status: 500, headers: NO_STORE });

  const answers: Record<string, unknown> = {};
  let unreadable = 0;
  for (const row of (data ?? []) as { field: string; sealed: string }[]) {
    try {
      answers[row.field] = await unseal({ userId: enrolment.user_id, tenantId, field: row.field }, row.sealed);
    } catch {
      // A row that will not open for this reader, tenant and field is left
      // out rather than guessed at. Nothing about it is logged.
      unreadable += 1;
    }
  }
  return NextResponse.json({ answers, unreadable }, { headers: NO_STORE });
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
  const { enrolment: enrolmentId, field, value } = parsed.data;

  if (Buffer.byteLength(JSON.stringify(value), "utf8") > MAX_ANSWER_BYTES) {
    return NextResponse.json({ error: "too_large", max_bytes: MAX_ANSWER_BYTES }, { status: 413, headers: NO_STORE });
  }

  const check = await requireOwnedEnrolment(enrolmentId);
  if (!check.ok) return check.response;
  const { enrolment, tenantId } = check;

  // F-025: read only while a deletion is pending. Checked before consent so
  // the reader is told the real reason.
  const deletion = await readerDeletion(check.supabase, enrolment.user_id);
  if (deletion.readOnly) {
    return NextResponse.json(
      { error: "read_only", message: "Your account is read only while its deletion is pending." },
      { status: 403, headers: NO_STORE },
    );
  }

  // Health data consent (F-026). A wellbeing workbook takes no new answers
  // while the reader has no consent in place, for example after withdrawal.
  // Both reads go through the reader's own client; a tier that cannot be
  // read fails closed.
  // Faith consent (F-150) works the same way for a workbook on the Faith and
  // Spirituality shelf.
  const [{ data: wbTier }, { data: profile }] = await Promise.all([
    check.supabase.from("workbooks").select("safety_tier, genre_id, themes(shelf_id)").eq("id", enrolment.workbook_id).maybeSingle(),
    check.supabase
      .from("profiles")
      .select("health_consent_at, health_consent_version, faith_consent_at, faith_consent_version")
      .eq("user_id", enrolment.user_id)
      .maybeSingle(),
  ]);
  const wbRow = wbTier as unknown as { safety_tier: string | null; genre_id: string | null; themes: { shelf_id: string | null } | null } | null;
  const decision = answerWriteDecision(wbRow?.safety_tier ?? null, {
    consentAt: (profile?.health_consent_at as string | null | undefined) ?? null,
    consentVersion: (profile?.health_consent_version as string | null | undefined) ?? null,
  });
  if (!decision.ok) {
    return NextResponse.json({ error: decision.error, message: decision.message }, { status: decision.status, headers: NO_STORE });
  }
  const faithDecision = faithAnswerWriteDecision(
    { shelfId: wbRow?.themes?.shelf_id ?? null, genreId: wbRow?.genre_id ?? null },
    {
      consentAt: (profile?.faith_consent_at as string | null | undefined) ?? null,
      consentVersion: (profile?.faith_consent_version as string | null | undefined) ?? null,
    },
  );
  if (!faithDecision.ok) {
    return NextResponse.json({ error: faithDecision.error, message: faithDecision.message }, { status: faithDecision.status, headers: NO_STORE });
  }

  let sealed: { sealed: string; keyId: string };
  try {
    sealed = await seal({ userId: enrolment.user_id, tenantId, field }, value);
  } catch {
    return NextResponse.json({ error: "sealing_unavailable" }, { status: 503, headers: NO_STORE });
  }

  const updatedAt = new Date().toISOString();
  const admin = createAdminClient();
  const { error } = await admin
    .from("answers")
    .upsert({ enrolment_id: enrolment.id, field, sealed: sealed.sealed, key_id: sealed.keyId, updated_at: updatedAt }, { onConflict: "enrolment_id,field" });
  if (error) return NextResponse.json({ error: "write_failed" }, { status: 500, headers: NO_STORE });

  return NextResponse.json({ updated_at: updatedAt }, { headers: NO_STORE });
}
