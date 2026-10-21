import type { ReactNode } from "react";
import { Confetti } from "./Confetti";

/**
 * The programme-end reveal (plan 1.6): a larger moment than the unit-end
 * burst. Three lines open in turn, with the bigger confetti. Pass
 * celebrate={false} for a wellbeing title: the words stay, the confetti goes.
 */
export function ProgrammeReveal({ title, line, children, celebrate = true }: { title: string; line: string; children?: ReactNode; celebrate?: boolean }) {
  return (
    <section className="reveal" aria-labelledby="reveal-h">
      {celebrate ? <Confetti size="programme" /> : null}
      <h2 id="reveal-h">{title}</h2>
      <p>{line}</p>
      {children ? <div>{children}</div> : null}
    </section>
  );
}
