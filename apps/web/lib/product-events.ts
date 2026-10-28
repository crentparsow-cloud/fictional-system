/**
 * Phase B product events, counted with the same first-party counter as the
 * funnel (lib/funnel.ts, public.record_funnel_event). Each is a daily count.
 * Nothing else is ever sent with one.
 *
 * Privacy rules, held here so no call site has to remember them:
 *   - An event carries a name, a tenant, and at most a workbook id. Never an
 *     answer, a note, a highlight, an email, a name, a title or any free text.
 *     There is no field that could hold one.
 *   - A workbook id is attached only when the title has no safety tier
 *     ("none"). For a standard or higher tier title, and whenever the tier is
 *     not known, the event is counted for the tenant alone, so a mental
 *     health title never appears in a count (scopedWorkbook).
 *   - Events about streaks, goals and the companion never carry a workbook at
 *     all, and are not counted for a reader whose only context is a tier
 *     standard or higher title (shouldCount).
 *   - The visitor opt-out (Sec-GPC, DNT, /counting) is honoured by the same
 *     path as every other event.
 *
 * The names below are also listed in migration 0067 (the table check and the
 * function both name them). A test keeps the two lists equal.
 */

export const PRODUCT_EVENTS = [
  "streak_turned_on",
  "streak_turned_off",
  "milestone_reached",
  "companion_shown",
  "highlight_added",
  "note_added",
  "shortcut_sheet_opened",
  "then_now_checked_in",
  "referral_link_shared",
  "referral_claimed",
  "referral_rewarded",
  "author_link_visited",
  "gift_bought",
  "gift_claimed",
  "workbook_gift_sent",
  "workbook_gift_claimed",
  "bundle_viewed",
  "bundle_bought",
  "student_verified",
  "pause_started",
  "pause_ended",
  "winback_sent",
  "search_grouped_used",
  "title_requested",
  "author_followed",
  "studio_outline_generated",
  "builder_saved",
  "org_plan_started",
  "pack_bought",
  "newsletter_confirmed",
  "push_enabled",
  "passkey_added",
  "friend_paired",
  "certificate_viewed",
  "quote_image_made",
] as const;

export type ProductEvent = (typeof PRODUCT_EVENTS)[number];

export const PRODUCT_EVENT_LABELS: Record<ProductEvent, string> = {
  streak_turned_on: "Daily run switched on",
  streak_turned_off: "Daily run switched off",
  milestone_reached: "Milestones reached",
  companion_shown: "Companion shown",
  highlight_added: "Highlights added",
  note_added: "Notes added",
  shortcut_sheet_opened: "Shortcut sheet opened",
  then_now_checked_in: "Then and now check-ins",
  referral_link_shared: "Referral links shared",
  referral_claimed: "Referral links used",
  referral_rewarded: "Referral rewards given",
  author_link_visited: "Author links visited",
  gift_bought: "Gift memberships bought",
  gift_claimed: "Gift memberships claimed",
  workbook_gift_sent: "Workbook gifts sent",
  workbook_gift_claimed: "Workbook gifts claimed",
  bundle_viewed: "Bundles viewed",
  bundle_bought: "Bundles bought",
  student_verified: "Students verified",
  pause_started: "Pauses started",
  pause_ended: "Pauses ended",
  winback_sent: "Win-back emails sent",
  search_grouped_used: "Grouped search results used",
  title_requested: "Titles requested",
  author_followed: "Authors followed",
  studio_outline_generated: "Studio outlines generated",
  builder_saved: "Builder saves",
  org_plan_started: "Group plans started",
  pack_bought: "Group packs bought",
  newsletter_confirmed: "Newsletter sign-ups confirmed",
  push_enabled: "Reminders on devices switched on",
  passkey_added: "Passkeys added",
  friend_paired: "Friends paired",
  certificate_viewed: "Certificates viewed",
  quote_image_made: "Quote images made",
};

/** Events about habit, which never carry a workbook and never count on a tier standard or higher title. */
export const HABIT_EVENTS: readonly ProductEvent[] = ["streak_turned_on", "streak_turned_off", "milestone_reached", "companion_shown"];

/** The safety tier of the title an event happened on, when there is one. */
export type SafetyTier = "none" | "standard" | "higher";

const isHabit = (e: ProductEvent) => (HABIT_EVENTS as readonly string[]).includes(e);

/**
 * The workbook id an event may carry. Only a tier "none" title is named, and
 * never on a habit event. Anything unknown is counted for the tenant alone.
 */
export function scopedWorkbook(event: ProductEvent, tier: SafetyTier | string | null | undefined, workbookId: string | null | undefined): string | null {
  if (!workbookId || isHabit(event)) return null;
  return tier === "none" ? workbookId : null;
}

/**
 * Whether the event is counted at all. Habit events about a standard or
 * higher tier title are dropped: nothing counts streaks or goals there.
 */
export function shouldCount(event: ProductEvent, tier: SafetyTier | string | null | undefined): boolean {
  if (isHabit(event) && (tier === "standard" || tier === "higher")) return false;
  return true;
}

export function isProductEvent(v: unknown): v is ProductEvent {
  return typeof v === "string" && (PRODUCT_EVENTS as readonly string[]).includes(v);
}

/**
 * Moments that only the browser sees. The page reports them to /api/event,
 * which accepts these names and no others, and nothing but the name.
 */
export const CLIENT_EVENTS = ["shortcut_sheet_opened", "referral_link_shared", "studio_outline_generated", "search_grouped_used"] as const satisfies readonly ProductEvent[];
export type ClientEvent = (typeof CLIENT_EVENTS)[number];

/** The body of a /api/event call, or null when it is anything else. Extra keys are refused, so no text can ride along. */
export function parseClientEvent(body: unknown): ClientEvent | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== "event") return null;
  const v = (body as { event: unknown }).event;
  return typeof v === "string" && (CLIENT_EVENTS as readonly string[]).includes(v) ? (v as ClientEvent) : null;
}
