import type { Metadata } from "next";
import { getT } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("nav.library") };
}

export default async function LibraryPage() {
  const { t } = await getT();
  return (
    <section className="tab-page">
      <h1>{t("nav.library")}</h1>
      <p className="muted">{t("library.line")}</p>
    </section>
  );
}
