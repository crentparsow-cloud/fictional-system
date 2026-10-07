import type { Metadata } from "next";
import Link from "next/link";
import { getReaderSession } from "@/lib/auth";
import { hashToken, inviteLinkCopy, isTokenShaped, ORG_ROLE_LABELS, parseOrgRole, type InviteState } from "@/lib/studio";
import { createUserClient } from "@/lib/supabase/server";
import { acceptInvite } from "../../actions";

export const metadata: Metadata = { title: "Invitation", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Params = Promise<{ token: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

/**
 * Invitation link (F-033, F-055). Anyone holding the link sees which
 * organisation it is for and a masked address. Accepting needs a signed-in
 * account with that exact address: the database checks it. The token is
 * hashed before it reaches the database; the page sends no Referer
 * (next.config) so it never leaves in a header.
 */
export default async function JoinPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { token } = await params;
  const sp = await searchParams;
  const supabase = await createUserClient();

  let view: { state: InviteState; organisation_name: string | null; role: string | null; email_hint: string | null } = {
    state: "unknown",
    organisation_name: null,
    role: null,
    email_hint: null,
  };
  if (isTokenShaped(token)) {
    const { data, error } = await supabase.rpc("org_invite_view", { p_token_hash: await hashToken(token) });
    if (error) console.error("studio_invite_view_failed", error.code ?? "");
    const row = (Array.isArray(data) ? data[0] : data) as typeof view | null;
    if (row) view = row;
  }

  if (view.state !== "ok") {
    const c = inviteLinkCopy(view.state);
    return (
      <section className="card auth-card studio-join">
        <h1>{c.title}</h1>
        <p>{c.body}</p>
        <p>
          <Link href="/">Go to Akana</Link>
        </p>
      </section>
    );
  }

  const session = await getReaderSession();
  const role = parseOrgRole(view.role);
  const error = sp.e === "other-address" ? "This invitation is for a different email address." : sp.e === "closed" ? "This invitation can no longer be used." : sp.e ? "That didn't work just now. Please try again." : null;

  return (
    <section className="card auth-card studio-join">
      <p className="eyebrow muted">Invitation</p>
      <h1>Join {view.organisation_name} on Akana</h1>
      <p>
        You have been invited as {role ? ORG_ROLE_LABELS[role].toLowerCase() : "a member"}. The invitation is for <strong>{view.email_hint}</strong>.
      </p>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {session ? (
        <>
          <p className="muted">
            Signed in as {session.email}. If that is not the invited address, sign out and sign in with the right one.
          </p>
          <form action={acceptInvite}>
            <input type="hidden" name="token" value={token} />
            <button type="submit" className="btn">
              Accept the invitation
            </button>
          </form>
        </>
      ) : (
        <p>
          <Link className="btn" href={`/sign-in?next=${encodeURIComponent(`/studio/join/${token}`)}`}>
            Sign in to accept
          </Link>
        </p>
      )}
      <p className="muted small">The link works once and lasts 14 days.</p>
    </section>
  );
}
