import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatMinor } from "@/lib/membership-email";
import { hasLiveMembership, type SubscriptionRow } from "@/lib/membership";
import { loadMembershipMinor, GIFT_CURRENCY } from "@/lib/gift-server";
import { discountedMinor, studentPercentFrom, studentStatus, type StudentRow, type StudentStatus } from "@/lib/student";

export interface StudentPlanLine {
  plan: "monthly" | "yearly";
  label: string;
  full: string;
  student: string;
}

export interface StudentPageData {
  status: StudentStatus;
  percent: number;
  plans: StudentPlanLine[];
  alreadyMember: boolean;
}

/** What /you/student shows, read under the reader's own row level security. */
export async function loadStudentPage(supabase: SupabaseClient, userId: string, tenantId: string | null, now = new Date()): Promise<StudentPageData> {
  const [{ data: sv }, { data: cfg }, { monthlyMinor, yearlyMinor }, { data: subs }] = await Promise.all([
    supabase.from("student_verifications").select("verified_at, expires_at").eq("user_id", userId).maybeSingle(),
    supabase.from("app_config").select("key, value").eq("key", "student_discount_percent"),
    loadMembershipMinor(supabase),
    tenantId
      ? supabase.from("subscriptions").select("status, plan, current_period_end, cancel_at_period_end, ended_at, stripe_customer_id, updated_at").eq("user_id", userId).eq("tenant_id", tenantId)
      : Promise.resolve({ data: [] }),
  ]);
  const percent = studentPercentFrom((cfg ?? []) as { key: string; value: unknown }[]);
  const plans: StudentPlanLine[] = [];
  const line = (plan: "monthly" | "yearly", label: string, minor: number | null) => {
    const full = minor ? formatMinor(minor, GIFT_CURRENCY) : undefined;
    const student = minor ? formatMinor(discountedMinor(minor, percent), GIFT_CURRENCY) : undefined;
    if (full && student) plans.push({ plan, label, full, student });
  };
  line("monthly", "Monthly, a month", monthlyMinor);
  line("yearly", "Annual, a year", yearlyMinor);
  return {
    status: studentStatus(sv as StudentRow | null, now),
    percent,
    plans,
    alreadyMember: hasLiveMembership((subs ?? []) as SubscriptionRow[]),
  };
}
