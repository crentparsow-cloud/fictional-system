import { createMailer, type MailerEnv, type SendResult, type Transport } from "@akana/emails";
import { respondUrl, type ShareLevel } from "@/lib/partner";

/**
 * Check-in partner emails (F-030) through the shared mailer. Four
 * templates: partner_invite, partner_update and partner_stopped go to the
 * partner; partner_accepted goes to the reader.
 *
 * None of them is given a theme, a title or a stage name. The update gets
 * the stage as numbers only. packages/emails/src/partner.test.ts renders
 * each one against every title and theme.
 *
 * Without RESEND_API_KEY the mailer's dev transport records the send and
 * nothing leaves the box. EMAIL_MODE other than "live" sends to
 * TEST_RECIPIENT with a [Test] subject, as for every other email.
 *
 * The log line carries the status and template only. The mailer's own
 * entry holds a hash of the address, never the address.
 */

export interface PartnerMailDeps {
  env: MailerEnv;
  origin: string;
  transport?: Transport;
  log?: (status: string, template: string, reason: string | null) => void;
}

export function mailerEnvFromProcess(): MailerEnv {
  return {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    EMAIL_REPLY_TO: process.env.EMAIL_REPLY_TO,
    POSTAL_ADDRESS: process.env.POSTAL_ADDRESS,
    EMAIL_MODE: process.env.EMAIL_MODE,
    TEST_RECIPIENT: process.env.TEST_RECIPIENT,
  };
}

export function createPartnerMail(deps: PartnerMailDeps) {
  const log = deps.log ?? ((status, template, reason) => console.info("partner_mail", template, status, reason ?? ""));
  const mailer = createMailer({
    env: deps.env,
    // Declined and reported addresses are refused in the database before any token is minted.
    isSuppressed: () => false,
    log: (e) => log(e.status, e.template, e.reason),
    ...(deps.transport ? { transport: deps.transport } : {}),
  });
  const o = deps.origin;
  const base = { appUrl: `${o}/home`, settingsUrl: `${o}/you#check-in-partner`, supportEmail: deps.env.EMAIL_REPLY_TO ?? "" };

  return {
    devSends: mailer.devSends,

    invite(a: { to: string; readerName: string; partnerName: string; shareLevel: ShareLevel; respondToken: string; reportToken: string }): Promise<SendResult> {
      return mailer.sendReader(
        "partner_invite",
        {
          ...base,
          readerName: a.readerName,
          partnerName: a.partnerName,
          shareLevel: a.shareLevel,
          acceptUrl: respondUrl(o, a.respondToken),
          declineUrl: respondUrl(o, a.respondToken, "decline"),
        },
        { to: a.to, links: { report: respondUrl(o, a.reportToken) } },
      );
    },

    accepted(a: { to: string; partnerName: string; shareLevel?: ShareLevel; partnerId: string }): Promise<SendResult> {
      return mailer.sendReader(
        "partner_accepted",
        { ...base, partnerName: a.partnerName, ...(a.shareLevel ? { shareLevel: a.shareLevel } : {}) },
        { to: a.to, dedupeKey: `partner_accepted:${a.partnerId}` },
      );
    },

    update(a: {
      to: string;
      readerName: string;
      partnerName: string;
      shareLevel: ShareLevel;
      stageNumber: number;
      stageCount: number;
      note: string | null;
      stopToken: string;
      replyToken: string;
    }): Promise<SendResult> {
      const stop = respondUrl(o, a.stopToken);
      return mailer.sendReader(
        "partner_update",
        {
          ...base,
          readerName: a.readerName,
          partnerName: a.partnerName,
          shareLevel: a.shareLevel,
          stageNumber: a.stageNumber,
          stageCount: a.stageCount,
          replyUrl: respondUrl(o, a.replyToken),
          ...(a.shareLevel >= 3 && a.note ? { note: a.note } : {}),
        },
        // One-click stop for mail apps (RFC 8058): POST only, see /api/partner/respond.
        { to: a.to, links: { stop, oneClick: `${o}/api/partner/respond?a=stop&t=${a.stopToken}` } },
      );
    },

    stopped(a: { to: string; readerName: string; partnerName: string; stoppedBy: "reader" | "partner"; partnerId: string }): Promise<SendResult> {
      return mailer.sendReader(
        "partner_stopped",
        { ...base, readerName: a.readerName, partnerName: a.partnerName, stoppedBy: a.stoppedBy },
        { to: a.to, dedupeKey: `partner_stopped:${a.partnerId}` },
      );
    },
  };
}

export type PartnerMail = ReturnType<typeof createPartnerMail>;
