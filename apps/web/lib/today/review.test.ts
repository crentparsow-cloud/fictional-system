import { describe, expect, it } from "vitest";
import { step } from "@/lib/today/fixtures";
import {
  DAYS_PER_WEEK,
  dialAllowsDay,
  effectiveFrequency,
  hash32,
  isReviewFrequency,
  MIN_AGE_DAYS,
  pickFallbacks,
  pickForDay,
  reviewableFields,
  reviewCandidates,
  reviewText,
  stillTrueField,
  type AnswerRef,
} from "@/lib/today/review";

const now = new Date("2026-10-10T09:00:00Z");
const old = "2026-09-01T10:00:00Z";

describe("frequency", () => {
  it("knows the four settings", () => {
    expect(["off", "rarely", "sometimes", "often"].every(isReviewFrequency)).toBe(true);
    expect(isReviewFrequency("daily")).toBe(false);
  });
  it("defaults to sometimes, and to off for a wellbeing title", () => {
    expect(effectiveFrequency(null, "none")).toBe("sometimes");
    expect(effectiveFrequency(null, "standard")).toBe("off");
    expect(effectiveFrequency(null, "higher")).toBe("off");
    expect(effectiveFrequency("often", "standard")).toBe("often");
    expect(effectiveFrequency("off", "none")).toBe("off");
  });
  it("lets the dial decide how many days in seven", () => {
    const days = Array.from({ length: 70 }, (_, i) => new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10));
    const count = (f: "off" | "rarely" | "sometimes" | "often") => days.filter((d) => dialAllowsDay(f, "u1", "e1", d)).length;
    expect(count("off")).toBe(0);
    expect(count("often")).toBe(70);
    expect(count("rarely")).toBeGreaterThan(0);
    expect(count("rarely")).toBeLessThan(count("sometimes"));
    expect(count("sometimes")).toBeLessThan(70);
    expect(DAYS_PER_WEEK.off).toBe(0);
  });
  it("gives the same answer for the same day every time", () => {
    expect(dialAllowsDay("sometimes", "u1", "e1", "2026-10-10")).toBe(dialAllowsDay("sometimes", "u1", "e1", "2026-10-10"));
    expect(hash32("a")).toBe(hash32("a"));
  });
});

describe("reviewableFields", () => {
  it("takes free-text fields only, and never one marked sensitive", () => {
    const s = step(1, "plan", {
      fields: [
        { id: "what", type: "long_text", label: "What matters?", optional: false, sensitive: false },
        { id: "hard", type: "long_text", label: "The hardest part", optional: false, sensitive: true },
        { id: "mood", type: "scale_0_10", label: "How is it?", optional: false, sensitive: false },
        { id: "list", type: "checklist", label: "Pick", optional: false, sensitive: false },
        { id: "name", type: "short_text", label: "A name", optional: true, sensitive: false },
      ],
    });
    expect([...reviewableFields([s]).keys()]).toEqual(["exercise:plan.what", "exercise:plan.name"]);
    expect(reviewableFields([s]).get("exercise:plan.what")).toEqual({ label: "What matters?", unit: 1 });
  });
});

describe("reviewCandidates", () => {
  const reviewable = new Map([["exercise:plan.what", {}]]);
  const answer = (id: string, over: Partial<AnswerRef> = {}): AnswerRef => ({ id, enrolmentId: "e1", field: "exercise:plan.what", updatedAt: old, ...over });
  const base = {
    userId: "u1",
    day: "2026-10-10",
    now,
    programmes: [{ enrolmentId: "e1", frequency: "often" as const, reviewable }],
    setAside: new Set<string>(),
    recentlyShown: new Set<string>(),
  };

  it("offers old answers to reviewable fields only", () => {
    const answers = [answer("a1"), answer("a2", { field: "exercise:plan.mood" }), answer("a3", { field: "review:2026-10-01.still_true" }), answer("a4", { field: "pickup:2026-10-01.reflection" })];
    expect(reviewCandidates({ ...base, answers }).map((a) => a.id)).toEqual(["a1"]);
  });

  it("needs an answer to be at least a week old", () => {
    const edge = new Date(now.getTime() - MIN_AGE_DAYS * 86_400_000).toISOString();
    const answers = [answer("old", { updatedAt: edge }), answer("new", { updatedAt: "2026-10-05T10:00:00Z" })];
    expect(reviewCandidates({ ...base, answers }).map((a) => a.id)).toEqual(["old"]);
  });

  it("leaves out answers set aside and answers shown lately, and never touches content", () => {
    const answers = [answer("a1"), answer("a2"), answer("a3")];
    const out = reviewCandidates({ ...base, answers, setAside: new Set(["a1"]), recentlyShown: new Set(["a2"]) });
    expect(out.map((a) => a.id)).toEqual(["a3"]);
    expect(JSON.stringify(out)).not.toMatch(/sealed/);
  });

  it("only reads programmes whose dial is not off and allows the day", () => {
    const answers = [answer("a1"), answer("b1", { enrolmentId: "e2" })];
    const off = reviewCandidates({
      ...base,
      programmes: [
        { enrolmentId: "e1", frequency: "off" as const, reviewable },
        { enrolmentId: "e2", frequency: "often" as const, reviewable },
      ],
      answers,
    });
    expect(off.map((a) => a.id)).toEqual(["b1"]);
  });

  it("is empty when the reader has chosen no programme", () => {
    expect(reviewCandidates({ ...base, programmes: [], answers: [answer("a1")] })).toEqual([]);
  });
});

describe("picking", () => {
  const list: AnswerRef[] = ["a", "b", "c", "d", "e"].map((id) => ({ id, enrolmentId: "e1", field: "f", updatedAt: old }));
  it("picks the same one for the same day and may pick another tomorrow", () => {
    const one = pickForDay(list, "u1", "2026-10-10");
    expect(pickForDay(list, "u1", "2026-10-10")).toEqual(one);
    const picks = new Set(Array.from({ length: 20 }, (_, i) => pickForDay(list, "u1", `2026-10-${String(i + 1).padStart(2, "0")}`)?.id));
    expect(picks.size).toBeGreaterThan(1);
  });
  it("picks nothing from nothing", () => {
    expect(pickForDay([], "u1", "2026-10-10")).toBeNull();
    expect(pickFallbacks([], null)).toEqual([]);
  });
  it("lists the next in line if the first opens to nothing", () => {
    const first = list[1] ?? null;
    expect(pickFallbacks(list, first, 2).map((a) => a.id)).toEqual(["c", "d"]);
    expect(pickFallbacks(list, list[4] ?? null, 2).map((a) => a.id)).toEqual(["a", "b"]);
  });
});

describe("reviewText and the still-true field", () => {
  it("shows only text of some length", () => {
    expect(reviewText("  I want to sleep better.  ")).toBe("I want to sleep better.");
    expect(reviewText("ok")).toBeNull();
    expect(reviewText("")).toBeNull();
    expect(reviewText(["a"])).toBeNull();
    expect(reviewText(null)).toBeNull();
    expect(reviewText("x".repeat(1000))?.length).toBe(600);
  });
  it("saves still-true under its own scope for the day, valid for the answers table", () => {
    expect(stillTrueField("2026-10-10")).toBe("review:2026-10-10.still_true");
    expect(stillTrueField("2026-10-10")).toMatch(/^[a-z][a-z0-9_:~.-]{0,199}$/);
  });
});
