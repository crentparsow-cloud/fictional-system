import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { FIELD_PATTERN } from "@/lib/answer-fields";
import { MAX_ANSWER_BYTES, seal, unseal } from "@/lib/answers";
import { answerWriteDecision } from "@/lib/consent";
import { NO_STORE, requireOwnedEnrolment } from "@/lib/enrolment";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Reader answers, sealed (F-134).
 *
 *   GET /api/answers?enrolment=<id>  -> { answers: { [field]: value } }
 *   PUT /api/answers { enrolment, field, value } -> { updated_at }
 *       403 { error: "consent_required", message } for a wellbeing
 *       workbook when the reader has no health data consent (F-026)
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

  // Health data consent (F-026). A wellbeing workbook takes no new answers
  // while the reader has no consent in place, for example after withdrawal.
  // Both reads go through the reader's own client; a tier that cannot be
  // read fails closed.
  const [{ data: wbTier }, { data: profile }] = await Promise.all([
    check.supabase.from("workbooks").select("safety_tier").eq("id", enrolment.workbook_id).maybeSingle(),
    check.supabase.from("profiles").select("health_consent_at").eq("user_id", enrolment.user_id).maybeSingle(),
  ]);
  const decision = answerWriteDecision((wbTier?.safety_tier as string | null | undefined) ?? null, {
    consentAt: (profile?.health_consent_at as string | null | undefined) ?? null,
  });
  if (!decision.ok) {
    return NextResponse.json({ error: decision.error, message: decision.message }, { status: decision.status, headers: NO_STORE });
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
