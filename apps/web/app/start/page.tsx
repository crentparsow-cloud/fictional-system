import type { Metadata } from "next";
import { Quiz } from "@/components/start/Quiz";
import { listLibrary, listShelvesWithThemes, type LibraryCard } from "@/lib/catalogue";
import { buildQuizCatalogue } from "@/lib/quiz-candidates";
import { getReaderSession } from "@/lib/auth";

/**
 * The onboarding quiz (5.1) at /start. Public: no account, no sign-in in
 * front of it. Server rendered only for the catalogue it picks from; the
 * answers are given and kept in the browser and are never sent here. If the
 * catalogue cannot be read the quiz still opens and ends at the library.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Find your first workbook",
  description: "Four short questions, then three workbooks to start with. No account needed.",
};

export default async function StartPage() {
  let cards: LibraryCard[] = [];
  let shelves: Awaited<ReturnType<typeof listShelvesWithThemes>> = [];
  try {
    [cards, shelves] = await Promise.all([listLibrary({}), listShelvesWithThemes()]);
  } catch (err) {
    console.error("start: catalogue read failed", err instanceof Error ? err.message : err);
  }
  const session = await getReaderSession();
  return (
    <main className="wrap quiz-page" id="main">
      <Quiz catalogue={buildQuizCatalogue(cards, shelves)} signedIn={Boolean(session)} />
    </main>
  );
}
