import { MIN_VISITS_FOR_PROMPTS, type OnboardingState } from "@/lib/onboarding";

/**
 * Install prompt and iOS guide (10.1, 13.18), the decisions only.
 *
 * Rules:
 *   - never on a first visit; the second visit onwards;
 *   - never inside the installed app;
 *   - a pre-permission card comes first. The browser's own install dialogue
 *     opens only after the reader taps the button on that card;
 *   - "Not now" is remembered for 90 days. Nothing counts or nags.
 *
 * Safari seven-day rule, kept here so the code and the install guide say the
 * same thing: Safari clears script-writable storage (IndexedDB, localStorage)
 * for a website that has not been visited in seven days of Safari use. That
 * would take unsaved drafts with it. A web app added to the home screen is
 * exempt from that cap and keeps its own clock, which counts days the app is
 * used. So the install guide tells iPhone readers that the home screen is the
 * safer place for work that is not yet saved, and that anything saved to the
 * account is never affected. navigator.storage.persist() is requested once
 * the app is installed, which Safari 17 and later and Chrome honour.
 */

export const SAFARI_SEVEN_DAY_RULE =
  "Safari can clear what a website keeps on your device if you have not visited for seven days. That could include answers you have written but not yet saved to your account. A web app on your home screen is not cleared this way and keeps its own clock, so it is the safer place for unsaved work. Anything saved to your account is never affected.";

export const IOS_INSTALL_STEPS: readonly string[] = [
  "Open Akana in Safari.",
  "Tap the Share button, the square with an arrow, at the bottom of the screen.",
  "Scroll down and tap Add to Home Screen, then tap Add.",
  "Open Akana from your home screen from now on.",
];

export const INSTALL_DISMISS_DAYS = 90;
const DAY_MS = 86_400_000;

export function isIos(ua: string, platform = "", maxTouchPoints = 0): boolean {
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  // iPadOS reports as a Mac with a touch screen.
  return platform === "MacIntel" && maxTouchPoints > 1;
}

/** Safari on iOS, not Chrome, Firefox or Edge for iOS, which cannot add to the home screen the same way. */
export function isIosSafari(ua: string, platform = "", maxTouchPoints = 0): boolean {
  return isIos(ua, platform, maxTouchPoints) && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//i.test(ua);
}

export function isStandaloneDisplay(input: { displayModeStandalone: boolean; navigatorStandalone?: boolean }): boolean {
  return input.displayModeStandalone || input.navigatorStandalone === true;
}

function dismissedRecently(at: number | undefined, now: number): boolean {
  return typeof at === "number" && now - at < INSTALL_DISMISS_DAYS * DAY_MS;
}

export type InstallPrompt = "none" | "native" | "ios-guide";

export interface InstallContext {
  standalone: boolean;
  /** A beforeinstallprompt event is waiting (Chrome, Edge, Android). */
  nativeAvailable: boolean;
  iosSafari: boolean;
  now: number;
}

/** Which prompt, if any, to show right now. */
export function installPromptFor(state: OnboardingState, ctx: InstallContext): InstallPrompt {
  if (ctx.standalone || state.installedAt) return "none";
  if (state.visits < MIN_VISITS_FOR_PROMPTS) return "none";
  if (ctx.nativeAvailable) return dismissedRecently(state.installDismissedAt, ctx.now) ? "none" : "native";
  if (ctx.iosSafari) return dismissedRecently(state.iosGuideDismissedAt, ctx.now) ? "none" : "ios-guide";
  return "none";
}
