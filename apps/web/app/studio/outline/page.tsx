import type { Metadata } from "next";
import Link from "next/link";
import { OutlineGenerator } from "@/components/studio/OutlineGenerator";
import { OrgSwitcher } from "@/components/studio/StudioBits";
import { requireStudio } from "@/lib/studio-server";

export const metadata: Metadata = { title: "Outline generator", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;

/**
 * The outline generator (build list 14.31). Five questions give a unit
 * skeleton the author edits. It runs in the browser and stores nothing on the
 * server: no model, no call out. The outline can be copied, downloaded, or kept
 * in this browser so the builder can add it to a workbook.
 */
export default async function OutlinePage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const ctx = await requireStudio("/studio/outline", sp.org);
  return (
    <div className="admin-page studio-page">
      <OrgSwitcher ctx={ctx} path="/studio/outline" />
      <h1>Outline generator</h1>
      <p className="muted">
        Answer five questions and get a unit-by-unit outline to edit. It is a starting point, not a finished plan. The same answers always give the same outline.
        Nothing you type here is sent anywhere. Only a daily count that an outline was made is kept. Read <Link href="/how-to-write">how to write for Akana</Link> first if you have not.
      </p>
      <OutlineGenerator />
    </div>
  );
}
