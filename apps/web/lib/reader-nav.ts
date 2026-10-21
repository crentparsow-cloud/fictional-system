/**
 * The desktop sidebar for signed-in readers. Pure, so the order and the
 * rules can be tested. The top group is the main reader destinations. The
 * bottom group is Settings, Help and Sign out (sign out is a form, not a
 * link, so it is drawn by the component and not listed here).
 */
export type SideIcon = "today" | "explore" | "workbooks" | "highlights" | "studio" | "settings" | "help" | "signout";

export interface SideItem {
  href: string;
  /** Key in messages/en-GB.json. */
  labelKey: "nav.today" | "nav.explore" | "nav.myWorkbooks" | "nav.highlights" | "nav.studio" | "nav.settings" | "nav.help";
  icon: SideIcon;
}

export function sidebarGroups(opts: { author: boolean }): { main: SideItem[]; more: SideItem[] } {
  const main: SideItem[] = [
    { href: "/today", labelKey: "nav.today", icon: "today" },
    { href: "/explore", labelKey: "nav.explore", icon: "explore" },
    { href: "/my-workbooks", labelKey: "nav.myWorkbooks", icon: "workbooks" },
    { href: "/you/highlights", labelKey: "nav.highlights", icon: "highlights" },
  ];
  if (opts.author) main.push({ href: "/studio", labelKey: "nav.studio", icon: "studio" });
  const more: SideItem[] = [
    { href: "/you", labelKey: "nav.settings", icon: "settings" },
    { href: "/help", labelKey: "nav.help", icon: "help" },
  ];
  return { main, more };
}

/**
 * Which item is current. The longest matching href wins, so /you/highlights
 * lights Highlights and not Settings (/you).
 */
export function currentHref(pathname: string, items: readonly { href: string }[]): string | null {
  let best: string | null = null;
  for (const { href } of items) {
    if ((pathname === href || pathname.startsWith(`${href}/`)) && (best === null || href.length > best.length)) best = href;
  }
  return best;
}
