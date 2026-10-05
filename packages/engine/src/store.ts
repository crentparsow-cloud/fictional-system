import type { AnswerStore, FieldValue } from "./types";

/**
 * A plain in-memory store for previews, tests and the harness. Nothing here
 * persists. The app supplies a sealed store for real readers.
 */
export class MemoryAnswerStore implements AnswerStore {
  private readonly map = new Map<string, FieldValue>();

  get(exerciseId: string, fieldId: string): FieldValue | undefined {
    return this.map.get(`${exerciseId}.${fieldId}`);
  }

  set(exerciseId: string, fieldId: string, value: FieldValue): void {
    this.map.set(`${exerciseId}.${fieldId}`, value);
  }

  /** Everything held, for tests and debugging. */
  entries(): Array<[string, FieldValue]> {
    return [...this.map.entries()];
  }
}

/** Answer scope for a repeat of an exercise in a later unit. */
export const repeatScope = (exerciseId: string) => `${exerciseId}~r`;
/** Answer scope for a unit's weekly check-in. */
export const checkinScope = (unitNumber: number) => `checkin:${unitNumber}`;
/** Answer scope for the Start screen's why line. */
export const START_SCOPE = "start";
/** Answer scope for the Keep going monthly questions. */
export const KEEP_GOING_SCOPE = "keep_going";
