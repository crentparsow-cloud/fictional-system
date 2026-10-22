import { describe, expect, it } from "vitest";
import { DEFAULT_OFFER_TIMING, offerTimingFrom, offerUseFrom, usedEnough } from "./offer-timing";

describe("offer timing config", () => {
  it("reads the three figures", () => {
    expect(offerTimingFrom([{ key: "offer_after_steps", value: 8 }, { key: "offer_after_days", value: 10 }, { key: "offer_after_samples", value: 3 }])).toEqual({ afterSteps: 8, afterDays: 10, afterSamples: 3 });
  });
  it("falls back for anything missing or unusable", () => {
    expect(offerTimingFrom(null)).toEqual(DEFAULT_OFFER_TIMING);
    expect(offerTimingFrom([{ key: "offer_after_steps", value: 0 }, { key: "offer_after_days", value: "x" }, { key: "offer_after_samples", value: 2.5 }])).toEqual(DEFAULT_OFFER_TIMING);
  });
});

describe("real use", () => {
  const t = DEFAULT_OFFER_TIMING;
  it("is not enough after one sample and a few steps", () => {
    expect(usedEnough({ samples: 1, stepsAged: 2 }, t)).toBe(false);
  });
  it("is enough after a second sample", () => {
    expect(usedEnough({ samples: 2, stepsAged: 0 }, t)).toBe(true);
  });
  it("is enough after a first week with enough steps", () => {
    expect(usedEnough({ samples: 1, stepsAged: 5 }, t)).toBe(true);
  });
  it("is not enough with no use read", () => {
    expect(usedEnough(null, t)).toBe(false);
    expect(usedEnough(undefined, t)).toBe(false);
    expect(usedEnough({ samples: Number.NaN, stepsAged: Number.NaN }, t)).toBe(false);
  });
});

describe("the use row", () => {
  it("reads an array or a single row", () => {
    expect(offerUseFrom([{ samples: 2, steps_aged: 4 }])).toEqual({ samples: 2, stepsAged: 4 });
    expect(offerUseFrom({ samples: 1, steps_aged: 0 })).toEqual({ samples: 1, stepsAged: 0 });
  });
  it("gives null for nothing usable", () => {
    expect(offerUseFrom([])).toBeNull();
    expect(offerUseFrom(null)).toBeNull();
    expect(offerUseFrom([{ samples: "a" }])).toBeNull();
  });
});
