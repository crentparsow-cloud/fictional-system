"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/auth";
import { clientIp } from "@/lib/leads";
import { strictLimiterSalt, tenantSigninAllowed } from "@/lib/limits";
import { createAdminClient } from "@/lib/supabase/admin";
import { normaliseEmail, TENANT_CODE_PATTERN, TENANT_CODE_TTL_SECONDS } from "@/lib/tenant-code";
import { checkTenantCode, issueTenantCode } from "@/lib/tenant-code-server";
import { tenantRequest } from "@/lib/tenant-reader";
import { tenantSignInErrorCode } from "@/lib/tenant-sign-in";
import { signInOnTenantHost } from "@/lib/tenant-sign-in-server";
import { getTenantSite } from "@/lib/tenant-site";

/**
 * Sign-in on a tenant host (F-133).
 *
 * The reader asks for a code and types it on this site. The code is Akana's
 * own, made for this tenant and this address (lib/tenant-code.ts). It is not
 * a Supabase code and there is no link: a Supabase code or link is good for
 * the whole account, and the tenant controls this domain. A code typed
 * anywhere but here opens nothing.
 *
 * Once the code checks out, the server makes the session itself and scopes
 * it to this tenant before the browser is given anything, and what the
 * browser is given is an opaque id (lib/tenant-sign-in-server.ts).
 *
 * The rate limits are the Akana site's (F-143): 5 codes an hour per address,
 * 20 an hour per IP. Each code allows five wrong tries. Unlike the Akana
 * site, this path fails closed: a request the limiter cannot count is
 * refused (R2-5). The database also refuses a sixth code within the hour
 * for one tenant and address by itself. The outcome of asking is the same
 * whether or not the address has an account. The email is sent by
 * Akana, names this site and no workbook.
 */
const CODE_COOKIE = "akana_signin_email";
const HOME = "/my-workbooks";

export async function requestTenantCode(formData: FormData): Promise<void> {
  const next = safeNextPath(String(formData.get("next") ?? ""), HOME);
  const back = `/sign-in?next=${encodeURIComponent(next)}`;
  const req = await tenantRequest();
  if (!req || !req.signIn) redirect("/");
  const email = normaliseEmail(formData.get("email"));
  if (!email) redirect(`${back}&error=invalid`);

  const h = await headers();
  if (!(await tenantSigninAllowed(email, clientIp(h), { client: limiterClient(), salt: strictLimiterSalt() }))) redirect(`${back}&error=busy`);

  let outcome: Awaited<ReturnType<typeof issueTenantCode>> = "failed";
  try {
    const site = await getTenantSite();
    if (site && site.id === req.tenantId) outcome = await issueTenantCode({ tenantId: req.tenantId, siteName: site.name, email });
  } catch {
    outcome = "failed";
  }
  if (outcome === "limited") redirect(`${back}&error=busy`);
  if (outcome !== "sent") redirect(`${back}&error=${outcome === "unavailable" ? "unavailable" : "send"}`);
  // Kept for ten minutes so the code can be checked against this address
  // without the address ever being put in a URL. HttpOnly, sent to /sign-in only.
  (await cookies()).set(CODE_COOKIE, email, { httpOnly: true, secure: true, sameSite: "lax", path: "/sign-in", maxAge: TENANT_CODE_TTL_SECONDS });
  redirect(`/sign-in?sent=1&next=${encodeURIComponent(next)}`);
}

export async function verifyTenantCode(formData: FormData): Promise<void> {
  const next = safeNextPath(String(formData.get("next") ?? ""), HOME);
  const sent = `/sign-in?sent=1&next=${encodeURIComponent(next)}`;
  const req = await tenantRequest();
  if (!req || !req.signIn) redirect("/");
  const code = String(formData.get("code") ?? "").replace(/\s+/g, "");
  const jar = await cookies();
  const email = normaliseEmail(jar.get(CODE_COOKIE)?.value);
  if (!email) redirect(`/sign-in?next=${encodeURIComponent(next)}&error=link`);
  if (!TENANT_CODE_PATTERN.test(code)) redirect(`${sent}&error=code`);

  // Guessing is bounded in the database: five wrong tries kill a code, and a new
  // code can only be asked for within the rate limits above.
  if (!(await checkTenantCode({ tenantId: req.tenantId, email, code }))) redirect(`${sent}&error=code`);

  const result = await signInOnTenantHost(email);
  if (!result.ok) {
    console.error("tenant_sign_in_refused", result.reason);
    redirect(`/sign-in?next=${encodeURIComponent(next)}&error=${tenantSignInErrorCode(result.reason)}`);
  }
  jar.delete({ name: CODE_COOKIE, path: "/sign-in" });
  redirect(next);
}

/** The service role client for the counter, or null when it is not configured (the request is then refused). */
function limiterClient() {
  try {
    return createAdminClient();
  } catch {
    return null;
  }
}
