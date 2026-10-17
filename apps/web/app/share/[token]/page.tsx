import type { Metadata } from "next";
import Link from "next/link";
import { InfoFooter } from "@/components/InfoFooter";
import { getReaderSession } from "@/lib/auth";
import { brand } from "@/lib/brand";
import {
  ACCEPT_MESSAGES,
  INVITE_STATEMENTS,
  SHARED_PLAN_POSITIONING,
  isAcceptOutcome,
} from "@/lib/shared-membership";
import { hashInviteToken, isInviteToken } from "@/lib/shared-membership-token";
import { createAdminClient } from "@/lib/supabase/admin";
import { tenantIdForRequest } from "@/lib/tenant-id";
import { acceptSharedMembership } from "./actions";

/**
 * The invitation page (item 6.1): /share/<token>. Someone has shared their
 * membership. The page says what joining gives, that the person who invited
 * them pays and can remove them, and that their answers stay their own.
 * It names nobody: the link carries no account details and the page shows
 * none. Accepting needs an Akana account; a visitor without one is sent to
 * sign in and comes back here.
 *
 * The token is hashed here and looked up with the service role, which is the
 * only caller allowed to ask whether a link is usable. The page is not
 * indexed and sends no referrer.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Join a shared membership",
  description: `Join a ${brand.name} membership that someone has shared with you.`,
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ outcome?: string | string[] }> };

export default async function SharePage({ params, searchParams }: Props) {
  const [{ token }, sp, session] = await Promise.all([params, searchParams, getReaderSession()]);
  const outcomeRaw = Array.isArray(sp.outcome) ? sp.outcome[0] : sp.outcome;
  const outcome = isAcceptOutcome(outcomeRaw) && outcomeRaw !== "joined" ? outcomeRaw : null;

  let state: "open" | "expired" | "invalid" | "unknown" = "invalid";
  if (isInviteToken(token)) {
    const tenantId = await tenantIdForRequest();
    if (tenantId) {
      const { data, error } = await createAdminClient().rpc("seat_invite_state", { p_token_hash: hashInviteToken(token), p_tenant: tenantId });
      state = error ? "unknown" : data === "open" || data === "expired" ? data : "invalid";
    }
  }

  const refusal = outcome ? ACCEPT_MESSAGES[outcome] : state === "expired" ? ACCEPT_MESSAGES.expired : state === "invalid" ? ACCEPT_MESSAGES.invalid : null;

  return (
    <main className="wrap info-page share-page">
      <header className="info-head">
        <p className="eyebrow muted">{brand.name}</p>
        <h1>{SHARED_PLAN_POSITIONING}</h1>
        <p className="muted">Someone has shared their membership with you.</p>
      </header>

      {state === "unknown" ? (
        <p role="status">We could not check this link just now. Please try again in a moment.</p>
      ) : refusal ? (
        <p role="status">{refusal}</p>
      ) : null}

      {state === "open" || (outcome && state !== "unknown") ? (
        <section aria-labelledby="share-what">
          <h2 id="share-what">What joining means</h2>
          <ul>
            {INVITE_STATEMENTS.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>

          {state === "open" && !outcome ? (
            session ? (
              <form action={acceptSharedMembership}>
                <input type="hidden" name="token" value={token} />
                <button type="submit" className="btn">
                  Join the membership
                </button>
              </form>
            ) : (
              <>
                <p>You need an {brand.name} account to join. It is quick to make, and the same sign-in brings you back to this page.</p>
                <p>
                  <Link className="btn" href={`/sign-in?next=${encodeURIComponent(`/share/${token}`)}`}>
                    Sign in or make an account
                  </Link>
                </p>
              </>
            )
          ) : null}
        </section>
      ) : null}

      <p>
        <Link href="/">Go to {brand.name}</Link>
      </p>
      <InfoFooter />
    </main>
  );
}
