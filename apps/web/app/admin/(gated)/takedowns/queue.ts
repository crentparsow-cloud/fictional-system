import "server-only";
import { createUserClient } from "@/lib/supabase/server";

/** One row of public.takedown_queue (migration 0022). */
export interface QueueRow {
  id: string;
  reference: string;
  kind: string;
  parent_reference: string | null;
  basis: string;
  status: string;
  name: string;
  email: string;
  address: string;
  phone: string | null;
  relationship: string;
  acting_for: string | null;
  work: string | null;
  location: string;
  explanation: string;
  signature: string;
  created_at: string;
  decided_at: string | null;
  decision_reason: string | null;
  workbook_id: string | null;
  workbook_code: string | null;
  workbook_title: string | null;
  workbook_status: string | null;
  org_id: string | null;
  org_name: string | null;
  takedown_id: string | null;
  takedown_active: boolean;
  buyers_keep_access: boolean | null;
  statement_of_reasons: string | null;
  org_takedowns_12m: number;
  repeat_infringer: boolean;
}

export async function readQueue(): Promise<{ rows: QueueRow[]; error: string | null }> {
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("takedown_queue");
  if (error) {
    console.error("admin_takedown_queue_failed", error.code ?? "");
    return { rows: [], error: error.code ?? "failed" };
  }
  return { rows: (data ?? []) as QueueRow[], error: null };
}
