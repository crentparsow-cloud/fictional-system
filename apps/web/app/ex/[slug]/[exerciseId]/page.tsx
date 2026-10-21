import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InfoFooter } from "@/components/InfoFooter";
import { brand } from "@/lib/brand";
import { loadPublicExercise } from "@/lib/share/server";

/**
 * An exercise someone sent (12.3): /ex/<workbook>/<exercise>. It shows the
 * prompt and nothing else: the title, why it helps, the time it takes and the
 * questions. No answer, no example answer, no sender. Only exercises in a
 * title's free units, for a title at safety tier none, can be shown, and the
 * page reads them the way a signed-out visitor would, so it can never show
 * more than the public sample already does. Not indexed.
 */
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string; exerciseId: string }> };

export const metadata: Metadata = {
  title: "An exercise to try",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function SentExercisePage({ params }: Props) {
  const { slug, exerciseId } = await params;
  const found = await loadPublicExercise(slug, exerciseId).catch(() => null);
  if (!found) notFound();
  const { workbook, exercise } = found;
  return (
    <main className="wrap info-page share-page">
      <header className="info-head">
        <p className="eyebrow muted">{brand.name}</p>
        <h1>{exercise.title}</h1>
        <p className="muted">About {exercise.minutes} minutes. Someone thought this one might help you.</p>
      </header>
      {exercise.purpose ? <p>{exercise.purpose}</p> : null}
      {exercise.questions.length ? (
        <section aria-labelledby="ex-questions">
          <h2 id="ex-questions">The questions</h2>
          <ol>
            {exercise.questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ol>
          <p className="muted">Think them over, or write them down somewhere only you can see.</p>
        </section>
      ) : null}
      <p>
        <Link className="btn" href={`/w/${workbook.slug}`}>
          Open the workbook and try it there
        </Link>
      </p>
      <p className="muted small">Your answers stay yours. Nothing you write in a workbook is shared with the person who sent this.</p>
      <InfoFooter />
    </main>
  );
}
