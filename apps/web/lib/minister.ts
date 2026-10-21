/**
 * "Tell your minister" (14.34): a template email the reader sends themselves.
 *
 * The page builds a mailto link. The reader's own email app opens with the
 * draft, the reader edits it and presses send. Akana sends nothing, sees
 * nothing and stores nothing, and no address is collected. The text uses the
 * square-bracket placeholders [Minister's name], [Your name] and
 * [Your church or group] for the reader to fill in.
 *
 * Rules kept: no figures (church plan prices are on the Organisations page,
 * set in one place), no claim about faith content, no claim about outcomes,
 * and no workbook title. The demo link opens the first unit of a sample
 * programme with no sign-up.
 */

export interface MinisterEmail {
  subject: string;
  body: string;
}

export interface MinisterInput {
  /** The site origin, for links in the email. */
  origin: string;
  /** Path of the sample programme to try with no sign-up, such as /try/the-way-to-wealth-3tqx1. */
  demoPath: string;
}

export const MINISTER_PLACEHOLDERS = ["[Minister's name]", "[Your name]", "[Your church or group]"] as const;

export function ministerEmail(input: MinisterInput): MinisterEmail {
  const origin = input.origin.replace(/\/$/, "");
  const demo = `${origin}${input.demoPath.startsWith("/") ? input.demoPath : `/${input.demoPath}`}`;
  const plans = `${origin}/organisations`;
  return {
    subject: "A way for our groups to work through a book together",
    body: [
      "Dear [Minister's name],",
      "",
      "I have been looking at Akana. It turns published books into short guided workbooks. People work through them one step at a time, at their own pace, and the first unit of each is free to try.",
      "",
      "I wonder whether the small groups at [Your church or group] could use it. Each person's answers stay private to them, and a group leader does not see what anyone writes.",
      "",
      `You can try a sample without signing up: ${demo}`,
      `The plans for churches and groups are here: ${plans}`,
      "",
      "Could we talk about it when you have a moment?",
      "",
      "With thanks,",
      "[Your name]",
    ].join("\n"),
  };
}

/** A mailto link with no recipient, so the reader chooses who to send it to. */
export function ministerMailto(email: MinisterEmail): string {
  return `mailto:?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;
}
