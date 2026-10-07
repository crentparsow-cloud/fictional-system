import type { Metadata } from "next";
import Link from "next/link";
import { getReaderSession } from "@/lib/auth";
import { brand } from "@/lib/brand";
import { hashToken, isTokenShaped } from "@/lib/partner";
import { inviteLinkCopy, type InviteState } from "@/lib/studio";
import { createUserClient } from "@/lib/supabase/server";
import { acceptAdminInvite } from "../../actions";

export const metadata: Metadata = { title: "Organisation invitation", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Params = Promise<{ token: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

/**
 * The invitation Akana staff send to the person who will run a customer
 * organisation. It is the 0013 invitation (bound to one email address,
 * single use, 14 days); only the words and the destination differ from the
 * publisher one, so nobody here is told they are publishing.
 */
export default async function AdminJoinPage({ params, searchParams }: { params: Params; searchParams: Search }) {
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
    if (error) console.error("org_admin_view_failed", error.code ?? "");
    const row = (Array.isArray(data) ? data[0] : data) as typeof view | null;
    if (row) view = row;
  }

  if (view.state !== "ok") {
    const c = inviteLinkCopy(view.state);
    return (
      <section className="card auth-card">
        <h1>{c.title}</h1>
        <p>{view.state === "used" ? "If it was you, sign in and open your organisation's seats." : c.body}</p>
        <p>
          <Link href="/org">Go to your organisation</Link>
        </p>
      </section>
    );
  }

  const session = await getReaderSession();
  const e = Array.isArray(sp.e) ? sp.e[0] : sp.e;
  const error =
    e === "other-address" ? "This invitation is for a different email address." : e === "closed" ? "This invitation can no longer be used." : e ? "That didn't work just now. Please try again." : null;

  return (
    <section className="card auth-card">
      <p className="eyebrow muted">Invitation</p>
      <h1>Run {view.organisation_name} on {brand.name}</h1>
      <p>
        You will invite your people and see how many places are taken. You will never see what anyone wrote. The invitation is for{" "}
        <strong>{view.email_hint}</strong>.
      </p>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {session ? (
        <>
          <p className="muted">Signed in as {session.email}. If that is not the invited address, sign out and sign in with the right one.</p>
          <form action={acceptAdminInvite}>
            <input type="hidden" name="token" value={token} />
            <button type="submit" className="btn">
              Accept the invitation
            </button>
          </form>
        </>
      ) : (
        <p>
          <Link className="btn" href={`/sign-in?next=${encodeURIComponent(`/org/admin-join/${token}`)}`}>
            Sign in to accept
          </Link>
        </p>
      )}
      <p className="muted small">The link works once and lasts 14 days.</p>
    </section>
  );
}
