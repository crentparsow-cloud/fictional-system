import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createRateLimiter } from "@/lib/rate-limit";
import {
  INITIAL_NOTICE_STATE,
  earliestReinstateDate,
  parseCounter,
  parseNotice,
  processNotice,
  statementOfReasons,
  takedownErrorNotice,
  type SubmitNoticeArgs,
} from "./takedown";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const goodNotice = {
  basis: "copyright",
  relationship: "owner",
  name: "Rights Holder",
  email: "rights@example.com",
  address: "1 High Street, London",
  phone: "+44 20 7946 0000",
  work: "My Book, chapter 3",
  location: "https://akana.example/w/some-workbook",
  explanation: "Unit 2 copies chapter 3 word for word.",
  good_faith: "yes",
  accurate: "yes",
  signature: "Rights Holder",
};

const goodCounter = {
  reference: "tn-1a2b3c4d5e",
  relationship: "uploader",
  name: "Author X",
  email: "x@example.com",
  address: "2 Low Street",
  phone: "0207 946 0001",
  location: "AK-1A2B3",
  explanation: "It is my own book.",
  good_faith: "yes",
  accurate: "yes",
  jurisdiction: "yes",
  signature: "Author X",
};

describe("parseNotice", () => {
  it("accepts a complete copyright notice", () => {
    const r = parseNotice({ ...goodNotice, good_faith: true, accurate: true });
    expect(r.ok).toBe(true);
  });
  it("needs the statements, a phone for copyright and a principal for an agent", () => {
    const r = parseNotice({ ...goodNotice, phone: "", relationship: "agent", good_faith: false, accurate: true });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Object.keys(r.fieldErrors).sort()).toEqual(["acting_for", "good_faith", "phone"]);
    }
  });
  it("does not need a work or phone for other unlawful content", () => {
    const r = parseNotice({ ...goodNotice, basis: "other_illegal", work: "", phone: "", good_faith: true, accurate: true });
    expect(r.ok).toBe(true);
  });
  it("needs a work for a trade mark notice", () => {
    const r = parseNotice({ ...goodNotice, basis: "trade_mark", work: "", good_faith: true, accurate: true });
    expect(r.ok).toBe(false);
  });
});

describe("parseCounter", () => {
  it("accepts a complete counter-notice and upper-cases the reference", () => {
    const r = parseCounter({ ...goodCounter, good_faith: true, accurate: true, jurisdiction: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.reference).toBe("TN-1A2B3C4D5E");
  });
  it("needs consent to jurisdiction and a valid reference", () => {
    const r = parseCounter({ ...goodCounter, reference: "CN-1", good_faith: true, accurate: true, jurisdiction: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.fieldErrors).sort()).toEqual(["jurisdiction", "reference"]);
  });
});

describe("processNotice", () => {
  const deps = (submit: (a: SubmitNoticeArgs) => Promise<{ reference: string | null; error: { code?: string } | null }>) => ({
    submit,
    ip: "203.0.113.9",
    salt: "test-salt",
    limiter: createRateLimiter({ limit: 5, windowMs: 3_600_000 }),
  });

  it("sends a hashed address, never the raw IP, and returns the reference", async () => {
    let seen: SubmitNoticeArgs | null = null;
    const r = await processNotice(
      "notice",
      INITIAL_NOTICE_STATE,
      form(goodNotice),
      deps(async (a) => {
        seen = a;
        return { reference: "TN-0000000001", error: null };
      }),
    );
    expect(r).toEqual({ status: "success", attempt: 1, reference: "TN-0000000001" });
    expect(seen!.p_ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(seen)).not.toContain("203.0.113.9");
    expect(seen!.p_kind).toBe("notice");
    expect(seen!.p_jurisdiction).toBeNull();
  });

  it("sends a counter-notice with its parent reference", async () => {
    let seen: SubmitNoticeArgs | null = null;
    const r = await processNotice(
      "counter_notice",
      INITIAL_NOTICE_STATE,
      form(goodCounter),
      deps(async (a) => {
        seen = a;
        return { reference: "CN-0000000001", error: null };
      }),
    );
    expect(r.status).toBe("success");
    expect(seen!.p_parent_reference).toBe("TN-1A2B3C4D5E");
    expect(seen!.p_jurisdiction).toBe(true);
    expect(seen!.p_basis).toBeNull();
  });

  it("maps database refusals to calm messages", async () => {
    const r = await processNotice("counter_notice", INITIAL_NOTICE_STATE, form(goodCounter), deps(async () => ({ reference: null, error: { code: "AKN04" } })));
    expect(r.status).toBe("error");
    if (r.status === "error") expect(r.fieldErrors.reference).toBeTruthy();
    const r2 = await processNotice("notice", INITIAL_NOTICE_STATE, form(goodNotice), deps(async () => ({ reference: null, error: { code: "AKN29" } })));
    if (r2.status === "error") expect(r2.message).toMatch(/last hour/);
  });

  it("stores nothing for a bot", async () => {
    let called = false;
    const r = await processNotice(
      "notice",
      INITIAL_NOTICE_STATE,
      form({ ...goodNotice, website: "https://spam.example" }),
      deps(async () => {
        called = true;
        return { reference: "TN-0000000001", error: null };
      }),
    );
    expect(called).toBe(false);
    expect(r.status).toBe("error");
  });

  it("keeps what was typed when the form needs fixing", async () => {
    const r = await processNotice("notice", INITIAL_NOTICE_STATE, form({ ...goodNotice, email: "nope" }), deps(async () => ({ reference: "x", error: null })));
    expect(r.status).toBe("error");
    if (r.status === "error") {
      expect(r.fieldErrors.email).toBeTruthy();
      expect(r.values.name).toBe("Rights Holder");
    }
  });
});

describe("statementOfReasons", () => {
  const base = {
    workbookCode: "AK-1A2B3",
    workbookTitle: "A Workbook",
    basis: "copyright",
    noticeReference: "TN-1A2B3C4D5E",
    noticeDate: new Date("2026-10-01T10:00:00Z"),
    decisionDate: new Date("2026-10-03T10:00:00Z"),
    buyersKeepAccess: true,
    facts: "Unit 2 matches chapter 3.",
  };
  it("covers the Article 17 points in plain words", () => {
    const s = statementOfReasons(base);
    expect(s).toContain("AK-1A2B3");
    expect(s).toContain("TN-1A2B3C4D5E");
    expect(s).toContain("3 October 2026");
    expect(s).toContain("No automated means");
    expect(s).toContain("counter-notice");
    expect(s).toContain("out-of-court");
    expect(s).toContain("can still open it");
    expect(s).not.toMatch(/—/);
  });
  it("says buyers lose access when they do", () => {
    expect(statementOfReasons({ ...base, buyersKeepAccess: false, facts: "" })).toContain("can no longer open it");
  });
});

describe("earliestReinstateDate", () => {
  it("counts ten business days, skipping weekends", () => {
    // Wednesday 7 October 2026 plus 10 business days is Wednesday 21 October.
    expect(earliestReinstateDate(new Date("2026-10-07T15:00:00Z")).toISOString().slice(0, 10)).toBe("2026-10-21");
    // Friday 9 October: Friday 23 October.
    expect(earliestReinstateDate(new Date("2026-10-09T09:00:00Z")).toISOString().slice(0, 10)).toBe("2026-10-23");
  });
});

describe("takedownErrorNotice", () => {
  it("maps codes", () => {
    expect(takedownErrorNotice("AKN01")).toBe("denied");
    expect(takedownErrorNotice("AKN02")).toBe("td_invalid");
    expect(takedownErrorNotice("AKN08")).toBe("td_state");
    expect(takedownErrorNotice(undefined)).toBe("failed");
  });
});
