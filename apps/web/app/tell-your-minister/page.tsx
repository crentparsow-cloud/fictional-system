import type { Metadata } from "next";
import Link from "next/link";
import { InfoFooter } from "@/components/InfoFooter";
import { TRY_DEMO_SLUG } from "@/components/home/sections";
import { brand } from "@/lib/brand";
import { publicRobots } from "@/lib/indexing";
import { ministerEmail, ministerMailto } from "@/lib/minister";
import { siteOrigin } from "@/lib/site-url";

/**
 * "Tell your minister" (14.34). A reader who thinks their church would
 * benefit sends the note themselves: the button opens their own email app
 * with a draft, and the same words sit below to copy. Akana sends nothing,
 * stores nothing and asks for no address. The demo link is a sample first
 * unit that needs no sign-up.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tell your minister",
  description: `A short note you can send to your minister about ${brand.name}, with a sample they can try without signing up.`,
  alternates: { canonical: "/tell-your-minister" },
  robots: publicRobots(),
};

export default function TellYourMinisterPage() {
  const origin = siteOrigin();
  const demoPath = `/try/${TRY_DEMO_SLUG}`;
  const email = ministerEmail({ origin, demoPath });

  return (
    <main className="wrap info-page">
      <header className="info-head">
        <p className="eyebrow muted">{brand.name} for churches</p>
        <h1>Tell your minister</h1>
        <p className="info-lead">If you think your church or group could use {brand.name}, a short note from you will go further than an advert. This is one you can send yourself.</p>
      </header>

      <section className="info-section" aria-labelledby="tym-how">
        <h2 id="tym-how">How it works</h2>
        <ol>
          <li>Press the button. Your own email app opens with a draft.</li>
          <li>Add your minister&apos;s email address and fill in the square brackets.</li>
          <li>Change anything you like, then send it.</li>
        </ol>
        <p>
          You send it from your own account. {brand.name} does not send it, does not see it and does not keep a copy. We do not ask for anyone&apos;s email address on this page.
        </p>
        <p>
          <a className="btn" href={ministerMailto(email)}>
            Open the draft in my email app
          </a>
        </p>
      </section>

      <section className="info-section" aria-labelledby="tym-text">
        <h2 id="tym-text">The draft</h2>
        <p className="muted">If the button does nothing on your device, copy the words from here.</p>
        <p>
          <strong>Subject:</strong> {email.subject}
        </p>
        <label htmlFor="tym-body" className="small muted">
          Message
        </label>
        <textarea id="tym-body" readOnly rows={16} defaultValue={email.body} style={{ width: "100%" }} />
      </section>

      <section className="info-section" aria-labelledby="tym-demo">
        <h2 id="tym-demo">A sample to show them</h2>
        <p>
          Your minister can try the first unit of a sample workbook with no sign-up. The link is in the draft, and here it is again.
        </p>
        <p>
          <Link className="btn secondary" href={demoPath}>
            Try the sample
          </Link>{" "}
          <Link className="btn secondary" href="/organisations">
            Plans for churches and groups
          </Link>
        </p>
      </section>
      <InfoFooter />
    </main>
  );
}
