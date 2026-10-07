import "server-only";
import { createUserClient } from "@/lib/supabase/server";
import type { CheckoutConsentKind } from "@/lib/checkout-consent";

/**
 * Server side of the checkout consent (migration 0019). Both calls run as
 * the signed-in reader through the public wrappers, so the database decides
 * whose row is written and linked.
 */

export interface RecordConsentInput {
  kind: CheckoutConsentKind;
  version: string;
  tenantId: string | null;
  /** The workbook for a single purchase. */
  workbookId?: string | null;
  /** The membership price point for a membership: member_month or member_year. */
  plan?: "member_month" | "member_year" | null;
}

/** Records the consent before payment starts. Returns the row id, or null when it did not save. */
export async function recordCheckoutConsent(input: RecordConsentInput): Promise<number | null> {
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("record_checkout_consent", {
    p_kind: input.kind,
    p_version: input.version,
    p_tenant: input.tenantId,
    p_workbook: input.workbookId ?? null,
    p_plan: input.plan ?? null,
  });
  if (error || data === null || data === undefined) {
    console.error("record_checkout_consent_failed", error?.code ?? "no_id");
    return null;
  }
  const id = Number(data);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Links a recorded consent to the Checkout Session it led to. Returns false when it did not save. */
export async function linkCheckoutConsent(id: number, sessionId: string): Promise<boolean> {
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("link_checkout_consent", { p_id: id, p_session: sessionId });
  if (error || data !== true) {
    console.error("link_checkout_consent_failed", error?.code ?? "not_linked");
    return false;
  }
  return true;
}
