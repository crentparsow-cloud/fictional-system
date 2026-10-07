import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { OPT_OUT_COOKIE, countingOptedOut } from "@/lib/funnel";
import { setCounting } from "./action";

export const metadata: Metadata = { title: "What we count" };
export const dynamic = "force-dynamic";

/**
 * What Akana counts, and the switch to turn it off (F-141). Copy is a draft
 * for Crent and the lawyer, alongside the privacy notice.
 */
export default async function CountingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const h = await headers();
  const jar = await cookies();
  const byBrowser = h.get("sec-gpc")?.trim() === "1" || h.get("dnt")?.trim() === "1";
  const byCookie = jar.get(OPT_OUT_COOKIE)?.value === "1";
  const off = countingOptedOut(h, jar);
  const saved = Array.isArray(sp.saved) ? sp.saved[0] : sp.saved;

  return (
    <main className="wrap counting-page">
      <h1>What we count</h1>
      <p>
        To know whether Akana is working, we keep a few daily totals: pages viewed, samples opened, free weeks started, checkouts started, purchases and weeks
        completed. Each one adds one to a count for that day, and for the workbook when there is one.
      </p>
      <p>We do not record who you are, your address, your device or anything you write. Your answers are sealed and never counted.</p>
      <p>The totals stay on our own servers. We use no advertising, no third-party analytics and no session recording. We keep the totals for 13 months.</p>

      <section className="card" aria-labelledby="switch-h">
        <h2 id="switch-h">Counting in this browser</h2>
        {saved === "off" || saved === "on" ? (
          <p className="admin-notice admin-notice-ok" role="status">
            Saved.
          </p>
        ) : null}
        <p>
          {off ? <strong>Off.</strong> : <strong>On.</strong>}{" "}
          {byBrowser
            ? "Your browser asks sites not to track it, so we do not count your visits."
            : off
              ? "We do not count your visits from this browser."
              : "Your visits add to the daily totals."}
        </p>
        {byBrowser ? null : (
          <form action={setCounting}>
            <input type="hidden" name="counting" value={byCookie ? "on" : "off"} />
            <button type="submit" className="btn secondary">
              {byCookie ? "Turn counting back on" : "Turn counting off"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
