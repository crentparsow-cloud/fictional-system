import { describe, expect, it } from "vitest";
import { MIN_VISITS_FOR_PROMPTS, ONBOARDING_KEY, SESSION_MARKER_KEY, offerDue, readOnboarding, recordVisit, updateOnboarding, type KeyValueStore } from "@/lib/onboarding";
import { INSTALL_DISMISS_DAYS, SAFARI_SEVEN_DAY_RULE, installPromptFor, isIosSafari, isStandaloneDisplay } from "@/lib/pwa";

function memory(initial: Record<string, string> = {}): KeyValueStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}
const blocked: KeyValueStore = {
  getItem() {
    throw new Error("blocked");
  },
  setItem() {
    throw new Error("blocked");
  },
};

describe("device state", () => {
  it("starts empty and survives blocked or damaged storage", () => {
    expect(readOnboarding(memory()).visits).toBe(0);
    expect(readOnboarding(blocked).visits).toBe(0);
    expect(readOnboarding(null).visits).toBe(0);
    expect(readOnboarding(memory({ [ONBOARDING_KEY]: "{not json" })).visits).toBe(0);
    expect(readOnboarding(memory({ [ONBOARDING_KEY]: JSON.stringify({ visits: -4 }) })).visits).toBe(0);
  });

  it("merges changes without losing earlier ones", () => {
    const store = memory();
    updateOnboarding(store, { quizDoneAt: 5 });
    updateOnboarding(store, { firstExerciseAt: 9 });
    expect(readOnboarding(store)).toMatchObject({ quizDoneAt: 5, firstExerciseAt: 9 });
  });

  it("does not throw when it cannot save", () => {
    expect(() => updateOnboarding(blocked, { quizDoneAt: 1 })).not.toThrow();
  });
});

describe("visit counting", () => {
  it("counts one visit per browsing session, not per page", () => {
    const local = memory();
    const session = memory();
    expect(recordVisit(local, session).visits).toBe(1);
    expect(recordVisit(local, session).visits).toBe(1);
    expect(session.data.get(SESSION_MARKER_KEY)).toBe("1");
    expect(recordVisit(local, memory()).visits).toBe(2);
  });

  it("counts nothing when sessions cannot be told apart", () => {
    expect(recordVisit(memory(), null).visits).toBe(0);
  });
});

describe("membership offer timing (13.4)", () => {
  const ready = { quizDoneAt: 1, firstExerciseAt: 2, visits: 2 };
  const ctx = { isMember: false, plansOpen: true };

  it("is due after the quiz and the first exercise, on the second visit", () => {
    expect(offerDue(ready, ctx)).toBe(true);
  });

  it("is never due on a first visit", () => {
    expect(MIN_VISITS_FOR_PROMPTS).toBe(2);
    expect(offerDue({ ...ready, visits: 1 }, ctx)).toBe(false);
  });

  it("needs both the quiz and the first exercise", () => {
    expect(offerDue({ ...ready, quizDoneAt: undefined }, ctx)).toBe(false);
    expect(offerDue({ ...ready, firstExerciseAt: undefined }, ctx)).toBe(false);
  });

  it("goes away for good once dismissed, and for members, and when no plan can be bought", () => {
    expect(offerDue({ ...ready, offerDismissedAt: 3 }, ctx)).toBe(false);
    expect(offerDue(ready, { ...ctx, isMember: true })).toBe(false);
    expect(offerDue(ready, { ...ctx, plansOpen: false })).toBe(false);
  });
});

describe("install prompt and iOS guide (10.1, 13.18)", () => {
  const NOW = Date.UTC(2026, 9, 10);
  const ctx = { standalone: false, nativeAvailable: false, iosSafari: false, now: NOW };

  it("shows nothing on a first visit", () => {
    expect(installPromptFor({ visits: 1 }, { ...ctx, nativeAvailable: true })).toBe("none");
    expect(installPromptFor({ visits: 1 }, { ...ctx, iosSafari: true })).toBe("none");
  });

  it("shows the pre-permission card on the second visit where the browser offers install", () => {
    expect(installPromptFor({ visits: 2 }, { ...ctx, nativeAvailable: true })).toBe("native");
  });

  it("shows the iOS guide on the second visit in Safari", () => {
    expect(installPromptFor({ visits: 2 }, { ...ctx, iosSafari: true })).toBe("ios-guide");
  });

  it("shows nothing inside the installed app or once installed", () => {
    expect(installPromptFor({ visits: 5 }, { ...ctx, standalone: true, nativeAvailable: true })).toBe("none");
    expect(installPromptFor({ visits: 5, installedAt: 1 }, { ...ctx, iosSafari: true })).toBe("none");
  });

  it("stays quiet for 90 days after Not now, then may ask once more", () => {
    const day = 86_400_000;
    const state = { visits: 4, installDismissedAt: NOW - 10 * day };
    expect(installPromptFor(state, { ...ctx, nativeAvailable: true })).toBe("none");
    expect(installPromptFor({ ...state, installDismissedAt: NOW - (INSTALL_DISMISS_DAYS + 1) * day }, { ...ctx, nativeAvailable: true })).toBe("native");
  });

  it("recognises Safari on iPhone and iPad, and not Chrome on iOS or a desktop", () => {
    const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
    const chromeIos = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1";
    const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
    expect(isIosSafari(iphone)).toBe(true);
    expect(isIosSafari(chromeIos)).toBe(false);
    expect(isIosSafari(mac, "MacIntel", 0)).toBe(false);
    expect(isIosSafari(mac, "MacIntel", 5)).toBe(true);
  });

  it("detects standalone display from either signal", () => {
    expect(isStandaloneDisplay({ displayModeStandalone: true })).toBe(true);
    expect(isStandaloneDisplay({ displayModeStandalone: false, navigatorStandalone: true })).toBe(true);
    expect(isStandaloneDisplay({ displayModeStandalone: false })).toBe(false);
  });

  it("states the Safari seven-day rule and that installed apps keep their own clock", () => {
    expect(SAFARI_SEVEN_DAY_RULE).toMatch(/seven days/);
    expect(SAFARI_SEVEN_DAY_RULE).toMatch(/own clock/);
    expect(SAFARI_SEVEN_DAY_RULE).not.toMatch(/—|–/);
  });
});
