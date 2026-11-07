"use server";

import { headers } from "next/headers";
import { clientIp, leadSalt, processTitleRequest, titleRequestLimiter, type TitleRequestState } from "@/lib/title-request";
import { getReaderSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { countEvent } from "@/lib/funnel-server";

/**
 * The title request form (build list 2.8). The rules live in lib/title-request.ts; this gathers the request and the real effects.
 * The address hash is made here and recorded by the service role with the signed-in reader, if any (0068), so a caller cannot
 * choose the hash the rate limit counts.
 */
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
      const session = await getReaderSession();
      const { data, error } = await createAdminClient().rpc("submit_title_request_as", { p_user: session?.userId ?? null, ...args });
      if (error) return { id: null, error: { code: error.code } };
      await countEvent("title_requested");
      return { id: typeof data === "string" ? data : null, error: null };
    },
  });
}
