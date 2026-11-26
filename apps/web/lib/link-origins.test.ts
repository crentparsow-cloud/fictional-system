import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Review L2, end to end for the link builders: the Connect return and
 * refresh addresses, the partner respond link, the gift link and the
 * organisation mail origin, on production, on a preview and on localhost.
 * A forged Host or X-Forwarded-Host never appears in any of them.
 */
vi.mock("server-only", () => ({}));

import { mailOrigin } from "@/lib/org-billing-mail-server";
import { originFrom as partnerOrigin, respondUrl } from "@/lib/partner";
import { originFrom as connectOrigin } from "@/lib/payouts/connect";
import { onboardingUrls } from "@/lib/payouts/status";
import { giftUrl } from "@/lib/send-workbook";

const h = (host: string, extra: Record<string, string> = {}) => new Headers({ host, ...extra });
const forged = h("evil.example", { "x-forwarded-host": "evil.example", "x-forwarded-proto": "http" });
const ORG = "11111111-1111-4111-8111-111111111111";

function env(values: Record<string, string>) {
  for (const k of ["AKANA_HOST", "NEXT_PUBLIC_SITE_URL", "VERCEL_ENV", "VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_BRANCH_URL", "VERCEL_URL"]) vi.stubEnv(k, values[k] ?? "");
}

afterEach(() => vi.unstubAllEnvs());

describe("links on production", () => {
  const set = () => env({ AKANA_HOST: "akana.example", NEXT_PUBLIC_SITE_URL: "https://akana.example", VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "akana-one.vercel.app", VERCEL_URL: "akana-abc123.vercel.app" });

  it("builds every link from the configured address", () => {
    set();
    for (const headers of [h("akana.example"), forged]) {
      expect(onboardingUrls(connectOrigin(headers), ORG).return_url.startsWith("https://akana.example/payouts/")).toBe(true);
      expect(onboardingUrls(connectOrigin(headers), ORG).refresh_url.startsWith("https://akana.example/payouts/")).toBe(true);
      expect(respondUrl(partnerOrigin(headers), "tok")).toBe("https://akana.example/respond/tok");
      expect(giftUrl(partnerOrigin(headers), "tok").startsWith("https://akana.example/")).toBe(true);
      expect(mailOrigin(headers)).toBe("https://akana.example");
    }
  });

  it("gives scheduled mail the site address even when the job was called on the deployment address", () => {
    set();
    expect(mailOrigin(h("akana-abc123.vercel.app"))).toBe("https://akana.example");
    expect(connectOrigin(h("akana-abc123.vercel.app"))).toBe("https://akana.example");
  });
});

describe("links on a preview with no site address set", () => {
  const set = () => env({ VERCEL_ENV: "preview", VERCEL_BRANCH_URL: "akana-git-fix.vercel.app", VERCEL_URL: "akana-def456.vercel.app" });

  it("uses the Vercel system address, never the forged host", () => {
    set();
    expect(respondUrl(partnerOrigin(forged), "tok")).toBe("https://akana-git-fix.vercel.app/respond/tok");
    expect(onboardingUrls(connectOrigin(forged), ORG).return_url.startsWith("https://akana-git-fix.vercel.app/")).toBe(true);
    expect(mailOrigin(forged)).toBe("https://akana-git-fix.vercel.app");
  });

  it("keeps a visitor on the deployment address they came in on", () => {
    set();
    expect(respondUrl(partnerOrigin(h("akana-def456.vercel.app")), "tok")).toBe("https://akana-def456.vercel.app/respond/tok");
  });
});

describe("links on localhost", () => {
  it("uses the local server's own port", () => {
    env({ AKANA_HOST: "localhost:3000" });
    expect(respondUrl(partnerOrigin(h("localhost:3101")), "tok")).toBe("http://localhost:3101/respond/tok");
    expect(onboardingUrls(connectOrigin(h("localhost:3000")), ORG).return_url.startsWith("http://localhost:3000/payouts/")).toBe(true);
    expect(mailOrigin(forged)).toBe("http://localhost:3000");
  });
});
