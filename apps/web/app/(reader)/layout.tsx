import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { InstallPrompt } from "@/components/InstallPrompt";
import { ReaderTabs } from "@/components/ReaderTabs";
import { ReaderTopBar } from "@/components/reader/ReaderTopBar";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { ReadingApply } from "@/components/reader/ReadingApply";
import { ReadOnlyBanner } from "@/components/reader/ReadOnlyBanner";
import { readerDeletion } from "@/lib/account-server";
import { createUserClient } from "@/lib/supabase/server";
import { getReaderSession } from "@/lib/auth";
import { getT } from "@/lib/i18n";
import { loadAccountReading } from "@/lib/reading/settings-server";
import { getRoleMfaSession } from "@/lib/mfa/role-mfa-server";
import { readerVerifyHref } from "@/lib/mfa/reader-mfa";
import { needsReaderTerms, termsHref } from "@/lib/terms";
import { readerTermsAccepted } from "@/lib/terms-server";

/**
 * Reader shell (F-014): the four tabs and the gates in front of them.
 *
 * Nobody signed in goes to /sign-in. A signed-in reader who has not yet
 * confirmed they are 18 or over goes to /welcome first (F-127). Both carry
 * the path they were heading for so they come straight back. A reader who
 * has not accepted the current reader terms goes to /terms (F-122). A
 * reader who turned on two-step sign-in (13.2) and has not yet given a code
 * on this session goes to /verify. Readers who never turned it on are not
 * asked.
 */
export default async function ReaderLayout({ children }: { children: React.ReactNode }) {
  const session = await getReaderSession();
  const h = await headers();
  const current = h.get("x-akana-path") ?? "/home";
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(current)}`);
  if (!session.adultConfirmedAt) redirect(`/welcome?next=${encodeURIComponent(current)}`);
  if (session.mfaEnrolled && !(await getRoleMfaSession()).verified) redirect(readerVerifyHref(current));
  // F-122: asked again when the reader terms version changes. If the status
  // cannot be read the tabs stay open (logged); checkout still refuses
  // without a recorded acceptance.
  const terms = await readerTermsAccepted();
  if (terms.ok && needsReaderTerms(terms.accepted)) redirect(termsHref(current));

  // F-025: read only while a deletion is pending, said on every tab.
  const { state: deletion } = await readerDeletion(await createUserClient(), session.userId);

  // 3.5 to 3.7: the reading settings kept on the account. Unreadable means the device copy stands.
  const readingAccount = await loadAccountReading();

  const { t } = await getT();

  return (
    <div className="reader-shell">
      <a className="skip-link" href="#main">
        {t("common.skipToContent")}
      </a>
      <ReaderTopBar homeHref="/home" link={{ href: "/my-workbooks", label: "Your shelf" }} />
      <main id="main" className="reader-main wrap" tabIndex={-1}>
        {/* You has its own deletion banner with the Cancel button. */}
        {current.startsWith("/you") ? null : <ReadOnlyBanner state={deletion} />}
        {/* 10.1, 13.18: from the second visit, a pre-permission card or the iOS guide. Never in the installed app. */}
        <InstallPrompt />
        {children}
      </main>
      <ReaderTabs />
      <ServiceWorkerRegister />
      <ReadingApply account={readingAccount} />
    </div>
  );
}
