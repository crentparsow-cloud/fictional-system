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
    <main className="d-page">
      <div className="wrap d-narrow d-topic">
        <nav className="d-crumbs" aria-label="Breadcrumb">
          <Link href="/help">Help centre</Link>
        </nav>
        <h1>{page.title}</h1>
        <div className="d-helprow">
          <HelpNowButton />
          <p className="small d-soft">{brand.name} is not a crisis service. In an emergency, call your local emergency number.</p>
        </div>
        <article className="legal-doc d-prose" dangerouslySetInnerHTML={{ __html: page.html }} />
        <section className="d-card d-after" aria-labelledby="help-contact">
          <h2 id="help-contact">Still need help?</h2>
          <p>
            Email{" "}
            {support.email ? <a href={`mailto:${support.email}`}>{support.label}</a> : <span>{support.label}</span>} from the address on your
            account.
          </p>
        </section>
        <InfoFooter />
      </div>
    </main>
  );
}
