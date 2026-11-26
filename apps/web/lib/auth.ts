import "server-only";
import { mfaEnrolledFor } from "@/lib/mfa/reader-gate-server";
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
  // The rule for what counts as a factor is in lib/mfa/reader-gate.ts.
  const mfaEnrolled = await mfaEnrolledFor(user);
  return { userId: user.id, email: user.email ?? null, adultConfirmedAt: (profile?.adult_confirmed_at as string | null | undefined) ?? null, mfaEnrolled };
}

/** Only ever send a reader to a path on this site. The rules are in lib/safe-next.ts. */
export { safeNextPath, sameOriginUrl } from "@/lib/safe-next";
