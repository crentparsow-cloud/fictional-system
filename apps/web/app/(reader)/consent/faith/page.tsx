import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NeedSupportFooter } from "@/components/NeedSupportFooter";
import { brand } from "@/lib/brand";
import { getReaderSession, safeNextPath } from "@/lib/auth";
import { hasCurrentFaithConsent } from "@/lib/consent";
import { getT } from "@/lib/i18n";
import { createUserClient } from "@/lib/supabase/server";
import { giveFaithConsent } from "./action";

export const metadata: Metadata = { title: "Before you begin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Search = { error?: string; next?: string };

/**
 * Faith consent (F-150). Shown before a reader's first workbook on the Faith
 * and Spirituality shelf, built like the health data consent (F-026). Using a
 * faith title can reveal religious belief, which is special category data,
 * so the screen says plainly what is stored and why, and asks for explicit
 * consent under Article 9(2)(a). The wording has not yet been reviewed by
 * the lawyer [check legal]; change FAITH_CONSENT_VERSION when it changes.
 * The workbook is not named here.
 */
export default async function FaithConsentPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const next = safeNextPath(sp.next, "/library");
  const session = await getReaderSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(`/consent/faith?next=${next}`)}`);

  const supabase = await createUserClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("faith_consent_at, faith_consent_version")
    .eq("user_id", session.userId)
    .maybeSingle();
  // Consent to an older wording does not count: the reader is asked again.
  if (
    hasCurrentFaithConsent({
      consentAt: (profile?.faith_consent_at as string | null | undefined) ?? null,
      consentVersion: (profile?.faith_consent_version as string | null | undefined) ?? null,
    })
  ) {
    redirect(next);
  }
  const { t } = await getT();

  const error =
    sp.error === "required"
      ? "Tick the box to continue. Without it we cannot store what you write in faith workbooks."
      : sp.error === "save"
        ? "That did not save. Please try again."
        : null;

  return (
    <section className="consent-page">
      <div className="card consent-card">
        <h1>Before you begin</h1>
        <p>
          This is a faith workbook. What you write in it, and the fact that you use it, may show your religious beliefs. The law
          treats religious belief as special category data, so we ask for your explicit consent before we store anything.
        </p>
        <p>
          What we store: your answers, and a record of which faith workbooks you have started and how far you have got. We keep them
          so you can pick up where you left off. We do not use them for advertising and we do not sell them. If you buy a faith workbook, the purchase record is kept as tax
          law requires, like any other purchase.
        </p>
        <p>Your answers are encrypted when stored. Only {brand.name}&apos;s secure server can unlock them, and only to show them to you.</p>
        <p>No author, publisher, church, white-label partner or member of {brand.name} staff can read what you write.</p>
        <p>
          You can withdraw your consent at any time in You. If you do, you can no longer add to faith workbooks, and you can choose to
          delete what you have written.
        </p>
        <form action={giveFaithConsent}>
          <input type="hidden" name="next" value={next} />
          <div className="check">
            <input id="faith-consent" name="consent" type="checkbox" value="yes" aria-describedby={error ? "faith-consent-error" : undefined} />
            <label htmlFor="faith-consent">Yes, store what I write in faith workbooks.</label>
          </div>
          {error ? (
            <p id="faith-consent-error" className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="btn">
            Continue
          </button>
        </form>
      </div>
      <NeedSupportFooter label={t("help.needSupport")} />
    </section>
  );
}
