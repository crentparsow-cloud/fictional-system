import { deleteAllThenNow, deleteThenNowEntry } from "@/app/(reader)/you/then-now-actions";
import { loadEntries } from "@/lib/then-now-server";
import { feelingWord, groupBySteps, thenAndNow } from "@/lib/reading/then-now";
import { createUserClient } from "@/lib/supabase/server";

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });

/**
 * "Then and now" (3.10): the reader's own one tap check-ins, step by step.
 * Left out when nothing can be read. Every entry has its own delete button,
 * and there is one to clear them all. Nothing here is counted or scored, and
 * the words never say better, worse, streak or missed.
 */
export async function ThenNowHistory({ userId }: { userId: string }) {
  let entries: Awaited<ReturnType<typeof loadEntries>> = null;
  try {
    entries = await loadEntries(await createUserClient(), userId);
  } catch {
    entries = null;
  }
  if (entries === null) return null;
  const groups = groupBySteps(entries);

  return (
    <section className="you-section" id="then-and-now" aria-labelledby="you-thennow">
      <h2 id="you-thennow">Then and now</h2>
      <p className="muted">
        If you turn on the check-in in your reading settings (the Aa button), you can tap how you are arriving before a step. Only you can see these. Delete any of them whenever you like.
      </p>
      {groups.length === 0 ? (
        <p className="small muted">Nothing here yet.</p>
      ) : (
        <>
          <ul className="tn-list">
            {groups.map((g) => (
              <li key={g.key} className="card tn-step">
                <h3>{g.step || "A step"}</h3>
                {g.book ? <p className="small muted">{g.book}</p> : null}
                {thenAndNow(g) ? <p className="tn-line">{thenAndNow(g)}</p> : null}
                <ul className="tn-entries">
                  {g.entries.map((e) => (
                    <li key={e.id}>
                      <span>
                        {day.format(new Date(e.takenAt))}: <b>{feelingWord(e.feeling)}</b>
                      </span>
                      <form action={deleteThenNowEntry}>
                        <input type="hidden" name="id" value={e.id} />
                        <button type="submit" className="btn secondary tn-del" aria-label={`Delete the entry from ${day.format(new Date(e.takenAt))}`}>
                          Delete
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <form action={deleteAllThenNow}>
            <button type="submit" className="btn secondary">
              Delete all of them
            </button>
          </form>
        </>
      )}
    </section>
  );
}
