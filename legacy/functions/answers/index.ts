// answers: the only way reader answers, check-ins, daily checks and self-check results reach the
// database (build plan D1.3). Values are sealed with AES-256-GCM (./_shared/seal.ts) before they are
// stored. The key comes from the ANSWERS_KEY function secret, held outside the database, so a copy of
// the database alone cannot be read. Each value is bound to its owner, so sealed values cannot be
// moved between accounts.
//
// Read-only rule (decided 1 Oct 2026): when a reader's access has ended (pass ended, free week over
// without a purchase, workbook paused, or account deletion scheduled) every load still works, and
// every save returns 403 {error:"read_only"}. The database triggers enforce the same rule.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import { seal, unseal, sealKey } from "./_shared/seal.ts";

const CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const MESSAGES: Record<string, string> = {
  read_only: "Your workbook is read-only now. You can read everything you wrote, but not change it.",
  locked: "This week is not open yet.",
  consent_required: "Please agree to storing your workbook first.",
  not_enrolled: "Please start this workbook first.",
};
const refuse = (code: string) => json({ error: code, message: MESSAGES[code] ?? "Not allowed" }, 403);
// Database trigger errors carry the code as the message: read_only, locked, consent_required.
const dbRefusal = (e: { message?: string } | null) =>
  e && MESSAGES[String(e.message)] ? refuse(String(e.message)) : null;

const ID = /^[a-z0-9_]{1,40}$/;
const WB = (s: unknown) => { const w = String(s ?? ""); return ID.test(w.replaceAll("-", "_")) ? w : null; };
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ROWS = 60, MAX_CHARS = 20000, MAX_SCORES_CHARS = 4000;
const DAY = 86400000;

type Access = { access: "full" | "read_only"; enrolled: boolean; status: string | null; current_week: number | null;
  paid: boolean; free_week_ends_at: string | null };

async function workbookAccess(admin: SupabaseClient, userId: string, wb: string): Promise<Access> {
  const [{ data: acc, error: e1 }, { data: paid, error: e2 }, { data: enr, error: e3 }] = await Promise.all([
    admin.rpc("workbook_access", { p_user: userId, p_workbook: wb }),
    admin.rpc("is_entitled", { p_user: userId, p_workbook: wb }),
    admin.from("enrolments").select("status,current_week,started_at").eq("user_id", userId).eq("workbook_id", wb).maybeSingle(),
  ]);
  if (e1 || e2 || e3) throw e1 ?? e2 ?? e3;
  let freeEnds: string | null = null;
  if (enr && !paid) {
    const { data } = await admin.rpc("free_week_ends", { p_started: enr.started_at });
    freeEnds = data ? new Date(data as string).toISOString() : null;
  }
  return { access: acc === "full" ? "full" : "read_only", enrolled: !!enr, status: enr?.status ?? null,
    current_week: enr?.current_week ?? null, paid: !!paid, free_week_ends_at: freeEnds };
}
async function accountAccess(admin: SupabaseClient, userId: string): Promise<"full" | "read_only"> {
  const { data, error } = await admin.rpc("account_access", { p_user: userId });
  if (error) throw error;
  return data === "full" ? "full" : "read_only";
}
async function hasStoreConsent(admin: SupabaseClient, userId: string) {
  const { data } = await admin.rpc("has_consent", { p_user: userId, p_type: "store" });
  return !!data;
}
const isScoreMap = (v: unknown) => !!v && typeof v === "object" && !Array.isArray(v) &&
  Object.entries(v as Record<string, unknown>).every(([k, x]) => ID.test(k) && (x === null || (typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 100)));

// ---------- daily checks ----------
async function saveDaily(admin: SupabaseClient, userId: string, b: any) {
  const wb = b.workbook_id == null ? "all" : WB(b.workbook_id);
  if (!wb) return json({ error: "Invalid workbook" }, 400);
  const date = String(b.check_date ?? "");
  const t = Date.parse(date + "T00:00:00Z");
  if (!DATE.test(date) || !Number.isFinite(t) || t > Date.now() + 2 * DAY || t < Date.now() - 8 * DAY) return json({ error: "Invalid date" }, 400);
  const score = Number(b.score);
  if (!Number.isInteger(score) || score < 0 || score > 10) return json({ error: "Invalid score" }, 400);
  const tags = Array.isArray(b.tags) ? b.tags : [];
  if (tags.length > 12 || !tags.every((x: unknown) => typeof x === "string" && x.length > 0 && x.length <= 40)) return json({ error: "Invalid tags" }, 400);
  if (await accountAccess(admin, userId) !== "full") return refuse("read_only");
  if (!await hasStoreConsent(admin, userId)) return refuse("consent_required");
  const { error } = await admin.from("daily_checks").upsert({
    user_id: userId, workbook_id: wb, check_date: date, score: null, tags: [],
    data_enc: await seal({ score, tags }, userId), updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,workbook_id,check_date" });
  if (error) return dbRefusal(error) ?? json({ error: "Could not save. Please try again." }, 500);
  return json({ ok: true });
}
async function loadDaily(admin: SupabaseClient, userId: string, b: any) {
  const from = DATE.test(String(b.from ?? "")) ? String(b.from) : new Date(Date.now() - 400 * DAY).toISOString().slice(0, 10);
  const to = DATE.test(String(b.to ?? "")) ? String(b.to) : "9999-12-31";
  let q = admin.from("daily_checks").select("workbook_id,check_date,score,tags,data_enc").eq("user_id", userId)
    .gte("check_date", from).lte("check_date", to).order("check_date");
  if (b.workbook_id != null) { const wb = WB(b.workbook_id); if (!wb) return json({ error: "Invalid workbook" }, 400); q = q.eq("workbook_id", wb); }
  const { data, error } = await q;
  if (error) throw error;
  const checks = [];
  for (const r of data ?? []) {
    let v: any = { score: r.score, tags: r.tags ?? [] };
    if (r.data_enc) v = await unseal(r.data_enc, userId);
    else if (r.score !== null) await sealLegacyDaily(admin, userId, r);
    checks.push({ workbook_id: r.workbook_id, check_date: r.check_date, score: v?.score ?? null, tags: v?.tags ?? [] });
  }
  return json({ checks, access: await accountAccess(admin, userId) });
}
async function sealLegacyDaily(admin: SupabaseClient, userId: string, r: any) {
  await admin.from("daily_checks").update({ score: null, tags: [], data_enc: await seal({ score: r.score, tags: r.tags ?? [] }, userId) })
    .eq("user_id", userId).eq("workbook_id", r.workbook_id).eq("check_date", r.check_date).is("data_enc", null);
}

// ---------- self-check results ----------
async function saveSelfcheck(admin: SupabaseClient, userId: string, wb: string, b: any) {
  const week = Number(b.taken_week);
  if (!Number.isInteger(week) || !(week === 0 || week === 6 || week === 12 || (week > 12 && week <= 104))) return json({ error: "Invalid week" }, 400);
  if (!isScoreMap(b.item_scores) || !isScoreMap(b.area_scores)) return json({ error: "Invalid scores" }, 400);
  if (JSON.stringify([b.item_scores, b.area_scores]).length > MAX_SCORES_CHARS) return json({ error: "Invalid scores" }, 400);
  const a = await workbookAccess(admin, userId, wb);
  if (!a.enrolled) return refuse("not_enrolled");
  if (a.access !== "full") return refuse("read_only");
  if (!await hasStoreConsent(admin, userId)) return refuse("consent_required");
  const { data, error } = await admin.from("selfcheck_results").insert({
    user_id: userId, workbook_id: wb, taken_week: week, item_scores: null, area_scores: null,
    scores_enc: await seal({ item_scores: b.item_scores, area_scores: b.area_scores }, userId),
  }).select("id,created_at").single();
  if (error) return dbRefusal(error) ?? json({ error: "Could not save. Please try again." }, 500);
  return json({ ok: true, id: data.id, created_at: data.created_at });
}
async function loadSelfcheck(admin: SupabaseClient, userId: string, wb: string) {
  const { data, error } = await admin.from("selfcheck_results").select("id,taken_week,item_scores,area_scores,scores_enc,created_at")
    .eq("user_id", userId).eq("workbook_id", wb).order("created_at");
  if (error) throw error;
  const results = [];
  for (const r of data ?? []) {
    let v: any = { item_scores: r.item_scores, area_scores: r.area_scores };
    if (r.scores_enc) v = await unseal(r.scores_enc, userId);
    else if (r.item_scores !== null) await sealLegacySelfcheck(admin, userId, r);
    results.push({ id: r.id, taken_week: r.taken_week, item_scores: v?.item_scores ?? {}, area_scores: v?.area_scores ?? {}, created_at: r.created_at });
  }
  return json({ results, access: (await workbookAccess(admin, userId, wb)).access });
}
async function sealLegacySelfcheck(admin: SupabaseClient, userId: string, r: any) {
  await admin.from("selfcheck_results").update({ item_scores: null, area_scores: null,
    scores_enc: await seal({ item_scores: r.item_scores, area_scores: r.area_scores }, userId) }).eq("id", r.id).is("scores_enc", null);
}

// ---------- one-off: seal every older plain row, for all readers (server only) ----------
async function resealLegacy(admin: SupabaseClient) {
  const out = { daily_checks: 0, selfcheck_results: 0, answers: 0, weekly_checkins: 0 };
  const { data: dc } = await admin.from("daily_checks").select("user_id,workbook_id,check_date,score,tags").is("data_enc", null).not("score", "is", null).limit(5000);
  for (const r of dc ?? []) { await sealLegacyDaily(admin, r.user_id, r); out.daily_checks++; }
  const { data: sc } = await admin.from("selfcheck_results").select("id,user_id,item_scores,area_scores").is("scores_enc", null).not("item_scores", "is", null).limit(5000);
  for (const r of sc ?? []) { await sealLegacySelfcheck(admin, r.user_id, r); out.selfcheck_results++; }
  const { data: an } = await admin.from("answers").select("id,user_id,value").is("value_enc", null).not("value", "is", null).limit(5000);
  for (const r of an ?? []) {
    const { error } = await admin.from("answers").update({ value: null, value_enc: await seal(r.value, r.user_id) }).eq("id", r.id).is("value_enc", null);
    if (!error) out.answers++;
  }
  const { data: ci } = await admin.from("weekly_checkins").select("user_id,workbook_id,week,answers").is("answers_enc", null).limit(5000);
  for (const r of ci ?? []) {
    if (!r.answers || !Object.keys(r.answers).length) continue;
    const { error } = await admin.from("weekly_checkins").update({ answers: {}, answers_enc: await seal(r.answers, r.user_id) })
      .eq("user_id", r.user_id).eq("workbook_id", r.workbook_id).eq("week", r.week).is("answers_enc", null);
    if (!error) out.weekly_checkins++;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid request" }, 400); }

  try {
    await sealKey();
  } catch {
    console.error("answers_key_missing");
    return json({ error: "Saving is not set up yet" }, 503);
  }

  // Server-to-server: seal older plain rows for every reader. Needs the server secret.
  if (body?.op === "reseal_legacy") {
    const given = req.headers.get("x-server-secret") ?? "";
    const { data: secret } = await admin.rpc("server_secret");
    if (!given || !secret || given !== secret) return json({ error: "Not allowed" }, 403);
    try { return json({ ok: true, sealed: await resealLegacy(admin) }); }
    catch (e) { console.error("reseal_failed", (e as Error).message); return json({ error: "Reseal failed" }, 500); }
  }

  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Please sign in first" }, 401);

  try {
    // Ops that are not tied to one workbook
    if (body.op === "save_daily") return await saveDaily(admin, user.id, body);
    if (body.op === "load_daily") return await loadDaily(admin, user.id, body);

    const wb = WB(body.workbook_id);
    if (!wb) return json({ error: "Invalid workbook" }, 400);

    if (body.op === "save_selfcheck") return await saveSelfcheck(admin, user.id, wb, body);
    if (body.op === "load_selfcheck") return await loadSelfcheck(admin, user.id, wb);

    if (body.op === "save_answers") {
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (!rows.length || rows.length > MAX_ROWS) return json({ error: "Invalid request" }, 400);
      const out = [];
      for (const r of rows) {
        const week = Number(r.week), attempt = Number(r.attempt ?? 1);
        if (!ID.test(String(r.exercise_id)) || !ID.test(String(r.field_id)) ||
            !Number.isInteger(week) || week < 1 || week > 12 || !Number.isInteger(attempt) || attempt < 1 || attempt > 5) {
          return json({ error: "Invalid request" }, 400);
        }
        if (JSON.stringify(r.value ?? null).length > MAX_CHARS) return json({ error: "That answer is too long" }, 413);
        out.push({
          user_id: user.id, workbook_id: wb, exercise_id: r.exercise_id, field_id: r.field_id, week, attempt,
          value: null, value_enc: await seal(r.value, user.id), updated_at: new Date().toISOString(),
        });
      }
      const a = await workbookAccess(admin, user.id, wb);
      if (!a.enrolled) return refuse("not_enrolled");
      if (a.access !== "full") return refuse("read_only");
      // Database triggers still enforce the paywall, read-only and the storage consent on every row.
      const { error } = await admin.from("answers").upsert(out, { onConflict: "user_id,workbook_id,exercise_id,field_id,attempt" });
      if (error) return dbRefusal(error) ?? json({ error: "Could not save. Please try again." }, 500);
      return json({ ok: true, saved: out.length });
    }

    if (body.op === "save_checkin") {
      const week = Number(body.week);
      if (!Number.isInteger(week) || week < 1 || week > 12) return json({ error: "Invalid request" }, 400);
      const answers = body.answers && typeof body.answers === "object" ? body.answers : {};
      if (JSON.stringify(answers).length > MAX_CHARS) return json({ error: "That check-in is too long" }, 413);
      const a = await workbookAccess(admin, user.id, wb);
      if (!a.enrolled) return refuse("not_enrolled");
      if (a.access !== "full") return refuse("read_only");
      const { error } = await admin.from("weekly_checkins").upsert({
        user_id: user.id, workbook_id: wb, week, short_version: !!body.short_version,
        answers: {}, answers_enc: await seal(answers, user.id),
      }, { onConflict: "user_id,workbook_id,week" });
      if (error) return dbRefusal(error) ?? json({ error: "Could not save. Please try again." }, 500);
      return json({ ok: true });
    }

    if (body.op === "load") {
      const [{ data: ans, error: e1 }, { data: ci, error: e2 }, acc] = await Promise.all([
        admin.from("answers").select("id,exercise_id,field_id,attempt,value,value_enc").eq("user_id", user.id).eq("workbook_id", wb),
        admin.from("weekly_checkins").select("week,short_version,answers,answers_enc").eq("user_id", user.id).eq("workbook_id", wb),
        workbookAccess(admin, user.id, wb),
      ]);
      if (e1 || e2) throw e1 ?? e2;
      const answers = [];
      for (const a of ans ?? []) {
        let value: unknown = a.value;
        if (a.value_enc) value = await unseal(a.value_enc, user.id);
        else if (a.value !== null) { // older plain row: seal it now (allowed even when read-only)
          await admin.from("answers").update({ value: null, value_enc: await seal(a.value, user.id) }).eq("id", a.id);
        }
        answers.push({ exercise_id: a.exercise_id, field_id: a.field_id, attempt: a.attempt, value });
      }
      const checkins = [];
      for (const c of ci ?? []) {
        let answers: unknown = c.answers;
        if (c.answers_enc) answers = await unseal(c.answers_enc, user.id);
        else if (c.answers && Object.keys(c.answers).length) {
          await admin.from("weekly_checkins").update({ answers: {}, answers_enc: await seal(c.answers, user.id) })
            .eq("user_id", user.id).eq("workbook_id", wb).eq("week", c.week);
        }
        checkins.push({ week: c.week, short_version: c.short_version, answers });
      }
      return json({ answers, checkins, access: acc.access, enrolment: {
        enrolled: acc.enrolled, status: acc.status, current_week: acc.current_week, paid: acc.paid, free_week_ends_at: acc.free_week_ends_at } });
    }

    return json({ error: "Unknown request" }, 400);
  } catch (e) {
    console.error("answers_failed", (e as Error).message);
    return json({ error: "Could not save. Please try again." }, 500);
  }
});
