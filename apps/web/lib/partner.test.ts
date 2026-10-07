import { describe, expect, it } from "vitest";
import {
  calmLinkPage,
  cleanEmail,
  cleanName,
  cleanNote,
  cleanReply,
  hashToken,
  inviteErrorNotice,
  isSameOriginPost,
  isTokenShaped,
  mintToken,
  outcomeMessage,
  PARTNER_HEADERS,
  PARTNER_NOTICES,
  parseShareLevel,
  partnerNoticeText,
  partnerView,
  SHARE_LEVELS,
  type PartnerRow,
} from "./partner";

const h = (m: Record<string, string>) => ({ get: (k: string) => m[k.toLowerCase()] ?? null });

const row = (over: Partial<PartnerRow> = {}): PartnerRow => ({
  partner_name: "Jo",
  partner_email: "jo@example.test",
  reader_name: "Sam",
  share_level: 1,
  include_wellbeing: false,
  note: null,
  note_sent_at: null,
  status: "invited",
  stopped_by: null,
  invited_at: "2026-10-01T10:00:00Z",
  invite_expires_at: "2026-10-15T10:00:00Z",
  responded_at: null,
  stopped_at: null,
  ...over,
});

describe("cleaning", () => {
  it("keeps names to letters, spaces, apostrophes and hyphens", () => {
    expect(cleanName("  Jo-Anne O'Neil  ")).toBe("Jo-Anne O'Neil");
    expect(cleanName("Sam <script>")).toBe("Sam script");
    expect(cleanName("Zoë 2 http://x.y")).toBe("Zoë httpxy");
    expect(cleanName("a".repeat(50))).toHaveLength(30);
    expect(cleanName(null)).toBe("");
  });

  it("takes links, addresses and phone numbers out of notes and replies", () => {
    expect(cleanNote("Call me on +44 7700 900123 or mail a@b.co")).toBe("Call me on or mail");
    expect(cleanNote("See https://example.com/x and www.thing.org")).toBe("See and");
    expect(cleanNote("visit example.co.uk now")).toBe("visit now");
    expect(cleanReply("<b>Proud</b> of you")).toBe("bProud/b of you");
    expect(cleanNote("x".repeat(300))).toHaveLength(200);
    expect(cleanReply("x".repeat(300))).toHaveLength(280);
  });

  it("accepts a plain email and lower-cases it", () => {
    expect(cleanEmail(" Jo@Example.TEST ")).toBe("jo@example.test");
    expect(cleanEmail("jo@example")).toBeNull();
    expect(cleanEmail("not an email")).toBeNull();
  });

  it("parses share levels 1 to 3 only", () => {
    expect(parseShareLevel("2")).toBe(2);
    expect(parseShareLevel(3)).toBe(3);
    expect(parseShareLevel("4")).toBeNull();
    expect(parseShareLevel("")).toBeNull();
  });
});

describe("tokens", () => {
  it("mints 43-character base64url tokens with 256 bits", () => {
    const t = mintToken();
    expect(isTokenShaped(t)).toBe(true);
    expect(t).toHaveLength(43);
    expect(mintToken()).not.toBe(t);
    expect(mintToken(() => new Uint8Array(32).fill(255))).toBe("_".repeat(42) + "8");
  });

  it("hashes with sha256 hex, as the database expects", async () => {
    expect(await hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("refuses anything not token shaped", () => {
    expect(isTokenShaped("invalid")).toBe(false);
    expect(isTokenShaped("a".repeat(43) + "/")).toBe(false);
    expect(isTokenShaped(undefined)).toBe(false);
  });
});

describe("share levels", () => {
  it("never promise a title, a theme, answers or stage names", () => {
    for (const level of [1, 2, 3] as const) {
      const text = [SHARE_LEVELS[level].label, SHARE_LEVELS[level].detail, ...SHARE_LEVELS[level].partnerGets].join(" ");
      expect(text).not.toMatch(/title|theme|answer|workbook name|score/i);
    }
    expect(SHARE_LEVELS[1].partnerGets).toHaveLength(1);
    expect(SHARE_LEVELS[3].partnerGets.join(" ")).toContain("note");
  });
});

describe("the You page view", () => {
  const now = new Date("2026-10-07T12:00:00Z");
  it("shows the invitation while it lasts, then lets the reader ask again", () => {
    expect(partnerView(null, now).kind).toBe("none");
    expect(partnerView(row(), now).kind).toBe("invited");
    const lapsed = partnerView(row({ invite_expires_at: "2026-10-06T00:00:00Z" }), now);
    expect(lapsed.kind).toBe("ended");
  });
  it("says who stopped, plainly", () => {
    const byReader = partnerView(row({ status: "stopped", stopped_by: "reader", stopped_at: "2026-10-05T00:00:00Z" }), now);
    expect(byReader.kind === "ended" && byReader.line).toContain("They were told");
    const byPartner = partnerView(row({ status: "stopped", stopped_by: "partner", stopped_at: "2026-10-05T00:00:00Z" }), now);
    expect(byPartner.kind === "ended" && byPartner.line).toContain("Jo stopped the updates");
    expect(partnerView(row({ status: "accepted" }), now).kind).toBe("active");
  });
});

describe("notices and copy", () => {
  it("maps every 0012 error code", () => {
    expect(inviteErrorNotice("AKP03")).toBe("self");
    expect(inviteErrorNotice("AKP04")).toBe("blocked");
    expect(inviteErrorNotice("AKP05")).toBe("exists");
    expect(inviteErrorNotice("AKP06")).toBe("deletion-pending");
    expect(inviteErrorNotice("AKP29")).toBe("rate-limited");
    expect(inviteErrorNotice("XX000")).toBe("failed");
    expect(partnerNoticeText("nonsense")).toBeNull();
    expect(partnerNoticeText("stopped")).toContain("told");
  });

  it("uses UK English with no em dashes and no old name", () => {
    const all = [
      ...Object.values(PARTNER_NOTICES),
      ...(["expired", "revoked", "used", "unknown", "inactive"] as const).flatMap((s) => Object.values(calmLinkPage(s))),
      ...(["accepted", "declined", "reported", "stopped", "replied", "already", "invalid_message", "reply_limit", "failed"] as const).flatMap((o) =>
        Object.values(outcomeMessage(o, "Sam")),
      ),
      ...Object.values(SHARE_LEVELS).flatMap((l) => [l.label, l.detail, ...l.partnerGets]),
    ].join("\n");
    expect(all).not.toContain("—");
    expect(all).not.toMatch(/support partner/i);
    expect(all).not.toMatch(/\b(color|behavior|organize|recognize)\b/i);
  });

  it("gives the same calm page for any link that does not work", () => {
    expect(calmLinkPage("unknown").title).toBe("This link isn't working");
    expect(calmLinkPage("revoked").title).toBe(calmLinkPage("inactive").title);
    expect(outcomeMessage("replied", "sam").body).toMatch(/^Sam will see/);
  });
});

describe("request checks", () => {
  it("accepts only same-origin form posts", () => {
    expect(isSameOriginPost(h({ origin: "https://akana.test", host: "akana.test", "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(isSameOriginPost(h({ origin: "https://evil.test", host: "akana.test" }))).toBe(false);
    expect(isSameOriginPost(h({ origin: "https://akana.test", host: "akana.test", "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(isSameOriginPost(h({ host: "akana.test" }))).toBe(false);
  });

  it("never caches, never indexes and sends no referrer", () => {
    expect(PARTNER_HEADERS["Cache-Control"]).toContain("no-store");
    expect(PARTNER_HEADERS["X-Robots-Tag"]).toContain("noindex");
    expect(PARTNER_HEADERS["Referrer-Policy"]).toBe("no-referrer");
  });
});
