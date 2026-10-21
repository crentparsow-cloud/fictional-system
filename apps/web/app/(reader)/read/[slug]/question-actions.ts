"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getReaderSession } from "@/lib/auth";
import { createUserClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * The reader answers the author's end-of-programme question (8.5). One tap,
 * once, after finishing. The database checks that the enrolment is theirs and
 * finished (public.answer_programme_question, 0057). Skipping is simply not
 * answering: nothing is stored for a skip.
 */
export async function answerProgrammeQuestion(fd: FormData): Promise<void> {
  const enrolment = fd.get("enrolment");
  const slug = fd.get("slug");
  const option = Number(fd.get("option"));
  if (typeof enrolment !== "string" || !UUID.test(enrolment) || typeof slug !== "string" || !SLUG.test(slug)) redirect("/my-workbooks");
  const session = await getReaderSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(`/read/${slug}`)}`);
  if (Number.isInteger(option) && option >= 0 && option <= 4) {
    const supabase = await createUserClient();
    const { error } = await supabase.rpc("answer_programme_question", { p_enrolment: enrolment, p_option: option });
    if (error) console.error("programme_question_failed", error.code ?? "");
  }
  revalidatePath(`/read/${slug}`);
  redirect(`/read/${slug}`);
}
