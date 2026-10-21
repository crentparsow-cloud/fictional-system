import { cleanEmail, signupReadiness, type Readiness } from "@/lib/newsletter";
import type { RateLimiter } from "@/lib/rate-limit";

/**
 * The newsletter sign-up form (6.11), with its effects passed in so the rules
 * are tested. Double opt-in: the form only stores a pending address and sends
 * the confirmation. The words shown are the same whether the address is new,
 * pending or already confirmed, so the form never reveals who is on the list.
 */

export const NEWSLETTER_HONEYPOT = "company_site";

export type SignupState =
  | { status: "idle"; attempt: number }
  | { status: "done"; attempt: number; message: string }
  | { status: "error"; attempt: number; message: string; email: string };

export const INITIAL_SIGNUP_STATE: SignupState = { status: "idle", attempt: 0 };

export const SIGNUP_DONE = "Thank you. If that address can be added, a confirmation email is on its way. Open it and press the button to finish.";
const NOT_OPEN = "The newsletter is not open yet. Please try again soon.";
const BAD_EMAIL = "That does not look like an email address. Check it and try again.";
const RATE_LIMITED = "There have been several sign-ups from your connection in the last hour. Please try again later.";
const FAILED = "That did not go through. Please try again in a moment.";

export interface SignupDeps {
  readiness?: Readiness;
  ipHash: string;
  limiter?: RateLimiter;
  /** The database call. Returns the token to email, or null when no email should go. */
  subscribe: (email: string, ipHash: string) => Promise<{ token: string | null; code: string | null }>;
  /** Sends the confirmation. Returns true when the mailer accepted it. */
  sendConfirmation: (email: string, token: string) => Promise<boolean>;
}

export async function processSignup(prev: SignupState, fd: FormData, deps: SignupDeps): Promise<SignupState> {
  const attempt = prev.attempt + 1;
  // A bot gets the same thanks a person gets, and nothing is stored or sent.
  const trap = fd.get(NEWSLETTER_HONEYPOT);
  if (typeof trap === "string" && trap.trim() !== "") return { status: "done", attempt, message: SIGNUP_DONE };

  const raw = String(fd.get("email") ?? "");
  const readiness = deps.readiness ?? signupReadiness();
  if (!readiness.ok) return { status: "error", attempt, message: NOT_OPEN, email: raw };

  const email = cleanEmail(raw);
  if (!email) return { status: "error", attempt, message: BAD_EMAIL, email: raw };
  if (deps.limiter && !deps.limiter.hit(deps.ipHash)) return { status: "error", attempt, message: RATE_LIMITED, email: raw };

  const { token, code } = await deps.subscribe(email, deps.ipHash);
  if (code === "AKN29") return { status: "error", attempt, message: RATE_LIMITED, email: raw };
  if (code === "AKN01") return { status: "error", attempt, message: BAD_EMAIL, email: raw };
  if (code) return { status: "error", attempt, message: FAILED, email: raw };

  if (token) {
    const sent = await deps.sendConfirmation(email, token);
    if (!sent) console.error("newsletter_confirmation_not_sent");
  }
  return { status: "done", attempt, message: SIGNUP_DONE };
}
