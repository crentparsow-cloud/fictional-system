import { notFound, permanentRedirect } from "next/navigation";
import { isSlug } from "@/lib/author-theme-pages";

/**
 * The short Theme link from the feature list (F-007: /t/{slug}). Emails may
 * use it, so it stays working and sends readers to the Theme page.
 */
export default async function ShortThemeLink({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isSlug(slug)) notFound();
  permanentRedirect(`/themes/${slug}`);
}
