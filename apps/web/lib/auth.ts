import "server-only";
import { passkeyEnabled } from "@/lib/mfa/role-mfa-server";
import { getScopedUser } from "@/lib/session-scope-server";
import type { SessionScope } from "@/lib/session-scope";

/**
 * Who is signed in, and whether they have confirmed they are an adult
 * (F-127). Reads the reader's own profile row under RLS. mfaEnrolled says
 * whether the account has a verified authenticator (13.2); the (reader)
 * layout then asks for a code when the session has not given one.
 *
 * Session scope (F-133): the session must belong on this host, which
 * getScopedUser decides (lib/session-scope-server.ts). On the marketplace a
 * tenant-scoped session is nobody. On a tenant host only that tenant's
 * scoped session counts; its scope is "tenant", and the profile is not read
 * here because a tenant session has no access to it. Tenant pages read the
 * gates through lib/tenant-reader.ts instead.
 */
export type ReaderSession = { userId: string; email: string | null; adultConfirmedAt: string | null; mfaEnrolled: boolean; scope: SessionScope };

export async function getReaderSession(): Promise<ReaderSession | null> {
  const scoped = await getScopedUser();
  if (!scoped) return null;
  const { user, supabase } = scoped;
  if (scoped.scope === "tenant") return { userId: user.id, email: user.email ?? null, adultConfirmedAt: null, mfaEnrolled: false, scope: "tenant" };
  const { data: profile } = await supabase.from("profiles").select("adult_confirmed_at").eq("user_id", user.id).maybeSingle();
  const factors = (user as { factors?: { factor_type?: string; status?: string }[] }).factors ?? [];
  const verified = factors.filter((f) => f.status === "verified");
  // A passkey counts only while passkeys are switched on, so turning the
  // switch off can never lock out a reader whose only factor is a passkey.
  const mfaEnrolled = verified.some((f) => f.factor_type !== "webauthn") || (verified.length > 0 && (await passkeyEnabled()));
  return { userId: user.id, email: user.email ?? null, adultConfirmedAt: (profile?.adult_confirmed_at as string | null | undefined) ?? null, mfaEnrolled, scope: "account" };
}

/** Only ever send a reader to a path on this site. The rules are in lib/safe-next.ts. */
export { safeNextPath, sameOriginUrl } from "@/lib/safe-next";
