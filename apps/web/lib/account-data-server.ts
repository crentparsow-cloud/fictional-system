import "server-only";
import { buildAccountData, type AccountData, type AccountDataInput, type Row } from "@/lib/account-data";
import { loadAllMarks } from "@/lib/marks-server";
import { loadEntries } from "@/lib/then-now-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";

type UserClient = Awaited<ReturnType<typeof createUserClient>>;
type AdminClient = ReturnType<typeof createAdminClient>;

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
    () => supabase.from("enrolments").select("id, workbooks(code, title)").eq("user_id", userId),
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
  ]);

  const pairs = [...pairsMade, ...pairsJoined];
  const wbIds = [...new Set([...workbookGifts, ...pairs, ...packs].map((r) => r.workbook_id).filter((x): x is string => typeof x === "string"))];
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
    unavailable: [...new Set(unavailable)],
  };
  return buildAccountData(input);
}
