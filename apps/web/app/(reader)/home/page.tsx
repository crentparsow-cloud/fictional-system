import type { Metadata } from "next";
import { getT } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("nav.home") };
}

export default async function HomePage() {
  const { t } = await getT();
  return (
    <section className="tab-page">
      <h1>{t("nav.home")}</h1>
      <p className="muted">{t("home.line")}</p>
    </section>
  );
}
