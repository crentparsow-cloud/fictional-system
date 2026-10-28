import { describe, expect, it } from "vitest";
import { ACCOUNT_DATA_SECTIONS, buildAccountData, endpointHost, type AccountDataInput } from "@/lib/account-data";
import { buildExport, exportJson, renderExportHtml } from "@/lib/export";

const ME = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const E1 = "e1";
const E_OTHER = "e9";
const W1 = "w1";

function base(): AccountDataInput {
  return {
    userId: ME,
    email: "Me@Example.com",
    enrolments: [{ id: E1, code: "AK-AAAAA", title: "Plain Workbook" }],
    marks: [
      { userId: ME, enrolmentId: E1, ref: "p1", colour: "yellow", note: "my note", excerpt: "a line", updatedAt: "2026-10-02T00:00:00Z" },
      { userId: OTHER, enrolmentId: E_OTHER, ref: "p1", colour: "pink", note: "THEIR NOTE", excerpt: "theirs", updatedAt: "2026-10-03T00:00:00Z" },
    ],
    thenNow: [
      { userId: ME, enrolmentId: E1, stepRef: "s1", step: "walk", feeling: 4, takenAt: "2026-10-04T00:00:00Z" },
      { userId: OTHER, enrolmentId: E_OTHER, stepRef: "s1", step: "THEIR STEP", feeling: 1, takenAt: "2026-10-04T00:00:00Z" },
    ],
    habitSettings: { user_id: ME, daily_run_on: true, daily_goal: 2, offer_declined_at: null, companion_on: true, usual_time_on: false, companion_high_water: 12, updated_at: "2026-10-05T00:00:00Z" },
    runDays: [{ day: "2026-10-05", steps: 3 }],
    milestones: [
      { user_id: ME, kind: "first_step", earned_at: "2026-10-01T00:00:00Z", seen_at: null },
      { user_id: OTHER, kind: "first_week", earned_at: "2026-10-01T00:00:00Z", seen_at: null },
    ],
    referralCode: { user_id: ME, code: "ABCDEF0123" },
    referralsMade: [
      { referrer_id: ME, referred_id: OTHER, status: "rewarded", created_at: "2026-10-06T00:00:00Z", card_fingerprint: "fp_secret", reward_kind: "credit", reward_value: 500, reward_currency: "GBP" },
      { referrer_id: OTHER, referred_id: "33333333-3333-3333-3333-333333333333", status: "pending", created_at: "2026-10-06T00:00:00Z" },
    ],
    referralsReceived: [{ referred_id: ME, referrer_id: OTHER, status: "qualified", friend_benefit: "trial_days", friend_benefit_value: 14, created_at: "2026-09-01T00:00:00Z", checkout_session_id: "cs_secret" }],
    credits: [
      { user_id: ME, amount_minor: 500, currency: "GBP", status: "applied", created_at: "2026-10-07T00:00:00Z", stripe_balance_txn_id: "txn_secret" },
      { user_id: OTHER, amount_minor: 900, currency: "GBP", status: "pending", created_at: "2026-10-07T00:00:00Z" },
    ],
    attribution: { user_id: ME, code: "abcdef0123", created_at: "2026-09-02T00:00:00Z", org_id: "org-secret" },
    giftMemberships: [
      { buyer_id: ME, claimed_by: OTHER, months: 3, status: "claimed", recipient_name: "Sam", recipient_email: "sam@example.com", message: "Enjoy", claim_token: "TOKEN_SECRET", created_at: "2026-10-08T00:00:00Z" },
      { buyer_id: OTHER, claimed_by: ME, months: 1, status: "claimed", recipient_email: "me@example.com", sender_name: "SENDER", message: "THEIR MESSAGE", claim_token: "TOKEN_SECRET2", claimed_at: "2026-10-09T00:00:00Z", starts_at: "2026-10-09T00:00:00Z", ends_at: "2026-11-09T00:00:00Z" },
      { buyer_id: OTHER, claimed_by: OTHER, months: 6, status: "claimed", recipient_email: "stranger@example.com" },
    ],
    workbookGifts: [
      { giver_id: ME, claimed_by: null, workbook_id: W1, recipient_email: "pal@example.com", status: "sent", quarter: "2026-Q4", created_at: "2026-10-10T00:00:00Z", token_hash: "a".repeat(64) },
      { giver_id: OTHER, claimed_by: ME, workbook_id: W1, recipient_email: "me@example.com", status: "claimed", created_at: "2026-10-11T00:00:00Z", claimed_at: "2026-10-12T00:00:00Z" },
      { giver_id: OTHER, claimed_by: OTHER, workbook_id: W1, recipient_email: "x@example.com", status: "claimed" },
    ],
    workbooks: [{ id: W1, code: "AK-BBBBB", title: "Gift Workbook" }],
    follows: [
      { user_id: ME, author_name: "A. Writer", created_at: "2026-10-13T00:00:00Z" },
      { user_id: OTHER, author_name: "Someone Else", created_at: "2026-10-13T00:00:00Z" },
    ],
    titleRequests: [
      { user_id: ME, title: "A book I want", author_name: "Au", note: "please", status: "new", created_at: "2026-10-14T00:00:00Z", ip_hash: "b".repeat(64), staff_note: "internal" },
      { user_id: OTHER, title: "NOT MINE", status: "new" },
    ],
    newsletter: [
      { email: "me@example.com", status: "confirmed", created_at: "2026-10-15T00:00:00Z", confirmed_at: "2026-10-15T01:00:00Z", token: "NEWS_TOKEN", last_ip_hash: "c".repeat(64) },
      { email: "other@example.com", status: "confirmed", created_at: "2026-10-15T00:00:00Z" },
    ],
    pushSubscriptions: [
      { id: "ps1", user_id: ME, endpoint: "https://fcm.googleapis.com/fcm/send/SECRETPATH", p256dh: "KEY", auth: "AUTH", created_at: "2026-10-16T00:00:00Z" },
      { id: "ps2", user_id: OTHER, endpoint: "https://push.example/other", created_at: "2026-10-16T00:00:00Z" },
    ],
    pushDays: [{ user_id: ME, local_date: "2026-10-17" }, { user_id: OTHER, local_date: "2026-10-18" }],
    pairs: [
      { id: "pair1", workbook_id: W1, inviter_id: ME, friend_id: OTHER, inviter_label: "Me", friend_label: "THEIR LABEL", status: "active", invited_at: "2026-10-19T00:00:00Z", token_hash: "d".repeat(64), channel_key: "CHANNELSECRET" },
      { id: "pair2", workbook_id: W1, inviter_id: OTHER, friend_id: ME, inviter_label: "Pal", friend_label: "My label", status: "active", invited_at: "2026-10-20T00:00:00Z" },
      { id: "pair3", workbook_id: W1, inviter_id: OTHER, friend_id: "33333333-3333-3333-3333-333333333333", inviter_label: "Nope", status: "active" },
    ],
    pairFinishes: [{ pair_id: "pair1", user_id: ME, local_date: "2026-10-21", at: "2026-10-21T08:00:00Z" }, { pair_id: "pair1", user_id: OTHER, local_date: "2026-10-21", at: "2026-10-21T09:00:00Z" }],
    pairNudges: [
      { pair_id: "pair1", from_user: ME, to_user: OTHER, code: "nice_one", local_date: "2026-10-21" },
      { pair_id: "pair1", from_user: OTHER, to_user: ME, code: "no_rush", local_date: "2026-10-22" },
      { pair_id: "pair3", from_user: OTHER, to_user: "33333333-3333-3333-3333-333333333333", code: "nice_one", local_date: "2026-10-22" },
    ],
    certificates: [
      { user_id: ME, enrolment_id: E1, holder_name: "Me Myself", share_hash: "e".repeat(64), created_at: "2026-10-23T00:00:00Z" },
      { user_id: OTHER, enrolment_id: E_OTHER, holder_name: "NOT ME", created_at: "2026-10-23T00:00:00Z" },
    ],
    credentials: [{ id: "f1", factor_type: "webauthn", friendly_name: "Phone", status: "verified", created_at: "2026-10-24T00:00:00Z", secret: "SECRET", credential_id: "CRED" }],
    prompts: [{ user_id: ME, prompt: "passkey", declined_at: "2026-10-25T00:00:00Z" }, { user_id: OTHER, prompt: "passkey", declined_at: "2026-10-25T00:00:00Z" }],
    marketing: {
      optedOut: true,
      optedOutAt: "2026-10-26T00:00:00Z",
      winback: [{ user_id: ME, kind: "monthly", season: "2026-autumn", sent_at: "2026-10-27T00:00:00Z", unsub_token_hash: "f".repeat(64) }, { user_id: OTHER, kind: "one_off", season: "2026-autumn" }],
    },
    studentVerification: { user_id: ME, email_hash: "9".repeat(64), email_domain: "uni.ac.uk", token_hash: "8".repeat(64), verified_at: "2026-10-01T00:00:00Z", expires_at: "2027-10-01T00:00:00Z", created_at: "2026-09-30T00:00:00Z" },
    bundles: [{ user_id: ME, currency: "GBP", amount_minor: 1999, status: "paid", created_at: "2026-10-02T00:00:00Z", stripe_checkout_session_id: "cs_secret", workbook_ids: [W1] }, { user_id: OTHER, amount_minor: 1 }],
    packs: [{ buyer_user_id: ME, workbook_id: W1, currency: "GBP", amount_minor: 4900, created_at: "2026-10-03T00:00:00Z", session_id: "cs_secret" }, { buyer_user_id: OTHER, amount_minor: 2 }],
    unavailable: [],
  };
}

describe("buildAccountData", () => {
  const d = buildAccountData(base());
  const json = JSON.stringify(d);

  it("has every section", () => {
    for (const key of ACCOUNT_DATA_SECTIONS) expect(d).toHaveProperty(key);
  });

  it("includes highlights and notes opened for the owner, with the workbook", () => {
    expect(d.highlights_and_notes).toEqual([
      { workbook_code: "AK-AAAAA", workbook_title: "Plain Workbook", ref: "p1", colour: "yellow", note: "my note", excerpt: "a line", updated_at: "2026-10-02T00:00:00Z" },
    ]);
  });

  it("includes then and now, habit, milestones and the companion", () => {
    expect(d.then_and_now).toHaveLength(1);
    expect(d.then_and_now[0]).toMatchObject({ step: "walk", feeling: 4, workbook_code: "AK-AAAAA" });
    expect(d.habit.settings).toMatchObject({ daily_run_on: true, daily_goal: 2, usual_time_on: false });
    expect(d.habit.run_days).toEqual([{ day: "2026-10-05", steps: 3 }]);
    expect(d.milestones).toEqual([{ kind: "first_step", earned_at: "2026-10-01T00:00:00Z", seen_at: null }]);
    expect(d.companion).toEqual({ companion_on: true, high_water: 12 });
  });

  it("includes referrals made and received, credits and the author link", () => {
    expect(d.referrals.your_code).toBe("ABCDEF0123");
    expect(d.referrals.made).toHaveLength(1);
    expect(d.referrals.made[0]).toMatchObject({ status: "rewarded", reward_value: 500 });
    expect(d.referrals.received).toHaveLength(1);
    expect(d.referrals.received[0]).toMatchObject({ friend_benefit: "trial_days", friend_benefit_value: 14 });
    expect(d.referrals.credits).toHaveLength(1);
    expect(d.referrals.author_link).toEqual({ code: "abcdef0123", created_at: "2026-09-02T00:00:00Z" });
  });

  it("includes gifts bought and claimed, and workbook gifts sent and received", () => {
    expect(d.gifts.bought).toHaveLength(1);
    expect(d.gifts.bought[0]).toMatchObject({ months: 3, recipient_name: "Sam", message: "Enjoy" });
    expect(d.gifts.claimed).toHaveLength(1);
    expect(d.gifts.claimed[0]).toMatchObject({ months: 1, ends_at: "2026-11-09T00:00:00Z" });
    expect(d.workbook_gifts.sent).toHaveLength(1);
    expect(d.workbook_gifts.sent[0]).toMatchObject({ workbook_code: "AK-BBBBB", quarter: "2026-Q4" });
    expect(d.workbook_gifts.received).toHaveLength(1);
    expect(d.workbook_gifts.received[0]).toMatchObject({ status: "claimed", workbook_title: "Gift Workbook" });
  });

  it("includes follows, title requests, newsletter, push, pairs, certificates, sign-in, prompts, marketing, student, purchases", () => {
    expect(d.follows).toEqual([{ author: "A. Writer", followed_at: "2026-10-13T00:00:00Z" }]);
    expect(d.title_requests).toEqual([{ title: "A book I want", author_name: "Au", note: "please", status: "new", created_at: "2026-10-14T00:00:00Z" }]);
    expect(d.newsletter).toMatchObject({ status: "confirmed", confirmed_at: "2026-10-15T01:00:00Z" });
    expect(d.push.devices).toEqual([{ id: "ps1", endpoint_host: "fcm.googleapis.com", added_at: "2026-10-16T00:00:00Z", last_sent_at: null }]);
    expect(d.push.days_sent).toEqual(["2026-10-17"]);
    expect(d.programme_pairs.pairs.map((p) => [p.role, p.your_label])).toEqual([["inviter", "Me"], ["friend", "My label"]]);
    expect(d.programme_pairs.finishes).toEqual([{ local_date: "2026-10-21", at: "2026-10-21T08:00:00Z" }]);
    expect(d.programme_pairs.nudges_sent).toEqual([{ code: "nice_one", local_date: "2026-10-21" }]);
    expect(d.programme_pairs.nudges_received).toEqual([{ code: "no_rush", local_date: "2026-10-22" }]);
    expect(d.certificates).toEqual([{ workbook_code: "AK-AAAAA", workbook_title: "Plain Workbook", holder_name: "Me Myself", created_at: "2026-10-23T00:00:00Z" }]);
    expect(d.sign_in_methods).toEqual([{ type: "passkey", name: "Phone", status: "verified", added_at: "2026-10-24T00:00:00Z" }]);
    expect(d.prompts_dismissed).toHaveLength(1);
    expect(d.marketing).toMatchObject({ opted_out: true });
    expect(d.marketing.win_back_emails).toEqual([{ kind: "monthly", season: "2026-autumn", sent_at: "2026-10-27T00:00:00Z" }]);
    expect(d.student_verification).toMatchObject({ email_domain: "uni.ac.uk" });
    expect(d.purchases.bundles).toHaveLength(1);
    expect(d.purchases.group_packs).toEqual([{ workbook_code: "AK-BBBBB", workbook_title: "Gift Workbook", currency: "GBP", amount_minor: 4900, created_at: "2026-10-03T00:00:00Z" }]);
  });

  it("never includes another reader's rows", () => {
    for (const leak of ["THEIR NOTE", "THEIR STEP", "THEIR MESSAGE", "THEIR LABEL", "NOT MINE", "NOT ME", "stranger@example.com", "x@example.com", "other@example.com", "Someone Else", "push.example", OTHER]) {
      expect(json).not.toContain(leak);
    }
  });

  it("never includes ciphertext, tokens, hashes, keys or fingerprints", () => {
    for (const secret of ["sealed", "TOKEN_SECRET", "NEWS_TOKEN", "fp_secret", "cs_secret", "txn_secret", "SECRETPATH", "KEY", "AUTH", "CHANNELSECRET", "CRED", "SECRET", "org-secret", "internal", "a".repeat(64), "b".repeat(64), "c".repeat(64), "d".repeat(64), "e".repeat(64), "f".repeat(64), "9".repeat(64), "8".repeat(64)]) {
      expect(json).not.toContain(secret);
    }
  });

  it("matches the newsletter by address, ignoring case, and is null without a match", () => {
    expect(buildAccountData({ ...base(), email: "nobody@example.com" }).newsletter).toBeNull();
    expect(buildAccountData({ ...base(), email: null }).newsletter).toBeNull();
  });

  it("drops marks and entries whose enrolment is not the reader's, even if the user id matches", () => {
    const i = base();
    i.marks.push({ userId: ME, enrolmentId: E_OTHER, ref: "x", colour: "blue", note: "STRAY", excerpt: "", updatedAt: "2026-10-30T00:00:00Z" });
    expect(JSON.stringify(buildAccountData(i))).not.toContain("STRAY");
  });

  it("carries what could not be read", () => {
    expect(buildAccountData({ ...base(), unavailable: ["push"] }).unavailable).toEqual(["push"]);
  });

  it("copes with empty input", () => {
    const empty = buildAccountData({
      ...base(), marks: [], thenNow: [], habitSettings: null, runDays: [], milestones: [], referralCode: null, referralsMade: [], referralsReceived: [], credits: [], attribution: null,
      giftMemberships: [], workbookGifts: [], follows: [], titleRequests: [], newsletter: [], pushSubscriptions: [], pushDays: [], pairs: [], pairFinishes: [], pairNudges: [],
      certificates: [], credentials: [], prompts: [], marketing: { optedOut: false, optedOutAt: null, winback: [] }, studentVerification: null, bundles: [], packs: [],
    });
    expect(empty.habit.settings).toBeNull();
    expect(empty.companion).toBeNull();
    expect(empty.highlights_and_notes).toEqual([]);
  });
});

describe("endpointHost", () => {
  it("keeps the host only", () => {
    expect(endpointHost("https://updates.push.services.mozilla.com/wpush/v2/abc")).toBe("updates.push.services.mozilla.com");
    expect(endpointHost("not a url")).toBeNull();
    expect(endpointHost(42)).toBeNull();
  });
});

describe("the export document", () => {
  const doc = buildExport([], [], {}, new Date("2026-10-28T09:00:00Z"), null, buildAccountData(base()));
  it("carries account_data in the JSON, keeping the existing keys", () => {
    const parsed = JSON.parse(exportJson(doc));
    expect(parsed.format).toBe("akana.export");
    expect(parsed.version).toBe(1);
    expect(parsed).toHaveProperty("workbooks");
    expect(parsed).toHaveProperty("check_in_partner");
    expect(parsed.account_data.highlights_and_notes[0].note).toBe("my note");
  });
  it("prints every section on the page and nothing from other readers", () => {
    const html = renderExportHtml(doc, { showTitles: false });
    for (const h of ["Highlights and notes", "Then and now check-ins", "Daily run", "Milestones", "Companion", "Referrals and credits", "Gift memberships", "Workbook gifts", "Authors you follow", "Title requests", "Newsletter", "Reminders on your devices", "Programmes with a friend", "Certificates", "Sign-in methods", "Prompts you dismissed", "Marketing choices", "Student verification", "Bundles and group packs"]) {
      expect(html).toContain(h);
    }
    expect(html).toContain("my note");
    expect(html).not.toContain("THEIR NOTE");
  });
  it("still builds without account data", () => {
    expect(JSON.parse(exportJson(buildExport([], [], {}, new Date(), null))).account_data).toBeNull();
  });
});
