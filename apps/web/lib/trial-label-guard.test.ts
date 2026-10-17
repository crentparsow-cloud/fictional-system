import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Banned practice 23 (R4): "free" only where nothing is paid. A trial is
 * "14 days, then £X a month" (lib/membership-trial.ts trialLabel), never a
 * free trial. This reads the source of the web app and the email package
 * and fails on "free trial" wording in text that a reader can see.
 */

const root = fileURLToPath(new URL("../", import.meta.url));
const emails = fileURLToPath(new URL("../../../packages/emails/src/", import.meta.url));

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "e2e") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|json)$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

describe("trial wording", () => {
  it("never calls a membership trial free in app or email text", () => {
    const bad: string[] = [];
    for (const f of [...walk(join(root, "app")), ...walk(join(root, "components")), ...walk(join(root, "lib")), ...walk(join(root, "messages")), ...walk(emails)]) {
      readFileSync(f, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (/^\s*(\/\/|\*|\/\*)/.test(line)) return; // comments explain the rule
          if (/free[ -]trial|trial[^"'`]{0,30}\bfree\b|\bfree\b[^"'`]{0,30}trial|try[ -]free/i.test(line)) bad.push(`${f.replace(root, "")}:${i + 1}`);
        });
    }
    expect(bad).toEqual([]);
  });
});
