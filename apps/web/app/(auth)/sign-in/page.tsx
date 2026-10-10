import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requestMagicLink, verifyEmailCode } from "./action";
import { StandaloneNote } from "@/components/auth/StandaloneNote";
import { GoogleSignIn } from "@/components/auth/GoogleSignIn";
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
 * Google One Tap (13.1) sits above the email form while its client id is set.
 */
export default async function SignInPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const next = safeNextPath(sp.next);
  const session = await getReaderSession();
  if (session) redirect(next);

  const { t } = await getT();
  const error = sp.error === "invalid" ? t("signIn.errorInvalid") : sp.error === "send" ? t("signIn.errorSend") : sp.error === "link" ? t("signIn.errorLink") : sp.error === "busy" ? t("signIn.errorBusy") : sp.error === "google" ? t("signIn.errorGoogle") : null;

  if (sp.sent === "1") {
    return (
      <main className="auth-page wrap">
        <section className="card auth-card" aria-live="polite">
          <p className="eyebrow">{brand.name}</p>
          <h1>{t("signIn.sentTitle")}</h1>
          <p>{t("signIn.sentLead")}</p>
          {/* 13.18: a code to type, for the installed app, where the emailed link would open the browser. */}
          <StandaloneNote />
          <form action={verifyEmailCode} noValidate>
            <input type="hidden" name="next" value={next} />
            <h2 className="auth-code-title">{t("signIn.codeTitle")}</h2>
            <p className="muted small">{t("signIn.codeLead")}</p>
            <label htmlFor="code">{t("signIn.codeLabel")}</label>
            <input
              id="code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]*"
              maxLength={12}
              required
              aria-describedby={sp.error === "code" ? "code-error" : undefined}
              aria-invalid={sp.error === "code" ? true : undefined}
            />
            {sp.error === "code" ? (
              <p id="code-error" className="form-error" role="alert">
                {t("signIn.errorCode")}
              </p>
            ) : null}
            <button type="submit" className="btn">
              {t("signIn.codeSubmit")}
            </button>
          </form>
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
        {/* Google One Tap (13.1): renders only while NEXT_PUBLIC_GOOGLE_CLIENT_ID is set. */}
        <GoogleSignIn next={next} label={t("signIn.google")} divider={t("signIn.or")} />
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
