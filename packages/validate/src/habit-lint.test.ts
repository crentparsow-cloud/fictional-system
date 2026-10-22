import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contentTargets } from "./targets";
import { habitLanguageClean, habitLanguageHits } from "./habit-lint";
import { validateWorkbook } from "./index";

const rules = (t: string) => habitLanguageHits(t).map((h) => h.rule);

describe("habitLanguageHits", () => {
  it("flags streak talk", () => {
    expect(rules("Keep your streak alive.")).toContain("streak");
    expect(rules("Write for seven days in a row.")).toContain("streak");
    expect(rules("Three consecutive days of practice.")).toContain("streak");
    expect(rules("Don't break the chain.")).toContain("streak");
  });

  it("flags daily goals", () => {
    expect(rules("Set a daily goal of ten minutes.")).toContain("daily_goal");
    expect(rules("Hit your target before bed.")).toContain("daily_goal");
  });

  it("flags urgency and loss warnings", () => {
    expect(rules("Hurry, this is your last chance.")).toContain("urgency");
    expect(habitLanguageHits("A countdown to the exam.")[0]?.severity).toBe("warning");
    expect(rules("Only 3 days left to finish.")).toContain("urgency");
    expect(rules("Your access expires in a week.")).toContain("urgency");
    expect(rules("Don't miss today.")).toContain("urgency");
    expect(rules("You will lose your progress.")).toContain("loss_warning");
  });

  it("treats missed-day talk as a warning, not an error", () => {
    const hits = habitLanguageHits("Decide what to do after a missed day.");
    expect(hits.map((h) => h.severity)).toEqual(["warning"]);
    expect(habitLanguageClean("Decide what to do after a missed day.")).toBe(true);
    expect(habitLanguageHits("You are falling behind.")[0]?.severity).toBe("warning");
  });

  it("lets a title say plainly that it does not do these things", () => {
    expect(habitLanguageHits("There are no streaks here.")).toEqual([]);
    expect(habitLanguageHits("Nothing counts days, and there is never a countdown or a deadline.")).toEqual([]);
    expect(habitLanguageHits("Go without a daily goal.")).toEqual([]);
  });

  it("does not let a negation excuse a hurry phrase", () => {
    expect(rules("Do not miss this.")).toContain("urgency");
  });

  it("passes calm, ordinary copy", () => {
    expect(habitLanguageHits("Write one honest sentence. Stop when you want to. Come back when it suits you.")).toEqual([]);
    expect(habitLanguageClean("Take your time.")).toBe(true);
  });
});

describe("the check in validateWorkbook", () => {
  const root = join(__dirname, "../../..");
  const files = contentTargets(root);

  it("raises no habit error on any workbook already in the repository", () => {
    for (const f of files) {
      const r = validateWorkbook(JSON.parse(readFileSync(f, "utf8")));
      const bad = [...r.errors, ...r.warnings].filter((x) => /mental health title/.test(x.message) && x.severity === "error");
      expect(bad, f).toEqual([]);
    }
  });

  it("finds streak language in a wellbeing title and ignores it in a tier none title", () => {
    const base = JSON.parse(readFileSync(join(root, "content/workbooks/v3/burnout.json"), "utf8")) as Record<string, unknown>;
    const doc = { ...base, card_line: "Keep your streak going with a daily goal." };
    const hasHabit = (d: unknown) => validateWorkbook(d).errors.some((e) => /mental health title/.test(e.message));
    expect(base.safety_tier).not.toBe("none");
    expect(hasHabit(doc)).toBe(true);
    expect(hasHabit({ ...doc, safety_tier: "none" })).toBe(false);
  });
});
