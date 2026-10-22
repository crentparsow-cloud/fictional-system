import type { Metadata } from "next";
import Link from "next/link";
import { InfoFooter } from "@/components/InfoFooter";
import { brand } from "@/lib/brand";
import { company, support } from "@/lib/company";
import { MarketingShot } from "@/components/MarketingShot";
import { shelfStyleVars } from "@/components/explore/ShelfTile";
import { EnquiryForm } from "./enquiry-form";

export const metadata: Metadata = { title: `Publish with ${brand.name}` };

/**
 * F-001. Copy is the draft in docs/legal/publish-with-akana-copy.md. The
 * revenue share figures are approved as draft wording (see proposedRevenueShare
 * in lib/company.ts) and are stated in the pay section. The enquiry form posts to the
 * submitEnquiry server action: one row in public.leads through
 * public.submit_lead, then an email to the Akana team.
 */

const STEPS: { title: string; body: string }[] = [
  {
    title: "Enquire",
    body: "Tell us about the book. We reply by email and say honestly whether it suits the format.",
  },
  {
    title: "Licence",
    body: "We agree a licence for the workbook edition. You keep the copyright and every other right in the book. The licence covers the workbook only.",
  },
  {
    title: "Build and review",
    body: "Our editors turn the book into a workbook in our format. You see every draft, correct anything, and sign off before it goes live. A workbook is never published without the author's approval.",
  },
  {
    title: "Sell and pay",
    body: `The workbook goes into the ${brand.name} library. Readers buy it or read it through membership. You are paid every Friday. A sale is paid on the first Friday after its 14 day refund window ends, and a monthly statement gives the exact figures for your records.`,
  },
];

const DOES = [
  "Builds the workbook in a tested format, with a validator that checks structure, house style and claims",
  "Hosts it, keeps it working and keeps it up to date",
  "Sells it, handles payment, tax and refunds, and pays you from net receipts",
  "Shows readers Help now on every screen of a wellbeing workbook",
  `Keeps readers' answers private to them, so that nobody, including ${brand.name}, can read them`,
  "Gives you a dashboard with counts of readers and completions, with small numbers suppressed to protect reader privacy",
];

const DOES_NOT = [
  "Take any right in your book beyond the workbook licence",
  "Publish anything you have not approved",
  "Show you, or anyone, what a reader writes",
  "Make health, income or outcome claims on your behalf",
  "Run ads or trackers on any page",
  "Charge readers for demo or sample content",
];

const RULES = [
  "Wellbeing workbooks carry no diagnosis, treatment or cure language. The validator blocks claim words before a draft can be submitted.",
  "Business and finance workbooks make no income promises and give no regulated advice.",
  "Every wellbeing workbook has Help now one tap away.",
  "Nothing counts streaks or missed days. Readers are never shamed for a gap.",
  "Emails to readers never name the workbook they are using.",
  "Reader answers are encrypted before they reach the database and are private to the reader. Only the reader can read them.",
  "Readers must be 18 or over.",
  "Demo content is labelled on every surface and cannot be bought.",
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "Do I keep my rights?",
    a: "Yes. The licence covers the workbook edition only. You keep the copyright and every other right in the book.",
  },
  {
    q: "What does it cost me?",
    a: `Nothing. There is no monthly fee and no set-up charge. ${brand.name} only earns when a reader pays, from that payment. We agree the share with you in writing before anything goes live.`,
  },
  {
    q: "How long does a build take?",
    a: "It depends on the book. We give you a timeline after we have read it.",
  },
  {
    q: "Can I write the workbook myself?",
    a: `Not yet. At launch every workbook is built with ${brand.name}'s editors so that the format and the house rules hold. A self-serve builder comes later.`,
  },
  {
    q: "What if my book is about mental health?",
    a: `${brand.name} treats wellbeing workbooks with extra care. They carry no diagnosis or treatment language, Help now is on every screen, and readers give explicit consent before their answers are stored. Your book is not a medical device and your workbook will not be presented as one.`,
  },
  {
    q: "Who sells the workbook?",
    a: `${brand.name} is the seller on the marketplace. We handle payment, tax and refunds. You are paid from net receipts.`,
  },
  {
    q: "Can I see what readers write?",
    a: "No. Nobody can. Answers are private to the reader, so only they can read them. You see counts of readers and completions, with small numbers suppressed.",
  },
  {
    q: "What happens if I want to leave?",
    a: "The licence sets out the notice period. Readers who already bought the workbook keep access to the version they bought.",
  },
];

export default function PublishPage() {
  const contact = support();
  return (
    <main className="d-page">
      <header className="d-hero d-hero-wash">
        <div className="wrap d-hero-grid">
          <div className="d-stack-s">
            <p className="d-eyebrow">Publish with {brand.name}</p>
            <h1>Turn your book into a workbook readers finish</h1>
            <p className="d-lead">
              {brand.name} builds interactive guided workbooks from published books. Readers work through your ideas a week at a time, do the
              exercises and keep their answers. You keep your rights. We build, review, host and sell the workbook under licence.
            </p>
            <p className="d-actions">
              <a className="btn" href="#enquiry">
                Start a conversation
              </a>
              <a className="btn secondary" href="#how">
                See how it works
              </a>
            </p>
          </div>
          <div className="d-shot">
            <MarketingShot name="workbook-phone" alt="What your readers see: the workbook page with its cover, a short description and the path through the weeks." priority />
          </div>
        </div>
      </header>

      <section className="d-section" aria-labelledby="pub-pay">
        <div className="wrap">
          <div className="d-card d-card-roomy d-money">
            <div className="d-stack-s">
              <p className="d-eyebrow">How you are paid</p>
              <h2 id="pub-pay">You keep half of every sale, more when your readers come from you</h2>
            </div>
            <div className="d-stack-s">
              <ul className="d-list">
                <li>
                  <strong>50% of net receipts</strong> on every single sale.
                </li>
                <li>
                  <strong>60% of net receipts</strong> on sales that come through your own link.
                </li>
                <li>
                  <strong>50% of the membership pool</strong>, shared between authors by reading activity.
                </li>
              </ul>
              <p>
                Net receipts means what we receive after tax, payment fees and refunds. You are paid every Friday. A sale is paid on the first
                Friday after its 14 day refund window ends. A monthly statement gives the exact figures for your records.
              </p>
              <p className="d-soft">We agree the share with you in writing before anything goes live.</p>
            </div>
          </div>
          <ul className="d-promises" aria-label="How we work with authors">
            <li style={shelfStyleVars("money")}>
              <strong>No monthly fee</strong>
              <span>Nothing to pay to list a book or keep it live.</span>
            </li>
            <li style={shelfStyleVars("health-and-body")}>
              <strong>You are paid when a reader pays</strong>
              <span>We take our share from a reader&apos;s payment, never from you.</span>
            </li>
            <li style={shelfStyleVars("learning-and-skills")}>
              <strong>Paid every Friday</strong>
              <span>A sale is paid on the first Friday after its 14 day refund window. Balances under £10 carry forward.</span>
            </li>
            <li style={shelfStyleVars("love-and-relationships")}>
              <strong>We answer your readers&apos; questions</strong>
              <span>Support for your readers is ours to handle, not yours.</span>
            </li>
          </ul>
        </div>
      </section>

      <section id="how" className="d-section" aria-labelledby="pub-how">
        <div className="wrap d-stack">
          <h2 id="pub-how">How it works</h2>
          <ol className="d-steps">
            {STEPS.map((s, i) => (
              <li className="d-card" key={s.title}>
                <span className="d-num" aria-hidden="true">
                  {i + 1}
                </span>
                <h3>
                  <span className="d-visually-hidden">Step {i + 1}. </span>
                  {s.title}
                </h3>
                <p className="d-soft">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="d-section d-band" aria-labelledby="pub-for">
        <div className="wrap d-stack">
          <h2 id="pub-for">Who it is for</h2>
          <div className="d-cards">
            <div className="d-card">
              <h3>Authors</h3>
              <p className="d-soft">
                With a published non-fiction book that teaches something: a method, a set of habits, a way of thinking. Across the ten shelves,
                from Mind and Mood to Creativity and Making.
              </p>
            </div>
            <div className="d-card">
              <h3>Publishers</h3>
              <p className="d-soft">With a list of such books, who want a new format without building an app.</p>
            </div>
            <div className="d-card">
              <h3>Publishers who want their own site</h3>
              <p className="d-soft">Under their own name, built on the same platform. See below.</p>
            </div>
          </div>
          <MarketingShot name="explore-desktop" alt="The Explore page on a laptop: ten pastel shelves and rows of workbooks, where readers find your book." />
        </div>
      </section>

      <section className="d-section" aria-label="What we do and do not do">
        <div className="wrap d-cards d-cards-2">
          <section className="d-card d-card-roomy" aria-labelledby="pub-does">
            <h2 id="pub-does">What {brand.name} does</h2>
            <ul className="d-list">
              {DOES.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </section>
          <section className="d-card d-card-roomy" aria-labelledby="pub-doesnot">
            <h2 id="pub-doesnot">What {brand.name} does not do</h2>
            <ul className="d-list">
              {DOES_NOT.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </section>
        </div>
      </section>

      <section className="d-section" aria-labelledby="pub-rules">
        <div className="wrap d-stack-s">
          <h2 id="pub-rules">House rules the platform enforces</h2>
          <p className="d-soft">These are built into the code, not just the terms.</p>
          <ul className="d-list">
            {RULES.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="d-section" aria-labelledby="pub-brand">
        <div className="wrap">
          <div className="d-card d-card-roomy d-stack-s">
            <h2 id="pub-brand">Your own branded site</h2>
            <p>
              Publishers can run their list on a site under their own name and domain, built and hosted by {brand.name}. Same reader experience,
              same house rules, your brand. Talk to us.
            </p>
            <p className="small">
              <Link href="/white-label">About branded sites</Link> · <Link href="/pricing">Pricing</Link> ·{" "}
              <Link href="/organisations">{brand.name} for organisations</Link>
            </p>
          </div>
        </div>
      </section>

      <section id="enquiry" className="d-section d-band" aria-labelledby="pub-enquiry">
        <div className="wrap d-split d-split-top">
          <div className="d-stack-s">
            <h2 id="pub-enquiry">Start a conversation</h2>
            <p className="d-soft">Tell us about your book. We reply within {company.replyTime}.</p>
            <p className="d-soft">
              Prefer to write? Email {contact.email ? <a href={`mailto:${contact.email}`}>{contact.label}</a> : <span>{contact.label}</span>}.
            </p>
            <p className="d-soft">
              Looking to bring {brand.name} to a school, charity or workplace? <Link href="/organisations">Go to organisations</Link>.
            </p>
          </div>
          <div className="d-formwrap">
            <EnquiryForm brandName={brand.name} />
          </div>
        </div>
      </section>

      <section className="d-section" aria-labelledby="pub-faq">
        <div className="wrap d-stack">
          <h2 id="pub-faq">Questions authors ask</h2>
          <div className="d-accordion">
            {FAQ.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p className="d-soft">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <div className="wrap">
        <InfoFooter />
      </div>
    </main>
  );
}
