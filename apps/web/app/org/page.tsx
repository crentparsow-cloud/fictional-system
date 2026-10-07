import type { Metadata } from "next";
import Link from "next/link";
import { OrgNoticeLine } from "@/components/org/OrgShell";
import { brand } from "@/lib/brand";
import {
  CUSTOMER_KIND_LABELS,
  formatOrgDate,
  isPastIso,
  labelOf,
  LICENCE_KIND_LABELS,
  LICENCE_STATUS_LABELS,
  orgPrivacyLine,
  startedText,
  TITLE_SCOPE_LABELS,
} from "@/lib/org-pilot";
import { requireOrgConsole, withOrgParam } from "@/lib/org-pilot-server";
import { createUserClient } from "@/lib/supabase/server";
import { inviteToSeat, releaseSeat, resendSeatInvite, revokeSeatInvite } from "./actions";

export const metadata: Metadata = { title: "Seats", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;

interface Summary {
  licence_id: string;
  kind: string;
  title_scope: string;
  title_count: number;
  status: string;
  starts_at: string;
  ends_at: string;
  seats_purchased: number;
  seats_claimed: number;
  invitations_open: number;
  people_started: number | null;
  started_shown: string;
  counted_until: string;
  threshold: number;
}

interface Invite {
  id: string;
  licence_id: string;
  email: string | null;
  created_at: string;
  expires_at: string;
  send_count: number;
}

interface Seat {
  seat_id: string;
  roster_email: string | null;
  claimed_at: string;
}

/**
 * The organisation console (F-204). Seats bought, seats taken, open
 * invitations, and how many people have started, as a count that the
 * database suppresses under the owner threshold and freezes at the start of
 * each week. The roster shows the address the organisation invited and when
 * the place was taken. Nothing here shows what anyone did or wrote, and
 * nothing in 0024 would give it to this page if it asked.
 */
export default async function OrgConsolePage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const ctx = await requireOrgConsole("/org", sp.org);
  const canManage = ctx.org.role === "owner";
  const canRead = ["owner", "finance", "viewer"].includes(ctx.org.role);
  const supabase = await createUserClient();

  const summary = canRead ? await supabase.rpc("org_seat_summary", { p_org: ctx.org.id }) : { data: [], error: null };
  if (summary.error) console.error("org_summary_failed", summary.error.code ?? "");
  const licences = (summary.data ?? []) as Summary[];

  const invites = canManage
    ? (((
        await supabase
          .from("org_seat_invitations")
          .select("id, licence_id, email, created_at, expires_at, send_count")
          .eq("org_id", ctx.org.id)
          .is("accepted_at", null)
          .is("declined_at", null)
          .is("revoked_at", null)
          .order("created_at", { ascending: false })
      ).data ?? []) as Invite[])
    : [];

  const rosters = new Map<string, Seat[]>();
  if (canRead) {
    await Promise.all(
      licences
        .filter((l) => l.status !== "ended")
        .map(async (l) => {
          const r = await supabase.rpc("org_seat_roster", { p_licence: l.licence_id });
          rosters.set(l.licence_id, (r.data ?? []) as Seat[]);
        }),
    );
  }

  const hidden = (name: string, value: string) => <input type="hidden" name={name} value={value} />;

  return (
    <div className="admin-page studio-page org-console">
      {ctx.multi ? (
        <nav className="studio-org" aria-label="Your organisations">
          <span className="muted">Organisation:</span>
          <ul>
            {ctx.orgs.map((o) => (
              <li key={o.id}>
                <Link href={withOrgParam("/org", o.id, true)} aria-current={o.id === ctx.org.id ? "page" : undefined} className={o.id === ctx.org.id ? "is-active" : undefined}>
                  {o.displayName}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : (
        <p className="muted studio-org">
          {ctx.org.displayName}, {labelOf(CUSTOMER_KIND_LABELS, ctx.org.kind).toLowerCase()}
        </p>
      )}
      <h1>Seats</h1>
      <OrgNoticeLine code={sp.notice} />

      <section className="card info-privacy" aria-labelledby="org-privacy-h">
        <h2 id="org-privacy-h">What you can and cannot see</h2>
        <p>{orgPrivacyLine(brand.name)}</p>
        <p className="muted">
          Taking part is each person&apos;s choice. Please do not ask anyone to show you their answers, and do not make a wellbeing workbook a
          condition of work or membership. Everyone taking part must be 18 or over.
        </p>
      </section>

      {!canRead ? (
        <p className="admin-note">Your role in {ctx.org.displayName} does not include seats. Ask the owner if you need to see them.</p>
      ) : licences.length === 0 ? (
        <div className="card admin-empty">
          <h2>No licence yet</h2>
          <p className="muted">When your licence is set up, it appears here and you can start inviting people.</p>
        </div>
      ) : (
        licences.map((l) => {
          const open = l.status === "active" && !isPastIso(l.ends_at);
          const places = l.seats_purchased - l.seats_claimed - l.invitations_open;
          const seats = rosters.get(l.licence_id) ?? [];
          const mine = invites.filter((i) => i.licence_id === l.licence_id);
          return (
            <section key={l.licence_id} className="card org-licence" aria-labelledby={`lic-${l.licence_id}`}>
              <h2 id={`lic-${l.licence_id}`}>
                {labelOf(LICENCE_KIND_LABELS, l.kind)} licence{" "}
                <span className={`badge admin-status admin-status-${l.status}`}>{labelOf(LICENCE_STATUS_LABELS, l.status)}</span>
              </h2>
              <p className="muted">
                {formatOrgDate(l.starts_at)} to {formatOrgDate(l.ends_at)}.{" "}
                {l.title_scope === "list" ? `${l.title_count} chosen ${l.title_count === 1 ? "title" : "titles"}.` : `${labelOf(TITLE_SCOPE_LABELS, l.title_scope)}.`}
              </p>
              <dl className="admin-dl">
                <div>
                  <dt>Seats bought</dt>
                  <dd>{l.seats_purchased}</dd>
                </div>
                <div>
                  <dt>Seats taken</dt>
                  <dd>{l.seats_claimed}</dd>
                </div>
                <div>
                  <dt>Invitations waiting</dt>
                  <dd>{l.invitations_open}</dd>
                </div>
                <div>
                  <dt>People started</dt>
                  <dd>{startedText(l.started_shown, l.people_started, l.threshold)}</dd>
                </div>
              </dl>
              <p className="muted small">
                People started counts those with a seat who have opened a workbook, up to the start of {formatOrgDate(l.counted_until)}. It updates once a week, and
                small numbers are not shown, so no one can be picked out.
              </p>

              {canManage && open ? (
                <form className="admin-form" action={inviteToSeat}>
                  {hidden("org", ctx.org.id)}
                  {hidden("licence", l.licence_id)}
                  <label htmlFor={`email-${l.licence_id}`}>Invite someone by email</label>
                  <input id={`email-${l.licence_id}`} name="email" type="email" autoComplete="off" maxLength={254} required disabled={places <= 0} />
                  <p className="muted small">
                    {places > 0 ? `${places} ${places === 1 ? "place" : "places"} left.` : "No places left. Cancel an invitation or release a seat to free one."} The
                    email names your organisation and never a workbook.
                  </p>
                  <button type="submit" className="btn" disabled={places <= 0}>
                    Send invitation
                  </button>
                </form>
              ) : null}

              {canManage && mine.length > 0 ? (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <caption>Invitations waiting</caption>
                    <thead>
                      <tr>
                        <th scope="col">Email</th>
                        <th scope="col">Sent</th>
                        <th scope="col">Works until</th>
                        <th scope="col">Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mine.map((i) => {
                        const expired = isPastIso(i.expires_at);
                        return (
                          <tr key={i.id}>
                            <td>{i.email}</td>
                            <td>{formatOrgDate(i.created_at)}</td>
                            <td>{expired ? <span className="muted">Expired</span> : formatOrgDate(i.expires_at)}</td>
                            <td className="studio-actions">
                              {i.send_count < 5 && open ? (
                                <form action={resendSeatInvite}>
                                  {hidden("org", ctx.org.id)}
                                  {hidden("invite", i.id)}
                                  <button type="submit" className="btn secondary admin-row-btn">
                                    Send again
                                  </button>
                                </form>
                              ) : null}
                              <form action={revokeSeatInvite}>
                                {hidden("org", ctx.org.id)}
                                {hidden("invite", i.id)}
                                <button type="submit" className="btn secondary admin-row-btn">
                                  Cancel
                                </button>
                              </form>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {seats.length > 0 ? (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <caption>Seats taken</caption>
                    <thead>
                      <tr>
                        <th scope="col">Invited as</th>
                        <th scope="col">Taken</th>
                        {canManage ? <th scope="col">Change</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {seats.map((s) => (
                        <tr key={s.seat_id}>
                          <td>{s.roster_email ?? <span className="muted">Address removed</span>}</td>
                          <td>{formatOrgDate(s.claimed_at)}</td>
                          {canManage ? (
                            <td>
                              <form action={releaseSeat} className="studio-inline-confirm">
                                {hidden("org", ctx.org.id)}
                                {hidden("seat", s.seat_id)}
                                <div className="check">
                                  <input id={`confirm-${s.seat_id}`} name="confirm" type="checkbox" value="yes" required />
                                  <label htmlFor={`confirm-${s.seat_id}`}>Release this seat</label>
                                </div>
                                <button type="submit" className="btn secondary admin-row-btn">
                                  Release
                                </button>
                              </form>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {canManage ? (
                    <p className="muted small">
                      Releasing a seat frees it for someone else. The person keeps their account and everything they wrote, which stays private.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </section>
          );
        })
      )}

      <p className="admin-note">
        To add seats, change titles or end a licence, contact the {brand.name} team. Billing is by invoice and is arranged with you directly.
      </p>
    </div>
  );
}
