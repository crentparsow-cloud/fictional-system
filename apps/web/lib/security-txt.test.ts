import { describe, expect, it } from "vitest";
import { GET } from "@/app/.well-known/security.txt/route";
import { routeDecision, tenantSiteRoute } from "@/lib/tenant-resolve";
import { securityContact, securityTxt } from "@/lib/security-txt";

const now = new Date("2026-11-25T10:30:00.123Z");
const env = { SECURITY_CONTACT: "security@akana.example", NEXT_PUBLIC_SITE_URL: "https://akana.example" };

describe("security.txt", () => {
  it("is not served when the contact is blank or invalid", () => {
    expect(securityTxt({}, now)).toBeNull();
    expect(securityTxt({ SECURITY_CONTACT: "   " }, now)).toBeNull();
    expect(securityTxt({ SECURITY_CONTACT: "http://insecure.example" }, now)).toBeNull();
    expect(securityTxt({ SECURITY_CONTACT: "not an address" }, now)).toBeNull();
    expect(securityTxt({ SECURITY_CONTACT: "a@b.example\nContact: x" }, now)).toBeNull();
  });

  it("builds the file from the contact, one year of expiry and the site origin", () => {
    expect(securityTxt(env, now)).toBe(
      [
        "Contact: mailto:security@akana.example",
        "Expires: 2027-11-25T10:30:00Z",
        "Preferred-Languages: en",
        "Canonical: https://akana.example/.well-known/security.txt",
        "",
      ].join("\n"),
    );
  });

  it("accepts a mailto or https contact", () => {
    expect(securityContact({ SECURITY_CONTACT: "mailto:s@akana.example" })).toBe("mailto:s@akana.example");
    expect(securityContact({ SECURITY_CONTACT: "https://akana.example/report" })).toBe("https://akana.example/report");
  });

  it("the route answers 404 without a contact and 200 text with one", async () => {
    const saved = process.env.SECURITY_CONTACT;
    try {
      delete process.env.SECURITY_CONTACT;
      expect(GET().status).toBe(404);
      process.env.SECURITY_CONTACT = "security@akana.example";
      const res = GET();
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/plain");
      expect(await res.text()).toContain("Contact: mailto:security@akana.example");
    } finally {
      if (saved === undefined) delete process.env.SECURITY_CONTACT;
      else process.env.SECURITY_CONTACT = saved;
    }
  });

  it("the proxy lets the marketplace host serve it and keeps it off tenant hosts", () => {
    const marketplace = { slug: "akana", kind: "marketplace", id: null, source: "config" } as Parameters<typeof routeDecision>[0];
    expect(routeDecision(marketplace, "/.well-known/security.txt")).toBe("serve");
    expect(tenantSiteRoute("/.well-known/security.txt")).toEqual({ action: "not_found" });
  });
});
