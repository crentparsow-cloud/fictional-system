import "server-only";
import { seal, unseal } from "@/lib/answers";
import { isMarkColour, type Mark } from "@/lib/reading/marks";
import { createUserClient } from "@/lib/supabase/server";

type UserClient = Awaited<ReturnType<typeof createUserClient>>;

/** The field a mark is sealed under: bound to the paragraph, with the reader and tenant, as for answers. */
export const markField = (ref: string) => `mark:${ref}`;

interface Row {
  id: string;
  ref: string;
  colour: string;
  sealed: string;
  updated_at: string;
}

/** The reader's marks on one enrolment, opened. A row that will not open is left out, never guessed at. */
export async function loadMarks(supabase: UserClient, enrolmentId: string, userId: string, tenantId: string): Promise<{ marks: Mark[]; unreadable: number } | null> {
  const { data, error } = await supabase
    .from("reader_marks")
    .select("id, ref, colour, sealed, updated_at")
    .eq("enrolment_id", enrolmentId)
    // Staff are not given these rows, but the filter says whose they are all the same.
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) return null;
  const marks: Mark[] = [];
  let unreadable = 0;
  for (const row of (data ?? []) as Row[]) {
    try {
      const v = (await unseal({ userId, tenantId, field: markField(row.ref) }, row.sealed)) as { note?: unknown; excerpt?: unknown } | null;
      if (!isMarkColour(row.colour)) throw new Error("colour");
      marks.push({
        id: row.id,
        ref: row.ref,
        colour: row.colour,
        note: typeof v?.note === "string" ? v.note : "",
        excerpt: typeof v?.excerpt === "string" ? v.excerpt : "",
        updatedAt: row.updated_at,
      });
    } catch {
      unreadable += 1;
    }
  }
  return { marks, unreadable };
}

export async function sealMark(userId: string, tenantId: string, ref: string, value: { note: string; excerpt: string }) {
  return seal({ userId, tenantId, field: markField(ref) }, value);
}

/**
 * Every mark the reader has, across their workbooks, opened, for the
 * highlights page. Newest 1000 only. RLS returns the reader's own rows; the
 * user filter says so too. Each mark is opened under its own enrolment's
 * tenant, which is what it was sealed with. A row that will not open is
 * counted, never guessed at. Null means the read failed.
 */
export async function loadAllMarks(
  supabase: UserClient,
  userId: string,
): Promise<{ items: { enrolmentId: string; title: string; mark: Mark }[]; unreadable: number } | null> {
  const { data, error } = await supabase
    .from("reader_marks")
    .select("id, ref, colour, sealed, updated_at, enrolment_id, enrolments(tenant_id, workbooks(title))")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1000);
  if (error) return null;
  type AllRow = Row & { enrolment_id: string; enrolments: { tenant_id: string; workbooks: { title: string | null } | null } | null };
  const items: { enrolmentId: string; title: string; mark: Mark }[] = [];
  let unreadable = 0;
  for (const row of (data ?? []) as unknown as AllRow[]) {
    try {
      if (!row.enrolments) throw new Error("enrolment");
      const v = (await unseal({ userId, tenantId: row.enrolments.tenant_id, field: markField(row.ref) }, row.sealed)) as { note?: unknown; excerpt?: unknown } | null;
      if (!isMarkColour(row.colour)) throw new Error("colour");
      items.push({
        enrolmentId: row.enrolment_id,
        title: row.enrolments.workbooks?.title ?? "A workbook",
        mark: {
          id: row.id,
          ref: row.ref,
          colour: row.colour,
          note: typeof v?.note === "string" ? v.note : "",
          excerpt: typeof v?.excerpt === "string" ? v.excerpt : "",
          updatedAt: row.updated_at,
        },
      });
    } catch {
      unreadable += 1;
    }
  }
  return { items, unreadable };
}
