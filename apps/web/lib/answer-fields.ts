/**
 * The field path that binds an answer. It is the third part of the sealing
 * AAD (user | tenant | field) and the `answers.field` column, so a sealed
 * value cannot be moved to another field even by the service role.
 *
 * The engine addresses answers by (scope, fieldId). Scopes are an exercise id
 * ("plan_first_step"), a repeat scope ("plan_first_step~r"), or a screen
 * scope that already carries a prefix ("checkin:3", "start", "keep_going").
 * Exercise scopes get an "exercise:" prefix here so the stored path reads
 * the same way everywhere: "exercise:plan_first_step.what", "checkin:3.mood".
 */

export const FIELD_PATTERN = /^[a-z][a-z0-9_:~.-]{0,199}$/;

const SCREEN_SCOPES = new Set(["start", "keep_going"]);

export function fieldKey(scope: string, fieldId: string): string {
  const prefix = scope.includes(":") || SCREEN_SCOPES.has(scope) ? scope : `exercise:${scope}`;
  return `${prefix}.${fieldId}`;
}

/** Inverse of fieldKey. Returns null for a path the engine would not have written. */
export function splitFieldKey(field: string): { scope: string; fieldId: string } | null {
  const dot = field.indexOf(".");
  if (dot <= 0 || dot === field.length - 1) return null;
  const head = field.slice(0, dot);
  const fieldId = field.slice(dot + 1);
  const scope = head.startsWith("exercise:") ? head.slice("exercise:".length) : head;
  if (!scope) return null;
  return { scope, fieldId };
}
