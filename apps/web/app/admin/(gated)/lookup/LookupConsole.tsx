"use client";

import { useActionState } from "react";
import { DOC_LABELS, LOOKUP_REASON_MAX, PLAN_LABELS, accountStatusLine, type LookupResult } from "@/lib/account-lookup";
import { lookupAccount, type LookupState } from "./actions";

const INITIAL: LookupState = { status: "idle", attempt: 0 };

const when = (s: string | null | undefined) =>
  s ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }).format(new Date(s)) : "None";

const money = (minor: number, currency: string) => {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
};

/** The lookup form and its result. No client storage; the result lives in memory until the page is left. */
export function LookupConsole() {
  const [state, action, pending] = useActionState(lookupAccount, INITIAL);
  const email = state.status === "idle" ? "" : state.email;
  const reason = state.status === "idle" ? "" : state.reason;
  const field = state.status === "error" ? state.field : undefined;

  return (
    <>
      <form action={action} className="admin-form lookup-form" key={state.attempt} autoComplete="off">
        {state.status === "error" ? (
          <p className="admin-notice admin-notice-error" role="alert">
            {state.message}
          </p>
        ) : null}
        <label htmlFor="lk-email">Reader&rsquo;s email address</label>
        <input id="lk-email" name="email" type="email" maxLength={254} defaultValue={email} required aria-invalid={field === "email" ? true : undefined} />
        <label htmlFor="lk-reason">Reason for this lookup</label>
        <p id="lk-reason-hint" className="muted small">
          For example the support ticket number. Kept in the audit log. {LOOKUP_REASON_MAX} characters at most.
        </p>
        <input
          id="lk-reason"
          name="reason"
          type="text"
          minLength={5}
          maxLength={LOOKUP_REASON_MAX}
          defaultValue={reason}
          required
          aria-describedby="lk-reason-hint"
          aria-invalid={field === "reason" ? true : undefined}
        />
        <button type="submit" className="btn" disabled={pending}>
          {pending ? "Looking up" : "Look up"}
        </button>
      </form>

      {state.status === "done" ? <LookupView result={state.result} /> : null}
    </>
  );
}

function LookupView({ result: r }: { result: LookupResult }) {
  if (!r.found || !r.user) {
    return (
      <section className="card lookup-result" aria-live="polite">
        <h2>No account found</h2>
        <p className="muted">No account uses that email address. A deleted account cannot be found by email, by design.</p>
      </section>
    );
  }
  return (
    <section className="lookup-result" aria-live="polite" aria-labelledby="lk-h">
      <div className="card">
        <h2 id="lk-h">{r.user.email}</h2>
        <p>
          <strong>{accountStatusLine(r)}</strong>
          {r.user.staff ? <span className="badge admin-role"> Staff account</span> : null}
        </p>
        <dl className="lookup-dl">
          <dt>Account id</dt>
          <dd>
            <code>{r.user.id}</code>
          </dd>
          <dt>Created</dt>
          <dd>{when(r.user.createdAt)}</dd>
          <dt>Last sign-in</dt>
          <dd>{when(r.user.lastSignInAt)}</dd>
          <dt>Email confirmed</dt>
          <dd>{when(r.user.emailConfirmedAt)}</dd>
          <dt>Country</dt>
          <dd>{r.profile?.country ?? "Not given"}</dd>
          <dt>Adult confirmed</dt>
          <dd>{when(r.profile?.adultConfirmedAt)}</dd>
        </dl>
      </div>

      <h3>Deletion</h3>
      {r.deletion ? (
        <p>
          {r.deletion.state === "pending"
            ? `Requested ${when(r.deletion.requestedAt)}. Completes after ${when(r.deletion.cancelBefore)} unless the reader cancels.`
            : r.deletion.state === "cancelled"
              ? `Requested ${when(r.deletion.requestedAt)}, cancelled ${when(r.deletion.cancelledAt)}.`
              : `Completed ${when(r.deletion.completedAt)}.`}
        </p>
      ) : (
        <p className="muted">No deletion request.</p>
      )}

      <h3>Membership</h3>
      {r.subscriptions.length === 0 ? (
        <p className="muted">No membership.</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption className="admin-vh">Memberships</caption>
            <thead>
              <tr>
                <th scope="col">Plan</th>
                <th scope="col">Status</th>
                <th scope="col">Period ends</th>
                <th scope="col">Ends at period end</th>
                <th scope="col">Stripe</th>
              </tr>
            </thead>
            <tbody>
              {r.subscriptions.map((s, i) => (
                <tr key={s.subscriptionId ?? i}>
                  <td>{(s.plan && PLAN_LABELS[s.plan]) ?? s.plan ?? "Unknown"}</td>
                  <td>
                    {s.status}
                    {s.pastDueSince ? ` since ${when(s.pastDueSince)}` : ""}
                  </td>
                  <td>{when(s.currentPeriodEnd)}</td>
                  <td>{s.cancelAtPeriodEnd ? "Yes" : "No"}</td>
                  <td>
                    <code>{s.subscriptionId}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3>Purchases</h3>
      {r.purchases.length === 0 ? (
        <p className="muted">No purchases.</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption className="admin-vh">Purchases</caption>
            <thead>
              <tr>
                <th scope="col">Started</th>
                <th scope="col">What</th>
                <th scope="col">Amount</th>
                <th scope="col">Status</th>
                <th scope="col">Stripe payment</th>
              </tr>
            </thead>
            <tbody>
              {r.purchases.map((p) => (
                <tr key={p.id}>
                  <td>{when(p.createdAt)}</td>
                  <td>{p.kind === "membership" ? "Membership" : <code>{p.workbookCode ?? "Workbook"}</code>}</td>
                  <td>
                    {money(p.amountMinor, p.currency)}
                    {p.taxMinor ? <span className="muted small"> incl. {money(p.taxMinor, p.currency)} tax</span> : null}
                  </td>
                  <td>
                    {p.status}
                    {p.refundedAt ? ` ${when(p.refundedAt)}` : p.paidAt ? ` ${when(p.paidAt)}` : ""}
                  </td>
                  <td>{p.paymentIntent ? <code>{p.paymentIntent}</code> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3>Access</h3>
      {r.entitlements.length === 0 ? (
        <p className="muted">No access rows.</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption className="admin-vh">Access</caption>
            <thead>
              <tr>
                <th scope="col">Workbook</th>
                <th scope="col">From</th>
                <th scope="col">Status</th>
                <th scope="col">Started</th>
                <th scope="col">Ends</th>
              </tr>
            </thead>
            <tbody>
              {r.entitlements.map((e, i) => (
                <tr key={i}>
                  <td>{e.workbookCode ? <code>{e.workbookCode}</code> : "Whole library"}</td>
                  <td>{e.source}</td>
                  <td>{e.status}</td>
                  <td>{when(e.startsAt)}</td>
                  <td>{e.endsAt ? when(e.endsAt) : "No end"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3>Consents and terms</h3>
      <ul className="lookup-list">
        <li>
          Health data: {r.consents?.healthAt ? `given ${when(r.consents.healthAt)} (${r.consents.healthVersion})` : "not given or withdrawn"}
        </li>
        <li>Faith: {r.consents?.faithAt ? `given ${when(r.consents.faithAt)} (${r.consents.faithVersion})` : "not given or withdrawn"}</li>
        {r.terms.map((t) => (
          <li key={t.doc}>
            {DOC_LABELS[t.doc] ?? t.doc}: version {t.version}, accepted {when(t.acceptedAt)} at {t.context}
            {t.wasDraft ? " (draft wording)" : ""}
          </li>
        ))}
        {r.terms.length === 0 ? <li>No terms accepted yet.</li> : null}
      </ul>

      <h3>Recent lookups of this account</h3>
      <ul className="lookup-list">
        {r.lookups.map((l, i) => (
          <li key={i}>
            {when(l.at)}, {l.actorRole || "staff"}: {l.reason}
          </li>
        ))}
      </ul>
      <p className="admin-note">Answers, check-ins and progress are not available to staff. Refunds and access changes are made from their own pages.</p>
    </section>
  );
}
