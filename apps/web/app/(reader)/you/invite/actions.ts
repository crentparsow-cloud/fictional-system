"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getReaderSession } from "@/lib/auth";
import { cleanGiftEmail, isGiftSendStatus } from "@/lib/send-workbook";
import { sendGiftEmail } from "@/lib/send-workbook-server";
import { hashInviteToken, newInviteToken } from "@/lib/shared-membership-token";
import { siteOrigin } from "@/lib/site-url";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Send this workbook (14.14). Runs as the signed-in member, so the database
 * checks they are paying and have not used the quarter (migration 0053
 * gift_send). The token is made here and only its hash is stored. If the
 * email cannot be sent the gift is taken back, so the quarter is not lost.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function sendWorkbookGift(formData: FormData): Promise<void> {
  const session = await getReaderSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent("/you/invite")}`);
  const email = cleanGiftEmail(formData.get("email"));
  const workbook = String(formData.get("workbook") ?? "");
  if (!email || !UUID.test(workbook)) redirect("/you/invite?gift=invalid#gift");

  const token = newInviteToken();
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("gift_send", { p_workbook: workbook, p_email: email, p_token_hash: hashInviteToken(token) });
  if (error) {
    console.error("gift_send_failed", error.code ?? "");
    redirect("/you/invite?gift=failed#gift");
  }
  const row = ((data ?? []) as { status: string; gift_id: string | null }[])[0];
  if (!row || !isGiftSendStatus(row.status)) redirect("/you/invite?gift=failed#gift");
  if (row.status !== "sent" || !row.gift_id) redirect(`/you/invite?gift=${row.status}#gift`);

  const expiresAt = new Date(Date.now() + 30 * 86_400_000);
  const sent = await sendGiftEmail({ to: email, token, expiresAt, giftId: row.gift_id }, { origin: siteOrigin() });
  if (sent.status !== "sent" && sent.status !== "sent_test") {
    await supabase.rpc("gift_cancel", { p_gift: row.gift_id });
    redirect("/you/invite?gift=mail_failed#gift");
  }
  revalidatePath("/you/invite");
  redirect("/you/invite?gift=sent#gift");
}

export async function cancelWorkbookGift(formData: FormData): Promise<void> {
  const session = await getReaderSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent("/you/invite")}`);
  const id = String(formData.get("gift") ?? "");
  if (UUID.test(id)) {
    const supabase = await createUserClient();
    await supabase.rpc("gift_cancel", { p_gift: id });
  }
  revalidatePath("/you/invite");
  redirect("/you/invite?gift=cancelled#gift");
}
