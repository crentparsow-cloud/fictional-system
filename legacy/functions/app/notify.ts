// notify: every email that is not about the partner or the account itself.
//   op=run          scheduled, hourly: reminders, renewal notices, monthly questions
//   op=event        from the app, signed in: welcome, stage complete (and partner update)
//   op=txn          from the payment webhook: purchase and cancellation confirmations
//   op=test_all     sends one of every email to the test inbox
//   op=unsubscribe  one-click link from an email, no sign-in. POST only: a GET (a person or a link
//                   scanner opening the link) is redirected to the confirm page in the app.
// The hourly run also finishes account deletions whose 7 days are up and retries failed refunds.
import {
  admin, send, serverSecret, hasConsent, userEmail, unsubscribeLinks, checkUnsubscribe, money, longDate,
  json, CORS, readerFromJwt, config, FN_BASE, randomToken, sha256,
} from "./_shared/mailer.ts";
import { TEMPLATES } from "./_shared/emails.ts";
import { WORKBOOKS } from "./_shared/content.ts";
import { runDueDeletions } from "./account.ts";
import { retryRefunds } from "./billing.ts";
import { cleanName, cleanNote } from "./partner.ts";

const db = admin();
const DAY = 86400000;

async function isServer(req: Request) {
  const s = req.headers.get("x-server-secret");
  return !!s && s === await serverSecret(db);
}

function localHour(tz: string) {
  try { return Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: tz }).format(new Date())); }
  catch { return new Date().getUTCHours(); }
}
const daytime = (tz: string) => { const h = localHour(tz); return h >= 9 && h < 19; };

async function activePass(userId: string) {
  const { data } = await db.from("subscriptions").select("id,product_id,status,current_period_end,cancel_at,created_at,stripe_subscription_id")
    .eq("user_id", userId).in("status", ["active", "trialing", "past_due"]).order("created_at", { ascending: false }).limit(1);
  return data?.[0] ?? null;
}
async function passPrice(userId: string, productId: string) {
  const { data } = await db.from("orders").select("amount_minor,currency").eq("user_id", userId).eq("product_id", productId)
    .eq("status", "paid").order("created_at", { ascending: false }).limit(1);
  return data?.[0] ? money(data[0].amount_minor, data[0].currency) : "";
}

// ---------- partner updates ----------
export async function partnerUpdate(userId: string, stage: string, workbookId: string) {
  const { data: p } = await db.from("partners").select("*").eq("user_id", userId).maybeSingle();
  if (!p || p.status !== "accepted") return "no_partner";
  if (!await hasConsent(db, userId, "partner_share")) return "no_consent";
  const { data: recent } = await db.from("partner_sends").select("sent_at").eq("partner_id", p.id).gte("sent_at", new Date(Date.now() - 30 * DAY).toISOString());
  const lastWeek = (recent ?? []).filter((r: any) => Date.parse(r.sent_at) > Date.now() - 7 * DAY).length;
  if (lastWeek >= 1 || (recent ?? []).length >= 4) return "capped";
  const dedupe = `partner:${p.id}:${workbookId}:${stage}`;
  const { error } = await db.from("partner_sends").insert({ partner_id: p.id, kind: "stage:" + stage, dedupe_key: dedupe });
  if (error) return "skipped";
  const me = await userEmail(db, userId);
  const cfg = await config(db);
  const stopToken = await partnerToken(p.id, "stop", 730);
  const wb = WORKBOOKS[workbookId];
  // Partner mail never names the workbook (its topic) and carries no raw reader text:
  // names are letters only, and the level 3 note has links, emails and phone numbers removed.
  const note = p.share_level >= 3 && p.note && !p.note_used_at ? cleanNote(p.note) : "";
  const readerName = cleanName(me.name) || "Your friend";
  const r = await send(db, {
    to: p.partner_email, template: "partner_update", userId: null, readerName,
    vars: { partner_name: cleanName(p.partner_name), reader_name: readerName, stage, stage_name: wb?.stages[stage]?.name ?? stage,
      share_level: p.share_level, note },
    links: { stop: `${cfg.app_url}/respond.html?a=stop&t=${stopToken}`, oneClick: `${FN_BASE}/app/partner?op=oneclick&a=stop&t=${stopToken}` },
  });
  if (note) await db.from("partners").update({ note_used_at: new Date().toISOString() }).eq("id", p.id);
  return r;
}
async function partnerToken(partnerId: number, purpose: string, days: number) {
  const t = randomToken();
  await db.from("partner_tokens").insert({ partner_id: partnerId, token_hash: await sha256(t), purpose, expires_at: new Date(Date.now() + days * DAY).toISOString() });
  return t;
}

// ---------- scheduled run ----------
async function run() {
  const out: Record<string, number> = {};
  const bump = (k: string) => (out[k] = (out[k] ?? 0) + 1);
  const cfg = await config(db);

  const del = await runDueDeletions();
  out.deletions_completed = del.completed; out.deletions_failed = del.failed;
  out.refunds_retried = await retryRefunds(db);

  // One reminder per reader: only their most recently used active workbook is considered.
  // Readers with a deletion scheduled get no reminders.
  const { data: pending } = await db.from("deletion_requests").select("user_id").in("status", ["scheduled", "deleting", "failed"]);
  const skip = new Set((pending ?? []).map((d: any) => d.user_id));
  const { data: allEnr } = await db.from("enrolments").select("user_id,workbook_id,current_week,last_active_at,started_at,status")
    .eq("status", "active").order("last_active_at", { ascending: false });
  const seen = new Set<string>();
  const enr = (allEnr ?? []).filter((e: any) => !skip.has(e.user_id) && !seen.has(e.user_id) && seen.add(e.user_id));
  for (const e of enr) {
    const me = await userEmail(db, e.user_id);
    if (!me.email || !daytime(me.tz)) continue;
    const away = (Date.now() - Date.parse(e.last_active_at)) / DAY;
    const absence = String(e.last_active_at).slice(0, 10);
    const { data: done } = await db.from("milestones_earned").select("earned_at").eq("user_id", e.user_id).eq("workbook_id", e.workbook_id).eq("milestone_id", "m12").maybeSingle();
    const progressOk = await hasConsent(db, e.user_id, "progress_emails");
    const links = progressOk ? await unsubscribeLinks(db, e.user_id, "progress") : undefined;
    const base = { to: me.email, userId: e.user_id, links };

    if (progressOk && !done && away >= 7) {
      const kind = away >= 30 ? "inactive_30" : away >= 14 ? "inactive_14" : "inactive_7";
      const next = WORKBOOKS[e.workbook_id]?.weeks[String(e.current_week)]?.[0];
      const r = await send(db, { ...base, template: kind, dedupe: `${kind}:${e.user_id}:${e.workbook_id}:${absence}`, vars: { name: me.name, next_step: next } });
      bump(kind + ":" + r);
    }
    if (progressOk && done && Date.now() - Date.parse(done.earned_at) > 25 * DAY) {
      const month = new Date().toISOString().slice(0, 7);
      const r = await send(db, { ...base, template: "maintenance", dedupe: `maint:${e.user_id}:${e.workbook_id}:${month}`, vars: { name: me.name } });
      bump("maintenance:" + r);
    }
    if (away >= 30) {
      const pass = await activePass(e.user_id);
      if (pass && !pass.cancel_at) {
        const r = await send(db, { to: me.email, userId: e.user_id, template: "pass_away", dedupe: `passaway:${e.user_id}:${absence}`,
          vars: { name: me.name, price: await passPrice(e.user_id, pass.product_id), next_date: longDate(pass.current_period_end, me.tz) } });
        bump("pass_away:" + r);
      }
    }
  }

  // Renewal notices and terms reminders go to every pass holder, whether or not they are active.
  const { data: subs } = await db.from("subscriptions").select("*").in("status", ["active", "trialing", "past_due"]);
  for (const s of subs ?? []) {
    if (s.cancel_at || !s.current_period_end || skip.has(s.user_id)) continue;
    const me = await userEmail(db, s.user_id);
    if (!me.email || !daytime(me.tz)) continue;
    const daysLeft = (Date.parse(s.current_period_end) - Date.now()) / DAY;
    const price = await passPrice(s.user_id, s.product_id);
    if (s.product_id === "pass:annual") {
      for (const n of [45, 14]) {
        if (daysLeft <= n && daysLeft > (n === 45 ? 14 : 0)) {
          const r = await send(db, { to: me.email, userId: s.user_id, template: "renewal_notice", dedupe: `renew${n}:${s.id}:${s.current_period_end}`,
            vars: { name: me.name, renew_date: longDate(s.current_period_end, me.tz), price } });
          bump(`renewal_${n}:` + r);
        }
      }
    } else {
      // Monthly passes: a terms reminder every six months (UK DMCC) which also covers the yearly US reminder.
      const n = Math.floor((Date.now() - Date.parse(s.created_at)) / (182 * DAY));
      if (n >= 1) {
        const r = await send(db, { to: me.email, userId: s.user_id, template: "pass_terms_reminder", dedupe: `terms:${s.id}:${n}`,
          vars: { name: me.name, price, period_words: "every month", next_date: longDate(s.current_period_end, me.tz) } });
        bump("terms:" + r);
      }
    }
  }
  return { ...out, mode: cfg.email_mode };
}

// ---------- events from the app ----------
const STAGE_IDS = ["map", "build", "use", "keep"];
async function event(userId: string, body: any) {
  const me = await userEmail(db, userId);
  const wb = String(body.workbook_id ?? "focus");
  if (body.kind === "welcome") {
    return { welcome: await send(db, { to: me.email, userId, template: "welcome", dedupe: `welcome:${userId}:${wb}`, vars: { name: me.name } }) };
  }
  if (body.kind === "stage_complete" && STAGE_IDS.includes(body.stage)) {
    // Check the claim against the database: the reader must have reached the week after the stage.
    const stage = WORKBOOKS[wb]?.stages[body.stage];
    const { data: e } = await db.from("enrolments").select("current_week").eq("user_id", userId).eq("workbook_id", wb).maybeSingle();
    const { count } = await db.from("exercise_completions").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("workbook_id", wb).in("week", stage?.weeks ?? []);
    if (!stage || !e || !count || e.current_week < Math.max(...stage.weeks)) return { stage: "not_complete" };
    const out: Record<string, string> = {};
    if (await hasConsent(db, userId, "progress_emails")) {
      out.email = await send(db, { to: me.email, userId, template: "stage_complete", dedupe: `stage:${userId}:${wb}:${body.stage}`,
        vars: { name: me.name, stage: body.stage, stage_name: stage.name }, links: await unsubscribeLinks(db, userId, "progress") });
    }
    out.partner = await partnerUpdate(userId, body.stage, wb);
    return out;
  }
  return { error: "unknown_event" };
}

// ---------- confirmations from the webhook ----------
export const PASS_NOUNS: Record<string, string> = { pass_monthly: "monthly all-access pass", pass_annual: "annual all-access pass" };
export const LIFETIME_NOUNS: Record<string, string> = { single: "a single workbook", set: "a topic set of four workbooks", library: "the complete library" };
async function txn(body: any) {
  const me = await userEmail(db, body.user_id);
  if (!me.email) return { skipped: "no_email" };
  if (body.kind === "purchase") {
    const { data: o } = await db.from("orders").select("id,product_id,amount_minor,currency").eq("id", body.order_id).maybeSingle();
    if (!o) return { skipped: "no_order" };
    const { data: product } = await db.from("products").select("kind").eq("id", o.product_id).maybeSingle();
    const kind = String(product?.kind ?? "");
    // The template is picked by product kind, and each template has its own fixed noun map.
    // purchase_pass reads "Your {offer_name} is active", purchase_lifetime reads "You bought {offer_name}".
    const isPass = kind in PASS_NOUNS;
    const offer = isPass ? PASS_NOUNS[kind] : LIFETIME_NOUNS[kind];
    if (!offer) { console.error("purchase_unknown_kind", o.product_id); return { skipped: "unknown_product_kind" }; }
    let next = "";
    if (isPass) { const p = await activePass(body.user_id); next = longDate(p?.current_period_end, me.tz); }
    return {
      purchase: await send(db, { to: me.email, userId: body.user_id, template: isPass ? "purchase_pass" : "purchase_lifetime", dedupe: `purchase:${o.id}`,
        vars: { name: me.name, offer_name: offer, price: money(o.amount_minor, o.currency), period_words: kind === "pass_annual" ? "every year" : "every month", next_date: next } }),
    };
  }
  if (body.kind === "cancellation") {
    // Vars for the email engineer: cancel_mode is "period_end" (access runs to end_date) or "immediate"
    // (ended now, inside 14 days); refund_amount is formatted money or "" when there is no refund.
    return { cancellation: await send(db, { to: me.email, userId: body.user_id, template: "cancellation", dedupe: `cancel:${body.subscription_id}:${body.end_date}`,
      vars: { name: me.name, end_date: longDate(body.end_date, me.tz), cancel_mode: String(body.cancel_mode ?? "period_end"),
        refund_amount: String(body.refund_amount ?? ""), refund_status: String(body.refund_status ?? "none") } }) };
  }
  if (body.kind === "payment_failed") {
    // From the payment webhook (invoice.payment_failed). One email per failed invoice.
    return { payment_failed: await send(db, { to: me.email, userId: body.user_id, template: "payment_failed", dedupe: `payfail:${String(body.invoice_id ?? "")}`,
      vars: { name: me.name, price: String(body.amount ?? "") } }) };
  }
  return { error: "unknown_txn" };
}

// ---------- one of everything, to the test inbox ----------
async function testAll() {
  const cfg = await config(db);
  const sample = {
    name: "Liam", reader_name: "Liam", partner_name: "Sam", offer_name: "a single workbook", price: "$14.99", period_words: "every month",
    next_date: "November 30, 2026", renew_date: "November 30, 2026", end_date: "November 30, 2026", stage: "build", stage_name: "Build",
    share_level: 3, workbook_name: "Focus", note: "This week was a good one.", next_step: "Turn down your phone's noise",
    accept_url: `${cfg.app_url}/#partner-demo`, decline_url: `${cfg.app_url}/#partner-demo`, suggestions: "Still Standing: steady steps for hard moments|Bearing It Better: small steps for long, stressful seasons|When Everything Changes: a gentle guide through big losses",
  };
  const stamp = Date.now();
  const results: Record<string, string> = {};
  const perTemplate: Record<string, Record<string, unknown>> = {
    stage_complete: { stage: "map", stage_name: "Map" },
    purchase_pass: { offer_name: PASS_NOUNS.pass_monthly, period_words: "every month" },
    purchase_lifetime: { offer_name: LIFETIME_NOUNS.single },
    cancellation: { cancel_mode: "immediate", refund_amount: "$9.12", refund_status: "succeeded" },
    account_deleted: { deletion_date: "November 30, 2026", undo_url: `${cfg.app_url}/#settings/undo-delete`, refund_amount: "$9.12", refund_status: "pending" },
    export_code: { code: "482913", expires_minutes: 10 },
    history_downloaded: { when: "October 1, 2026 at 8:14 PM BST", device: "iPhone, Safari" },
    passkey_added: { when: "October 1, 2026 at 8:14 PM BST", device: "iPhone, Safari" },
    password_changed: { when: "October 1, 2026 at 8:14 PM BST", device: "iPhone, Safari" },
    email_changed: { when: "October 1, 2026 at 8:14 PM BST", device: "iPhone, Safari", new_email: "l***@example.com" },
    new_workbook_available: { workbook_title: "Bearing It Better", workbook_line: "Twelve weeks of small steps for long, stressful seasons." },
  };
  for (const t of Object.keys(TEMPLATES)) {
    const vars = { ...sample, ...(perTemplate[t] ?? {}) } as typeof sample;
    results[t] = await send(db, {
      to: cfg.test_recipient, template: t, vars, dedupe: `test:${t}:${stamp}`, readerName: "Liam",
      links: { unsubscribe: `${cfg.app_url}/#settings`, stop: `${cfg.app_url}/#partner-demo`, report: `${cfg.app_url}/#partner-demo`, manage: `${cfg.app_url}/#settings` },
    });
    await new Promise((r) => setTimeout(r, 600)); // stay under the provider's rate limit
  }
  return results;
}

export async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS() });
  const url = new URL(req.url);
  try {
    // One-click unsubscribe from a mail app's own button (POST to the query-string URL, RFC 8058),
    // or from the app's confirm page (JSON body). A GET never acts: it goes to the confirm page.
    const q = url.searchParams;
    if (q.get("op") === "unsubscribe" && req.method !== "POST") {
      const cfg = await config(db);
      const back = new URLSearchParams({ a: "unsubscribe", u: q.get("u") ?? "", k: q.get("k") ?? "", s: q.get("s") ?? "" });
      return new Response(null, { status: 303, headers: { ...CORS(), Location: `${cfg.app_url}/respond.html?${back}` } });
    }
    const body = q.get("op") === "unsubscribe" ? { op: "unsubscribe", u: q.get("u"), k: q.get("k"), s: q.get("s") }
      : req.method === "POST" ? await req.json().catch(() => ({})) : null;
    if (!body) return json({ error: "Use POST" }, 405);
    if (body.op === "unsubscribe") {
      const u = String(body.u ?? ""), k = String(body.k ?? ""), s = String(body.s ?? "");
      const types: Record<string, [string, string]> = { progress: ["progress_emails", "progress_emails_v1"], personal: ["personalised_recs", "personalised_recs_v1"], marketing: ["general_marketing", "general_marketing_v1"] };
      if (!/^[0-9a-f-]{36}$/.test(u) || !types[k] || !await checkUnsubscribe(db, u, k, s)) return json({ title: "Link not recognised", message: "This link is not valid. You can change your email settings in the app." }, 400);
      const { error: cErr } = await db.from("consents").insert({ user_id: u, consent_type: types[k][0], version_id: types[k][1], granted: false });
      if (cErr) { console.error("unsubscribe_failed", cErr.code); return json({ title: "Something went wrong", message: "We could not record that. Please try again, or change your email settings in the app." }, 500); }
      return json({ title: "You are unsubscribed", message: k === "progress" ? "You will not get progress emails or reminders any more. You can turn them back on in Settings." : "You will not get these emails any more." });
    }
    if (body.op === "run" || body.op === "txn" || body.op === "test_all") {
      if (!await isServer(req)) return json({ error: "Not allowed" }, 403);
      if (body.op === "run") return json(await run());
      if (body.op === "txn") return json(await txn(body));
      return json(await testAll());
    }
    if (body.op === "event") {
      const user = await readerFromJwt(req);
      if (!user) return json({ error: "Please sign in first" }, 401);
      return json(await event(user.id, body));
    }
    return json({ error: "Unknown request" }, 400);
  } catch (e) {
    console.error("notify_failed", (e as Error).message);
    return json({ error: "Something went wrong" }, 500);
  }
}
