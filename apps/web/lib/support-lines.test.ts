import { describe, expect, it } from "vitest";
import { LAUNCH_MARKETS } from "./markets";
import {
  EMERGENCY_LINES,
  SIGNPOSTS_CHECKED,
  SIGNPOST_GROUPS,
  SUPPORT_CHECKED,
  SUPPORT_GROUPS,
  SUPPORT_LINES,
  contactHref,
  emergencyFor,
  regionFromAcceptLanguage,
  signpostFor,
  signpostHref,
  supportLinesFor,
} from "./support-lines";

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
      ["Lifeline (Northern Ireland)", "0808 808 8000"],
    ]);
    const gbAbuse = SUPPORT_LINES.filter((l) => l.market === "GB" && l.group === "abuse").map((l) => l.number);
    expect(gbAbuse).toEqual(["0808 2000 247", "0800 027 1234", "0808 80 10 800", "0808 802 1414"]);
    expect(SUPPORT_LINES.find((l) => l.name === "Cruse Bereavement Support")?.hours).toBe("Mon, Wed, Thu, Fri 9:30am to 5pm; Tue 1pm to 8pm");
    expect(SUPPORT_LINES).toHaveLength(60);
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

describe("signposts (F-154)", () => {
  it("carries the five groups for every launch market, US bereavement and everywhere else null", () => {
    expect(SIGNPOST_GROUPS.map((g) => g.id)).toEqual([
      "money_worries_lines",
      "eating_support_lines",
      "bereavement_support_lines",
      "new_parent_support_lines",
      "carer_support_lines",
    ]);
    for (const g of SIGNPOST_GROUPS) {
      for (const m of ["GB", "CA", "AU", "IE", "NZ"] as const) expect(signpostFor(g.id, m)?.lines.length).toBeGreaterThan(0);
      expect(signpostFor(g.id, "XX")).toBeNull();
      if (g.id === "bereavement_support_lines") expect(signpostFor(g.id, "US")).toBeNull();
      else expect(signpostFor(g.id, "US")?.lines.length).toBeGreaterThan(0);
    }
  });

  it("covers Scotland and Northern Ireland within GB", () => {
    const names = (id: string) => signpostFor(id, "GB")!.lines.map((l) => l.name);
    expect(names("money_worries_lines")).toEqual(expect.arrayContaining(["Citizens Advice Scotland Money Talk Team", "Advice NI (Northern Ireland)"]));
    expect(names("bereavement_support_lines")).toContain("Cruse Scotland");
    expect(names("new_parent_support_lines")).toEqual(expect.arrayContaining(["Children First Support Line (Scotland)", "Parenting NI Support Line (Northern Ireland)"]));
    const ni = signpostFor("new_parent_support_lines", "GB")!.lines.find((l) => l.name.startsWith("Parenting NI"))!;
    expect(ni.number).toBeNull();
    expect(signpostHref(ni)).toBe(ni.url);
  });

  it("dates and links every line, with a verified number or none", () => {
    for (const g of SIGNPOST_GROUPS) {
      for (const line of (["US", "GB", "CA", "AU", "IE", "NZ"] as const).flatMap((m) => signpostFor(g.id, m)?.lines ?? [])) {
        expect(line.url).toMatch(/^https:\/\//);
        expect(line.verifiedOn).toBe(SIGNPOSTS_CHECKED);
        if (line.number === null) expect(line.verified).toBe(false);
        expect(line.name.trim().length).toBeGreaterThan(0);
      }
    }
    expect(SIGNPOSTS_CHECKED).toMatch(DATE);
  });

  it("ignores unknown ids and builds hrefs", () => {
    expect(signpostFor("when_home_is_not_safe", "GB")).toBeNull();
    expect(signpostFor(null, "GB")).toBeNull();
    const money = signpostFor("money_worries_lines", "GB")!;
    expect(money.title).toBe("Money worries");
    expect(signpostHref(money.lines[0]!)).toBe("tel:08000113797");
    expect(signpostHref({ ...money.lines[0]!, number: null })).toBe(money.lines[0]!.url);
  });

  it("matches the registry file", async () => {
    const file = (await import("../../../content/catalog/support_lines.json")).default as unknown as {
      signposts: { groups: Record<string, { markets: Record<string, { label: string; number: string | null; hours: string | null; url: string }[] | null> }> };
    };
    for (const g of SIGNPOST_GROUPS) {
      const markets = file.signposts.groups[g.id]!.markets;
      for (const [m, lines] of Object.entries(markets)) {
        const ts = signpostFor(g.id, m as never)?.lines ?? null;
        if (lines === null) expect(ts).toBeNull();
        else expect(ts?.map((l) => [l.name, l.number, l.hours, l.url])).toEqual(lines.map((l) => [l.label, l.number, l.hours, l.url]));
      }
    }
  });

  it("keeps the Help now hub list unchanged", () => {
    expect(SUPPORT_GROUPS).toHaveLength(6);
  });
});
