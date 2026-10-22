import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The streak must reach a reader's progress only through the database
 * function that is limited to titles outside the wellbeing tiers (0049).
 * These checks keep a later change from adding a second, unguarded path.
 */
const dir = join(__dirname);
const sources = readdirSync(dir)
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
  .map((f) => [f, readFileSync(join(dir, f), "utf8")] as const);

describe("the streak data path", () => {
  it("never reads progress events directly from the habit code", () => {
    for (const [f, src] of sources) expect(src, f).not.toMatch(/from\(["']progress_events["']\)/);
  });

  it("reads step days only through habit_step_days", () => {
    const users = sources.filter(([, src]) => /habit_step_days/.test(src)).map(([f]) => f);
    expect(users).toEqual(["server.ts"]);
  });

  it("has no leaderboard, ranking or comparison", () => {
    for (const [f, src] of sources) expect(src.replace(/\/\*[\s\S]*?\*\//g, ""), f).not.toMatch(/leaderboard|rank(ing)?\b|compare|other readers/i);
  });
});
