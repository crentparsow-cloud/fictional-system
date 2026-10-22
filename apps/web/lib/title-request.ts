/**
 * Request a title (build list 2.8). The rules for the form at /request-title,
 * with effects passed in so they can be tested.
 *
 * One row in public.title_requests through public.submit_title_request
 * (migration 0056), which checks every field again and limits each address
 * and each signed-in reader. The address is only ever stored as a salted hash.
 * No name and no email are asked for, so there is nothing to reply to. The
 * page says so. Staff read the requests at /admin/requests.
 */
import { z } from "zod";
import { clientIp, hashWithSalt, isBot, leadSalt } from "@/lib/leads";
import { createRateLimiter, type RateLimiter } from "@/lib/rate-limit";
import type { TitleRequestField, TitleRequestState, TitleRequestValues } from "@/lib/title-request-form";

export { clientIp, leadSalt };
export type { TitleRequestField, TitleRequestState, TitleRequestValues } from "@/lib/title-request-form";
export { INITIAL_TITLE_REQUEST_STATE } from "@/lib/title-request-form";

export const TITLE_MAX = 200;
export const AUTHOR_MAX = 200;
export const NOTE_MAX = 1000;

const schema = z.object({
  title: z.string().trim().min(1, "Tell us the title").max(TITLE_MAX, `Use ${TITLE_MAX} characters or fewer`),
  author: z.string().trim().max(AUTHOR_MAX, `Use ${AUTHOR_MAX} characters or fewer`).optional(),
  note: z.string().trim().max(NOTE_MAX, `Use ${NOTE_MAX.toLocaleString("en-GB")} characters or fewer`).optional(),
});

export type TitleRequest = { title: string; author: string | null; note: string | null };

export function titleRequestValues(fd: FormData): TitleRequestValues {
  const s = (k: string) => {
    const v = fd.get(k);
    return typeof v === "string" ? v : undefined;
  };
  return { title: s("title"), author: s("author"), note: s("note") };
}

export function parseTitleRequest(values: TitleRequestValues): { ok: true; value: TitleRequest } | { ok: false; fieldErrors: Partial<Record<TitleRequestField, string>> } {
  const r = schema.safeParse(values);
  if (!r.success) {
    const fieldErrors: Partial<Record<TitleRequestField, string>> = {};
    for (const issue of r.error.issues) {
      const k = issue.path[0] as TitleRequestField;
      if (!fieldErrors[k]) fieldErrors[k] = issue.message;
    }
    return { ok: false, fieldErrors };
  }
  // A title with no letters or digits would be stored with an empty key, which the database refuses.
  if (!/[a-z0-9]/i.test(r.data.title)) return { ok: false, fieldErrors: { title: "Tell us the title" } };
  return { ok: true, value: { title: r.data.title, author: r.data.author || null, note: r.data.note || null } };
}

export type SubmitTitleRequest = (args: { p_title: string; p_author: string | null; p_note: string | null; p_ip_hash: string }) => Promise<{ id: string | null; error: { code?: string } | null }>;
export type TitleRequestDeps = { submit: SubmitTitleRequest; ip: string; salt: string; limiter?: RateLimiter };

/** One per server instance. The database holds the real limit. */
export const titleRequestLimiter = createRateLimiter({ limit: 5, windowMs: 24 * 60 * 60 * 1000 });

const CHECK = "Check the form. Some answers need fixing.";
const RATE_LIMITED = "You have sent several requests today. Please try again tomorrow.";
const FAILED = "Your request was not sent. Please try again in a moment.";

export async function processTitleRequest(prev: TitleRequestState, fd: FormData, deps: TitleRequestDeps): Promise<TitleRequestState> {
  const attempt = prev.attempt + 1;
  // Bots get the same success a person gets, and nothing is stored.
  if (isBot(fd)) return { status: "success", attempt };

  const values = titleRequestValues(fd);
  const parsed = parseTitleRequest(values);
  if (!parsed.ok) return { status: "error", attempt, message: CHECK, fieldErrors: parsed.fieldErrors, values };
  const m = parsed.value;

  const ipHash = hashWithSalt(deps.ip, deps.salt);
  if (deps.limiter && !deps.limiter.hit(ipHash)) return { status: "error", attempt, message: RATE_LIMITED, fieldErrors: {}, values };

  const { id, error } = await deps.submit({ p_title: m.title, p_author: m.author, p_note: m.note, p_ip_hash: ipHash });
  if (error || !id) {
    console.error("title_request_failed", error?.code ?? "no_id");
    if (error?.code === "AKZ29") return { status: "error", attempt, message: RATE_LIMITED, fieldErrors: {}, values };
    if (error?.code === "AKZ01" || error?.code === "AKZ02") return { status: "error", attempt, message: CHECK, fieldErrors: {}, values };
    return { status: "error", attempt, message: FAILED, fieldErrors: {}, values };
  }
  return { status: "success", attempt };
}
