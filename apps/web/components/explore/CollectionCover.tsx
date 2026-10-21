import { buildPatternCover, collectionPanelClip } from "@/lib/covers";

/**
 * A collection's cover, from the cover pattern system (lib/covers.ts): the
 * genre's tint and accent with a pattern. Pattern only, no title on it, so
 * the name beside it is the one place the words live. Markup is built from
 * fixed values, never from reader input.
 */
export function CollectionCover({ slug, genreId, pattern, alt, className }: { slug: string; genreId: string; pattern: string | null; alt: string; className?: string }) {
  const clipId = `cc-${slug.replace(/[^a-z0-9-]/g, "")}`;
  const inner = `<defs>${collectionPanelClip(clipId)}</defs>${buildPatternCover(genreId, pattern, clipId)}`;
  return (
    <svg
      className={className ? `collection-cover ${className}` : "collection-cover"}
      viewBox="0 0 600 420"
      role="img"
      aria-label={alt}
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
}
