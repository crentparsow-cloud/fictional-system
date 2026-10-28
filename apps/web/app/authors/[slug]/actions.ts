"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isSlug } from "@/lib/author-theme-pages";
import { getReaderSession } from "@/lib/auth";
import { createUserClient } from "@/lib/supabase/server";
import { countEvent } from "@/lib/funnel-server";

/**
 * Follow or unfollow an author (build list 2.10). A reader follows by choice,
 * from the button on the author page. The follow is private: the author never
 * sees it and no count is shown. A signed-out visitor is sent to sign in and
 * comes back to the same page. The database checks the rest (own rows only, a
 * public author only, at most 200 follows).
 */
export async function setFollow(fd: FormData): Promise<void> {
  const slug = fd.get("slug");
  const want = fd.get("follow") === "yes";
  if (typeof slug !== "string" || !isSlug(slug)) redirect("/authors");
  const back = `/authors/${slug}`;
  const session = await getReaderSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(back)}`);

  const supabase = await createUserClient();
  const { data: author } = await supabase.from("authors").select("id").eq("slug", slug).maybeSingle();
  const authorId = (author as { id: string } | null)?.id;
  if (!authorId) redirect("/authors");

  if (want) {
    const { error } = await supabase.from("author_follows").upsert({ user_id: session.userId, author_id: authorId }, { onConflict: "user_id,author_id", ignoreDuplicates: true });
    if (error) {
      console.error("author_follow_failed", error.code ?? "");
      redirect(`${back}?follow=failed`);
    }
    await countEvent("author_followed", { userId: session.userId });
  } else {
    const { error } = await supabase.from("author_follows").delete().eq("user_id", session.userId).eq("author_id", authorId);
    if (error) {
      console.error("author_unfollow_failed", error.code ?? "");
      redirect(`${back}?follow=failed`);
    }
  }
  revalidatePath(back);
  revalidatePath("/explore");
  redirect(back);
}
