import { longDate } from "@/lib/account";
import { FEATURE_NAME, NEVER_SHARED, parseShareLevel, partnerView, SHARE_LEVELS, type PartnerRow, type ShareLevel } from "@/lib/partner";

/**
 * The Check-in partner section of the You page (F-030). Every form posts to
 * /api/partner, which sends the reader back here with a notice.
 *
 * What a partner gets is set by the share level, shown here in full before
 * anything is sent. Progress on wellbeing workbooks is shared only when the
 * reader ticks that box, and the box starts unticked.
 */

export interface PartnerReply {
  body: string;
  created_at: string;
}

interface Props {
  row: PartnerRow | null;
  replies: PartnerReply[];
  notice: string | null;
  now: Date;
}

const LEVELS: ShareLevel[] = [1, 2, 3];

export function CheckInPartner({ row, replies, notice, now }: Props) {
  const view = partnerView(row, now);

  return (
    <section className="you-section partner-section" id="check-in-partner" aria-labelledby="you-partner">
      <h2 id="you-partner">{FEATURE_NAME}</h2>
      <p>
        Choose someone you trust to get a short note when you reach a new stage, so they can cheer you on. They don&apos;t need an account. {NEVER_SHARED}
      </p>
      {notice ? (
        <p className="you-notice" role="status">
          {notice}
        </p>
      ) : null}

      {view.kind === "invited" ? (
        <div className="card partner-card">
          <p>
            <b>Invitation sent to {view.row.partner_name}</b> <span className="you-wrap muted">({view.row.partner_email})</span> on {longDate(view.row.invited_at)}.
          </p>
          <p className="small muted">It lasts until {longDate(view.row.invite_expires_at)}. If they say no, or don&apos;t answer, nothing is shared.</p>
          <SettingsForm row={view.row} />
          <StopForm name={view.row.partner_name} invited />
        </div>
      ) : null}

      {view.kind === "active" ? (
        <div className="card partner-card">
          <p>
            <b>{view.row.partner_name} is your check-in partner</b>
            {view.row.responded_at ? ` since ${longDate(view.row.responded_at)}` : ""}.
          </p>
          <p className="small muted">They get: {SHARE_LEVELS[parseShareLevel(view.row.share_level) ?? 1].detail}</p>
          <SettingsForm row={view.row} />
          <StopForm name={view.row.partner_name} />
        </div>
      ) : null}

      {view.kind === "ended" ? (
        <div className="card partner-card">
          <p>{view.line}</p>
          <form method="post" action="/api/partner">
            <input type="hidden" name="op" value="forget" />
            <button type="submit" className="btn secondary">
              Remove their details
            </button>
          </form>
        </div>
      ) : null}

      {replies.length && view.kind !== "none" ? (
        <div className="card partner-replies">
          <h3>Kind words from {row?.partner_name}</h3>
          <ul>
            {replies.map((r) => (
              <li key={r.created_at}>
                <p>{r.body}</p>
                <p className="small muted">{longDate(r.created_at)}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {view.kind === "none" || view.kind === "ended" ? <InviteForm /> : null}
    </section>
  );
}

function LevelChoice({ selected }: { selected: ShareLevel }) {
  return (
    <fieldset className="partner-levels">
      <legend>What they get</legend>
      {LEVELS.map((level) => (
        <div className="partner-level" key={level}>
          <input type="radio" id={`share-${level}`} name="share_level" value={level} defaultChecked={level === selected} required />
          <label htmlFor={`share-${level}`}>
            <b>{SHARE_LEVELS[level].label}</b>
            <span className="small muted">{SHARE_LEVELS[level].detail}</span>
          </label>
        </div>
      ))}
    </fieldset>
  );
}

function WellbeingChoice({ checked, id }: { checked: boolean; id: string }) {
  return (
    <div>
      <div className="check">
        <input type="checkbox" id={id} name="include_wellbeing" value="yes" defaultChecked={checked} />
        <label htmlFor={id}>Include my wellbeing workbooks</label>
      </div>
      <p className="small muted">Off unless you tick it. Even then, they see only the stage number, never the workbook or anything you wrote.</p>
    </div>
  );
}

function InviteForm() {
  return (
    <form method="post" action="/api/partner" className="card partner-form">
      <input type="hidden" name="op" value="invite" />
      <h3>Invite a check-in partner</h3>
      <label className="q" htmlFor="partner-reader-name">
        Your first name, as they know you
      </label>
      <input type="text" id="partner-reader-name" name="reader_name" maxLength={30} autoComplete="given-name" required />
      <label className="q" htmlFor="partner-name">
        Their first name
      </label>
      <input type="text" id="partner-name" name="partner_name" maxLength={30} autoComplete="off" required />
      <label className="q" htmlFor="partner-email">
        Their email address
      </label>
      <input type="email" id="partner-email" name="partner_email" maxLength={254} autoComplete="off" required />
      <LevelChoice selected={1} />
      <WellbeingChoice checked={false} id="partner-wellbeing-new" />
      <button type="submit" className="btn">
        Send invitation
      </button>
      <p className="small muted">They&apos;ll get one email asking if they&apos;d like updates. You can send three invitations a month. If someone says no, we won&apos;t ask them again.</p>
    </form>
  );
}

function SettingsForm({ row }: { row: PartnerRow }) {
  const level = parseShareLevel(row.share_level) ?? 1;
  return (
    <form method="post" action="/api/partner" className="partner-form">
      <input type="hidden" name="op" value="settings" />
      <LevelChoice selected={level} />
      <WellbeingChoice checked={row.include_wellbeing} id="partner-wellbeing" />
      <label className="q" htmlFor="partner-note">
        A short note for them (optional)
      </label>
      <textarea id="partner-note" name="note" rows={3} maxLength={200} defaultValue={row.note ?? ""} />
      <p className="small muted">
        Sent only with &quot;{SHARE_LEVELS[3].label}&quot;, once, with the next update. Up to 200 characters, with no links, email addresses or phone numbers.
        {row.note && row.note_sent_at ? " Your current note has been sent." : ""}
      </p>
      <button type="submit" className="btn secondary">
        Save
      </button>
    </form>
  );
}

function StopForm({ name, invited }: { name: string; invited?: boolean }) {
  return (
    <details className="partner-stop">
      <summary className="btn secondary">{invited ? "Cancel the invitation" : "Stop sharing"}</summary>
      <div className="partner-confirm">
        <p>
          {invited
            ? `Cancel the invitation to ${name}? The link in their email will stop working.`
            : `Stop sharing with ${name}? They'll get one last email to say updates have stopped. Their links stop working straight away.`}
        </p>
        <form method="post" action="/api/partner">
          <input type="hidden" name="op" value="stop" />
          <button type="submit" className="btn danger">
            {invited ? "Cancel the invitation" : "Stop sharing"}
          </button>
        </form>
      </div>
    </details>
  );
}
