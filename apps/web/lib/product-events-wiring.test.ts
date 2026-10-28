import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CLIENT_EVENTS, PRODUCT_EVENTS, parseClientEvent } from "@/lib/product-events";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

// Where each event is counted. Every one of the 35 has a call site.
const WIRED: Record<string, string[]> = {
  streak_turned_on: ["app/(reader)/you/habit/actions.ts"],
  streak_turned_off: ["app/(reader)/you/habit/actions.ts"],
  milestone_reached: ["lib/habit/server.ts"],
  companion_shown: ["lib/habit/server.ts"],
  highlight_added: ["app/api/marks/route.ts"],
  note_added: ["app/api/marks/route.ts"],
  shortcut_sheet_opened: ["components/reader/ShortcutSheet.tsx"],
  then_now_checked_in: ["app/api/then-now/route.ts"],
  referral_link_shared: ["app/(reader)/you/invite/page.tsx"],
  referral_claimed: ["app/r/[code]/actions.ts"],
  referral_rewarded: ["lib/growth-webhook.ts"],
  author_link_visited: ["app/a/[code]/actions.ts"],
  gift_bought: ["lib/conversion-webhook.ts"],
  gift_claimed: ["app/gift/[token]/actions.ts"],
  workbook_gift_sent: ["app/(reader)/you/invite/actions.ts"],
  workbook_gift_claimed: ["app/send/[token]/actions.ts"],
  bundle_viewed: ["app/themes/[slug]/page.tsx"],
  bundle_bought: ["lib/conversion-webhook.ts"],
  student_verified: ["app/(reader)/student/verify/[token]/actions.ts"],
  pause_started: ["app/(reader)/you/membership/cancel/actions.ts"],
  pause_ended: ["app/(reader)/you/membership/cancel/actions.ts"],
  winback_sent: ["app/api/membership/winback/route.ts"],
  search_grouped_used: ["components/search/CatalogueSearch.tsx"],
  title_requested: ["app/request-title/action.ts"],
  author_followed: ["app/authors/[slug]/actions.ts"],
  studio_outline_generated: ["components/studio/OutlineGenerator.tsx"],
  builder_saved: ["app/studio/workbooks/[id]/build/actions.ts"],
  org_plan_started: ["lib/org-billing-webhook.ts"],
  pack_bought: ["lib/org-billing-webhook.ts"],
  newsletter_confirmed: ["app/newsletter/actions.ts"],
  push_enabled: ["components/push/actions.ts"],
  passkey_added: ["app/verify/passkey-actions.ts"],
  friend_paired: ["app/friend/[token]/actions.ts"],
  certificate_viewed: ["app/(reader)/you/certificates/[slug]/page.tsx"],
  quote_image_made: ["app/api/quote-image/route.tsx"],
};

describe("event wiring", () => {
  it("has a call site for every event", () => {
    expect(PRODUCT_EVENTS.filter((e) => !(e in WIRED))).toEqual([]);
    expect(Object.keys(WIRED).filter((e) => !(PRODUCT_EVENTS as readonly string[]).includes(e))).toEqual([]);
  });

  it("really names each event in its file", () => {
    for (const [event, files] of Object.entries(WIRED)) {
      for (const f of files) expect(read(f), `${event} in ${f}`).toContain(`"${event}"`);
    }
  });

  it("never passes text to the counter: the options carry only user, workbook, tenant and tier", () => {
    const files = new Set(Object.values(WIRED).flat());
    const allowed = new Set(["userId", "workbookId", "tenantId", "tier"]);
    for (const f of files) {
      for (const m of read(f).matchAll(/(?:countEvent|countEventServer)\(([^;]*?)\);/g)) {
        const opts = /\{([^}]*)\}/.exec(m[1]!)?.[1] ?? "";
        const keys = opts.split(",").map((k) => k.split(":")[0]!.trim()).filter(Boolean);
        for (const k of keys) expect(allowed.has(k), `${f}: ${m[1]}`).toBe(true);
      }
      for (const m of read(f).matchAll(/trackClientEvent\(([^()]*)\)/g)) expect(m[1], f).toMatch(/^"[a-z_]+"$|^countAs$/);
    }
  });
});

describe("the browser event endpoint", () => {
  it("accepts exactly one key, from the client list", () => {
    for (const e of CLIENT_EVENTS) expect(parseClientEvent({ event: e })).toBe(e);
    expect(parseClientEvent({ event: "gift_bought" })).toBeNull();
    expect(parseClientEvent({ event: "highlight_added", note: "my private thought" })).toBeNull();
    expect(parseClientEvent({ event: "search_grouped_used", q: "anxiety" })).toBeNull();
    expect(parseClientEvent({})).toBeNull();
    expect(parseClientEvent(null)).toBeNull();
    expect(parseClientEvent([])).toBeNull();
    expect(parseClientEvent("search_grouped_used")).toBeNull();
  });

  it("only names browser moments", () => {
    expect([...CLIENT_EVENTS].sort()).toEqual(["referral_link_shared", "search_grouped_used", "shortcut_sheet_opened", "studio_outline_generated"]);
  });
});
