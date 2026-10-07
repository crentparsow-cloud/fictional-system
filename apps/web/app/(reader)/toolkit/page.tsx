import type { Metadata } from "next";
import Link from "next/link";
import "@akana/engine/engine.css";
import type { ToolkitCard } from "@akana/engine";
import { HelpNowButton } from "@/components/HelpNowButton";
import { NeedSupportFooter } from "@/components/NeedSupportFooter";
import { ToolkitTab, type ToolkitGroup } from "@/components/toolkit/ToolkitTab";
import { getReaderSession } from "@/lib/auth";
import { myEnrolments } from "@/lib/catalogue";
import { anyWellbeing } from "@/lib/continue-cards";
import { getT } from "@/lib/i18n";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Toolkit (F-015 parity): the short tools from every open workbook, in one
 * place, as the legacy Toolkit tab had for its one workbook. The toolkit
 * section is free before purchase (0008), and it is read through the
 * reader's own client, pinned to the version each enrolment holds.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("nav.toolkit") };
}

export default async function ToolkitPage() {
  const { t } = await getT();
  const session = await getReaderSession();
  const cards = session ? await myEnrolments(session.userId) : [];
  const wellbeing = anyWellbeing(cards);

  let groups: ToolkitGroup[] = [];
  if (cards.length) {
    const supabase = await createUserClient();
    const { data: rows } = await supabase
      .from("enrolments")
      .select("id, version_id")
      .in("id", cards.map((c) => c.enrolmentId));
    const versionOf = new Map(((rows ?? []) as { id: string; version_id: string }[]).map((r) => [r.id, r.version_id]));
    const versionIds = [...new Set(versionOf.values())];
    const { data: sections } = versionIds.length
      ? await supabase.from("workbook_sections").select("version_id, body").in("version_id", versionIds).eq("kind", "toolkit")
      : { data: [] };
    const toolsOf = new Map<string, ToolkitCard[]>();
    for (const s of (sections ?? []) as { version_id: string; body: { cards?: unknown } }[]) {
      const list = Array.isArray(s.body?.cards) ? (s.body.cards as ToolkitCard[]) : [];
      toolsOf.set(s.version_id, list);
    }
    groups = cards
      .map((c) => ({ enrolmentId: c.enrolmentId, title: c.shortTitle ?? c.title, slug: c.slug, cards: toolsOf.get(versionOf.get(c.enrolmentId) ?? "") ?? [] }))
      .filter((g) => g.cards.length > 0);
  }

  return (
    <section className="tab-page">
      <div className="page-head">
        <h1>{t("nav.toolkit")}</h1>
        {wellbeing ? <HelpNowButton label={t("help.now")} /> : null}
      </div>
      <p className="muted">{t("toolkit.line")}</p>
      {groups.length ? (
        <ToolkitTab groups={groups} />
      ) : (
        <div className="card empty-state">
          <p>Your tools appear here once you open a workbook that has them.</p>
          <Link className="btn" href="/library">
            {t("home.browse")}
          </Link>
        </div>
      )}
      {!wellbeing ? <NeedSupportFooter label={t("help.needSupport")} /> : null}
    </section>
  );
}
