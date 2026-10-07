import type { Metadata } from "next";
import Link from "next/link";
import { signOut } from "@/app/(auth)/sign-out/action";
import { deletionState, longDate, noticeText, type DeletionRow } from "@/lib/account";
import { getReaderSession } from "@/lib/auth";
import { getT } from "@/lib/i18n";
import { createUserClient } from "@/lib/supabase/server";
import { cancelDeletion, requestDeletion, withdrawHealthConsent } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("nav.you") };
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function YouPage({ searchParams }: Props) {
  const { t } = await getT();
  const params = await searchParams;
  const notice = noticeText(params.notice);
  const session = await getReaderSession();
  const supabase = await createUserClient();

  // The reader's own deletion request, under RLS. Filtered by user id as
  // well, because platform owners and support can read every row.
  const { data: delRow } = session
    ? await supabase
        .from("account_deletion_requests")
        .select("requested_at, cancel_before, cancelled_at, completed_at")
        .eq("user_id", session.userId)
        .maybeSingle()
    : { data: null };
  const deletion = deletionState(delRow as DeletionRow | null, new Date());

  // Health data consent (0006). If the columns cannot be read, the line is
  // left out rather than guessed at.
  const { data: consentRow, error: consentError } = session
    ? await supabase.from("profiles").select("health_consent_at").eq("user_id", session.userId).maybeSingle()
    : { data: null, error: null };
  const showConsent = Boolean(session) && !consentError;
  const consentAt = (consentRow as { health_consent_at: string | null } | null)?.health_consent_at ?? null;

  return (
    <section className="tab-page you-page">
      <h1>{t("nav.you")}</h1>
      <p className="muted">{t("you.line")}</p>

      {notice ? (
        <p className="you-notice" role="status">
          {notice}
        </p>
      ) : null}

      {deletion.kind === "pending" ? (
        <div className="you-banner" role="region" aria-label="Account deletion">
          <p>
            <b>Your account will be deleted on {longDate(deletion.deletesOn)}.</b>
          </p>
          <p className="small">You can undo it until then.</p>
          <form action={cancelDeletion}>
            <button type="submit" className="btn">
              Cancel deletion
            </button>
          </form>
        </div>
      ) : null}
      {deletion.kind === "due" ? (
        <div className="you-banner" role="region" aria-label="Account deletion">
          <p>
            <b>Your account is being deleted.</b>
          </p>
          <p className="small">The 7 days to change your mind ended on {longDate(deletion.deletesOn)}.</p>
        </div>
      ) : null}

      <section className="you-section" aria-labelledby="you-account">
        <h2 id="you-account">Account</h2>
        <dl className="card you-list">
          <div>
            <dt>Email</dt>
            <dd className="you-wrap">{session?.email ?? "Not available"}</dd>
          </div>
          <div>
            <dt>Confirmed you are 18 or over</dt>
            <dd>{session?.adultConfirmedAt ? longDate(session.adultConfirmedAt) : "Not yet"}</dd>
          </div>
        </dl>
        <form action={signOut}>
          <button type="submit" className="btn secondary">
            {t("you.signOut")}
          </button>
        </form>
      </section>

      <section className="you-section" aria-labelledby="you-work">
        <h2 id="you-work">Download my work</h2>
        <p>Every answer, check-in and plan. Prompts and answers only, not the teaching text.</p>
        <div className="card you-actions">
          <a className="btn" href="/api/export?format=json" download>
            Download data file (JSON)
          </a>
          <form method="get" action="/api/export" className="you-print">
            <input type="hidden" name="format" value="html" />
            <div className="check">
              <input type="checkbox" id="you-titles" name="titles" value="show" />
              <label htmlFor="you-titles">Show the book title</label>
            </div>
            <button type="submit" className="btn secondary">
              Download printable page
            </button>
            <p className="small muted">Open it and print, or save it as a PDF from your browser. The header stays plain unless you tick the box.</p>
          </form>
        </div>
      </section>

      <section className="you-section" id="your-data" aria-labelledby="you-data">
        <h2 id="you-data">Your data</h2>
        <p className="note">Your answers are encrypted when stored. Only Akana&apos;s secure server can unlock them, and only to show them to you.</p>
        <ul className="you-links">
          <li>
            <Link href="/legal/privacy">Privacy notice</Link>
          </li>
          <li>
            <Link href="/legal/cookies">Cookie statement</Link>
          </li>
        </ul>
        <p className="small">
          Export and deletion are built into your account. To ask for a copy of everything else we hold about you, email [privacy email]. We will respond within one month.
        </p>

        {showConsent ? (
          <div className="card you-consent">
            <h3>Health data consent</h3>
            {consentAt ? (
              <>
                <p>You agreed on {longDate(consentAt)} that we may store what you write in wellbeing workbooks.</p>
                <p className="small muted">If you withdraw it, you can no longer add to wellbeing workbooks. What you have written stays until you delete it.</p>
                <form action={withdrawHealthConsent}>
                  <button type="submit" className="btn secondary">
                    Withdraw consent
                  </button>
                </form>
              </>
            ) : (
              <p className="small muted">Not given. We ask before you open your first wellbeing workbook.</p>
            )}
          </div>
        ) : null}

        {deletion.kind === "none" ? (
          <div className="you-delete">
            <details>
              <summary className="btn danger">Delete my account</summary>
              <div className="card you-confirm">
                <h3>Delete your account?</h3>
                <p className="muted">
                  Your account and everything you&apos;ve written will be deleted in 7 days. Until then you can undo it. Your purchase records are kept, because tax law
                  requires it. They do not include your work.
                </p>
                <form action={requestDeletion}>
                  <label className="q" htmlFor="del-confirm">
                    Type DELETE to confirm
                  </label>
                  <input type="text" id="del-confirm" name="confirm" autoComplete="off" autoCapitalize="characters" required />
                  <button type="submit" className="btn danger">
                    Delete my account
                  </button>
                </form>
                <Link href="/you" className="btn secondary">
                  Keep my account
                </Link>
              </div>
            </details>
            <p className="small muted">Deletion happens 7 days after you ask, so you can change your mind.</p>
          </div>
        ) : null}
      </section>
    </section>
  );
}
