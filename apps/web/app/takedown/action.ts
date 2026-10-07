"use server";

import { headers } from "next/headers";
import { clientIp, leadSalt } from "@/lib/leads";
import { createUserClient } from "@/lib/supabase/server";
import { noticeLimiter, processNotice, type NoticeState, type SubmitNotice } from "@/lib/takedown";

/** The public notice and counter-notice forms (F-123). Rules in lib/takedown.ts; this gathers the request. */

const submit: SubmitNotice = async (args) => {
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("submit_takedown_notice", args);
  if (error) return { reference: null, error: { code: error.code } };
  return { reference: typeof data === "string" ? data : null, error: null };
};

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
