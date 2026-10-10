"use server";

import { redirect } from "next/navigation";
import { getReaderSession } from "@/lib/auth";
import { isAcceptOutcome } from "@/lib/shared-membership";
import { hashInviteToken, isInviteToken } from "@/lib/shared-membership-token";
import { createUserClient } from "@/lib/supabase/server";
import { tenantIdForRequest } from "@/lib/tenant-id";

/**
 * Accept an invitation to a shared membership (item 6.1). Runs as the signed
 * in person, so the database sees their own id (app.seat_accept, migration
 * 0041). The outcome comes back to the invitation page, or to the You page
 * when they have joined.
 */
export async function acceptSharedMembership(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  if (!isInviteToken(token)) redirect("/");
  const back = (outcome: string): never => redirect(`/share/${token}?outcome=${outcome}`);

  const session = await getReaderSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(`/share/${token}`)}`);
  const tenantId = await tenantIdForRequest();
  if (!tenantId) back("unavailable");

  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("seat_accept", { p_token_hash: hashInviteToken(token), p_tenant: tenantId });
  if (error || !isAcceptOutcome(data)) back("unavailable");
  if (data === "joined") redirect("/you?shared=joined#membership");
  back(String(data));
}
