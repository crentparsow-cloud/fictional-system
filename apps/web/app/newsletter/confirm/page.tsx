import type { Metadata } from "next";
import Link from "next/link";
import { isNewsletterToken } from "@/lib/newsletter";
import { confirmNewsletter } from "../actions";

/**
 * Confirm your address (6.11). The link in the email opens this page and changes nothing.
 * Only the button does, so a mail scanner that opens links cannot act for the
 * person. The token is in the address, so the page is never indexed and sends
 * no referrer.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Confirm your address",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type Search = Record<string, string | string[] | undefined>;

export default async function NewsletterPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const token = one(sp.t);
  const done = one(sp.done);

  return (
    <main className="wrap info-page">
      <header className="info-head">
        <h1>Confirm your address</h1>
      </header>
      <section className="info-section">
        {done === "ok" ? (
          <p role="status">Thank you. Your address is confirmed. The next issue will come to you.</p>
        ) : done === "unknown" ? (
          <p role="status">That link is not valid, or it has already been used. You can sign up again on the newsletter page.</p>
        ) : isNewsletterToken(token) ? (
          <form action={confirmNewsletter}>
            <p>Press the button to finish signing up.</p>
            <input type="hidden" name="t" value={token} />
            <button className="btn" type="submit">
              Confirm my address
            </button>
          </form>
        ) : (
          <p>That link is not valid, or it has already been used. You can sign up again on the newsletter page.</p>
        )}
        <p>
          <Link href="/newsletter">About the newsletter</Link>
        </p>
      </section>
    </main>
  );
}
