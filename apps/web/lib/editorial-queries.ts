import "server-only";
import type { LibraryCard } from "@/lib/catalogue-types";
import { pickActiveSlot, resolveSlot, type EditorialSlotRow, type ResolvedSlot } from "@/lib/editorial";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Reads the weekly editorial slot (7.10) through the user client, so RLS
 * (migration 0062) decides what a visitor sees. A failed read shows no slot
 * and never breaks the page that asked.
 */
type Row = {
  id: string;
  heading: string;
  line: string;
  workbook_id: string | null;
  theme_id: string | null;
  starts_on: string;
  ends_on: string;
  status: "draft" | "live";
};

export async function loadEditorialSlot(
  cards: readonly LibraryCard[],
  themes: readonly { id: string; name: string }[],
  now: Date = new Date(),
): Promise<ResolvedSlot | null> {
  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase
      .from("editorial_slots")
      .select("id, heading, line, workbook_id, theme_id, starts_on, ends_on, status")
      .eq("status", "live")
      .order("starts_on", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.code ?? "read_failed");
    const rows: EditorialSlotRow[] = ((data ?? []) as Row[]).map((r) => ({
      id: r.id,
      heading: r.heading,
      line: r.line,
      workbookId: r.workbook_id,
      themeId: r.theme_id,
      startsOn: r.starts_on,
      endsOn: r.ends_on,
      status: r.status,
    }));
    return resolveSlot(pickActiveSlot(rows, now), cards, themes, now);
  } catch (err) {
    console.error("editorial_slot_failed", err instanceof Error ? err.message : "");
    return null;
  }
}
