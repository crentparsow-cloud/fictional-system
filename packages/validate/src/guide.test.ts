import { describe, expect, it } from "vitest";
import { validateGuide } from "./guide";

const good = {
  guide_version: "1",
  intro: "A short guide for the person leading the group.",
  safety: { help_now_reminder: true },
  units: [
    {
      unit_number: 1,
      minutes: 60,
      opening: { text: "Welcome everyone and say how the hour will run.", minutes: 5 },
      discussion: [
        { question: "What stood out for you this week?", minutes: 15 },
        { question: "What got in the way?", minutes: 15, follow_up: "What might make it easier next week?" },
      ],
      closing: { text: "Remind people where Help now is.", minutes: 5 },
    },
  ],
};

describe("validateGuide", () => {
  it("passes a good guide", () => {
    const r = validateGuide(good, { genre: "wellbeing", tier: "standard", unitNumbers: [1, 2] });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("refuses unknown keys and free text blocks the schema does not know", () => {
    const r = validateGuide({ ...good, notes_from_members: "x" }, { genre: "productivity", tier: "none" });
    expect(r.ok).toBe(false);
  });

  it("needs the Help now reminder on wellbeing titles only", () => {
    const off = { ...good, safety: { help_now_reminder: false } };
    expect(validateGuide(off, { genre: "wellbeing", tier: "standard" }).ok).toBe(false);
    expect(validateGuide(off, { genre: "productivity", tier: "none" }).ok).toBe(true);
  });

  it("catches claim words, em dashes and asking members to share answers", () => {
    const bad = structuredClone(good);
    bad.units[0]!.discussion[0]!.question = "Ask each person to read out their answers — it will cure anxiety.";
    const r = validateGuide(bad, { genre: "wellbeing", tier: "standard" });
    const msgs = r.errors.map((e) => e.message).join(" | ");
    expect(msgs).toMatch(/claim word/);
    expect(msgs).toMatch(/em dash/);
    expect(msgs).toMatch(/share or read out/);
  });

  it("checks units against the version and warns when timings overrun", () => {
    const long = structuredClone(good);
    long.units[0]!.minutes = 20;
    const r = validateGuide(long, { genre: "productivity", tier: "none", unitNumbers: [2] });
    expect(r.errors.some((e) => /not in this workbook version/.test(e.message))).toBe(true);
    expect(r.warnings.some((w) => /more than the 20 minute session/.test(w.message))).toBe(true);
  });

  it("refuses a unit listed twice", () => {
    const twice = { ...good, units: [good.units[0], good.units[0]] };
    expect(validateGuide(twice, { genre: "productivity", tier: "none" }).ok).toBe(false);
  });
});
