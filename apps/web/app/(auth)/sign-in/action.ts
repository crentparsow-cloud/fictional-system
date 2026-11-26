"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/auth";
import { clientIp } from "@/lib/leads";
import { signinDecision, signinSalt } from "@/lib/limits";
import { ownOrigin } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Magic link sign-in (F-132). Google follows once the OAuth client exists.
 *
 * Rate limits (F-143, migration 0027): 5 links an hour per address and 20
 * an hour per IP, counted in the database by salted hash, with an in-memory
 * counter in front. Supabase Auth's own email limits still apply behind
 * this. A limited request gets the same "wait a few minutes" answer whether
 * or not the address has an account. If the count cannot be read or written
 * the request is refused too, with "try again in a few minutes" (M5).
 *
 * The outcome is the same whether or not the address has an account, so
 * nobody can use this form to find out who is a reader.
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_COOKIE = "akana_signin_email";
const CODE_COOKIE_SECONDS = 600;

export async function requestMagicLink(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const next = safeNextPath(String(formData.get("next") ?? ""));
  const back = `/sign-in?next=${encodeURIComponent(next)}`;
  if (!EMAIL.test(email) || email.length > 254) redirect(`${back}&error=invalid`);

  const h = await headers();
  // Review M5: when the count cannot be kept, no link is sent (fail closed).
  const limit = await signinDecision(email, clientIp(h), { client: limiterClient(), salt: signinSalt() });
  if (limit !== "allowed") redirect(`${back}&error=${limit === "limited" ? "busy" : "later"}`);

  // Review L2: the link in the email is built from one of this deployment's own
  // configured addresses, never from the raw Host header (lib/site-url.ts).
  const origin = ownOrigin(h);
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
  // 13.18: kept for ten minutes so the code from the email can be checked against this address
  // without the address ever being put in a URL. HttpOnly, and only sent to /sign-in.
  (await cookies()).set(CODE_COOKIE, email, { httpOnly: true, secure: origin.startsWith("https:"), sameSite: "lax", path: "/sign-in", maxAge: CODE_COOKIE_SECONDS });
  redirect(`/sign-in?sent=1&next=${encodeURIComponent(next)}`);
}

/**
 * Sign in with the code from the same email (13.18). A magic link
 * opens in the browser, not in an installed home screen app, and on an
 * iPhone the two do not share a session, so a reader in the app would be
 * signed in in the wrong place. The code is typed into the app instead and
 * the session is written there. Supabase checks the code (verifyOtp), counts
 * wrong tries and expires it. The address comes from the cookie the request
 * set, never from the form.
 */
export async function verifyEmailCode(formData: FormData): Promise<void> {
  const next = safeNextPath(String(formData.get("next") ?? ""));
  const sent = `/sign-in?sent=1&next=${encodeURIComponent(next)}`;
  const token = String(formData.get("code") ?? "").replace(/\s+/g, "");
  const email = (await cookies()).get(CODE_COOKIE)?.value;
  if (!email) redirect(`/sign-in?next=${encodeURIComponent(next)}&error=link`);
  if (!/^\d{6,10}$/.test(token)) redirect(`${sent}&error=code`);

  const supabase = await createUserClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) redirect(`${sent}&error=code`);
  (await cookies()).delete({ name: CODE_COOKIE, path: "/sign-in" });
  redirect(next);
}

/** The service role client for the counter, or null when it is not configured. In production that means no count, so no link. */
function limiterClient() {
  try {
    return createAdminClient();
  } catch {
    return null;
  }
}
