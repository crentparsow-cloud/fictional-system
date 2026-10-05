// Every email Akana sends, and the one layout they all share (Daylight Blocks).
//
// Voice: rooted in the book, understanding, helpful, calm. Second person, short sentences, plain
// words, US English. Contractions are fine, except in legal and safety wording. No dashes, no
// emojis, and no sentence starts with "I" or "We". Subject lines never name a topic or condition.
// Stage ids stay map, build, use, keep. Readers see Explore, Build, Practice, Keep.
//
// Each template returns structured parts (headline, paragraphs, panels, buttons). render() turns
// them into table-based HTML with inline styles, and a plain-text version laid out by hand.

export type Vars = Record<string, string | number | undefined | null>;
export type Button = { label: string; url: string };
export type Hero = "map" | "build" | "use" | "keep" | "service" | "partner" | "brand";
export type FooterKind =
  | "service" | "progress" | "marketing" | "partner" | "partner_invite" | "partner_stopped" | "deleted" | "signin";
export type Panel = {
  title?: string;
  big?: string; // a large single value, such as a date
  spaced?: boolean; // wide letter spacing for the big value, for codes
  rows?: [string, string][]; // a small two-column table, such as a receipt
  items?: string[]; // a short list
  lines?: string[]; // short paragraphs
  quote?: string; // words from the reader, shown as a quote
  tone?: "tint" | "terms" | Hero; // tint: soft neutral. terms: white with a border. Hero ids use that band.
};
export type Email = {
  subject: string;
  preheader: string;
  hero: Hero;
  eyebrow?: string;
  headline: string;
  badge?: string; // marigold pill, for achievement moments only
  strip?: "map" | "build" | "use" | "keep"; // four-segment stage strip, filled up to this stage
  greeting?: string;
  paragraphs: string[];
  panels?: Panel[];
  after?: string[]; // paragraphs after the panels
  buttons?: Button[]; // first is primary, the rest are quieter
  equalButtons?: boolean; // show every button with the same weight
  quietLink?: Button; // a plain text link under the buttons, for a quiet "no"
  signoff?: boolean; // default true
  footer: FooterKind;
};
export type FooterLinks = { manage?: string; unsubscribe?: string; oneClick?: string; stop?: string; report?: string };
export type Footer = { buttons: Button[]; textLinks: Button[]; lines: string[]; company: string; safety: boolean };

const v = (x: unknown, fallback = "") => (x === undefined || x === null || x === "" ? fallback : String(x));
const hi = (name: unknown) => (v(name) ? `Hi ${v(name)},` : "Hello,");
const SIGNOFF = ["Take care,", "The Akana team"];
const SUPPORT = (x: Vars) => v(x.support_email, "[support email]");

// ---------- colour ----------
const C = {
  page: "#F7F5F0", card: "#FFFFFF", ink: "#16222B", soft: "#4A5864", brand: "#1F4E5A",
  marigold: "#F2B84B", tint: "#F4F2EC", rule: "#E4E0D7",
};
const BANDS: Record<Hero, { bg: string; ink: string; darkBg: string; darkInk: string }> = {
  map: { bg: "#DCEBE2", ink: "#2D6A4F", darkBg: "#1C3027", darkInk: "#9FD3B6" },
  build: { bg: "#F8E0D0", ink: "#9C4A25", darkBg: "#38241A", darkInk: "#F0B391" },
  use: { bg: "#F6EAC0", ink: "#6E520F", darkBg: "#332A12", darkInk: "#E8C873" },
  keep: { bg: "#D6E6F3", ink: "#1F5A85", darkBg: "#172A3A", darkInk: "#9CC6EA" },
  service: { bg: "#D6E6F3", ink: "#1F5A85", darkBg: "#172A3A", darkInk: "#9CC6EA" },
  partner: { bg: "#EFE7DA", ink: "#6B5232", darkBg: "#2E2820", darkInk: "#D9C3A3" },
  brand: { bg: "#E1ECEE", ink: "#1F4E5A", darkBg: "#16303A", darkInk: "#9FCBD6" },
};
const STAGE_ORDER = ["map", "build", "use", "keep"] as const;
type StageId = typeof STAGE_ORDER[number];
const STAGE_LABEL: Record<StageId, string> = { map: "Explore", build: "Build", use: "Practice", keep: "Keep" };
const stageId = (x: unknown): StageId => (STAGE_ORDER as readonly string[]).includes(String(x)) ? String(x) as StageId : "map";

// Mix a colour toward a background, so the mark needs no opacity (Outlook ignores it).
function mix(fg: string, bg: string, a: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [f, b] = [p(fg), p(bg)];
  return "#" + f.map((c, i) => Math.round(c * a + b[i] * (1 - a)).toString(16).padStart(2, "0")).join("").toUpperCase();
}

// ---------- Focus stage copy (from Wired Differently) ----------
// Written for the Focus workbook. Other workbooks will need their own set.
const STAGE_COPY: Record<StageId, {
  subject: string; headline: string; badge: string; preheader: string; did: string;
  nextTitle: string; next: string[]; nextButton: string;
  partnerSpan: string; partnerLine: string; partnerAsk: string;
}> = {
  map: {
    subject: "You finished the Explore stage",
    headline: "You finished the Explore stage",
    badge: "Stage 1 of 4 complete",
    preheader: "Next up: setting up your phone, your space and your days.",
    did: "You rated your thinking skills and mapped when your energy runs high and low. That's the ground the rest of the workbook stands on.",
    nextTitle: "Next: Build",
    next: ["Five weeks of setting up your phone, your space and your days so they work with you. It starts with the noise on your phone."],
    nextButton: "Open week 3",
    partnerSpan: "the first two weeks",
    partnerLine: "They've spent two weeks noticing what trips them up, and when they work best.",
    partnerAsk: "What have you noticed about when you work best?",
  },
  build: {
    subject: "You finished the Build stage",
    headline: "Your setup is in place",
    badge: "Stage 2 of 4 complete",
    preheader: "Next: taking your setup into real weeks.",
    did: "You built a quieter phone, one place to focus, one place for everything, a daily plan, a weekly reset and your brakes.",
    nextTitle: "Next: Practice",
    next: [
      "Four weeks of taking your setup into real life: deadlines, mornings, sleep and the people around you.",
      "Some of it won't work the first time. When that happens, change the system, not your opinion of yourself.",
    ],
    nextButton: "Open week 8",
    partnerSpan: "weeks 3 to 7",
    partnerLine: "Over five weeks they've set up their phone, their space and their days to work with them.",
    partnerAsk: "Which part of your new setup is making the biggest difference?",
  },
  use: {
    subject: "You finished the Practice stage",
    headline: "You finished the Practice stage",
    badge: "Stage 3 of 4 complete",
    preheader: "One week left, and it's the one that keeps it going.",
    did: "Your setup has been through real weeks: deadlines, mornings, sleep and the people in your life. By now you've seen what holds up and what needed a tweak.",
    nextTitle: "Next: Keep",
    next: ["One week left. You'll put your whole setup on one page, and write a short plan for getting back on track after a hard patch."],
    nextButton: "Open week 12",
    partnerSpan: "weeks 8 to 11",
    partnerLine: "They've spent four weeks testing their new routines on real life: deadlines, mornings and sleep.",
    partnerAsk: "What's been most useful so far?",
  },
  keep: {
    subject: "Twelve weeks done",
    headline: "Twelve weeks, done",
    badge: "All four stages complete",
    preheader: "Your plan is saved, and so is the way back when it slips.",
    did: "You rated five thinking skills, mapped your energy, built a setup around how your brain works and tested it on real life. Your daily operating system and your restart plan are saved in My Plan.",
    nextTitle: "What happens now",
    next: [
      "It won't run perfectly, and it doesn't have to. When it slips, your restart plan is the way back.",
      "Once a month you'll get two short questions to help it stick. You can turn them off in Email settings.",
    ],
    nextButton: "Open My Plan",
    partnerSpan: "all twelve weeks",
    partnerLine: "They've written down how their days run, and a plan for getting back on track after a hard patch.",
    partnerAsk: "What are you going to keep doing?",
  },
};

// "a single workbook" -> "Single workbook"
const offerLabel = (s: string) => {
  const t = s.replace(/^(a|an|the)\s+/i, "");
  return t ? t[0].toUpperCase() + t.slice(1) : "Your purchase";
};
const passLabel = (x: Vars) => (/year/.test(v(x.period_words)) ? "Annual all-access pass" : "Monthly all-access pass");

const HOW_TO_CANCEL: Panel = {
  title: "How to cancel",
  lines: ["Go to Settings, then Your pass, then Cancel. It takes two taps and asks no questions. You keep access until the end of the period you have paid for."],
  tone: "tint",
};

const REFUND_STATUS: Record<string, string> = {
  pending: "On its way",
  succeeded: "Sent",
  failed: "Delayed, and being retried",
};
// A refund panel when the server passes refund_amount. Nothing when there is no refund.
function refundPanel(x: Vars): Panel[] {
  const amount = v(x.refund_amount);
  if (!amount) return [];
  return [{
    title: "Your refund",
    rows: [["Amount", amount], ["Status", REFUND_STATUS[v(x.refund_status)] ?? REFUND_STATUS.pending]],
    lines: ["It goes back to the card you paid with. Refunds can take several business days to show on your statement."],
    tone: "tint",
  }];
}

const securityNote = (x: Vars, what: string, when: string): Email => ({
  subject: what,
  preheader: "If this was you, there's nothing to do.",
  hero: "service", eyebrow: "Account security", headline: what,
  greeting: hi(x.name),
  paragraphs: [when],
  panels: [{ rows: [["When", v(x.when, "[time]")], ["Device", v(x.device, "[device type]")]], tone: "tint" }],
  after: [
    "If this was you, there's nothing to do.",
    `If it was not you, change your password in Settings and contact support at ${SUPPORT(x)} right away.`,
  ],
  buttons: [{ label: "Review your account", url: v(x.settings_url) }],
  footer: "service",
});

export const TEMPLATES: Record<string, (vars: Vars) => Email> = {
  // ---------- account and service ----------
  welcome: (x) => ({
    subject: "Your first week is ready",
    preheader: "One exercise, one check-in and a tool for tonight.",
    hero: "map", eyebrow: "Your free week", headline: "Week one is open",
    greeting: hi(x.name),
    paragraphs: ["Your workbook is set up. Week one is open now, it's free, and it won't turn into a paid plan on its own."],
    panels: [{
      title: "This week",
      items: [
        "One exercise, with a short version for low-energy days.",
        "One check-in at the end of the week.",
        "The Structured Pause, already in your Toolkit. It takes about a minute. Try it tonight if a strong feeling rises fast.",
      ],
      tone: "map",
    }],
    after: ["Go at your own pace. Missed days leave no mark."],
    buttons: [{ label: "Open week one", url: v(x.app_url) }],
    footer: "service",
  }),

  week_one_finished: (x) => ({
    subject: "You finished week one",
    preheader: "Nothing was charged. Your answers are saved.",
    hero: "map", eyebrow: "Free week complete", headline: "You finished week one",
    greeting: hi(x.name),
    paragraphs: [
      "Week one is done, and nothing was charged. Your free week does not turn into a paid plan on its own.",
      "Your answers are saved. If you'd like to carry on, the app shows the ways to keep going. If you stop here, nothing else happens.",
    ],
    buttons: [{ label: "See your options", url: v(x.app_url) }],
    footer: "service",
  }),

  purchase_lifetime: (x) => ({
    subject: "Your purchase is confirmed",
    preheader: "It's open in your account now, and it's yours for life.",
    hero: "service", eyebrow: "Purchase confirmed", headline: "Thank you. It's open now.",
    greeting: hi(x.name),
    paragraphs: ["Everything you bought is open in your account now, and it's yours for life."],
    panels: [
      { title: "Your purchase", rows: [["Item", offerLabel(v(x.offer_name))], ["Price", v(x.price)], ["Access", "Lifetime"]], tone: "tint" },
      {
        title: "What you agreed at checkout",
        lines: ["You asked for access to start right away. Because access has started, the 14-day right to cancel and get a refund no longer applies."],
        tone: "terms",
      },
    ],
    after: ["Your receipt comes in a separate email from our payment provider. Keep this email as your record of the terms."],
    buttons: [{ label: "Open your workbook", url: v(x.app_url) }],
    footer: "service",
  }),

  purchase_pass: (x) => ({
    subject: "Your pass is confirmed",
    preheader: "Your pass terms, and how to cancel.",
    hero: "service", eyebrow: "Purchase confirmed", headline: "Your all-access pass is active",
    greeting: hi(x.name),
    paragraphs: ["Thank you. Every workbook is open in your account now."],
    panels: [
      {
        title: "Your pass",
        rows: [["Plan", passLabel(x)], ["Price", `${v(x.price)} ${v(x.period_words)}`.trim()], ["Renews", "Automatically, until you cancel"], ["Next payment", v(x.next_date)]],
        tone: "tint",
      },
      {
        title: "What you agreed at checkout",
        lines: [
          "You asked for access to start right away. If you cancel within 14 days, you get a refund for the time you have not used.",
          "You also agreed that the pass renews automatically until you cancel.",
        ],
        tone: "terms",
      },
      HOW_TO_CANCEL,
    ],
    after: ["Your receipt comes in a separate email from our payment provider."],
    buttons: [{ label: "Open your workbooks", url: v(x.app_url) }, { label: "Manage your pass", url: v(x.settings_url) }],
    footer: "service",
  }),

  renewal_notice: (x) => ({
    subject: `Your pass renews on ${v(x.renew_date)}`,
    preheader: "Nothing to do if you want to keep it.",
    hero: "service", eyebrow: "Renewal notice", headline: "Your pass renews soon",
    greeting: hi(x.name),
    paragraphs: ["Your annual all-access pass renews automatically. Here's when, and what it costs."],
    panels: [{ title: "Renews on", big: v(x.renew_date), rows: [["Price", v(x.price)]], tone: "service" }],
    after: [
      "If you want to keep it, you do not need to do anything.",
      "If you want to cancel, go to Settings, then Your pass, then Cancel. You keep access until the renewal date.",
    ],
    buttons: [{ label: "Keep my pass", url: v(x.app_url) }, { label: "Cancel my pass", url: v(x.settings_url) }],
    equalButtons: true,
    footer: "service",
  }),

  pass_terms_reminder: (x) => ({
    subject: "A reminder of your pass terms",
    preheader: "What you pay, when, and how to cancel.",
    hero: "service", eyebrow: "Your pass", headline: "Your pass terms, in one place",
    greeting: hi(x.name),
    paragraphs: ["Here's a short reminder of how your pass works."],
    panels: [
      {
        rows: [["Plan", passLabel(x)], ["Price", `${v(x.price)} ${v(x.period_words)}`.trim()], ["Renews", "Automatically, until you cancel"], ["Next payment", v(x.next_date)]],
        tone: "tint",
      },
      HOW_TO_CANCEL,
    ],
    buttons: [{ label: "Manage your pass", url: v(x.settings_url) }],
    footer: "service",
  }),

  pass_away: (x) => ({
    subject: "Your pass while you're away",
    preheader: "Your pass is still active while you take a break.",
    hero: "service", eyebrow: "Your pass", headline: "Your pass is still active",
    greeting: hi(x.name),
    paragraphs: ["Your pass is still active while you take a break, so here's a quick note on what that means."],
    panels: [{ rows: [["Price", v(x.price)], ["Next renewal", v(x.next_date)]], tone: "tint" }],
    after: [
      "If you're taking a longer break, you can cancel in Settings and keep access until then. Everything you wrote stays in your account.",
      "If you plan to come back soon, there's nothing to do.",
    ],
    buttons: [{ label: "Manage your pass", url: v(x.settings_url) }],
    footer: "service",
  }),

  payment_failed: (x) => ({
    subject: "Your payment didn't go through",
    preheader: "A quick check of your payment details should fix it.",
    hero: "service", eyebrow: "Your pass", headline: "Your payment didn't go through",
    greeting: hi(x.name),
    paragraphs: [
      `The latest payment for your all-access pass${x.price ? ` (${v(x.price)})` : ""} did not go through. This often happens when a card expires or a bank declines a payment.`,
      "Please check your payment details in Settings so your pass can carry on.",
    ],
    buttons: [{ label: "Update payment details", url: v(x.settings_url) }],
    footer: "service",
  }),

  cancellation: (x) => {
    const now = v(x.cancel_mode) === "immediate";
    const refund = refundPanel(x);
    return {
      subject: "Your pass is canceled",
      preheader: now ? (refund.length ? "Your pass has ended, and your refund is on its way." : "Your pass has ended.") : `You keep access until ${v(x.end_date)}.`,
      hero: "service", eyebrow: "Cancellation confirmed", headline: "Your pass is canceled",
      greeting: hi(x.name),
      paragraphs: now
        ? [
          "Your pass has ended today, and no further payments will be taken.",
          ...(refund.length ? ["You canceled within 14 days of starting, so the time you have not used is refunded."] : []),
        ]
        : ["Your pass will not renew, and no further payments will be taken."],
      panels: now ? refund : [{ title: "Access until", big: v(x.end_date), tone: "service" }, ...refund],
      after: [now
        ? "Everything you wrote stays in your account. You can still read all of it, and download it anytime from Settings."
        : "Everything you wrote stays in your account. You can download it anytime from Settings."],
      buttons: [{ label: "Open your workbooks", url: v(x.app_url) }, { label: "Download your answers", url: v(x.settings_url) }],
      footer: "service",
    };
  },

  // Sent when a deletion is scheduled (7 days out). The finished deletion sends nothing.
  account_deleted: (x) => {
    const date = v(x.deletion_date, v(x.delete_date));
    if (!(x.undo_url && date)) {
      return {
        subject: "Your account is deleted",
        preheader: "This cannot be undone.",
        hero: "service", eyebrow: "Account deletion", headline: "Your account is deleted",
        greeting: hi(x.name),
        paragraphs: [
          "Your Akana account and everything you wrote in it have been deleted. This cannot be undone.",
          "Only what the law requires is kept: a record of any purchase and of the consents you gave, for six years.",
          "If you had a pass, it has been canceled and will not renew.",
        ],
        after: [`If you did not ask for this, contact support at ${SUPPORT(x)} right away.`],
        footer: "deleted",
      };
    }
    return {
      subject: `Your account will be deleted on ${date}`,
      preheader: "You can undo this until then.",
      hero: "service", eyebrow: "Account deletion", headline: "Your account is set to be deleted",
      greeting: hi(x.name),
      paragraphs: [
        "You asked to delete your Akana account. On the date below, your account and everything you wrote in it will be deleted.",
        "Until then, your account is read-only. If you had a pass, it has been canceled and billing has stopped.",
      ],
      panels: [{ title: "Deletion date", big: date, tone: "service" }, ...refundPanel(x)],
      after: [
        "Changed your mind? Undo it before that date and your account and answers will stay. A canceled pass stays canceled. You can buy again anytime from Books.",
        "If you would like a copy of your answers, download it from Settings before that date.",
        "After that date, the deletion cannot be undone. Only what the law requires is kept: a record of any purchase and of the consents you gave, for six years.",
        `If you did not ask for this, undo it now and contact support at ${SUPPORT(x)}.`,
      ],
      buttons: [{ label: "Undo deletion", url: v(x.undo_url) }, { label: "Download your answers", url: v(x.settings_url) }],
      footer: "deleted",
    };
  },

  export_code: (x) => ({
    subject: "Your code to download your answers",
    preheader: "It works once, for a short time.",
    hero: "service", eyebrow: "Account security", headline: "Your download code",
    greeting: hi(x.name),
    paragraphs: ["Enter this code in Akana to download a copy of your answers."],
    panels: [{ big: v(x.code), spaced: true, lines: [`It works once, and expires in ${v(x.expires_minutes, "10")} minutes.`], tone: "service" }],
    after: ["If you did not ask for this code, you can ignore this email. Nobody can download your answers without it."],
    footer: "service",
  }),

  partner_accepted: (x) => ({
    subject: `${v(x.partner_name, "Your support partner")} said yes`,
    preheader: "They'll get a short note when you finish a stage.",
    hero: "partner", eyebrow: "Your support partner", headline: `${v(x.partner_name, "Your support partner")} said yes`,
    greeting: hi(x.name),
    paragraphs: [`${v(x.partner_name, "Your support partner")} will get a short note when you finish a stage, and never more than once a week.`],
    panels: [{
      title: "What they see",
      items: ["That you finished a stage.", "One question they could ask you, if they want to."],
      lines: ["They never see your answers or your scores."],
      tone: "tint",
    }],
    after: ["You can pause or remove them anytime in Settings."],
    buttons: [{ label: "Support partner settings", url: v(x.settings_url) }],
    footer: "service",
  }),

  passkey_added: (x) => securityNote(x, "A passkey was added to your account",
    "A new passkey was just added to your Akana account. You can now use it to sign in."),
  password_changed: (x) => securityNote(x, "Your password was changed",
    "The password for your Akana account was just changed."),
  email_changed: (x) => securityNote(x, "Your email address was changed",
    `The email address for your Akana account was changed${x.new_email ? ` to ${v(x.new_email)}` : ""}. This note goes to your old address, so you know.`),
  history_downloaded: (x) => securityNote(x, "Your answers were downloaded",
    "A copy of your answers was just downloaded from your Akana account. Nothing is attached to this email."),

  // ---------- progress (needs the progress email opt-in) ----------
  stage_complete: (x) => {
    const id = stageId(x.stage);
    const s = STAGE_COPY[id];
    const nextId = STAGE_ORDER[Math.min(STAGE_ORDER.indexOf(id) + 1, 3)];
    return {
      subject: s.subject,
      preheader: s.preheader,
      hero: id, eyebrow: `${STAGE_LABEL[id]} stage`, headline: s.headline, badge: s.badge, strip: id,
      greeting: hi(x.name),
      paragraphs: [s.did],
      panels: [{ title: s.nextTitle, lines: s.next, tone: id === "keep" ? "tint" : nextId }],
      buttons: [{ label: s.nextButton, url: v(x.app_url) }],
      footer: "progress",
    };
  },

  inactive_7: (x) => ({
    subject: "Your next step is small",
    preheader: "Your workbook is where you left it.",
    hero: "map", eyebrow: "Whenever you're ready", headline: "Your workbook is where you left it",
    greeting: hi(x.name),
    paragraphs: ["Weeks like that happen. Your next step is ready when you are."],
    panels: [{ title: "Your next step", lines: [v(x.next_step, "This week's first exercise"), "On a low-energy day, try the short version."], tone: "tint" }],
    buttons: [{ label: "Pick up where you left off", url: v(x.app_url) }],
    footer: "progress",
  }),

  inactive_14: (x) => ({
    subject: "One step back is enough",
    preheader: "You don't need to catch up.",
    hero: "map", eyebrow: "Whenever you're ready", headline: "One small step back",
    greeting: hi(x.name),
    paragraphs: ["You don't need to catch up on anything you missed."],
    panels: [{ title: "Start here", lines: ["Open the Restart card in your Toolkit. It gives you one step to take, and takes about a minute to read."], tone: "tint" }],
    after: ["If this is a busy season, do only the short versions for now. They still count."],
    buttons: [{ label: "Open your Toolkit", url: v(x.app_url) }],
    footer: "progress",
  }),

  inactive_30: (x) => ({
    subject: "Your plan is saved",
    preheader: "It'll be here whenever you come back.",
    hero: "map", eyebrow: "Whenever you're ready", headline: "Your plan is saved",
    greeting: hi(x.name),
    paragraphs: [
      "Your answers and your plan are saved, and they'll be here whenever you come back.",
      "When you're ready, one small step is enough. The Restart card in your Toolkit shows you where to begin.",
    ],
    after: ["This is the last reminder for now."],
    buttons: [{ label: "Open your workbook", url: v(x.app_url) }],
    footer: "progress",
  }),

  maintenance: (x) => ({
    subject: "Two questions for this month",
    preheader: "Two minutes, once a month.",
    hero: "keep", eyebrow: "Monthly check-in", headline: "Two questions for this month",
    greeting: hi(x.name),
    paragraphs: ["Here are this month's two questions. Answer them in your head, on paper or in the app."],
    panels: [{
      items: [
        "Which part of your setup is working without you having to think about it?",
        "What slipped this month, and what's one step back?",
      ],
      tone: "keep",
    }],
    after: ["Your plan is saved in the app whenever you want it."],
    buttons: [{ label: "Open My Plan", url: v(x.app_url) }],
    footer: "progress",
  }),

  // ---------- marketing ----------
  crosssell_general: (x) => ({
    subject: "Twenty workbooks, one at a time",
    preheader: "Each one is twelve weeks of small, practical steps.",
    hero: "brand", eyebrow: "From Akana", headline: "Twenty workbooks, one at a time",
    greeting: hi(x.name),
    paragraphs: ["Akana now has twenty workbooks. Each one is built from a book, runs for twelve weeks in small, practical steps, and starts with a free week."],
    panels: [{
      title: "Ways to get them",
      rows: [["One workbook", "Yours for life"], ["A set of four", "Workbooks that belong together"], ["All twenty", "The complete library, or a pass"]],
      tone: "tint",
    }],
    buttons: [{ label: "See the workbooks", url: v(x.store_url, v(x.app_url)) }],
    footer: "marketing",
  }),

  crosssell_personal: (x) => {
    // One suggestion per line, as "Title: one plain line". A send with no titles is refused.
    const list = v(x.suggestions).split(/\n|\|/).map((s) => s.trim()).filter(Boolean);
    if (!list.length) throw new Error("crosssell_personal_needs_suggestions");
    return {
      subject: "Three workbooks you might like",
      preheader: "Chosen from the set yours belongs to.",
      hero: "brand", eyebrow: "Suggested for you", headline: "Three workbooks you might like",
      greeting: hi(x.name),
      paragraphs: ["You asked for suggestions based on the workbooks you use. These sit in the same set as yours, and work the same way."],
      panels: [{ items: list, tone: "tint" }],
      after: ["Each one starts with a free week."],
      buttons: [{ label: "See the set", url: v(x.store_url, v(x.app_url)) }],
      footer: "marketing",
    };
  },

  new_workbook_available: (x) => ({
    subject: "A new workbook is ready",
    preheader: "Week one is free.",
    hero: "brand", eyebrow: "New on Akana", headline: `${v(x.workbook_title, "A new workbook")} is ready`,
    greeting: hi(x.name),
    paragraphs: [
      `${v(x.workbook_title, "A new workbook")} is now on Akana.${x.workbook_line ? " " + v(x.workbook_line) : ""}`,
      "Like every workbook, it runs for twelve weeks in small steps, and week one is free.",
    ],
    buttons: [{ label: "Take a look", url: v(x.store_url, v(x.app_url)) }],
    footer: "marketing",
  }),

  // ---------- support partner ----------
  partner_invite: (x) => {
    const reader = v(x.reader_name, "A friend");
    const level = Number(x.share_level);
    return {
      subject: `${reader} would like your support`,
      preheader: "Short updates, only if you say yes.",
      hero: "partner", eyebrow: `From ${reader}`, headline: `${reader} would like your support`,
      greeting: hi(x.partner_name),
      paragraphs: [
        `${reader} is working through a twelve-week workbook on Akana, an app of guided workbooks built from books. They chose you as their support partner, and they'd like to send you short updates.`,
      ],
      panels: [
        {
          title: "What you'd get",
          items: [
            "A short email when they finish a stage, never more than once a week.",
            ...(level >= 2 ? ["The name of the workbook they're using."] : []),
            ...(level >= 3 ? ["Now and then, a short note from them."] : []),
            "One question you could ask them, if you want to.",
          ],
          tone: "partner",
        },
        {
          title: "What you're not being asked to do",
          lines: [
            "You won't see their answers or any scores, and you're not being asked to check on them.",
            "Akana is a self-guided workbook, not a medical service. You are not being asked to act as an emergency contact.",
          ],
          tone: "tint",
        },
      ],
      after: ["You'll never get marketing from Akana. If you say no, or do nothing, you won't hear from Akana again."],
      buttons: [{ label: "Yes, send me updates", url: v(x.accept_url) }],
      quietLink: { label: "No, thank you", url: v(x.decline_url) },
      footer: "partner_invite",
    };
  },

  partner_update: (x) => {
    const id = stageId(x.stage);
    const s = STAGE_COPY[id];
    const reader = v(x.reader_name, "Your friend");
    const level = Number(x.share_level);
    const wb = level >= 2 && x.workbook_name ? `their ${v(x.workbook_name)} workbook` : "their workbook";
    const note = level >= 3 && x.note ? v(x.note) : "";
    // Level 1 shares only that a stage is done, so its lines say nothing about what the workbook covers.
    const line = level >= 2 ? s.partnerLine : "They chose to share this with you.";
    const ask = level >= 2 ? s.partnerAsk : "What's been going well for you lately?";
    return {
      subject: `An update from ${reader}`, // fixed: the subject never hints at progress or topic
      preheader: "Plus one question you could ask them.",
      hero: "partner", eyebrow: "Support partner update",
      headline: id === "keep" ? `${reader} finished all twelve weeks` : `${reader} finished a stage`,
      greeting: hi(x.partner_name),
      paragraphs: [`${reader} has finished ${s.partnerSpan} of ${wb}. ${line}`],
      panels: [
        ...(note ? [{ title: `A note from ${reader}`, quote: note, tone: "tint" as const }] : []),
        { title: "One question you could ask", lines: [ask], tone: "partner" },
      ],
      after: ["Only if you want to. There's no need to reply to this email.", `Thank you for being there for ${reader}.`],
      footer: "partner",
    };
  },

  partner_stopped: (x) => {
    const reader = v(x.reader_name, "your friend");
    return {
      subject: "Your updates are stopped",
      preheader: "Thank you for being there.",
      hero: "partner", eyebrow: "Support partner", headline: "Your updates are stopped",
      greeting: hi(x.partner_name),
      paragraphs: [
        `You won't get any more updates about ${reader}. They can see in the app that updates have stopped.`,
        `Thank you for being there for ${reader}.`,
      ],
      footer: "partner_stopped",
    };
  },
};

// ---------- sign-in emails (pasted into Supabase, not sent by the app) ----------
// Keep {{ .ConfirmationURL }} and {{ .SiteURL }} exactly as written.
const signin = (subject: string, headline: string, line: string, label: string, ignore: string): Email => ({
  subject, preheader: line, hero: "service", headline,
  greeting: "Hello,",
  paragraphs: [line],
  buttons: [{ label, url: "{{ .ConfirmationURL }}" }],
  after: [ignore],
  footer: "signin",
});
export const SIGNIN_TEMPLATES: Record<string, Email> = {
  confirm_signup: signin("Confirm your email", "Confirm your email", "Tap the button to confirm your email and open your workbook.", "Confirm my email",
    "If you didn't create an account, you can ignore this email. Nothing will happen."),
  magic_link: signin("Your sign-in link", "Your sign-in link", "Here's your sign-in link. It works once, and only for a short time.", "Sign in",
    "If you didn't ask for this, you can ignore it. Nobody can sign in without the link."),
  reset_password: signin("Reset your password", "Choose a new password", "Tap the button to choose a new password.", "Choose a new password",
    "If you didn't ask for this, you can ignore it. Your password stays the same."),
  change_email: signin("Confirm your new email", "Confirm your new email", "Tap the button to confirm this is your new email address.", "Confirm my new email",
    "If you didn't ask for this, you can ignore it. Nothing will change."),
};

// ---------- footer ----------
const PLACEHOLDER_COMPANY = "[Company name], [company address]";

/** The footer for each kind of email. Named footerText for the mailer; it returns buttons and lines. */
export function footerText(kind: FooterKind, links: FooterLinks, postal?: string | null, readerName?: string): Footer {
  // A stored value still in square brackets is an old placeholder, so the agreed one is used instead.
  const company = postal && postal.trim() && !postal.trim().startsWith("[") ? postal.trim() : PLACEHOLDER_COMPANY;
  const reader = readerName && readerName.trim() ? readerName.trim() : "your friend";
  const settings = links.manage ? [{ label: "Email settings", url: links.manage }] : [];
  const unsub = links.unsubscribe ?? links.oneClick;
  switch (kind) {
    case "progress":
      return {
        buttons: [...(unsub ? [{ label: "Unsubscribe", url: unsub }] : []), ...settings], textLinks: [],
        lines: ["You're getting this because you turned on progress emails and reminders in Akana."], company, safety: true,
      };
    case "marketing":
      return {
        buttons: [...(unsub ? [{ label: "Unsubscribe", url: unsub }] : []), ...settings], textLinks: [],
        lines: ["This is a marketing email from Akana. Unsubscribe anytime and these emails stop."], company, safety: true,
      };
    case "partner":
      return {
        buttons: links.stop ? [{ label: "Stop these updates", url: links.stop }] : [], textLinks: [],
        lines: [`You're getting this because you agreed to get updates about ${reader}. Stopping is instant, and ${reader} isn't told why.`],
        company, safety: false,
      };
    case "partner_invite":
      return {
        buttons: links.report ? [{ label: "Report this", url: links.report }] : [], textLinks: [],
        lines: [`Sent by Akana on behalf of ${reader}. Not expecting this email? Report it, and no more invitations will reach this address.`],
        company, safety: false,
      };
    case "partner_stopped":
      return { buttons: [], textLinks: [], lines: [`This is the last email you'll get about ${reader}.`], company, safety: false };
    case "deleted":
      return { buttons: [], textLinks: [], lines: ["This email confirms a request made in your Akana account."], company, safety: false };
    case "signin":
      return {
        buttons: [], textLinks: [{ label: "Email settings", url: links.manage ?? "{{ .SiteURL }}/#settings" }],
        lines: ["You're getting this because someone used this address to sign in to Akana."], company, safety: false,
      };
    case "service":
    default:
      return {
        buttons: settings, textLinks: [],
        lines: ["This email is about your account, so it can't be turned off."], company, safety: true,
      };
  }
}

// ---------- rendering ----------
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const F = `font-family:${FONT};`;

function css(hero: Hero, tones: Hero[]): string {
  const b = BANDS[hero];
  const toneCss = [...new Set(tones)].map((t) => {
    const x = BANDS[t];
    return `.pn-${t}{background:${x.darkBg}!important}.pt-${t}{color:${x.darkInk}!important}`;
  }).join("");
  const dark = `.bg-page{background:#0F1519!important}.card{background:#1A2329!important}
.ink{color:#E9EEF1!important}.soft{color:#AEBBC4!important}.brandtxt{color:#9FCBD6!important}
.hero{background:${b.darkBg}!important}.hink{color:${b.darkInk}!important}
.mk1{background:${mix(b.darkInk, b.darkBg, 0.55)}!important}.mk2{background:${mix(b.darkInk, b.darkBg, 0.78)}!important}.mk3{background:${b.darkInk}!important}
.pn-tint{background:#222D35!important}.pn-terms{background:#1A2329!important;border-color:#3A4650!important}
.rule{border-color:#33404A!important}.seg-off{background:#33404A!important}
.pill{border-color:#5C6B75!important}.pill a{color:#D3DCE2!important}
.btn2{background:#1A2329!important;border-color:#9FCBD6!important}.btn2 a{color:#9FCBD6!important}
${toneCss}`;
  return `:root{color-scheme:light dark;supported-color-schemes:light dark}
body{margin:0;padding:0;-webkit-text-size-adjust:100%}
a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important}
@media (max-width:600px){.px{padding-left:20px!important;padding-right:20px!important}.h1{font-size:26px!important}.big{font-size:24px!important}}
@media (prefers-color-scheme:dark){${dark}}
[data-ogsc] .ink{color:#E9EEF1!important}[data-ogsc] .soft{color:#AEBBC4!important}[data-ogsc] .hink{color:${b.darkInk}!important}
[data-ogsb] .bg-page{background:#0F1519!important}[data-ogsb] .card{background:#1A2329!important}[data-ogsb] .hero{background:${b.darkBg}!important}`;
}

function mark(hero: Hero): string {
  const b = BANDS[hero];
  const cell = (h: number, color: string, cls: string, last = false) =>
    `<td valign="bottom" style="padding:0 ${last ? 0 : 4}px 0 0"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="${cls}" width="12" height="${h}" bgcolor="${color}" style="width:12px;height:${h}px;background:${color};border-radius:3px;font-size:0;line-height:0">&nbsp;</td></tr></table></td>`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" aria-hidden="true" style="margin:0 0 18px"><tr>${
    cell(12, mix(b.ink, b.bg, 0.55), "mk1")}${cell(19, mix(b.ink, b.bg, 0.78), "mk2")}${cell(26, b.ink, "mk3", true)}</tr></table>`;
}

function strip(upTo: StageId): string {
  const n = STAGE_ORDER.indexOf(upTo);
  const cells = STAGE_ORDER.map((id, i) => {
    const on = i <= n;
    const bar = on ? BANDS[id].ink : "#FFFFFF";
    return `<td width="25%" valign="top" style="padding:0 ${i < 3 ? 4 : 0}px 0 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td ${on ? "" : 'class="seg-off" '}height="6" bgcolor="${bar}" style="height:6px;background:${bar};border-radius:3px;font-size:0;line-height:0">&nbsp;</td></tr></table>
<p class="${on ? "ink" : "soft"}" style="margin:6px 0 0;${F}font-size:12px;line-height:1.3;font-weight:${on ? 700 : 400};color:${on ? C.ink : C.soft}">${STAGE_LABEL[id]}</p></td>`;
  }).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 0"><tr>${cells}</tr></table>`;
}

function button(b: Button, style: "primary" | "secondary"): string {
  const primary = style === "primary";
  const bg = primary ? C.brand : C.card;
  const fg = primary ? "#FFFFFF" : C.brand;
  const width = Math.max(160, Math.round(b.label.length * 9.5 + 56));
  const vml = `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${esc(b.url)}" style="height:48px;v-text-anchor:middle;width:${width}px" arcsize="25%" ${primary ? "stroke=\"f\"" : `strokecolor="${C.brand}" strokeweight="1.5px"`} fillcolor="${bg}"><w:anchorlock/><center style="color:${fg};font-family:Arial,sans-serif;font-size:17px;font-weight:bold">${esc(b.label)}</center></v:roundrect><![endif]-->`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px"><tr><td>${vml}<!--[if !mso]><!--><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td ${primary ? "" : 'class="btn2" '}align="center" bgcolor="${bg}" style="border-radius:12px;background:${bg};${primary ? "" : `border:1.5px solid ${C.brand};`}">
<a href="${esc(b.url)}" style="display:inline-block;padding:0 26px;height:48px;line-height:48px;${F}font-size:17px;font-weight:600;color:${fg};text-decoration:none;border-radius:12px">${esc(b.label)}</a></td></tr></table><!--<![endif]--></td></tr></table>`;
}

function pill(b: Button): string {
  return `<td style="padding:0 4px 8px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="pill" style="border:1px solid #9AA6AE;border-radius:999px">
<a href="${esc(b.url)}" style="display:inline-block;padding:9px 18px;${F}font-size:14px;font-weight:600;line-height:20px;color:${C.soft};text-decoration:none;border-radius:999px">${esc(b.label)}</a></td></tr></table></td>`;
}

function panel(p: Panel): string {
  const tone = p.tone ?? "tint";
  const isBand = tone !== "tint" && tone !== "terms";
  const bg = tone === "terms" ? C.card : isBand ? BANDS[tone as Hero].bg : C.tint;
  const titleColor = isBand ? BANDS[tone as Hero].ink : C.ink;
  const border = tone === "terms" ? `border:1px solid ${C.rule};` : "";
  const parts: string[] = [];
  if (p.title) {
    parts.push(`<p class="${isBand ? `pt-${tone}` : "ink"}" style="margin:0 0 10px;${F}font-size:15px;line-height:1.4;font-weight:700;color:${titleColor}">${esc(p.title)}</p>`);
  }
  if (p.big) parts.push(`<p class="ink big" style="margin:0 0 ${p.rows ? 12 : 0}px;${F}font-size:${p.spaced ? 32 : 28}px;line-height:1.2;font-weight:700;color:${C.ink};${p.spaced ? "letter-spacing:6px;" : ""}">${esc(p.big)}</p>`);
  if (p.rows?.length) {
    parts.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${p.rows.map(([k, val], i) =>
      `<tr><td class="soft${i ? " rule" : ""}" valign="top" style="padding:8px 12px 8px 0;white-space:nowrap;${i ? `border-top:1px solid ${C.rule};` : ""}${F}font-size:15px;line-height:1.4;color:${C.soft}">${esc(k)}</td>` +
      `<td class="ink${i ? " rule" : ""}" valign="top" align="right" style="padding:8px 0;${i ? `border-top:1px solid ${C.rule};` : ""}${F}font-size:15px;line-height:1.4;font-weight:600;color:${C.ink};text-align:right">${esc(val)}</td></tr>`
    ).join("")}</table>`);
  }
  if (p.items?.length) {
    const dot = isBand ? BANDS[tone as Hero].ink : C.brand;
    parts.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${p.items.map((it) =>
      `<tr><td width="18" valign="top" style="padding:9px 0 0"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="8" height="8" bgcolor="${dot}" style="width:8px;height:8px;background:${dot};border-radius:2px;font-size:0;line-height:0">&nbsp;</td></tr></table></td>` +
      `<td class="ink" valign="top" style="padding:0 0 8px;${F}font-size:16px;line-height:1.55;color:${C.ink}">${esc(it)}</td></tr>`
    ).join("")}</table>`);
  }
  if (p.quote) {
    parts.push(`<p class="ink" style="margin:0;${F}font-size:17px;line-height:1.55;font-style:italic;color:${C.ink}">&ldquo;${esc(p.quote)}&rdquo;</p>`);
  }
  for (const [i, l] of (p.lines ?? []).entries()) {
    parts.push(`<p class="ink" style="margin:${i || p.items?.length || p.rows?.length || p.big ? 8 : 0}px 0 0;${F}font-size:16px;line-height:1.55;color:${C.ink}">${esc(l)}</p>`);
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px"><tr>
<td class="pn-${tone}" bgcolor="${bg}" style="background:${bg};${border}border-radius:12px;padding:18px 20px">${parts.join("\n")}</td></tr></table>`;
}

function textVersion(email: Email, foot: Footer): string {
  const out: string[] = [];
  out.push(email.headline.toUpperCase());
  if (email.eyebrow) out.push(email.eyebrow);
  if (email.greeting) out.push(email.greeting);
  out.push(...email.paragraphs);
  for (const p of email.panels ?? []) {
    const block: string[] = [];
    if (p.title) block.push(p.title);
    if (p.big) block.push(p.big);
    for (const [k, val] of p.rows ?? []) block.push(`${k}: ${val}`);
    for (const it of p.items ?? []) block.push(`- ${it}`);
    if (p.quote) block.push(`"${p.quote}"`);
    block.push(...(p.lines ?? []));
    out.push(block.join("\n"));
  }
  out.push(...(email.after ?? []));
  const actions = [...(email.buttons ?? []), ...(email.quietLink ? [email.quietLink] : [])];
  if (actions.length) out.push(actions.map((b) => `${b.label}:\n${b.url}`).join("\n\n"));
  if (email.signoff !== false) out.push(SIGNOFF.join("\n"));
  const footer: string[] = [];
  footer.push(...[...foot.buttons, ...foot.textLinks].map((b) => `${b.label}: ${b.url}`));
  footer.push(...foot.lines);
  if (foot.safety) footer.push(SAFETY);
  footer.push(`Akana. ${foot.company}`);
  return out.join("\n\n") + "\n\n-- \n" + footer.join("\n") + "\n";
}

const SAFETY = "Akana is not an emergency service. If you are in danger, call your local emergency number.";

export function render(email: Email, foot: Footer): { subject: string; text: string; html: string } {
  const band = BANDS[email.hero];
  const tones = (email.panels ?? []).map((p) => p.tone).filter((t): t is Hero => !!t && t !== "tint" && t !== "terms");
  const pad = "&#847;&zwnj;&nbsp;".repeat(60);

  const hero = `<td class="hero px" bgcolor="${band.bg}" style="background:${band.bg};border-radius:16px 16px 0 0;padding:28px 28px 26px">
${mark(email.hero)}
${email.badge ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px"><tr><td bgcolor="${C.marigold}" style="background:${C.marigold};border-radius:999px;padding:5px 12px;${F}font-size:13px;line-height:18px;font-weight:700;color:${C.ink}">${esc(email.badge)}</td></tr></table>` : ""}
${email.eyebrow && !email.badge ? `<p class="hink" style="margin:0 0 8px;${F}font-size:14px;line-height:1.4;font-weight:700;color:${band.ink}">${esc(email.eyebrow)}</p>` : ""}
<h1 class="ink h1" style="margin:0;${F}font-size:28px;line-height:1.25;font-weight:700;color:${C.ink};letter-spacing:-0.2px">${esc(email.headline)}</h1>
${email.strip ? strip(email.strip) : ""}
</td>`;

  const p = (s: string, extra = "") => `<p class="ink" style="margin:0 0 16px;${F}font-size:17px;line-height:1.6;color:${C.ink};${extra}">${esc(s)}</p>`;
  const buttons = email.buttons ?? [];
  const body = `<td class="px" style="padding:28px 28px 12px">
${email.greeting ? p(email.greeting) : ""}
${email.paragraphs.map((s) => p(s)).join("\n")}
${(email.panels ?? []).map(panel).join("\n")}
${(email.after ?? []).map((s) => p(s)).join("\n")}
${buttons.length ? `<div style="padding:4px 0 8px">${buttons.map((b, i) => button(b, i === 0 && !email.equalButtons ? "primary" : "secondary")).join("\n")}</div>` : ""}
${email.quietLink ? `<p style="margin:0 0 20px;${F}font-size:16px;line-height:1.5"><a href="${esc(email.quietLink.url)}" class="soft" style="color:${C.soft};text-decoration:underline">${esc(email.quietLink.label)}</a></p>` : ""}
${email.signoff !== false ? `<p class="ink" style="margin:8px 0 16px;${F}font-size:17px;line-height:1.6;color:${C.ink}">${SIGNOFF.map(esc).join("<br>")}</p>` : ""}
</td>`;

  const small = (s: string, extra = "") => `<p class="soft" style="margin:0 0 8px;${F}font-size:13px;line-height:1.55;color:${C.soft};${extra}">${s}</p>`;
  const footer = `<td align="center" style="padding:24px 16px 8px;text-align:center">
${foot.buttons.length ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 8px"><tr>${foot.buttons.map(pill).join("")}</tr></table>` : ""}
${foot.textLinks.map((l) => small(`<a href="${esc(l.url)}" class="soft" style="color:${C.soft};text-decoration:underline">${esc(l.label)}</a>`)).join("\n")}
${foot.lines.map((l) => small(esc(l))).join("\n")}
${foot.safety ? small(esc(SAFETY)) : ""}
${small(`<strong>Akana</strong> &middot; ${esc(foot.company)}`, "margin-bottom:0")}
</td>`;

  const html = `<!doctype html>
<html lang="en-US" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(email.subject)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><style>body,table,td,p,a,h1{font-family:Arial,sans-serif!important}</style><![endif]-->
<style>${css(email.hero, tones)}</style>
</head>
<body class="bg-page" style="margin:0;padding:0;background:${C.page}">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${C.page}">${esc(email.preheader)}${pad}</div>
<table role="presentation" class="bg-page" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background:${C.page}"><tr><td align="center" style="padding:20px 12px 32px">
<!--[if mso]><table role="presentation" width="560" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;margin:0 auto">
<tr><td style="padding:4px 8px 14px"><span class="brandtxt" style="${F}font-size:20px;line-height:1.2;font-weight:700;letter-spacing:-0.2px;color:${C.brand}">Akana</span></td></tr>
<tr><td class="card" bgcolor="${C.card}" style="background:${C.card};border-radius:16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>${hero}</tr>
<tr>${body}</tr>
</table>
</td></tr>
<tr>${footer}</tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body>
</html>`;
  return { subject: email.subject, text: textVersion(email, foot), html };
}
