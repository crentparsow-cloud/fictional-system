import "server-only";
import { buildAccountData, type AccountData, type AccountDataInput, type Row } from "@/lib/account-data";
import { loadAllMarks } from "@/lib/marks-server";
import { loadEntries } from "@/lib/then-now-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";

type UserClient = Awaited<ReturnType<typeof createUserClient>>;
type AdminClient = ReturnType<typeof createAdminClient>;

/** Every progress event on the reader's own enrolments. Read a page at a time: one request returns at most 1,000 rows. */
const PROGRESS_PAGE = 1000;
const PROGRESS_MAX_PAGES = 50;
async function loadProgressEvents(supabase: UserClient, enrolmentIds: string[]): Promise<Row[]> {
  if (enrolmentIds.length === 0) return [];
  const out: Row[] = [];
  for (let page = 0; page < PROGRESS_MAX_PAGES; page += 1) {
    const { data, error } = await supabase
      .from("progress_events")
      .select("enrolment_id, kind, ref, at")
      .in("enrolment_id", enrolmentIds)
      .order("at", { ascending: true })
      .order("id", { ascending: true })
      .range(page * PROGRESS_PAGE, (page + 1) * PROGRESS_PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as Row[];
    out.push(...rows);
    if (rows.length < PROGRESS_PAGE) break;
  }
  return out;
}

/**
 * Read everything personal that Phase B added for one reader and put it into
 * the export. Rows the reader can read under RLS are read with their own
 * client. Tables with no client grant (referrals, gifts, pairs, push, and
 * so on) are read with the service role, but only ever filtered to the
 * signed-in reader's id, which the caller has just verified. Sealed values
 * are opened here for their owner and handed on as plain text; the builder
 * never receives ciphertext.
 *
 * A section that cannot be read is named in `unavailable` and left empty,
 * so the file never claims there was nothing when the read simply failed.
 */
export async function loadAccountData(supabase: UserClient, userId: string, email: string | null, tz: string): Promise<AccountData> {
  const unavailable: string[] = [];
  let admin: AdminClient | null = null;
  try {
    admin = createAdminClient();
  } catch {
    admin = null;
  }

  async function read<T>(name: string, fn: () => PromiseLike<{ data: T | null; error: unknown } | T | null>, fallback: T, needsAdmin = false): Promise<T> {
    if (needsAdmin && !admin) {
      unavailable.push(name);
      return fallback;
    }
    try {
      const res = (await fn()) as { data?: T | null; error?: unknown } | T | null;
      if (res && typeof res === "object" && "error" in res && "data" in res) {
        if (res.error) {
          unavailable.push(name);
          return fallback;
        }
        return (res.data ?? fallback) as T;
      }
      return (res ?? fallback) as T;
    } catch {
      unavailable.push(name);
      return fallback;
    }
  }
  const a = admin as AdminClient; // only used behind needsAdmin

  const enrolmentRows = await read<Row[]>(
    "enrolments",
    () => supabase.from("enrolments").select("id, user_id, status, pace, started_at, finished_at, last_opened_at, workbooks(code, title)").eq("user_id", userId),
    [],
  );
  const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
  const enrolments = enrolmentRows.map((e) => {
    const w = one(e.workbooks as { code: string | null; title: string | null } | { code: string | null; title: string | null }[] | null);
    return { id: String(e.id), code: w?.code ?? null, title: w?.title ?? null };
  });

  const [marksLoaded, entriesLoaded] = await Promise.all([loadAllMarks(supabase, userId), loadEntries(supabase, userId)]);
  if (!marksLoaded) unavailable.push("highlights_and_notes");
  else if (marksLoaded.unreadable) unavailable.push(`highlights_and_notes (${marksLoaded.unreadable} could not be opened)`);
  if (!entriesLoaded) unavailable.push("then_and_now");

  const [
    habitSettings,
    runDays,
    milestones,
    referralCode,
    referralsMade,
    referralsReceived,
    credits,
    attribution,
    giftMemberships,
    workbookGifts,
    follows,
    titleRequests,
    newsletter,
    pushSubscriptions,
    pushDays,
    pairsMade,
    pairsJoined,
    pairFinishes,
    pairNudges,
    certificates,
    factors,
    prompts,
    optout,
    winback,
    student,
    bundles,
    packs,
    profile,
    consentHistory,
    workbookPurchases,
    subscriptions,
    entitlements,
    termsAcceptances,
    checkoutConsents,
    progressEvents,
    readerSettings,
    todaySettings,
    supportMessages,
    emailDelivery,
    groupMemberships,
    groupCheckins,
    orgSeats,
    membershipSeats,
    acknowledgements,
    invoices,
    comments,
    reminderLog,
  ] = await Promise.all([
    read<Row | null>("habit", () => supabase.from("habit_settings").select("user_id, daily_run_on, daily_goal, offer_declined_at, companion_on, usual_time_on, companion_high_water, updated_at").eq("user_id", userId).maybeSingle(), null),
    read<Row[]>("habit_run_days", () => supabase.rpc("habit_step_days", { p_tz: tz }), []).then((rows) =>
      rows.map((r) => ({ day: String(r.step_day ?? ""), steps: Number(r.step_count ?? 0) })).filter((r) => r.day),
    ),
    read<Row[]>("milestones", () => supabase.from("milestone_marks").select("user_id, kind, earned_at, seen_at").eq("user_id", userId), []),
    read<Row | null>("referrals", () => a.from("referral_codes").select("user_id, code").eq("user_id", userId).maybeSingle(), null, true),
    read<Row[]>("referrals", () => a.from("referrals").select("referrer_id, status, created_at, qualified_at, rewarded_at, reward_kind, reward_value, reward_currency").eq("referrer_id", userId), [], true),
    read<Row[]>("referrals", () => a.from("referrals").select("referred_id, status, created_at, friend_benefit, friend_benefit_value").eq("referred_id", userId), [], true),
    read<Row[]>("referrals", () => a.from("account_credits").select("user_id, amount_minor, currency, status, created_at, applied_at").eq("user_id", userId), [], true),
    read<Row | null>("referrals", () => a.from("member_attributions").select("user_id, code, created_at").eq("user_id", userId).maybeSingle(), null, true),
    read<Row[]>("gifts", () => a.from("gift_memberships").select("buyer_id, claimed_by, months, status, recipient_name, recipient_email, sender_name, message, amount_minor, currency, created_at, paid_at, claim_by, claimed_at, starts_at, ends_at").or(`buyer_id.eq.${userId},claimed_by.eq.${userId}`), [], true),
    read<Row[]>("workbook_gifts", () => a.from("workbook_gifts").select("giver_id, claimed_by, workbook_id, recipient_email, status, quarter, created_at, expires_at, claimed_at").or(`giver_id.eq.${userId},claimed_by.eq.${userId}`), [], true),
    read<Row[]>("follows", () => supabase.from("author_follows").select("user_id, created_at, authors(display_name)").eq("user_id", userId), []).then((rows) =>
      rows.map((r) => ({ ...r, author_name: one(r.authors as { display_name: string | null } | { display_name: string | null }[] | null)?.display_name ?? null })),
    ),
    read<Row[]>("title_requests", () => a.from("title_requests").select("user_id, title, author_name, note, status, created_at").eq("user_id", userId), [], true),
    email
      ? read<Row[]>("newsletter", () => a.from("newsletter_subscribers").select("email, status, created_at, confirmed_at, unsubscribed_at").eq("email", email), [], true)
      : Promise.resolve([] as Row[]),
    read<Row[]>("push", () => a.from("push_subscriptions").select("id, user_id, endpoint, created_at, last_sent_at").eq("user_id", userId), [], true),
    read<Row[]>("push", () => a.from("push_log").select("user_id, local_date").eq("user_id", userId), [], true),
    read<Row[]>("programme_pairs", () => a.from("programme_pairs").select("id, workbook_id, inviter_id, friend_id, inviter_label, friend_label, status, invited_at, accepted_at, ended_at").eq("inviter_id", userId), [], true),
    read<Row[]>("programme_pairs", () => a.from("programme_pairs").select("id, workbook_id, inviter_id, friend_id, inviter_label, friend_label, status, invited_at, accepted_at, ended_at").eq("friend_id", userId), [], true),
    read<Row[]>("programme_pairs", () => a.from("pair_finishes").select("user_id, local_date, at").eq("user_id", userId), [], true),
    read<Row[]>("programme_pairs", () => a.from("pair_nudges").select("pair_id, from_user, to_user, code, local_date").or(`from_user.eq.${userId},to_user.eq.${userId}`), [], true),
    read<Row[]>("certificates", () => supabase.from("certificates").select("user_id, enrolment_id, holder_name, created_at").eq("user_id", userId), []),
    read<Row[]>("sign_in_methods", async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      const all = (data as unknown as { all?: Row[] } | null)?.all ?? [];
      return all;
    }, []),
    read<Row[]>("prompts_dismissed", () => supabase.from("reader_prompts").select("user_id, prompt, declined_at").eq("user_id", userId), []),
    read<Row | null>("marketing", () => supabase.from("marketing_optouts").select("user_id, at").eq("user_id", userId).maybeSingle(), null),
    read<Row[]>("marketing", () => a.from("winback_log").select("user_id, kind, season, sent_at").eq("user_id", userId), [], true),
    read<Row | null>("student_verification", () => supabase.from("student_verifications").select("user_id, email_domain, verified_at, expires_at, created_at").eq("user_id", userId).maybeSingle(), null),
    read<Row[]>("purchases", () => supabase.from("bundle_purchases").select("user_id, currency, amount_minor, status, created_at, paid_at, refunded_at").eq("user_id", userId), []),
    read<Row[]>("purchases", () => a.from("org_packs").select("buyer_user_id, workbook_id, currency, amount_minor, created_at").eq("buyer_user_id", userId), [], true),
    // M19. Read with the reader's own client where RLS lets them, and always filtered to their id:
    // staff can read some of these tables for everyone, and an export must never carry another person's rows.
    // Terms and checkout consents do not grant the user_id column to clients, so those two use the service role.
    read<Row | null>("profile", () => supabase.from("profiles").select("user_id, display_name, locale, country, adult_confirmed_at, created_at, updated_at, health_consent_at, health_consent_version, faith_consent_at, faith_consent_version").eq("user_id", userId).maybeSingle(), null),
    read<Row[]>("consent_history", () => supabase.from("consent_history").select("user_id, kind, action, version, at, source").eq("user_id", userId).order("at", { ascending: true }).limit(1000), []),
    read<Row[]>("purchases", () => supabase.from("purchases").select("user_id, workbook_id, kind, channel, currency, amount_minor, tax_minor, status, created_at, paid_at, refunded_at").eq("user_id", userId).limit(1000), []),
    read<Row[]>("memberships", () => supabase.from("subscriptions").select("user_id, plan, status, current_period_end, cancel_at_period_end, cancel_at, canceled_at, ended_at, paused_from, paused_until, created_at").eq("user_id", userId), []),
    read<Row[]>("entitlements", () => supabase.from("entitlements").select("user_id, workbook_id, source, status, starts_at, ends_at, created_at").eq("user_id", userId).limit(1000), []),
    read<Row[]>("terms_and_consents", () => a.from("terms_acceptances").select("user_id, doc, version, context, was_draft, accepted_at").eq("user_id", userId).limit(1000), [], true),
    read<Row[]>("terms_and_consents", () => a.from("checkout_consents").select("user_id, kind, version, plan, workbook_id, consented_at").eq("user_id", userId).limit(1000), [], true),
    read<Row[]>("progress", () => loadProgressEvents(supabase, enrolments.map((e) => e.id)), []),
    read<Row | null>("settings", () => supabase.from("reader_settings").select("user_id, reading, updated_at").eq("user_id", userId).maybeSingle(), null),
    read<Row[]>("settings", () => supabase.from("today_settings").select("enrolment_id, user_id, reminders_on, reminder_days, reminder_time, timezone, reminders_stopped_at, review_frequency, pickup_on, updated_at").eq("user_id", userId), []),
    // Contact form messages have no client grant. Two reads, each with one plain filter, so an address is never spliced into a filter string.
    read<Row[]>("support_messages", async () => {
      const cols = "user_id, topic, name, email, message, status, consent_contact, created_at";
      const byUser = await a.from("support_messages").select(cols).eq("user_id", userId).limit(500);
      if (byUser.error) throw byUser.error;
      const byEmail = email ? await a.from("support_messages").select(cols).is("user_id", null).ilike("email", email.replace(/[\\%_]/g, (c) => `\\${c}`)).limit(500) : { data: [] as Row[], error: null };
      if (byEmail.error) throw byEmail.error;
      return [...((byUser.data ?? []) as Row[]), ...((byEmail.data ?? []) as Row[])];
    }, [], true),
    email
      ? read<Row[]>("email_delivery", () => a.rpc("email_suppression_state", { p_email: email }), [], true)
      : Promise.resolve([] as Row[]),
    // RX-5. All read with the service role and one plain filter on the reader's id, so the answer
    // does not depend on a staff or leader policy that would also return other people's rows.
    read<Row[]>("groups", () => a.from("org_group_members").select("group_id, user_id, role, accepted_at, offered_role, offered_at, count_checkins, left_at, left_reason").eq("user_id", userId).limit(1000), [], true),
    read<Row[]>("groups", () => a.from("org_group_checkins").select("group_id, user_id, unit_number, choice, counted, at").eq("user_id", userId).limit(5000), [], true),
    read<Row[]>("seats", () => a.from("org_seats").select("org_id, user_id, roster_email, claimed_at, released_at, released_reason").eq("user_id", userId).limit(1000), [], true),
    read<Row[]>("seats", () => a.from("membership_seats").select("owner_user_id, member_user_id, status, invited_at, accepted_at, ended_at").or(`owner_user_id.eq.${userId},member_user_id.eq.${userId}`).limit(1000), [], true),
    read<Row[]>("acknowledgements", () => a.from("enrolment_acknowledgements").select("enrolment_id, user_id, acknowledged_at").eq("user_id", userId).limit(1000), [], true),
    read<Row[]>("membership_invoices", () => a.from("subscription_invoices").select("user_id, status, currency, amount_minor, tax_minor, billing_reason, period_start, period_end, paid_at, failed_at, created_at").eq("user_id", userId).limit(1000), [], true),
    read<Row[]>("comments", () => a.from("workbook_comments").select("author_id, workbook_id, org_id, author_name, body, created_at").eq("author_id", userId).limit(5000), [], true),
    read<Row[]>("reminders_sent", () => a.from("reminder_log").select("user_id, enrolment_id, kind, ref, local_date, sent_at").eq("user_id", userId).limit(5000), [], true),
  ]);

  // Names for the reader's own groups, seats and comments. Looked up by the ids on their rows only.
  const groupIds = [...new Set([...groupMemberships, ...groupCheckins].map((r) => r.group_id).filter((x): x is string => typeof x === "string"))];
  const groupRows = groupIds.length ? await read<Row[]>("groups", () => a.from("org_groups").select("id, name, workbook_id").in("id", groupIds), [], true) : [];
  const groups = groupRows.map((g) => ({ id: String(g.id), name: typeof g.name === "string" ? g.name : null, workbookId: typeof g.workbook_id === "string" ? g.workbook_id : null }));
  const orgIds = [...new Set([...orgSeats, ...comments].map((r) => r.org_id).filter((x): x is string => typeof x === "string"))];
  const orgRows = orgIds.length ? await read<Row[]>("seats", () => a.from("organisations").select("id, display_name").in("id", orgIds), [], true) : [];
  const organisations = orgRows.map((o) => ({ id: String(o.id), name: typeof o.display_name === "string" ? o.display_name : null }));

  const pairs = [...pairsMade, ...pairsJoined];
  const wbIds = [...new Set([...workbookGifts, ...pairs, ...packs, ...workbookPurchases, ...entitlements, ...checkoutConsents, ...comments].map((r) => r.workbook_id).concat(groups.map((g) => g.workbookId)).filter((x): x is string => typeof x === "string"))];
  const workbooks = wbIds.length
    ? await read<{ id: string; code: string | null; title: string | null }[]>("workbooks", () => supabase.from("workbooks").select("id, code, title").in("id", wbIds), [])
    : [];
  // The enrolment list for labels also covers any workbook the reader holds.
  const input: AccountDataInput = {
    userId,
    email,
    enrolments,
    marks: (marksLoaded?.items ?? []).map((i) => ({ userId, enrolmentId: i.enrolmentId, ref: i.mark.ref, colour: i.mark.colour, note: i.mark.note, excerpt: i.mark.excerpt, updatedAt: i.mark.updatedAt })),
    thenNow: (entriesLoaded ?? []).map((e) => ({ userId, enrolmentId: e.enrolmentId, stepRef: e.stepRef, step: e.step, feeling: e.feeling, takenAt: e.takenAt })),
    habitSettings,
    runDays,
    milestones,
    referralCode,
    referralsMade,
    referralsReceived,
    credits,
    attribution,
    giftMemberships,
    workbookGifts,
    workbooks,
    follows,
    titleRequests,
    newsletter,
    pushSubscriptions,
    pushDays,
    pairs,
    pairFinishes,
    pairNudges,
    certificates,
    credentials: factors,
    prompts,
    marketing: { optedOut: Boolean(optout), optedOutAt: typeof optout?.at === "string" ? optout.at : null, winback },
    studentVerification: student,
    bundles,
    packs,
    profile,
    consentHistory,
    workbookPurchases,
    subscriptions,
    entitlements,
    termsAcceptances,
    checkoutConsents,
    enrolmentProgress: enrolmentRows,
    progressEvents,
    readerSettings,
    todaySettings,
    supportMessages,
    emailDelivery,
    groupMemberships,
    groupCheckins,
    groups,
    orgSeats,
    organisations,
    membershipSeats,
    acknowledgements,
    invoices,
    comments,
    reminderLog,
    unavailable: [...new Set(unavailable)],
  };
  return buildAccountData(input);
}
