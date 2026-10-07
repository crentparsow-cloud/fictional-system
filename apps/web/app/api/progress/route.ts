import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { NO_STORE, requireOwnedEnrolment } from "@/lib/enrolment";
import { originFrom } from "@/lib/partner";
import { sendStageUpdate } from "@/lib/partner-flow";
import { createPartnerMail, mailerEnvFromProcess } from "@/lib/partner-mail";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Progress events (F-020): ids and timestamps only, never an answer or a
 * feeling. POST /api/progress { enrolment, kind, ref? } -> { ok }
 *
 * ref by kind: unit_opened and checkin_done carry the unit number,
 * step_done the exercise id, daily_check_done nothing (ref is stored null,
 * so no date or score is ever written there). The pattern matches the 0003
 * check on progress_events.ref.
 *
 * The insert goes through the reader's own client, so RLS checks ownership
 * a second time and the row is refused if the enrolment is not theirs. No
 * admin client here; there is nothing to seal. Nothing in this table is ever
 * turned into a streak or a missed-day count (F-018).
 *
 * Check-in partner (F-030): after a step_done or checkin_done is stored,
 * and once the response has gone, public.partner_stage_update decides
 * whether the reader has reached a new stage and whether their partner
 * should hear about it (accepted partner, share level, the wellbeing choice,
 * one a week). The stage is worked out in the database from the pinned
 * version and the stored events, never from anything the client claims. The
 * email carries the stage as a number only. Best effort: a failure here
 * never fails the progress write.
 */
export const dynamic = "force-dynamic";

const Body = z
  .object({
    enrolment: z.string().uuid(),
    kind: z.enum(["unit_opened", "step_done", "checkin_done", "daily_check_done", "toolkit_used", "finished"]),
    ref: z
      .string()
      .regex(/^[a-z0-9][a-z0-9_:~.-]{0,79}$/)
      .optional(),
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

  const check = await requireOwnedEnrolment(parsed.data.enrolment);
  if (!check.ok) return check.response;

  const { error } = await check.supabase
    .from("progress_events")
    .insert({ enrolment_id: check.enrolment.id, kind: parsed.data.kind, ref: parsed.data.ref ?? null });
  if (error) return NextResponse.json({ error: "write_failed" }, { status: 500, headers: NO_STORE });

  if (parsed.data.kind === "step_done" || parsed.data.kind === "checkin_done") {
    const enrolmentId = check.enrolment.id;
    const origin = originFrom(request.headers);
    after(async () => {
      try {
        const admin = createAdminClient();
        const mail = createPartnerMail({ env: mailerEnvFromProcess(), origin });
        await sendStageUpdate(enrolmentId, { rpc: (fn, args) => admin.rpc(fn, args), mail });
      } catch (e) {
        console.error("partner_after_progress", e instanceof Error ? e.name : "unknown");
      }
    });
  }

  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
