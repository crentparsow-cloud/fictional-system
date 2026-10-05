import { describe, expect, it } from "vitest";
import { resolveTenant } from "./tenant";

describe("resolveTenant", () => {
  it("treats localhost and Vercel previews as the marketplace", () => {
    expect(resolveTenant("localhost:3000")).toEqual({ slug: "akana", kind: "marketplace" });
    expect(resolveTenant("akana-git-main-crentparsow.vercel.app")).toEqual({ slug: "akana", kind: "marketplace" });
  });

  it("returns null for an unknown host", () => {
    expect(resolveTenant("evil.example.com")).toBeNull();
    expect(resolveTenant("")).toBeNull();
  });
});
