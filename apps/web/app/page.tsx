import type { Metadata } from "next";
import { EditorialSlot } from "@/components/explore/EditorialSlot";
import { HomeView } from "@/components/home/HomeView";
import { buildHomeSections } from "@/components/home/sections";
import { listThemes } from "@/lib/author-theme-queries";
import { brand } from "@/lib/brand";
import { listLibrary, type LibraryCard } from "@/lib/catalogue";
import { loadEditorialSlot } from "@/lib/editorial-queries";
import { getT } from "@/lib/i18n";
import { publicRobots } from "@/lib/indexing";
import { hiddenThemeIds } from "@/lib/theme-visibility";

/**
 * The marketing home (F-002). Server rendered per request, because the
 * library row reads live workbooks for this host's tenant through RLS. If
 * the catalogue cannot be read, the page still renders with the empty
 * library state rather than failing the front door.
 */
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return { alternates: { canonical: "/" }, robots: publicRobots() };
}

async function homeCards(): Promise<LibraryCard[]> {
  try {
    return await listLibrary({});
  } catch (err) {
    console.error("home: library read failed", err instanceof Error ? err.message : err);
    return [];
  }
}

export default async function Home() {
  const [cards, { t }] = await Promise.all([homeCards(), getT()]);
  const sections = buildHomeSections({
    brandName: brand.name,
    line: brand.line,
    wellnessNotice: brand.wellnessNotice,
    cards,
  });
  // 7.10: the weekly editorial slot. A Theme slot needs the Theme list; a failed read just hides it.
  const themes = await listThemes().catch(() => []);
  const hidden = hiddenThemeIds(themes, cards);
  const slot = await loadEditorialSlot(
    cards,
    themes.filter((th) => !th.retired && !hidden.has(th.id)).map((th) => ({ id: th.id, name: th.name })),
  );
  const outlineOnly = t("library.outlineOnly");
  const open = t("library.open");
  return (
    <HomeView
      s={sections}
      outlineOnlyLabel={outlineOnly}
      openLabel={open}
      editorial={slot ? <EditorialSlot slot={slot} outlineOnlyLabel={outlineOnly} openLabel={open} /> : null}
    />
  );
}
