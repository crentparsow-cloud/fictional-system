import { describe, expect, it } from "vitest";
import { LAUNCH_MARKETS, MARKETS, formatLongDate, formatMoney, helpNowFor, marketFor, resolveCountry } from "./markets";

describe("markets", () => {
  it("has six launch markets and a fallback", () => {
    expect(LAUNCH_MARKETS).toHaveLength(6);
    expect(Object.keys(MARKETS)).toHaveLength(7);
    expect(marketFor("gb").code).toBe("GB");
    expect(marketFor("FR").code).toBe("XX");
    expect(marketFor(null).code).toBe("XX");
  });

  it("formats money and dates per market", () => {
    expect(formatMoney(1400, MARKETS.GB)).toBe("£14.00");
    expect(formatMoney(1400, MARKETS.US)).toBe("$14.00");
    expect(formatLongDate("2026-11-30T12:00:00Z", MARKETS.GB)).toBe("30 November 2026");
    expect(formatLongDate("2026-11-30T12:00:00Z", MARKETS.US)).toBe("November 30, 2026");
  });

  it("maps Help now lines by country", () => {
    expect(helpNowFor("GB").map((l) => l.label)).toEqual(["Samaritans", "Shout"]);
    expect(helpNowFor("ZZ")[0]?.how).toBe("Website");
  });

  it("trusts a manual choice over device over network", () => {
    expect(resolveCountry([{ country: "us", source: "ip" }, { country: "gb", source: "manual" }, { country: "ie", source: "device" }])).toEqual({ country: "GB", source: "manual" });
    expect(resolveCountry([null, { country: "ie", source: "device" }, { country: "us", source: "ip" }])).toEqual({ country: "IE", source: "device" });
    expect(resolveCountry([{ country: "bad", source: "manual" }])).toBeNull();
  });
});
