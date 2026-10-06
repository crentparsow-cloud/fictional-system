import type { Metadata } from "next";
import { signOut } from "@/app/(auth)/sign-out/action";
import { getT } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("nav.you") };
}

export default async function YouPage() {
  const { t } = await getT();
  return (
    <section className="tab-page">
      <h1>{t("nav.you")}</h1>
      <p className="muted">{t("you.line")}</p>
      <form action={signOut}>
        <button type="submit" className="btn secondary">
          {t("you.signOut")}
        </button>
      </form>
    </section>
  );
}
