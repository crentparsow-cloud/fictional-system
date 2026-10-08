"use client";

import { useActionState } from "react";
import { createJoinLink, previewInviteCsv, sendInviteCsv, type CsvState, type LinkState } from "./actions";

/**
 * The bulk invite (upload, preview, send) and the join link maker for one
 * licence (F-225). Both talk to server actions; the CSV never leaves the
 * server except as this preview, and a new link's address is shown once.
 */
export function CsvInvite({ orgId, licenceId }: { orgId: string; licenceId: string }) {
  const [preview, previewAction, previewing] = useActionState<CsvState, FormData>(previewInviteCsv, { status: "idle" });
  const [result, sendAction, sending] = useActionState<CsvState, FormData>(sendInviteCsv, { status: "idle" });

  if (result.status === "sent") {
    return (
      <div className="org-csv-result" role="status">
        <p>
          <strong>
            {result.sent} {result.sent === 1 ? "invitation" : "invitations"} sent.
          </strong>
        </p>
        {result.notSent.length > 0 ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <caption>Not sent</caption>
              <thead>
                <tr>
                  <th scope="col">Email</th>
                  <th scope="col">Why</th>
                </tr>
              </thead>
              <tbody>
                {result.notSent.map((r) => (
                  <tr key={r.email}>
                    <td>{r.email}</td>
                    <td>{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    );
  }

  const fields = (
    <>
      <input type="hidden" name="org" value={orgId} />
      <input type="hidden" name="licence" value={licenceId} />
    </>
  );

  return (
    <div className="org-csv">
      <form className="admin-form" action={previewAction}>
        {fields}
        <label htmlFor={`csv-${licenceId}`}>CSV file of email addresses</label>
        <input id={`csv-${licenceId}`} name="file" type="file" accept=".csv,text/csv,text/plain" required />
        <p className="muted small">One address per row. Up to 200 rows. Other columns, such as names, are ignored and not kept.</p>
        <button type="submit" className="btn secondary" disabled={previewing}>
          {previewing ? "Reading" : "Check the file"}
        </button>
      </form>
      {preview.status === "error" || result.status === "error" ? (
        <p className="admin-notice admin-notice-error" role="alert">
          {preview.status === "error" ? preview.message : result.status === "error" ? result.message : ""}
        </p>
      ) : null}
      {preview.status === "preview" ? (
        <div className="org-csv-preview" role="status">
          <p>
            {preview.valid.length} {preview.valid.length === 1 ? "address" : "addresses"} ready.
            {preview.duplicates > 0 ? ` ${preview.duplicates} repeated, counted once.` : ""}
            {preview.invalid.length > 0 ? ` ${preview.invalid.length} could not be read.` : ""}
            {preview.truncated ? " Only the first 200 rows were read." : ""}
          </p>
          <p className="muted small">
            {preview.placesLeft} {preview.placesLeft === 1 ? "place" : "places"} left on this licence. {preview.sendsLeft} more invitations can go today.
            {preview.valid.length > Math.min(preview.placesLeft, preview.sendsLeft) ? " The rest will be listed as not sent." : ""}
          </p>
          {preview.invalid.length > 0 ? (
            <ul className="small">
              {preview.invalid.slice(0, 20).map((r) => (
                <li key={r.line}>
                  Row {r.line}: {r.value || "empty"}
                </li>
              ))}
            </ul>
          ) : null}
          {preview.valid.length > 0 ? (
            <form className="admin-form" action={sendAction}>
              {fields}
              <textarea name="emails" readOnly hidden value={preview.valid.join("\n")} />
              <details>
                <summary>See the addresses</summary>
                <ul className="small">
                  {preview.valid.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </details>
              <p className="muted small">Each email names your organisation and never a workbook.</p>
              <button type="submit" className="btn" disabled={sending}>
                {sending ? "Sending" : `Send ${preview.valid.length} ${preview.valid.length === 1 ? "invitation" : "invitations"}`}
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function JoinLinkMaker({ orgId, licenceId, seats }: { orgId: string; licenceId: string; seats: number }) {
  const [state, action, pending] = useActionState<LinkState, FormData>(createJoinLink, { status: "idle" });
  return (
    <div className="org-link-maker">
      {state.status === "made" ? (
        <div className="admin-notice admin-notice-ok" role="status">
          <p>Link made. Copy it now: it is shown only once.</p>
          <label htmlFor={`link-out-${licenceId}`}>Join link</label>
          <input id={`link-out-${licenceId}`} type="text" readOnly value={state.url} className="org-link-out" />
        </div>
      ) : null}
      {state.status === "error" ? (
        <p className="admin-notice admin-notice-error" role="alert">
          {state.message}
        </p>
      ) : null}
      <form className="admin-form" action={action}>
        <input type="hidden" name="org" value={orgId} />
        <input type="hidden" name="licence" value={licenceId} />
        <label htmlFor={`days-${licenceId}`}>Works for (days)</label>
        <input id={`days-${licenceId}`} name="days" type="number" inputMode="numeric" min={1} max={90} defaultValue={14} required />
        <label htmlFor={`cap-${licenceId}`}>How many people can use it</label>
        <input id={`cap-${licenceId}`} name="max_uses" type="number" inputMode="numeric" min={1} max={seats} defaultValue={Math.min(seats, 10)} required />
        <label htmlFor={`domain-${licenceId}`}>Only for addresses at this domain (optional)</label>
        <input id={`domain-${licenceId}`} name="domain" type="text" inputMode="url" placeholder="example.org" maxLength={253} autoComplete="off" />
        <p className="muted small">
          With a domain, only people signed in with an address there can join, and your roster shows that address. Without one, anyone with the link can
          join, and your roster shows no address. Share it only where your people are.
        </p>
        <button type="submit" className="btn secondary" disabled={pending}>
          Make a link
        </button>
      </form>
    </div>
  );
}
