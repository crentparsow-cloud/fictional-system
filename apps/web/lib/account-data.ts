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
 *
 * 25 Nov 2026 (review finding M19): the profile, the consent history,
 * workbook purchases, memberships, entitlements, terms and checkout
 * consents, progress, settings, support messages and the email delivery
 * state were missing and are now carried. Stripe ids, IP hashes and the
 * calendar token hash are not.
 *
 * 26 Nov 2026 (retest finding RX-5): group membership and check-ins,
 * organisation and shared membership seats, acknowledgements of a changed
 * edition, membership invoices, comments the reader wrote on a workbook and
 * the reminder log are now carried. Only the reader's own rows: no other
 * member of a group, no other holder of a seat, no one else's comment.
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
  /** Added for M19. Each is optional so an older caller still builds; a missing one reads as nothing held. */
  profile?: Row | null;
  consentHistory?: Row[];
  workbookPurchases?: Row[];
  subscriptions?: Row[];
  entitlements?: Row[];
  termsAcceptances?: Row[];
  checkoutConsents?: Row[];
  /** The reader's own enrolments with their dates, for the progress section. */
  enrolmentProgress?: Row[];
  /** Progress events on the reader's own enrolments. */
  progressEvents?: Row[];
  readerSettings?: Row | null;
  todaySettings?: Row[];
  /** Contact form messages sent while signed in, or from the sign-in address. */
  supportMessages?: Row[];
  /** Why the sign-in address is not being mailed (a bounce or a complaint), if it is not. */
  emailDelivery?: Row[];
  /** Added for RX-5. Optional for the same reason. */
  /** The reader's own places in organisation groups. */
  groupMemberships?: Row[];
  /** The reader's own weekly check-ins. */
  groupCheckins?: Row[];
  /** Group id to its name and workbook, only for groups the reader has a place in. */
  groups?: { id: string; name: string | null; workbookId: string | null }[];
  /** Seats the reader holds or held on an organisation's licence. */
  orgSeats?: Row[];
  /** Organisation id to its name, only for the reader's own seats and comments. */
  organisations?: { id: string; name: string | null }[];
  /** Shared membership places, as the owner who gave one or the person who took one. */
  membershipSeats?: Row[];
  /** "I have seen what changed" marks on the reader's own enrolments. */
  acknowledgements?: Row[];
  /** Membership invoices. */
  invoices?: Row[];
  /** Comments the reader wrote on a workbook in the studio. */
  comments?: Row[];
  /** Reminder emails sent to the reader. */
  reminderLog?: Row[];
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
    /** Added for M19. */
    workbooks: { workbook_code: string | null; workbook_title: string | null; kind: string | null; channel: string | null; currency: string | null; amount_minor: number | null; tax_minor: number | null; status: string; created_at: string | null; paid_at: string | null; refunded_at: string | null }[];
  };
  profile: {
    email: string | null;
    display_name: string | null;
    locale: string | null;
    country: string | null;
    adult_confirmed_at: string | null;
    created_at: string | null;
    updated_at: string | null;
    health_consent: { given_at: string; version: string | null } | null;
    faith_consent: { given_at: string; version: string | null } | null;
  } | null;
  consent_history: { kind: string; action: string; version: string | null; at: string | null; source: string | null }[];
  memberships: { plan: string | null; status: string; current_period_end: string | null; cancel_at_period_end: boolean | null; cancel_at: string | null; canceled_at: string | null; ended_at: string | null; paused_from: string | null; paused_until: string | null; created_at: string | null }[];
  entitlements: { workbook_code: string | null; workbook_title: string | null; all_workbooks: boolean; source: string | null; status: string; starts_at: string | null; ends_at: string | null; created_at: string | null }[];
  terms_and_consents: {
    terms_accepted: { doc: string; version: string | null; context: string | null; was_draft: boolean | null; accepted_at: string | null }[];
    checkout_consents: { kind: string; version: string | null; plan: string | null; workbook_code: string | null; workbook_title: string | null; consented_at: string | null }[];
  };
  progress: {
    workbooks: { workbook_code: string | null; workbook_title: string | null; status: string | null; pace: string | null; started_at: string | null; finished_at: string | null; last_opened_at: string | null }[];
    events: { workbook_code: string | null; kind: string; ref: string | null; at: string | null }[];
  };
  settings: {
    reading: Record<string, unknown> | null;
    reading_updated_at: string | null;
    reminders: { workbook_code: string | null; workbook_title: string | null; reminders_on: boolean | null; reminder_days: unknown; reminder_time: string | null; timezone: string | null; reminders_stopped_at: string | null; review_frequency: string | null; pickup_on: boolean | null; updated_at: string | null }[];
  };
  support_messages: { topic: string | null; name: string | null; email: string | null; message: string | null; status: string | null; consent_contact: boolean | null; created_at: string | null }[];
  email_delivery: { reason: string; since: string | null }[];
  /** Added for RX-5. */
  groups: {
    memberships: { group_name: string | null; workbook_code: string | null; workbook_title: string | null; role: string | null; accepted_at: string | null; offered_role: string | null; offered_at: string | null; count_checkins: boolean | null; left_at: string | null; left_reason: string | null }[];
    check_ins: { group_name: string | null; unit_number: number | null; choice: string | null; counted: boolean | null; at: string | null }[];
  };
  seats: {
    organisation: { organisation: string | null; roster_email: string | null; claimed_at: string | null; released_at: string | null; released_reason: string | null }[];
    shared_membership: { your_part: "owner" | "member"; status: string; invited_at: string | null; accepted_at: string | null; ended_at: string | null }[];
  };
  acknowledgements: { workbook_code: string | null; workbook_title: string | null; acknowledged_at: string | null }[];
  membership_invoices: { status: string; currency: string | null; amount_minor: number | null; tax_minor: number | null; billing_reason: string | null; period_start: string | null; period_end: string | null; paid_at: string | null; failed_at: string | null; created_at: string | null }[];
  comments: { workbook_code: string | null; workbook_title: string | null; organisation: string | null; written_as: string | null; body: string | null; created_at: string | null }[];
  reminders_sent: { workbook_code: string | null; workbook_title: string | null; kind: string | null; ref: string | null; local_date: string | null; sent_at: string | null }[];
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
  const groupById = new Map((input.groups ?? []).map((g) => [g.id, g]));
  const groupOf = (id: unknown) => (typeof id === "string" ? groupById.get(id) : undefined);
  const orgById = new Map((input.organisations ?? []).map((o) => [o.id, o]));
  const orgOf = (id: unknown) => (typeof id === "string" ? orgById.get(id) : undefined);

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

  // M19. The same rule as everywhere above: a row is carried only if it is the reader's own.
  const emailLower = (input.email ?? "").trim().toLowerCase();
  const pr = input.profile && input.profile.user_id === uid ? input.profile : null;
  const consentOf = (at: unknown, version: unknown) => (s(at) ? { given_at: s(at) as string, version: s(version) } : null);
  const profile = pr
    ? {
        email: input.email,
        display_name: s(pr.display_name),
        locale: s(pr.locale),
        country: s(pr.country),
        adult_confirmed_at: s(pr.adult_confirmed_at),
        created_at: s(pr.created_at),
        updated_at: s(pr.updated_at),
        health_consent: consentOf(pr.health_consent_at, pr.health_consent_version),
        faith_consent: consentOf(pr.faith_consent_at, pr.faith_consent_version),
      }
    : null;
  const ownEnrolmentRows = mine(input.enrolmentProgress ?? [], "user_id").filter((r) => typeof r.id === "string" && enrol.has(r.id as string));
  const readerSettings = input.readerSettings && input.readerSettings.user_id === uid ? input.readerSettings : null;
  const reading = readerSettings && typeof readerSettings.reading === "object" && readerSettings.reading !== null && !Array.isArray(readerSettings.reading) ? (readerSettings.reading as Record<string, unknown>) : null;

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
      workbooks: mine(input.workbookPurchases ?? [], "user_id")
        .sort(byDate("created_at"))
        .map((p) => ({
          workbook_code: wbOf(p.workbook_id)?.code ?? null,
          workbook_title: wbOf(p.workbook_id)?.title ?? null,
          kind: s(p.kind),
          channel: s(p.channel),
          currency: s(p.currency),
          amount_minor: n(p.amount_minor),
          tax_minor: n(p.tax_minor),
          status: s(p.status) ?? "unknown",
          created_at: s(p.created_at),
          paid_at: s(p.paid_at),
          refunded_at: s(p.refunded_at),
        })),
    },
    profile,
    consent_history: mine(input.consentHistory ?? [], "user_id")
      .sort(byDate("at"))
      .map((c) => ({ kind: s(c.kind) ?? "unknown", action: s(c.action) ?? "unknown", version: s(c.version), at: s(c.at), source: s(c.source) })),
    memberships: mine(input.subscriptions ?? [], "user_id")
      .sort(byDate("created_at"))
      .map((m) => ({
        plan: s(m.plan),
        status: s(m.status) ?? "unknown",
        current_period_end: s(m.current_period_end),
        cancel_at_period_end: b(m.cancel_at_period_end),
        cancel_at: s(m.cancel_at),
        canceled_at: s(m.canceled_at),
        ended_at: s(m.ended_at),
        paused_from: s(m.paused_from),
        paused_until: s(m.paused_until),
        created_at: s(m.created_at),
      })),
    entitlements: mine(input.entitlements ?? [], "user_id")
      .sort(byDate("created_at"))
      .map((x) => ({
        workbook_code: wbOf(x.workbook_id)?.code ?? null,
        workbook_title: wbOf(x.workbook_id)?.title ?? null,
        all_workbooks: x.workbook_id === null || x.workbook_id === undefined,
        source: s(x.source),
        status: s(x.status) ?? "unknown",
        starts_at: s(x.starts_at),
        ends_at: s(x.ends_at),
        created_at: s(x.created_at),
      })),
    terms_and_consents: {
      terms_accepted: mine(input.termsAcceptances ?? [], "user_id")
        .sort(byDate("accepted_at"))
        .map((t) => ({ doc: s(t.doc) ?? "unknown", version: s(t.version), context: s(t.context), was_draft: b(t.was_draft), accepted_at: s(t.accepted_at) })),
      checkout_consents: mine(input.checkoutConsents ?? [], "user_id")
        .sort(byDate("consented_at"))
        .map((c) => ({
          kind: s(c.kind) ?? "unknown",
          version: s(c.version),
          plan: s(c.plan),
          workbook_code: wbOf(c.workbook_id)?.code ?? null,
          workbook_title: wbOf(c.workbook_id)?.title ?? null,
          consented_at: s(c.consented_at),
        })),
    },
    progress: {
      workbooks: ownEnrolmentRows.sort(byDate("started_at")).map((r) => ({
        workbook_code: ownEnrolment(r.id as string)?.code ?? null,
        workbook_title: ownEnrolment(r.id as string)?.title ?? null,
        status: s(r.status),
        pace: s(r.pace),
        started_at: s(r.started_at),
        finished_at: s(r.finished_at),
        last_opened_at: s(r.last_opened_at),
      })),
      events: (input.progressEvents ?? [])
        .filter((ev) => typeof ev.enrolment_id === "string" && enrol.has(ev.enrolment_id as string))
        .sort(byDate("at"))
        .map((ev) => ({ workbook_code: ownEnrolment(ev.enrolment_id as string)?.code ?? null, kind: s(ev.kind) ?? "unknown", ref: s(ev.ref), at: s(ev.at) })),
    },
    settings: {
      reading,
      reading_updated_at: readerSettings ? s(readerSettings.updated_at) : null,
      reminders: mine(input.todaySettings ?? [], "user_id")
        .filter((t) => typeof t.enrolment_id === "string" && enrol.has(t.enrolment_id as string))
        .sort(byDate("updated_at"))
        .map((t) => ({
          workbook_code: ownEnrolment(t.enrolment_id as string)?.code ?? null,
          workbook_title: ownEnrolment(t.enrolment_id as string)?.title ?? null,
          reminders_on: b(t.reminders_on),
          reminder_days: Array.isArray(t.reminder_days) ? t.reminder_days : null,
          reminder_time: s(t.reminder_time),
          timezone: s(t.timezone),
          reminders_stopped_at: s(t.reminders_stopped_at),
          review_frequency: s(t.review_frequency),
          pickup_on: b(t.pickup_on),
          updated_at: s(t.updated_at),
        })),
    },
    // A message counts as the reader's when it was sent signed in, or from their sign-in address.
    support_messages: (input.supportMessages ?? [])
      .filter((m) => m.user_id === uid || (emailLower !== "" && typeof m.email === "string" && m.email.trim().toLowerCase() === emailLower && (m.user_id === null || m.user_id === undefined)))
      .sort(byDate("created_at"))
      .map((m) => ({ topic: s(m.topic), name: s(m.name), email: s(m.email), message: s(m.message), status: s(m.status), consent_contact: b(m.consent_contact), created_at: s(m.created_at) })),
    email_delivery: (input.emailDelivery ?? [])
      .filter((x) => s(x.reason) !== null)
      .map((x) => ({ reason: s(x.reason) as string, since: s(x.since) })),
    // RX-5. A group row is kept only when it is the reader's own place or check-in.
    groups: {
      memberships: mine(input.groupMemberships ?? [], "user_id")
        .sort(byDate("accepted_at"))
        .map((m) => ({
          group_name: groupOf(m.group_id)?.name ?? null,
          workbook_code: wbOf(groupOf(m.group_id)?.workbookId)?.code ?? null,
          workbook_title: wbOf(groupOf(m.group_id)?.workbookId)?.title ?? null,
          role: s(m.role),
          accepted_at: s(m.accepted_at),
          offered_role: s(m.offered_role),
          offered_at: s(m.offered_at),
          count_checkins: b(m.count_checkins),
          left_at: s(m.left_at),
          left_reason: s(m.left_reason),
        })),
      check_ins: mine(input.groupCheckins ?? [], "user_id")
        .sort(byDate("at"))
        .map((c) => ({ group_name: groupOf(c.group_id)?.name ?? null, unit_number: n(c.unit_number), choice: s(c.choice), counted: b(c.counted), at: s(c.at) })),
    },
    seats: {
      organisation: mine(input.orgSeats ?? [], "user_id")
        .sort(byDate("claimed_at"))
        .map((x) => ({ organisation: orgOf(x.org_id)?.name ?? null, roster_email: s(x.roster_email), claimed_at: s(x.claimed_at), released_at: s(x.released_at), released_reason: s(x.released_reason) })),
      // The other person in a shared membership is never named, whichever side the reader is on.
      shared_membership: mine(input.membershipSeats ?? [], "owner_user_id", "member_user_id")
        .sort(byDate("invited_at"))
        .map((x) => ({
          your_part: x.owner_user_id === uid ? ("owner" as const) : ("member" as const),
          status: s(x.status) ?? "unknown",
          invited_at: s(x.invited_at),
          accepted_at: s(x.accepted_at),
          ended_at: s(x.ended_at),
        })),
    },
    acknowledgements: mine(input.acknowledgements ?? [], "user_id")
      .filter((x) => typeof x.enrolment_id === "string" && enrol.has(x.enrolment_id as string))
      .sort(byDate("acknowledged_at"))
      .map((x) => ({ workbook_code: ownEnrolment(x.enrolment_id as string)?.code ?? null, workbook_title: ownEnrolment(x.enrolment_id as string)?.title ?? null, acknowledged_at: s(x.acknowledged_at) })),
    membership_invoices: mine(input.invoices ?? [], "user_id")
      .sort(byDate("created_at"))
      .map((i) => ({
        status: s(i.status) ?? "unknown",
        currency: s(i.currency),
        amount_minor: n(i.amount_minor),
        tax_minor: n(i.tax_minor),
        billing_reason: s(i.billing_reason),
        period_start: s(i.period_start),
        period_end: s(i.period_end),
        paid_at: s(i.paid_at),
        failed_at: s(i.failed_at),
        created_at: s(i.created_at),
      })),
    comments: mine(input.comments ?? [], "author_id")
      .sort(byDate("created_at"))
      .map((c) => ({
        workbook_code: wbOf(c.workbook_id)?.code ?? null,
        workbook_title: wbOf(c.workbook_id)?.title ?? null,
        organisation: orgOf(c.org_id)?.name ?? null,
        written_as: s(c.author_name),
        body: s(c.body),
        created_at: s(c.created_at),
      })),
    reminders_sent: mine(input.reminderLog ?? [], "user_id")
      .filter((x) => typeof x.enrolment_id === "string" && enrol.has(x.enrolment_id as string))
      .sort(byDate("sent_at"))
      .map((x) => ({
        workbook_code: ownEnrolment(x.enrolment_id as string)?.code ?? null,
        workbook_title: ownEnrolment(x.enrolment_id as string)?.title ?? null,
        kind: s(x.kind),
        ref: s(x.ref),
        local_date: s(x.local_date),
        sent_at: s(x.sent_at),
      })),
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
  "profile",
  "consent_history",
  "memberships",
  "entitlements",
  "terms_and_consents",
  "progress",
  "settings",
  "support_messages",
  "email_delivery",
  "groups",
  "seats",
  "acknowledgements",
  "membership_invoices",
  "comments",
  "reminders_sent",
] as const satisfies readonly (keyof AccountData)[];
