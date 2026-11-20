import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TenantShell } from "@/components/tenant/TenantShell";
import { safeNextPath } from "@/lib/auth";
import { brand } from "@/lib/brand";
import { tenantReaderPage } from "@/lib/tenant-page";
import { getTenantReader } from "@/lib/tenant-reader";
import { requestTenantCode, verifyTenantCode } from "./action";

/**
 * Sign-in on a tenant site (F-133). The proxy rewrites /sign-in on a
 * white-label host to here when sign-in is on for the tenant.
 *
 * The page says plainly whose account this is: an Akana account, run by
 * Akana, which powers the site; the same email signs in on other sites
 * Akana powers; the code comes in an email from Akana. It names no workbook
 * or topic (F-127). No pre-ticked boxes, nothing to opt out of.
 *
 * The code is Akana's own, for this site only (lib/tenant-code.ts). There
 * is no link to click and the page says so, so a reader is never taught to
 * follow a sign-in link that claims to be from this site.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

type Search = { sent?: string; error?: string; next?: string };

const ERRORS: Record<string, string> = {
  invalid: "Enter a full email address, such as name@example.com.",
  send: "We could not send the email just now. Please try again in a few minutes.",
  link: "That code has run out. Enter your email address and we will send a new one.",
  busy: "Too many tries. Please wait a few minutes and try again.",
  unavailable: "Sign-in is not available on this site right now. Please try again later.",
  twostep: `This account uses two-step sign-in, which this site does not support yet. You can sign in on the ${brand.name} site.`,
};

export default async function TenantSignInPage({ searchParams }: { searchParams: Promise<Search> }) {
  const page = await tenantReaderPage();
  if (page.unavailable) return page.unavailable;
  const { site } = page;
  const sp = await searchParams;
  const next = safeNextPath(sp.next, "/my-workbooks");
  if (await getTenantReader()) redirect(next);
  const error = sp.error ? (ERRORS[sp.error] ?? null) : null;

  return (
    <TenantShell site={site} reader>
      <div className="tenant-auth">
        {sp.sent === "1" ? (
          <section className="card auth-card" aria-live="polite">
            <h1>Check your email</h1>
            <p>
              {brand.name} has sent a code to that address. The email comes from {brand.name} and names {site.name}. It has a code and no link.
            </p>
            <form action={verifyTenantCode} noValidate>
              <input type="hidden" name="next" value={next} />
              <label htmlFor="code">Type the code from the email</label>
              <input
                id="code"
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]*"
                maxLength={9}
                required
                aria-describedby={sp.error === "code" ? "code-error" : undefined}
                aria-invalid={sp.error === "code" ? true : undefined}
              />
              {sp.error === "code" ? (
                <p id="code-error" className="form-error" role="alert">
                  That code did not work. Check it and try again, or ask for a new one.
                </p>
              ) : null}
              <button type="submit" className="btn">
                Sign in
              </button>
            </form>
            <p className="muted small">The code works for ten minutes and only on {site.name}. Type it only on this page.</p>
            <p>
              <a href={`/sign-in?next=${encodeURIComponent(next)}`}>Send a new code</a>
            </p>
          </section>
        ) : (
          <section className="card auth-card">
            <h1>Sign in</h1>
            <p>
              You sign in to {site.name} with an {brand.name} account. {brand.name} runs the account and powers this site.
            </p>
            <p>
              The same email address signs in on other sites powered by {brand.name}. It is one account. If you already have one, use that email address here.
            </p>
            <form action={requestTenantCode} noValidate>
              <input type="hidden" name="next" value={next} />
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                spellCheck={false}
                required
                maxLength={254}
                aria-describedby={error ? "sign-in-error sign-in-how" : "sign-in-how"}
                aria-invalid={error ? true : undefined}
              />
              {error ? (
                <p id="sign-in-error" className="form-error" role="alert">
                  {error}
                </p>
              ) : null}
              <button type="submit" className="btn">
                Email me a code
              </button>
            </form>
            <p id="sign-in-how" className="muted small">
              {brand.name} will email you a code. The email comes from {brand.name} and names {site.name}. You type the code on this page to sign in. There is no password and no link to click.
            </p>
            <p className="muted small">
              {brand.name} holds your account and what you write. {site.name} cannot read your answers. Read the <Link href="/legal/privacy">{brand.name} privacy notice</Link>.
            </p>
          </section>
        )}
      </div>
    </TenantShell>
  );
}
