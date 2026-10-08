import type { Metadata } from "next";
import { billingNotice } from "@/lib/org-billing";
import { formatOrgDate, isPastIso, labelOf, LICENCE_KIND_LABELS } from "@/lib/org-pilot";
import { requireOrgConsole } from "@/lib/org-pilot-server";
import { createUserClient } from "@/lib/supabase/server";
import { revokeJoinLink } from "./actions";
import { CsvInvite, JoinLinkMaker } from "./InviteTools";

export const metadata: Metadata = { title: "Invite in bulk", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;

interface Licence {
  id: string;
  kind: string;
  seats_purchased: number;
  starts_at: string;
  ends_at: string;
}
interface Link {
  id: string;
  licence_id: string;
  email_domain: string | null;
  max_uses: number;
  uses: number;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
}

/**
 * Bulk invitations and join links (F-225), for the organisation's owner.
 * A CSV of addresses is checked, previewed and then sent through the same
 * invitation as the Seats page, with its limits. A join link has an expiry,
 * a cap and an optional email domain; taking a place with it still needs a
 * signed-in account, the 18 or over tick and a button press.
 */
export default async function OrgInvitePage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const ctx = await requireOrgConsole("/org/invite", sp.org);
  const notice = billingNotice(sp.notice);
  const isOwner = ctx.org.role === "owner";
  const supabase = await createUserClient();

  let licences: Licence[] = [];
  let links: Link[] = [];
  if (isOwner) {
    const [l, k] = await Promise.all([
      supabase
        .from("org_licences")
        .select("id, kind, seats_purchased, starts_at, ends_at")
        .eq("org_id", ctx.org.id)
        .eq("status", "active")
        .order("starts_at", { ascending: false }),
      supabase
        .from("org_join_links")
        .select("id, licence_id, email_domain, max_uses, uses, expires_at, revoked_at, created_at")
        .eq("org_id", ctx.org.id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    licences = ((l.data ?? []) as Licence[]).filter((x) => !isPastIso(x.ends_at));
    links = (k.data ?? []) as Link[];
  }

  return (
    <div className="admin-page studio-page org-console org-invite">
      <p className="muted studio-org">{ctx.org.displayName}</p>
      <h1>Invite in bulk</h1>
      {notice ? (
        <p className={`admin-notice admin-notice-${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
          {notice.text}
        </p>
      ) : null}
      <p className="muted">Everyone taking part must be 18 or over. Each person confirms it before they take a place.</p>

      {!isOwner ? (
        <p className="admin-note">Inviting people is for the owner of {ctx.org.displayName}.</p>
      ) : licences.length === 0 ? (
        <div className="card admin-empty">
          <h2>No open licence</h2>
          <p className="muted">Invitations and links need a licence that is active.</p>
        </div>
      ) : (
        licences.map((l) => {
          const mine = links.filter((k) => k.licence_id === l.id);
          return (
            <section key={l.id} className="card org-licence" aria-labelledby={`inv-${l.id}`}>
              <h2 id={`inv-${l.id}`}>
                {labelOf(LICENCE_KIND_LABELS, l.kind)} licence, {l.seats_purchased} seats
              </h2>
              <p className="muted">Until {formatOrgDate(l.ends_at)}.</p>

              <h3>Upload a list</h3>
              <CsvInvite orgId={ctx.org.id} licenceId={l.id} />

              <h3>Join link</h3>
              <JoinLinkMaker orgId={ctx.org.id} licenceId={l.id} seats={l.seats_purchased} />
              {mine.length > 0 ? (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <caption>Links</caption>
                    <thead>
                      <tr>
                        <th scope="col">Made</th>
                        <th scope="col">Domain</th>
                        <th scope="col">Used</th>
                        <th scope="col">Works until</th>
                        <th scope="col">Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mine.map((k) => {
                        const open = !k.revoked_at && !isPastIso(k.expires_at);
                        return (
                          <tr key={k.id}>
                            <td>{formatOrgDate(k.created_at)}</td>
                            <td>{k.email_domain ?? <span className="muted">Any address</span>}</td>
                            <td>
                              {k.uses} of {k.max_uses}
                            </td>
                            <td>{k.revoked_at ? <span className="muted">Closed</span> : open ? formatOrgDate(k.expires_at) : <span className="muted">Expired</span>}</td>
                            <td>
                              {open ? (
                                <form action={revokeJoinLink}>
                                  <input type="hidden" name="org" value={ctx.org.id} />
                                  <input type="hidden" name="link" value={k.id} />
                                  <button type="submit" className="btn secondary admin-row-btn">
                                    Close link
                                  </button>
                                </form>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
          );
        })
      )}
    </div>
  );
}
