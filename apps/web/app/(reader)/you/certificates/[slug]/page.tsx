import type { Metadata } from "next";
import Link from "next/link";
import { CertificateShare } from "@/components/certificate/CertificateShare";
import { PrintButton } from "@/components/certificate/PrintButton";
import { getReaderSession } from "@/lib/auth";
import { certificateNotice, certificateWords } from "@/lib/certificate/certificate";
import { finishedProgrammeBySlug } from "@/lib/certificate/server";
import { createUserClient } from "@/lib/supabase/server";
import { saveCertificate } from "./actions";
import { countEvent } from "@/lib/funnel-server";

export const metadata: Metadata = { title: "Certificate", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * The finish certificate (12.2). Private by default, with no date on it. The
 * reader may add a name, print it, or turn on a link. A link is never offered
 * for a title above safety tier none.
 */
export default async function CertificatePage({ params, searchParams }: Props) {
  const [{ slug }, sp, session] = await Promise.all([params, searchParams, getReaderSession()]);
  if (!session) return null;
  const programme = await finishedProgrammeBySlug(session.userId, slug).catch(() => null);
  if (programme) await countEvent("certificate_viewed", { userId: session.userId });
  const notice = certificateNotice(sp.notice);
  if (!programme) {
    return (
      <section className="tab-page you-page">
        <p className="eyebrow">
          <Link href="/you">You</Link>
        </p>
        <h1>Certificate</h1>
        <p>{notice ?? "The certificate is made once you reach the end of the programme."}</p>
        <p>
          <Link href="/my-workbooks">Back to your workbooks</Link>
        </p>
      </section>
    );
  }
  const supabase = await createUserClient();
  const { data } = await supabase.rpc("my_certificate", { p_enrolment: programme.enrolmentId });
  const row = (Array.isArray(data) ? data[0] : data) as { holder_name: string | null; shared: boolean; shareable: boolean } | undefined;
  const words = certificateWords(programme.title, row?.holder_name ?? null);

  return (
    <section className="tab-page you-page certificate-page">
      <p className="eyebrow no-print">
        <Link href="/you">You</Link>
      </p>
      {notice ? (
        <p className="you-notice no-print" role="status">
          {notice}
        </p>
      ) : null}
      {row ? (
        <article className="card certificate" aria-label="Certificate">
          <p className="eyebrow">{words.heading}</p>
          <p className="certificate-line">{words.line}</p>
          <h1 className="certificate-title">{words.title}</h1>
          <p className="muted">{words.foot}</p>
        </article>
      ) : (
        <h1>Certificate</h1>
      )}
      <form action={saveCertificate} className="no-print">
        <input type="hidden" name="slug" value={slug} />
        <label htmlFor="cert-name">{row ? "Name on the certificate" : "Name on the certificate (optional)"}</label>
        <input id="cert-name" name="name" type="text" maxLength={60} defaultValue={row?.holder_name ?? ""} autoComplete="name" />
        <p>
          <button type="submit" className="btn">
            {row ? "Save the name" : "Make my certificate"}
          </button>
        </p>
      </form>
      {row ? (
        <div className="no-print">
          <p>
            <PrintButton />
          </p>
          {row.shareable ? (
            <CertificateShare slug={slug} shared={row.shared} />
          ) : (
            <p className="muted">This certificate is for you. A certificate for a workbook on this subject stays private.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
