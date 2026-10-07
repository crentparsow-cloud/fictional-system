"use client";

import { HelpNowButton } from "@/components/HelpNowButton";

/**
 * The hardest answer card (F-022). Shown after a reader saves an answer in a
 * field the content marks as sensitive, at most once a week. It offers Help
 * now and a way to carry on. It never tells anyone and sends nothing.
 *
 * The wording is new: the legacy app had no such card. Crent to review.
 */
export function HardestAnswerCard({ market, onClose }: { market: string | null; onClose: () => void }) {
  return (
    <aside className="hardest-card" aria-labelledby="hardest-title" aria-live="polite">
      <h3 id="hardest-title">That may have been hard to write</h3>
      <p>Thank you for putting it into words. If it has stirred things up, you do not have to deal with it on your own.</p>
      <p>Help now shows who you can contact where you live. Nobody is told what you wrote. Only you can read it.</p>
      <div className="hardest-actions">
        <HelpNowButton market={market} />
        <button type="button" className="btn secondary" onClick={onClose}>
          Carry on
        </button>
      </div>
    </aside>
  );
}
