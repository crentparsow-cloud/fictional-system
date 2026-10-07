"use server";

import { dashAbilities, lookupErrorMessage, parseLookupInput, readLookup, type LookupResult } from "@/lib/account-lookup";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";

export type LookupState =
  | { status: "idle"; attempt: number }
  | { status: "error"; attempt: number; message: string; field?: "email" | "reason"; email: string; reason: string }
  | { status: "done"; attempt: number; result: LookupResult; email: string; reason: string };

/**
 * Account lookup (F-087). A POST through a server action, so the email
 * address never sits in a URL, a browser history or a server log line.
 * public.staff_lookup_account (migration 0022) checks the role and the
 * reason, writes the audit row and returns no answers.
 */
export async function lookupAccount(prev: LookupState, fd: FormData): Promise<LookupState> {
  const attempt = prev.attempt + 1;
  const staff = await getStaffSession("/admin/lookup");
  const emailRaw = typeof fd.get("email") === "string" ? String(fd.get("email")) : "";
  const reasonRaw = typeof fd.get("reason") === "string" ? String(fd.get("reason")) : "";
  if (!dashAbilities(staff.roles).lookupAccounts) {
    return { status: "error", attempt, message: lookupErrorMessage("AKD01"), email: "", reason: "" };
  }
  const input = parseLookupInput(emailRaw, reasonRaw);
  if (!input.ok) return { status: "error", attempt, message: input.message, field: input.field, email: emailRaw.slice(0, 254), reason: reasonRaw.slice(0, 500) };

  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("staff_lookup_account", { p_email: input.email, p_reason: input.reason });
  if (error) {
    console.error("admin_lookup_failed", error.code ?? "");
    return { status: "error", attempt, message: lookupErrorMessage(error.code), email: input.email, reason: input.reason };
  }
  return { status: "done", attempt, result: readLookup(data), email: input.email, reason: input.reason };
}
