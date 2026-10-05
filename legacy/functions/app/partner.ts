// partner: the accountability partner, end to end.
// Reader (signed in, POST): invite, pause, resume, remove, level, note.
// Partner (email link, no account): the link opens respond.html in the app, which asks first and
//   only acts when the partner taps the button: accept, decline, stop, report.
//   Nothing happens on the link alone, so email scanners that open links cannot act for anyone.
//   Mail apps' own unsubscribe button (List-Unsubscribe-Post, RFC 8058) POSTs to
//   /app/partner?op=oneclick&a=stop|decline&t=..., which acts at once. A GET there only redirects.
import { admin, send, sha256, randomToken, json, CORS, readerFromJwt, userEmail, hasConsent, config, FN_BASE } from "./_shared/mailer.ts";

const db = admin();
const DAY = 86400000;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

/** Names shown to a partner: letters, spaces, apostrophes and hyphens only, at most 30 characters. */
export function cleanName(s: unknown): string {
  return String(s ?? "").normalize("NFKC").replace(/[^\p{L}\p{M} '\u2019-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 30).trim();
}
/** The level 3 note: no links, email addresses or phone numbers, at most 200 characters. */
export function cleanNote(s: unknown): string {
  return String(s ?? "").normalize("NFKC")
    .replace(/[^\s@]+@[^\s@]+/g, "")
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, "")
    .replace(/\b[\w-]+(?:\.[\w-]+)*\.(?:com|net|org|io|co|uk|us|ca|au|nz|ie|me|app|ly|gg|info|biz|xyz|link|site|page|dev)\b\S*/gi, "")
    .replace(/\+?\d[\d\s().-]{5,}\d/g, "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ").trim().slice(0, 200);
}

async function token(partnerId: number, purpose: "respond" | "stop" | "report", days: number) {
  const t = randomToken();
  await db.from("partner_tokens").insert({ partner_id: partnerId, token_hash: await sha256(t), purpose, expires_at: new Date(Date.now() + days * DAY).toISOString() });
  return t;
}

async function invite(userId: string, b: any) {
  const name = cleanName(b.name), email = String(b.email ?? "").trim().toLowerCase();
  const level = Number(b.share_level);
  if (!name || !EMAIL.test(email) || ![1, 2, 3].includes(level)) return json({ error: "Please check the name and email" }, 400);
  if (!await hasConsent(db, userId, "partner_share")) return json({ error: "Please tick the sharing box first" }, 403);
  const me = await userEmail(db, userId);
  if (email === me.email.toLowerCase()) return json({ error: "Please add someone other than yourself" }, 400);
  const hash = await sha256(email);
  const { data: blocked } = await db.from("blocked_addresses").select("reason").eq("email_hash", hash).maybeSingle();
  if (blocked) return json({ error: "An invitation cannot be sent to that address" }, 403);
  const { count } = await db.from("email_sends").select("id", { count: "exact", head: true })
    .eq("user_id", userId).eq("kind", "partner_invite").gte("sent_at", new Date(Date.now() - 30 * DAY).toISOString());
  if ((count ?? 0) >= 3) return json({ error: "You can send three invitations a month. Please try again later." }, 429);

  // One partner per reader. A new invitation replaces an old record.
  await db.from("partners").delete().eq("user_id", userId);
  const { data: p, error } = await db.from("partners").insert({ user_id: userId, partner_name: name, partner_email: email, share_level: level, status: "invited" }).select("*").single();
  if (error) throw error;
  const [respond, report] = await Promise.all([token(p.id, "respond", 30), token(p.id, "report", 60)]);
  const cfg = await config(db);
  const base = `${cfg.app_url}/respond.html?t=${respond}`;
  // The user id on the send row lets us enforce the monthly limit. It is the reader's, not the partner's.
  const r = await send(db, {
    to: email, template: "partner_invite", userId, readerName: cleanName(me.name) || "A friend",
    vars: { partner_name: name, reader_name: cleanName(me.name) || "A friend", share_level: level, accept_url: `${base}&a=accept`, decline_url: `${base}&a=decline` },
    links: { report: `${cfg.app_url}/respond.html?t=${report}&a=report`, oneClick: `${FN_BASE}/app/partner?op=oneclick&a=decline&t=${respond}` },
  });
  return json({ ok: r !== "failed", status: "invited", sent: r });
}

async function readerOp(userId: string, b: any) {
  const { data: pending } = await db.rpc("deletion_pending", { p_user: userId });
  if (pending && b.op !== "remove" && b.op !== "pause") return json({ error: "read_only", message: "Your account is scheduled for deletion." }, 403);
  const { data: p } = await db.from("partners").select("*").eq("user_id", userId).maybeSingle();
  if (b.op === "invite") return invite(userId, b);
  if (!p) return json({ error: "No partner" }, 404);
  if (b.op === "pause" && p.status === "accepted") await db.from("partners").update({ status: "paused" }).eq("id", p.id);
  else if (b.op === "resume" && p.status === "paused") await db.from("partners").update({ status: "accepted" }).eq("id", p.id);
  else if (b.op === "remove") { await db.from("partners").delete().eq("id", p.id); return json({ ok: true, status: "none" }); } // silent: the partner is not told
  else if (b.op === "level" && [1, 2, 3].includes(Number(b.share_level))) await db.from("partners").update({ share_level: Number(b.share_level) }).eq("id", p.id);
  else if (b.op === "note") await db.from("partners").update({ note: cleanNote(b.note) || null, note_used_at: null }).eq("id", p.id);
  else return json({ error: "Not possible right now" }, 409);
  const { data: fresh } = await db.from("partners").select("partner_name,share_level,status,note").eq("id", p.id).single();
  return json({ ok: true, ...fresh });
}

const WORDS: Record<string, { title: string; ask: string; button: string }> = {
  accept: { title: "Get updates?", ask: "You will get a short email when they finish a stage, never more than once a week. You will never see their answers or scores.", button: "Yes, send me updates" },
  decline: { title: "Say no thanks?", ask: "You will not hear from us again, and we will not send you any more invitations.", button: "No, thank you" },
  stop: { title: "Stop updates?", ask: "You will not get any more updates. They will see in the app that updates have stopped.", button: "Stop updates" },
  report: { title: "Report this invitation?", ask: "All future invitations to your address will be blocked.", button: "Report and block" },
};
type Reply = { title: string; message: string; button?: string; status?: number };

// The app's respond page calls this twice: first with confirm=false to show the question,
// then with confirm=true when the partner taps the button.
async function partnerLink(b: any): Promise<Reply> {
  const t = String(b.t ?? ""), a = String(b.a ?? "");
  if (!WORDS[a] || !/^[0-9a-f]{48}$/.test(t)) return { title: "Link not recognised", message: "This link is not valid.", status: 400 };
  const purpose = a === "stop" ? "stop" : a === "report" ? "report" : "respond";
  const { data: tok } = await db.from("partner_tokens").select("partner_id,expires_at,used_at,purpose").eq("token_hash", await sha256(t)).eq("purpose", purpose).maybeSingle();
  if (!tok || Date.parse(tok.expires_at) < Date.now()) return { title: "This link has expired", message: "Nothing has changed. If you want to stop hearing from us, use the link in the most recent email.", status: 410 };
  const { data: p } = await db.from("partners").select("*").eq("id", tok.partner_id).maybeSingle();
  if (!p) return { title: "Nothing to do", message: "This invitation is no longer active. You will not hear from us about it again." };
  if (!b.confirm) return { title: WORDS[a].title, message: WORDS[a].ask, button: WORDS[a].button };

  const now = new Date().toISOString();
  const hash = await sha256(p.partner_email);
  const reader = await userEmail(db, p.user_id);
  if (a === "accept") {
    if (p.status !== "invited") return { title: "Already done", message: "Your answer is already recorded." };
    await db.from("partners").update({ status: "accepted", responded_at: now }).eq("id", p.id);
    await db.from("partner_tokens").update({ used_at: now }).eq("token_hash", await sha256(t));
    const cfg = await config(db);
    await send(db, { to: reader.email, userId: p.user_id, template: "partner_accepted", dedupe: `paccept:${p.id}`, vars: { name: reader.name, partner_name: p.partner_name, settings_url: `${cfg.app_url}/#settings` } });
    return { title: "Thank you", message: `You will get a short note when ${reader.name ? reader.name + " finishes" : "they finish"} a stage. Every email has a link to stop.` };
  }
  if (a === "decline") {
    await db.from("partners").update({ status: "declined", responded_at: now }).eq("id", p.id);
    await db.from("blocked_addresses").upsert({ email_hash: hash, reason: "declined" });
    return { title: "No problem", message: "You will not hear from us again." };
  }
  if (a === "report") {
    await db.from("partners").update({ status: "declined", responded_at: now }).eq("id", p.id);
    await db.from("blocked_addresses").upsert({ email_hash: hash, reason: "reported" });
    return { title: "Reported and blocked", message: "Thank you for telling us. Nobody will be able to send an invitation to your address again." };
  }
  if (p.status === "stopped") return { title: "Already stopped", message: "You will not get any more updates." };
  await db.from("partners").update({ status: "stopped", responded_at: now }).eq("id", p.id);
  await send(db, { to: p.partner_email, template: "partner_stopped", dedupe: `pstop:${p.id}`, readerName: cleanName(reader.name), vars: { partner_name: cleanName(p.partner_name), reader_name: cleanName(reader.name) || "your friend" } });
  return { title: "Updates stopped", message: "You will not get any more updates." };
}

export async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS() });
  const q = new URL(req.url).searchParams;
  if (q.get("op") === "oneclick") {
    const a = q.get("a") === "decline" ? "decline" : "stop", t = q.get("t") ?? "";
    if (req.method !== "POST") { // a person or a link scanner opening the URL: show the question, do nothing
      const cfg = await config(db);
      return new Response(null, { status: 303, headers: { ...CORS(), Location: `${cfg.app_url}/respond.html?${new URLSearchParams({ t, a })}` } });
    }
    try { const r = await partnerLink({ t, a, confirm: true }); return json(r, r.status ?? 200); }
    catch (e) { console.error("partner_oneclick_failed", (e as Error).message); return json({ error: "Something went wrong" }, 500); }
  }
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  try {
    const b = await req.json().catch(() => ({}));
    if (b.op === "respond") { const r = await partnerLink(b); return json(r, r.status ?? 200); } // partner, by email link, no account
    const user = await readerFromJwt(req);
    if (!user) return json({ error: "Please sign in first" }, 401);
    return await readerOp(user.id, b);
  } catch (e) {
    console.error("partner_failed", (e as Error).message);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
}
