import type { OnThisDayView } from "@/lib/habit/server";

/** "On this day": one earlier answer of the reader's own, shown only to them. */
export function OnThisDay({ view }: { view: OnThisDayView }) {
  return (
    <section className="card on-this-day" aria-labelledby="otd-h" data-testid="on-this-day">
      <h2 id="otd-h" className="small muted">
        {view.label}, you wrote
      </h2>
      <p className="small muted">{view.question}</p>
      <blockquote className="on-this-day-text">{view.text}</blockquote>
      <p className="small muted">Only you can see this.</p>
    </section>
  );
}
