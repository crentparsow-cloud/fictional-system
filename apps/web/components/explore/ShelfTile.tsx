import Link from "next/link";
import { shelfStyle, SHELF_ICON_PATHS } from "@/lib/shelves";

/**
 * One shelf tile: colour, icon, name, one line and the count of live titles.
 * Colour and icon come from lib/shelves.ts through CSS custom properties, so
 * a re-skin edits that file and the .shelf-tile rules, not this component.
 */
export function ShelfIcon({ shelfId, size = 28 }: { shelfId: string; size?: number }) {
  const paths = SHELF_ICON_PATHS[shelfStyle(shelfId).icon];
  return (
    <svg className="shelf-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

export function shelfStyleVars(shelfId: string): React.CSSProperties {
  const s = shelfStyle(shelfId);
  return { "--shelf-tint": s.tint, "--shelf-accent": s.accent } as React.CSSProperties;
}

export function ShelfTile({ id, name, line, countLabel }: { id: string; name: string; line: string | null; countLabel: string }) {
  return (
    <Link className="shelf-tile" href={`/shelves/${id}`} style={shelfStyleVars(id)}>
      <ShelfIcon shelfId={id} />
      <span className="shelf-tile-name">{name}</span>
      {line ? <span className="shelf-tile-line">{line}</span> : null}
      <span className="shelf-tile-count">{countLabel}</span>
    </Link>
  );
}
