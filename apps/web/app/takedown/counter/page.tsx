import type { Metadata } from "next";
import Link from "next/link";
import { InfoFooter } from "@/components/InfoFooter";
import { brand } from "@/lib/brand";
import { NoticeForm } from "../NoticeForm";

export const metadata: Metadata = {
  title: "Send a counter-notice",
  description: `Ask ${brand.name} to put back a workbook that was taken down by mistake.`,
  alternates: { canonical: "/takedown/counter" },
  robots: { index: false, follow: true },
};

/**
 * Counter-notice (F-123, DMCA 512(g)(3)). For the author or publisher of a
 * title taken down after a notice. Draft copy for Crent and the lawyer.
 */
export default function CounterNoticePage() {
  return (
    <main className="wrap info-page contact-page">
      <header className="info-head">
        <p className="eyebrow muted">{brand.name}</p>
        <h1>Send a counter-notice</h1>
        <p className="info-lead">If we took your workbook down after a notice and you think that was a mistake, tell us here.</p>
      </header>
      <p>
        You need the notice reference from the statement of reasons we sent you. We send a copy of your counter-notice, including your name and contact
        details, to the person who sent the notice. If they do not tell us within 10 to 14 business days that they have gone to court, we can put the title
        back on sale.
      </p>
      <p className="muted small">
        Not sure? <Link href="/contact">Contact us</Link> first. A counter-notice is a legal statement.
      </p>
      <NoticeForm kind="counter_notice" />
      <InfoFooter />
    </main>
  );
}
