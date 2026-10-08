import type { Metadata } from "next";
import Link from "next/link";
import { getReaderSession } from "@/lib/auth";
import { brand } from "@/lib/brand";
import { joinLinkCopy, LINK_CLAIM_ERRORS, type JoinLinkState } from "@/lib/org-billing";
import { CUSTOMER_KIND_LABELS, formatOrgDate, orgPrivacyLine } from "@/lib/org-pilot";
import { hashToken, isTokenShaped } from "@/lib/partner";
import { createUserClient } from "@/lib/supabase/server";
import { claimWithLink } from "../actions";

export const metadata: Metadata = { title: "Join", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Params = Promise<{ token: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

interface View {
  state: JoinLinkState;
  organisation_name: string | null;
  organisation_kind: string | null;
  email_domain: string | null;
  expires_at: string | null;
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * A join link (F-225). Anyone holding it sees which organisation it is from
 * and the email domain it asks for, never a title. Taking a place needs a
 * signed-in account, the 18 or over tick and a button press; nothing
 * happens on opening the link. The token is hashed before it reaches the
 * database.
 */
export default async function JoinLinkPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { token } = await params;
  const sp = await searchParams;
  const supabase = await createUserClient();

  let view: View = { state: "unknown", organisation_name: null, organisation_kind: null, email_domain: null, expires_at: null };
  if (isTokenShaped(token)) {
    const { data, error } = await supabase.rpc("org_join_link_view", { p_token_hash: await hashToken(token) });
    if (error) console.error("org_join_link_view_failed", error.code ?? "");
    const row = (Array.isArray(data) ? data[0] : data) as View | null;
    if (row) view = row;
  }

  if (one(sp.done) === "claimed") {
    return (
      <section className="card auth-card">
        <p className="eyebrow muted">Join</p>
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

  if (view.state !== "ok") {
    const c = joinLinkCopy(view.state);
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
  const error = errorKey ? (LINK_CLAIM_ERRORS[errorKey] ?? LINK_CLAIM_ERRORS.failed) : null;
  const kind = view.organisation_kind ? (CUSTOMER_KIND_LABELS as Record<string, string>)[view.organisation_kind] : null;
  const path = `/org/link/${token}`;

  return (
    <section className="card auth-card org-join">
      <p className="eyebrow muted">Join{kind ? ` a ${kind.toLowerCase()}` : ""}</p>
      <h1>{view.organisation_name} has a place for you</h1>
      <p>With it you can use guided workbooks on {brand.name}, a step at a time, in your own words.</p>
      <p>Taking part is your choice. You can stop at any time.</p>
      <div className="card info-privacy">
        <h2>What stays private</h2>
        <p>{orgPrivacyLine(brand.name)}</p>
        {view.email_domain ? (
          <p>
            This link is for addresses at <strong>{view.email_domain}</strong>. {view.organisation_name} will see that address on its list of people with a
            place, and the date you joined. Nothing else.
          </p>
        ) : (
          <p>{view.organisation_name} will see that a place was taken, and when. It will not see your email address.</p>
        )}
      </div>

      {error ? (
        <p className="form-error" role="alert" id="claim-error">
          {error}
        </p>
      ) : null}

      {session ? (
        <form action={claimWithLink}>
          <input type="hidden" name="token" value={token} />
          <p className="muted">Signed in as {session.email}. The place goes to this account.</p>
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
          <Link className="btn" href={`/sign-in?next=${encodeURIComponent(path)}`}>
            Sign in or create an account to join
          </Link>
        </p>
      )}
      <p className="muted small">
        If the place ends, you keep everything you wrote. {view.expires_at ? `This link works until ${formatOrgDate(view.expires_at)}.` : ""}
      </p>
    </section>
  );
}
