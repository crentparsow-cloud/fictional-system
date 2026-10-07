import { createRateLimiter, type RateLimiter } from "@/lib/rate-limit";
import {
  cleanEmail,
  cleanName,
  cleanNote,
  cleanReply,
  hashToken,
  inviteErrorNotice,
  mintToken,
  parseOutcome,
  parseShareLevel,
  type PartnerNotice,
  type RespondAction,
  type RespondOutcome,
  type ShareLevel,
} from "@/lib/partner";
import type { PartnerMail } from "@/lib/partner-mail";

/**
 * The three things that happen around a check-in partner, with the
 * database and the mailer passed in so they can be tested without either:
 *
 *   invite        the reader asks someone (You page form)
 *   respond       the partner acts on a link (/respond/[token])
 *   stage update  progress reaches a new stage (after /api/progress)
 *
 * Tokens are minted here and only their hashes go to the database. The
 * plain token goes into the email and nowhere else: not a log, not a
 * redirect the reader can see.
 */

export type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;

/** One per server instance; the database holds the real limit (three in 30 days). */
export const inviteLimiter: RateLimiter = createRateLimiter({ limit: 5, windowMs: 60 * 60 * 1000 });

function firstRow<T>(data: unknown): T | null {
  if (Array.isArray(data)) return (data[0] as T | undefined) ?? null;
  return (data as T | null) ?? null;
}

// ---------------------------------------------------------------------------
// Invite
// ---------------------------------------------------------------------------

export interface InviteInput {
  readerName: unknown;
  partnerName: unknown;
  email: unknown;
  shareLevel: unknown;
  includeWellbeing: unknown;
}

export type ParsedInvite = { readerName: string; partnerName: string; email: string; shareLevel: ShareLevel; includeWellbeing: boolean };

export function parseInvite(i: InviteInput): { ok: true; invite: ParsedInvite } | { ok: false; notice: PartnerNotice } {
  const readerName = cleanName(i.readerName);
  const partnerName = cleanName(i.partnerName);
  const email = cleanEmail(i.email);
  const shareLevel = parseShareLevel(i.shareLevel);
  if (!readerName || !partnerName || !email) return { ok: false, notice: "check-form" };
  if (!shareLevel) return { ok: false, notice: "pick-level" };
  // A checkbox: only the literal "yes" counts as the explicit choice.
  return { ok: true, invite: { readerName, partnerName, email, shareLevel, includeWellbeing: i.includeWellbeing === "yes" } };
}

export async function invitePartner(
  input: InviteInput,
  deps: { userId: string; readerEmail: string | null; rpc: Rpc; mail: PartnerMail; limiter?: RateLimiter; mint?: () => string },
): Promise<PartnerNotice> {
  const parsed = parseInvite(input);
  if (!parsed.ok) return parsed.notice;
  const inv = parsed.invite;
  if (deps.readerEmail && deps.readerEmail.trim().toLowerCase() === inv.email) return "self";
  if (deps.limiter && !deps.limiter.hit(deps.userId)) return "rate-limited";

  const mint = deps.mint ?? (() => mintToken());
  const respond = mint();
  const report = mint();
  const { data, error } = await deps.rpc("partner_invite", {
    p_user: deps.userId,
    p_reader_name: inv.readerName,
    p_partner_name: inv.partnerName,
    p_email: inv.email,
    p_share_level: inv.shareLevel,
    p_include_wellbeing: inv.includeWellbeing,
    p_respond_hash: await hashToken(respond),
    p_report_hash: await hashToken(report),
  });
  if (error || typeof data !== "string") return inviteErrorNotice(error?.code);

  const sent = await deps.mail.invite({
    to: inv.email,
    readerName: inv.readerName,
    partnerName: inv.partnerName,
    shareLevel: inv.shareLevel,
    respondToken: respond,
    reportToken: report,
  });
  // The row and tokens stand even if the mail failed: the reader sees
  // "invited" and can stop and try again. The status alone is logged.
  if (sent.status === "failed" || sent.status === "refused") console.error("partner_invite_mail", sent.status, sent.reason ?? "");
  return "invited";
}

// ---------------------------------------------------------------------------
// Respond
// ---------------------------------------------------------------------------

type ActRow = { outcome: string; partner_id: string | null; reader_email: string | null; reader_name: string | null; partner_name: string | null; partner_email: string | null };

export async function respondToLink(
  token: string,
  action: RespondAction,
  message: unknown,
  deps: { rpc: Rpc; mail: PartnerMail },
): Promise<{ outcome: RespondOutcome; readerName: string }> {
  const reply = action === "reply" ? cleanReply(message) : null;
  const { data, error } = await deps.rpc("partner_link_act", {
    p_token_hash: await hashToken(token),
    p_action: action,
    p_message: reply,
  });
  if (error) return { outcome: "failed", readerName: "" };
  const row = firstRow<ActRow>(data);
  const outcome = parseOutcome(row?.outcome) ?? "failed";
  const readerName = cleanName(row?.reader_name);

  try {
    if (outcome === "accepted" && row?.reader_email && row.partner_id) {
      await deps.mail.accepted({ to: row.reader_email, partnerName: cleanName(row.partner_name), partnerId: row.partner_id });
    }
    if (outcome === "stopped" && row?.partner_email && row.partner_id) {
      await deps.mail.stopped({ to: row.partner_email, readerName, partnerName: cleanName(row.partner_name), stoppedBy: "partner", partnerId: row.partner_id });
    }
  } catch (e) {
    console.error("partner_respond_mail", e instanceof Error ? e.name : "unknown");
  }
  return { outcome, readerName };
}

// ---------------------------------------------------------------------------
// Stop sharing (reader). The database call runs as the reader; this sends
// the partner_stopped email when the partner had said yes.
// ---------------------------------------------------------------------------

type StopRow = { partner_id: string; partner_name: string; partner_email: string; reader_name: string; notify: boolean };

export async function stopSharing(deps: { rpc: Rpc; mail: PartnerMail }): Promise<PartnerNotice> {
  const { data, error } = await deps.rpc("partner_stop", {});
  if (error) return "failed";
  const row = firstRow<StopRow>(data);
  if (row?.notify) {
    const r = await deps.mail.stopped({
      to: row.partner_email,
      readerName: cleanName(row.reader_name),
      partnerName: cleanName(row.partner_name),
      stoppedBy: "reader",
      partnerId: row.partner_id,
    });
    if (r.status === "failed") console.error("partner_stop_mail", r.status, r.reason ?? "");
  }
  return "stopped";
}

export async function saveSettings(
  input: { shareLevel: unknown; includeWellbeing: unknown; note: unknown },
  deps: { rpc: Rpc },
): Promise<PartnerNotice> {
  const level = parseShareLevel(input.shareLevel);
  if (!level) return "pick-level";
  const raw = String(input.note ?? "");
  const note = cleanNote(raw);
  // Refuse rather than silently strip: the reader should know what goes out.
  if (raw.trim() && note !== raw.normalize("NFKC").replace(/\s+/g, " ").trim()) return "note-invalid";
  const { error } = await deps.rpc("partner_settings", {
    p_share_level: level,
    p_include_wellbeing: input.includeWellbeing === "yes",
    p_note: note || null,
  });
  if (error) return error.code === "AKP02" ? "note-invalid" : "failed";
  return "saved";
}

// ---------------------------------------------------------------------------
// Stage update
// ---------------------------------------------------------------------------

type StageRow = {
  outcome: string;
  partner_id: string | null;
  partner_name: string | null;
  partner_email: string | null;
  reader_name: string | null;
  share_level: number | null;
  stage_number: number | null;
  stage_count: number | null;
  note: string | null;
};

/** After a progress event. Best effort: never throws, returns what happened. */
export async function sendStageUpdate(enrolmentId: string, deps: { rpc: Rpc; mail: PartnerMail; mint?: () => string }): Promise<string> {
  try {
    const mint = deps.mint ?? (() => mintToken());
    const stop = mint();
    const reply = mint();
    const { data, error } = await deps.rpc("partner_stage_update", {
      p_enrolment: enrolmentId,
      p_stop_hash: await hashToken(stop),
      p_reply_hash: await hashToken(reply),
    });
    if (error) return "error";
    const row = firstRow<StageRow>(data);
    if (!row || row.outcome !== "send") return row?.outcome ?? "error";
    const level = parseShareLevel(row.share_level);
    if (!level || !row.partner_email || !row.stage_number || !row.stage_count) return "error";
    const r = await deps.mail.update({
      to: row.partner_email,
      readerName: cleanName(row.reader_name),
      partnerName: cleanName(row.partner_name),
      shareLevel: level,
      stageNumber: row.stage_number,
      stageCount: row.stage_count,
      note: level >= 3 && row.note ? cleanNote(row.note) : null,
      stopToken: stop,
      replyToken: reply,
    });
    return r.status;
  } catch (e) {
    console.error("partner_stage_update", e instanceof Error ? e.name : "unknown");
    return "error";
  }
}
