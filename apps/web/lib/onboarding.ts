import type { QuizAnswers } from "@/lib/quiz";

/**
 * What onboarding remembers, and where. All of it lives on the device, in
 * localStorage under one key, and none of it is sent anywhere: the quiz
 * answers, the suggestions, the commitment, how many visits there have been
 * and which prompts have been dismissed. Reads and writes are wrapped, so a
 * browser that blocks storage simply gives a fresh state each time and the
 * pages still work.
 *
 * Visits (13.4, 10.1, 13.18): a visit is a browsing session, counted once
 * when the first page of a session loads. "After the second visit" means the
 * second session, so the install prompt, the iOS guide and the membership
 * offer never appear on a first visit.
 */

export const ONBOARDING_KEY = "akana.onboarding.v1";
export const SESSION_MARKER_KEY = "akana.visit.session";

export interface OnboardingState {
  /** The quiz answers, device only. */
  answers?: QuizAnswers;
  /** Slugs of the three titles suggested, in order. */
  suggested?: string[];
  quizDoneAt?: number;
  /** The commitment screen was accepted. Steps only, never a date. */
  committedAt?: number;
  firstExerciseAt?: number;
  offerDismissedAt?: number;
  installDismissedAt?: number;
  iosGuideDismissedAt?: number;
  installedAt?: number;
  visits: number;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const EMPTY: OnboardingState = { visits: 0 };

export function readOnboarding(store: KeyValueStore | null): OnboardingState {
  if (!store) return { ...EMPTY };
  try {
    const raw = store.getItem(ONBOARDING_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<OnboardingState> | null;
    if (!parsed || typeof parsed !== "object") return { ...EMPTY };
    const visits = typeof parsed.visits === "number" && Number.isFinite(parsed.visits) && parsed.visits >= 0 ? Math.floor(parsed.visits) : 0;
    return { ...parsed, visits };
  } catch {
    return { ...EMPTY };
  }
}

export function writeOnboarding(store: KeyValueStore | null, state: OnboardingState): boolean {
  if (!store) return false;
  try {
    store.setItem(ONBOARDING_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

/** Merge a change into the stored state and save it. Returns the new state. */
export function updateOnboarding(store: KeyValueStore | null, change: Partial<OnboardingState>): OnboardingState {
  const next = { ...readOnboarding(store), ...change };
  writeOnboarding(store, next);
  return next;
}

/**
 * Count this page load as a visit when it is the first of a browsing session.
 * `session` is sessionStorage, which a new tab session starts empty; the
 * marker in it stops the count rising on every page.
 */
export function recordVisit(local: KeyValueStore | null, session: KeyValueStore | null): OnboardingState {
  const state = readOnboarding(local);
  let seen = false;
  try {
    seen = session?.getItem(SESSION_MARKER_KEY) === "1";
  } catch {
    seen = false;
  }
  // Without sessionStorage there is no way to tell sessions apart, so nothing is counted.
  if (seen || !session) return state;
  try {
    session.setItem(SESSION_MARKER_KEY, "1");
  } catch {
    return state;
  }
  return updateOnboarding(local, { visits: state.visits + 1 });
}

/** Never on a first visit. */
export const MIN_VISITS_FOR_PROMPTS = 2;

export interface OfferContext {
  /** Already holds a live membership. */
  isMember: boolean;
  /** At least one membership plan can be bought right now. */
  plansOpen: boolean;
}

/**
 * The membership offer (13.4): after the quiz and the first exercise, once,
 * and never on the first visit. Dismissed means gone for good; the library
 * and the You page still carry the same membership terms.
 */
export function offerDue(state: OnboardingState, ctx: OfferContext): boolean {
  if (ctx.isMember || !ctx.plansOpen) return false;
  if (state.visits < MIN_VISITS_FOR_PROMPTS) return false;
  if (!state.quizDoneAt || !state.firstExerciseAt) return false;
  return !state.offerDismissedAt;
}
