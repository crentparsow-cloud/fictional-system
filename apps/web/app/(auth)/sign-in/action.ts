"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/auth";
import { clientIp } from "@/lib/leads";
import { limiterSalt, signinAllowed } from "@/lib/limits";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Magic link sign-in (F-132). Google follows once the OAuth client exists.
 *
 * Rate limits (F-143, migration 0027): 5 links an hour per address and 20
 * an hour per IP, counted in the database by salted hash, with an in-memory
 * counter in front. Supabase Auth's own email limits still apply behind
 * this. A limited request gets the same "wait a few minutes" answer whether
 * or not the address has an account.
 *
 * The outcome is the same whether or not the address has an account, so
 * nobody can use this form to find out who is a reader.
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function requestMagicLink(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const next = safeNextPath(String(formData.get("next") ?? ""));
  const back = `/sign-in?next=${encodeURIComponent(next)}`;
  if (!EMAIL.test(email) || email.length > 254) redirect(`${back}&error=invalid`);

  const h = await headers();
  if (!(await signinAllowed(email, clientIp(h), { client: limiterClient(), salt: limiterSalt() }))) redirect(`${back}&error=busy`);

  const origin = await siteOrigin();
  const supabase = await createUserClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      shouldCreateUser: true,
    },
  });
  if (error) {
    console.error("sign_in_otp_failed", error.status ?? "", error.name);
    redirect(`${back}&error=send`);
  }
  redirect(`/sign-in?sent=1&next=${encodeURIComponent(next)}`);
}

/** The service role client for the counter, or null when it is not configured (the memory limit still holds). */
function limiterClient() {
  try {
    return createAdminClient();
  } catch {
    return null;
  }
}

/** The origin for the callback URL. The host has already passed tenant resolution in the proxy. */
async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto}://${host}`;
}
