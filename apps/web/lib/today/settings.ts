import { z } from "zod";
import { REVIEW_FREQUENCIES } from "@/lib/today/review";
import { parseTime, validTimeZone } from "@/lib/today/reminders";

/**
 * The Today settings form (You tab), checked on the server. One form per
 * programme. Days are ISO weekdays, Monday 1 to Sunday 7.
 */

export const SettingsForm = z.object({
  enrolment: z.string().uuid(),
  remindersOn: z.boolean(),
  days: z.array(z.number().int().min(1).max(7)).max(7),
  time: z.string().refine((t) => parseTime(t) !== null, "time"),
  timeZone: z.string().refine(validTimeZone, "timezone"),
  review: z.enum(REVIEW_FREQUENCIES),
  pickup: z.boolean(),
});
export type SettingsForm = z.infer<typeof SettingsForm>;

/** Reads the form fields into the shape above. Returns null when anything is off. */
export function parseSettingsForm(data: { get(name: string): FormDataEntryValue | null; getAll(name: string): FormDataEntryValue[] }): SettingsForm | null {
  const days = [...new Set(data.getAll("day").map((d) => Number(d)))].filter((d) => Number.isInteger(d)).sort((a, b) => a - b);
  const parsed = SettingsForm.safeParse({
    enrolment: String(data.get("enrolment") ?? ""),
    remindersOn: data.get("reminders") === "on",
    days,
    time: String(data.get("time") ?? "09:00"),
    timeZone: String(data.get("timezone") ?? "Europe/London"),
    review: String(data.get("review") ?? "off"),
    pickup: data.get("pickup") === "on",
  });
  return parsed.success ? parsed.data : null;
}

/** Reminders need at least one day. With none chosen they stay off, whatever the switch says. */
export function remindersReallyOn(s: Pick<SettingsForm, "remindersOn" | "days">): boolean {
  return s.remindersOn && s.days.length > 0;
}
