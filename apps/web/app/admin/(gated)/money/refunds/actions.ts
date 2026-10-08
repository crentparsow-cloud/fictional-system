"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { moneyAbilities } from "@/lib/money/permissions";
import { parseRefundForm } from "@/lib/money/refund";
import { performRefund } from "@/lib/money/refund-run";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Refund from the console (F-102). Owner and finance staff only. The work is
 * in lib/money/refund-run.ts, shared with the account lookup (F-087): the
 * Stripe refund, the reader's refund_confirmed email for a single workbook
 * (once per refund), the ledger record and the optional reclaim from the
 * last payout.
 */
export async function refundPayment(fd: FormData): Promise<void> {
  const staff = await getStaffSession("/admin/money/refunds");
  if (!moneyAbilities(staff.roles).refund) redirect("/admin/money/refunds?notice=denied");
  const req = parseRefundForm((k) => fd.get(k));
  const q = typeof fd.get("q") === "string" ? String(fd.get("q")).slice(0, 200) : "";
  const back = (notice: string) => `/admin/money/refunds?notice=${notice}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  if (!req) redirect(back("refund_invalid"));

  const supabase = await createUserClient();
  const { notice, refundId } = await performRefund(supabase, staff.userId, req);
  if (refundId) {
    revalidatePath("/admin/money/refunds");
    revalidatePath("/admin/money");
  }
  redirect(back(notice));
}
