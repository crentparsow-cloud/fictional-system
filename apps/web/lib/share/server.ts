import "server-only";
import { freeUnitNumbers, promptsFromUnitBody, WORKBOOK_SLUG, EXERCISE_ID, type ExercisePrompt } from "@/lib/share/exercise";
import { createUserClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createUserClient>>;

export interface SendableWorkbook {
  slug: string;
  title: string;
  exercises: (ExercisePrompt & { unit: number })[];
}

interface WbRow {
  id: string;
  slug: string;
  title: string;
  safety_tier: string;
  current_version_id: string | null;
}

/** Free-unit exercises of one live, safety tier none workbook, read as the given client sees them. */
export async function sendableExercises(client: Client, wb: WbRow): Promise<SendableWorkbook | null> {
  if (wb.safety_tier !== "none" || !wb.current_version_id) return null;
  const { data: listing } = await client.from("workbook_sections").select("free:body->structure->free_units").eq("version_id", wb.current_version_id).eq("kind", "listing").maybeSingle();
  const free = freeUnitNumbers((listing as { free?: unknown } | null)?.free);
  const { data: units } = await client
    .from("workbook_sections")
    .select("unit_number, body")
    .eq("version_id", wb.current_version_id)
    .eq("kind", "unit")
    .in("unit_number", free)
    .order("unit_number");
  const exercises: SendableWorkbook["exercises"] = [];
  for (const u of (units ?? []) as { unit_number: number; body: unknown }[]) {
    for (const p of promptsFromUnitBody(u.body)) exercises.push({ ...p, unit: u.unit_number });
  }
  return exercises.length ? { slug: wb.slug, title: wb.title, exercises } : null;
}

/** For the public page: one sendable exercise by workbook slug and id, read as a signed-out visitor would. */
export async function loadPublicExercise(slug: string, exerciseId: string): Promise<{ workbook: { slug: string; title: string }; exercise: ExercisePrompt } | null> {
  if (!WORKBOOK_SLUG.test(slug) || !EXERCISE_ID.test(exerciseId)) return null;
  const client = await createUserClient();
  const { data } = await client.from("workbooks").select("id, slug, title, safety_tier, current_version_id").eq("slug", slug).eq("status", "live").maybeSingle();
  if (!data) return null;
  const sendable = await sendableExercises(client, data as WbRow);
  const hit = sendable?.exercises.find((e) => e.id === exerciseId);
  if (!sendable || !hit) return null;
  return { workbook: { slug: sendable.slug, title: sendable.title }, exercise: { id: hit.id, title: hit.title, purpose: hit.purpose, minutes: hit.minutes, questions: hit.questions } };
}

/** For the picker: the reader's own tier none programmes with their sendable exercises. */
export async function readerSendables(userId: string): Promise<SendableWorkbook[]> {
  const client = await createUserClient();
  const { data } = await client
    .from("enrolments")
    .select("workbooks(id, slug, title, safety_tier, current_version_id, status)")
    .eq("user_id", userId)
    .limit(50);
  const out: SendableWorkbook[] = [];
  for (const row of (data ?? []) as unknown as { workbooks: (WbRow & { status: string }) | null }[]) {
    if (!row.workbooks || row.workbooks.status !== "live") continue;
    const s = await sendableExercises(client, row.workbooks);
    if (s) out.push(s);
  }
  return out;
}

export interface QuoteLine {
  unit: number;
  text: string;
}

/** The reader's own live, safety tier none programmes, for the quote picker. */
export async function readerPlainWorkbooks(userId: string): Promise<{ slug: string; title: string }[]> {
  const client = await createUserClient();
  const { data } = await client.from("enrolments").select("workbooks(slug, title, safety_tier, status)").eq("user_id", userId).limit(50);
  const out: { slug: string; title: string }[] = [];
  for (const row of (data ?? []) as unknown as { workbooks: { slug: string; title: string; safety_tier: string; status: string } | null }[]) {
    if (row.workbooks && row.workbooks.safety_tier === "none" && row.workbooks.status === "live") out.push({ slug: row.workbooks.slug, title: row.workbooks.title });
  }
  return out;
}

/** Quotable lines from the units this reader can read, read under their own client. Workbook text only. */
export async function quoteLinesFor(userId: string, slug: string, quotable: (body: unknown) => string[]): Promise<QuoteLine[]> {
  if (!WORKBOOK_SLUG.test(slug)) return [];
  const client = await createUserClient();
  const { data: enrol } = await client
    .from("enrolments")
    .select("workbooks!inner(slug, safety_tier, status, current_version_id)")
    .eq("user_id", userId)
    .eq("workbooks.slug", slug)
    .limit(1);
  const wb = ((enrol ?? [])[0] as unknown as { workbooks: { safety_tier: string; status: string; current_version_id: string | null } } | undefined)?.workbooks;
  if (!wb || wb.safety_tier !== "none" || wb.status !== "live" || !wb.current_version_id) return [];
  const { data: units } = await client.from("workbook_sections").select("unit_number, body").eq("version_id", wb.current_version_id).eq("kind", "unit").order("unit_number").limit(30);
  const out: QuoteLine[] = [];
  for (const u of (units ?? []) as { unit_number: number; body: unknown }[]) {
    for (const text of quotable(u.body)) out.push({ unit: u.unit_number, text });
    if (out.length >= 60) break;
  }
  return out.slice(0, 60);
}
