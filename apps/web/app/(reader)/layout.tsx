import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ReaderNav, type NavItem } from "@/components/ReaderNav";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { getReaderSession } from "@/lib/auth";
import { getT } from "@/lib/i18n";
import { needsReaderTerms, termsHref } from "@/lib/terms";
import { readerTermsAccepted } from "@/lib/terms-server";

/**
 * Reader shell (F-014): the five tabs and the gates in front of them.
 *
 * Nobody signed in goes to /sign-in. A signed-in reader who has not yet
 * confirmed they are 18 or over goes to /welcome first (F-127). Both carry
 * the path they were heading for so they come straight back. A reader who
 * has not accepted the current reader terms goes to /terms (F-122).
 */
export default async function ReaderLayout({ children }: { children: React.ReactNode }) {
  const session = await getReaderSession();
  const h = await headers();
  const current = h.get("x-akana-path") ?? "/home";
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(current)}`);
  if (!session.adultConfirmedAt) redirect(`/welcome?next=${encodeURIComponent(current)}`);
  // F-122: asked again when the reader terms version changes. If the status
  // cannot be read the tabs stay open (logged); checkout still refuses
  // without a recorded acceptance.
  const terms = await readerTermsAccepted();
  if (terms.ok && needsReaderTerms(terms.accepted)) redirect(termsHref(current));

  const { t } = await getT();
  const items: NavItem[] = [
    { href: "/home", label: t("nav.home"), icon: "home" },
    { href: "/today", label: t("nav.today"), icon: "today" },
    { href: "/toolkit", label: t("nav.toolkit"), icon: "toolkit" },
    { href: "/library", label: t("nav.library"), icon: "library" },
    { href: "/you", label: t("nav.you"), icon: "you" },
  ];

  return (
    <div className="reader-shell">
      <a className="skip-link" href="#main">
        {t("common.skipToContent")}
      </a>
      <main id="main" className="reader-main wrap" tabIndex={-1}>
        {children}
      </main>
      <ReaderNav items={items} label={t("nav.label")} />
      <ServiceWorkerRegister />
    </div>
  );
}
