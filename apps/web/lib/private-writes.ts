import "server-only";
import { NextResponse } from "next/server";
import { readerDeletion } from "@/lib/account-server";
import { answerWriteDecision, faithAnswerWriteDecision } from "@/lib/consent";
import { NO_STORE, type EnrolmentCheck } from "@/lib/enrolment";

/**
 * The same gate the answers route applies, for the other private things a
 * reader writes in a workbook: notes (0058) and "Then and now" taps (0059).
 * A pending account deletion makes the work read only (F-025). A wellbeing
 * workbook takes nothing new without health consent (F-026), nor a faith
 * workbook without faith consent (F-150). Returns the refusal, or null.
 */
export async function privateWriteRefusal(check: Extract<EnrolmentCheck, { ok: true }>): Promise<NextResponse | null> {
  const { enrolment, supabase } = check;
  const deletion = await readerDeletion(supabase, enrolment.user_id);
  if (deletion.readOnly) {
    return NextResponse.json({ error: "read_only", message: "Your account is read only while its deletion is pending." }, { status: 403, headers: NO_STORE });
  }
  const [{ data: wbTier }, { data: profile }] = await Promise.all([
    supabase.from("workbooks").select("safety_tier, genre_id, themes(shelf_id)").eq("id", enrolment.workbook_id).maybeSingle(),
    supabase
      .from("profiles")
      .select("health_consent_at, health_consent_version, faith_consent_at, faith_consent_version")
      .eq("user_id", enrolment.user_id)
      .maybeSingle(),
  ]);
  const wb = wbTier as unknown as { safety_tier: string | null; genre_id: string | null; themes: { shelf_id: string | null } | null } | null;
  const health = answerWriteDecision(wb?.safety_tier ?? null, {
    consentAt: (profile?.health_consent_at as string | null | undefined) ?? null,
    consentVersion: (profile?.health_consent_version as string | null | undefined) ?? null,
  });
  if (!health.ok) return NextResponse.json({ error: health.error, message: health.message }, { status: health.status, headers: NO_STORE });
  const faith = faithAnswerWriteDecision(
    { shelfId: wb?.themes?.shelf_id ?? null, genreId: wb?.genre_id ?? null },
    {
      consentAt: (profile?.faith_consent_at as string | null | undefined) ?? null,
      consentVersion: (profile?.faith_consent_version as string | null | undefined) ?? null,
    },
  );
  if (!faith.ok) return NextResponse.json({ error: faith.error, message: faith.message }, { status: faith.status, headers: NO_STORE });
  return null;
}
