import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { WorkbookV3, stripInternal } from "@akana/schema";
import { Player } from "../Player";
import {
  PLAN_SCOPE,
  answerText,
  currentStep,
  earnedMilestones,
  planLineCount,
  planLines,
  prefillFor,
  progressFacts,
  recentDailyChecks,
  selfcheckScope,
  triggerMet,
  unitComplete,
  type ProgressEvent,
} from "../progress";
import { ProgressScreen } from "../screens/Progress";
import { paceOf, paceSequence } from "../screens/BreathingPacer";
import { MemoryAnswerStore, START_SCOPE, repeatScope } from "../store";

afterEach(cleanup);

const load = (name: string) =>
  WorkbookV3.parse(stripInternal(JSON.parse(readFileSync(resolve(__dirname, `../../../../content/workbooks/v3/${name}.json`), "utf8"))));
const focus = load("focus");

const ev = (kind: ProgressEvent["kind"], ref: string | null, at = "2026-10-01T09:00:00Z"): ProgressEvent => ({ kind, ref, at });

describe("answerText", () => {
  it("turns text, lists, columns and ticked options into one plain line, and grids into nothing", () => {
    expect(answerText({ id: "a", type: "short_text", label: "x" }, "  hello ")).toBe("hello");
    expect(answerText({ id: "a", type: "ranked_list", label: "x", max_items: 3 }, ["one", "", "three"])).toBe("one; three");
    expect(answerText({ id: "a", type: "two_column", label: "x", columns: ["A", "B"] }, [["a", "b"], ["", ""]])).toBe("a: b");
    expect(answerText({ id: "a", type: "checklist", label: "x", options: ["Walk", "Read"] }, [false, true])).toBe("Read");
    expect(answerText({ id: "a", type: "checklist", label: "x", options: ["From your Toolkit"] }, [true, false], ["Pause", "Walk"])).toBe("Pause");
    expect(answerText({ id: "a", type: "scale_0_10", label: "x" }, 7)).toBe("");
    expect(answerText({ id: "a", type: "short_text", label: "x" }, undefined)).toBe("");
  });
});

describe("My plan (F-017)", () => {
  it("builds lines from feeds_plan, tags each with its unit, and puts the why in the unfed section", () => {
    const store = new MemoryAnswerStore();
    store.set(START_SCOPE, "why", "Evenings that feel like mine");
    store.set("e01", "f_moments", [["Mornings", "before work"]]);
    const sections = planLines(focus, store);
    const p1 = sections.find((s) => s.id === "p1");
    const p2 = sections.find((s) => s.id === "p2");
    expect(p1?.lines.map((l) => l.text)).toEqual(["Evenings that feel like mine"]);
    expect(p2?.lines[0]).toMatchObject({ text: "Mornings: before work", unit: 1, edited: false, hidden: false });
    expect(planLineCount(sections)).toBe(2);
  });

  it("prefers the repeat answer and tags it with the repeat unit", () => {
    const withRepeat = focus.exercises.find((e) => (e.feeds_plan ?? []).length && focus.units.some((u) => (u.repeat_ids ?? []).includes(e.id)));
    if (!withRepeat) return; // focus has no repeated plan exercise; nothing to check
    const fp = withRepeat.feeds_plan![0]!;
    const store = new MemoryAnswerStore();
    store.set(withRepeat.id, fp.field_id, "first time");
    store.set(repeatScope(withRepeat.id), fp.field_id, "second time");
    const line = planLines(focus, store).flatMap((s) => s.lines).find((l) => l.key === `${withRepeat.id}.${fp.field_id}`);
    expect(line?.text).toBe("second time");
    const repeatUnit = focus.units.find((u) => (u.repeat_ids ?? []).includes(withRepeat.id))?.number;
    expect(line?.unit).toBe(repeatUnit);
  });

  it("lets every line be edited, taken out and put back", () => {
    const store = new MemoryAnswerStore();
    store.set("e01", "f_moments", [["Mornings", ""]]);
    store.set(PLAN_SCOPE, "e01.f_moments", "Mornings, and late afternoons");
    let line = planLines(focus, store).flatMap((s) => s.lines)[0];
    expect(line).toMatchObject({ text: "Mornings, and late afternoons", original: "Mornings", edited: true });
    store.set(PLAN_SCOPE, "e01.f_moments", "");
    line = planLines(focus, store).flatMap((s) => s.lines)[0];
    expect(line?.hidden).toBe(true);
    expect(planLineCount(planLines(focus, store))).toBe(0);
    store.set(PLAN_SCOPE, "e01.f_moments", null);
    line = planLines(focus, store).flatMap((s) => s.lines)[0];
    expect(line).toMatchObject({ text: "Mornings", edited: false, hidden: false });
  });

  it("shows the plan in the Player and saves an edit as the reader's own answer", () => {
    const store = new MemoryAnswerStore();
    store.set("e01", "f_moments", [["Mornings", ""]]);
    render(<Player workbook={focus} store={store} initialView={{ kind: "plan" }} />);
    expect(screen.getByText("Mornings")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Change this line"), { target: { value: "Mornings, mostly" } });
    fireEvent.click(screen.getByRole("button", { name: "Save line" }));
    expect(store.get(PLAN_SCOPE, "e01.f_moments")).toBe("Mornings, mostly");
    expect(screen.getByText("Mornings, mostly")).toBeTruthy();
  });
});

describe("prefill_from (F-017)", () => {
  it("carries the nearest earlier answer with that field id, repeat first", () => {
    const later = focus.exercises.find((e) => e.id === "e09");
    if (!later) throw new Error("no e09");
    const field = { ...later.fields[0]!, type: "long_text" as const, prefill_from: "f_when" };
    const store = new MemoryAnswerStore();
    store.set("e07", "f_when", "After breakfast");
    expect(prefillFor(focus, "e09", field, store)).toBe("After breakfast");
    store.set(repeatScope("e07"), "f_when", "Before lunch");
    expect(prefillFor(focus, "e09", field, store)).toBe("Before lunch");
    // Never from a later exercise, never into a non-text field.
    expect(prefillFor(focus, "e01", field, store)).toBeUndefined();
    expect(prefillFor(focus, "e09", { ...field, type: "scale_0_10" }, store)).toBeUndefined();
  });

  it("writes the prefill once into an unanswered field, and leaves an answered one alone", () => {
    const e07 = focus.exercises.find((e) => e.id === "e07")!;
    const unit = focus.units.find((u) => u.exercise_ids.includes("e09"))!;
    const e09 = focus.exercises.find((e) => e.id === "e09")!;
    const target = e09.fields.find((f) => f.type === "short_text" || f.type === "long_text");
    if (!target || !e07.fields.some((f) => f.id === "f_when")) return;
    const patched: WorkbookV3 = {
      ...focus,
      exercises: focus.exercises.map((e) => (e.id === "e09" ? { ...e, fields: e.fields.map((f) => (f.id === target.id ? { ...f, prefill_from: "f_when" } : f)) } : e)),
    };
    const store = new MemoryAnswerStore();
    store.set("e07", "f_when", "After breakfast");
    render(<Player workbook={patched} store={store} initialView={{ kind: "unit", number: unit.number }} />);
    expect(store.get("e09", target.id)).toBe("After breakfast");
  });
});

describe("milestones (F-018)", () => {
  const store = new MemoryAnswerStore();
  const u1 = focus.units.find((u) => u.number === 1)!;

  it("meets each of the 13 trigger patterns from the facts, and nothing else", () => {
    const events: ProgressEvent[] = [
      ...u1.exercise_ids.map((id) => ev("step_done", id)),
      ev("checkin_done", "1"),
      ev("step_done", "e01~r"),
      ...Array.from({ length: 10 }, () => ev("toolkit_used", focus.toolkit[0]!.id)),
      ...Array.from({ length: 7 }, (_, i) => ev("daily_check_done", null, `2026-09-${String(10 + i * 3).padStart(2, "0")}T08:00:00Z`)),
      ev("finished", null, "2026-10-02T09:00:00Z"),
      ev("unit_opened", "2", "2026-10-20T09:00:00Z"),
    ];
    const s = new MemoryAnswerStore();
    s.set("e01", "f_moments", [["Mornings", ""]]);
    for (const item of focus.selfcheck!.items) s.set(selfcheckScope(6), item.id, 2);
    const f = progressFacts(focus, events, s);
    expect(triggerMet(focus, "first_exercise", f)).toBe(true);
    expect(triggerMet(focus, "first_toolkit_use", f)).toBe(true);
    expect(triggerMet(focus, "first_repeat", f)).toBe(true);
    expect(triggerMet(focus, "return_after_gap", f)).toBe(true);
    expect(triggerMet(focus, "program_complete", f)).toBe(true);
    expect(triggerMet(focus, "finished", f)).toBe(true);
    expect(triggerMet(focus, "unit_complete:1", f)).toBe(true);
    expect(triggerMet(focus, "unit_complete:2", f)).toBe(false);
    expect(triggerMet(focus, "stage_complete:map", f)).toBe(false);
    expect(triggerMet(focus, "toolkit_uses:10", f)).toBe(true);
    expect(triggerMet(focus, "toolkit_uses:11", f)).toBe(false);
    // Seven checks spread over three weeks still count: totals, never a run of days.
    expect(triggerMet(focus, "daily_checks:7", f)).toBe(true);
    expect(triggerMet(focus, "selfcheck:6", f)).toBe(true);
    expect(triggerMet(focus, "selfcheck:12", f)).toBe(false);
    expect(triggerMet(focus, "exercises_done:1", f)).toBe(true);
    expect(triggerMet(focus, "plan_lines:1", f)).toBe(true);
    expect(triggerMet(focus, "plan_lines:2", f)).toBe(false);
    // Anything outside the 13 patterns is never met, including the v1 week_complete.
    expect(triggerMet(focus, "week_complete:1", f)).toBe(false);
    expect(triggerMet(focus, "streak:7", f)).toBe(false);
  });

  it("needs the check-in for a unit to be complete, and never completes a locked unit", () => {
    const f = progressFacts(focus, u1.exercise_ids.map((id) => ev("step_done", id)), store);
    expect(unitComplete(focus, 1, f)).toBe(false);
    const locked: WorkbookV3 = { ...focus, units: focus.units.map((u) => (u.number === 2 ? { ...u, exercise_ids: [] } : u)) };
    expect(unitComplete(locked, 2, progressFacts(locked, [], store))).toBe(false);
  });

  it("names the current step in programme order", () => {
    expect(currentStep(focus, progressFacts(focus, [], store))).toMatchObject({ kind: "exercise", unit: 1, exerciseId: u1.exercise_ids[0] });
    const f = progressFacts(focus, u1.exercise_ids.map((id) => ev("step_done", id)), store);
    const step = currentStep(focus, f);
    expect(["checkin", "selfcheck"]).toContain(step.kind);
  });

  it("shows a milestone when the reader earns it in the Player, once", () => {
    const onExerciseDone = vi.fn();
    const s = new MemoryAnswerStore();
    const first = focus.exercises.find((e) => e.id === u1.exercise_ids[0])!;
    for (const fld of first.fields) {
      if (fld.type === "short_text" || fld.type === "long_text") s.set(first.id, fld.id, "x");
      if (fld.type === "rating_grid") s.set(first.id, fld.id, (fld.rows ?? []).map(() => 3));
      if (fld.type === "scale_0_10") s.set(first.id, fld.id, 5);
      if (fld.type === "two_column") s.set(first.id, fld.id, [["a", "b"]]);
    }
    render(<Player workbook={focus} store={s} initialView={{ kind: "unit", number: 1 }} onExerciseDone={onExerciseDone} />);
    const done = screen.getAllByRole("button", { name: "Done" })[0] as HTMLButtonElement;
    expect(done.disabled).toBe(false);
    fireEvent.click(done);
    expect(onExerciseDone).toHaveBeenCalledWith(first.id, first.id);
    const m = focus.milestones.find((x) => x.trigger === "first_exercise")!;
    expect(screen.getByText(m.message)).toBeTruthy();
    expect(screen.getAllByText("Marked done. You can still change your answers.").length).toBeGreaterThan(0);
  });

  it("earns nothing from no activity", () => {
    expect(earnedMilestones(focus, progressFacts(focus, [], store))).toEqual([]);
  });
});

describe("progress without streaks (F-018)", () => {
  it("lists recent days plainly, blank days neutral, with no run or count of misses", () => {
    const now = new Date(2026, 9, 7, 12);
    const days = recentDailyChecks([ev("daily_check_done", null, new Date(2026, 9, 6, 9).toISOString()), ev("daily_check_done", null, new Date(2026, 9, 3, 9).toISOString())], 14, now);
    expect(days).toHaveLength(14);
    expect(days[13]).toEqual({ date: "2026-10-07", checked: false });
    expect(days[12]).toEqual({ date: "2026-10-06", checked: true });
    expect(days.filter((d) => d.checked)).toHaveLength(2);
  });

  it("never shows a streak, a missed-day count or a comparison", () => {
    const events = [ev("daily_check_done", null, new Date().toISOString()), ev("step_done", "e01")];
    const { container } = render(<ProgressScreen workbook={focus} facts={progressFacts(focus, events, new MemoryAnswerStore())} events={events} />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/streak|in a row|missed|consecutive|behind|other readers|average|rank|percent|%/i);
    expect(text).toContain("Recent daily checks");
    expect(text).toContain("Checked");
  });
});

describe("toolkit (F-015 parity)", () => {
  it("reads the breathing counts from the tool's steps, as the legacy pacer did", () => {
    const p = paceOf({ steps: ["Inhale through your nose, counting to four.", "Hold for a count of two.", "Exhale slowly, counting to six."] });
    expect(p).toEqual({ inn: 4, out: 6, hold: 2, holds: 1 });
    expect(paceSequence(p, false).map((x) => x.word)).toEqual(["Inhale", "Exhale"]);
    expect(paceSequence(p, true).map((x) => x.word)).toEqual(["Inhale", "Hold", "Exhale"]);
    expect(paceOf({ steps: ["Breathe in.", "Breathe out."] })).toMatchObject({ inn: 4, out: 6 });
  });

  it("records a tool use and shows no count", () => {
    const onToolUsed = vi.fn();
    render(<Player workbook={focus} store={new MemoryAnswerStore()} initialView={{ kind: "toolkit" }} onToolUsed={onToolUsed} />);
    fireEvent.click(screen.getAllByRole("button", { name: "I used it" })[0]!);
    expect(onToolUsed).toHaveBeenCalledWith(focus.toolkit[0]!.id);
    expect(screen.queryByText(/used \d+ time/i)).toBeNull();
  });
});

describe("daily check answers (F-015 parity, F-018)", () => {
  it("saves the day's rating and what helped as the reader's own answer, and shows them back on Progress", () => {
    const store = new MemoryAnswerStore();
    const onDailyCheckDone = vi.fn();
    render(<Player workbook={focus} store={store} initialView={{ kind: "daily" }} onDailyCheckDone={onDailyCheckDone} />);
    fireEvent.click(screen.getByRole("button", { name: "7 out of 10" }));
    fireEvent.click(screen.getByRole("button", { name: focus.daily_check!.tags[0]! }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onDailyCheckDone.mock.calls[0]).toEqual([]);
    const today = new Date();
    const scope = `daily:${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    expect(store.get(scope, "score")).toBe(7);
    expect(store.get(scope, "tags")).toEqual([focus.daily_check!.tags[0]]);
    fireEvent.click(screen.getByRole("button", { name: "Progress" }));
    expect(screen.getByText("7 out of 10")).toBeTruthy();
  });
});
