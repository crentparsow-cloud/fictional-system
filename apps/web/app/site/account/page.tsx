import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TenantShell } from "@/components/tenant/TenantShell";
import { brand } from "@/lib/brand";
import { siteOrigin } from "@/lib/site-url";
import { tenantReaderPage } from "@/lib/tenant-page";
import { getTenantReader } from "@/lib/tenant-reader";
import { signOutOfTenant } from "./action";

/**
 * The account page on a tenant site (F-133). Deliberately small: the email
 * address, sign out, and a plain link to the Akana site, where the account
 * itself lives. Download, deletion, consent and membership are done there,
 * signed in with the same email. Nothing here names a workbook.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Account", robots: { index: false, follow: false } };

export default async function TenantAccountPage() {
  const page = await tenantReaderPage();
  if (page.unavailable) return page.unavailable;
  const { site } = page;
  const reader = await getTenantReader();
  if (!reader) redirect(`/sign-in?next=${encodeURIComponent("/account")}`);
  const akana = siteOrigin();

  return (
    <TenantShell site={site} reader>
      <section className="tenant-section">
        <h1>Account</h1>
        <p>
          You are signed in to {site.name}
          {reader.email ? (
            <>
              {" "}
              as <strong>{reader.email}</strong>
            </>
          ) : null}
          .
        </p>
        <form action={signOutOfTenant}>
          <button type="submit" className="btn secondary">
            Sign out
          </button>
        </form>
        <h2>Your {brand.name} account</h2>
        <p>
          Your account is an {brand.name} account. {brand.name} runs it and powers this site. The same email address signs in on the {brand.name} site and on other
          sites powered by {brand.name}.
        </p>
        <p>
          To download what you have written, delete your account, change your consent or manage a membership, sign in on the{" "}
          <a href={`${akana}/you`}>{brand.name} site</a> with the same email address. Those are not available on this site.
        </p>
        <p>
          <Link href="/legal/privacy">{brand.name} privacy notice</Link>
        </p>
      </section>
    </TenantShell>
  );
}
