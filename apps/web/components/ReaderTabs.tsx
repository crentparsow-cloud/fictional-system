import { ReaderNav, type NavItem } from "@/components/ReaderNav";
import { ReaderSidebar } from "@/components/ReaderSidebar";
import { getReaderSession } from "@/lib/auth";
import { getT } from "@/lib/i18n";
import { sidebarGroups } from "@/lib/reader-nav";
import { getMemberships } from "@/lib/studio-server";

/**
 * The signed-in app's four tabs (14.1): Today, Explore, My workbooks, You.
 * Used by the reader shell and by Explore, which is public but shows the
 * tabs to a signed-in reader. The read-aloud bar (components/reader/ReadAloud)
 * is fixed just above this bar, so it stays above the tabs while it plays.
 * Studio, console, org and admin have their own navigation and do not use this.
 *
 * At wide widths (CSS only, 64rem and up) the tabs give way to a left
 * sidebar with the same destinations plus Highlights, Studio for authors,
 * Settings, Help and Sign out. Both are in the page; only one is shown.
 */
export async function ReaderTabs() {
  const { t } = await getT();
  const items: NavItem[] = [
    { href: "/today", label: t("nav.today"), icon: "today" },
    { href: "/explore", label: t("nav.explore"), icon: "explore" },
    { href: "/my-workbooks", label: t("nav.myWorkbooks"), icon: "workbooks" },
    { href: "/you", label: t("nav.you"), icon: "you" },
  ];
  const session = await getReaderSession();
  const author = session ? (await getMemberships(session.userId)).length > 0 : false;
  const groups = sidebarGroups({ author });
  const link = (i: (typeof groups.main)[number]) => ({ href: i.href, icon: i.icon, label: t(i.labelKey) });
  return (
    <>
      <ReaderNav items={items} label={t("nav.label")} />
      <ReaderSidebar label={t("nav.sidebarLabel")} main={groups.main.map(link)} more={groups.more.map(link)} moreLabel={t("nav.sidebarMore")} signOutLabel={t("you.signOut")} />
    </>
  );
}
