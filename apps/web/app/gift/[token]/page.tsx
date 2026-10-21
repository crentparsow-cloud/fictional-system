import type { Metadata } from "next";
import Link from "next/link";
import { getReaderSession } from "@/lib/auth";
import { GIFT_NOTICES, giftDateWords, giftLength, isClaimToken } from "@/lib/gift";
import { createUserClient } from "@/lib/supabase/server";
import { claimGiftAction } from "./actions";

export const metadata: Metadata = { title: "Your gift", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

interface Preview {
  months: number;
  sender_name: string | null;
  message: string | null;
  status: string;
  claim_by: string | null;
}

async function loadPreview(token: string): Promise<Preview | null> {
  const supabase = await createUserClient();
  const { data } = await supabase.rpc("gift_preview", { p_token: token });
  return ((data ?? []) as Preview[])[0] ?? null;
}

/**
 * The page a recipient lands on from the email. It shows the length, who it
 * is from and their message, and nothing else. Claiming is a button, so a
 * mail scanner that opens the link cannot use it up.
 */
export default async function ClaimGiftPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { token } = await params;
  const sp = await searchParams;
  const r = typeof sp.r === "string" ? sp.r : null;
  const preview = isClaimToken(token) ? await loadPreview(token) : null;
  const session = await getReaderSession();
  const notice = r === "invalid" ? GIFT_NOTICES.invalid : r === "expired" ? GIFT_NOTICES.expired : null;
  const usable = preview && preview.status === "paid";

  return (
    <main id="main" className="tab-page">
      <h1>A gift for you</h1>
      {notice ? (
        <p className="you-notice" role="status">
          {notice}
        </p>
      ) : null}
      {!preview ? (
        <p>{GIFT_NOTICES.invalid}</p>
      ) : (
        <>
          <p>
            {preview.sender_name ? `${preview.sender_name} has` : "Someone has"} given you {giftLength(preview.months)} of membership. The whole library opens for you.
          </p>
          {preview.message ? <blockquote>{preview.message}</blockquote> : null}
          <p>You do not need a card. Nothing renews. When it ends, your account goes back to how it was and everything you wrote stays readable.</p>
          {usable && preview.claim_by ? <p className="small muted">Claim it by {giftDateWords(preview.claim_by)}.</p> : null}
          {preview.status === "claimed" ? <p>This gift has been claimed.</p> : null}
          {usable ? (
            session ? (
              <form action={claimGiftAction}>
                <input type="hidden" name="t" value={token} />
                <button type="submit" className="btn">
                  Claim my gift
                </button>
              </form>
            ) : (
              <p>
                <Link className="btn" href={`/sign-in?next=${encodeURIComponent(`/gift/${token}`)}`}>
                  Sign in or create an account to claim it
                </Link>
              </p>
            )
          ) : null}
        </>
      )}
    </main>
  );
}
