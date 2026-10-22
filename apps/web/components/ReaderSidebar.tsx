"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@/components/SignOutButton";
import { currentHref, type SideIcon, type SideItem } from "@/lib/reader-nav";

export type SideLink = Pick<SideItem, "href" | "icon"> & { label: string };

/**
 * The desktop sidebar (wide screens only; narrower screens keep the bottom
 * tabs). A real nav landmark with links, so the keyboard and screen readers
 * work as for the tabs. The open page is marked with aria-current and drawn
 * with a left accent bar and accent text. Icons are decorative.
 */
export function ReaderSidebar({ label, main, more, moreLabel, signOutLabel }: { label: string; main: SideLink[]; more: SideLink[]; moreLabel: string; signOutLabel: string }) {
  const pathname = usePathname();
  const current = currentHref(pathname, [...main, ...more]);
  const list = (items: SideLink[]) =>
    items.map((item) => (
      <li key={item.href}>
        <Link href={item.href} aria-current={item.href === current ? "page" : undefined}>
          <Icon name={item.icon} />
          <span>{item.label}</span>
        </Link>
      </li>
    ));
  return (
    <aside className="reader-side">
      <nav aria-label={label}>
        <ul>{list(main)}</ul>
      </nav>
      <nav className="reader-side-more" aria-label={moreLabel}>
        <ul>
          {list(more)}
          <li className="reader-side-signout">
            <Icon name="signout" />
            <SignOutButton label={signOutLabel} className="reader-side-btn" />
          </li>
        </ul>
      </nav>
    </aside>
  );
}

function Icon({ name }: { name: SideIcon }) {
  const common = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, focusable: false };
  switch (name) {
    case "today":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2" />
        </svg>
      );
    case "explore":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="m15.5 8.5-2 5-5 2 2-5z" />
        </svg>
      );
    case "workbooks":
      return (
        <svg {...common}>
          <path d="M4.5 4.5h4v15h-4zM10.5 4.5h4v15h-4z" />
          <path d="m15.8 5.2 3.7-.8 3 14.6-3.7.8z" />
        </svg>
      );
    case "highlights":
      return (
        <svg {...common}>
          <path d="m5 19 1-4 9-9 3 3-9 9z" />
          <path d="M4 21h16" />
        </svg>
      );
    case "studio":
      return (
        <svg {...common}>
          <path d="M4 20h16M6 20V9l6-4 6 4v11" />
          <path d="M10 20v-5h4v5" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common}>
          <circle cx="12" cy="8.5" r="3.5" />
          <path d="M5 20a7 7 0 0 1 14 0" />
        </svg>
      );
    case "help":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M9.6 9.5a2.5 2.5 0 0 1 4.8.9c0 1.6-2.4 1.9-2.4 3.4M12 16.8v.2" />
        </svg>
      );
    case "signout":
      return (
        <svg {...common}>
          <path d="M10 4.5H5.5v15H10M14 8l4 4-4 4M18 12H9" />
        </svg>
      );
  }
}
