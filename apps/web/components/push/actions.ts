"use server";

import { getReaderSession } from "@/lib/auth";
import { flagEnabled } from "@/lib/platform/flags-server";
import { vapidFromEnv } from "@/lib/push/vapid";
import { createUserClient } from "@/lib/supabase/server";

export interface PushActionState {
  ok: boolean;
  message: string | null;
}

const KEY = /^[A-Za-z0-9_-]{1,200}$/;

/** Save this device's push subscription for the signed-in reader (13.19). Needs the flag, the keys and a reader. */
export async function savePushSubscription(subscription: { endpoint: string; p256dh: string; auth: string }): Promise<PushActionState> {
  const session = await getReaderSession();
  if (!session) return { ok: false, message: "Sign in first." };
  if (!vapidFromEnv() || !(await flagEnabled("web_push"))) return { ok: false, message: "Notifications are not available on your account yet." };
  if (!subscription.endpoint.startsWith("https://") || subscription.endpoint.length > 1000 || !KEY.test(subscription.p256dh) || !KEY.test(subscription.auth)) {
    return { ok: false, message: "This device sent an unexpected answer. Try again." };
  }
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("save_push_subscription", { p_endpoint: subscription.endpoint, p_p256dh: subscription.p256dh, p_auth: subscription.auth });
  if (error) {
    console.error("push_save_failed", error.code ?? "");
    return { ok: false, message: "Could not turn notifications on just now. Try again in a moment." };
  }
  return { ok: true, message: null };
}

export async function removePushSubscription(endpoint: string): Promise<PushActionState> {
  const session = await getReaderSession();
  if (!session) return { ok: false, message: "Sign in first." };
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("remove_push_subscription", { p_endpoint: endpoint });
  if (error) {
    console.error("push_remove_failed", error.code ?? "");
    return { ok: false, message: "Could not turn notifications off just now. Try again in a moment." };
  }
  return { ok: true, message: null };
}
