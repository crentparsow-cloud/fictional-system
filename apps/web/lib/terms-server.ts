import "server-only";
import { createUserClient } from "@/lib/supabase/server";
import { READER_TERMS_VERSION, type TermsContext, type TermsStatusRow } from "@/lib/terms";

/**
 * Server side of F-122. Both calls run as the signed-in reader through the
 * public wrappers from migration 0018, so the database decides whose row is
 * read or written.
 */

/** The reader's latest accepted reader terms version, or an error flag when it could not be read. */
export async function readerTermsAccepted(): Promise<{ ok: true; accepted: string | null } | { ok: false }> {
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("terms_status", { p_doc: "reader_terms" });
  if (error) {
    console.error("terms_status_failed", error.code);
    return { ok: false };
  }
  const row = (Array.isArray(data) ? data[0] : data) as TermsStatusRow | undefined;
  return { ok: true, accepted: row?.accepted_version ?? null };
}

/** Records acceptance of the reader terms this release shows. Returns false when it did not save. */
export async function acceptReaderTerms(context: TermsContext, tenantId: string | null = null): Promise<boolean> {
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("accept_terms", {
    p_doc: "reader_terms",
    p_version: READER_TERMS_VERSION,
    p_context: context,
    p_tenant: tenantId,
  });
  if (error) {
    console.error("accept_terms_failed", error.code);
    return false;
  }
  return true;
}
