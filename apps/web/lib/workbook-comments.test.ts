import { describe, expect, it, vi } from "vitest";
import type { SendLogEntry } from "@akana/emails";
import { mailLog, withEmailOps } from "@/lib/mail-ops";
import { COMMENT_MAX, parseCommentBody, readComments, threadErrorNotice, threadNotice } from "@/lib/workbook-comments";

describe("workbook comment thread (F-039)", () => {
  it("keeps line breaks, trims, and refuses empty or long bodies", () => {
    expect(parseCommentBody("  Line one\r\nLine two\u0007  ")).toEqual({ ok: true, body: "Line one\nLine two" });
    expect(parseCommentBody("   ")).toEqual({ ok: false, notice: "empty" });
    expect(parseCommentBody(null)).toEqual({ ok: false, notice: "empty" });
    expect(parseCommentBody("x".repeat(COMMENT_MAX + 1))).toEqual({ ok: false, notice: "long" });
  });

  it("maps database codes to fixed notices and never echoes text", () => {
    expect(threadErrorNotice("AKX01")).toBe("denied");
    expect(threadErrorNotice("AKX29")).toBe("busy");
    expect(threadErrorNotice(undefined)).toBe("failed");
    expect(threadNotice("posted")?.tone).toBe("ok");
    expect(threadNotice("<script>")).toBeNull();
  });

  it("reads rows defensively", () => {
    const rows = readComments([{ id: "c1", side: "org", body: "Hi", author_name: "Ola", created_at: "2026-10-08T10:00:00Z", author_id: null }, { id: 2 }, null]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.side).toBe("org");
  });
});

describe("mailer ops wiring (F-142)", () => {
  const entry = (status: SendLogEntry["status"]): SendLogEntry => ({
    id: "1",
    at: "2026-10-08T10:00:00Z",
    to_hash: "h",
    user_id: null,
    audience: "reader",
    template: "refund_confirmed",
    template_version: "v2",
    category: "transactional",
    status,
    reason: "provider said no to someone@example.com",
    provider_id: null,
    dedupe_key: null,
  });

  it("reports a failed send with the template as the code, and nothing else", async () => {
    const report = vi.fn(async () => {});
    const inner = vi.fn();
    const log = withEmailOps("admin/lookup", inner, report);
    await log(entry("sent"));
    await log(entry("skipped"));
    expect(report).not.toHaveBeenCalled();
    await log(entry("failed"));
    expect(inner).toHaveBeenCalledTimes(3);
    expect(report).toHaveBeenCalledWith("email_failure", "admin/lookup", "refund_confirmed");
  });

  it("still reports when the inner log throws", async () => {
    const report = vi.fn(async () => {});
    await withEmailOps("x", () => {
      throw new Error("boom");
    }, report)(entry("failed"));
    expect(report).toHaveBeenCalledTimes(1);
    const quiet = vi.spyOn(console, "info").mockImplementation(() => {});
    await mailLog("studio", "studio_mail", report)(entry("failed"));
    expect(report).toHaveBeenCalledTimes(2);
    quiet.mockRestore();
  });
});
