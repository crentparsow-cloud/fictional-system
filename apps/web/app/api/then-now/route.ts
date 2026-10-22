import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { NO_STORE, requireOwnedEnrolment } from "@/lib/enrolment";
import { privateWriteRefusal } from "@/lib/private-writes";
import { MAX_STEP_TITLE } from "@/lib/reading/then-now";
import { createAdminClient } from "@/lib/supabase/admin";
import { newEntryId, sealEntry } from "@/lib/then-now-server";

/**
 * "Then and now" check-ins (3.10, migration 0059).
 *
 *   POST /api/then-now { enrolment, step, title, feeling } -> { id, takenAt }
 *
 * Reading and deleting happen on the You tab, under the reader's own client.
 * Writing follows the answers route: session and enrolment confirmed under
 * RLS, the consent and read only rules applied, the feeling and the step's
 * title sealed, then written with the service role. The feeling is not
 * counted, not sent anywhere and not used for any streak or score.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z
  .object({
    enrolment: z.string().uuid(),
    step: z.string().regex(/^[a-z0-9][a-z0-9_:~.-]{0,79}$/),
    title: z.string().max(MAX_STEP_TITLE).optional(),
    feeling: z.number().int().min(1).max(5),
  })
  .strict();

export async function POST(request: NextRequest) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: NO_STORE });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400, headers: NO_STORE });
  const { enrolment: enrolmentId, step, title = "", feeling } = parsed.data;

  const check = await requireOwnedEnrolment(enrolmentId);
  if (!check.ok) return check.response;
  const refusal = await privateWriteRefusal(check);
  if (refusal) return refusal;
  const { enrolment, tenantId } = check;

  const id = newEntryId();
  let sealed: { sealed: string; keyId: string };
  try {
    sealed = await sealEntry(enrolment.user_id, tenantId, id, { feeling, step: title });
  } catch {
    return NextResponse.json({ error: "sealing_unavailable" }, { status: 503, headers: NO_STORE });
  }
  const takenAt = new Date().toISOString();
  const { error } = await createAdminClient()
    .from("then_now_entries")
    .insert({ id, user_id: enrolment.user_id, enrolment_id: enrolment.id, step_ref: step, sealed: sealed.sealed, key_id: sealed.keyId, taken_at: takenAt });
  if (error) return NextResponse.json({ error: "write_failed" }, { status: 500, headers: NO_STORE });
  return NextResponse.json({ id, takenAt }, { headers: NO_STORE });
}
