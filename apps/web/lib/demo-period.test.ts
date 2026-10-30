import { describe, expect, it } from "vitest";
import { demoFullyOpen } from "@/lib/demo-period";

describe("demoFullyOpen (demo period, remove before launch)", () => {
  it("is on for the demo period; turn it off with app.demo_fully_open() in 0070", () => {
    expect(demoFullyOpen()).toBe(true);
  });
});
