"use server";

import { headers } from "next/headers";
import { leadLimiter, leadSalt, clientIp, notifyLead, processEnquiry } from "@/lib/leads";
import { submitLeadAsServer } from "@/lib/public-forms";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EnquiryState } from "./options";
import { ownOrigin } from "@/lib/site-url";

/**
 * The enquiry form on /publish (F-001). Validation, the honeypot, the
 * database call and the email to the Akana team live in lib/leads.ts. This
 * action only gathers the request details and the real effects.
 *
 * The address hash is made here and the row is written with the service role
 * (0074), so a caller cannot choose the hash the rate limit counts.
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
    submit: submitLeadAsServer(createAdminClient),
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

// Review L2: one of this deployment's own configured addresses, never the raw Host header.
function siteOrigin(h: Headers): string {
  return ownOrigin(h);
}
