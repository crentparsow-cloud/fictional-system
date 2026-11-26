"use server";

import { headers } from "next/headers";
import { clientIp, leadSalt, processSupport, supportLimiter, type SupportState } from "@/lib/support";
import { getReaderSession } from "@/lib/auth";
import { submitSupportAsServer } from "@/lib/public-forms";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The contact form (F-090). The rules live in lib/support.ts; this gathers the request and the real effects.
 * The address hash is made here and the row is written with the service role, with the signed-in sender if
 * there is one (0074), so a caller cannot choose the hash the rate limit counts.
 */
export async function sendSupportMessage(prev: SupportState, fd: FormData): Promise<SupportState> {
  const h = await headers();
  let salt: string;
  try {
    salt = leadSalt();
  } catch {
    console.error("support_salt_missing");
    return { status: "error", attempt: prev.attempt + 1, message: "The contact form is not open yet. Please try again soon.", fieldErrors: {}, values: {} };
  }
  return processSupport(prev, fd, {
    ip: clientIp(h),
    salt,
    limiter: supportLimiter,
    submit: async (args) => {
      const session = await getReaderSession();
      return submitSupportAsServer(createAdminClient, session?.userId ?? null)(args);
    },
  });
}
