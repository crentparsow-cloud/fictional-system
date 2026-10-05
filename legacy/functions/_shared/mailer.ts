// Sending, logging and signed links for every email the app sends.
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import { TEMPLATES, render, footerText, Vars } from "./emails.ts";

export const FN_BASE = `${Deno.env.get("SUPABASE_URL")}/functions/v1`;
export const admin = (): SupabaseClient =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

let cfgCache: Record<string, string> | null = null;
export async function config(db: SupabaseClient): Promise<Record<string, string>> {
  if (cfgCache) return cfgCache;
  const { data } = await db.from("app_config").select("key,value");
  cfgCache = Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value]));
  return cfgCache!;
}

let secretCache = "";
export async function serverSecret(db: SupabaseClient): Promise<string> {
  if (!secretCache) {
    const { data, error } = await db.rpc("server_secret");
    if (error || !data) throw new Error("server_secret_unavailable");
    secretCache = data as string;
  }
  return secretCache;
}

const te = new TextEncoder();
async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", te.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, te.encode(msg)));
  return Array.from(sig.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}
export async function sha256(s: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", te.encode(s)));
  return Array.from(h, (b) => b.toString(16).padStart(2, "0")).join("");
}
export function randomToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Links that turn off one kind of email for one reader, with no sign-in.
 *  page: opens a small page in the app. oneClick: for mail apps' own unsubscribe button. */
export async function unsubscribeLinks(db: SupabaseClient, userId: string, kind: "progress" | "marketing" | "personal") {
  const sig = await hmac(await serverSecret(db), `unsub:${userId}:${kind}`);
  const q = `u=${userId}&k=${kind}&s=${sig}`;
  const cfg = await config(db);
  return { unsubscribe: `${cfg.app_url}/respond.html?a=unsubscribe&${q}`, oneClick: `${FN_BASE}/app/notify?op=unsubscribe&${q}` };
}
export async function checkUnsubscribe(db: SupabaseClient, userId: string, kind: string, sig: string): Promise<boolean> {
  return sig === await hmac(await serverSecret(db), `unsub:${userId}:${kind}`);
}

export type SendOpts = {
  to: string;
  template: keyof typeof TEMPLATES | string;
  vars: Vars;
  userId?: string | null;
  dedupe?: string;
  links?: { manage?: string; unsubscribe?: string; oneClick?: string; stop?: string; report?: string };
  readerName?: string;
};

/** Sends one email, at most once per dedupe key. Returns "sent", "skipped" or "failed". */
export async function send(db: SupabaseClient, o: SendOpts): Promise<"sent" | "skipped" | "failed"> {
  const cfg = await config(db);
  const make = TEMPLATES[o.template];
  if (!make) throw new Error("unknown_template " + o.template);
  const vars: Vars = { app_url: cfg.app_url, settings_url: `${cfg.app_url}/#settings`, support_email: cfg.support_email, ...o.vars };
  const email = make(vars);
  // Progress and marketing mail must carry a working unsubscribe link. Without one, nothing is sent.
  if ((email.footer === "progress" || email.footer === "marketing") && !o.links?.unsubscribe && !o.links?.oneClick) {
    console.error("send_refused_no_unsubscribe", o.template);
    return "failed";
  }
  // Reader emails always get an Email settings button. Partner footers ignore it (partners have no settings).
  const links = { manage: `${cfg.app_url}/#settings`, ...(o.links ?? {}) };
  const r = render(email, footerText(email.footer, links, cfg.postal_address, o.readerName ?? String(vars.reader_name ?? "")));

  // Claim the send first, so two runs can never send the same email twice.
  const { data: claim, error: claimErr } = await db.from("email_sends").insert({
    user_id: o.userId ?? null, kind: o.template, template_version: "v1", status: "sending", dedupe_key: o.dedupe ?? null,
  }).select("id").maybeSingle();
  if (claimErr) {
    if (claimErr.code === "23505") return "skipped"; // already sent
    throw claimErr;
  }

  const testMode = cfg.email_mode !== "live";
  const to = testMode ? cfg.test_recipient : o.to;
  const fail = async (error: string) => {
    // Free the key so a later run can try again.
    await db.from("email_sends").update({ status: "failed", error: error.slice(0, 300), dedupe_key: null }).eq("id", claim!.id);
    return "failed" as const;
  };
  if (!to) return fail("no_test_recipient");
  const headers: Record<string, string> = {};
  if (o.links?.oneClick) {
    headers["List-Unsubscribe"] = `<${o.links.oneClick}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return fail("no_api_key");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: cfg.from_address,
      to: [to],
      reply_to: cfg.reply_to || undefined,
      subject: testMode ? `[Test] ${r.subject}` : r.subject,
      text: r.text,
      html: r.html,
      headers,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return fail(String(body?.message ?? res.status));
  await db.from("email_sends").update({ status: testMode ? "sent_test" : "sent", provider_id: body?.id ?? null }).eq("id", claim!.id);
  return "sent";
}

export async function hasConsent(db: SupabaseClient, userId: string, type: string): Promise<boolean> {
  const { data } = await db.rpc("has_consent", { p_user: userId, p_type: type });
  return !!data;
}

export async function userEmail(db: SupabaseClient, userId: string): Promise<{ email: string; name: string; tz: string }> {
  const [{ data: u }, { data: p }] = await Promise.all([
    db.auth.admin.getUserById(userId),
    db.from("profiles").select("display_name,time_zone").eq("id", userId).maybeSingle(),
  ]);
  return { email: u?.user?.email ?? "", name: p?.display_name ?? (u?.user?.user_metadata as any)?.name ?? "", tz: p?.time_zone ?? "UTC" };
}

export const money = (minor: number | null | undefined, currency = "usd") =>
  minor == null ? "" : new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(minor / 100);
/** A tz the runtime knows, or UTC. */
const zone = (tz?: string | null) => {
  if (!tz) return "UTC";
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return tz; } catch { return "UTC"; }
};
/** "November 30, 2026", in the reader's time zone when it is known. */
export const longDate = (d: string | Date | null | undefined, tz?: string | null) =>
  d ? new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: zone(tz) }) : "";
/** "October 1, 2026 at 8:14 PM", in the reader's time zone when it is known. */
export const longDateTime = (d: string | Date | null | undefined, tz?: string | null) =>
  d ? new Date(d).toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: zone(tz), timeZoneName: "short" }) : "";
/** A plain device description from a User-Agent, such as "iPhone, Safari". Never the full string. */
export function deviceWords(ua: string | null | undefined): string {
  const s = String(ua ?? "");
  const os = /iPhone/.test(s) ? "iPhone" : /iPad/.test(s) ? "iPad" : /Android/.test(s) ? "Android phone or tablet"
    : /Macintosh|Mac OS X/.test(s) ? "Mac" : /Windows/.test(s) ? "Windows computer" : /CrOS/.test(s) ? "Chromebook" : /Linux/.test(s) ? "Linux computer" : "";
  const browser = /Edg\//.test(s) ? "Edge" : /Firefox\//.test(s) ? "Firefox" : /Chrome\/|CriOS\//.test(s) ? "Chrome" : /Safari\//.test(s) ? "Safari" : "";
  return [os, browser].filter(Boolean).join(", ") || "Unknown device";
}

export const CORS = (origin?: string) => ({
  "Access-Control-Allow-Origin": origin ?? Deno.env.get("APP_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-server-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
});
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS(), "Content-Type": "application/json" } });
export async function readerFromJwt(req: Request) {
  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await client.auth.getUser();
  return user;
}
