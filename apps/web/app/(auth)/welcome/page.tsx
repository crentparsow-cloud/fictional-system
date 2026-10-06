import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { confirmAdult } from "./action";
import { brand } from "@/lib/brand";
import { getReaderSession, safeNextPath } from "@/lib/auth";
import { getT } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("welcome.title") };
}

type Search = { error?: string; next?: string };

/** Adults-only confirmation (F-127). One checkbox, one button, no topic named. */
export default async function WelcomePage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const next = safeNextPath(sp.next);
  const session = await getReaderSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(`/welcome?next=${next}`)}`);
  if (session.adultConfirmedAt) redirect(next);

  const { t } = await getT();
  const error = sp.error === "required" ? t("welcome.required") : sp.error === "save" ? t("welcome.errorSave") : null;

  return (
    <main className="auth-page wrap">
      <section className="card auth-card">
        <p className="eyebrow">{brand.name}</p>
        <h1>{t("welcome.title")}</h1>
        <p>{t("welcome.lead")}</p>
        <form action={confirmAdult}>
          <input type="hidden" name="next" value={next} />
          <div className="check">
            <input id="adult" name="adult" type="checkbox" value="yes" aria-describedby={error ? "welcome-error" : undefined} />
            <label htmlFor="adult">{t("welcome.confirm")}</label>
          </div>
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
