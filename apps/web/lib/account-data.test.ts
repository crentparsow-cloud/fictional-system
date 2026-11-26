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
    profile: { user_id: ME, display_name: "Me", locale: "en-GB", country: "GB", adult_confirmed_at: "2026-09-01T00:00:00Z", created_at: "2026-09-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", health_consent_at: "2026-09-02T00:00:00Z", health_consent_version: "v1", faith_consent_at: null, faith_consent_version: null },
    consentHistory: [
      { user_id: ME, kind: "faith", action: "withdrawn", version: "v1", at: "2026-09-04T00:00:00Z", source: "reader", subject_hash: "a".repeat(64) },
      { user_id: ME, kind: "health", action: "given", version: "v1", at: "2026-09-02T00:00:00Z", source: "reader" },
      { user_id: OTHER, kind: "health", action: "given", version: "THEIR_VERSION", at: "2026-09-02T00:00:00Z", source: "reader" },
    ],
    workbookPurchases: [
      { user_id: ME, workbook_id: W1, kind: "workbook", channel: "web", currency: "GBP", amount_minor: 1499, tax_minor: 250, status: "paid", created_at: "2026-09-05T00:00:00Z", paid_at: "2026-09-05T00:01:00Z", refunded_at: null, stripe_payment_intent_id: "pi_secret", stripe_checkout_session_id: "cs_secret" },
      { user_id: OTHER, workbook_id: W1, amount_minor: 3, status: "paid" },
    ],
    subscriptions: [
      { user_id: ME, plan: "monthly", status: "active", current_period_end: "2026-12-01T00:00:00Z", cancel_at_period_end: false, created_at: "2026-09-06T00:00:00Z", stripe_customer_id: "cus_secret", stripe_subscription_id: "sub_secret" },
      { user_id: OTHER, plan: "THEIR_PLAN", status: "active" },
    ],
    entitlements: [
      { user_id: ME, workbook_id: W1, source: "purchase", status: "active", starts_at: "2026-09-05T00:00:00Z", ends_at: null, created_at: "2026-09-05T00:00:00Z", purchase_id: "PURCHASE_ID" },
      { user_id: ME, workbook_id: null, source: "subscription", status: "active", starts_at: "2026-09-06T00:00:00Z", ends_at: null, created_at: "2026-09-06T00:00:00Z" },
      { user_id: OTHER, workbook_id: W1, source: "THEIR_SOURCE", status: "active" },
    ],
    termsAcceptances: [
      { user_id: ME, doc: "reader-terms", version: "1.0", context: "sign_up", was_draft: false, accepted_at: "2026-09-01T00:00:00Z" },
      { user_id: OTHER, doc: "THEIR_DOC", version: "1.0", accepted_at: "2026-09-01T00:00:00Z" },
    ],
    checkoutConsents: [
      { user_id: ME, kind: "digital_waiver", version: "2026-10", plan: null, workbook_id: W1, consented_at: "2026-09-05T00:00:00Z", stripe_checkout_session_id: "cs_secret" },
      { user_id: OTHER, kind: "THEIR_KIND", consented_at: "2026-09-05T00:00:00Z" },
    ],
    enrolmentProgress: [
      { id: E1, user_id: ME, status: "active", pace: "steady", started_at: "2026-09-07T00:00:00Z", finished_at: null, last_opened_at: "2026-10-20T00:00:00Z" },
      { id: E_OTHER, user_id: OTHER, status: "THEIR_STATUS", started_at: "2026-09-07T00:00:00Z" },
    ],
    progressEvents: [
      { enrolment_id: E1, kind: "step_finished", ref: "u1.s2", at: "2026-10-02T00:00:00Z" },
      { enrolment_id: E1, kind: "week_completed", ref: "u1", at: "2026-10-01T00:00:00Z" },
      { enrolment_id: E_OTHER, kind: "THEIR_EVENT", ref: "u9", at: "2026-10-01T00:00:00Z" },
    ],
    readerSettings: { user_id: ME, reading: { text_size: "large", theme: "dark" }, updated_at: "2026-10-03T00:00:00Z" },
    todaySettings: [
      { enrolment_id: E1, user_id: ME, reminders_on: true, reminder_days: [1, 3, 5], reminder_time: "08:00", timezone: "Europe/London", reminders_stopped_at: null, review_frequency: "weekly", pickup_on: true, calendar_token_hash: "b".repeat(64), updated_at: "2026-10-04T00:00:00Z" },
      { enrolment_id: E_OTHER, user_id: OTHER, reminders_on: true, timezone: "THEIR_ZONE" },
    ],
    supportMessages: [
      { user_id: ME, topic: "billing", name: "Me", email: "me@example.com", message: "Signed-in message", status: "open", consent_contact: true, created_at: "2026-10-05T00:00:00Z", ip_hash: "7".repeat(64) },
      { user_id: null, topic: "other", name: "Me", email: "ME@example.com", message: "Signed-out message", status: "closed", consent_contact: true, created_at: "2026-10-06T00:00:00Z" },
      { user_id: OTHER, topic: "other", name: "Them", email: "me@example.com", message: "THEIR MESSAGE", status: "open", created_at: "2026-10-06T00:00:00Z" },
      { user_id: null, topic: "other", name: "Them", email: "other@example.com", message: "ANOTHER ADDRESS", status: "open", created_at: "2026-10-06T00:00:00Z" },
    ],
    emailDelivery: [{ reason: "bounced", since: "2026-10-07T00:00:00Z", address_hash: "6".repeat(64) }],
    groupMemberships: [
      { group_id: "g1", user_id: ME, seat_id: "SEAT_ID", role: "member", accepted_at: "2026-10-01T00:00:00Z", offered_role: null, offered_at: null, count_checkins: true, left_at: null, left_reason: null },
      { group_id: "g1", user_id: OTHER, role: "leader", accepted_at: "2026-09-30T00:00:00Z", left_reason: "THEIR_REASON" },
    ],
    groupCheckins: [
      { group_id: "g1", user_id: ME, unit_number: 2, choice: "found_it_hard", counted: true, at: "2026-10-09T00:00:00Z" },
      { group_id: "g1", user_id: OTHER, unit_number: 2, choice: "THEIR_CHOICE", counted: true, at: "2026-10-09T00:00:00Z" },
    ],
    groups: [{ id: "g1", name: "Tuesday group", workbookId: W1 }],
    orgSeats: [
      { org_id: "o1", user_id: ME, roster_email: "me@work.example", claimed_at: "2026-09-20T00:00:00Z", released_at: null, released_reason: null, invitation_id: "INVITATION_ID", entitlement_id: "ENTITLEMENT_ID" },
      { org_id: "o1", user_id: OTHER, roster_email: "THEIR_ROSTER@work.example", claimed_at: "2026-09-21T00:00:00Z" },
    ],
    organisations: [{ id: "o1", name: "Plain Org" }],
    membershipSeats: [
      { owner_user_id: ME, member_user_id: OTHER, status: "active", invited_at: "2026-10-01T00:00:00Z", accepted_at: "2026-10-02T00:00:00Z", ended_at: null, token_hash: "8".repeat(64) },
      { owner_user_id: OTHER, member_user_id: ME, status: "left", invited_at: "2026-08-01T00:00:00Z", accepted_at: "2026-08-02T00:00:00Z", ended_at: "2026-09-01T00:00:00Z" },
      { owner_user_id: OTHER, member_user_id: "33333333-3333-3333-3333-333333333333", status: "THEIR_SEAT", invited_at: "2026-08-01T00:00:00Z" },
    ],
    acknowledgements: [
      { enrolment_id: E1, version_id: "VERSION_ID", user_id: ME, acknowledged_at: "2026-10-15T00:00:00Z" },
      { enrolment_id: E_OTHER, version_id: "VERSION_ID", user_id: OTHER, acknowledged_at: "2026-10-16T00:00:00Z" },
    ],
    invoices: [
      { user_id: ME, stripe_invoice_id: "in_secret", stripe_subscription_id: "sub_secret", status: "paid", currency: "GBP", amount_minor: 799, tax_minor: 133, billing_reason: "subscription_cycle", period_start: "2026-10-01T00:00:00Z", period_end: "2026-11-01T00:00:00Z", paid_at: "2026-10-01T00:01:00Z", failed_at: null, created_at: "2026-10-01T00:00:30Z" },
      { user_id: OTHER, stripe_invoice_id: "in_theirs", status: "THEIR_INVOICE", currency: "GBP", amount_minor: 1 },
    ],
    comments: [
      { id: "COMMENT_ID", author_id: ME, workbook_id: W1, org_id: "o1", side: "org", author_name: "Me", body: "My own comment", created_at: "2026-10-17T00:00:00Z" },
      { id: "c2", author_id: OTHER, workbook_id: W1, org_id: "o1", side: "staff", author_name: "THEIR NAME", body: "THEIR COMMENT", created_at: "2026-10-18T00:00:00Z" },
    ],
    reminderLog: [
      { id: 7, user_id: ME, enrolment_id: E1, kind: "step", ref: "u1.s2", local_date: "2026-10-19", sent_at: "2026-10-19T07:00:00Z" },
      { id: 8, user_id: OTHER, enrolment_id: E_OTHER, kind: "THEIR_KIND", ref: "u9", local_date: "2026-10-19", sent_at: "2026-10-19T07:00:00Z" },
    ],
    unavailable: [],
  };
}

describe("the sections added for the full right of access (review finding M19)", () => {
  const d = buildAccountData(base());
  const json = JSON.stringify(d);

  it("states 34 sections and carries every one, in the JSON and on the printable page", () => {
    expect(ACCOUNT_DATA_SECTIONS).toHaveLength(34);
    for (const key of ["profile", "consent_history", "memberships", "entitlements", "terms_and_consents", "progress", "settings", "support_messages", "email_delivery"] as const) {
      expect(ACCOUNT_DATA_SECTIONS).toContain(key);
      expect(d).toHaveProperty(key);
    }
    const html = renderExportHtml(buildExport([], [], {}, new Date("2026-11-25T00:00:00Z"), null, d), { showTitles: true });
    for (const heading of ["Your profile", "Consent history", "Memberships", "What you have access to", "Terms accepted and checkout consents", "Progress", "Settings", "Messages you sent us", "Email delivery", "Purchases"]) {
      expect(html).toContain(`<h4>${heading}</h4>`);
    }
    expect(html).toContain("Signed-in message");
  });

  it("carries the profile with the current health and faith consent", () => {
    expect(d.profile).toEqual({
      email: "Me@Example.com",
      display_name: "Me",
      locale: "en-GB",
      country: "GB",
      adult_confirmed_at: "2026-09-01T00:00:00Z",
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-10-01T00:00:00Z",
      health_consent: { given_at: "2026-09-02T00:00:00Z", version: "v1" },
      faith_consent: null,
    });
  });

  it("carries the consent history in date order, the reader's rows only", () => {
    expect(d.consent_history).toEqual([
      { kind: "health", action: "given", version: "v1", at: "2026-09-02T00:00:00Z", source: "reader" },
      { kind: "faith", action: "withdrawn", version: "v1", at: "2026-09-04T00:00:00Z", source: "reader" },
    ]);
  });

  it("carries workbook purchases, memberships and entitlements without any Stripe id", () => {
    expect(d.purchases.workbooks).toEqual([
      { workbook_code: "AK-BBBBB", workbook_title: "Gift Workbook", kind: "workbook", channel: "web", currency: "GBP", amount_minor: 1499, tax_minor: 250, status: "paid", created_at: "2026-09-05T00:00:00Z", paid_at: "2026-09-05T00:01:00Z", refunded_at: null },
    ]);
    expect(d.memberships).toHaveLength(1);
    expect(d.memberships[0]).toMatchObject({ plan: "monthly", status: "active", current_period_end: "2026-12-01T00:00:00Z", cancel_at_period_end: false });
    expect(d.entitlements.map((x) => [x.workbook_code, x.all_workbooks, x.source])).toEqual([
      ["AK-BBBBB", false, "purchase"],
      [null, true, "subscription"],
    ]);
  });

  it("carries terms accepted and checkout consents", () => {
    expect(d.terms_and_consents.terms_accepted).toEqual([{ doc: "reader-terms", version: "1.0", context: "sign_up", was_draft: false, accepted_at: "2026-09-01T00:00:00Z" }]);
    expect(d.terms_and_consents.checkout_consents).toEqual([{ kind: "digital_waiver", version: "2026-10", plan: null, workbook_code: "AK-BBBBB", workbook_title: "Gift Workbook", consented_at: "2026-09-05T00:00:00Z" }]);
  });

  it("carries progress on the reader's own enrolments, in date order", () => {
    expect(d.progress.workbooks).toEqual([{ workbook_code: "AK-AAAAA", workbook_title: "Plain Workbook", status: "active", pace: "steady", started_at: "2026-09-07T00:00:00Z", finished_at: null, last_opened_at: "2026-10-20T00:00:00Z" }]);
    expect(d.progress.events).toEqual([
      { workbook_code: "AK-AAAAA", kind: "week_completed", ref: "u1", at: "2026-10-01T00:00:00Z" },
      { workbook_code: "AK-AAAAA", kind: "step_finished", ref: "u1.s2", at: "2026-10-02T00:00:00Z" },
    ]);
  });

  it("carries reading settings and reminders, never the calendar token hash", () => {
    expect(d.settings.reading).toEqual({ text_size: "large", theme: "dark" });
    expect(d.settings.reminders).toEqual([
      { workbook_code: "AK-AAAAA", workbook_title: "Plain Workbook", reminders_on: true, reminder_days: [1, 3, 5], reminder_time: "08:00", timezone: "Europe/London", reminders_stopped_at: null, review_frequency: "weekly", pickup_on: true, updated_at: "2026-10-04T00:00:00Z" },
    ]);
  });

  it("carries the reader's support messages: sent signed in, or signed out from their address", () => {
    expect(d.support_messages.map((m) => m.message)).toEqual(["Signed-in message", "Signed-out message"]);
  });

  it("says why the address is not being mailed, as a reason and a date only", () => {
    expect(d.email_delivery).toEqual([{ reason: "bounced", since: "2026-10-07T00:00:00Z" }]);
  });

  it("never carries another person's row, an id from Stripe or a hash", () => {
    for (const leak of ["THEIR", "ANOTHER ADDRESS", "pi_secret", "cs_secret", "cus_secret", "sub_secret", "PURCHASE_ID", "a".repeat(64), "b".repeat(64), "6".repeat(64), "7".repeat(64), OTHER]) {
      expect(json).not.toContain(leak);
    }
  });

  it("reads as nothing held when a caller passes none of the new parts", () => {
    const old = base();
    for (const key of ["profile", "consentHistory", "workbookPurchases", "subscriptions", "entitlements", "termsAcceptances", "checkoutConsents", "enrolmentProgress", "progressEvents", "readerSettings", "todaySettings", "supportMessages", "emailDelivery"] as const) {
      delete old[key];
    }
    const out = buildAccountData(old);
    expect(out.profile).toBeNull();
    expect(out.consent_history).toEqual([]);
    expect(out.purchases.workbooks).toEqual([]);
    expect(out.progress).toEqual({ workbooks: [], events: [] });
    expect(out.settings).toEqual({ reading: null, reading_updated_at: null, reminders: [] });
    expect(out.support_messages).toEqual([]);
  });
});

describe("the sections added after the retest (RX-5)", () => {
  const d = buildAccountData(base());
  const json = JSON.stringify(d);

  it("carries the reader's own group place and check-ins and nobody else's", () => {
    expect(d.groups.memberships).toEqual([
      { group_name: "Tuesday group", workbook_code: "AK-BBBBB", workbook_title: "Gift Workbook", role: "member", accepted_at: "2026-10-01T00:00:00Z", offered_role: null, offered_at: null, count_checkins: true, left_at: null, left_reason: null },
    ]);
    expect(d.groups.check_ins).toEqual([{ group_name: "Tuesday group", unit_number: 2, choice: "found_it_hard", counted: true, at: "2026-10-09T00:00:00Z" }]);
  });

  it("carries organisation seats and both sides of a shared membership without naming the other person", () => {
    expect(d.seats.organisation).toEqual([{ organisation: "Plain Org", roster_email: "me@work.example", claimed_at: "2026-09-20T00:00:00Z", released_at: null, released_reason: null }]);
    expect(d.seats.shared_membership).toEqual([
      { your_part: "member", status: "left", invited_at: "2026-08-01T00:00:00Z", accepted_at: "2026-08-02T00:00:00Z", ended_at: "2026-09-01T00:00:00Z" },
      { your_part: "owner", status: "active", invited_at: "2026-10-01T00:00:00Z", accepted_at: "2026-10-02T00:00:00Z", ended_at: null },
    ]);
  });

  it("carries acknowledgements, invoices, the reader's own comments and the reminder log", () => {
    expect(d.acknowledgements).toEqual([{ workbook_code: "AK-AAAAA", workbook_title: "Plain Workbook", acknowledged_at: "2026-10-15T00:00:00Z" }]);
    expect(d.membership_invoices).toEqual([
      { status: "paid", currency: "GBP", amount_minor: 799, tax_minor: 133, billing_reason: "subscription_cycle", period_start: "2026-10-01T00:00:00Z", period_end: "2026-11-01T00:00:00Z", paid_at: "2026-10-01T00:01:00Z", failed_at: null, created_at: "2026-10-01T00:00:30Z" },
    ]);
    expect(d.comments).toEqual([{ workbook_code: "AK-BBBBB", workbook_title: "Gift Workbook", organisation: "Plain Org", written_as: "Me", body: "My own comment", created_at: "2026-10-17T00:00:00Z" }]);
    expect(d.reminders_sent).toEqual([{ workbook_code: "AK-AAAAA", workbook_title: "Plain Workbook", kind: "step", ref: "u1.s2", local_date: "2026-10-19", sent_at: "2026-10-19T07:00:00Z" }]);
  });

  it("never carries another person's rows, ids, tokens or Stripe ids, and shows each section on the page", () => {
    for (const leak of ["THEIR", "in_secret", "in_theirs", "sub_secret", "SEAT_ID", "INVITATION_ID", "ENTITLEMENT_ID", "VERSION_ID", "COMMENT_ID", "8".repeat(64), OTHER]) {
      expect(json).not.toContain(leak);
    }
    const html = renderExportHtml(buildExport([], [], {}, new Date("2026-11-26T00:00:00Z"), null, d), { showTitles: true });
    for (const heading of ["Groups and check-ins", "Organisation and shared membership seats", "Changes you acknowledged", "Membership invoices", "Comments you wrote", "Reminder emails sent"]) {
      expect(html).toContain(`<h4>${heading}</h4>`);
    }
    expect(html).toContain("My own comment");
  });

  it("drops a reminder or an acknowledgement on an enrolment that is not the reader's", () => {
    const x = base();
    x.reminderLog = [{ user_id: ME, enrolment_id: E_OTHER, kind: "step", local_date: "2026-10-19", sent_at: "2026-10-19T07:00:00Z" }];
    x.acknowledgements = [{ user_id: ME, enrolment_id: E_OTHER, acknowledged_at: "2026-10-19T07:00:00Z" }];
    const out = buildAccountData(x);
    expect(out.reminders_sent).toEqual([]);
    expect(out.acknowledgements).toEqual([]);
  });

  it("reads as nothing held when a caller passes none of them", () => {
    const old = base();
    for (const key of ["groupMemberships", "groupCheckins", "groups", "orgSeats", "organisations", "membershipSeats", "acknowledgements", "invoices", "comments", "reminderLog"] as const) {
      delete old[key];
    }
    const out = buildAccountData(old);
    expect(out.groups).toEqual({ memberships: [], check_ins: [] });
    expect(out.seats).toEqual({ organisation: [], shared_membership: [] });
    expect(out.acknowledgements).toEqual([]);
    expect(out.membership_invoices).toEqual([]);
    expect(out.comments).toEqual([]);
    expect(out.reminders_sent).toEqual([]);
  });
});

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
    for (const h of ["Highlights and notes", "Then and now check-ins", "Daily run", "Milestones", "Companion", "Referrals and credits", "Gift memberships", "Workbook gifts", "Authors you follow", "Title requests", "Newsletter", "Reminders on your devices", "Programmes with a friend", "Certificates", "Sign-in methods", "Prompts you dismissed", "Marketing choices", "Student verification", "Purchases"]) {
      expect(html).toContain(h);
    }
    expect(html).toContain("my note");
    expect(html).not.toContain("THEIR NOTE");
  });
  it("still builds without account data", () => {
    expect(JSON.parse(exportJson(buildExport([], [], {}, new Date(), null))).account_data).toBeNull();
  });
});
