import { bringBackSetAside, saveTodaySettings } from "@/app/(reader)/you/today-actions";
import { CalendarLink } from "@/components/you/CalendarLink";
import { TimeZoneField } from "@/components/you/TimeZoneField";
import { myEnrolments } from "@/lib/catalogue";
import { createUserClient } from "@/lib/supabase/server";
import { WEEKDAYS } from "@/lib/today/reminders";
import { effectiveFrequency, isReviewFrequency, REVIEW_FREQUENCIES, type ReviewFrequency } from "@/lib/today/review";
import { pickupAllowed } from "@/lib/today/run-reminders";
import type { SettingsRow } from "@/lib/today/server";

/**
 * Reminders, the daily review, the welcome-back note and the calendar link,
 * one block per programme (4.3, 4.7, 4.8, 4.9). Everything here is the
 * reader's choice. Emails are off until they choose days, and on a wellbeing
 * title (tier standard or higher) the review and the welcome-back note are
 * off as well until they turn them on. The words never mention anything
 * missed.
 */

const FREQUENCY_WORDS: Record<ReviewFrequency, string> = {
  off: "Off",
  rarely: "Rarely",
  sometimes: "Sometimes",
  often: "Often",
};

export async function TodaySettings({ userId, notice }: { userId: string; notice?: string }) {
  let programmes: Awaited<ReturnType<typeof myEnrolments>> = [];
  try {
    programmes = await myEnrolments(userId);
  } catch {
    return null;
  }
  if (programmes.length === 0) return null;

  const supabase = await createUserClient();
  const ids = programmes.map((p) => p.enrolmentId);
  const { data: rows } = await supabase
    .from("today_settings")
    .select("enrolment_id, reminders_on, reminder_days, reminder_time, timezone, reminders_stopped_at, review_frequency, pickup_on, calendar_token_hash")
    .in("enrolment_id", ids);
  const settingsOf = new Map(((rows ?? []) as SettingsRow[]).map((r) => [r.enrolment_id, r]));
  const { data: marks } = await supabase.from("review_marks").select("enrolment_id").in("enrolment_id", ids).eq("state", "set_aside");
  const setAside = new Map<string, number>();
  for (const m of (marks ?? []) as { enrolment_id: string }[]) setAside.set(m.enrolment_id, (setAside.get(m.enrolment_id) ?? 0) + 1);

  const message =
    notice === "saved"
      ? "Saved."
      : notice === "needs-day"
        ? "Saved. Reminders stay off until you choose at least one day."
        : notice === "brought-back"
          ? "Your set-aside answers can come back again."
          : notice === "failed" || notice === "invalid"
            ? "That did not save. Please check the time and try again."
            : null;

  return (
    <section className="you-section" id="today-settings" aria-labelledby="you-today">
      <h2 id="you-today">Reminders and Today</h2>
      <p className="muted">
        You choose what Today does for each programme. Emails come only on the days and at the time you pick. They name the unit, never the title of your workbook,
        and they never say you missed anything.
      </p>
      {message ? (
        <p className="you-notice" role="status">
          {message}
        </p>
      ) : null}

      {programmes.map((p) => {
        const s = settingsOf.get(p.enrolmentId);
        const wellbeing = p.safetyTier !== "none";
        const days = new Set(s?.reminder_days ?? []);
        const freq = effectiveFrequency(isReviewFrequency(s?.review_frequency) ? (s?.review_frequency as ReviewFrequency) : null, p.safetyTier);
        const pickup = pickupAllowed(s?.pickup_on ?? null, p.safetyTier);
        const formId = `today-${p.enrolmentId}`;
        return (
          <form key={p.enrolmentId} action={saveTodaySettings} className="card you-today-card" aria-labelledby={`${formId}-h`}>
            <input type="hidden" name="enrolment" value={p.enrolmentId} />
            <h3 id={`${formId}-h`}>{p.shortTitle ?? p.title}</h3>
            {wellbeing ? <p className="small muted">Everything below is off unless you turn it on.</p> : null}

            <fieldset>
              <legend>Email reminders</legend>
              <div className="check">
                <input type="checkbox" id={`${formId}-rem`} name="reminders" defaultChecked={s?.reminders_on === true} />
                <label htmlFor={`${formId}-rem`}>Remind me by email on these days</label>
              </div>
              <div className="you-days" role="group" aria-label="Days">
                {WEEKDAYS.map((name, i) => (
                  <div className="check" key={name}>
                    <input type="checkbox" id={`${formId}-d${i + 1}`} name="day" value={i + 1} defaultChecked={days.has(i + 1)} />
                    <label htmlFor={`${formId}-d${i + 1}`}>{name}</label>
                  </div>
                ))}
              </div>
              <label htmlFor={`${formId}-time`}>At about this time</label>
              <input type="time" id={`${formId}-time`} name="time" defaultValue={(s?.reminder_time ?? "09:00").slice(0, 5)} required />
              <TimeZoneField id={`${formId}-tz`} defaultValue={s?.timezone ?? "Europe/London"} saved={Boolean(s)} />
              <p className="small muted">
                If you do not open the reminders, they stop by themselves after a few. We send one email to say so, and you can turn them back on here.
                {s?.reminders_stopped_at ? " They stopped earlier. Choose your days and tick the box to start them again." : ""}
              </p>
            </fieldset>

            <fieldset>
              <legend>Your own words on Today</legend>
              <label htmlFor={`${formId}-rev`}>Show me an earlier answer of mine</label>
              <select id={`${formId}-rev`} name="review" defaultValue={freq}>
                {REVIEW_FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {FREQUENCY_WORDS[f]}
                  </option>
                ))}
              </select>
              <p className="small muted">One answer at a time, with the question it answered. You can keep it or set it aside. Nothing is ever deleted.</p>
            </fieldset>

            <div className="check">
              <input type="checkbox" id={`${formId}-pick`} name="pickup" defaultChecked={pickup} />
              <label htmlFor={`${formId}-pick`}>After a long break, welcome me back on Today and by email if reminders are on</label>
            </div>

            <button type="submit" className="btn">
              Save
            </button>

            <CalendarLink enrolmentId={p.enrolmentId} hasLink={Boolean(s?.calendar_token_hash)} hasDays={days.size > 0} />
          </form>
        );
      })}

      {programmes.some((p) => (setAside.get(p.enrolmentId) ?? 0) > 0) ? (
        <div className="card">
          <h3>Answers you set aside</h3>
          {programmes
            .filter((p) => (setAside.get(p.enrolmentId) ?? 0) > 0)
            .map((p) => (
              <form key={p.enrolmentId} action={bringBackSetAside} className="you-actions-row">
                <input type="hidden" name="enrolment" value={p.enrolmentId} />
                <span>
                  {p.shortTitle ?? p.title}: {setAside.get(p.enrolmentId)} set aside.
                </span>{" "}
                <button type="submit" className="btn secondary">
                  Bring them back
                </button>
              </form>
            ))}
        </div>
      ) : null}
    </section>
  );
}
