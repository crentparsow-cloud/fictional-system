import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { confirmAdult } from "./action";
import { brand } from "@/lib/brand";
import { getReaderSession, safeNextPath } from "@/lib/auth";
import { getT } from "@/lib/i18n";
import { READER_TERMS_LINKS, READER_TERMS_VERSION } from "@/lib/terms";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("welcome.title") };
}

type Search = { error?: string; next?: string };

/**
 * Adults-only confirmation (F-127) and the first acceptance of the reader
 * terms (F-122). Two checkboxes, one button, no topic named.
 */
export default async function WelcomePage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const next = safeNextPath(sp.next);
  const session = await getReaderSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(`/welcome?next=${next}`)}`);
  if (session.adultConfirmedAt) redirect(next);

  const { t } = await getT();
  const error = sp.error === "required" ? t("welcome.requiredBoth") : sp.error === "save" ? t("welcome.errorSave") : null;

  return (
    <main className="auth-page wrap">
      <section className="card auth-card">
        <p className="eyebrow">{brand.name}</p>
        <h1>{t("welcome.title")}</h1>
        <p>{t("welcome.lead")}</p>
        <form action={confirmAdult}>
          <input type="hidden" name="next" value={next} />
          <input type="hidden" name="terms_version" value={READER_TERMS_VERSION} />
          <div className="check">
            <input id="adult" name="adult" type="checkbox" value="yes" aria-describedby={error ? "welcome-error" : undefined} />
            <label htmlFor="adult">{t("welcome.confirm")}</label>
          </div>
          <div className="check">
            <input id="terms" name="terms" type="checkbox" value="yes" aria-describedby={error ? "welcome-error terms-links" : "terms-links"} />
            <label htmlFor="terms">{t("welcome.terms")}</label>
          </div>
          <p id="terms-links" className="small terms-links">
            {t("welcome.termsRead")}{" "}
            {READER_TERMS_LINKS.map((l, i) => (
              <span key={l.href}>
                {i > 0 ? ", " : ""}
                <a href={l.href} target="_blank" rel="noopener">
                  {l.label}
                </a>
              </span>
            ))}
            .
          </p>
          {error ? (
            <p id="welcome-error" className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="btn">
            {t("welcome.submit")}
          </button>
        </form>
      </section>
    </main>
  );
}
