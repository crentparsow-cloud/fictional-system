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
