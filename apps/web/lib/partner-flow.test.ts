import { createDevTransport } from "@akana/emails";
import { describe, expect, it } from "vitest";
import { hashToken } from "./partner";
import { invitePartner, parseInvite, respondToLink, saveSettings, sendStageUpdate, stopSharing, type Rpc } from "./partner-flow";
import { createPartnerMail } from "./partner-mail";
import { createRateLimiter } from "./rate-limit";

/**
 * The partner flows with a fake database and the mailer's dev transport.
 * The real rules (rate limits, wellbeing choice, single-purpose tokens) are
 * covered against Postgres in supabase/tests/0012_checkin_partners.sql;
 * these check what the server does around them: tokens hashed before they
 * leave, emails sent to the right person with the right words, and no
 * workbook wording anywhere.
 */

const env = { EMAIL_MODE: "live", EMAIL_FROM: "Akana <dev@localhost>" };

function setup(responses: Record<string, { data: unknown; error: { code?: string; message?: string } | null }>) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const rpc: Rpc = async (fn, args) => {
    calls.push({ fn, args });
    return responses[fn] ?? { data: null, error: { code: "XX000" } };
  };
  const dev = createDevTransport();
  const mail = createPartnerMail({ env, origin: "https://akana.test", transport: dev.transport, log: () => {} });
  return { rpc, calls, mail, sends: dev.sends };
}

let n = 0;
const mint = () => `tok${String(++n).padStart(40, "0")}`;

describe("invite", () => {
  it("validates before touching the database", () => {
    expect(parseInvite({ readerName: "Sam", partnerName: "", email: "jo@x.test", shareLevel: "1", includeWellbeing: null })).toEqual({ ok: false, notice: "check-form" });
    expect(parseInvite({ readerName: "Sam", partnerName: "Jo", email: "jo@x.test", shareLevel: "9", includeWellbeing: null })).toEqual({ ok: false, notice: "pick-level" });
    const ok = parseInvite({ readerName: "Sam", partnerName: "Jo", email: "Jo@X.test", shareLevel: "2", includeWellbeing: "on" });
    expect(ok.ok && ok.invite.includeWellbeing).toBe(false);
    const yes = parseInvite({ readerName: "Sam", partnerName: "Jo", email: "jo@x.test", shareLevel: "2", includeWellbeing: "yes" });
    expect(yes.ok && yes.invite.includeWellbeing).toBe(true);
  });

  it("sends hashes to the database and plain tokens only in the email", async () => {
    const t = setup({ partner_invite: { data: "p1", error: null } });
    const notice = await invitePartner(
      { readerName: "Sam", partnerName: "Jo", email: "jo@example.test", shareLevel: "3", includeWellbeing: null },
      { userId: "u1", readerEmail: "sam@example.test", rpc: t.rpc, mail: t.mail, mint },
    );
    expect(notice).toBe("invited");
    const args = t.calls[0]!.args;
    expect(args.p_include_wellbeing).toBe(false);
    expect(args.p_respond_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(args)).not.toMatch(/tok0/);
    expect(t.sends).toHaveLength(1);
    const m = t.sends[0]!;
    expect(m.to).toBe("jo@example.test");
    expect(m.subject).toBe("Sam would like you as their check-in partner");
    const respond = m.text.match(/https:\/\/akana\.test\/respond\/(tok\d+)/)![1]!;
    expect(await hashToken(respond)).toBe(args.p_respond_hash);
    expect(m.text).toContain(`/respond/${respond}?a=decline`);
  });

  it("refuses the reader's own address and maps database refusals", async () => {
    const t = setup({ partner_invite: { data: null, error: { code: "AKP29" } } });
    expect(
      await invitePartner(
        { readerName: "Sam", partnerName: "Me", email: "SAM@example.test", shareLevel: "1", includeWellbeing: null },
        { userId: "u1", readerEmail: "sam@example.test", rpc: t.rpc, mail: t.mail },
      ),
    ).toBe("self");
    expect(t.calls).toHaveLength(0);
    expect(
      await invitePartner(
        { readerName: "Sam", partnerName: "Jo", email: "jo@example.test", shareLevel: "1", includeWellbeing: null },
        { userId: "u1", readerEmail: "sam@example.test", rpc: t.rpc, mail: t.mail },
      ),
    ).toBe("rate-limited");
    expect(t.sends).toHaveLength(0);
  });

  it("rate limits in memory as well", async () => {
    const t = setup({ partner_invite: { data: "p1", error: null } });
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    const input = { readerName: "Sam", partnerName: "Jo", email: "jo@example.test", shareLevel: "1", includeWellbeing: null };
    const deps = { userId: "u1", readerEmail: null, rpc: t.rpc, mail: t.mail, limiter };
    expect(await invitePartner(input, deps)).toBe("invited");
    expect(await invitePartner(input, deps)).toBe("rate-limited");
  });
});

describe("respond", () => {
  it("tells the reader when the partner says yes", async () => {
    const t = setup({
      partner_link_act: {
        data: [{ outcome: "accepted", partner_id: "p1", reader_email: "sam@example.test", reader_name: "Sam", partner_name: "Jo", partner_email: null }],
        error: null,
      },
    });
    const r = await respondToLink("tok", "accept", null, { rpc: t.rpc, mail: t.mail });
    expect(r).toEqual({ outcome: "accepted", readerName: "Sam" });
    expect(t.calls[0]!.args.p_token_hash).toBe(await hashToken("tok"));
    expect(t.calls[0]!.args.p_message).toBeNull();
    expect(t.sends[0]!.to).toBe("sam@example.test");
    expect(t.sends[0]!.subject).toBe("Your check-in partner said yes");
  });

  it("confirms to the partner when they stop, and cleans a reply", async () => {
    const t = setup({
      partner_link_act: {
        data: [{ outcome: "stopped", partner_id: "p1", reader_email: null, reader_name: "Sam", partner_name: "Jo", partner_email: "jo@example.test" }],
        error: null,
      },
    });
    await respondToLink("tok", "stop", null, { rpc: t.rpc, mail: t.mail });
    expect(t.sends[0]!.to).toBe("jo@example.test");
    expect(t.sends[0]!.subject).toBe("Your updates have stopped");

    const t2 = setup({ partner_link_act: { data: [{ outcome: "replied", partner_id: "p1" }], error: null } });
    await respondToLink("tok", "reply", "Well done! www.spam.com", { rpc: t2.rpc, mail: t2.mail });
    expect(t2.calls[0]!.args.p_message).toBe("Well done!");
    expect(t2.sends).toHaveLength(0);
  });

  it("treats a database error as a calm failure", async () => {
    const t = setup({});
    expect((await respondToLink("tok", "accept", null, { rpc: t.rpc, mail: t.mail })).outcome).toBe("failed");
  });
});

describe("reader changes", () => {
  it("tells an accepted partner when the reader stops sharing", async () => {
    const t = setup({
      partner_stop: { data: [{ partner_id: "p1", partner_name: "Jo", partner_email: "jo@example.test", reader_name: "Sam", notify: true }], error: null },
    });
    expect(await stopSharing({ rpc: t.rpc, mail: t.mail })).toBe("stopped");
    expect(t.sends[0]!.to).toBe("jo@example.test");
    expect(t.sends[0]!.text).toContain("Sam has stopped sharing updates");
  });

  it("does not email someone who never said yes", async () => {
    const t = setup({ partner_stop: { data: [{ partner_id: "p1", partner_name: "Jo", partner_email: "jo@example.test", reader_name: "Sam", notify: false }], error: null } });
    expect(await stopSharing({ rpc: t.rpc, mail: t.mail })).toBe("stopped");
    expect(t.sends).toHaveLength(0);
  });

  it("refuses a note with a link instead of quietly changing it", async () => {
    const t = setup({ partner_settings: { data: {}, error: null } });
    expect(await saveSettings({ shareLevel: "3", includeWellbeing: null, note: "see www.x.com" }, { rpc: t.rpc })).toBe("note-invalid");
    expect(t.calls).toHaveLength(0);
    expect(await saveSettings({ shareLevel: "3", includeWellbeing: "yes", note: "Thank you for asking." }, { rpc: t.rpc })).toBe("saved");
    expect(t.calls[0]!.args).toEqual({ p_share_level: 3, p_include_wellbeing: true, p_note: "Thank you for asking." });
  });
});

describe("stage update", () => {
  const row = (over: Record<string, unknown> = {}) => ({
    outcome: "send",
    partner_id: "p1",
    partner_name: "Jo",
    partner_email: "jo@example.test",
    reader_name: "Sam",
    share_level: 3,
    stage_number: 2,
    stage_count: 4,
    note: "Thanks for asking.",
    ...over,
  });

  it("sends numbers only, with stop and reply links that match the stored hashes", async () => {
    const t = setup({ partner_stage_update: { data: [row()], error: null } });
    expect(await sendStageUpdate("e1", { rpc: t.rpc, mail: t.mail, mint })).toBe("sent");
    const args = t.calls[0]!.args;
    const m = t.sends[0]!;
    expect(m.subject).toBe("An update from Sam");
    expect(m.text).toContain("Sam has reached stage 2 of 4.");
    expect(m.text).toContain("Thanks for asking.");
    const tokens = [...m.text.matchAll(/\/respond\/(tok\d+)/g)].map((x) => x[1]!);
    const hashes = await Promise.all([...new Set(tokens)].map(hashToken));
    expect(hashes).toContain(args.p_stop_hash);
    expect(hashes).toContain(args.p_reply_hash);
    expect(m.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it("leaves the note out below level 3 and sends nothing when not due", async () => {
    const t = setup({ partner_stage_update: { data: [row({ share_level: 2 })], error: null } });
    await sendStageUpdate("e1", { rpc: t.rpc, mail: t.mail, mint });
    expect(t.sends[0]!.text).not.toContain("Thanks for asking.");
    for (const outcome of ["no_partner", "not_shared", "capped", "duplicate", "no_stage", "paused"]) {
      const q = setup({ partner_stage_update: { data: [{ outcome }], error: null } });
      expect(await sendStageUpdate("e1", { rpc: q.rpc, mail: q.mail })).toBe(outcome);
      expect(q.sends).toHaveLength(0);
    }
  });

  it("never throws", async () => {
    const rpc: Rpc = async () => {
      throw new Error("down");
    };
    const t = setup({});
    expect(await sendStageUpdate("e1", { rpc, mail: t.mail })).toBe("error");
  });
});
