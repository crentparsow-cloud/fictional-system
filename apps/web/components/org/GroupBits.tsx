import { FacilitatorGuide, guideUnitPlannedMinutes, type GuideUnit } from "@akana/schema";
import { groupNotice, weeklyDates } from "@/lib/org-groups";
import type { ScheduleRow } from "@/lib/org-groups-server";

/**
 * Pieces shared by the owner's group page and the leader view (F-211,
 * F-212). Server components; forms post to server actions, so they work
 * without JavaScript.
 */

export function GroupNoticeLine({ code }: { code: string | string[] | undefined }) {
  const m = groupNotice(code);
  if (!m) return null;
  return (
    <p className={`admin-notice admin-notice-${m.tone}`} role={m.tone === "error" ? "alert" : "status"}>
      {m.text}
    </p>
  );
}

/**
 * One date per unit. Before a schedule is saved, the dates are filled one
 * unit a week from the group's start date; each can then be changed.
 * Soft pace: the dates say what the group is on, they never lock a unit.
 */
export function ScheduleEditor({
  action,
  hidden,
  units,
  schedule,
  startsOn,
  disabled,
}: {
  action: (fd: FormData) => Promise<void>;
  hidden: Record<string, string>;
  units: readonly number[];
  schedule: readonly ScheduleRow[];
  startsOn: string | null;
  disabled?: boolean;
}) {
  const byUnit = new Map(schedule.map((s) => [s.unit_number, s.opens_on]));
  const suggested = startsOn ? weeklyDates(units, startsOn) : [];
  const inputs = Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />);
  if (units.length === 0) {
    return <p className="muted">This workbook&apos;s units could not be read. Contact the Akana team.</p>;
  }
  return (
    <div className="group-schedule">
      <form action={action} className="admin-form">
        {inputs}
        <fieldset disabled={disabled}>
          <legend>Unit dates</legend>
          <div className="group-schedule-grid">
            {units.map((u, i) => (
              <div key={u} className="group-schedule-row">
                <label htmlFor={`date_${u}`}>Unit {u}</label>
                <input id={`date_${u}`} name={`date_${u}`} type="date" defaultValue={schedule.length > 0 ? (byUnit.get(u) ?? "") : (suggested[i] ?? "")} />
              </div>
            ))}
          </div>
          <p className="muted small">Leave a date empty to leave that unit off the schedule. Nothing is locked: members can read ahead or catch up.</p>
          <button type="submit" className="btn">
            Save schedule
          </button>
        </fieldset>
      </form>
    </div>
  );
}

/** Read a stored guide. A guide that does not parse is not shown. */
export function parseGuide(content: unknown) {
  const r = FacilitatorGuide.safeParse(content);
  return r.success ? r.data : null;
}

export function GuideUnitView({ unit }: { unit: GuideUnit }) {
  const planned = guideUnitPlannedMinutes(unit);
  return (
    <article className="group-guide-unit" aria-labelledby={`guide-unit-${unit.unit_number}`}>
      <h3 id={`guide-unit-${unit.unit_number}`}>
        Unit {unit.unit_number} <span className="muted small">{unit.minutes} minutes{planned ? `, ${planned} planned` : ""}</span>
      </h3>
      {unit.aim ? <p>{unit.aim}</p> : null}
      {unit.opening ? (
        <p>
          <strong>Opening, {unit.opening.minutes} min.</strong> {unit.opening.text}
        </p>
      ) : null}
      <ol className="group-guide-questions">
        {unit.discussion.map((q, i) => (
          <li key={i}>
            <p>
              {q.question} <span className="muted small">({q.minutes} min)</span>
            </p>
            {q.follow_up ? <p className="muted">Follow-up: {q.follow_up}</p> : null}
          </li>
        ))}
      </ol>
      {unit.closing ? (
        <p>
          <strong>Closing, {unit.closing.minutes} min.</strong> {unit.closing.text}
        </p>
      ) : null}
      {unit.leader_note ? <p className="muted">For you: {unit.leader_note}</p> : null}
    </article>
  );
}
