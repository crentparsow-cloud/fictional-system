import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HelpNowButton } from "@/components/HelpNowButton";
import { InfoFooter } from "@/components/InfoFooter";
import { brand } from "@/lib/brand";
import { HELP_TOPICS, getHelpPage, isHelpTopic, supportContact } from "@/lib/help";

/**
 * One help page (F-010), rendered at build time from content/help/<topic>.md.
 * Every page carries Help now and the not-a-crisis-service line.
 */
export const dynamicParams = false;
export const dynamic = "force-static";

type Params = { topic: string };

export function generateStaticParams(): Params[] {
  return HELP_TOPICS.map((topic) => ({ topic }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { topic } = await params;
  if (!isHelpTopic(topic)) return { title: "Help" };
  const page = getHelpPage(topic);
  return { title: `${page.title} | Help`, description: page.summary, alternates: { canonical: `/help/${topic}` } };
}

export default async function HelpTopicPage({ params }: { params: Promise<Params> }) {
  const { topic } = await params;
  if (!isHelpTopic(topic)) notFound();
  const page = getHelpPage(topic);
  const support = supportContact();
  return (
    <main className="wrap info-page">
      <nav className="wb-crumbs" aria-label="Breadcrumb">
        <Link href="/help">Help centre</Link>
      </nav>
      <div className="info-help-row">
        <HelpNowButton />
        <p className="small muted">{brand.name} is not a crisis service. In an emergency, call your local emergency number.</p>
      </div>
      <h1>{page.title}</h1>
      <article className="legal-doc" dangerouslySetInnerHTML={{ __html: page.html }} />
      <section className="info-section" aria-labelledby="help-contact">
        <h2 id="help-contact">Still need help?</h2>
        <p>
          Email{" "}
          {support.email ? <a href={`mailto:${support.email}`}>{support.label}</a> : <span>{support.label}</span>} from the address on your
          account.
        </p>
      </section>
      <InfoFooter />
    </main>
  );
}
