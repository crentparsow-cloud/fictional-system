"use server";

import { headers } from "next/headers";
import { leadLimiter, leadSalt, clientIp, notifyLead, processEnquiry, submitLeadWith } from "@/lib/leads";
import { createUserClient } from "@/lib/supabase/server";
import type { EnquiryState } from "./options";

/**
 * The enquiry form on /publish (F-001). Validation, the honeypot, the
 * database call and the email to the Akana team live in lib/leads.ts. This
 * action only gathers the request details and the real effects.
 */
export async function submitEnquiry(prev: EnquiryState, formData: FormData): Promise<EnquiryState> {
  const h = await headers();
  const origin = siteOrigin(h);
  // Production refuses to hash without LEAD_HASH_SALT. Until Crent sets it, the
  // form says so calmly instead of showing an error page.
  let salt: string;
  try {
    salt = leadSalt();
  } catch {
    console.error("lead_salt_missing");
    return {
      status: "error",
      attempt: prev.attempt + 1,
      message: "The enquiry form is not open yet. Please try again soon.",
      fieldErrors: {},
      values: {},
    };
  }
  return processEnquiry(prev, formData, {
    ip: clientIp(h),
    userAgent: h.get("user-agent") ?? "",
    salt,
    limiter: leadLimiter,
    submit: async (args) => submitLeadWith(await createUserClient())(args),
    notify: (lead) =>
      notifyLead(lead, {
        origin,
        env: {
          LEADS_NOTIFY_TO: process.env.LEADS_NOTIFY_TO,
          RESEND_API_KEY: process.env.RESEND_API_KEY,
          EMAIL_FROM: process.env.EMAIL_FROM,
          EMAIL_REPLY_TO: process.env.EMAIL_REPLY_TO,
          EMAIL_MODE: process.env.EMAIL_MODE,
          TEST_RECIPIENT: process.env.TEST_RECIPIENT,
          POSTAL_ADDRESS: process.env.POSTAL_ADDRESS,
        },
      }),
  });
}

/** The origin for the link in the email. The host has already passed tenant resolution in the proxy. */
function siteOrigin(h: Headers): string {
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto}://${host}`;
}
