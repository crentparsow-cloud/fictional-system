import type { Metadata } from "next";
import Link from "next/link";
import { InfoFooter } from "@/components/InfoFooter";
import { getReaderSession } from "@/lib/auth";
import { brand } from "@/lib/brand";
import { ACCEPT_MESSAGES, INVITE_STATEMENTS, LABEL_MAX, isAcceptOutcome } from "@/lib/friends/pair";
import { hashInviteToken, isInviteToken } from "@/lib/shared-membership-token";
import { createAdminClient } from "@/lib/supabase/admin";
import { acceptPairInvite } from "./actions";

/**
 * The invitation page for doing a workbook with a friend (6.2):
 * /friend/<token>. It says what the friend would share and what stays
 * private, names the workbook and the label the inviter chose, and nothing
 * about their account. Accepting needs an Akana account and the workbook
 * already started. Akana never emails the friend: the inviter sent this link
 * themselves. Not indexed, no referrer.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Do a workbook with a friend",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ outcome?: string | string[] }> };

export default async function FriendInvitePage({ params, searchParams }: Props) {
  const [{ token }, sp, session] = await Promise.all([params, searchParams, getReaderSession()]);
  const outcomeRaw = Array.isArray(sp.outcome) ? sp.outcome[0] : sp.outcome;
  const outcome = isAcceptOutcome(outcomeRaw) && outcomeRaw !== "joined" ? outcomeRaw : null;

  let invite = null as { state: string; slug: string; title: string; inviter_label: string } | null;
  let lookupFailed = false;
  if (isInviteToken(token)) {
    try {
      const { data, error } = await createAdminClient().rpc("pair_invite_state", { p_hash: hashInviteToken(token) });
      if (error) lookupFailed = true;
      else invite = ((Array.isArray(data) ? data[0] : data) as typeof invite) ?? null;
    } catch {
      lookupFailed = true;
    }
  }
  const refusal = outcome ? ACCEPT_MESSAGES[outcome] : !invite && !lookupFailed ? ACCEPT_MESSAGES.invalid : invite?.state === "expired" ? ACCEPT_MESSAGES.expired : null;

  return (
    <main className="wrap info-page share-page">
      <header className="info-head">
        <p className="eyebrow muted">{brand.name}</p>
        <h1>Do a workbook with a friend</h1>
      </header>
      {lookupFailed ? <p>We could not check this invitation just now. Try again in a moment.</p> : null}
      {refusal ? <p role="alert">{refusal}</p> : null}
      {invite && invite.state === "open" ? (
        <>
          <p>
            {invite.inviter_label} has asked you to read <strong>{invite.title}</strong> alongside them.
          </p>
          <ul>
            {INVITE_STATEMENTS.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          {outcome === "not_enrolled" ? (
            <p>
              <Link className="btn" href={`/w/${invite.slug}`}>
                Look at the workbook
              </Link>
            </p>
          ) : null}
          {session ? (
            <form action={acceptPairInvite}>
              <input type="hidden" name="token" value={token} />
              <label htmlFor="friend-as">How you appear to them</label>
              <input id="friend-as" name="label" type="text" maxLength={LABEL_MAX} placeholder="Your first name, or what they call you" autoComplete="off" />
              <p>
                <button type="submit" className="btn">
                  Yes, do it together
                </button>
              </p>
            </form>
          ) : (
            <p>
              <Link className="btn" href={`/sign-in?next=${encodeURIComponent(`/friend/${token}`)}`}>
                Sign in to accept
              </Link>
            </p>
          )}
          <p className="muted small">You can say no by closing this page. Nothing happens until you press the button.</p>
        </>
      ) : null}
      <InfoFooter />
    </main>
  );
}
