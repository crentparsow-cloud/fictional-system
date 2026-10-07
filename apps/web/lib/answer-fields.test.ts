import { describe, expect, it } from "vitest";
import {
  MATRIX_MAX_OPTIONS,
  MATRIX_NAME_MAX_CHARS,
  TABLE_CELL_MAX_CHARS,
  TABLE_MAX_COLUMNS,
  TABLE_MAX_ROWS,
} from "@akana/engine/values";
import { FIELD_PATTERN, fieldKey, splitFieldKey } from "./answer-fields";

// Mirrors MAX_ANSWER_BYTES in lib/answers.ts, which is server-only.
const MAX_ANSWER_BYTES = 32 * 1024;

describe("answer field paths", () => {
  it("prefixes exercise scopes and leaves screen scopes alone", () => {
    expect(fieldKey("plan_first_step", "what")).toBe("exercise:plan_first_step.what");
    expect(fieldKey("plan_first_step~r", "what")).toBe("exercise:plan_first_step~r.what");
    expect(fieldKey("checkin:3", "mood")).toBe("checkin:3.mood");
    expect(fieldKey("start", "why")).toBe("start.why");
    expect(fieldKey("keep_going", "q0")).toBe("keep_going.q0");
  });

  it("inverts cleanly", () => {
    for (const [scope, fieldId] of [
      ["plan_first_step", "what"],
      ["plan_first_step~r", "what"],
      ["checkin:3", "mood"],
      ["start", "why"],
    ] as const) {
      expect(splitFieldKey(fieldKey(scope, fieldId))).toEqual({ scope, fieldId });
    }
    expect(splitFieldKey("nodot")).toBeNull();
    expect(splitFieldKey(".x")).toBeNull();
  });

  it("every path the engine writes matches the route's pattern", () => {
    expect(FIELD_PATTERN.test(fieldKey("e05~r", "f_two"))).toBe(true);
    expect(FIELD_PATTERN.test(fieldKey("checkin:12", "mood"))).toBe(true);
    expect(FIELD_PATTERN.test("I felt low")).toBe(false);
  });
});

describe("v3 figure answers fit the sealed answer limit (F-113)", () => {
  const bytes = (v: unknown) => Buffer.byteLength(JSON.stringify(v), "utf8");
  // A character that takes 3 bytes in UTF-8 and one maxLength unit.
  const wide = (n: number) => "\u0800".repeat(n);

  it("the fullest table stays under the limit", () => {
    const table = Array.from({ length: TABLE_MAX_ROWS }, () => Array.from({ length: TABLE_MAX_COLUMNS }, () => wide(TABLE_CELL_MAX_CHARS)));
    expect(bytes(table)).toBeLessThan(MAX_ANSWER_BYTES);
  });

  it("the fullest decision matrix stays under the limit", () => {
    const matrix = {
      options: Array.from({ length: MATRIX_MAX_OPTIONS }, () => wide(MATRIX_NAME_MAX_CHARS)),
      weights: Array.from({ length: TABLE_MAX_COLUMNS }, () => 5),
      scores: Array.from({ length: MATRIX_MAX_OPTIONS }, () => Array.from({ length: TABLE_MAX_COLUMNS }, () => 10)),
    };
    expect(bytes(matrix)).toBeLessThan(MAX_ANSWER_BYTES);
  });
});
