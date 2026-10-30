import { z } from "zod";

/**
 * The habit settings form (You, one tap from Today; build list 11.2),
 * checked on the server. The database checks the same things again: the run
 * cannot be switched on before it is offered, and the goal has a ceiling
 * (migration 0049).
 */

export const COMPANION_CHOICES = ["default", "on", "off"] as const;
export type CompanionChoice = (typeof COMPANION_CHOICES)[number];

export const HabitForm = z.object({
  runOn: z.boolean(),
  goal: z.number().int().min(1).max(10),
  companion: z.enum(COMPANION_CHOICES),
  usualTime: z.boolean(),
});
export type HabitForm = z.infer<typeof HabitForm>;

export function parseHabitForm(data: { get(name: string): FormDataEntryValue | null }): HabitForm | null {
  const parsed = HabitForm.safeParse({
    runOn: data.get("run") === "on",
    goal: Number(data.get("goal") ?? 1),
    companion: String(data.get("companion") ?? "default"),
    usualTime: data.get("usual") === "on",
  });
  return parsed.success ? parsed.data : null;
}

/** The value stored for the companion switch: null keeps the default for the reader's titles. */
export function companionValue(c: CompanionChoice): boolean | null {
  return c === "default" ? null : c === "on";
}

export function companionChoice(stored: boolean | null | undefined): CompanionChoice {
  return stored === null || stored === undefined ? "default" : stored ? "on" : "off";
}

/** Clamps the goal to the ceiling from config before it is sent. */
export function clampGoal(goal: number, max: number): number {
  return Math.min(Math.max(1, Math.floor(goal) || 1), Math.max(1, Math.floor(max)));
}

const NOTICES: Record<string, string> = {
  saved: "Saved.",
  "run-on": "Saved. Your streak has started counting.",
  "run-early": "The streak is offered after you have finished a few steps on a workbook outside the Mind and Mood shelf.",
  invalid: "That did not save. Please check the form and try again.",
  failed: "That did not save. Please try again.",
};

export function habitNotice(code: string | string[] | undefined): string | null {
  return typeof code === "string" ? (NOTICES[code] ?? null) : null;
}
