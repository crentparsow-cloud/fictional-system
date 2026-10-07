import type { Metadata } from "next";
import Link from "next/link";
import { InfoFooter } from "@/components/InfoFooter";
import { brand } from "@/lib/brand";
import { NoticeForm } from "./NoticeForm";

export const metadata: Metadata = {
  title: "Report content",
  description: `Tell ${brand.name} about a workbook that copies your work or is unlawful.`,
  alternates: { canonical: "/takedown" },
};

/**
 * Notice and takedown (F-123). The public form for copyright, trade mark and
 * other unlawful content notices. Staff work the queue at /admin/takedowns.
 * Copy is a draft for Crent and the lawyer. The designated agent details
 * are placeholders until Crent registers an agent.
 */
export default function TakedownPage() {
  return (
    <main className="wrap info-page contact-page">
      <header className="info-head">
        <p className="eyebrow muted">{brand.name}</p>
        <h1>Report content</h1>
        <p className="info-lead">
          Use this form if a workbook on {brand.name} copies your work without permission, uses your trade mark, or is unlawful in another way.
        </p>
      </header>

      <p>
        A person reads every notice. If it is complete and valid, we take the workbook off sale and tell the author or publisher why. They can reply with a
        counter-notice. Readers who already bought it keep their own answers.
      </p>
      <p className="muted small">
        A false notice can have legal consequences. We may share your notice, including your name, with the author or publisher, as the law allows. Our
        designated agent for copyright notices is [designated agent name and address].
      </p>
      <p className="muted small">
        Need help, not a legal notice? <Link href="/contact">Contact us</Link> or open <Link href="/help-now">Help now</Link>.
      </p>
      <p className="muted small">
        Is it your title that was taken down? <Link href="/takedown/counter">Send a counter-notice</Link>.
      </p>

      <NoticeForm kind="notice" />
      <InfoFooter />
    </main>
  );
}
