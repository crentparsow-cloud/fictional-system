"use client";

import { TotpCodeForm, TotpEnrolForm } from "@/components/mfa/TotpForms";
import { startPayeeEnrolment, verifyPayeeCode, type VerifyState } from "./actions";

const INITIAL: VerifyState = { error: null };

/** Set up an authenticator, then confirm it with a code. The shared forms, bound to the payee actions. */
export function PayeeEnrolForm({ next }: { next: string }) {
  return <TotpEnrolForm enrol={startPayeeEnrolment} verify={verifyPayeeCode} next={next} initialCodeState={INITIAL} idPrefix="payee" />;
}

/** Enter a code for the authenticator being set up, or the one already set up. */
export function PayeeCodeForm({ next, factorId, submitLabel = "Verify" }: { next: string; factorId?: string; submitLabel?: string }) {
  return <TotpCodeForm verify={verifyPayeeCode} next={next} factorId={factorId} initialState={INITIAL} submitLabel={submitLabel} idPrefix="payee" />;
}
