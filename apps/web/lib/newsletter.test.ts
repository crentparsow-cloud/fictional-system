import { describe, expect, it } from "vitest";
import {
  cleanEmail,
  confirmUrl,
  dateToLondonLocal,
  exerciseParagraphs,
  findTitleMentions,
  isNewsletterToken,
  issueProblems,
  londonLocalToDate,
  oneClickUrl,
  parseIssueForm,
  parseSendingAddress,
  runNewsletterSend,
  sendReadiness,
  signupReadiness,
  unsubscribeUrl,
  type DueIssue,
  type IssueInput,
  type Recipient,
  type SendRunDeps,
} from "./newsletter";

const READY = { NEWSLETTER_SENDING_DOMAIN: "mail.example.org", RESEND_API_KEY: "re_test_key_123", EMAIL_FROM: "Akana <news@mail.example.org>", EMAIL_MODE: "live", POSTAL_ADDRESS: "1 High Street, London EC1V 2NX" };

describe("sending guards (6.11)", () => {
  it("sends nothing while the sending domain is blank, whatever else is set", () => {
    expect(signupReadiness({ ...READY, NEWSLETTER_SENDING_DOMAIN: "" })).toEqual({ ok: false, reason: "domain_blank" });
    expect(signupReadiness({ ...READY, NEWSLETTER_SENDING_DOMAIN: "   " })).toEqual({ ok: false, reason: "domain_blank" });
    expect(sendReadiness({ ...READY, NEWSLETTER_SENDING_DOMAIN: undefined })).toEqual({ ok: false, reason: "domain_blank" });
    expect(signupReadiness({})).toEqual({ ok: false, reason: "domain_blank" });
  });

  it("needs an API key and a From address on the sending domain", () => {
    expect(signupReadiness({ ...READY, RESEND_API_KEY: "" })).toEqual({ ok: false, reason: "no_api_key" });
    expect(signupReadiness({ ...READY, EMAIL_FROM: "" })).toEqual({ ok: false, reason: "no_from" });
    expect(signupReadiness({ ...READY, EMAIL_FROM: "Akana <news@other.example>" })).toEqual({ ok: false, reason: "domain_mismatch" });
    expect(signupReadiness({ ...READY, EMAIL_FROM: "news@example.org" })).toEqual({ ok: false, reason: "domain_mismatch" });
    expect(signupReadiness(READY)).toEqual({ ok: true });
    expect(signupReadiness({ ...READY, NEWSLETTER_SENDING_DOMAIN: "@Mail.Example.org" })).toEqual({ ok: true });
  });

  it("holds an issue until mail is live and the postal address is real", () => {
    expect(sendReadiness({ ...READY, EMAIL_MODE: "test" })).toEqual({ ok: false, reason: "not_live" });
    expect(sendReadiness({ ...READY, POSTAL_ADDRESS: "PLACEHOLDER" })).toEqual({ ok: false, reason: "postal_placeholder" });
    expect(sendReadiness(READY)).toEqual({ ok: true });
  });

  it("reads the address out of a display name form", () => {
    expect(parseSendingAddress("Akana <News@Mail.Example.org>")).toEqual({ address: "news@mail.example.org", domain: "mail.example.org" });
    expect(parseSendingAddress("not an address")).toBeNull();
    expect(parseSendingAddress(undefined)).toBeNull();
  });
});

describe("tokens, addresses and links", () => {
  it("accepts only 64 hex characters as a token", () => {
    expect(isNewsletterToken("a".repeat(64))).toBe(true);
    expect(isNewsletterToken("A".repeat(64))).toBe(false);
    expect(isNewsletterToken("a".repeat(63))).toBe(false);
    expect(isNewsletterToken(undefined)).toBe(false);
    expect(isNewsletterToken("../etc")).toBe(false);
  });

  it("cleans an address", () => {
    expect(cleanEmail("  Reader@Example.test ")).toBe("reader@example.test");
    expect(cleanEmail("nope")).toBeNull();
    expect(cleanEmail(5)).toBeNull();
  });

  it("builds the three links without doubling the slash", () => {
    const t = "a".repeat(64);
    expect(confirmUrl("https://akana.example/", t)).toBe(`https://akana.example/newsletter/confirm?t=${t}`);
    expect(unsubscribeUrl("https://akana.example", t)).toBe(`https://akana.example/newsletter/unsubscribe?t=${t}`);
    expect(oneClickUrl("https://akana.example", t)).toBe(`https://akana.example/api/newsletter/unsubscribe?t=${t}`);
  });
});

describe("issue content", () => {
  const base: IssueInput = {
    id: null,
    subject: "A small step for the week",
    preheader: "Five minutes.",
    intro: "Here is this week's note.",
    exerciseHeading: "Leave one thing undone",
    exerciseBody: "Take a sheet of paper.\n\nWrite one task you will not do this week.",
    sponsorName: null,
    sponsorText: null,
    sponsorUrl: null,
    sendAtLocal: "",
    schedule: false,
  };
  const NOW = new Date("2026-10-21T10:00:00Z");

  it("accepts a plain issue", () => {
    expect(issueProblems(base, ["Evenings With Less Light"], NOW).errors).toEqual([]);
  });

  it("splits the exercise into paragraphs on blank lines", () => {
    expect(exerciseParagraphs("One line\nstill one.\n\nSecond.\r\n\r\nThird.")).toEqual(["One line still one.", "Second.", "Third."]);
  });

  it("never lets a workbook title through, whole words only", () => {
    expect(findTitleMentions("Try Evenings With Less Light tonight", ["Evenings With Less Light"])).toEqual(["Evenings With Less Light"]);
    expect(findTitleMentions("try evenings with less light", ["Evenings With Less Light"])).toHaveLength(1);
    expect(findTitleMentions("Habits of the week", ["Habit"])).toEqual([]);
    expect(findTitleMentions("any", ["Any"])).toEqual([]);
    const bad = issueProblems({ ...base, exerciseBody: "Open Evenings With Less Light and begin." }, ["Evenings With Less Light"], NOW);
    expect(bad.errors.join(" ")).toMatch(/never names a workbook title/);
  });

  it("holds house style: dashes, claims and spelling block a save", () => {
    expect(issueProblems({ ...base, intro: "Hello — friend." }, [], NOW).errors.length).toBeGreaterThan(0);
    expect(issueProblems({ ...base, exerciseBody: "This will cure your worries." }, [], NOW).errors.length).toBeGreaterThan(0);
    expect(issueProblems({ ...base, exerciseBody: "Pick a color." }, [], NOW).errors.length).toBeGreaterThan(0);
  });

  it("needs a subject, a heading and an exercise, within the limits", () => {
    const empty = issueProblems({ ...base, subject: "", exerciseHeading: "", exerciseBody: "" }, [], NOW);
    expect(empty.errors).toHaveLength(3);
    expect(issueProblems({ ...base, subject: "x".repeat(91) }, [], NOW).errors.join(" ")).toMatch(/limit is 90/);
    expect(issueProblems({ ...base, subject: "Write to me@example.test" }, [], NOW).errors.join(" ")).toMatch(/email address/);
  });

  it("takes a sponsor block whole or not at all, over https", () => {
    expect(issueProblems({ ...base, sponsorName: "Sam" }, [], NOW).errors.join(" ")).toMatch(/name, a short text and a link/);
    const full = { ...base, sponsorName: "Sam Author", sponsorText: "A weekly note on small habits.", sponsorUrl: "https://example.test/sam" };
    expect(issueProblems(full, [], NOW).errors).toEqual([]);
    expect(issueProblems({ ...full, sponsorUrl: "http://example.test/sam" }, [], NOW).errors.join(" ")).toMatch(/https/);
  });

  it("checks the send time only when scheduling", () => {
    expect(issueProblems({ ...base, schedule: true, sendAtLocal: "" }, [], NOW).errors.join(" ")).toMatch(/Choose a day/);
    expect(issueProblems({ ...base, schedule: true, sendAtLocal: "2026-10-20T09:00" }, [], NOW).errors.join(" ")).toMatch(/future/);
    expect(issueProblems({ ...base, schedule: true, sendAtLocal: "2026-10-26T09:00" }, [], NOW).errors).toEqual([]);
  });

  it("reads the form", () => {
    const f = new Map<string, string>([
      ["id", "11111111-1111-1111-1111-111111111111"],
      ["subject", "  Hello "],
      ["exercise_body", "Line\r\nTwo"],
      ["sponsor_name", " "],
      ["intent", "schedule"],
    ]);
    const parsed = parseIssueForm({ get: (k) => f.get(k) ?? null });
    expect(parsed).toMatchObject({ id: "11111111-1111-1111-1111-111111111111", subject: "Hello", exerciseBody: "Line\nTwo", sponsorName: null, schedule: true });
    expect(parseIssueForm({ get: () => "nope" }).id).toBeNull();
  });
});

describe("UK send times", () => {
  it("converts UK local time to an instant, summer and winter", () => {
    expect(londonLocalToDate("2026-07-01T09:00")?.toISOString()).toBe("2026-07-01T08:00:00.000Z");
    expect(londonLocalToDate("2026-12-01T09:00")?.toISOString()).toBe("2026-12-01T09:00:00.000Z");
  });

  it("round trips and refuses nonsense", () => {
    expect(dateToLondonLocal("2026-07-01T08:00:00.000Z")).toBe("2026-07-01T09:00");
    expect(londonLocalToDate("2026-02-31T09:00")).toBeNull();
    expect(londonLocalToDate("tomorrow")).toBeNull();
    expect(dateToLondonLocal(null)).toBe("");
  });
});

describe("the cron run", () => {
  const issue: DueIssue = { id: "i1", subject: "S", preheader: "", intro: "", exerciseHeading: "H", exerciseBody: "B", sponsor: null };
  const people: Recipient[] = [1, 2, 3].map((n) => ({ subscriberId: `s${n}`, email: `p${n}@example.test`, token: "a".repeat(64) }));

  function deps(over: Partial<SendRunDeps> = {}) {
    const calls = { purge: 0, take: 0, sent: [] as string[], recorded: [] as [string, boolean][], finished: 0 };
    const d: SendRunDeps = {
      readiness: { ok: true },
      batchSize: 100,
      purgePending: async () => (calls.purge += 1, 2),
      takeDue: async () => (calls.take += 1, issue),
      recipients: async (_id, limit) => people.slice(0, limit),
      send: async (_i, to) => (calls.sent.push(to.subscriberId), "sent"),
      record: async (_i, s, ok) => void calls.recorded.push([s, ok]),
      finish: async () => (calls.finished += 1, true),
      ...over,
    };
    return { d, calls };
  }

  it("does nothing at all while the guards are not met", async () => {
    const { d, calls } = deps({ readiness: { ok: false, reason: "domain_blank" } });
    const r = await runNewsletterSend(d);
    expect(r).toEqual({ status: "not_ready", reason: "domain_blank", purged: 0, sent: 0, failed: 0 });
    expect(calls).toEqual({ purge: 0, take: 0, sent: [], recorded: [], finished: 0 });
  });

  it("is idle when no issue is due", async () => {
    const { d, calls } = deps({ takeDue: async () => null });
    const r = await runNewsletterSend(d);
    expect(r).toMatchObject({ status: "idle", purged: 2, sent: 0 });
    expect(calls.sent).toEqual([]);
  });

  it("sends a batch, records each result and finishes when nobody is left", async () => {
    const { d, calls } = deps();
    const r = await runNewsletterSend(d);
    expect(r).toMatchObject({ status: "finished", sent: 3, failed: 0 });
    expect(calls.recorded).toEqual([["s1", true], ["s2", true], ["s3", true]]);
  });

  it("limits the batch and carries on next run", async () => {
    const { d } = deps({ batchSize: 2, finish: async () => false });
    const r = await runNewsletterSend(d);
    expect(r).toMatchObject({ status: "partial", sent: 2 });
  });

  it("records a failed send and keeps going", async () => {
    let n = 0;
    const { d, calls } = deps({ send: async () => (++n === 2 ? "failed" : "sent") });
    const r = await runNewsletterSend(d);
    expect(r).toMatchObject({ sent: 2, failed: 1 });
    expect(calls.recorded[1]).toEqual(["s2", false]);
  });

  it("stops without recording when the mailer refuses", async () => {
    const { d, calls } = deps({ send: async () => "refused" });
    const r = await runNewsletterSend(d);
    expect(r).toMatchObject({ status: "held", reason: "mailer_refused", sent: 0 });
    expect(calls.recorded).toEqual([]);
    expect(calls.finished).toBe(0);
  });
});
