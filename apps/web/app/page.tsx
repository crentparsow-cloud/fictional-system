import { HomeView } from "@/components/home/HomeView";
import { buildHomeSections } from "@/components/home/sections";
import { brand } from "@/lib/brand";
import { listLibrary, type LibraryCard } from "@/lib/catalogue";
import { getT } from "@/lib/i18n";

/**
 * The marketing home (F-002). Server rendered per request, because the
 * library row reads live workbooks for this host's tenant through RLS. If
 * the catalogue cannot be read, the page still renders with the empty
 * library state rather than failing the front door.
 */
export const dynamic = "force-dynamic";

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
    lineApproved: false,
    cards,
  });
  return <HomeView s={sections} outlineOnlyLabel={t("library.outlineOnly")} openLabel={t("library.open")} />;
}
