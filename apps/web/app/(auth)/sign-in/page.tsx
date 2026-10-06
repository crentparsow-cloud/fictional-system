import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requestMagicLink } from "./action";
import { brand } from "@/lib/brand";
import { getReaderSession, safeNextPath } from "@/lib/auth";
import { getT } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("signIn.title") };
}

type Search = { sent?: string; error?: string; next?: string };

/**
 * Sign-in (F-132). Generic by design: it names no workbook, topic or title
 * (F-127), so the screen says nothing about what a reader is here for.
 */
export default async function SignInPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const next = safeNextPath(sp.next);
  const session = await getReaderSession();
  if (session) redirect(next);

  const { t } = await getT();
  const error = sp.error === "invalid" ? t("signIn.errorInvalid") : sp.error === "send" ? t("signIn.errorSend") : sp.error === "link" ? t("signIn.errorLink") : null;

  if (sp.sent === "1") {
    return (
      <main className="auth-page wrap">
        <section className="card auth-card" aria-live="polite">
          <p className="eyebrow">{brand.name}</p>
          <h1>{t("signIn.sentTitle")}</h1>
          <p>{t("signIn.sentLead")}</p>
          <p>
            <a href={`/sign-in?next=${encodeURIComponent(next)}`}>{t("signIn.again")}</a>
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-page wrap">
      <section className="card auth-card">
        <p className="eyebrow">{brand.name}</p>
        <h1>{t("signIn.title")}</h1>
        <p>{t("signIn.lead")}</p>
        <form action={requestMagicLink} noValidate>
          <input type="hidden" name="next" value={next} />
          <label htmlFor="email">{t("signIn.email")}</label>
          <input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            spellCheck={false}
            required
            maxLength={254}
            aria-describedby={error ? "sign-in-error" : undefined}
            aria-invalid={error ? true : undefined}
          />
          {error ? (
            <p id="sign-in-error" className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="btn">
            {t("signIn.submit")}
          </button>
        </form>
        <p className="muted small">{t("signIn.privacy")}</p>
      </section>
    </main>
  );
}
