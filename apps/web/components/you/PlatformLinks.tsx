import Link from "next/link";
import { finishedProgrammes } from "@/lib/certificate/server";
import { loadMyPairs } from "@/lib/friends/server";
import { flagEnabled } from "@/lib/platform/flags-server";

/**
 * The You page entries for sharing and doing a workbook with a friend
 * (12.2, 12.3, 6.2). Certificates are listed for finished programmes, each
 * private until the reader says otherwise. The friend entry shows only while
 * the programme_friends flag is on for the reader, or a pairing already exists.
 */
export async function PlatformLinks({ userId }: { userId: string }) {
  const [finished, friendsOn, pairs] = await Promise.all([
    finishedProgrammes(userId).catch(() => []),
    flagEnabled("programme_friends"),
    loadMyPairs(),
  ]);
  return (
    <>
      <section className="you-section" aria-labelledby="you-share">
        <h2 id="you-share">Share</h2>
        <p className="muted">Send an exercise or a line from a workbook to someone. Your answers are never part of it.</p>
        <p>
          <Link href="/you/share">Share an exercise or a quote</Link>
        </p>
        {friendsOn || pairs.length > 0 ? (
          <p>
            <Link href="/you/friends">Do a workbook with a friend</Link>
          </p>
        ) : null}
      </section>
      {finished.length > 0 ? (
        <section className="you-section" aria-labelledby="you-certs">
          <h2 id="you-certs">Certificates</h2>
          <p className="muted">One for each workbook you finished. Private unless you choose otherwise.</p>
          <ul>
            {finished.map((f) => (
              <li key={f.enrolmentId}>
                <Link href={`/you/certificates/${f.slug}`}>{f.title}</Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
