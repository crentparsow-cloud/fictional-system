/**
 * Do a programme with a friend (6.2), the pure part. Two readers pair up on
 * one workbook. They see one thing about each other, whether a step was
 * finished today, and they can send one pre-written nudge a day. Answers are
 * never shared and there is no free text between the two. Migration 0066
 * holds the rules; this file holds the words and the small decisions.
 *
 * Rules the wording keeps: the nudge always reads as coming from the friend;
 * nothing counts days, streaks or misses; a friend who has not finished is
 * never described as behind; no countdowns; mental health titles are out.
 */

export const NUDGE_CODES = ["thinking_of_you", "ready_when_you_are", "shall_we_do_ours", "no_rush", "nice_one"] as const;
export type NudgeCode = (typeof NUDGE_CODES)[number];

export function isNudgeCode(v: unknown): v is NudgeCode {
  return typeof v === "string" && (NUDGE_CODES as readonly string[]).includes(v);
}

const NUDGE_TEXT: Record<NudgeCode, (who: string) => string> = {
  thinking_of_you: (who) => `${who} is thinking of you.`,
  ready_when_you_are: (who) => `${who} is about to do today's step. Join in if you like.`,
  shall_we_do_ours: (who) => `${who} suggests you each do your step today.`,
  no_rush: (who) => `${who} says there is no rush. Whenever suits you.`,
  nice_one: (who) => `${who} says nice one for today's step.`,
};

/** The nudge as the receiver reads it. It is always from the friend, by the name they chose. */
export function nudgeText(code: NudgeCode, friendLabel: string): string {
  return NUDGE_TEXT[code](cleanLabel(friendLabel) ?? "Your friend");
}

/** What the sender may pick right now. A cheer only after the friend has finished, a prompt only before. */
export function nudgeChoices(friendFinishedToday: boolean): NudgeCode[] {
  return friendFinishedToday ? ["nice_one"] : ["thinking_of_you", "ready_when_you_are", "shall_we_do_ours", "no_rush"];
}

export const NUDGE_BUTTONS: Record<NudgeCode, string> = {
  thinking_of_you: "Say you are thinking of them",
  ready_when_you_are: "Say you are about to start",
  shall_we_do_ours: "Suggest you each do one today",
  no_rush: "Say there is no rush",
  nice_one: "Say nice one",
};

export const LABEL_MAX = 30;
const BAD_LABEL = /[<>\u0000-\u001f\u007f]/;

/** A name for the other person, as typed. Null when blank, too long or unsafe. */
export function cleanLabel(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.replace(/\s+/g, " ").trim();
  if (!s || s.length > LABEL_MAX || BAD_LABEL.test(s)) return null;
  return s;
}

export interface PairView {
  pairId: string;
  slug: string;
  title: string;
  status: "invited" | "active";
  label: string;
  channelKey: string;
  iAmInviter: boolean;
  friendFinishedToday: boolean;
  iFinishedToday: boolean;
  nudgeSentToday: boolean;
  nudgeCode: NudgeCode | null;
}

/** One quiet line about the friend. Status only. */
export function statusLine(p: Pick<PairView, "label" | "friendFinishedToday">): string {
  return p.friendFinishedToday ? `${p.label} has done a step today.` : `${p.label} has not done a step yet today.`;
}

const TALK_PROMPTS = [
  "What stood out for you in that step? Say it in a sentence, in your own words.",
  "Was anything harder than you expected? You can say so without going into detail.",
  "Is there one small thing from today you might try this week?",
  "What would you tell a friend who was about to start this step?",
  "Did anything in the step surprise you?",
  "What was the easiest part? What would you keep?",
  "Is there a question from today you would like to hear their view on?",
  "What would make the next step feel easier to start?",
] as const;

export const TALK_IT_OVER_NOTE = "Share only what you want to. Akana does not pass on anything you wrote in the workbook.";

/** A conversation starter for the end of a step. Same prompt for the same step, so nothing is tracked. */
export function talkItOver(stepNumber: number): string {
  const n = Number.isFinite(stepNumber) ? Math.abs(Math.floor(stepNumber)) : 0;
  return TALK_PROMPTS[n % TALK_PROMPTS.length]!;
}

export type AcceptOutcome = "joined" | "invalid" | "expired" | "self" | "off" | "not_enrolled" | "busy" | "bad_label";

export const ACCEPT_MESSAGES: Record<Exclude<AcceptOutcome, "joined">, string> = {
  invalid: "This invitation is not valid any more. Ask your friend for a new one.",
  expired: "This invitation has expired. Ask your friend for a new one.",
  self: "This is your own invitation. Send the link to your friend instead.",
  off: "Doing a programme with a friend is not open to your account yet.",
  not_enrolled: "Start this workbook first, then come back to this link.",
  busy: "You are already doing this workbook with a friend.",
  bad_label: "Use a short, plain name of up to 30 characters.",
};

export function isAcceptOutcome(v: unknown): v is AcceptOutcome {
  return typeof v === "string" && ["joined", "invalid", "expired", "self", "off", "not_enrolled", "busy", "bad_label"].includes(v);
}

export const INVITE_STATEMENTS = [
  "You will each see one thing about the other: whether a step was done today.",
  "You can send each other short, pre-written nudges. They are never sent by Akana.",
  "Nothing you write in the workbook is shared. Your answers stay yours.",
  "Either of you can stop at any time, and everything about the pairing is deleted.",
] as const;

export function inviteUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/friend/${token}`;
}

/** The delay before the next poll: quick when Realtime is not connected, slow when it is. Zero means do not poll. */
export function pollDelayMs(i: { realtimeConnected: boolean; hidden: boolean }): number {
  if (i.hidden) return 0;
  return i.realtimeConnected ? 5 * 60_000 : 45_000;
}

export const PAIR_NOTICES = {
  ended: "The pairing is ended and everything about it is deleted.",
  joined: "You are doing this together now.",
  "invite-made": "Your invitation is ready.",
  "invite-failed": "The invitation could not be made just now. Try again in a moment.",
  "invite-off": "Doing a programme with a friend is not open to your account yet.",
  "invite-tier": "This workbook is read on your own.",
  "invite-exists": "You already have a pairing on this workbook.",
  "invite-limit": "You have five open pairings. End one first.",
  "invite-label": "Use a short, plain name of up to 30 characters.",
} as const;
export type PairNotice = keyof typeof PAIR_NOTICES;

export function pairNotice(code: string | string[] | undefined): string | null {
  const c = Array.isArray(code) ? code[0] : code;
  return c && c in PAIR_NOTICES ? PAIR_NOTICES[c as PairNotice] : null;
}
