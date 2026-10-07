"use client";

import type { WorkbookV3 } from "@akana/schema";
import { Card, Eyebrow } from "./parts";

export interface FinishScreenProps {
  workbook: WorkbookV3;
  onOpenKeepGoing?: () => void;
  onOpenPlan?: () => void;
  /**
   * Where "Get the book" goes: the app's /go/ link for this workbook, so no
   * store link is built in the browser (F-017). Left out, no button shows.
   */
  buyHref?: string;
  /** Called when the reader marks the workbook finished. */
  onFinished?: () => void;
  finished?: boolean;
}

/**
 * The last screen of the programme (F-017). The summary, then the book and
 * its author, with a link to get it. This screen is the author's main
 * reward, so it names both plainly. After that, Keep going.
 */
export function FinishScreen({ workbook: doc, onOpenKeepGoing, onOpenPlan, buyHref, onFinished, finished }: FinishScreenProps) {
  const count = doc.structure.count;
  const unitWord = { week: "weeks", day: "days", module: "modules", chapter: "chapters" }[doc.structure.unit];
  return (
    <section className="ak-screen ak-finish">
      <header>
        <Eyebrow>
          {count} {unitWord}
        </Eyebrow>
        <h2 className="ak-h2">{finished ? "You did it" : "The finish"}</h2>
      </header>
      {doc.finish.summary ? <p>{doc.finish.summary}</p> : null}
      {onFinished && !finished ? (
        <Card>
          <p>When you have done the {unitWord} you want to do, mark this workbook finished. Everything you wrote stays here.</p>
          <button type="button" className="ak-btn" onClick={onFinished}>
            Mark as finished
          </button>
        </Card>
      ) : null}
      {finished ? (
        <p className="ak-small ak-muted" role="status">
          Finished. You can keep going whenever you like.
        </p>
      ) : null}
      <Card flat>
        <Eyebrow>The book</Eyebrow>
        <p className="ak-finish-book">
          <b>{doc.book.title}</b>
          {doc.book.subtitle ? `: ${doc.book.subtitle}` : ""}
          <br />
          by {doc.author.display_name}
        </p>
        {doc.finish.book_bridge ? <p>{doc.finish.book_bridge}</p> : null}
        {buyHref ? (
          <a className="ak-btn ak-btn-secondary" href={buyHref} rel="noopener noreferrer" target="_blank">
            Get the book
          </a>
        ) : null}
      </Card>
      <div className="ak-row">
        {onOpenPlan && doc.plan_sections.length ? (
          <button type="button" className="ak-btn ak-btn-secondary" onClick={onOpenPlan}>
            Open My plan
          </button>
        ) : null}
        {onOpenKeepGoing && doc.keep_going ? (
          <button type="button" className="ak-btn" onClick={onOpenKeepGoing}>
            Keep going
          </button>
        ) : null}
      </div>
    </section>
  );
}
