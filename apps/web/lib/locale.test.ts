import { describe, expect, it } from "vitest";
import { localeFromAcceptLanguage, translator } from "./locale";

describe("localeFromAcceptLanguage", () => {
  it("defaults to en-GB", () => {
    expect(localeFromAcceptLanguage(null)).toBe("en-GB");
    expect(localeFromAcceptLanguage("")).toBe("en-GB");
    expect(localeFromAcceptLanguage("fr-FR,fr;q=0.9")).toBe("en-GB");
    expect(localeFromAcceptLanguage("en-GB,en;q=0.8,en-US;q=0.6")).toBe("en-GB");
    expect(localeFromAcceptLanguage("en")).toBe("en-GB");
    expect(localeFromAcceptLanguage("en-AU,en;q=0.9")).toBe("en-GB");
  });

  it("picks en-US when the header prefers it", () => {
    expect(localeFromAcceptLanguage("en-US,en;q=0.9")).toBe("en-US");
    expect(localeFromAcceptLanguage("fr-CA,en-US;q=0.8,en-GB;q=0.7")).toBe("en-US");
    expect(localeFromAcceptLanguage("en-GB;q=0.5, en-US;q=0.9")).toBe("en-US");
    expect(localeFromAcceptLanguage("EN-us")).toBe("en-US");
  });
});

describe("translator", () => {
  it("reads the right set and fills placeholders", () => {
    expect(translator("en-GB")("welcome.required")).toBe("Please tick the box to continue.");
    expect(translator("en-US")("welcome.required")).toBe("Please check the box to continue.");
    expect(translator("en-GB")("nav.home")).toBe("Home");
  });
});
