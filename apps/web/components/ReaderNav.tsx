"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; icon: "home" | "today" | "toolkit" | "library" | "you" };

/**
 * The five-tab reader nav (F-014). Links, not buttons, so it works with the
 * keyboard and the back button. aria-current marks the open tab. Each target
 * is at least 44px tall and wide.
 */
export function ReaderNav({ items, label }: { items: NavItem[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav className="reader-nav" aria-label={label}>
      <ul>
        {items.map((item) => {
          const current = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link href={item.href} aria-current={current ? "page" : undefined}>
                <Icon name={item.icon} />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Icon({ name }: { name: NavItem["icon"] }) {
  const common = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M5.5 10.5V20h13v-9.5" />
        </svg>
      );
    case "today":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2" />
        </svg>
      );
    case "toolkit":
      return (
        <svg {...common}>
          <rect x="3.5" y="7.5" width="17" height="12" rx="2" />
          <path d="M8.5 7.5V5.5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v2" />
        </svg>
      );
    case "library":
      return (
        <svg {...common}>
          <path d="M4.5 4.5h4v15h-4zM10.5 4.5h4v15h-4z" />
          <path d="m15.8 5.2 3.7-.8 3 14.6-3.7.8z" />
        </svg>
      );
    case "you":
      return (
        <svg {...common}>
          <circle cx="12" cy="8.5" r="3.5" />
          <path d="M5 20a7 7 0 0 1 14 0" />
        </svg>
      );
  }
}
