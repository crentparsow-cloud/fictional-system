import type { ProgrammeStep } from "@/lib/today/steps";

/** Test helpers shared by the Today tests. */
export function step(unit: number, exerciseId: string, over: Partial<ProgrammeStep> = {}): ProgrammeStep {
  return {
    unit,
    unitName: `Unit ${unit} name`,
    exerciseId,
    title: `Exercise ${exerciseId}`,
    minutes: 10,
    fields: [
      { id: "what", type: "long_text", label: "What matters most?", optional: false, sensitive: false },
      { id: "note", type: "short_text", label: "A note", optional: true, sensitive: false },
    ],
    short: null,
    indexInUnit: 0,
    countInUnit: 1,
    ...over,
  };
}

export const answered = (...paths: string[]) => (exerciseId: string, fieldId: string) => paths.includes(`${exerciseId}.${fieldId}`);
