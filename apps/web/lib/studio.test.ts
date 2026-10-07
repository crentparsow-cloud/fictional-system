import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  bioClaimFlags,
  checklist,
  cleanEmail,
  httpsUrl,
  isValidIsbn,
  LICENCE_FILE,
  LICENCE_VERSION,
  licenceTextState,
  OWNER_GRANTABLE_ROLES,
  parseIsbns,
  parseLicenceTerms,
  parseLinks,
  parseTerritories,
  roleCan,
  storedFileName,
  STUDIO_NOTICES,
  studioErrorNotice,
  studioNotice,
  withOrg,
} from "@/lib/studio";

const repo = path.resolve(__dirname, "..", "..", "..");

describe("licence text on file", () => {
  const raw = readFileSync(path.join(repo, "docs", "legal", LICENCE_FILE));
  const sha = createHash("sha256").update(raw).digest("hex");
  const migration = readFileSync(path.join(repo, "supabase", "migrations", "0013_author_onboarding.sql"), "utf8");

  it("is marked as a lawyer draft and carries its version", () => {
    const text = raw.toString("utf8");
    expect(text.startsWith("DRAFT for the lawyer.")).toBe(true);
    expect(text).toContain(`Version ${LICENCE_VERSION}`);
    expect(LICENCE_VERSION.endsWith("-draft")).toBe(true);
  });

  it("matches the hash recorded for its version in migration 0013", () => {
    const re = new RegExp(`'${LICENCE_VERSION.replace(/[.]/g, "\\.")}'[^;]*?'([0-9a-f]{64})'`);
    expect(re.exec(migration)?.[1]).toBe(sha);
  });

  it("follows the house style: no em dashes, no emojis", () => {
    const text = raw.toString("utf8");
    expect(text).not.toMatch(/—/);
    expect(text).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
  });
});

describe("licenceTextState", () => {
  const row = { version: "0.1.0-draft", status: "draft" as const, is_placeholder: true, content_sha256: "a".repeat(64) };
  it("keeps a draft closed for a real organisation", () => {
    expect(licenceTextState(row, "a".repeat(64), false).kind).toBe("draft");
  });
  it("lets a demo organisation sign the draft as a test", () => {
    expect(licenceTextState(row, "a".repeat(64), true).kind).toBe("demo_only");
  });
  it("opens an approved text", () => {
    expect(licenceTextState({ ...row, status: "approved", is_placeholder: false }, "a".repeat(64), false).kind).toBe("signable");
  });
  it("refuses a file that does not match its version", () => {
    expect(licenceTextState({ ...row, status: "approved" }, "b".repeat(64), false).kind).toBe("mismatch");
    expect(licenceTextState(null, "a".repeat(64), false).kind).toBe("missing");
  });
});

describe("ISBNs", () => {
  it("checks ISBN-10 and ISBN-13 check digits", () => {
    expect(isValidIsbn("978-0-306-40615-7")).toBe(true);
    expect(isValidIsbn("0-306-40615-2")).toBe(true);
    expect(isValidIsbn("080442957X")).toBe(true);
    expect(isValidIsbn("978-0-306-40615-8")).toBe(false);
    expect(isValidIsbn("12345")).toBe(false);
  });
  it("normalises and de-duplicates a list", () => {
    expect(parseIsbns("978-0-306-40615-7, 9780306406157\n0-306-40615-2")).toEqual(["9780306406157", "0306406152"]);
    expect(parseIsbns("")).toEqual([]);
    expect(parseIsbns("9780306406158")).toBeNull();
  });
});

describe("bio claim check", () => {
  it("flags health and result claims", () => {
    expect(bioClaimFlags("My method cures anxiety and is clinically proven.").length).toBeGreaterThan(0);
  });
  it("lets a plain bio through, and allowed negations", () => {
    expect(bioClaimFlags("Ada writes about slow mornings. She lives in Leeds with two cats.")).toEqual([]);
    expect(bioClaimFlags("Her books are not a diagnosis.")).toEqual([]);
  });
});

describe("licence terms", () => {
  const form = (o: Record<string, string>) => (k: string) => o[k] ?? null;
  const ok = { territories: "gb, ie", term_months: "60", exclusive_months: "12", subscription: "yes", cover: "no", audio: "no", signer_name: "Ada Lane", signer_capacity: "Author" };
  it("parses the variable terms", () => {
    const r = parseLicenceTerms(form(ok));
    expect(r.ok && r.terms).toMatchObject({ territories: ["GB", "IE"], excluded: [], termMonths: 60, exclusiveMonths: 12, subscription: true, cover: false });
  });
  it("refuses exclusivity longer than the term and unanswered questions", () => {
    expect(parseLicenceTerms(form({ ...ok, exclusive_months: "61" }))).toEqual({ ok: false, field: "exclusive_months" });
    expect(parseLicenceTerms(form({ ...ok, audio: "" }))).toEqual({ ok: false, field: "terms" });
    expect(parseTerritories("WORLD")).toEqual(["WORLD"]);
    expect(parseTerritories("Britain")).toBeNull();
  });
});

describe("roles and invitations", () => {
  it("never lets an organisation owner grant ownership", () => {
    expect(OWNER_GRANTABLE_ROLES).not.toContain("owner");
  });
  it("mirrors the permissions table", () => {
    expect(roleCan("owner")).toMatchObject({ manageMembers: true, signLicences: true });
    expect(roleCan("editor")).toMatchObject({ manageMembers: false, writeBooks: true, signLicences: false });
    expect(roleCan("author")).toMatchObject({ writeBooks: false, writeWorkbooks: true });
    expect(roleCan("nobody")).toMatchObject({ readLicences: false, writeWorkbooks: false });
  });
  it("maps database errors to fixed notices", () => {
    expect(studioErrorNotice("AKS06")).toBe("licence-draft");
    expect(studioErrorNotice("AKS05", "book_exists: isbn 978 is already on another book")).toBe("isbn-taken");
    expect(studioErrorNotice("AKS05", "this address is already a member")).toBe("already-member");
    expect(studioErrorNotice("AKS01", "ownership changes are made by Akana staff")).toBe("owner-staff");
    expect(studioErrorNotice("AKS29")).toBe("rate-limited");
    expect(studioErrorNotice(undefined)).toBe("failed");
  });
  it("shows only known notices", () => {
    expect(studioNotice("saved")?.tone).toBe("ok");
    expect(studioNotice("<script>")).toBeNull();
    for (const n of Object.values(STUDIO_NOTICES)) expect(n.text).not.toMatch(/—/);
  });
});

describe("small helpers", () => {
  it("cleans addresses and links", () => {
    expect(cleanEmail(" Ada@Example.COM ")).toBe("ada@example.com");
    expect(cleanEmail("nope")).toBeNull();
    expect(httpsUrl("http://x.example")).toBeNull();
    expect(httpsUrl("https://x.example/a")).toBe("https://x.example/a");
    expect(parseLinks("https://a.example\nhttps://b.example")).toHaveLength(2);
    expect(parseLinks("javascript:alert(1)")).toBeNull();
  });
  it("keeps the person's own file name out of storage", () => {
    expect(storedFileName("manuscript", "docx")).toBe("Manuscript.docx");
  });
  it("adds the organisation to links only when needed", () => {
    expect(withOrg("/studio", "o1", false)).toBe("/studio");
    expect(withOrg("/studio?x=1", "o1", true)).toBe("/studio?x=1&org=o1");
  });
  it("builds the checklist in order", () => {
    const items = checklist({ profileDone: true, bookCount: 1, licence: "none", connectStatus: "not_started", submissionCount: 0 });
    expect(items.map((i) => i.key)).toEqual(["profile", "book", "licence", "payouts", "submit"]);
    expect(items.map((i) => i.state)).toEqual(["done", "done", "todo", "todo", "todo"]);
    expect(items[2]!.line).toMatch(/lawyer/);
  });
});
