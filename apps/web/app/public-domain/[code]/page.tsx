import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { brand } from "@/lib/brand";
import { conclusionLabel, getPublicDomainRecord, listPublicDomainRecords, MARKET_NAMES, type LaunchMarket } from "@/lib/public-domain";

/**
 * "Public domain: how we checked" (F-118). A static page per classic,
 * rendered at build time from content/public-domain/<code>.json. Only the
 * five codes in the file exist; anything else is a 404.
 */
export const dynamicParams = false;
export const dynamic = "force-static";

type Params = { code: string };

export function generateStaticParams(): Params[] {
  return listPublicDomainRecords().map((r) => ({ code: r.code }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { code } = await params;
  const record = getPublicDomainRecord(code);
  if (!record) return { title: "Public domain" };
  return {
    title: `Public domain: ${record.title}`,
    description: `How ${brand.name} checked that ${record.title} by ${record.author} is in the public domain.`,
  };
}

export default async function PublicDomainPage({ params }: { params: Promise<Params> }) {
  const { code } = await params;
  const record = getPublicDomainRecord(code);
  if (!record) notFound();
  const reviewed = record.status === "reviewed" && record.reviewedBy;

  return (
    <main className="pd-page">
      <header className="pd-head">
        <div className="wrap">
          <nav className="wb-crumbs" aria-label="Breadcrumb">
            <Link href="/">{brand.name}</Link> <span aria-hidden="true">/</span> <Link href={`/w/${record.slug}`}>{record.title}</Link>
          </nav>
          <p className="eyebrow">Public domain: how we checked</p>
          <h1>{record.title}</h1>
          <p className="wb-author">{record.author}</p>
          <p className="muted small">{record.code}</p>
        </div>
      </header>

      <div className="wrap pd-body">
        <p className={reviewed ? "pd-status" : "pd-status pd-status-open"}>
          {reviewed ? `Reviewed by ${record.reviewedBy}${record.reviewedOn ? ` on ${record.reviewedOn}` : ""}.` : "This record has not yet been reviewed. Items marked [to confirm] are still open."}
        </p>

        <section className="wb-section">
          <h2>The work</h2>
          <p>First published: {record.firstPublished}.</p>
          <table className="pd-table">
            <caption className="pd-caption">Contributors and death years</caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Role</th>
                <th scope="col">Died</th>
                <th scope="col">Source</th>
              </tr>
            </thead>
            <tbody>
              {record.people.map((p) => (
                <tr key={p.name}>
                  <td>{p.name}</td>
                  <td>{p.role}</td>
                  <td>{p.died ?? "[to confirm]"}</td>
                  <td>{p.diedSource}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="wb-section">
          <h2>The edition we use</h2>
          <p>
            {record.edition.name}. <a href={record.edition.url} rel="noopener noreferrer">{record.edition.url}</a>
          </p>
          <p>{record.edition.status}</p>
          <p>{record.typographicalArrangement}</p>
        </section>

        <section className="wb-section">
          <h2>By market</h2>
          <p>Tier {record.tier}. {record.tierNote}</p>
          <table className="pd-table">
            <caption className="pd-caption">Rule applied and conclusion by launch market</caption>
            <thead>
              <tr>
                <th scope="col">Market</th>
                <th scope="col">Rule</th>
                <th scope="col">Conclusion</th>
                <th scope="col">Basis</th>
              </tr>
            </thead>
            <tbody>
              {record.markets.map((m) => (
                <tr key={m.market}>
                  <th scope="row">{MARKET_NAMES[m.market as LaunchMarket] ?? m.market}</th>
                  <td>{m.rule}</td>
                  <td>
                    <span className={m.conclusion === "clear" ? "badge" : "badge demo"}>{conclusionLabel(m.conclusion)}</span>
                  </td>
                  <td>{m.basis}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="wb-section">
          <h2>Still to check</h2>
          <ul>
            {record.checks.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>

        <section className="wb-section">
          <h2>Review</h2>
          <p>Reviewed by: {record.reviewedBy ?? "______"}</p>
          <p>Date: {record.reviewedOn ?? "______"}</p>
        </section>

        <footer className="footer wb-footer">
          <p>The workbook around this text is new {brand.name} material. The text itself comes from a public-domain edition.</p>
          <p>
            <Link href={`/w/${record.slug}`}>Back to the workbook</Link>
          </p>
        </footer>
      </div>
    </main>
  );
}
