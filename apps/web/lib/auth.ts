import "server-only";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Who is signed in, and whether they have confirmed they are an adult
 * (F-127). Reads the reader's own profile row under RLS. mfaEnrolled says
 * whether the account has a verified authenticator (13.2); the (reader)
 * layout then asks for a code when the session has not given one.
 */
export type ReaderSession = { userId: string; email: string | null; adultConfirmedAt: string | null; mfaEnrolled: boolean };

export async function getReaderSession(): Promise<ReaderSession | null> {
  const supabase = await createUserClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("adult_confirmed_at").eq("user_id", user.id).maybeSingle();
  const factors = (user as { factors?: { factor_type?: string; status?: string }[] }).factors ?? [];
  const mfaEnrolled = factors.some((f) => f.status === "verified");
  return { userId: user.id, email: user.email ?? null, adultConfirmedAt: (profile?.adult_confirmed_at as string | null | undefined) ?? null, mfaEnrolled };
}

/** Only ever send a reader to a path on this site. */
export function safeNextPath(next: string | null | undefined, fallback = "/home"): string {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  return next;
}
