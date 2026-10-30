import Link from "next/link";
import { MonthThreeCard } from "@/components/today/MonthThreeCard";
import { PickupReflection } from "@/components/today/PickupReflection";
import { stepCardWords, stepStatus, type TodayCard } from "@/lib/today/cards";

/**
 * The cards on Today (4.1): a step card for each open programme with a step
 * to do, the most due first, then a toolkit card and a suggestion. Plain
 * words, one action each. No
 * streak, no count of days, nothing that says what was missed.
 */

const SUGGESTION_LABEL = {
  related: "You might like",
  next_programme: "The next programme to try",
  start_here: "A good place to start",
} as const;

const about = (minutes: number | null | undefined) => (minutes && minutes > 0 ? `About ${minutes} ${minutes === 1 ? "minute" : "minutes"}.` : null);

export interface WelcomeBack {
  enrolmentId: string;
  reflectionField: string;
  gapKey: string;
  minutes: number;
  short: boolean;
}

export function TodayCards({ cards, hrefs, welcomeBack, readOnly }: { cards: TodayCard[]; hrefs: string[]; welcomeBack: WelcomeBack | null; readOnly: boolean }) {
  return (
    <div className="today-cards">
      {cards.map((card, i) => {
        const href = hrefs[i] ?? "/explore";
        if (card.kind === "step") {
          const back = welcomeBack?.enrolmentId === card.programme.enrolmentId ? welcomeBack : null;
          const minutes = back ? back.minutes : card.step.minutes;
          const words = stepCardWords(card.programme, card.step.unit);
          const due = stepStatus(card.programme) === "due";
          const hid = `today-step-${card.programme.enrolmentId}`;
          return (
            <article key={`step-${card.programme.enrolmentId}`} className="card today-card" aria-labelledby={hid} data-status={stepStatus(card.programme)}>
              <p className="eyebrow">{back ? "Welcome back" : words.status}</p>
              {back ? <p>Welcome back. Here is where you were, and one easy step.</p> : null}
              <h2 id={hid}>{card.step.unitName || card.step.title}</h2>
              <p className="muted">
                {card.programme.title}. {words.place}. {words.next}.
              </p>
              <p className="muted">{about(minutes)}</p>
              <Link className={due || back ? "btn" : "btn secondary"} href={href}>
                {back ? "Pick up here" : due ? "Open today's step" : "Open the next step"}
              </Link>
              {back ? <PickupReflection enrolmentId={back.enrolmentId} field={back.reflectionField} skipKey={back.gapKey} readOnly={readOnly} /> : null}
            </article>
          );
        }
        if (card.kind === "tool") {
          return (
            <article key="tool" className="card today-card" aria-labelledby="today-tool">
              <p className="eyebrow">From your toolkit</p>
              <h2 id="today-tool">{card.tool.title}</h2>
              <p className="muted">{about(card.tool.minutes)}</p>
              <Link className="btn secondary" href={href}>
                Open your toolkit
              </Link>
            </article>
          );
        }
        if (card.kind === "shared_offer") return <MonthThreeCard key="shared_offer" offer={card.offer} href={href} />;
        return (
          <article key="suggestion" className="card today-card" aria-labelledby="today-suggestion">
            <p className="eyebrow">{SUGGESTION_LABEL[card.suggestion.kind]}</p>
            <h2 id="today-suggestion">{card.suggestion.title}</h2>
            <p className="muted">{card.suggestion.line}</p>
            <Link className="btn secondary" href={href}>
              Take a look
            </Link>
          </article>
        );
      })}
    </div>
  );
}
