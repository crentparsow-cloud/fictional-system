"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { clientIp, hashWithSalt, leadSalt } from "@/lib/leads";
import { isNewsletterToken, signupReadiness } from "@/lib/newsletter";
import { INITIAL_SIGNUP_STATE, processSignup, type SignupState } from "@/lib/newsletter-signup";
import { sendConfirmation } from "@/lib/newsletter-server";
import { createRateLimiter } from "@/lib/rate-limit";
import { siteOrigin } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Newsletter actions (6.11). Sign-up stores a pending address through the
 * service role and sends the confirmation; confirming and unsubscribing each
 * need a button press on a page, never a plain link visit, because mail
 * scanners open links. Nothing here logs an address or a token.
 */
const limiter = createRateLimiter({ limit: 5, windowMs: 60 * 60 * 1000 });

export async function subscribeNewsletter(prev: SignupState, fd: FormData): Promise<SignupState> {
  const readiness = signupReadiness();
  if (!readiness.ok) return processSignup(prev ?? INITIAL_SIGNUP_STATE, fd, { readiness, ipHash: "", subscribe: async () => ({ token: null, code: "closed" }), sendConfirmation: async () => false });

  let salt: string;
  let admin: ReturnType<typeof createAdminClient>;
  try {
    salt = leadSalt();
    admin = createAdminClient();
  } catch {
    console.error("newsletter_not_configured");
    return { status: "error", attempt: (prev?.attempt ?? 0) + 1, message: "The newsletter is not open yet. Please try again soon.", email: "" };
  }
  const h = await headers();
  const ipHash = hashWithSalt(clientIp(h), salt);
  return processSignup(prev ?? INITIAL_SIGNUP_STATE, fd, {
    readiness,
    ipHash,
    limiter,
    async subscribe(email, hash) {
      const { data, error } = await admin.rpc("newsletter_subscribe", { p_email: email, p_ip_hash: hash });
      if (error) {
        console.error("newsletter_subscribe_failed", error.code ?? "unknown");
        return { token: null, code: error.code ?? "unknown" };
      }
      return { token: isNewsletterToken(data) ? data : null, code: null };
    },
    async sendConfirmation(email, token) {
      const result = await sendConfirmation(admin, email, token, siteOrigin());
      return result.status === "sent" || result.status === "sent_test";
    },
  });
}

async function withToken(fd: FormData, rpc: "newsletter_confirm" | "newsletter_unsubscribe"): Promise<boolean> {
  const token = fd.get("t");
  if (!isNewsletterToken(token)) return false;
  try {
    const { data, error } = await createAdminClient().rpc(rpc, { p_token: token });
    if (error) {
      console.error(`${rpc}_failed`, error.code ?? "unknown");
      return false;
    }
    return data === true;
  } catch {
    console.error(`${rpc}_not_configured`);
    return false;
  }
}

export async function confirmNewsletter(fd: FormData): Promise<void> {
  redirect(`/newsletter/confirm?done=${(await withToken(fd, "newsletter_confirm")) ? "ok" : "unknown"}`);
}

export async function unsubscribeNewsletter(fd: FormData): Promise<void> {
  redirect(`/newsletter/unsubscribe?done=${(await withToken(fd, "newsletter_unsubscribe")) ? "ok" : "unknown"}`);
}
