/**
 * The contact form at /contact (F-090). Validation, the honeypot and the
 * database call, with effects passed in so it can be tested.
 *
 * One row in public.support_messages through public.submit_support_message
 * (migration 0016), which checks every field again, refuses without consent
 * and rate limits by a salted hash of the address. The IP itself is never
 * stored. No email goes back to the sender: an open form that emails any
 * address it is given can be used to send spam. The page itself says that
 * Akana is not a crisis service and shows Help now.
 */
import { z } from "zod";
import { SUPPORT_TOPICS, type SupportTopic } from "@/lib/admin/support";
import { clientIp, hashWithSalt, isBot, leadSalt } from "@/lib/leads";
import { createRateLimiter, type RateLimiter } from "@/lib/rate-limit";

export { clientIp, leadSalt };

import type { SupportField, SupportState, SupportValues } from "@/lib/support-form";

export type { SupportField, SupportState, SupportValues } from "@/lib/support-form";
export { INITIAL_SUPPORT_STATE } from "@/lib/support-form";

const schema = z.object({
  topic: z.enum(SUPPORT_TOPICS, { errorMap: () => ({ message: "Choose what your message is about" }) }),
  name: z.string().trim().min(1, "Tell us your name").max(200, "Use 200 characters or fewer"),
  email: z
    .string()
    .trim()
    .max(254, "Use 254 characters or fewer")
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Enter an email address like name@example.com"),
  message: z.string().trim().min(1, "Write your message").max(4000, "Use 4,000 characters or fewer"),
  consent: z.literal(true, { errorMap: () => ({ message: "Tick the box so we can store your message and reply" }) }),
});

export type SupportMessage = { topic: SupportTopic; name: string; email: string; message: string; consent: true };

export function supportValues(fd: FormData): SupportValues {
  const s = (k: string) => {
    const v = fd.get(k);
    return typeof v === "string" ? v : undefined;
  };
  return { topic: s("topic"), name: s("name"), email: s("email"), message: s("message"), consent: fd.get("consent") === "yes" };
}

export function parseSupport(values: SupportValues): { ok: true; value: SupportMessage } | { ok: false; fieldErrors: Partial<Record<SupportField, string>> } {
  const r = schema.safeParse(values);
  if (r.success) return { ok: true, value: r.data as SupportMessage };
  const fieldErrors: Partial<Record<SupportField, string>> = {};
  for (const issue of r.error.issues) {
    const k = issue.path[0] as SupportField;
    if (!fieldErrors[k]) fieldErrors[k] = issue.message;
  }
  return { ok: false, fieldErrors };
}

export type SubmitSupport = (args: {
  p_topic: string;
  p_name: string;
  p_email: string;
  p_message: string;
  p_consent: boolean;
  p_ip_hash: string;
}) => Promise<{ id: string | null; error: { code?: string } | null }>;

export type SupportDeps = { submit: SubmitSupport; ip: string; salt: string; limiter?: RateLimiter };

/** One per server instance. The database holds the real limit. */
export const supportLimiter = createRateLimiter({ limit: 5, windowMs: 60 * 60 * 1000 });

const CHECK = "Check the form. Some answers need fixing.";
const RATE_LIMITED = "You have sent several messages in the last hour. Please try again later.";
const FAILED = "Your message was not sent. Please try again in a moment.";

export async function processSupport(prev: SupportState, fd: FormData, deps: SupportDeps): Promise<SupportState> {
  const attempt = prev.attempt + 1;
  // Bots get the same success a person gets, and nothing is stored.
  if (isBot(fd)) return { status: "success", attempt, worried: false };

  const values = supportValues(fd);
  const parsed = parseSupport(values);
  if (!parsed.ok) return { status: "error", attempt, message: CHECK, fieldErrors: parsed.fieldErrors, values };
  const m = parsed.value;

  const ipHash = hashWithSalt(deps.ip, deps.salt);
  if (deps.limiter && !deps.limiter.hit(ipHash)) return { status: "error", attempt, message: RATE_LIMITED, fieldErrors: {}, values };

  const { id, error } = await deps.submit({
    p_topic: m.topic,
    p_name: m.name,
    p_email: m.email,
    p_message: m.message,
    p_consent: true,
    p_ip_hash: ipHash,
  });
  if (error || !id) {
    console.error("support_submit_failed", error?.code ?? "no_id");
    if (error?.code === "AKH29") return { status: "error", attempt, message: RATE_LIMITED, fieldErrors: {}, values };
    if (error?.code === "AKH01" || error?.code === "AKH02") return { status: "error", attempt, message: CHECK, fieldErrors: {}, values };
    return { status: "error", attempt, message: FAILED, fieldErrors: {}, values };
  }
  return { status: "success", attempt, worried: m.topic === "worried" };
}
