import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { brand } from "@/lib/brand";
import { getReaderSession, safeNextPath } from "@/lib/auth";
import { READER_TERMS_LINKS, READER_TERMS_VERSION, needsReaderTerms } from "@/lib/terms";
import { readerTermsAccepted } from "@/lib/terms-server";
import { acceptTerms } from "./action";

export const metadata: Metadata = { title: "Our terms", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Search = { error?: string; next?: string };

/**
 * Reader terms re-ask (F-122). The reader layout sends a signed-in reader
 * here when the terms version they last accepted is not the one this
 * release shows, as the health consent screen does for its own wording.
 * One checkbox, one button, links to the three documents.
 */
export default async function TermsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const next = safeNextPath(sp.next, "/home");
  const session = await getReaderSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(`/terms?next=${next}`)}`);

  const status = await readerTermsAccepted();
  if (status.ok && !needsReaderTerms(status.accepted)) redirect(next);
  const changed = status.ok && status.accepted !== null;

  const error =
    sp.error === "required"
      ? "Tick the box to continue."
      : sp.error === "changed"
        ? "The terms changed while this page was open. Please read them again."
        : sp.error === "save"
          ? "That did not save. Please try again."
          : null;

  return (
    <main className="auth-page wrap">
      <section className="card auth-card">
        <p className="eyebrow">{brand.name}</p>
        <h1>{changed ? "Our terms have changed" : "Our terms"}</h1>
        {changed ? (
          <p>We have updated the reader terms. Please read them and agree before you carry on. Nothing you have written is affected.</p>
        ) : (
          <p>Please read the reader terms and agree before you carry on.</p>
        )}
        <ul className="terms-doc-links">
          {READER_TERMS_LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href} target="_blank" rel="noopener">
                Read the {l.label}
              </a>
            </li>
          ))}
        </ul>
        <form action={acceptTerms}>
          <input type="hidden" name="next" value={next} />
          <input type="hidden" name="terms_version" value={READER_TERMS_VERSION} />
          <div className="check">
            <input id="terms" name="terms" type="checkbox" value="yes" aria-describedby={error ? "terms-error" : undefined} />
            <label htmlFor="terms">I agree to the reader terms</label>
          </div>
          {error ? (
            <p id="terms-error" className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="btn">
            Continue
          </button>
        </form>
        <p className="small muted">Terms version {READER_TERMS_VERSION}.</p>
      </section>
    </main>
  );
}
