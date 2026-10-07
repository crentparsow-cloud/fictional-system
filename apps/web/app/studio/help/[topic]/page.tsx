import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { supportContact } from "@/lib/help";
import { STUDIO_HELP_TOPICS, getStudioHelpPage, isStudioHelpTopic } from "@/lib/studio-help";

/** One author help page (F-044), rendered at build time from content/studio-help/<topic>.md. */
export const dynamicParams = false;
export const dynamic = "force-static";

type Params = { topic: string };

export function generateStaticParams(): Params[] {
  return STUDIO_HELP_TOPICS.map((topic) => ({ topic }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { topic } = await params;
  if (!isStudioHelpTopic(topic)) return { title: "Help for authors" };
  const page = getStudioHelpPage(topic);
  return { title: `${page.title} | Help for authors`, description: page.summary, robots: { index: false, follow: false } };
}

export default async function StudioHelpTopicPage({ params }: { params: Promise<Params> }) {
  const { topic } = await params;
  if (!isStudioHelpTopic(topic)) notFound();
  const page = getStudioHelpPage(topic);
  const support = supportContact();
  return (
    <div className="admin-page studio-page info-page">
      <p className="admin-back">
        <Link href="/studio/help">Help for authors</Link>
      </p>
      <h1>{page.title}</h1>
      <article className="legal-doc" dangerouslySetInnerHTML={{ __html: page.html }} />
      <section className="info-section" aria-labelledby="sht-contact">
        <h2 id="sht-contact">Still have a question?</h2>
        <p>Email {support.email ? <a href={`mailto:${support.email}`}>{support.label}</a> : <span>{support.label}</span>}.</p>
      </section>
    </div>
  );
}
