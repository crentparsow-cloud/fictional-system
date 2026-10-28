import { describe, expect, it } from "vitest";
import { headerActions, parseSessionBody } from "./site-header";

describe("headerActions", () => {
  it("offers sign in and the trial when signed out", () => {
    expect(headerActions(false).map((a) => a.label)).toEqual(["Sign in", "Try week 1 free"]);
  });
  it("offers You and Today when signed in", () => {
    expect(headerActions(true).map((a) => a.label)).toEqual(["You", "Today"]);
  });
});

describe("parseSessionBody", () => {
  it("is true only for an explicit signedIn true", () => {
    expect(parseSessionBody({ signedIn: true })).toBe(true);
    expect(parseSessionBody({ signedIn: false })).toBe(false);
    expect(parseSessionBody({ signedIn: "true" })).toBe(false);
    expect(parseSessionBody(null)).toBe(false);
    expect(parseSessionBody("x")).toBe(false);
  });
});
