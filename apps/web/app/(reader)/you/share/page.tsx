import type { Metadata } from "next";
import Link from "next/link";
import { ShareLink } from "@/components/share/ShareLink";
import { getReaderSession } from "@/lib/auth";
import { exercisePath } from "@/lib/share/exercise";
import { quotableLines, quoteImagePath, signQuote } from "@/lib/share/quote";
import { quoteLinesFor, readerPlainWorkbooks, readerSendables } from "@/lib/share/server";

export const metadata: Metadata = { title: "Share", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? "") : (v ?? ""));

/**
 * Share (12.3): send an exercise, or make a quote image. What goes out is
 * workbook text only: the question an exercise asks, or a line the book
 * itself holds. Never an answer. The reader sends the link through their own
 * channels; Akana contacts nobody. Titles that deal with mental health are
 * left out of both.
 */
export default async function SharePage({ searchParams }: Props) {
  const sp = await searchParams;
  const session = await getReaderSession();
  if (!session) return null;
  const secret = process.env.QUOTE_IMAGE_SECRET ?? "";

  const [sendables, plain] = await Promise.all([readerSendables(session.userId).catch(() => []), secret ? readerPlainWorkbooks(session.userId).catch(() => []) : Promise.resolve([])]);

  const w = one(sp.w);
  const chosen = plain.find((p) => p.slug === w) ?? null;
  const lines = chosen ? await quoteLinesFor(session.userId, chosen.slug, quotableLines).catch(() => []) : [];
  const pickRaw = Number.parseInt(one(sp.pick), 10);
  const pick = Number.isInteger(pickRaw) && pickRaw >= 0 && pickRaw < lines.length ? pickRaw : null;
  const pickedLine = pick !== null ? lines[pick] : null;
  const sig = chosen && pickedLine ? signQuote(secret, chosen.slug, pickedLine.text) : null;
  const imagePath = chosen && pickedLine && sig ? quoteImagePath(chosen.slug, pickedLine.text, sig) : null;

  return (
    <section className="tab-page you-page">
      <p className="eyebrow">
        <Link href="/you">You</Link>
      </p>
      <h1>Share</h1>
      <p className="muted">You can send an exercise or a line from a workbook. Answers are never part of it. They stay yours.</p>

      <section className="you-section" aria-labelledby="share-ex">
        <h2 id="share-ex">Send an exercise</h2>
        <p className="muted">The friend sees the questions and the time it takes, and can open the workbook. They see nothing of what you wrote.</p>
        {sendables.length === 0 ? (
          <p>Exercises from the first week of your workbooks will appear here.</p>
        ) : (
          sendables.map((wb) => (
            <div key={wb.slug} className="card share-card">
              <h3>{wb.title}</h3>
              <ul className="share-list">
                {wb.exercises.map((e) => {
                  const path = exercisePath(wb.slug, e.id);
                  return path ? (
                    <li key={e.id}>
                      <span>{e.title}</span> <ShareLink path={path} shareTitle={e.title} />
                    </li>
                  ) : null;
                })}
              </ul>
            </div>
          ))
        )}
      </section>

      {secret ? (
        <section className="you-section" aria-labelledby="share-quote">
          <h2 id="share-quote">Make a quote image</h2>
          <p className="muted">Pick a workbook, then a line from its own text. The picture holds that line and nothing else.</p>
          {plain.length === 0 ? (
            <p>Your workbooks will appear here once you have started one.</p>
          ) : (
            <ul className="share-list">
              {plain.map((p) => (
                <li key={p.slug}>
                  <Link href={`/you/share?w=${encodeURIComponent(p.slug)}#share-quote`} aria-current={chosen?.slug === p.slug ? "true" : undefined}>
                    {p.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {chosen && lines.length === 0 ? <p>There are no lines to quote in the part of this workbook you can read yet.</p> : null}
          {chosen && lines.length > 0 ? (
            <ol className="share-lines">
              {lines.map((l, i) => (
                <li key={`${l.unit}-${i}`}>
                  <Link href={`/you/share?w=${encodeURIComponent(chosen.slug)}&pick=${i}#share-preview`} aria-current={pick === i ? "true" : undefined}>
                    {l.text}
                  </Link>
                </li>
              ))}
            </ol>
          ) : null}
          {imagePath ? (
            <div id="share-preview" className="card share-preview">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagePath} alt={pickedLine?.text ?? "Quote image"} width={540} height={540} />
              <p>
                <a className="btn secondary" href={imagePath} download="quote.png">
                  Save the picture
                </a>{" "}
                <ShareLink path={imagePath} label="Copy picture link" shareTitle="A line I liked" />
              </p>
            </div>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
