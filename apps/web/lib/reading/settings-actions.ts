"use server";

import { getReaderSession } from "@/lib/auth";
import { createUserClient } from "@/lib/supabase/server";
import { FONTS, COLOURS, MARGINS, PROGRESS, SIZE_STEPS, sanitise, type ReadingSettings } from "./settings";

/**
 * Saves the reading settings to the account (0044). The values are checked
 * here against the same lists the database enforces, and the time is the
 * server's, so a device with a wrong clock cannot make its copy win forever.
 * Returns the time saved, or null when it could not be kept. The device copy
 * stands either way, so the caller stays quiet about a failure.
 */
export async function saveReadingSettings(input: ReadingSettings): Promise<number | null> {
  const clean = sanitise(input);
  if (
    !clean.font || !FONTS.includes(clean.font) ||
    clean.size === undefined || !SIZE_STEPS.includes(clean.size) ||
    !clean.colour || !COLOURS.includes(clean.colour) ||
    !clean.margin || !MARGINS.includes(clean.margin) ||
    !clean.progress || !PROGRESS.includes(clean.progress)
  ) {
    return null;
  }
  try {
    const session = await getReaderSession();
    if (!session) return null;
    const supabase = await createUserClient();
    const at = new Date();
    const { error } = await supabase
      .from("reader_settings")
      .upsert({ user_id: session.userId, reading: clean, updated_at: at.toISOString() }, { onConflict: "user_id" });
    return error ? null : at.getTime();
  } catch {
    return null;
  }
}
