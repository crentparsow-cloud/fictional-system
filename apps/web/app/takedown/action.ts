"use server";

import { headers } from "next/headers";
import { clientIp, leadSalt } from "@/lib/leads";
import { submitNoticeAsServer } from "@/lib/public-forms";
import { createAdminClient } from "@/lib/supabase/admin";
import { noticeLimiter, processNotice, type NoticeState } from "@/lib/takedown";

/**
 * The public notice and counter-notice forms (F-123). Rules in lib/takedown.ts; this gathers the request.
 * The address hash is made here and the row is written with the service role (0074), so a caller cannot
 * choose the hash the rate limit counts.
 */

const submit = submitNoticeAsServer(createAdminClient);

async function run(kind: "notice" | "counter_notice", prev: NoticeState, fd: FormData): Promise<NoticeState> {
  const h = await headers();
  let salt: string;
  try {
    salt = leadSalt();
  } catch {
    console.error("takedown_salt_missing");
    return { status: "error", attempt: prev.attempt + 1, message: "This form is not open yet. Please email us instead.", fieldErrors: {}, values: {} };
  }
  return processNotice(kind, prev, fd, { ip: clientIp(h), salt, limiter: noticeLimiter, submit });
}

export async function sendNotice(prev: NoticeState, fd: FormData): Promise<NoticeState> {
  return run("notice", prev, fd);
}

export async function sendCounterNotice(prev: NoticeState, fd: FormData): Promise<NoticeState> {
  return run("counter_notice", prev, fd);
}
