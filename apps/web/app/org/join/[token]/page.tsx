import type { Metadata } from "next";
import Link from "next/link";
import { getReaderSession } from "@/lib/auth";
import { brand } from "@/lib/brand";
import { hashToken, isTokenShaped } from "@/lib/partner";
import { CLAIM_ERRORS, CUSTOMER_KIND_LABELS, formatOrgDate, orgPrivacyLine, seatLinkCopy, type SeatLinkState } from "@/lib/org-pilot";
import { createUserClient } from "@/lib/supabase/server";
import { claimSeat, declineSeat } from "../../actions";

export const metadata: Metadata = { title: "Invitation", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Params = Promise<{ token: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

interface View {
  state: SeatLinkState;
  organisation_name: string | null;
  organisation_kind: string | null;
  email_hint: string | null;
  expires_at: string | null;
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * A seat invitation (F-203). Anyone holding the link sees which
 * organisation it is from and a masked address, never a title. Taking the
 * place needs a signed-in account, the 18 or over tick and a button press;
 * saying no needs only the button. Nothing happens on opening the link, so
 * a mail scanner that follows it changes nothing. The token is hashed
 * before it reaches the database.
 */
export default async function SeatJoinPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { token } = await params;
  const sp = await searchParams;
  const supabase = await createUserClient();

  let view: View = { state: "unknown", organisation_name: null, organisation_kind: null, email_hint: null, expires_at: null };
  if (isTokenShaped(token)) {
    const { data, error } = await supabase.rpc("org_seat_invite_view", { p_token_hash: await hashToken(token) });
    if (error) console.error("org_seat_view_failed", error.code ?? "");
    const row = (Array.isArray(data) ? data[0] : data) as View | null;
    if (row) view = row;
  }

  const done = one(sp.done);
  if (done === "claimed" && view.state === "used") {
    return (
      <section className="card auth-card">
        <p className="eyebrow muted">Invitation</p>
        <h1>You have a place</h1>
        <p>
          {view.organisation_name ? `${view.organisation_name} has given you access` : "You have access"} to workbooks on {brand.name}. Choose one to start.
          Your answers are yours alone.
        </p>
        <p>
          <Link className="btn" href="/library">
            Choose a workbook
          </Link>
        </p>
      </section>
    );
  }
  if (done === "declined" || view.state === "declined") {
    const c = seatLinkCopy("declined");
    return (
      <section className="card auth-card">
        <h1>{done === "declined" ? "Thank you. You said no." : c.title}</h1>
        <p>{c.body}</p>
        <p>
          <Link href="/">Go to {brand.name}</Link>
        </p>
      </section>
    );
  }

  if (view.state !== "ok") {
    const c = seatLinkCopy(view.state);
    return (
      <section className="card auth-card">
        <h1>{c.title}</h1>
        <p>{c.body}</p>
        <p>
          <Link href="/">Go to {brand.name}</Link>
        </p>
      </section>
    );
  }

  const session = await getReaderSession();
  const errorKey = one(sp.e);
  const error = errorKey ? (CLAIM_ERRORS[errorKey] ?? CLAIM_ERRORS.failed) : null;
  const kind = view.organisation_kind ? (CUSTOMER_KIND_LABELS as Record<string, string>)[view.organisation_kind] : null;
  const declining = one(sp.decline) === "1";

  return (
    <section className="card auth-card org-join">
      <p className="eyebrow muted">Invitation{kind ? ` from a ${kind.toLowerCase()}` : ""}</p>
      <h1>{view.organisation_name} has a place for you</h1>
      <p>
        The invitation was sent to <strong>{view.email_hint}</strong>. With it you can use guided workbooks on {brand.name}, a step at a time, in your own
        words.
      </p>
      <p>Taking part is your choice. You can say no, and you can stop at any time.</p>
      <div className="card info-privacy">
        <h2>What stays private</h2>
        <p>{orgPrivacyLine(brand.name)}</p>
      </div>

      {error ? (
        <p className="form-error" role="alert" id="claim-error">
          {error}
        </p>
      ) : null}

      {declining ? null : session ? (
        <form action={claimSeat}>
          <input type="hidden" name="token" value={token} />
          <p className="muted">Signed in as {session.email}. The place goes to this account. You can use an account you already have.</p>
          <div className="check">
            <input id="adult" name="adult" type="checkbox" value="yes" required aria-describedby={error ? "claim-error" : undefined} />
            <label htmlFor="adult">I am 18 or over</label>
          </div>
          <button type="submit" className="btn">
            Take the place
          </button>
        </form>
      ) : (
        <p>
          <Link className="btn" href={`/sign-in?next=${encodeURIComponent(`/org/join/${token}`)}`}>
            Sign in or create an account to accept
          </Link>
        </p>
      )}

      <form action={declineSeat}>
        <input type="hidden" name="token" value={token} />
        {declining ? <p>Say no to this invitation? {view.organisation_name} will not be able to invite this address again.</p> : null}
        <button type="submit" className={declining ? "btn" : "btn secondary"}>
          No, thank you
        </button>
      </form>
      <p className="muted small">
        If the place ends, you keep everything you wrote. {view.expires_at ? `This invitation works until ${formatOrgDate(view.expires_at)}.` : ""}
      </p>
    </section>
  );
}
