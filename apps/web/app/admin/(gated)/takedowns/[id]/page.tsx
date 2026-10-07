import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { dashAbilities } from "@/lib/account-lookup";
import { getStaffSession } from "@/lib/staff";
import {
  NOTICE_KIND_LABELS,
  NOTICE_STATUS_LABELS,
  REASON_MAX,
  STATEMENT_MAX,
  basisLabel,
  earliestReinstateDate,
  formatDay,
  isUuid,
  statementOfReasons,
} from "@/lib/takedown";
import { AdminBack, labelFor } from "../../_components/Bits";
import { decideNotice, markNotice, reinstateTitle } from "../actions";
import { readQueue } from "../queue";
import { TakedownNotice } from "../TakedownNotice";

export const metadata: Metadata = { title: "Notice", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

const RELATIONSHIP: Record<string, string> = { owner: "Rights holder", agent: "Acts for the rights holder", uploader: "Author or publisher of the title" };

/**
 * One notice or counter-notice (F-123), with the decision forms. The
 * statement of reasons (DSA Article 17) is drafted from a template for the
 * member of staff to check and edit before the title is taken down.
 */
export default async function AdminTakedownPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const staff = await getStaffSession("/admin/takedowns");
  const { id } = await params;
  const sp = await searchParams;
  const can = dashAbilities(staff.roles);
  if (!isUuid(id) || !can.readTakedowns) notFound();
  const { rows } = await readQueue();
  const n = rows.find((r) => r.id === id);
  if (!n) notFound();

  const open = n.status === "received" || n.status === "reviewing";
  const counters = rows.filter((r) => r.kind === "counter_notice" && r.parent_reference === n.reference);
  const openCounter = counters.find((c) => c.status === "received" || c.status === "reviewing");
  const parent = n.kind === "counter_notice" ? rows.find((r) => r.reference === n.parent_reference) : undefined;
  const takedownId = n.takedown_id ?? parent?.takedown_id ?? null;
  const takedownActive = n.takedown_active || Boolean(parent?.takedown_active);

  const draft =
    n.kind === "notice" && open
      ? statementOfReasons({
          workbookCode: n.workbook_code ?? "[AK code]",
          workbookTitle: n.workbook_title ?? "[title]",
          basis: n.basis,
          noticeReference: n.reference,
          noticeDate: new Date(n.created_at),
          decisionDate: new Date(),
          // The flag is read again by the database when the decision is saved.
          buyersKeepAccess: true,
          facts: "",
        })
      : "";

  return (
    <div className="admin-page td-detail">
      <AdminBack href="/admin/takedowns" label="Notices and takedowns" />
      <h1>
        {labelFor(NOTICE_KIND_LABELS, n.kind)} <code>{n.reference}</code>
      </h1>
      <p>
        <span className={`badge admin-status td-status-${n.status}`}>{labelFor(NOTICE_STATUS_LABELS, n.status)}</span> Received{" "}
        {formatDay(new Date(n.created_at))}. {basisLabel(n.basis)}.
        {n.parent_reference ? (
          <>
            {" "}
            Answers notice <code>{n.parent_reference}</code>.
          </>
        ) : null}
      </p>
      <TakedownNotice code={sp.notice} />

      <section className="card" aria-labelledby="what-h">
        <h2 id="what-h">What it is about</h2>
        <p>
          Workbook:{" "}
          {n.workbook_code ? (
            <>
              <strong>{n.workbook_title}</strong> <code>{n.workbook_code}</code>, now {n.workbook_status}. {n.org_name}
              {n.repeat_infringer ? (
                <span className="badge td-repeat">
                  {" "}
                  Repeat: {n.org_takedowns_12m} active takedowns in 12 months
                </span>
              ) : null}
            </>
          ) : (
            <span className="muted">not matched to an AK code. Enter one below if you act on it.</span>
          )}
        </p>
        <dl className="lookup-dl">
          <dt>Where</dt>
          <dd className="td-text">{n.location}</dd>
          {n.work ? (
            <>
              <dt>Work claimed</dt>
              <dd className="td-text">{n.work}</dd>
            </>
          ) : null}
          <dt>{n.kind === "counter_notice" ? "Why it was a mistake" : "Explanation"}</dt>
          <dd className="td-text">{n.explanation}</dd>
        </dl>
      </section>

      <section className="card" aria-labelledby="who-h">
        <h2 id="who-h">Sender</h2>
        <dl className="lookup-dl">
          <dt>Name</dt>
          <dd>{n.name}</dd>
          <dt>Role</dt>
          <dd>
            {RELATIONSHIP[n.relationship] ?? n.relationship}
            {n.acting_for ? `, for ${n.acting_for}` : ""}
          </dd>
          <dt>Email</dt>
          <dd>{n.email}</dd>
          <dt>Phone</dt>
          <dd>{n.phone ?? "Not given"}</dd>
          <dt>Address</dt>
          <dd className="td-text">{n.address}</dd>
          <dt>Signed</dt>
          <dd>{n.signature}, with the good faith and accuracy statements ticked</dd>
        </dl>
        <p className="muted small">Reply to the sender from the support mailbox. Do not forward their details to the author unless the law requires it.</p>
      </section>

      {n.decided_at ? (
        <section className="card" aria-labelledby="dec-h">
          <h2 id="dec-h">Decision</h2>
          <p>
            {formatDay(new Date(n.decided_at))}: {n.decision_reason}
          </p>
          {n.statement_of_reasons && n.kind === "notice" ? (
            <details>
              <summary>Statement of reasons sent to the organisation</summary>
              <pre className="dash-statement">{n.statement_of_reasons}</pre>
            </details>
          ) : null}
          {n.buyers_keep_access !== null && n.kind === "notice" ? (
            <p className="muted small">{n.buyers_keep_access ? "Buyers kept access." : "Buyers lost access. Reinstating gives it back."}</p>
          ) : null}
        </section>
      ) : null}

      {open ? (
        <section className="card td-actions" aria-labelledby="act-h">
          <h2 id="act-h">Act on it</h2>
          {n.status === "received" ? (
            <form action={markNotice} className="admin-form">
              <input type="hidden" name="id" value={n.id} />
              <input type="hidden" name="status" value="reviewing" />
              <button type="submit" className="btn secondary">
                Mark as reviewing
              </button>
            </form>
          ) : null}

          {n.kind === "notice" && can.decideTakedowns ? (
            <>
              <form action={decideNotice} className="admin-form td-form">
                <h3>Take the title down</h3>
                <p className="muted small">
                  It goes off sale and out of the library and the membership at once. What buyers keep follows the takedown_buyers_keep_access flag
                  (question D9). Readers always keep their own answers.
                </p>
                <input type="hidden" name="id" value={n.id} />
                <input type="hidden" name="decision" value="action" />
                <label htmlFor="td-code">AK code, if different from the one matched</label>
                <input id="td-code" name="workbook_code" type="text" maxLength={8} defaultValue="" placeholder={n.workbook_code ?? "AK-XXXXX"} />
                <label htmlFor="td-reason">Reason, for the audit log</label>
                <input id="td-reason" name="reason" type="text" maxLength={REASON_MAX} required />
                <label htmlFor="td-statement">Statement of reasons</label>
                <p id="td-statement-hint" className="muted small">
                  Sent to the organisation and kept with the takedown. Fill in the facts you checked. Draft wording for the lawyer to review.
                </p>
                <textarea id="td-statement" name="statement" rows={14} maxLength={STATEMENT_MAX} defaultValue={draft} required aria-describedby="td-statement-hint" />
                <button type="submit" className="btn help">
                  Take down
                </button>
              </form>

              <form action={decideNotice} className="admin-form td-form">
                <h3>Reject the notice</h3>
                <input type="hidden" name="id" value={n.id} />
                <input type="hidden" name="decision" value="reject" />
                <label htmlFor="td-reject">Reason, for the audit log and the reply to the sender</label>
                <input id="td-reject" name="reason" type="text" maxLength={REASON_MAX} required />
                <button type="submit" className="btn secondary">
                  Reject
                </button>
              </form>
            </>
          ) : null}

          {n.kind === "counter_notice" && takedownId && takedownActive && can.decideTakedowns ? (
            <form action={reinstateTitle} className="admin-form td-form">
              <h3>Reinstate the title</h3>
              <p className="muted small">
                Under US law the title goes back between 10 and 14 business days after the counter-notice arrived, unless the sender of the notice tells us
                they have gone to court. Earliest: {formatDay(earliestReinstateDate(new Date(n.created_at)))} (bank holidays not counted). Send the
                counter-notice to the sender of the original notice first.
              </p>
              <input type="hidden" name="id" value={n.id} />
              <input type="hidden" name="takedown" value={takedownId} />
              <input type="hidden" name="counter" value={n.id} />
              <label htmlFor="td-rein">Reason</label>
              <input id="td-rein" name="reason" type="text" maxLength={REASON_MAX} required />
              <button type="submit" className="btn">
                Reinstate
              </button>
            </form>
          ) : null}

          <form action={markNotice} className="admin-form td-form">
            <h3>The sender withdrew it</h3>
            <input type="hidden" name="id" value={n.id} />
            <input type="hidden" name="status" value="withdrawn" />
            <label htmlFor="td-wd">Note</label>
            <input id="td-wd" name="reason" type="text" maxLength={REASON_MAX} />
            <button type="submit" className="btn secondary">
              Mark withdrawn
            </button>
          </form>
        </section>
      ) : null}

      {n.kind === "notice" && takedownId && takedownActive && !openCounter && can.decideTakedowns ? (
        <section className="card td-actions" aria-labelledby="rein-h">
          <h2 id="rein-h">Reinstate without a counter-notice</h2>
          <p className="muted small">For a mistake on our side, or when the sender withdraws after the takedown.</p>
          <form action={reinstateTitle} className="admin-form">
            <input type="hidden" name="id" value={n.id} />
            <input type="hidden" name="takedown" value={takedownId} />
            <label htmlFor="td-rein2">Reason</label>
            <input id="td-rein2" name="reason" type="text" maxLength={REASON_MAX} required />
            <button type="submit" className="btn secondary">
              Reinstate
            </button>
          </form>
        </section>
      ) : null}

      {counters.length > 0 ? (
        <section aria-labelledby="cn-h">
          <h2 id="cn-h">Counter-notices</h2>
          <ul>
            {counters.map((c) => (
              <li key={c.id}>
                <Link href={`/admin/takedowns/${c.id}`}>
                  <code>{c.reference}</code>
                </Link>{" "}
                {labelFor(NOTICE_STATUS_LABELS, c.status)}, received {formatDay(new Date(c.created_at))}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
