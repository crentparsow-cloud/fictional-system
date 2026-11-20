import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TenantShell } from "@/components/tenant/TenantShell";
import { safeNextPath } from "@/lib/auth";
import { brand } from "@/lib/brand";
import { siteOrigin } from "@/lib/site-url";
import { tenantReaderPage } from "@/lib/tenant-page";
import { getTenantReader, loadTenantGates, nextTenantGate, tenantGateHref } from "@/lib/tenant-reader";
import { giveTenantHealthConsent } from "./action";

/**
 * Health data consent on a tenant site (F-026, F-133). Shown before a
 * reader's first wellbeing workbook. The words are the Akana site's, from
 * the privacy notice, with one change: consent is withdrawn on the Akana
 * site, because a tenant site has no You page. One checkbox, not pre-ticked.
 * Help now is in the header. The workbook's topic is not named.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Before you begin", robots: { index: false, follow: false } };

type Search = { error?: string; next?: string };

export default async function TenantConsentPage({ searchParams }: { searchParams: Promise<Search> }) {
  const page = await tenantReaderPage();
  if (page.unavailable) return page.unavailable;
  const { site } = page;
  const sp = await searchParams;
  const next = safeNextPath(sp.next, "/my-workbooks");
  const here = `/consent?next=${encodeURIComponent(next)}`;
  const reader = await getTenantReader();
  if (!reader) redirect(`/sign-in?next=${encodeURIComponent(here)}`);
  const gates = await loadTenantGates(reader.supabase);
  if (gates && nextTenantGate(gates)) redirect(tenantGateHref(here));
  if (gates && gates.healthConsent) redirect(next);

  const error =
    sp.error === "required"
      ? "Tick the box to continue. Without it we cannot store what you write in wellbeing workbooks."
      : sp.error === "akana"
        ? `This consent cannot be given on this site. Manage this on the ${brand.name} site, under You.`
        : sp.error === "readonly"
          ? `Your account cannot be changed on this site right now. Manage this on the ${brand.name} site.`
          : sp.error === "save"
            ? "That did not save. Please try again."
            : null;

  return (
    <TenantShell site={site} reader>
      <section className="consent-page">
        <div className="card consent-card">
          {!gates ? (
            <>
              <h1>Something went wrong</h1>
              <p>We could not check your account just now. Please try again in a few minutes.</p>
            </>
          ) : (
            <>
              <h1>Before you begin</h1>
              <p>
                Some workbooks are about wellbeing. What you write in them may reveal information about your mental or physical health. The law treats that as special
                category data, so we ask for your explicit consent before we store it.
              </p>
              <p>
                Your account is an {brand.name} account and {brand.name} stores what you write. Your answers are encrypted when stored. Only {brand.name}&apos;s secure
                server can unlock them, and only to show them to you.
              </p>
              <p>
                No author, publisher or member of {brand.name} staff can read what you write. Nor can {site.name}.
              </p>
              <p>
                You can withdraw your consent at any time on the <a href={`${siteOrigin()}/you`}>{brand.name} site</a>, under You. If you do, you can no longer add to
                wellbeing workbooks, and you can choose to delete what you have written.
              </p>
              <form action={giveTenantHealthConsent}>
                <input type="hidden" name="next" value={next} />
                <div className="check">
                  <input id="consent" name="consent" type="checkbox" value="yes" aria-describedby={error ? "consent-error" : undefined} />
                  <label htmlFor="consent">Yes, store what I write in wellbeing workbooks.</label>
                </div>
                {error ? (
                  <p id="consent-error" className="form-error" role="alert">
                    {error}
                  </p>
                ) : null}
                <button type="submit" className="btn">
                  Continue
                </button>
              </form>
            </>
          )}
        </div>
      </section>
    </TenantShell>
  );
}
