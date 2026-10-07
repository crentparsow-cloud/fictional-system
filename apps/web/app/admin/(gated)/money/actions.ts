"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isUuid } from "@/lib/admin/leads";
import { parseConfigForm } from "@/lib/money/config-form";
import { moneyAbilities } from "@/lib/money/permissions";
import { isTestKey } from "@/lib/money/reconcile";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";

/** The error code to show for a failed money RPC. */
function codeFor(err: { code?: string }): string {
  if (err.code === "42501") return "denied";
  if (err.code === "55000") return "stale";
  if (err.code === "23514") return "invalid";
  return "failed";
}

/** New royalty figures (owner only). public.set_royalty_config writes the audit row. */
export async function saveRoyaltyConfig(fd: FormData): Promise<void> {
  const staff = await getStaffSession("/admin/money");
  if (!moneyAbilities(staff.roles).setConfig) redirect("/admin/money?notice=denied");
  const input = parseConfigForm((k) => fd.get(k));
  if (!input) redirect("/admin/money?notice=config_invalid");
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("set_royalty_config", input);
  if (error) {
    console.error("money_config_failed", error.code ?? "");
    redirect(`/admin/money?notice=${error.code === "23514" ? "config_invalid" : codeFor(error)}`);
  }
  revalidatePath("/admin/money");
  redirect("/admin/money?notice=config_saved");
}

/** Close every due pool month and statement month now, as the daily job would. */
export async function closeDueMonths(fd: FormData): Promise<void> {
  const back = fd.get("back") === "statements" ? "/admin/money/statements" : "/admin/money";
  const staff = await getStaffSession(back);
  if (!moneyAbilities(staff.roles).runPayouts) redirect(`${back}?notice=denied`);
  const livemode = !isTestKey(process.env.STRIPE_SECRET_KEY);
  const supabase = await createUserClient();
  const pools = await supabase.rpc("close_due_pools", { p_livemode: livemode });
  if (pools.error) {
    console.error("money_close_pools_failed", pools.error.code ?? "");
    redirect(`${back}?notice=${codeFor(pools.error)}`);
  }
  const statements = await supabase.rpc("close_due_statements", { p_livemode: livemode });
  if (statements.error) {
    console.error("money_close_statements_failed", statements.error.code ?? "");
    redirect(`${back}?notice=${codeFor(statements.error)}`);
  }
  revalidatePath(back);
  redirect(`${back}?notice=months_closed`);
}

/** Mark a reconciliation item resolved, with what was found. */
export async function resolveReconciliationItem(fd: FormData): Promise<void> {
  const staff = await getStaffSession("/admin/money");
  if (!moneyAbilities(staff.roles).read) redirect("/admin/money?notice=denied");
  const id = fd.get("item");
  const note = fd.get("resolution");
  if (!isUuid(id) || typeof note !== "string" || note.trim().length < 3 || note.length > 500) redirect("/admin/money?notice=invalid");
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("resolve_reconciliation_item", { p_item: id, p_resolution: note.trim() });
  if (error) {
    console.error("money_resolve_failed", error.code ?? "");
    redirect(`/admin/money?notice=${codeFor(error)}`);
  }
  revalidatePath("/admin/money");
  redirect("/admin/money?notice=resolved");
}
