import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { HelpNowButton } from "@/components/HelpNowButton";
import { brand } from "@/lib/brand";
import { getReaderSession, safeNextPath } from "@/lib/auth";
import { hasCurrentConsent } from "@/lib/consent";
import { marketFor } from "@/lib/markets";
import { createUserClient } from "@/lib/supabase/server";
import { giveHealthConsent } from "./action";

export const metadata: Metadata = { title: "Before you begin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Search = { error?: string; next?: string };

/**
 * Health data consent (F-026). Shown before a reader's first wellbeing
 * workbook. Plain words from the privacy notice, section 3. One checkbox,
 * one button, and Help now, because this is a wellbeing screen. The topic
 * of the workbook is not named here.
 */
export default async function ConsentPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const next = safeNextPath(sp.next, "/library");
  const session = await getReaderSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(`/consent?next=${next}`)}`);

  const supabase = await createUserClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("health_consent_at, health_consent_version, country")
    .eq("user_id", session.userId)
    .maybeSingle();
  // Consent to an older wording does not count: the reader is asked again.
  if (
    hasCurrentConsent({
      consentAt: (profile?.health_consent_at as string | null | undefined) ?? null,
      consentVersion: (profile?.health_consent_version as string | null | undefined) ?? null,
    })
  ) {
    redirect(next);
  }
  const market = marketFor((profile?.country as string | null | undefined) ?? null);

  const error =
    sp.error === "required"
      ? "Tick the box to continue. Without it we cannot store what you write in wellbeing workbooks."
      : sp.error === "save"
        ? "That did not save. Please try again."
        : null;

  return (
    <section className="consent-page">
      <div className="consent-help">
        <HelpNowButton market={market.code === "XX" ? null : market.code} />
      </div>
      <div className="card consent-card">
        <h1>Before you begin</h1>
        <p>
          Some workbooks are about wellbeing. What you write in them may reveal information about your mental or physical
          health. The law treats that as special category data, so we ask for your explicit consent before we store it.
        </p>
        <p>Your answers are encrypted when stored. Only {brand.name}&apos;s secure server can unlock them, and only to show them to you.</p>
        <p>No author, publisher, white-label partner or member of {brand.name} staff can read what you write.</p>
        <p>
          You can withdraw your consent at any time in You. If you do, you can no longer add to wellbeing workbooks, and you can
          choose to delete what you have written.
        </p>
        <form action={giveHealthConsent}>
          <input type="hidden" name="next" value={next} />
          <div className="check">
            <input id="consent" name="consent" type="checkbox" value="yes" aria-describedby={error ? "consent-error" : undefined} />
            <label htmlFor="consent">Yes, store what I write in wellbeing workbooks.</label>
          </div>
          {error ? (
            <p id="consent-error" className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="btn">
            Continue
          </button>
        </form>
      </div>
    </section>
  );
}
