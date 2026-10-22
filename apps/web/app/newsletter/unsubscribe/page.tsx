import type { Metadata } from "next";
import Link from "next/link";
import { isNewsletterToken } from "@/lib/newsletter";
import { unsubscribeNewsletter } from "../actions";

/**
 * Unsubscribe (6.11). The link in the email opens this page and changes nothing.
 * Only the button does, so a mail scanner that opens links cannot act for the
 * person. The token is in the address, so the page is never indexed and sends
 * no referrer.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Unsubscribe",
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
        <h1>Unsubscribe</h1>
      </header>
      <section className="info-section">
        {done === "ok" ? (
          <p role="status">You are unsubscribed. No more newsletters will be sent to this address.</p>
        ) : done === "unknown" ? (
          <p role="status">That link is not valid. If you still get the newsletter, use the link in the latest email, or write to us from the address that receives it.</p>
        ) : isNewsletterToken(token) ? (
          <form action={unsubscribeNewsletter}>
            <p>Press the button and the newsletter stops.</p>
            <input type="hidden" name="t" value={token} />
            <button className="btn" type="submit">
              Unsubscribe me
            </button>
          </form>
        ) : (
          <p>That link is not valid. If you still get the newsletter, use the link in the latest email, or write to us from the address that receives it.</p>
        )}
        <p>
          <Link href="/newsletter">About the newsletter</Link>
        </p>
      </section>
    </main>
  );
}
