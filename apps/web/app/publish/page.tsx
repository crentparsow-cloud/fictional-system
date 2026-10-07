import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/lib/brand";
import { EnquiryForm } from "./enquiry-form";

export const metadata: Metadata = { title: `Publish with ${brand.name}` };

/**
 * F-001. Copy is the draft in docs/legal/publish-with-akana-copy.md, for
 * Crent to approve on Thursday 8 October. Process only. No revenue figures,
 * rates or prices until Crent sets them. The enquiry form posts to the
 * submitEnquiry server action: one row in public.leads through
 * public.submit_lead, then an email to the Akana team.
 */

const STEPS: { title: string; body: string }[] = [
  {
    title: "Enquire",
    body: "Tell us about the book. We reply within [enquiry response time] and say honestly whether it suits the format.",
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
    body: `The workbook goes into the ${brand.name} library. Readers buy it or read it through membership. You get a monthly statement and a monthly payment, with exact figures for your records.`,
  },
];

const DOES = [
  "Builds the workbook in a tested format, with a validator that checks structure, house style and claims",
  "Hosts it, keeps it working and keeps it up to date",
  "Sells it, handles payment, tax and refunds, and pays you from net receipts",
  "Shows readers Help now on every screen of a wellbeing workbook",
  `Seals readers' answers so that nobody, including ${brand.name}, can read them`,
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
  "Reader answers are sealed before they reach the database and only the reader can unseal them.",
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
    a: `Nothing up front. ${brand.name} is paid from the workbook's receipts. The share is set out in the licence.`,
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
    a: "No. Nobody can. Answers are sealed so that only the reader can read them. You see counts of readers and completions, with small numbers suppressed.",
  },
  {
    q: "What happens if I want to leave?",
    a: "The licence sets out the notice period. Readers who already bought the workbook keep access to the version they bought.",
  },
];

export default function PublishPage() {
  return (
    <main>
      <section className="hero">
        <div className="wrap">
          <p className="eyebrow">For authors and publishers</p>
          <h1>Turn your book into a workbook readers finish</h1>
          <p>
            {brand.name} builds interactive guided workbooks from published books. Readers work through your ideas a
            week at a time, do the exercises and keep their answers. You keep your rights. We build, review, host and
            sell the workbook under licence, and pay you a share of what it earns every month.
          </p>
          <p>
            <a className="btn secondary" href="#enquiry" style={{ borderColor: "currentColor", color: "inherit" }}>
              Start an enquiry
            </a>
          </p>
        </div>
      </section>

      <div className="wrap" style={{ paddingBlock: "2.5rem" }}>
        <h2>Who it is for</h2>
        <div className="grid">
          <div className="card">
            <strong>Authors</strong>
            <p className="muted" style={{ marginBlockStart: "0.4rem", marginBlockEnd: 0 }}>
              With a published non-fiction book that teaches something: a method, a set of habits, a way of thinking.
              Across the eleven shelves, from wellbeing to life skills.
            </p>
          </div>
          <div className="card">
            <strong>Publishers</strong>
            <p className="muted" style={{ marginBlockStart: "0.4rem", marginBlockEnd: 0 }}>
              With a list of such books, who want a new format without building an app.
            </p>
          </div>
          <div className="card">
            <strong>Publishers who want their own site</strong>
            <p className="muted" style={{ marginBlockStart: "0.4rem", marginBlockEnd: 0 }}>
              Under their own name, built on the same platform. See below.
            </p>
          </div>
        </div>

        <h2 style={{ marginBlockStart: "2.5rem" }}>How it works</h2>
        <ol className="grid" style={{ padding: 0, listStyle: "none", counterReset: "step" }}>
          {STEPS.map((s, i) => (
            <li className="card" key={s.title}>
              <p className="eyebrow muted" style={{ fontSize: "0.85rem", letterSpacing: "0.08em", textTransform: "uppercase", marginBlockEnd: "0.4rem" }}>
                Step {i + 1}
              </p>
              <strong>{s.title}</strong>
              <p className="muted" style={{ marginBlockStart: "0.4rem", marginBlockEnd: 0 }}>{s.body}</p>
            </li>
          ))}
        </ol>

        <div className="grid" style={{ marginBlockStart: "2.5rem" }}>
          <section className="card">
            <h2 style={{ fontSize: "1.25rem" }}>What {brand.name} does</h2>
            <ul style={{ paddingInlineStart: "1.2rem", margin: 0 }}>
              {DOES.map((d) => (
                <li key={d} style={{ marginBlockEnd: "0.4rem" }}>{d}</li>
              ))}
            </ul>
          </section>
          <section className="card">
            <h2 style={{ fontSize: "1.25rem" }}>What {brand.name} does not do</h2>
            <ul style={{ paddingInlineStart: "1.2rem", margin: 0 }}>
              {DOES_NOT.map((d) => (
                <li key={d} style={{ marginBlockEnd: "0.4rem" }}>{d}</li>
              ))}
            </ul>
          </section>
        </div>

        <h2 style={{ marginBlockStart: "2.5rem" }}>House rules the platform enforces</h2>
        <p className="muted">These are built into the code, not just the terms.</p>
        <ul style={{ paddingInlineStart: "1.2rem" }}>
          {RULES.map((r) => (
            <li key={r} style={{ marginBlockEnd: "0.4rem", maxInlineSize: "var(--measure)" }}>{r}</li>
          ))}
        </ul>

        <section className="card" style={{ marginBlockStart: "2.5rem" }}>
          <h2 style={{ fontSize: "1.25rem" }}>Your own branded site</h2>
          <p style={{ marginBlockEnd: 0 }}>
            Publishers can run their list on a site under their own name and domain, built and hosted by {brand.name}.
            Same reader experience, same house rules, your brand. Talk to us.
          </p>
          <p className="small">
            <Link href="/white-label">About branded sites</Link> · <Link href="/pricing">Pricing</Link> ·{" "}
            <Link href="/organisations">{brand.name} for organisations</Link>
          </p>
        </section>

        <section id="enquiry" style={{ marginBlockStart: "2.5rem" }}>
          <h2>Enquiry</h2>
          <EnquiryForm brandName={brand.name} />
        </section>

        <section style={{ marginBlockStart: "2.5rem" }}>
          <h2>Questions authors ask</h2>
          {FAQ.map((f) => (
            <details key={f.q} className="card" style={{ marginBlockEnd: "0.75rem" }}>
              <summary style={{ fontWeight: 600, cursor: "pointer" }}>{f.q}</summary>
              <p className="muted" style={{ marginBlockStart: "0.6rem", marginBlockEnd: 0 }}>{f.a}</p>
            </details>
          ))}
        </section>
      </div>

      <footer className="footer">
        <div className="wrap">
          <p style={{ marginBlockEnd: "0.4rem" }}>{brand.wellnessNotice}</p>
          <p style={{ marginBlockEnd: 0 }}>
            <Link href="/legal/terms">Terms</Link> · <Link href="/legal/privacy">Privacy</Link> ·{" "}
            <Link href="/legal/cookies">Cookies</Link> · <Link href="/legal/refunds">Refunds</Link>
          </p>
        </div>
      </footer>
    </main>
  );
}
