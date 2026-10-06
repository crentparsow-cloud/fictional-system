import { coverAlt, COVER_HEIGHT, COVER_WIDTH } from "@/lib/covers";

/**
 * A workbook cover (F-117). Points at the generated SVG at /covers/<code>.
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
  const height = Math.round((width * COVER_HEIGHT) / COVER_WIDTH);
  return (
    // The cover is our own SVG; next/image would need dangerouslyAllowSVG for no gain.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={className ? `cover ${className}` : "cover"}
      src={`/covers/${encodeURIComponent(code)}`}
      width={width}
      height={height}
      alt={coverAlt(title, author)}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
    />
  );
}
