import type { Metadata } from "next";
import Link from "next/link";
import { isTokenShaped } from "@/lib/partner";

/**
 * Stop the marketing emails, opened from the link in the footer of a win-back
 * note. Opening the page changes nothing; the button posts to
 * /api/email/unsubscribe. No account is needed.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Stop these emails", robots: { index: false, follow: false, nocache: true }, referrer: "no-referrer" };

type Props = { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function UnsubscribePage({ params, searchParams }: Props) {
  const { token } = await params;
  const sp = await searchParams;
  const done = typeof sp.done === "string" ? sp.done : null;
  return (
    <main className="wrap info-page">
      <h1>Stop these emails</h1>
      {done === "1" ? (
        <p role="status">Done. We will not send you these emails again. Emails about your account, such as receipts, still come when they need to.</p>
      ) : done === "failed" || !isTokenShaped(token) ? (
        <p role="status">That link did not work. It may be old. You can write to us and we will stop them by hand.</p>
      ) : (
        <>
          <p>This stops the occasional note we send to people who used to be members or bought a workbook. It does not close your account or touch your answers.</p>
          <form method="post" action="/api/email/unsubscribe">
            <input type="hidden" name="t" value={token} />
            <button type="submit" className="btn">
              Stop these emails
            </button>
          </form>
        </>
      )}
      <p>
        <Link href="/">Back to the home page</Link>
      </p>
    </main>
  );
}
