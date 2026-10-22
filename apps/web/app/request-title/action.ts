"use server";

import { headers } from "next/headers";
import { clientIp, leadSalt, processTitleRequest, titleRequestLimiter, type TitleRequestState } from "@/lib/title-request";
import { createUserClient } from "@/lib/supabase/server";

/** The title request form (build list 2.8). The rules live in lib/title-request.ts; this gathers the request and the real effects. */
export async function sendTitleRequest(prev: TitleRequestState, fd: FormData): Promise<TitleRequestState> {
  const h = await headers();
  let salt: string;
  try {
    salt = leadSalt();
  } catch {
    console.error("title_request_salt_missing");
    return { status: "error", attempt: prev.attempt + 1, message: "The request form is not open yet. Please try again soon.", fieldErrors: {}, values: {} };
  }
  return processTitleRequest(prev, fd, {
    ip: clientIp(h),
    salt,
    limiter: titleRequestLimiter,
    submit: async (args) => {
      const supabase = await createUserClient();
      const { data, error } = await supabase.rpc("submit_title_request", args);
      if (error) return { id: null, error: { code: error.code } };
      return { id: typeof data === "string" ? data : null, error: null };
    },
  });
}
