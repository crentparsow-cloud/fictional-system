import { snapCoverWidth } from "@/lib/cache-headers";
import { coverAlt } from "@/lib/covers";
import { COVER_UNITS, snapPngWidth } from "@/lib/design/cover-spec";

/**
 * A workbook cover (F-117). Points at the format-coded PNG at /covers/<code>.png (plan 1.2), 3:4, drawn by the
 * shared Satori renderer in the active design direction at twice the card width.
 * Width and height are set so the page does not shift while it loads; the
 * default keeps the 2:3 shape at card size.
 */
export function Cover({
  code,
  title,
  author,
  width = 160,
  className,
  priority = false,
}: {
  code: string;
  title: string;
  author?: string | null;
  width?: number;
  className?: string;
  priority?: boolean;
}) {
  // 10.2: one short list of sizes, so a raster cover would make few transformations.
  const w = snapCoverWidth(width);
  const height = Math.round((w * COVER_UNITS.h) / COVER_UNITS.w);
  const source = snapPngWidth(w * 2);
  return (
    // A generated PNG at one of four cached sizes; next/image would only add a second cache.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={className ? `cover ${className}` : "cover"}
      src={`/covers/${encodeURIComponent(code)}.png?w=${source}`}
      width={w}
      height={height}
      alt={coverAlt(title, author)}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
    />
  );
}
