import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InfoFooter } from "@/components/InfoFooter";
import { brand } from "@/lib/brand";
import { certificateWords } from "@/lib/certificate/certificate";
import { hashInviteToken, isInviteToken } from "@/lib/shared-membership-token";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * A shared certificate (12.2): /c/<token>. Shown only while the reader keeps
 * the link on. It holds a name the reader typed and the workbook title, with
 * no date, no progress and no account detail. Not indexed, no referrer.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "A certificate", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function SharedCertificatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isInviteToken(token)) notFound();
  let row = null as { title: string; holder_name: string | null; slug: string } | null;
  try {
    const { data } = await createAdminClient().rpc("certificate_by_hash", { p_hash: hashInviteToken(token) });
    row = ((Array.isArray(data) ? data[0] : data) as typeof row) ?? null;
  } catch {
    row = null;
  }
  if (!row) notFound();
  const words = certificateWords(row.title, row.holder_name);
  return (
    <main className="wrap info-page share-page">
      <article className="card certificate" aria-label="Certificate">
        <p className="eyebrow">{words.heading}</p>
        <p className="certificate-line">{words.line}</p>
        <h1 className="certificate-title">{words.title}</h1>
        <p className="muted">{words.foot}</p>
      </article>
      <p>
        <Link className="btn" href={`/w/${row.slug}`}>
          Look at this workbook on {brand.name}
        </Link>
      </p>
      <InfoFooter />
    </main>
  );
}
