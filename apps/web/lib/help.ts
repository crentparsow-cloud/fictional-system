import { readFileSync } from "node:fs";
import path from "node:path";
import { firstHeading, firstParagraph, markdownToHtml } from "@/lib/markdown";

/**
 * The help centre (F-010). Static pages from content/help/<slug>.md, read at
 * build time. The order here is the order on the index page.
 */
export const HELP_TOPICS = ["account", "membership", "cancelling", "refunds", "privacy", "help-now", "check-in-partner", "organisations", "groups", "appearance"] as const;
export type HelpTopic = (typeof HELP_TOPICS)[number];

export function isHelpTopic(value: string): value is HelpTopic {
  return (HELP_TOPICS as readonly string[]).includes(value);
}

// apps/web is two levels below the repo root, where content/help lives.
const HELP_DIR = path.join(process.cwd(), "..", "..", "content", "help");

export interface HelpPage {
  slug: HelpTopic;
  title: string;
  summary: string;
  html: string;
}

export function readHelpMarkdown(slug: HelpTopic, dir: string = HELP_DIR): string {
  return readFileSync(path.join(dir, `${slug}.md`), "utf8");
}

/** Builds a page from its Markdown. The first heading is the title and is not repeated in the body. */
export function helpPageFrom(slug: HelpTopic, md: string): HelpPage {
  const title = firstHeading(md) ?? slug;
  const body = md.replace(/^#\s+.+\r?\n/m, "");
  return { slug, title, summary: firstParagraph(body) ?? "", html: markdownToHtml(body) };
}

export function getHelpPage(slug: HelpTopic, dir?: string): HelpPage {
  return helpPageFrom(slug, readHelpMarkdown(slug, dir));
}

export function listHelpPages(dir?: string): HelpPage[] {
  return HELP_TOPICS.map((slug) => getHelpPage(slug, dir));
}

/** How to reach support: EMAIL_REPLY_TO when set, otherwise a visible placeholder. */
export function supportContact(env: Record<string, string | undefined> = process.env): { email: string | null; label: string } {
  const raw = env.EMAIL_REPLY_TO?.trim() ?? "";
  // Accept "Name <address>" as well as a bare address.
  const email = (/<([^<>]+)>/.exec(raw)?.[1] ?? raw).trim();
  if (email && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email)) return { email, label: email };
  return { email: null, label: "[support email]" };
}
