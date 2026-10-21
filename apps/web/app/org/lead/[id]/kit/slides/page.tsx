import type { Metadata } from "next";
import Link from "next/link";
import { welcomeSlides } from "@/lib/group-kit";
import { groupKitSource, requireGroupLeader } from "@/lib/org-groups-server";

export const metadata: Metadata = { title: "Welcome slides", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

/** Welcome slides, one per printed page. They hold no names, no counts and nothing a member wrote. */
export default async function SlidesPage({ params }: { params: Params }) {
  const { id } = await params;
  const { view } = await requireGroupLeader(id, `/org/lead/${id}/kit/slides`);
  const kit = await groupKitSource(view.group_id);
  const slides = kit ? welcomeSlides(kit, view.group_name) : [];

  return (
    <div className="admin-page group-guide-print group-slides">
      <p className="group-print-hide">
        <Link href={`/org/lead/${view.group_id}/kit`}>Back to the leader kit</Link>
      </p>
      <h1 className="group-print-hide">Welcome slides</h1>
      <p className="group-print-hide muted">Print these, or save them as a PDF from the print window. One slide to a page.</p>
      {slides.length === 0 ? (
        <p className="muted">The slides are not ready for this workbook yet.</p>
      ) : (
        slides.map((s, i) => (
          <section key={i} className="group-slide card" aria-labelledby={`slide-${i}`}>
            <h2 id={`slide-${i}`}>{s.title}</h2>
            <ul>
              {s.lines.map((l, j) => (
                <li key={j}>{l}</li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
