import { readFileSync } from "node:fs";
import path from "node:path";
import { firstHeading, firstParagraph, markdownToHtml } from "@/lib/markdown";

/**
 * Author help pages (F-044). Static pages from content/studio-help/<slug>.md,
 * read at build time, in the same shape as the reader help centre (F-010).
 * The order here is the order on the index page.
 */
export const STUDIO_HELP_TOPICS = ["house-rules", "review", "pricing", "payments", "pool", "comments", "statements", "demo-accounts"] as const;
export type StudioHelpTopic = (typeof STUDIO_HELP_TOPICS)[number];

export function isStudioHelpTopic(value: string): value is StudioHelpTopic {
  return (STUDIO_HELP_TOPICS as readonly string[]).includes(value);
}

// apps/web is two levels below the repo root, where content/studio-help lives.
const DIR = path.join(process.cwd(), "..", "..", "content", "studio-help");

export interface StudioHelpPage {
  slug: StudioHelpTopic;
  title: string;
  summary: string;
  html: string;
}

export function studioHelpPageFrom(slug: StudioHelpTopic, md: string): StudioHelpPage {
  const title = firstHeading(md) ?? slug;
  const body = md.replace(/^#\s+.+\r?\n/m, "");
  return { slug, title, summary: firstParagraph(body) ?? "", html: markdownToHtml(body) };
}

export function getStudioHelpPage(slug: StudioHelpTopic, dir: string = DIR): StudioHelpPage {
  return studioHelpPageFrom(slug, readFileSync(path.join(dir, `${slug}.md`), "utf8"));
}

export function listStudioHelpPages(dir?: string): StudioHelpPage[] {
  return STUDIO_HELP_TOPICS.map((slug) => getStudioHelpPage(slug, dir));
}
