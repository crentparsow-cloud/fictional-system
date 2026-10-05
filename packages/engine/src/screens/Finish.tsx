"use client";

import type { WorkbookV3 } from "@akana/schema";
import { Card, Eyebrow } from "./parts";

export interface FinishScreenProps {
  workbook: WorkbookV3;
  onOpenKeepGoing?: () => void;
}

/** The last screen of the programme. Summary, then the bridge back to the book. */
export function FinishScreen({ workbook: doc, onOpenKeepGoing }: FinishScreenProps) {
  const count = doc.structure.count;
  const unitWord = { week: "weeks", day: "days", module: "modules", chapter: "chapters" }[doc.structure.unit];
  return (
    <section className="ak-screen ak-finish">
      <header>
        <Eyebrow>
          {count} {unitWord} done
        </Eyebrow>
        <h2 className="ak-h2">You did it</h2>
      </header>
      <p>{doc.finish.summary}</p>
      <Card flat>
        <Eyebrow>The book</Eyebrow>
        <p>{doc.finish.book_bridge}</p>
        <p className="ak-muted ak-small">
          {doc.book.title}
          {doc.book.subtitle ? `: ${doc.book.subtitle}` : ""}, by {doc.author.display_name}.
        </p>
      </Card>
      {onOpenKeepGoing && doc.keep_going ? (
        <button type="button" className="ak-btn" onClick={onOpenKeepGoing}>
          Keep going
        </button>
      ) : null}
    </section>
  );
}
