// account: things a signed-in reader can do to their own account. All ops are POST /app/account.
//   status          deletion schedule, pass, refund eligibility, access per workbook (for the Settings hub)
//   export          everything we hold about them, decrypted, as one file. Needs a single-use export
//                   token from a passkey check or an emailed code (see passkey.ts)
//   cancel_pass     within 14 days of the pass starting: ends now, unused time refunded pro rata.
//                   Later: stops renewing, access runs to the end of the paid period
//   delete          cancels billing at once and schedules deletion 7 days out. The account is read-only meanwhile
//   undo_delete     cancels a scheduled deletion (billing stays cancelled)
//   passkey_* and export_code_*   see passkey.ts
// runDueDeletions() is called by the hourly notify run and finishes deletions whose time has come.
import { admin, send, json, CORS, readerFromJwt, userEmail, longDate, longDateTime, deviceWords, money, serverSecret, config, FN_BASE } from "./_shared/mailer.ts";
import { unseal } from "./_shared/seal.ts";
import { endPass, refundEligible, type Refund } from "./billing.ts";
import { passkeyOp, consumeExportToken } from "./passkey.ts";

const db = admin();
const DAY = 86400000;
const ACTIVE = ["active", "trialing", "past_due"];

const OWN_TABLES = ["profiles", "user_settings", "consents", "orders", "subscriptions", "entitlements", "enrolments", "exercise_completions",
  "toolkit_uses", "milestones_earned", "partners", "deletion_requests"];

async function exportAll(userId: string, email: string) {
  const out: Record<string, unknown> = { exported_at: new Date().toISOString(), email };
  for (const t of OWN_TABLES) {
    const col = t === "profiles" ? "id" : "user_id";
    const { data } = await db.from(t).select("*").eq(col, userId);
    out[t] = data ?? [];
  }
  const { data: pk } = await db.from("passkeys").select("nickname,created_at,last_used_at,device_type").eq("user_id", userId);
  out.passkeys = pk ?? [];
  const { data: ans } = await db.from("answers").select("workbook_id,exercise_id,field_id,week,attempt,value,value_enc,updated_at").eq("user_id", userId);
  out.answers = await Promise.all((ans ?? []).map(async (a: any) => ({
    workbook_id: a.workbook_id, exercise_id: a.exercise_id, field_id: a.field_id, week: a.week, attempt: a.attempt, updated_at: a.updated_at,
    value: a.value_enc ? await unseal(a.value_enc, userId) : a.value,
  })));
  const { data: ci } = await db.from("weekly_checkins").select("workbook_id,week,short_version,answers,answers_enc,created_at").eq("user_id", userId);
  out.weekly_checkins = await Promise.all((ci ?? []).map(async (c: any) => ({
    workbook_id: c.workbook_id, week: c.week, short_version: c.short_version, created_at: c.created_at,
    answers: c.answers_enc ? await unseal(c.answers_enc, userId) : c.answers,
  })));
  const { data: dc } = await db.from("daily_checks").select("workbook_id,check_date,score,tags,data_enc").eq("user_id", userId).order("check_date");
  out.daily_checks = await Promise.all((dc ?? []).map(async (d: any) => {
    const v: any = d.data_enc ? await unseal(d.data_enc, userId) : { score: d.score, tags: d.tags };
    return { workbook_id: d.workbook_id, check_date: d.check_date, score: v?.score ?? null, tags: v?.tags ?? [] };
  }));
  const { data: sc } = await db.from("selfcheck_results").select("workbook_id,taken_week,item_scores,area_scores,scores_enc,created_at").eq("user_id", userId).order("created_at");
  out.selfcheck_results = await Promise.all((sc ?? []).map(async (s: any) => {
    const v: any = s.scores_enc ? await unseal(s.scores_enc, userId) : { item_scores: s.item_scores, area_scores: s.area_scores };
    return { workbook_id: s.workbook_id, taken_week: s.taken_week, created_at: s.created_at, item_scores: v?.item_scores ?? {}, area_scores: v?.area_scores ?? {} };
  }));
  return out;
}

async function activeSubs(userId: string) {
  const { data } = await db.from("subscriptions").select("*").eq("user_id", userId).in("status", ACTIVE).order("created_at", { ascending: false });
  return data ?? [];
}
const refundVars = (r: Refund | null) => ({
  refund_amount: r && r.amount_minor > 0 ? money(r.amount_minor, r.currency) : "",
  refund_minor: r?.amount_minor ?? 0,
  refund_currency: r?.currency ?? "",
  refund_status: r?.status ?? "none",
});
async function notifyTxn(body: Record<string, unknown>) {
  await fetch(`${FN_BASE}/app/notify`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-server-secret": await serverSecret(db) },
    body: JSON.stringify({ op: "txn", ...body }),
  }).catch(() => {});
}

async function tzOf(userId: string): Promise<string> {
  const { data } = await db.from("profiles").select("time_zone").eq("id", userId).maybeSingle();
  return data?.time_zone ?? "UTC";
}

// ---------- status ----------
async function status(userId: string) {
  const tz = await tzOf(userId);
  const [{ data: del }, subs, { data: enr }, { data: acc }, { count: passkeys }] = await Promise.all([
    db.from("deletion_requests").select("status,requested_at,scheduled_for").eq("user_id", userId).maybeSingle(),
    activeSubs(userId),
    db.from("enrolments").select("workbook_id,status,current_week,started_at,last_active_at").eq("user_id", userId),
    db.rpc("account_access", { p_user: userId }),
    db.from("passkeys").select("id", { count: "exact", head: true }).eq("user_id", userId),
  ]);
  const s = subs[0];
  let pass = null;
  if (s) {
    const r = await refundEligible(db, s);
    pass = { product_id: s.product_id, status: s.status, started_at: s.created_at, current_period_end: s.current_period_end,
      cancel_at: s.cancel_at, refund_eligible: r.eligible && !s.cancel_at, refund_window_ends_at: r.window_ends_at };
  }
  const enrolments = await Promise.all((enr ?? []).map(async (e: any) => {
    const [{ data: a }, { data: paid }, { data: fe }] = await Promise.all([
      db.rpc("workbook_access", { p_user: userId, p_workbook: e.workbook_id }),
      db.rpc("is_entitled", { p_user: userId, p_workbook: e.workbook_id }),
      db.rpc("free_week_ends", { p_started: e.started_at }),
    ]);
    return { ...e, access: a === "full" ? "full" : "read_only", paid: !!paid, free_week_ends_at: paid ? null : new Date(fe as string).toISOString() };
  }));
  const cfg = await config(db);
  return json({
    access: acc === "full" ? "full" : "read_only",
    deletion: del && del.status === "scheduled" ? { status: del.status, requested_at: del.requested_at, scheduled_for: del.scheduled_for, scheduled_for_words: longDate(del.scheduled_for, tz) } : null,
    pass, enrolments,
    active_count: enrolments.filter((e: any) => e.status === "active" && e.access === "full").length,
    max_active: Number(cfg.max_active_workbooks ?? 2),
    passkeys: passkeys ?? 0,
  });
}

// ---------- cancel pass ----------
async function cancelPass(userId: string) {
  const subs = await activeSubs(userId);
  const s = subs.find((x: any) => !x.cancel_at) ?? subs[0];
  const tz = await tzOf(userId);
  if (!s) return json({ error: "no_pass", message: "You do not have an active pass" }, 404);
  if (s.cancel_at) return json({ error: "already_cancelled", message: "Your pass is already cancelled.", access_until: s.cancel_at, access_until_words: longDate(s.cancel_at, tz) }, 409);
  const r = await endPass(db, s, "cancel");
  if (!r.ok) return json({ error: "stripe_failed", message: "Could not cancel just now. Please try again." }, 502);
  // Confirmation email comes from the notify function, so every email goes through one place.
  await notifyTxn({ kind: "cancellation", user_id: userId, subscription_id: s.id, end_date: r.access_until, cancel_mode: r.mode, ...refundVars(r.refund) });
  return json({ ok: true, mode: r.mode, access_until: r.access_until, access_until_words: longDate(r.access_until, tz),
    refund: r.refund ? { status: r.refund.status, amount_minor: r.refund.amount_minor, currency: r.refund.currency, amount_words: money(r.refund.amount_minor, r.refund.currency) } : null });
}

// ---------- delete (scheduled) and undo ----------
async function deleteAccount(userId: string) {
  const { data: existing } = await db.from("deletion_requests").select("status,scheduled_for").eq("user_id", userId).maybeSingle();
  if (existing && ["scheduled", "deleting", "failed"].includes(existing.status)) {
    return json({ error: "already_scheduled", message: "Your account is already scheduled for deletion.", scheduled_for: existing.scheduled_for }, 409);
  }
  // Billing stops at once, so nothing renews. If any pass cannot be cancelled, nothing is scheduled.
  let refund: Refund | null = null;
  for (const s of await activeSubs(userId)) {
    const r = await endPass(db, s, "account_deleted");
    if (!r.ok) return json({ error: "stripe_failed", message: "Could not cancel your pass, so nothing has changed. Please try again." }, 502);
    refund = r.refund ?? refund;
  }
  const cfg = await config(db);
  const grace = Number(cfg.deletion_grace_days ?? 7) || 7;
  const now = new Date();
  const when = new Date(now.getTime() + grace * DAY).toISOString();
  const { error } = await db.from("deletion_requests").upsert({
    user_id: userId, requested_at: now.toISOString(), scheduled_for: when, status: "scheduled", billing_cancelled_at: now.toISOString(),
    cancelled_at: null, completed_at: null, attempts: 0, last_error: null,
  }, { onConflict: "user_id" });
  if (error) { console.error("schedule_delete_failed", error.message); return json({ error: "failed", message: "Could not schedule the deletion. Please try again." }, 500); }
  const me = await userEmail(db, userId);
  const undoUrl = `${cfg.app_url}/#settings/undo-delete`;
  // Template wording (date and undo link) belongs to the email engineer. Vars passed:
  //   name, deletion_date (words), deletion_date_iso, undo_url, refund_amount, refund_status
  if (me.email) {
    await send(db, { to: me.email, userId, template: "account_deleted", dedupe: `delsched:${userId}:${when}`,
      vars: { name: me.name, deletion_date: longDate(when, me.tz), deletion_date_iso: when, undo_url: undoUrl, ...refundVars(refund) } }).catch((e) => console.error("delete_mail_failed", (e as Error).message));
  }
  return json({ ok: true, scheduled_for: when, scheduled_for_words: longDate(when, me.tz), undo_url: undoUrl,
    refund: refund ? { status: refund.status, amount_minor: refund.amount_minor, currency: refund.currency } : null });
}

async function undoDelete(userId: string) {
  const { data } = await db.from("deletion_requests").update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("user_id", userId).eq("status", "scheduled").gt("scheduled_for", new Date().toISOString()).select("user_id").maybeSingle();
  if (!data) return json({ error: "nothing_to_undo", message: "There is no deletion to undo." }, 404);
  return json({ ok: true, billing_restarted: false, message: "Your account will not be deleted. Your pass stays cancelled; you can buy again from Books." });
}

/** Finishes one deletion: keeps the legal minimum, then deletes the user (cascades to their data). */
async function finishDeletion(userId: string): Promise<"completed" | "failed"> {
  const fail = async (msg: string) => {
    await db.from("deletion_requests").update({ status: "failed", last_error: msg.slice(0, 300) }).eq("user_id", userId);
    console.error("delete_failed", msg);
    return "failed" as const;
  };
  const { data: u } = await db.auth.admin.getUserById(userId);
  if (!u?.user) { // already gone (an earlier run deleted the user and stopped before logging)
    await db.from("deletion_requests").update({ status: "completed", completed_at: new Date().toISOString(), last_error: null }).eq("user_id", userId);
    return "completed";
  }
  for (const s of await activeSubs(userId)) { // anything that slipped through, for example a payment retried by Stripe
    const r = await endPass(db, s, "account_deleted");
    if (!r.ok) return fail("stripe_cancel_failed");
  }
  const [{ data: orders, error: e1 }, { data: consents, error: e2 }] = await Promise.all([
    db.from("orders").select("id,product_id,amount_minor,refunded_minor,currency,status,immediate_access_consent,renewal_consent,created_at").eq("user_id", userId),
    db.from("consents").select("consent_type,version_id,granted,created_at").eq("user_id", userId),
  ]);
  if (e1 || e2) return fail("records_read_failed");
  // Keep the legal minimum: orders and consent records, for six years. Abort if this fails.
  const { error: e3 } = await db.from("deleted_account_records").upsert({ user_id: userId, email: u.user.email ?? null, orders: orders ?? [], consents: consents ?? [], deleted_at: new Date().toISOString() });
  if (e3) return fail("records_write_failed: " + e3.message);
  const { error } = await db.auth.admin.deleteUser(userId); // cascades to every table holding their data
  if (error) return fail("delete_user_failed: " + error.message);
  await db.from("deletion_requests").update({ status: "completed", completed_at: new Date().toISOString(), last_error: null }).eq("user_id", userId);
  return "completed";
}

/** Hourly: deletions whose time has come, and any that failed or stopped halfway. */
export async function runDueDeletions() {
  const out = { completed: 0, failed: 0 };
  const { data } = await db.from("deletion_requests").select("user_id,status,attempts")
    .in("status", ["scheduled", "failed", "deleting"]).lte("scheduled_for", new Date().toISOString()).lt("attempts", 10).limit(50);
  for (const d of data ?? []) {
    const { data: claimed } = await db.from("deletion_requests").update({ status: "deleting", attempts: d.attempts + 1 })
      .eq("user_id", d.user_id).eq("status", d.status).eq("attempts", d.attempts).select("user_id").maybeSingle();
    if (!claimed) continue;
    out[await finishDeletion(d.user_id)]++;
  }
  return out;
}

export async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS() });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  try {
    const user = await readerFromJwt(req);
    if (!user) return json({ error: "Please sign in first" }, 401);
    const b = await req.json().catch(() => ({}));
    if (b.op === "status") return await status(user.id);
    if (b.op === "export") {
      if (!await consumeExportToken(db, user.id, b.export_token)) {
        return json({ error: "export_token_required", message: "Please confirm it is you first." }, 403);
      }
      const data = await exportAll(user.id, user.email ?? "");
      // A security note: when and on what kind of device. No file and no link to the data.
      const me = await userEmail(db, user.id);
      if (me.email) {
        await send(db, { to: me.email, userId: user.id, template: "history_downloaded",
          vars: { name: me.name, when: longDateTime(new Date(), me.tz), device: deviceWords(req.headers.get("user-agent")) } })
          .catch((e) => console.error("export_mail_failed", (e as Error).message));
      }
      return json(data);
    }
    if (b.op === "cancel_pass") return await cancelPass(user.id);
    if (b.op === "delete") {
      if (b.confirm !== "DELETE") return json({ error: "Please type DELETE to confirm" }, 400);
      return await deleteAccount(user.id);
    }
    if (b.op === "undo_delete") return await undoDelete(user.id);
    const p = await passkeyOp(db, user, b, req.headers.get("user-agent"));
    if (p) return p;
    return json({ error: "Unknown request" }, 400);
  } catch (e) {
    console.error("account_failed", (e as Error).message);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
}
