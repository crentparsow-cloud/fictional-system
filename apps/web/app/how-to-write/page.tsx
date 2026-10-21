import type { Metadata } from "next";
import Link from "next/link";
import { LIMITS, UNIT_SPEC } from "@akana/validate";
import { InfoFooter } from "@/components/InfoFooter";
import { brand } from "@/lib/brand";

export const metadata: Metadata = {
  title: `How to write for ${brand.name}`,
  description: `One page on what a ${brand.name} unit looks like, the house rules and what the checks look for. For authors and publishers.`,
  alternates: { canonical: "/how-to-write" },
};

/**
 * "How to write for Akana": the one-page spec for authors and publishers
 * (build list, Studio group). Public. The numbers come from the validator
 * (packages/validate), so this page cannot drift from the checks. The longer
 * written standard is docs/content/UNIT_SPEC.md.
 */
export default function HowToWritePage() {
  const [ideasMin, ideasMax] = UNIT_SPEC.ideas;
  const [ideaWordsMin, ideaWordsMax] = UNIT_SPEC.ideaWords;
  const [introMin, introMax] = UNIT_SPEC.introSentences;
  const [readMin, readMax] = UNIT_SPEC.readingMinutes;
  const [totalMin, totalMax] = UNIT_SPEC.totalMinutes;

  return (
    <main className="wrap contact-page how-to-write">
      <h1>How to write for {brand.name}</h1>
      <p>
        A {brand.name} workbook turns a book into a guided programme. A reader opens one unit at a time, reads for a few minutes, answers a small number of direct
        questions and leaves with one thing to carry. This page says what a unit contains, the rules every workbook follows and what our checks look for.
      </p>
      <p className="muted">
        Authors and publishers can build and edit units in the <Link href="/studio">Studio</Link>, and plan a programme with the{" "}
        <Link href="/studio/outline">outline generator</Link>. To start a workbook, <Link href="/publish">publish with {brand.name}</Link>.
      </p>

      <section aria-labelledby="unit-h">
        <h2 id="unit-h">One unit</h2>
        <p>
          A unit is one week, day, module or chapter. The reading and the exercises together take about {totalMin} to {totalMax} minutes, with {readMin} to{" "}
          {readMax} minutes of reading. A unit has five parts, in this order.
        </p>
        <ol>
          <li>
            <strong>A title that is a full sentence.</strong> It says what the unit is about and has at least {UNIT_SPEC.headingMinWords} words. &ldquo;Marcus begins by
            naming everyone who taught him how to live&rdquo; works. &ldquo;Gratitude&rdquo; does not.
          </li>
          <li>
            <strong>An introduction.</strong> {introMin} to {introMax} sentences, up to {LIMITS["units[].intro"]} words. What the reader will be able to do or see by the
            end, and why it matters. No praise for the book and no promise about results.
          </li>
          <li>
            <strong>Key ideas.</strong> {ideasMin} to {ideasMax} of them. Each has a heading that is a full sentence and makes a claim, an explanation in the
            author&apos;s terms and one short, concrete example. A whole idea runs {ideaWordsMin} to {ideaWordsMax} words. Fewer ideas done well beat many thin ones.
          </li>
          <li>
            <strong>Exercises.</strong> One to three. Each is a short set-up paragraph and one direct question. A direct question can be answered in one line. Steps
            are the mechanics only, up to {LIMITS["exercises[].steps[].text"]} words each. Every exercise says when the reader can call it done, and most have a short
            version for a hard day.
          </li>
          <li>
            <strong>A closing takeaway.</strong> One or two sentences, up to {LIMITS["units[].takeaway"]} words, that the reader could repeat to someone else. It
            names what the unit gave them, not how they should feel.
          </li>
        </ol>
      </section>

      <section aria-labelledby="rules-h">
        <h2 id="rules-h">House rules</h2>
        <ul>
          <li>Plain English, in short sentences. Write to one person, as &ldquo;you&rdquo;.</li>
          <li>UK or US spelling to match your book, used throughout.</li>
          <li>No em dashes, no emojis, no exclamation marks and no curly quotes.</li>
          <li>No claim that a workbook treats, cures or heals anything, or that an exercise is proven. We say what to do and let the reader find out.</li>
          <li>No promise of income or results in finance, business or career workbooks. Those carry a plain note that they are not advice.</li>
          <li>No scores or labels from a self-check, and no streaks, missed days or reproach. A return after a gap is a welcome back.</li>
          <li>Safety lines and Help now on wellbeing workbooks are written and checked by us. You cannot change them, and they look the same in every workbook.</li>
          <li>Quotations from the book are exact and name the edition. Never paraphrase and present it as the author&apos;s words.</li>
        </ul>
      </section>

      <section aria-labelledby="limits-h">
        <h2 id="limits-h">Word limits</h2>
        <p>The checks count words in the places below. Going over is an error you fix before review.</p>
        <table className="admin-table">
          <caption className="admin-vh">Word limits</caption>
          <thead>
            <tr>
              <th scope="col">Where</th>
              <th scope="col">Most words</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["Card line on the library page", LIMITS.card_line],
              ["Exercise title", LIMITS["exercises[].title"]],
              ["Exercise purpose", LIMITS["exercises[].purpose"]],
              ["Why the exercise helps", LIMITS["exercises[].why"]],
              ["One step", LIMITS["exercises[].steps[].text"]],
              ["Done when", LIMITS["exercises[].done_when"]],
              ["Unit introduction", LIMITS["units[].intro"]],
              ["One key idea explanation", LIMITS["units[].ideas[].body"]],
              ["Closing takeaway", LIMITS["units[].takeaway"]],
              ["Welcome on the start screen", LIMITS["start.welcome"]],
            ].map(([where, n]) => (
              <tr key={String(where)}>
                <td>{where}</td>
                <td>{n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="after-h">
        <h2 id="after-h">What happens next</h2>
        <p>
          Your draft runs through the checks as you save it. An editor reads it, and a safety reviewer reads any workbook with a safety tier. You preview it as readers
          will see it and sign off the exact version. Nothing goes live without your sign-off. Readers&apos; answers stay sealed, so neither you nor we can read what
          anyone writes. You see counts only, and any count under 10 is hidden.
        </p>
      </section>

      <InfoFooter />
    </main>
  );
}
