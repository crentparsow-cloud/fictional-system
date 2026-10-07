"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isUuid } from "@/lib/admin/leads";
import { payoutStore } from "@/lib/money/db";
import { executePayouts, runPayouts } from "@/lib/money/payout-run";
import { moneyAbilities } from "@/lib/money/permissions";
import { isTestKey } from "@/lib/money/reconcile";
import { getStaffSession } from "@/lib/staff";
import { getStripe } from "@/lib/stripe";
import { createUserClient } from "@/lib/supabase/server";

const PAGE = "/admin/money/payouts";

function codeFor(err: { code?: string }): string {
  if (err.code === "42501") return "denied";
  if (err.code === "55000") return "stale";
  if (err.code === "23514") return "hold_invalid";
  return "failed";
}

/** Hold payouts for an organisation (F-103). public.place_payout_hold audits it. */
export async function placeHold(fd: FormData): Promise<void> {
  const staff = await getStaffSession(PAGE);
  if (!moneyAbilities(staff.roles).holds) redirect(`${PAGE}?notice=denied`);
  const org = fd.get("org");
  const reason = fd.get("reason");
  if (!isUuid(org)) redirect(`${PAGE}?notice=invalid`);
  if (typeof reason !== "string" || reason.trim().length < 3 || reason.trim().length > 500) redirect(`${PAGE}?notice=hold_invalid`);
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("place_payout_hold", { p_org: org, p_reason: reason.trim() });
  if (error) {
    console.error("money_hold_failed", error.code ?? "");
    redirect(`${PAGE}?notice=${codeFor(error)}`);
  }
  revalidatePath(PAGE);
  redirect(`${PAGE}?notice=held`);
}

export async function releaseHold(fd: FormData): Promise<void> {
  const staff = await getStaffSession(PAGE);
  if (!moneyAbilities(staff.roles).holds) redirect(`${PAGE}?notice=denied`);
  const hold = fd.get("hold");
  const note = fd.get("note");
  if (!isUuid(hold)) redirect(`${PAGE}?notice=invalid`);
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("release_payout_hold", { p_hold: hold, p_note: typeof note === "string" ? note.slice(0, 500) : null });
  if (error) {
    console.error("money_release_failed", error.code ?? "");
    redirect(`${PAGE}?notice=${codeFor(error)}`);
  }
  revalidatePath(PAGE);
  redirect(`${PAGE}?notice=${data ? "released" : "stale"}`);
}

/** Approve a payout above the threshold, then pay it (test mode only). */
export async function approvePayout(fd: FormData): Promise<void> {
  const staff = await getStaffSession(PAGE);
  if (!moneyAbilities(staff.roles).approve) redirect(`${PAGE}?notice=denied`);
  const id = fd.get("payout");
  if (!isUuid(id)) redirect(`${PAGE}?notice=invalid`);
  if (!isTestKey(process.env.STRIPE_SECRET_KEY)) redirect(`${PAGE}?notice=run_live_locked`);
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("approve_payout", { p_payout: id });
  if (error) {
    console.error("money_approve_failed", error.code ?? "");
    redirect(`${PAGE}?notice=${codeFor(error)}`);
  }
  const outcome = await executePayouts(payoutStore(supabase), getStripe().transfers, false, id);
  revalidatePath(PAGE);
  redirect(`${PAGE}?notice=${outcome.paid === 1 ? "approved_paid" : "approved_failed"}`);
}

/** Run payouts now, outside the payout day (test mode only). */
export async function runPayoutsNow(): Promise<void> {
  const staff = await getStaffSession(PAGE);
  if (!moneyAbilities(staff.roles).runPayouts) redirect(`${PAGE}?notice=denied`);
  if (!isTestKey(process.env.STRIPE_SECRET_KEY)) redirect(`${PAGE}?notice=run_live_locked`);
  const supabase = await createUserClient();
  try {
    await runPayouts(payoutStore(supabase), getStripe().transfers, false, "staff");
  } catch (err) {
    console.error("money_run_failed", err instanceof Error ? err.message : "");
    redirect(`${PAGE}?notice=failed`);
  }
  revalidatePath(PAGE);
  redirect(`${PAGE}?notice=run_done`);
}
