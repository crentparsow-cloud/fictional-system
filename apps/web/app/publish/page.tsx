import type { Metadata } from "next";
import { brand } from "@/lib/brand";

export const metadata: Metadata = { title: "Publish with Akana" };

/**
 * F-001 placeholder. The enquiry form, leads table and email to Crent land on
 * Thursday 8 October. Process only. No revenue figures until Crent sets them.
 */
export default function PublishPage() {
  return (
    <main className="wrap" style={{ paddingBlock: "2.5rem" }}>
      <h1>Publish with {brand.name}</h1>
      <p>
        {brand.name} turns a published book into an interactive workbook that readers work through a week at a time.
        You keep your rights. We build, review and host the workbook, sell it under licence, and pay you a share of net
        receipts every month.
      </p>
      <h2>Three ways to work with us</h2>
      <div className="grid">
        <div className="card">
          <strong>Marketplace listing</strong>
          <p className="muted">Your workbook sits in the {brand.name} library beside other authors. Readers buy it or read it through membership.</p>
        </div>
        <div className="card">
          <strong>Built for you</strong>
          <p className="muted">Send the manuscript. Our editors build the workbook in our format, you review and sign off.</p>
        </div>
        <div className="card">
          <strong>Your own branded site</strong>
          <p className="muted">A white-label site for publishers who want their list under their own name. Talk to us.</p>
        </div>
      </div>
      <p className="muted" style={{ marginBlockStart: "2rem" }}>
        The enquiry form opens this week. Until then, please check back on Thursday.
      </p>
    </main>
  );
}
