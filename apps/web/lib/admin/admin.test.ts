import { describe, expect, it } from "vitest";
import {
  formatAdminDate,
  isLeadStatus,
  isUuid,
  leadStatusTargets,
  mailtoHref,
  parseLeadStatusChange,
  parseLeadStatusFilter,
} from "./leads";
import { embeddedCount, parseOrganisationForm, slugify } from "./organisations";
import { adminAbilities, ORGANISATION_INSERT_ALLOWED } from "./permissions";
import {
  filterWorkbooks,
  killSwitchAction,
  killSwitchErrorNotice,
  killSwitchTarget,
  parsePauseReason,
  parseWorkbookCode,
  parseWorkbookSearch,
  workbookStatusLabel,
} from "./workbooks";

const form = (values: Record<string, string>) => (k: string) => values[k] ?? null;

describe("adminAbilities", () => {
  it("gives owner and editor every action", () => {
    for (const role of ["owner", "editor"]) {
      expect(adminAbilities([role])).toEqual({
        readLeads: true,
        updateLeads: true,
        readWorkbooks: true,
        pauseWorkbooks: true,
        readOrganisations: true,
        createOrganisations: true,
        readReviewQueue: true,
        releaseVersions: true,
        curateCatalogue: true,
        readFunnel: true,
        readOps: true,
        acknowledgeOps: true,
        readSupport: true,
        updateSupport: true,
      });
    }
  });

  it("lets support work leads but only read workbooks and organisations", () => {
    const a = adminAbilities(["support"]);
    expect(a.readLeads && a.updateLeads).toBe(true);
    expect(a.readWorkbooks).toBe(true);
    expect(a.pauseWorkbooks).toBe(false);
    expect(a.createOrganisations).toBe(false);
  });

  it("keeps leads from safety reviewers and finance", () => {
    for (const role of ["safety_reviewer", "finance"]) {
      const a = adminAbilities([role]);
      expect(a.readLeads).toBe(false);
      expect(a.pauseWorkbooks).toBe(false);
      expect(a.readWorkbooks).toBe(true);
    }
  });

  it("gives nothing to unknown or missing roles", () => {
    for (const roles of [[], null, undefined, ["admin"], [42]]) {
      expect(Object.values(adminAbilities(roles)).some(Boolean)).toBe(false);
    }
  });

  it("combines roles", () => {
    expect(adminAbilities(["finance", "editor"]).pauseWorkbooks).toBe(true);
  });

  it("records that the database lets staff create organisations (0008)", () => {
    expect(ORGANISATION_INSERT_ALLOWED).toBe(true);
  });
});

describe("lead helpers", () => {
  it("knows the three statuses", () => {
    expect(isLeadStatus("new")).toBe(true);
    expect(isLeadStatus("contacted")).toBe(true);
    expect(isLeadStatus("closed")).toBe(true);
    expect(isLeadStatus("archived")).toBe(false);
    expect(isLeadStatus(undefined)).toBe(false);
  });

  it("parses the status filter and ignores anything else", () => {
    expect(parseLeadStatusFilter("contacted")).toBe("contacted");
    expect(parseLeadStatusFilter(["closed", "new"])).toBe("closed");
    expect(parseLeadStatusFilter("all")).toBeNull();
    expect(parseLeadStatusFilter(undefined)).toBeNull();
  });

  it("offers the other two statuses as targets", () => {
    expect(leadStatusTargets("new")).toEqual(["contacted", "closed"]);
    expect(leadStatusTargets("closed")).toEqual(["new", "contacted"]);
  });

  it("reads a status change only with a uuid and a known status", () => {
    const id = "3F2504E0-4F89-11D3-9A0C-0305E82C3301";
    expect(parseLeadStatusChange(form({ id, status: "closed" }))).toEqual({ id: id.toLowerCase(), status: "closed" });
    expect(parseLeadStatusChange(form({ id, status: "deleted" }))).toBeNull();
    expect(parseLeadStatusChange(form({ id: "1 or 1=1", status: "new" }))).toBeNull();
    expect(isUuid("not-a-uuid")).toBe(false);
  });

  it("builds a mailto link only for an address", () => {
    expect(mailtoHref("ana@example.com")).toBe("mailto:ana@example.com");
    expect(mailtoHref(" ana@example.com ")).toBe("mailto:ana@example.com");
    expect(mailtoHref("javascript:alert(1)")).toBeNull();
    expect(mailtoHref("a@b.c?bcc=x@y.z\"")).toBeNull();
    expect(mailtoHref(null)).toBeNull();
  });

  it("formats dates in UK form and tolerates bad input", () => {
    expect(formatAdminDate("2026-10-07T09:00:00Z")).toBe("7 Oct 2026");
    expect(formatAdminDate("nonsense")).toBe("");
    expect(formatAdminDate(null)).toBe("");
  });
});

describe("kill switch helpers", () => {
  it("offers pause for live, resume for paused, nothing else", () => {
    expect(killSwitchAction("live")).toBe("pause");
    expect(killSwitchAction("paused")).toBe("resume");
    for (const s of ["draft", "in_review", "approved", "retired"]) expect(killSwitchAction(s)).toBeNull();
  });

  it("moves only live to paused and paused to live", () => {
    expect(killSwitchTarget("pause", "live")).toBe("paused");
    expect(killSwitchTarget("resume", "paused")).toBe("live");
    expect(killSwitchTarget("pause", "paused")).toBeNull();
    expect(killSwitchTarget("resume", "live")).toBeNull();
    expect(killSwitchTarget("resume", "retired")).toBeNull();
    expect(killSwitchTarget("pause", "draft")).toBeNull();
  });

  it("needs a reason to pause and to resume", () => {
    expect(parsePauseReason("pause", "  Licence dispute ")).toEqual({ ok: true, reason: "Licence dispute" });
    expect(parsePauseReason("pause", "   ")).toEqual({ ok: false });
    expect(parsePauseReason("pause", "x".repeat(501))).toEqual({ ok: false });
    expect(parsePauseReason("resume", "")).toEqual({ ok: false });
    expect(parsePauseReason("resume", null)).toEqual({ ok: false });
    expect(parsePauseReason("resume", " Licence agreed ")).toEqual({ ok: true, reason: "Licence agreed" });
  });

  it("maps database refusals to admin notices", () => {
    expect(killSwitchErrorNotice("42501")).toBe("denied");
    expect(killSwitchErrorNotice("55000")).toBe("stale");
    expect(killSwitchErrorNotice("23514")).toBe("reason");
    expect(killSwitchErrorNotice("P0002")).toBe("invalid");
    expect(killSwitchErrorNotice(undefined)).toBe("failed");
  });

  it("normalises AK codes and refuses anything else", () => {
    expect(parseWorkbookCode(" ak-7h3kq ")).toBe("AK-7H3KQ");
    expect(parseWorkbookCode("AK-7H3KI")).toBeNull();
    expect(parseWorkbookCode("AU-7H3KQ")).toBeNull();
    expect(parseWorkbookCode(undefined)).toBeNull();
  });

  it("searches by code or title, case-insensitive", () => {
    const rows = [
      { code: "AK-7H3KQ", title: "Plain Words for Hard Nights" },
      { code: "AK-2B4CD", title: "The Calm Ledger" },
    ];
    expect(filterWorkbooks(rows, "")).toHaveLength(2);
    expect(filterWorkbooks(rows, "7h3")).toEqual([rows[0]]);
    expect(filterWorkbooks(rows, "LEDGER")).toEqual([rows[1]]);
    expect(filterWorkbooks(rows, "%")).toEqual([]);
    expect(parseWorkbookSearch(["  calm  "])).toBe("calm");
    expect(parseWorkbookSearch("x".repeat(150))).toHaveLength(100);
  });

  it("labels known statuses and passes unknown ones through", () => {
    expect(workbookStatusLabel("in_review")).toBe("In review");
    expect(workbookStatusLabel("mystery")).toBe("mystery");
  });
});

describe("organisation helpers", () => {
  it("slugifies display names to match the slug check", () => {
    expect(slugify("Harbour & Pine Press")).toBe("harbour-and-pine-press");
    expect(slugify("  Éditions Ãlba ")).toBe("editions-alba");
    expect(slugify("!!!")).toBe("");
    expect(slugify("a".repeat(80))).toHaveLength(60);
  });

  it("accepts a complete form", () => {
    const r = parseOrganisationForm(form({ kind: "publisher", display_name: "Harbour Press", legal_name: "Harbour Press Ltd", country: "gb" }));
    expect(r).toEqual({
      ok: true,
      value: { kind: "publisher", display_name: "Harbour Press", legal_name: "Harbour Press Ltd", country: "GB", slug: "harbour-press" },
    });
  });

  it("refuses the house kind and names each bad field", () => {
    const r = parseOrganisationForm(form({ kind: "akana_house", display_name: "", legal_name: "", country: "GBR" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["country", "display_name", "kind", "legal_name"]);
  });

  it("refuses a display name with no letters or numbers", () => {
    const r = parseOrganisationForm(form({ kind: "individual", display_name: "***", legal_name: "A Person", country: "IE" }));
    expect(r.ok).toBe(false);
  });

  it("reads an embedded count", () => {
    expect(embeddedCount([{ count: 3 }])).toBe(3);
    expect(embeddedCount([])).toBe(0);
    expect(embeddedCount(null)).toBe(0);
    expect(embeddedCount([{ count: "3" }])).toBe(0);
  });
});
