/**
 * The rest of the reader's personal records, for the account export (UK GDPR
 * right of access). Pure: the server loader reads rows, opens the sealed ones
 * for their owner, and hands everything here. This file decides what goes
 * into the file. It is the second line of defence after the queries:
 *
 *   - every row is kept only if it belongs to the signed-in reader;
 *   - each section lists the columns it will carry, so a column added to a
 *     table later is never exported by accident;
 *   - sealed ciphertext, tokens, hashes, card fingerprints, push keys and
 *     other people's identities are never carried.
 *
 * Added to the export on 28 Oct 2026 as `account_data`. Fields are only ever
 * added, never renamed.
 */

export type Row = Record<string, unknown>;

export interface AccountDataInput {
  userId: string;
  /** The reader's sign-in address, used only to find a newsletter subscription. */
  email: string | null;
  /** Enrolment id to the workbook it is for, from the enrolments the export already read. */
  enrolments: { id: string; code: string | null; title: string | null }[];
  /** Highlights and notes, already opened for their owner. */
  marks: { userId: string; enrolmentId: string; ref: string; colour: string; note: string; excerpt: string; updatedAt: string }[];
  /** Then and now entries, already opened for their owner. */
  thenNow: { userId: string; enrolmentId: string; stepRef: string; step: string; feeling: number; takenAt: string }[];
  habitSettings: Row | null;
  runDays: { day: string; steps: number }[];
  milestones: Row[];
  referralCode: Row | null;
  referralsMade: Row[];
  referralsReceived: Row[];
  credits: Row[];
  attribution: Row | null;
  giftMemberships: Row[];
  workbookGifts: Row[];
  /** Workbook id to code and title, for gifts, packs and certificates. */
  workbooks: { id: string; code: string | null; title: string | null }[];
  follows: Row[];
  titleRequests: Row[];
  newsletter: Row[];
  pushSubscriptions: Row[];
  pushDays: Row[];
  pairs: Row[];
  pairFinishes: Row[];
  pairNudges: Row[];
  certificates: Row[];
  credentials: Row[];
  prompts: Row[];
  marketing: { optedOut: boolean; optedOutAt: string | null; winback: Row[] };
  studentVerification: Row | null;
  bundles: Row[];
  packs: Row[];
  /** Sections the loader could not read, or rows it could not open. Said plainly in the file. */
  unavailable: string[];
}

export interface AccountData {
  /** Anything that could not be read when the file was made. Empty when all was read. */
  unavailable: string[];
  highlights_and_notes: {
    workbook_code: string | null;
    workbook_title: string | null;
    ref: string;
    colour: string;
    note: string;
    excerpt: string;
    updated_at: string;
  }[];
  then_and_now: { workbook_code: string | null; workbook_title: string | null; step_ref: string; step: string; feeling: number; taken_at: string }[];
  habit: {
    settings: {
      daily_run_on: boolean;
      daily_goal: number | null;
      offer_declined_at: string | null;
      usual_time_on: boolean;
      updated_at: string | null;
    } | null;
    run_days: { day: string; steps: number }[];
  };
  milestones: { kind: string; earned_at: string | null; seen_at: string | null }[];
  companion: { companion_on: boolean | null; high_water: number | null } | null;
  referrals: {
    your_code: string | null;
    made: { status: string; created_at: string | null; qualified_at: string | null; rewarded_at: string | null; reward_kind: string | null; reward_value: number | null; reward_currency: string | null }[];
    received: { status: string; created_at: string | null; friend_benefit: string | null; friend_benefit_value: number | null }[];
    credits: { amount_minor: number | null; currency: string | null; status: string; created_at: string | null; applied_at: string | null }[];
    author_link: { code: string; created_at: string | null } | null;
  };
  gifts: {
    bought: { months: number | null; status: string; recipient_name: string | null; recipient_email: string | null; sender_name: string | null; message: string | null; amount_minor: number | null; currency: string | null; created_at: string | null; paid_at: string | null; claim_by: string | null; claimed_at: string | null }[];
    claimed: { months: number | null; status: string; claimed_at: string | null; starts_at: string | null; ends_at: string | null }[];
  };
  workbook_gifts: {
    sent: { workbook_code: string | null; workbook_title: string | null; recipient_email: string | null; status: string; quarter: string | null; created_at: string | null; expires_at: string | null; claimed_at: string | null }[];
    received: { workbook_code: string | null; workbook_title: string | null; status: string; created_at: string | null; claimed_at: string | null }[];
  };
  follows: { author: string | null; followed_at: string | null }[];
  title_requests: { title: string; author_name: string | null; note: string | null; status: string; created_at: string | null }[];
  newsletter: { status: string; subscribed_at: string | null; confirmed_at: string | null; unsubscribed_at: string | null } | null;
  push: { devices: { id: string; endpoint_host: string | null; added_at: string | null; last_sent_at: string | null }[]; days_sent: string[] };
  programme_pairs: {
    pairs: { workbook_code: string | null; workbook_title: string | null; role: "inviter" | "friend"; your_label: string | null; status: string; invited_at: string | null; accepted_at: string | null; ended_at: string | null }[];
    finishes: { local_date: string; at: string | null }[];
    nudges_sent: { code: string; local_date: string }[];
    nudges_received: { code: string; local_date: string }[];
  };
  certificates: { workbook_code: string | null; workbook_title: string | null; holder_name: string | null; created_at: string | null }[];
  sign_in_methods: { type: string; name: string | null; status: string; added_at: string | null }[];
  prompts_dismissed: { prompt: string; declined_at: string | null }[];
  marketing: { opted_out: boolean; opted_out_at: string | null; win_back_emails: { kind: string; season: string; sent_at: string | null }[] };
  student_verification: { email_domain: string | null; verified_at: string | null; expires_at: string | null; created_at: string | null } | null;
  purchases: {
    bundles: { currency: string | null; amount_minor: number | null; status: string; created_at: string | null; paid_at: string | null; refunded_at: string | null }[];
    group_packs: { workbook_code: string | null; workbook_title: string | null; currency: string | null; amount_minor: number | null; created_at: string | null }[];
  };
}

const s = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const b = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);
const byDate = (key: string) => (x: Row, y: Row) => String(x[key] ?? "").localeCompare(String(y[key] ?? ""));

/** The host of a push endpoint and nothing else. The path is the secret part. */
export function endpointHost(endpoint: unknown): string | null {
  if (typeof endpoint !== "string") return null;
  try {
    return new URL(endpoint).host || null;
  } catch {
    return null;
  }
}

export function buildAccountData(input: AccountDataInput): AccountData {
  const uid = input.userId;
  const mine = (rows: Row[], ...keys: string[]) => rows.filter((r) => keys.some((k) => r[k] === uid));
  const enrol = new Map(input.enrolments.map((e) => [e.id, e]));
  const wb = new Map(input.workbooks.map((w) => [w.id, w]));
  const ownEnrolment = (id: string) => enrol.get(id);
  const wbOf = (id: unknown) => (typeof id === "string" ? wb.get(id) : undefined);

  const highlights = input.marks
    .filter((m) => m.userId === uid && enrol.has(m.enrolmentId))
    .map((m) => ({
      workbook_code: ownEnrolment(m.enrolmentId)?.code ?? null,
      workbook_title: ownEnrolment(m.enrolmentId)?.title ?? null,
      ref: m.ref,
      colour: m.colour,
      note: m.note,
      excerpt: m.excerpt,
      updated_at: m.updatedAt,
    }))
    .sort((x, y) => x.updated_at.localeCompare(y.updated_at));

  const thenNow = input.thenNow
    .filter((t) => t.userId === uid && enrol.has(t.enrolmentId))
    .map((t) => ({
      workbook_code: ownEnrolment(t.enrolmentId)?.code ?? null,
      workbook_title: ownEnrolment(t.enrolmentId)?.title ?? null,
      step_ref: t.stepRef,
      step: t.step,
      feeling: t.feeling,
      taken_at: t.takenAt,
    }))
    .sort((x, y) => x.taken_at.localeCompare(y.taken_at));

  const hs = input.habitSettings && input.habitSettings.user_id === uid ? input.habitSettings : null;
  const settings = hs
    ? {
        daily_run_on: hs.daily_run_on === true,
        daily_goal: n(hs.daily_goal),
        offer_declined_at: s(hs.offer_declined_at),
        usual_time_on: hs.usual_time_on === true,
        updated_at: s(hs.updated_at),
      }
    : null;

  const code = input.referralCode && input.referralCode.user_id === uid ? s(input.referralCode.code) : null;
  const attribution = input.attribution && input.attribution.user_id === uid && s(input.attribution.code)
    ? { code: s(input.attribution.code)!, created_at: s(input.attribution.created_at) }
    : null;

  const email = input.email?.trim().toLowerCase() ?? null;
  const sub = email ? input.newsletter.find((r) => String(r.email ?? "").trim().toLowerCase() === email) : undefined;

  const pairs = mine(input.pairs, "inviter_id", "friend_id").sort(byDate("invited_at"));
  const ownPairIds = new Set(pairs.map((p) => p.id));
  const optedOut = input.marketing.optedOut;

  return {
    unavailable: [...input.unavailable],
    highlights_and_notes: highlights,
    then_and_now: thenNow,
    habit: {
      settings,
      run_days: input.runDays.map((d) => ({ day: d.day, steps: d.steps })),
    },
    milestones: mine(input.milestones, "user_id")
      .sort(byDate("earned_at"))
      .map((m) => ({ kind: s(m.kind) ?? "unknown", earned_at: s(m.earned_at), seen_at: s(m.seen_at) })),
    companion: hs ? { companion_on: b(hs.companion_on), high_water: n(hs.companion_high_water) } : null,
    referrals: {
      your_code: code,
      made: mine(input.referralsMade, "referrer_id")
        .sort(byDate("created_at"))
        .map((r) => ({
          status: s(r.status) ?? "unknown",
          created_at: s(r.created_at),
          qualified_at: s(r.qualified_at),
          rewarded_at: s(r.rewarded_at),
          reward_kind: s(r.reward_kind),
          reward_value: n(r.reward_value),
          reward_currency: s(r.reward_currency),
        })),
      received: mine(input.referralsReceived, "referred_id")
        .sort(byDate("created_at"))
        .map((r) => ({
          status: s(r.status) ?? "unknown",
          created_at: s(r.created_at),
          friend_benefit: s(r.friend_benefit),
          friend_benefit_value: n(r.friend_benefit_value),
        })),
      credits: mine(input.credits, "user_id")
        .sort(byDate("created_at"))
        .map((c) => ({ amount_minor: n(c.amount_minor), currency: s(c.currency), status: s(c.status) ?? "unknown", created_at: s(c.created_at), applied_at: s(c.applied_at) })),
      author_link: attribution,
    },
    gifts: {
      bought: mine(input.giftMemberships, "buyer_id")
        .sort(byDate("created_at"))
        .map((g) => ({
          months: n(g.months),
          status: s(g.status) ?? "unknown",
          recipient_name: s(g.recipient_name),
          recipient_email: s(g.recipient_email),
          sender_name: s(g.sender_name),
          message: s(g.message),
          amount_minor: n(g.amount_minor),
          currency: s(g.currency),
          created_at: s(g.created_at),
          paid_at: s(g.paid_at),
          claim_by: s(g.claim_by),
          claimed_at: s(g.claimed_at),
        })),
      claimed: mine(input.giftMemberships, "claimed_by")
        .sort(byDate("claimed_at"))
        .map((g) => ({ months: n(g.months), status: s(g.status) ?? "unknown", claimed_at: s(g.claimed_at), starts_at: s(g.starts_at), ends_at: s(g.ends_at) })),
    },
    workbook_gifts: {
      sent: mine(input.workbookGifts, "giver_id")
        .sort(byDate("created_at"))
        .map((g) => ({
          workbook_code: wbOf(g.workbook_id)?.code ?? null,
          workbook_title: wbOf(g.workbook_id)?.title ?? null,
          recipient_email: s(g.recipient_email),
          status: s(g.status) ?? "unknown",
          quarter: s(g.quarter),
          created_at: s(g.created_at),
          expires_at: s(g.expires_at),
          claimed_at: s(g.claimed_at),
        })),
      received: mine(input.workbookGifts, "claimed_by")
        .sort(byDate("created_at"))
        .map((g) => ({
          workbook_code: wbOf(g.workbook_id)?.code ?? null,
          workbook_title: wbOf(g.workbook_id)?.title ?? null,
          status: s(g.status) ?? "unknown",
          created_at: s(g.created_at),
          claimed_at: s(g.claimed_at),
        })),
    },
    follows: mine(input.follows, "user_id")
      .sort(byDate("created_at"))
      .map((f) => ({ author: s(f.author_name), followed_at: s(f.created_at) })),
    title_requests: mine(input.titleRequests, "user_id")
      .sort(byDate("created_at"))
      .map((t) => ({ title: s(t.title) ?? "", author_name: s(t.author_name), note: s(t.note), status: s(t.status) ?? "new", created_at: s(t.created_at) })),
    newsletter: sub
      ? { status: s(sub.status) ?? "unknown", subscribed_at: s(sub.created_at), confirmed_at: s(sub.confirmed_at), unsubscribed_at: s(sub.unsubscribed_at) }
      : null,
    push: {
      devices: mine(input.pushSubscriptions, "user_id")
        .sort(byDate("created_at"))
        .map((p) => ({ id: s(p.id) ?? "", endpoint_host: endpointHost(p.endpoint), added_at: s(p.created_at), last_sent_at: s(p.last_sent_at) })),
      days_sent: mine(input.pushDays, "user_id").map((p) => s(p.local_date)).filter((d): d is string => d !== null).sort(),
    },
    programme_pairs: {
      pairs: pairs.map((p) => {
        const role = p.inviter_id === uid ? "inviter" : "friend";
        return {
          workbook_code: wbOf(p.workbook_id)?.code ?? null,
          workbook_title: wbOf(p.workbook_id)?.title ?? null,
          role: role as "inviter" | "friend",
          your_label: s(role === "inviter" ? p.inviter_label : p.friend_label),
          status: s(p.status) ?? "unknown",
          invited_at: s(p.invited_at),
          accepted_at: s(p.accepted_at),
          ended_at: s(p.ended_at),
        };
      }),
      finishes: mine(input.pairFinishes, "user_id")
        .sort(byDate("local_date"))
        .map((f) => ({ local_date: s(f.local_date) ?? "", at: s(f.at) })),
      nudges_sent: mine(input.pairNudges, "from_user")
        .filter((x) => ownPairIds.has(x.pair_id))
        .sort(byDate("local_date"))
        .map((x) => ({ code: s(x.code) ?? "", local_date: s(x.local_date) ?? "" })),
      nudges_received: mine(input.pairNudges, "to_user")
        .filter((x) => ownPairIds.has(x.pair_id))
        .sort(byDate("local_date"))
        .map((x) => ({ code: s(x.code) ?? "", local_date: s(x.local_date) ?? "" })),
    },
    certificates: mine(input.certificates, "user_id")
      .sort(byDate("created_at"))
      .map((c) => {
        const e = typeof c.enrolment_id === "string" ? ownEnrolment(c.enrolment_id) : undefined;
        return { workbook_code: e?.code ?? null, workbook_title: e?.title ?? null, holder_name: s(c.holder_name), created_at: s(c.created_at) };
      }),
    sign_in_methods: input.credentials.map((c) => ({
      type: s(c.factor_type) === "webauthn" ? "passkey" : (s(c.factor_type) ?? "unknown"),
      name: s(c.friendly_name),
      status: s(c.status) ?? "unknown",
      added_at: s(c.created_at),
    })),
    prompts_dismissed: mine(input.prompts, "user_id").map((p) => ({ prompt: s(p.prompt) ?? "", declined_at: s(p.declined_at) })),
    marketing: {
      opted_out: optedOut,
      opted_out_at: input.marketing.optedOutAt,
      win_back_emails: mine(input.marketing.winback, "user_id")
        .sort(byDate("sent_at"))
        .map((w) => ({ kind: s(w.kind) ?? "", season: s(w.season) ?? "", sent_at: s(w.sent_at) })),
    },
    student_verification:
      input.studentVerification && input.studentVerification.user_id === uid
        ? {
            email_domain: s(input.studentVerification.email_domain),
            verified_at: s(input.studentVerification.verified_at),
            expires_at: s(input.studentVerification.expires_at),
            created_at: s(input.studentVerification.created_at),
          }
        : null,
    purchases: {
      bundles: mine(input.bundles, "user_id")
        .sort(byDate("created_at"))
        .map((p) => ({ currency: s(p.currency), amount_minor: n(p.amount_minor), status: s(p.status) ?? "unknown", created_at: s(p.created_at), paid_at: s(p.paid_at), refunded_at: s(p.refunded_at) })),
      group_packs: mine(input.packs, "buyer_user_id")
        .sort(byDate("created_at"))
        .map((p) => ({
          workbook_code: wbOf(p.workbook_id)?.code ?? null,
          workbook_title: wbOf(p.workbook_id)?.title ?? null,
          currency: s(p.currency),
          amount_minor: n(p.amount_minor),
          created_at: s(p.created_at),
        })),
    },
  };
}

/** Section names, in file order. The tests and the HTML page use this so none is forgotten. */
export const ACCOUNT_DATA_SECTIONS = [
  "highlights_and_notes",
  "then_and_now",
  "habit",
  "milestones",
  "companion",
  "referrals",
  "gifts",
  "workbook_gifts",
  "follows",
  "title_requests",
  "newsletter",
  "push",
  "programme_pairs",
  "certificates",
  "sign_in_methods",
  "prompts_dismissed",
  "marketing",
  "student_verification",
  "purchases",
] as const satisfies readonly (keyof AccountData)[];
