import "server-only";
import { randomUUID } from "node:crypto";
import { seal, unseal } from "@/lib/answers";
import { parsePayload, type Entry } from "@/lib/reading/then-now";
import { createUserClient } from "@/lib/supabase/server";

type UserClient = Awaited<ReturnType<typeof createUserClient>>;

export const thenNowField = (id: string) => `thennow:${id}`;

/** A new entry id, made here so the sealed value can be bound to it before the row exists. */
export const newEntryId = (): string => randomUUID();

export async function sealEntry(userId: string, tenantId: string, id: string, value: { feeling: number; step: string }) {
  return seal({ userId, tenantId, field: thenNowField(id) }, value);
}

interface Row {
  id: string;
  enrolment_id: string;
  step_ref: string;
  sealed: string;
  taken_at: string;
  enrolments: { tenant_id: string; workbooks: { title: string | null } | { title: string | null }[] | null } | { tenant_id: string; workbooks: { title: string | null } | { title: string | null }[] | null }[] | null;
}

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/**
 * All of the reader's entries, opened, newest first. Read through the
 * reader's own client (RLS) and filtered to their id as well. An entry that
 * will not open is left out.
 */
export async function loadEntries(supabase: UserClient, userId: string): Promise<Entry[] | null> {
  const { data, error } = await supabase
    .from("then_now_entries")
    .select("id, enrolment_id, step_ref, sealed, taken_at, enrolments(tenant_id, workbooks(title))")
    .eq("user_id", userId)
    .order("taken_at", { ascending: false })
    .limit(500);
  if (error) return null;
  const out: Entry[] = [];
  for (const row of (data ?? []) as unknown as Row[]) {
    const enrol = one(row.enrolments);
    if (!enrol) continue;
    try {
      const p = parsePayload(await unseal({ userId, tenantId: enrol.tenant_id, field: thenNowField(row.id) }, row.sealed));
      if (!p) continue;
      out.push({
        id: row.id,
        enrolmentId: row.enrolment_id,
        stepRef: row.step_ref,
        step: p.step,
        book: one(enrol.workbooks)?.title ?? "",
        feeling: p.feeling,
        takenAt: row.taken_at,
      });
    } catch {
      // left out rather than guessed at
    }
  }
  return out;
}
