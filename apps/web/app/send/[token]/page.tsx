import type { Metadata } from "next";
import Link from "next/link";
import { InfoFooter } from "@/components/InfoFooter";
import { getReaderSession } from "@/lib/auth";
import { brand } from "@/lib/brand";
import { GIFT_CLAIM_MESSAGES, isGiftClaimResult, isGiftToken } from "@/lib/send-workbook";
import { hashInviteToken } from "@/lib/shared-membership-token";
import { createUserClient } from "@/lib/supabase/server";
import { claimGift } from "./actions";

/**
 * Claiming a gifted workbook (14.14): /send/<token>. The email did not name
 * the workbook; this page does, to the signed-in person holding the link,
 * because they are about to take it. No card and nothing renews. It says
 * nothing about who sent it. Not indexed, no referrer.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "A gift",
  description: `A workbook sent to you on ${brand.name}.`,
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ result?: string | string[] }> };

export default async function GiftPage({ params, searchParams }: Props) {
  const [{ token }, sp, session] = await Promise.all([params, searchParams, getReaderSession()]);
  const resultRaw = Array.isArray(sp.result) ? sp.result[0] : sp.result;
  const result = isGiftClaimResult(resultRaw) ? resultRaw : null;
  const valid = isGiftToken(token);

  let preview: { status: string; title: string; expired: boolean; canClaim: boolean } | null = null;
  if (valid && session) {
    const supabase = await createUserClient();
    const { data } = await supabase.rpc("workbook_gift_preview", { p_token_hash: hashInviteToken(token) });
    const row = ((data ?? []) as { status: string; workbook_title: string; expired: boolean; can_claim: boolean }[])[0];
    if (row) preview = { status: row.status, title: row.workbook_title, expired: row.expired, canClaim: row.can_claim };
  }
  const message = !valid ? GIFT_CLAIM_MESSAGES.unknown : result ? GIFT_CLAIM_MESSAGES[result] : preview && preview.expired ? GIFT_CLAIM_MESSAGES.expired : null;

  return (
    <main className="wrap info-page">
      <header className="info-head">
        <p className="eyebrow muted">{brand.name}</p>
        <h1>A workbook has been sent to you</h1>
        <p className="muted">A member chose to give you a full workbook. It needs no card, and nothing renews.</p>
      </header>

      {message ? <p role="status">{message}</p> : null}

      {valid && !session ? (
        <>
          <p>Sign in or make an account to claim it. The same sign-in brings you back to this page.</p>
          <p>
            <Link className="btn" href={`/sign-in?next=${encodeURIComponent(`/send/${token}`)}`}>
              Sign in or make an account
            </Link>
          </p>
        </>
      ) : null}

      {valid && session && preview && preview.status === "sent" && !preview.expired && !result ? (
        preview.canClaim ? (
          <section aria-labelledby="gift-claim">
            <h2 id="gift-claim">{preview.title}</h2>
            <p>This is yours to keep once you claim it.</p>
            <form action={claimGift}>
              <input type="hidden" name="token" value={token} />
              <button type="submit" className="btn">
                Claim your workbook
              </button>
            </form>
          </section>
        ) : (
          <p role="status">{GIFT_CLAIM_MESSAGES.not_eligible}</p>
        )
      ) : null}

      {valid && session && !preview && !result ? <p role="status">{GIFT_CLAIM_MESSAGES.unknown}</p> : null}
      {valid && session && preview && preview.status === "claimed" && !result ? <p role="status">{GIFT_CLAIM_MESSAGES.not_available}</p> : null}

      <p>
        <Link href="/">Go to {brand.name}</Link>
      </p>
      <InfoFooter />
    </main>
  );
}
