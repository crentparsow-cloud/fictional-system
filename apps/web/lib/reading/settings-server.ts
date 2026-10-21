import "server-only";
import { createUserClient } from "@/lib/supabase/server";
import { fromRecord, type StoredReading } from "./settings";

/**
 * The reader's reading settings from the account (0044), as they were last
 * saved. Null when there are none, or when they cannot be read: the device
 * copy then stands, and the reader sees nothing different.
 */
export async function loadAccountReading(): Promise<StoredReading | null> {
  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase.from("reader_settings").select("reading, updated_at").maybeSingle();
    if (error || !data) return null;
    const row = data as { reading: unknown; updated_at: string };
    return fromRecord({ settings: row.reading, updated_at: row.updated_at });
  } catch {
    return null;
  }
}
