import type { Metadata } from "next";
import Link from "next/link";
import { HelpNowButton } from "@/components/HelpNowButton";
import { DHero } from "@/components/info/DHero";
import { company, support } from "@/lib/company";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = { title: "Contact us" };

/**
 * Contact (F-090). Messages land in /admin/support. The first thing on the
 * page says Akana is not a crisis service, with Help now beside it. Copy is a
 * draft for Crent; the reply time is a placeholder until he sets it.
 */
export default function ContactPage() {
  const contact = support();
  return (
    <main className="d-page">
      <DHero
        title="Contact us"
        lead={`Write to us and a real person will reply. We aim to answer within ${company.replyTime}.`}
      />
      <div className="wrap contact-page d-formpage">
      <section className="d-card contact-crisis d-crisis" aria-labelledby="crisis-h">
        <h2 id="crisis-h">We are not a crisis service</h2>
        <p>
          We read messages in working hours and cannot reply straight away. If you or someone else is in danger now, call 999 in the UK, or your local emergency
          number.
        </p>
        <p>
          <HelpNowButton />
        </p>
      </section>

      <p>
        Questions about a payment, getting into your account, deleting your data or an author payment all come to the same small team. You can also delete your
        account yourself from the <Link href="/you">You</Link> page.
      </p>

      <ContactForm />
      <p className="d-soft small">
        Prefer email? Write to {contact.email ? <a href={`mailto:${contact.email}`}>{contact.label}</a> : <span>{contact.label}</span>}.
      </p>
      </div>
    </main>
  );
}
