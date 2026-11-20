import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TenantShell } from "@/components/tenant/TenantShell";
import { safeNextPath } from "@/lib/auth";
import { brand } from "@/lib/brand";
import { tenantReaderPage } from "@/lib/tenant-page";
import { getTenantReader, loadTenantGates, nextTenantGate } from "@/lib/tenant-reader";
import { READER_TERMS_LINKS, READER_TERMS_VERSION } from "@/lib/terms";
import { passTenantGate } from "./action";

/**
 * Before reading on a tenant site (F-133): the adults-only confirmation
 * (F-127) and the reader terms (F-122), whichever this account has not yet
 * given. Both are Akana's and both apply here unchanged. No topic is named.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Before you start", robots: { index: false, follow: false } };

type Search = { error?: string; next?: string };

export default async function TenantWelcomePage({ searchParams }: { searchParams: Promise<Search> }) {
  const page = await tenantReaderPage();
  if (page.unavailable) return page.unavailable;
  const { site } = page;
  const sp = await searchParams;
  const next = safeNextPath(sp.next, "/my-workbooks");
  const reader = await getTenantReader();
  if (!reader) redirect(`/sign-in?next=${encodeURIComponent(`/welcome?next=${next}`)}`);
  const gates = await loadTenantGates(reader.supabase);
  const gate = gates ? nextTenantGate(gates) : null;
  if (gates && !gate) redirect(next);

  const error =
    sp.error === "required"
      ? gate === "welcome"
        ? "Please tick both boxes to continue."
        : "Tick the box to continue."
      : sp.error === "changed"
        ? "The terms changed while this page was open. Please read them again."
        : sp.error === "readonly" || sp.error === "akana"
          ? `Your account cannot be changed on this site right now. Manage this on the ${brand.name} site.`
          : sp.error === "save"
            ? "That could not be saved just now. Please try again."
            : null;

  return (
    <TenantShell site={site} reader>
      <div className="tenant-auth">
        <section className="card auth-card">
          {!gates ? (
            <>
              <h1>Something went wrong</h1>
              <p>We could not check your account just now. Please try again in a few minutes.</p>
            </>
          ) : (
            <>
              <h1>{gate === "welcome" ? "Before you start" : "The reader terms"}</h1>
              {gate === "welcome" ? (
                <p>Workbooks on this site are written for adults. Please confirm you are 18 or over to continue.</p>
              ) : (
                <p>Please read the current reader terms and agree before you carry on. Nothing you have written is affected.</p>
              )}
              <p className="muted small">
                Your account is an {brand.name} account, so {brand.name}&apos;s reader terms apply on {site.name}.
              </p>
              <form action={passTenantGate}>
                <input type="hidden" name="next" value={next} />
                <input type="hidden" name="terms_version" value={READER_TERMS_VERSION} />
                {gate === "welcome" ? (
                  <div className="check">
                    <input id="adult" name="adult" type="checkbox" value="yes" aria-describedby={error ? "welcome-error" : undefined} />
                    <label htmlFor="adult">I am 18 or over</label>
                  </div>
                ) : null}
                <div className="check">
                  <input id="terms" name="terms" type="checkbox" value="yes" aria-describedby={error ? "welcome-error terms-links" : "terms-links"} />
                  <label htmlFor="terms">I agree to the reader terms</label>
                </div>
                <p id="terms-links" className="small terms-links">
                  Read the terms first:{" "}
                  {READER_TERMS_LINKS.map((l, i) => (
                    <span key={l.href}>
                      {i > 0 ? ", " : ""}
                      <a href={l.href} target="_blank" rel="noopener">
                        {l.label}
                      </a>
                    </span>
                  ))}
                  .
                </p>
                {error ? (
                  <p id="welcome-error" className="form-error" role="alert">
                    {error}
                  </p>
                ) : null}
                <button type="submit" className="btn">
                  Continue
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </TenantShell>
  );
}
