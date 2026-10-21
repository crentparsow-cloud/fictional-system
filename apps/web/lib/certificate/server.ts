import "server-only";
import { createUserClient } from "@/lib/supabase/server";

export interface FinishedProgramme {
  enrolmentId: string;
  slug: string;
  title: string;
  tier: string;
}

/** The reader's programmes they reached the end of: a 'finished' event, or the status. */
export async function finishedProgrammes(userId: string): Promise<FinishedProgramme[]> {
  const client = await createUserClient();
  const { data } = await client
    .from("enrolments")
    .select("id, status, workbooks(slug, title, safety_tier)")
    .eq("user_id", userId)
    .order("last_opened_at", { ascending: false })
    .limit(100);
  const rows = ((data ?? []) as unknown as { id: string; status: string; workbooks: { slug: string; title: string; safety_tier: string } | null }[]).filter((r) => r.workbooks);
  if (rows.length === 0) return [];
  const { data: ev } = await client.from("progress_events").select("enrolment_id").eq("kind", "finished").in("enrolment_id", rows.map((r) => r.id));
  const done = new Set(((ev ?? []) as { enrolment_id: string }[]).map((e) => e.enrolment_id));
  return rows
    .filter((r) => r.status === "finished" || done.has(r.id))
    .map((r) => ({ enrolmentId: r.id, slug: r.workbooks!.slug, title: r.workbooks!.title, tier: r.workbooks!.safety_tier }));
}

export async function finishedProgrammeBySlug(userId: string, slug: string): Promise<FinishedProgramme | null> {
  return (await finishedProgrammes(userId)).find((p) => p.slug === slug) ?? null;
}
