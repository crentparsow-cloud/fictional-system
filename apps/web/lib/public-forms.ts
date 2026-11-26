/**
 * The database calls behind the three public forms: the enquiry on /publish,
 * the contact form and the notice forms (review finding M4, migration 0074).
 *
 * Each function counts its rate limit on p_ip_hash. While anon could call the
 * functions, a caller could choose that hash, pass the limit, or fill the
 * hourly total and close the form for everyone. From 0074 only the service
 * role may call them, so the hash is always the one the server action made
 * from the request. The action passes the service role client in; nothing
 * here imports it, so this file stays testable and safe to share.
 */
import type { SubmitLead } from "@/lib/leads";
import type { SubmitSupport } from "@/lib/support";
import type { SubmitNotice } from "@/lib/takedown";

export type FormRpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
};
/** Returns the service role client. May throw when the key is not set. */
export type GetFormClient = () => FormRpcClient;

/** The code the forms see when the service role key is missing. They show their calm "try again" message. */
export const FORMS_NOT_CONFIGURED = "forms_not_configured";

async function call(getClient: GetFormClient, fn: string, args: Record<string, unknown>): Promise<{ value: string | null; error: { code?: string; message?: string } | null }> {
  let client: FormRpcClient;
  try {
    client = getClient();
  } catch {
    return { value: null, error: { code: FORMS_NOT_CONFIGURED } };
  }
  const { data, error } = await client.rpc(fn, args);
  if (error) return { value: null, error: { code: error.code, message: error.message } };
  return { value: typeof data === "string" ? data : null, error: null };
}

/** The enquiry form: public.submit_lead. */
export function submitLeadAsServer(getClient: GetFormClient): SubmitLead {
  return async (args) => {
    const { value, error } = await call(getClient, "submit_lead", args);
    return { id: value, error };
  };
}

/**
 * The contact form: public.submit_support_message_as. The service role has no
 * user of its own, so the action passes the id of the signed-in sender it
 * verified, or null for a signed-out visitor.
 */
export function submitSupportAsServer(getClient: GetFormClient, userId: string | null): SubmitSupport {
  return async (args) => {
    const { value, error } = await call(getClient, "submit_support_message_as", { p_user: userId, ...args });
    return { id: value, error: error ? { code: error.code } : null };
  };
}

/** The notice and counter-notice forms: public.submit_takedown_notice. */
export function submitNoticeAsServer(getClient: GetFormClient): SubmitNotice {
  return async (args) => {
    const { value, error } = await call(getClient, "submit_takedown_notice", { ...args });
    return { reference: value, error: error ? { code: error.code } : null };
  };
}
