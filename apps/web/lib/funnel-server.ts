import "server-only";
import { cookies, headers } from "next/headers";
import { after } from "next/server";
import { OPT_OUT_COOKIE, countFunnelEvent, type FunnelEvent } from "@/lib/funnel";
import { scopedWorkbook, shouldCount, type ProductEvent } from "@/lib/product-events";
import { createUserClient } from "@/lib/supabase/server";
import { tenantIdForRequest } from "@/lib/tenant-id";

/**
 * Count a view from a Server Component (F-141). Reads the opt-out from this
 * request, then counts after the response has gone, so the page never waits
 * on it. One line in the page: countView("page_view", card.id, session?.userId).
 * The user id, when given, is hashed with the day and the salt before it
 * goes anywhere (lib/visitor-id.ts); the address and user agent are used the
 * same way for a signed-out visitor.
 */
export async function countView(event: Extract<FunnelEvent, "page_view" | "sample_view">, workbookId?: string | null, userId?: string | null): Promise<void> {
  try {
    const [h, jar, tenantId] = await Promise.all([headers(), cookies(), tenantIdForRequest()]);
    if (!tenantId) return;
    // Link prefetches render the page too; they are not views.
    if (h.get("next-router-prefetch") || h.get("purpose") === "prefetch") return;
    const snapshot = new Headers();
    for (const k of ["sec-gpc", "dnt", "x-forwarded-for", "x-real-ip", "user-agent"]) {
      const v = h.get(k);
      if (v) snapshot.set(k, v);
    }
    const optOut = jar.get(OPT_OUT_COOKIE);
    const cookieSnapshot = { get: (name: string) => (name === OPT_OUT_COOKIE && optOut ? { value: optOut.value } : undefined) };
    const supabase = await createUserClient();
    after(() => countFunnelEvent(supabase, event, { tenantId, workbookId: workbookId ?? null, headers: snapshot, cookies: cookieSnapshot, userId: userId ?? null }));
  } catch {
    console.error("funnel_view_failed", event);
  }
}

export interface ProductEventOptions {
  /** The signed-in reader, hashed with the day before it goes anywhere. */
  userId?: string | null;
  /** The title the event happened on, if any. Only named when its tier is "none". */
  workbookId?: string | null;
  /** That title's safety tier: "none", "standard" or "higher". Unknown means not named. */
  tier?: string | null;
}

/**
 * Count a Phase B product event from a route handler or server action. Same
 * opt-out and the same hashing as countView; counted after the response.
 * Never throws. Carries no text of any kind (lib/product-events.ts).
 */
export async function countEvent(event: ProductEvent, o: ProductEventOptions = {}): Promise<void> {
  try {
    if (!shouldCount(event, o.tier)) return;
    const [h, jar, tenantId] = await Promise.all([headers(), cookies(), tenantIdForRequest()]);
    if (!tenantId) return;
    const snapshot = new Headers();
    for (const k of ["sec-gpc", "dnt", "x-forwarded-for", "x-real-ip", "user-agent"]) {
      const v = h.get(k);
      if (v) snapshot.set(k, v);
    }
    const optOut = jar.get(OPT_OUT_COOKIE);
    const cookieSnapshot = { get: (name: string) => (name === OPT_OUT_COOKIE && optOut ? { value: optOut.value } : undefined) };
    const supabase = await createUserClient();
    const workbookId = scopedWorkbook(event, o.tier, o.workbookId);
    after(() => countFunnelEvent(supabase, event, { tenantId, workbookId, headers: snapshot, cookies: cookieSnapshot, userId: o.userId ?? null }));
  } catch {
    console.error("funnel_event_failed", event);
  }
}
