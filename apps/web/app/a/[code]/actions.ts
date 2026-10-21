"use server";

import { redirect } from "next/navigation";
import { getReaderSession } from "@/lib/auth";
import { isAuthorLinkCode, isAuthorLinkUse } from "@/lib/author-growth";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Use an author's own link (6.4). A button press by a signed-in person, a
 * POST. The database records who the author is for this reader (0052
 * author_link_use): first link wins, never your own organisation's, never for
 * someone who has paid Akana before. Nothing is stored in the browser.
 */
export async function useAuthorLink(formData: FormData): Promise<void> {
  const code = String(formData.get("code") ?? "").toLowerCase();
  if (!isAuthorLinkCode(code)) redirect("/");
  const session = await getReaderSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(`/a/${code}`)}`);
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("author_link_use", { p_code: code });
  const result = error || !isAuthorLinkUse(data) ? "unknown_code" : data;
  redirect(`/a/${code}?result=${result}`);
}
