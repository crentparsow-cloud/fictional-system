import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/auth";
import { getStepUpState } from "@/lib/payouts/read";
import { PayeeCodeForm, PayeeEnrolForm } from "./VerifyForms";

export const metadata: Metadata = {
  title: "Check it is you",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * Step-up before a payout change (F-143). Owners and finance contacts need
 * an authenticator app. Someone without one sets it up here once; after
 * that, a fresh code is asked for when the last one is over ten minutes old.
 */
export default async function PayoutVerifyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : null, "/payouts");
  const state = await getStepUpState();
  if (!state.signedIn) redirect(`/sign-in?next=${encodeURIComponent(`/payouts/verify?next=${encodeURIComponent(next)}`)}`);
  if (state.recent) redirect(next);

  return (
    <main className="auth-page wrap">
      <section className="card auth-card admin-mfa">
        <p className="eyebrow">Payouts</p>
        <h1>{state.hasAuthenticator ? "Check it is you" : "Set up an authenticator"}</h1>
        {state.hasAuthenticator ? (
          <>
            <p>Before changing payout details, enter the current code from your authenticator app.</p>
            <PayeeCodeForm next={next} />
          </>
        ) : (
          <>
            <p>
              Payout details decide where your money goes, so changing them needs an authenticator app as well as your sign-in. You set this up once. Any authenticator app works.
            </p>
            <PayeeEnrolForm next={next} />
          </>
        )}
        <p className="muted small">Lost your authenticator? Contact Akana support. We check who you are before we reset it.</p>
      </section>
    </main>
  );
}
