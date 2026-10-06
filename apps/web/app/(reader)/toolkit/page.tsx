import type { Metadata } from "next";
import { getT } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("nav.toolkit") };
}

export default async function ToolkitPage() {
  const { t } = await getT();
  return (
    <section className="tab-page">
      <h1>{t("nav.toolkit")}</h1>
      <p className="muted">{t("toolkit.line")}</p>
    </section>
  );
}
