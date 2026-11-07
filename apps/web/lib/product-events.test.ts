import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_FUNNEL_EVENTS, ANALYTICS_EVENTS, FUNNEL_EVENTS, FUNNEL_LABELS } from "@/lib/admin/funnel";
import { HABIT_EVENTS, PRODUCT_EVENTS, PRODUCT_EVENT_LABELS, isProductEvent, scopedWorkbook, shouldCount } from "@/lib/product-events";

const REQUIRED = [
  "streak_turned_on", "streak_turned_off", "milestone_reached", "companion_shown", "highlight_added", "note_added", "shortcut_sheet_opened",
  "then_now_checked_in", "referral_link_shared", "referral_claimed", "referral_rewarded", "author_link_visited", "gift_bought", "gift_claimed",
  "workbook_gift_sent", "workbook_gift_claimed", "bundle_viewed", "bundle_bought", "student_verified", "pause_started", "pause_ended", "winback_sent",
  "search_grouped_used", "title_requested", "author_followed", "studio_outline_generated", "builder_saved", "org_plan_started", "pack_bought",
  "newsletter_confirmed", "push_enabled", "passkey_added", "friend_paired", "certificate_viewed", "quote_image_made",
];

describe("the product event list", () => {
  it("names every key moment in the brief, once", () => {
    expect([...PRODUCT_EVENTS].sort()).toEqual([...REQUIRED].sort());
    expect(new Set(PRODUCT_EVENTS).size).toBe(PRODUCT_EVENTS.length);
    expect(PRODUCT_EVENTS).toHaveLength(35);
  });

  it("joins the funnel list without clashing with an older name", () => {
    const old = [...FUNNEL_EVENTS, ...ANALYTICS_EVENTS] as string[];
    for (const e of PRODUCT_EVENTS) expect(old).not.toContain(e);
    expect(new Set(ALL_FUNNEL_EVENTS).size).toBe(ALL_FUNNEL_EVENTS.length);
    expect(ALL_FUNNEL_EVENTS).toHaveLength(46);
  });

  it("has a plain label for each, with no dashes or emoji", () => {
    for (const e of PRODUCT_EVENTS) {
      expect(PRODUCT_EVENT_LABELS[e]).toBeTruthy();
      expect(FUNNEL_LABELS[e]).toBe(PRODUCT_EVENT_LABELS[e]);
      expect(PRODUCT_EVENT_LABELS[e]).not.toMatch(/[–—]|\p{Extended_Pictographic}/u);
    }
  });

  it("uses names that cannot hold content: lower case words and underscores only, short", () => {
    for (const e of PRODUCT_EVENTS) expect(e).toMatch(/^[a-z]+(_[a-z]+)*$/);
    for (const e of PRODUCT_EVENTS) expect(e.length).toBeLessThanOrEqual(30);
  });

  it("matches the names the database accepts (migration 0067)", () => {
    const dir = join(__dirname, "../../../supabase/migrations");
    const file = readdirSync(dir).find((f) => f.startsWith("0067_"));
    expect(file).toBeTruthy();
    const sql = readFileSync(join(dir, file!), "utf8");
    const body = sql.split("create or replace function app.funnel_event_names()")[1]!.split("]::text[]")[0]!;
    const inSql = [...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(inSql).toEqual([...ALL_FUNNEL_EVENTS].sort());
  });

  it("recognises only listed names", () => {
    expect(isProductEvent("gift_bought")).toBe(true);
    expect(isProductEvent("purchase")).toBe(false);
    expect(isProductEvent("note: my private thought")).toBe(false);
    expect(isProductEvent(undefined)).toBe(false);
  });
});

describe("what an event may carry", () => {
  it("names a workbook only when its tier is none", () => {
    expect(scopedWorkbook("highlight_added", "none", "wb1")).toBe("wb1");
    expect(scopedWorkbook("highlight_added", "standard", "wb1")).toBeNull();
    expect(scopedWorkbook("highlight_added", "higher", "wb1")).toBeNull();
    expect(scopedWorkbook("highlight_added", null, "wb1")).toBeNull();
    expect(scopedWorkbook("highlight_added", undefined, "wb1")).toBeNull();
    expect(scopedWorkbook("highlight_added", "none", null)).toBeNull();
  });

  it("never names a workbook on a habit event", () => {
    for (const e of HABIT_EVENTS) expect(scopedWorkbook(e, "none", "wb1")).toBeNull();
  });

  it("does not count habit events on a mental health tier title", () => {
    for (const e of HABIT_EVENTS) {
      expect(shouldCount(e, "standard")).toBe(false);
      expect(shouldCount(e, "higher")).toBe(false);
      expect(shouldCount(e, "none")).toBe(true);
      expect(shouldCount(e, null)).toBe(true);
    }
    expect(shouldCount("gift_bought", "higher")).toBe(true);
  });
});
