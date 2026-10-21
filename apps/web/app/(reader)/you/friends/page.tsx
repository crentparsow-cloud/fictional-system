import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InviteForm } from "@/components/friends/InviteForm";
import { getReaderSession } from "@/lib/auth";
import { myEnrolments } from "@/lib/catalogue";
import { INVITE_STATEMENTS, pairNotice, statusLine } from "@/lib/friends/pair";
import { loadMyPairs } from "@/lib/friends/server";
import { flagEnabled } from "@/lib/platform/flags-server";
import { endPairing } from "./actions";

export const metadata: Metadata = { title: "Do it with a friend", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * Do a programme with a friend (6.2). Opt-in on both sides. The reader makes
 * a link and sends it themselves; the friend accepts on a page that says what
 * is shared. They see whether the other did a step today, and can send a
 * pre-written nudge. Never an answer. Behind the programme_friends flag.
 */
export default async function FriendsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const session = await getReaderSession();
  if (!session) return null;
  const [on, pairs, enrolments] = await Promise.all([flagEnabled("programme_friends"), loadMyPairs(), myEnrolments(session.userId).catch(() => [])]);
  if (!on && pairs.length === 0) notFound();
  const busy = new Set(pairs.map((p) => p.slug));
  const programmes = enrolments.filter((e) => e.safetyTier === "none" && !busy.has(e.slug)).map((e) => ({ enrolmentId: e.enrolmentId, title: e.shortTitle ?? e.title }));
  const notice = pairNotice(sp.notice);

  return (
    <section className="tab-page you-page">
      <p className="eyebrow">
        <Link href="/you">You</Link>
      </p>
      <h1>Do it with a friend</h1>
      <p className="muted">Read the same workbook alongside someone. It is your choice and theirs, and either of you can stop at any time.</p>
      <ul>
        {INVITE_STATEMENTS.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
      {notice ? (
        <p className="you-notice" role="status">
          {notice}
        </p>
      ) : null}

      {pairs.length > 0 ? (
        <section className="you-section" aria-labelledby="friends-now">
          <h2 id="friends-now">Your pairings</h2>
          {pairs.map((p) => (
            <div key={p.pairId} className="card friends-pair">
              <h3>{p.title}</h3>
              {p.status === "invited" ? (
                <p className="muted">Waiting for {p.label} to accept. The link works for 14 days.</p>
              ) : (
                <p>{statusLine(p)}</p>
              )}
              <form action={endPairing}>
                <input type="hidden" name="pair" value={p.pairId} />
                <button type="submit" className="btn secondary">
                  {p.status === "invited" ? "Cancel the invitation" : "Stop doing this together"}
                </button>
              </form>
            </div>
          ))}
        </section>
      ) : null}

      {on ? (
        <section className="you-section" aria-labelledby="friends-new">
          <h2 id="friends-new">Invite someone</h2>
          {programmes.length === 0 ? <p>Start a workbook first. Workbooks on mental health are read on your own, so they are not listed.</p> : <InviteForm programmes={programmes} />}
        </section>
      ) : null}
    </section>
  );
}
