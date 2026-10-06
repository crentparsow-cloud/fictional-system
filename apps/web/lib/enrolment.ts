import "server-only";
import { NextResponse } from "next/server";
import { getReaderSession, type ReaderSession } from "@/lib/auth";
import { createUserClient } from "@/lib/supabase/server";
import { tenantIdForRequest } from "@/lib/tenant-id";

/**
 * The checks every answers and progress route runs before it does anything:
 * a signed-in reader, a tenant we know, and an enrolment the reader can see
 * through their own client. RLS on public.enrolments only returns the
 * reader's own rows, so "visible" means "owned".
 */
export interface OwnedEnrolment {
  id: string;
  user_id: string;
  tenant_id: string;
  workbook_id: string;
  version_id: string;
}

export type EnrolmentCheck =
  | { ok: true; session: ReaderSession; tenantId: string; enrolment: OwnedEnrolment; supabase: Awaited<ReturnType<typeof createUserClient>> }
  | { ok: false; response: NextResponse };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function requireOwnedEnrolment(enrolmentId: string | null | undefined): Promise<EnrolmentCheck> {
  const session = await getReaderSession();
  if (!session) return { ok: false, response: NextResponse.json({ error: "sign_in_required" }, { status: 401 }) };

  const tenantId = await tenantIdForRequest();
  if (!tenantId) return { ok: false, response: NextResponse.json({ error: "unknown_tenant" }, { status: 404 }) };

  if (!enrolmentId || !UUID.test(enrolmentId)) {
    return { ok: false, response: NextResponse.json({ error: "enrolment_required" }, { status: 400 }) };
  }

  const supabase = await createUserClient();
  const { data, error } = await supabase
    .from("enrolments")
    .select("id, user_id, tenant_id, workbook_id, version_id")
    .eq("id", enrolmentId)
    .maybeSingle();
  if (error) return { ok: false, response: NextResponse.json({ error: "enrolment_lookup_failed" }, { status: 500 }) };
  if (!data) return { ok: false, response: NextResponse.json({ error: "not_found" }, { status: 404 }) };

  const enrolment = data as OwnedEnrolment;
  // RLS already restricts the row to its owner; this is belt and braces.
  if (enrolment.user_id !== session.userId) return { ok: false, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  // An enrolment belongs to one tenant. A request from another tenant's host
  // may not read or write it, even for the same account.
  if (enrolment.tenant_id !== tenantId) return { ok: false, response: NextResponse.json({ error: "wrong_tenant" }, { status: 403 }) };

  return { ok: true, session, tenantId, enrolment, supabase };
}

export const NO_STORE = { "Cache-Control": "no-store" } as const;
