import { ReaderNav, type NavItem } from "@/components/ReaderNav";
import { getT } from "@/lib/i18n";

/**
 * The signed-in app's four tabs (14.1): Today, Explore, My workbooks, You.
 * Used by the reader shell and by Explore, which is public but shows the
 * tabs to a signed-in reader. The read-aloud bar (components/reader/ReadAloud)
 * is fixed just above this bar, so it stays above the tabs while it plays.
 * Studio, console, org and admin have their own navigation and do not use this.
 */
export async function ReaderTabs() {
  const { t } = await getT();
  const items: NavItem[] = [
    { href: "/today", label: t("nav.today"), icon: "today" },
    { href: "/explore", label: t("nav.explore"), icon: "explore" },
    { href: "/my-workbooks", label: t("nav.myWorkbooks"), icon: "workbooks" },
    { href: "/you", label: t("nav.you"), icon: "you" },
  ];
  return <ReaderNav items={items} label={t("nav.label")} />;
}
