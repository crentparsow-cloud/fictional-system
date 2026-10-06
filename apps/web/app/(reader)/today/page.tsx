import type { Metadata } from "next";
import { getT } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("nav.today") };
}

export default async function TodayPage() {
  const { t } = await getT();
  return (
    <section className="tab-page">
      <h1>{t("nav.today")}</h1>
      <p className="muted">{t("today.line")}</p>
    </section>
  );
}
