"use server";

import { headers } from "next/headers";
import { clientIp, leadSalt, processSupport, supportLimiter, type SupportState } from "@/lib/support";
import { createUserClient } from "@/lib/supabase/server";

/** The contact form (F-090). The rules live in lib/support.ts; this gathers the request and the real effects. */
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
      const supabase = await createUserClient();
      const { data, error } = await supabase.rpc("submit_support_message", args);
      if (error) return { id: null, error: { code: error.code } };
      return { id: typeof data === "string" ? data : null, error: null };
    },
  });
}
