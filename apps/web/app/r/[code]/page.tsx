import type { Metadata } from "next";
import Link from "next/link";
import { InfoFooter } from "@/components/InfoFooter";
import { getReaderSession } from "@/lib/auth";
import { brand } from "@/lib/brand";
import { REFERRAL_USE_MESSAGES, isReferralCode, isReferralUse, referralConditions, referralConfigFrom } from "@/lib/referral";
import { createUserClient } from "@/lib/supabase/server";
import { useInvitation } from "./actions";

/**
 * A friend's invitation (6.3): /r/<code>. States what the friend gets and the
 * conditions in plain words, then lets a signed-in person choose to use it.
 * The code names nobody and the page shows nothing about whose it is. No
 * cookie: the choice is recorded when the button is pressed. Not indexed, no
 * referrer sent.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "An invitation",
  description: `A friend has invited you to ${brand.name}.`,
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type Props = { params: Promise<{ code: string }>; searchParams: Promise<{ result?: string | string[] }> };

export default async function InvitationPage({ params, searchParams }: Props) {
  const [{ code: raw }, sp, session] = await Promise.all([params, searchParams, getReaderSession()]);
  const code = raw.toUpperCase();
  const resultRaw = Array.isArray(sp.result) ? sp.result[0] : sp.result;
  const result = isReferralUse(resultRaw) ? resultRaw : null;
  const valid = isReferralCode(code);

  const supabase = await createUserClient();
  const { data: cfg } = await supabase.from("app_config").select("value").eq("key", "referral").maybeSingle();
  const conditions = referralConditions(referralConfigFrom((cfg as { value?: unknown } | null)?.value));

  return (
    <main className="wrap info-page">
      <header className="info-head">
        <p className="eyebrow muted">{brand.name}</p>
        <h1>A friend has invited you</h1>
        <p className="muted">{brand.name} turns published books into guided workbooks you do a step at a time, in your own words.</p>
      </header>

      {!valid ? <p role="status">{REFERRAL_USE_MESSAGES.unknown_code}</p> : null}
      {result ? <p role="status">{REFERRAL_USE_MESSAGES[result]}</p> : null}

      {valid ? (
        <section aria-labelledby="invite-terms">
          <h2 id="invite-terms">What the invitation gives, and the conditions</h2>
          <ul>
            {conditions.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {result === "attached" || result === "already" ? (
            <p>
              <Link className="btn" href="/pricing">
                See the membership
              </Link>
            </p>
          ) : session ? (
            <form action={useInvitation}>
              <input type="hidden" name="code" value={code} />
              <button type="submit" className="btn">
                Use this invitation
              </button>
            </form>
          ) : (
            <p>
              <Link className="btn" href={`/sign-in?next=${encodeURIComponent(`/r/${code}`)}`}>
                Sign in or make an account to use it
              </Link>
            </p>
          )}
        </section>
      ) : null}

      <p>
        <Link href="/">Go to {brand.name}</Link>
      </p>
      <InfoFooter />
    </main>
  );
}
