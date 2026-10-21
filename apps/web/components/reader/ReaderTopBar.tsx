import Link from "next/link";
import { brand } from "@/lib/brand";

/**
 * The slim top bar for screens that sit outside the public header and
 * footer (reader tabs, reading view, sign-in and welcome). The name on the
 * left goes home; an optional quiet link sits on the right. Layout only.
 */
export function ReaderTopBar({ homeHref = "/", link }: { homeHref?: string; link?: { href: string; label: string } }) {
  return (
    <header className="c-topbar">
      <div className="c-topbar-in">
        <Link href={homeHref} className="c-topbar-brand">
          {brand.name}
        </Link>
        {link ? (
          <Link href={link.href} className="c-topbar-link">
            {link.label}
          </Link>
        ) : null}
      </div>
    </header>
  );
}
