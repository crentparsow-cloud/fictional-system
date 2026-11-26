import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { makeSuppressionCheck } from "@/lib/mail-suppression";

vi.mock("server-only", () => ({}));

const client = (rows: unknown, error: { code?: string } | null = null) => {
  const rpc = vi.fn(async () => ({ data: rows, error }));
  return { rpc, make: () => ({ rpc }) };
};

describe("the suppression check the mailers use", () => {
  it("says a bounced address must not be mailed", async () => {
    const c = client([{ reason: "bounced", since: "2026-11-01T00:00:00Z" }]);
    const check = makeSuppressionCheck({ secret: "whsec_x", client: c.make });
    expect(await check(" Reader@Example.test ")).toBe(true);
    expect(c.rpc).toHaveBeenCalledWith("email_suppression_state", { p_email: "Reader@Example.test" });
  });

  it("says a complained address must not be mailed", async () => {
    const check = makeSuppressionCheck({ secret: "whsec_x", client: client([{ reason: "complained" }]).make });
    expect(await check("reader@example.test")).toBe(true);
  });

  it("lets an address with no record through", async () => {
    const check = makeSuppressionCheck({ secret: "whsec_x", client: client([]).make });
    expect(await check("reader@example.test")).toBe(false);
  });

  it("suppresses nothing, and asks nothing, while the webhook secret is blank", async () => {
    const c = client([{ reason: "bounced" }]);
    expect(await makeSuppressionCheck({ secret: "", client: c.make })("reader@example.test")).toBe(false);
    expect(await makeSuppressionCheck({ secret: undefined, client: c.make })("reader@example.test")).toBe(false);
    expect(c.rpc).not.toHaveBeenCalled();
  });

  it("does not stop mail when the lookup fails", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await makeSuppressionCheck({ secret: "whsec_x", client: client(null, { code: "42501" }).make })("a@example.test")).toBe(false);
    expect(
      await makeSuppressionCheck({
        secret: "whsec_x",
        client: () => {
          throw new Error("not configured");
        },
      })("a@example.test"),
    ).toBe(false);
    quiet.mockRestore();
  });
});

describe("every mailer is wired to the real check", () => {
  const roots = [join(__dirname, "..", "lib"), join(__dirname, "..", "app")];
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(p);
    }
  };
  roots.forEach(walk);

  it("no call site passes a check that always says no", () => {
    const stubbed = files.filter((f) => /isSuppressed:\s*(async\s*)?\(\s*\)\s*=>\s*false/.test(readFileSync(f, "utf8")));
    expect(stubbed).toEqual([]);
  });

  it("every createMailer call site imports the shared check", () => {
    const callers = files.filter((f) => /createMailer\(\{/.test(readFileSync(f, "utf8")));
    expect(callers.length).toBeGreaterThanOrEqual(20);
    const missing = callers.filter((f) => !/from "@\/lib\/mail-suppression"/.test(readFileSync(f, "utf8")));
    expect(missing).toEqual([]);
  });
});
