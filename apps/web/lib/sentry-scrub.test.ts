import { describe, expect, it } from "vitest";
import { dropAnswerKeys, scrubBreadcrumb, scrubEvent, stripQuery } from "@/lib/sentry-scrub";

describe("Sentry scrubbing", () => {
  it("removes request bodies, cookies, query strings and secret headers", () => {
    const out = scrubEvent({
      request: {
        url: "https://akana.example/api/answers?enrolment=abc",
        data: { enrolment: "abc", field: "u1:f1", value: "what I wrote" },
        cookies: { "__Host-akana-auth": "x" },
        query_string: "enrolment=abc",
        headers: { Cookie: "a=b", Authorization: "Bearer t", "User-Agent": "UA", "X-Forwarded-For": "1.2.3.4" },
      },
    });
    expect(out.request).toEqual({ url: "https://akana.example/api/answers", headers: { "User-Agent": "UA" } });
  });
  it("keeps only the user id", () => {
    expect(scrubEvent({ user: { id: "u1", email: "r@example.com", ip_address: "1.2.3.4", username: "r" } }).user).toEqual({ id: "u1" });
    expect(scrubEvent({ user: { email: "r@example.com" } }).user).toEqual({});
  });
  it("drops answer-like keys from extra, contexts and tags at any depth", () => {
    const out = scrubEvent({
      extra: { enrolment: "abc", answers: { f1: "secret" }, nested: { field_value: "secret", status: 200 } },
      contexts: { reader: { note: "secret", locale: "en-GB" }, browser: { name: "Chrome" } },
      tags: { workbook: "w1", reply: "secret" },
    });
    expect(out.extra).toEqual({ enrolment: "abc", nested: { status: 200 } });
    expect(out.contexts).toEqual({ reader: { locale: "en-GB" }, browser: { name: "Chrome" } });
    expect(out.tags).toEqual({ workbook: "w1" });
    expect(dropAnswerKeys([{ value: 1, ok: true }])).toEqual([{ ok: true }]);
  });
  it("trims breadcrumbs to method, status and path, and drops console lines", () => {
    expect(scrubBreadcrumb({ category: "console", message: "the answer was x" })).toBeNull();
    const crumb = scrubBreadcrumb({
      category: "fetch",
      data: { method: "PUT", url: "/api/answers?enrolment=abc#x", status_code: 200, request_body: "{}", response_body_size: 12 },
    });
    expect(crumb).toEqual({ category: "fetch", data: { method: "PUT", url: "/api/answers", status_code: 200 } });
    const long = scrubBreadcrumb({ category: "ui.click", message: "x".repeat(300) });
    expect(long?.message).toHaveLength(200);
    expect(long).not.toHaveProperty("data");
  });
  it("scrubs the breadcrumbs on an event too", () => {
    const out = scrubEvent({ breadcrumbs: [{ category: "console", message: "x" }, { category: "navigation", data: { to: "/home?x=1" } }] });
    expect(out.breadcrumbs).toEqual([{ category: "navigation", data: { to: "/home?x=1" } }]);
    expect(stripQuery("/a?b=1")).toBe("/a");
    expect(stripQuery(undefined)).toBeUndefined();
  });
});
