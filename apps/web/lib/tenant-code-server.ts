import "server-only";
import { createMailer, type MailerEnv, type Transport } from "@akana/emails";
import { withEmailOps } from "@/lib/mail-ops";
import { mailerEnvFromProcess } from "@/lib/partner-mail";
import { createAdminClient } from "@/lib/supabase/admin";
import { newTenantCode, normaliseEmail, TENANT_CODE_PATTERN, TENANT_CODE_TTL_SECONDS, tenantCodeHash, tenantCodeKey } from "@/lib/tenant-code";

/**
 * Issuing and checking the tenant sign-in code (F-133). The rules are in
 * lib/tenant-code.ts and in the database functions.
 *
 * Issuing never looks at whether the address has an account. A code is
 * stored and an email is sent either way, so the answer is the same for
 * every address and the form cannot be used to find out who is a reader.
 * The account is found or made only after the code has checked out
 * (lib/tenant-sign-in-server.ts).
 *
 * The email goes through the house mailer: Resend when configured, the dev
 * transport otherwise, and to TEST_RECIPIENT unless EMAIL_MODE is "live".
 * It names the tenant's site and carries no link and no workbook title.
 */
type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string } | null }>;

export interface TenantCodeDeps {
  rpc?: Rpc;
  env?: Record<string, string | undefined>;
  mailerEnv?: MailerEnv;
  transport?: Transport;
  newCode?: () => string;
}

function rpcFromAdmin(): Rpc {
  const admin = createAdminClient();
  return (fn, args) => admin.rpc(fn, args);
}

/** "limited": the database refused a sixth code within the hour for this tenant and address (R2-5). Nothing was stored or sent. */
export type IssueResult = "sent" | "limited" | "unavailable" | "failed";

export async function issueTenantCode(input: { tenantId: string; siteName: string; email: string }, deps: TenantCodeDeps = {}): Promise<IssueResult> {
  const key = tenantCodeKey(deps.env);
  const email = normaliseEmail(input.email);
  if (!key || !email) return "unavailable";
  const code = (deps.newCode ?? newTenantCode)();
  let rpc: Rpc;
  try {
    rpc = deps.rpc ?? rpcFromAdmin();
  } catch {
    return "unavailable";
  }
  const { data, error } = await rpc("issue_tenant_sign_in_code", {
    p_tenant: input.tenantId,
    p_email: email,
    p_code_hash: tenantCodeHash(key, input.tenantId, email, code),
    p_ttl_seconds: TENANT_CODE_TTL_SECONDS,
  });
  // False is the database's own limit: five codes an hour for one tenant and
  // address, whatever the limiter in front of this call did. The answer does
  // not depend on whether the address has an account, here or there.
  if (!error && data === false) return "limited";
  if (error || data !== true) {
    console.error("tenant_code_issue_failed", error?.code ?? "");
    // AKS02: sign-in is off for this tenant.
    return error?.code === "AKS02" ? "unavailable" : "failed";
  }
  const mailerEnv = deps.mailerEnv ?? mailerEnvFromProcess();
  const mailer = createMailer({
    env: mailerEnv,
    isSuppressed: () => false,
    // The log line carries the status only. The mailer's entry holds a hash of the address.
    log: withEmailOps("tenant_sign_in", (e) => console.info("tenant_code_mail", e.status, e.reason ?? "")),
    ...(deps.transport ? { transport: deps.transport } : {}),
  });
  const sent = await mailer.sendTenantCode(
    { siteName: input.siteName, code, minutes: Math.round(TENANT_CODE_TTL_SECONDS / 60), supportEmail: mailerEnv.EMAIL_REPLY_TO ?? "" },
    { to: email },
  );
  return sent.status === "sent" || sent.status === "sent_test" ? "sent" : "failed";
}

/** True once, for the right code, in time, for this tenant and address. False for everything else. */
export async function checkTenantCode(input: { tenantId: string; email: string; code: string }, deps: TenantCodeDeps = {}): Promise<boolean> {
  const key = tenantCodeKey(deps.env);
  const email = normaliseEmail(input.email);
  if (!key || !email || !TENANT_CODE_PATTERN.test(input.code)) return false;
  try {
    const rpc = deps.rpc ?? rpcFromAdmin();
    const { data, error } = await rpc("check_tenant_sign_in_code", {
      p_tenant: input.tenantId,
      p_email: email,
      p_code_hash: tenantCodeHash(key, input.tenantId, email, input.code),
    });
    return !error && data === true;
  } catch {
    return false;
  }
}
