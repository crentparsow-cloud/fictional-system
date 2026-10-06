import { describe, expect, it } from "vitest";
import { LAUNCH_MARKETS } from "./markets";
import { EMERGENCY_LINES, SUPPORT_CHECKED, SUPPORT_GROUPS, SUPPORT_LINES, contactHref, emergencyFor, regionFromAcceptLanguage, supportLinesFor } from "./support-lines";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

describe("support lines data", () => {
  it("every line has a market, name, number, hours field and a verified date", () => {
    expect(SUPPORT_LINES.length).toBeGreaterThan(0);
    for (const line of SUPPORT_LINES) {
      expect(["US", "GB", "CA", "AU", "IE", "NZ", "XX"]).toContain(line.market);
      expect(SUPPORT_GROUPS.map((g) => g.id)).toContain(line.group);
      expect(line.name.trim().length).toBeGreaterThan(0);
      expect(line.number.trim().length).toBeGreaterThan(0);
      expect(line.how.trim().length).toBeGreaterThan(0);
      expect(line.hours === null || typeof line.hours === "string").toBe(true);
      expect(line.url).toMatch(/^https:\/\//);
      expect(typeof line.verified).toBe("boolean");
      expect(line.verifiedOn).toMatch(DATE);
      expect(Number.isNaN(Date.parse(line.verifiedOn))).toBe(false);
    }
    expect(SUPPORT_CHECKED).toMatch(DATE);
  });

  it("carries the legacy numbers exactly", () => {
    const gb = SUPPORT_LINES.filter((l) => l.market === "GB" && l.group === "crisis");
    expect(gb.map((l) => [l.name, l.number])).toEqual([
      ["Samaritans", "116 123"],
      ["Shout", "85258"],
      ["NHS 111 (England), mental health option", "111"],
      ["NHS 24 (Scotland), mental health option", "111"],
      ["NHS 111 Wales, mental health", "111"],
    ]);
    expect(SUPPORT_LINES.find((l) => l.name === "Cruse Bereavement Support")?.hours).toBe("Mon, Wed, Thu, Fri 9:30am to 5pm; Tue 1pm to 8pm");
    expect(SUPPORT_LINES).toHaveLength(57);
  });

  it("has an emergency line for every market and the finder for everywhere else", () => {
    for (const code of [...LAUNCH_MARKETS, "XX"] as const) expect(EMERGENCY_LINES.some((e) => e.market === code)).toBe(true);
    expect(emergencyFor("AU").number).toBe("000");
    expect(emergencyFor("XX").number).toBeNull();
    const xx = supportLinesFor("XX");
    expect(xx).toHaveLength(1);
    expect(xx[0]!.lines[0]!.url).toBe("https://findahelpline.com/");
  });

  it("groups lines per market in a fixed order and keeps notes", () => {
    const ca = supportLinesFor("CA");
    expect(ca.map((g) => g.id)).toEqual(["crisis", "abuse", "addiction", "gambling", "family", "grief"]);
    expect(ca.find((g) => g.id === "abuse")?.note).toMatch(/ShelterSafe/);
    const us = supportLinesFor("US");
    expect(us.find((g) => g.id === "grief")?.lines).toEqual([]);
  });

  it("builds tel, sms and https hrefs as the legacy app did", () => {
    expect(contactHref({ number: "116 123", how: "Call", url: "https://x" })).toBe("tel:116123");
    expect(contactHref({ number: "85258", how: "Text SHOUT to", url: "https://x" })).toBe("sms:85258");
    expect(contactHref({ number: "1-800-799-7233", how: "Call", url: "https://x" })).toBe("tel:18007997233");
    expect(contactHref({ number: "al-anon.org", how: "Website", url: "https://al-anon.org/" })).toBe("https://al-anon.org/");
  });

  it("reads a launch region from Accept-Language", () => {
    expect(regionFromAcceptLanguage("en-GB,en;q=0.9", LAUNCH_MARKETS)).toBe("GB");
    expect(regionFromAcceptLanguage("fr-CA,en-US;q=0.8", LAUNCH_MARKETS)).toBe("CA");
    expect(regionFromAcceptLanguage("de-DE,de;q=0.9", LAUNCH_MARKETS)).toBeNull();
    expect(regionFromAcceptLanguage(null, LAUNCH_MARKETS)).toBeNull();
  });
});
