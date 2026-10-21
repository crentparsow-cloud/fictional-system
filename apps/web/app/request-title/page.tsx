import type { Metadata } from "next";
import Link from "next/link";
import { DHero } from "@/components/info/DHero";
import { RequestForm } from "./request-form";

export const metadata: Metadata = {
  title: "Request a title",
  description: "Tell us which book you would like as a guided workbook.",
  alternates: { canonical: "/request-title" },
};

/**
 * Request a title (build list 2.8). Open to anyone. Requests are stored with
 * the title, the author and a short note, and read by the team at
 * /admin/requests. No name or email is asked for. A request does not promise
 * a workbook: rights, an author's agreement and a safety review come first.
 */
export default function RequestTitlePage() {
  return (
    <main className="d-page">
      <DHero
        title="Request a title"
        lead="Is there a book you would like to work through as a guided workbook? Tell us which one. We read every request and use them to decide what to make next."
      />
      <div className="wrap contact-page d-formpage">
      <p className="muted">
        A request does not promise a workbook. We need the right to use the book, and some titles need a safety review first. Looking for something that is
        already here? <Link href="/search">Search the library</Link>.
      </p>
      <RequestForm />
      </div>
    </main>
  );
}
